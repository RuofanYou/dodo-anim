#!/usr/bin/env python3
"""Recover runtime data from the inspected editor 3.8 structures.

Transforms, curves, attachment switches and layer offsets come from source bytes.
Unknown timeline types fail instead of being replaced with newly authored motion.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import math
import struct

HERE = Path(__file__).resolve().parent

def module(name, path):
    spec = importlib.util.spec_from_file_location(name,path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

bones_reader = module('bone_reader',HERE/'bones-study/extract_bones.py')
graph_reader = module('graph_reader',HERE/'read_animation_graph.py')

def field(obj, tag):
    return obj['fields'][str(tag)]['value']

def curve(key):
    ordinal = key['curveType']
    if ordinal == 1:
        return {}
    if ordinal == 2:
        c1,c2,c3,c4 = key['bezier']
        return {'curve':c1,'c2':c2,'c3':c3,'c4':c4}
    if ordinal == 3:
        return {'curve':'stepped'}
    raise ValueError(f'unsupported curve ordinal {ordinal} at {key["offset"]:#x}')

def export(label,path,outputdir):
    path = Path(path).resolve()
    destination = Path(outputdir).resolve()
    evidence_root = destination/'evidence'
    bone_evidence = evidence_root/'bones-study'
    attachment_evidence = evidence_root/'attachments-study'
    bone_evidence.mkdir(parents=True,exist_ok=True)
    attachment_evidence.mkdir(parents=True,exist_ok=True)
    graph_reader.HERE = evidence_root
    graph_reader.attachment_reader.HERE = attachment_evidence
    bone_data,data = bones_reader.decode(path)
    version,_,_ = bones_reader.ascii_string(data,5)
    if version not in ('3.8.75','3.8.99'):
        raise ValueError(f'unobserved editor version {version}; this decoder covers the inspected 3.8.75/3.8.99 fixtures')
    bone_count = bone_data['boneCount']
    bone_end = bone_data['boneBlockInflatedRange'][1]
    assert data[bone_end:bone_end+3] == bytes.fromhex('06 0f 01'), 'expected skeleton attachments array after bone block'
    attachment_count,attachment_start,_ = bones_reader.varint(data,bone_end+3)
    assert 0 < attachment_count < 128, 'unobserved multi-byte or empty attachment count'
    (bone_evidence/f'{label}-bones-evidence.json').write_text(json.dumps(bone_data,indent=2)+'\n')
    graph,r = graph_reader.decode(label,path,bone_count,attachment_start)
    attachment_result,att = graph_reader.attachment_reader.run(label,path,bone_count,attachment_start)
    fragment,order = graph_reader.attachment_reader.runtime_fragment(attachment_result,att,label)
    for ref,obj in att.refs.items():
        assert r.refs[ref] == obj
    bone_map = {b['wireReferenceToken']:b['name']for b in bone_data['records']}
    slot_map = {s['wireRef']:s['name']for s in attachment_result['slots']}
    slot_bones = {s['name']:s['bone']for s in fragment['slots']}
    bones = []
    for b in bone_data['records']:
        item = {'name':b['name'],**b['setupTransformFields']}
        if b['parent'] is not None:
            item['parent'] = b['parent']
        bones.append(item)
    token = bytes.fromhex('7e 01 02')
    positions = [i for i in range(len(data))if data.startswith(token,i)]
    assert len(positions) == 1, 'ambiguous project frame-rate setting'
    fps = struct.unpack_from('>f',data,positions[0]+3)[0]
    assert math.isfinite(fps) and 1 <= fps <= 240
    animations = {}
    export_keys = 0
    for animation in graph['animations']:
        result = {'bones':{},'slots':{}}
        for actor in animation['actors']:
            target = actor['targetWireRef']
            for channel in actor['channels']:
                source_obj = next(x for x in graph['objects']if x['wireRef']==channel['wireRef'])
                slot_ref = field(source_obj,3)['ref']
                kind = channel['typeOrdinal']
                timeline = []
                for key in channel['keys']:
                    item = {'time':round(key['frame']/fps,4)}
                    x,y,alpha,_ = key['values']
                    if kind == 26:
                        item.update(angle=x,**curve(key))
                    elif kind in (24,25):
                        item.update(x=x,y=y,**curve(key))
                    elif kind == 81:
                        assert -1e-6 <= alpha <= 1+1e-6
                        abgr = bytes.fromhex(key['valuesHex'][0])
                        rgba = bytes([abgr[3],abgr[2],abgr[1],int(math.floor(alpha*255+1e-5))])
                        item.update(color=rgba.hex(),**curve(key))
                    elif kind == 27:
                        attachment = r.resolve(key['attachment'])
                        if attachment is None:
                            item['name'] = None
                        else:
                            assert attachment['kind']in ('region','mesh')
                            item['name'] = r.resolve(field(attachment,1),'string')['value']
                    elif kind == 40:
                        assert target == 0 and slot_ref == 0
                        item['offsets'] = [{'slot':slot_map[o['slotWireRef']],'offset':o['offset']}
                                           for o in key['drawOrderOffsets']]
                    else:
                        raise ValueError(f'unknown timeline type {kind}')
                    timeline.append(item)
                    export_keys += 1
                if kind in (24,25,26):
                    assert slot_ref == 0 and target in bone_map
                    channel_name = {24:'scale',25:'translate',26:'rotate'}[kind]
                    result['bones'].setdefault(bone_map[target],{})[channel_name] = timeline
                elif kind in (27,81):
                    assert slot_ref in slot_map and slot_bones[slot_map[slot_ref]] == bone_map[target]
                    channel_name = {27:'attachment',81:'color'}[kind]
                    result['slots'].setdefault(slot_map[slot_ref],{})[channel_name] = timeline
                else:
                    assert 'drawOrder'not in result
                    result['drawOrder'] = timeline
        animations[animation['name']] = result
    assert export_keys == graph['keyCount']
    runtime_version = '3.8.99'
    runtime = {'skeleton':{'spine':runtime_version,'fps':fps,'images':'./images/'},
               'bones':bones,**fragment,'animations':animations}
    destination.mkdir(parents=True,exist_ok=True)
    (destination/f'{label}-original.json').write_text(json.dumps(runtime,indent=2)+'\n')
    summary = {'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
               'sourceEditorVersion':version,'runtimeJsonVersion':runtime_version,
               'fps':fps,'fpsValueOffset':positions[0]+3,
               'timeSerialization':'frame/fps rounded to four decimals, matching the paired official 3.8 JSON export; original integer frames remain in the evidence graph',
               'bones':len(bones),'slots':len(fragment['slots']),
               'attachments':sum(len(v)for v in fragment['skins'][0]['attachments'].values()),
               'animations':{name:max(k['time']for actor in animation.get('bones',{}).values()
                                    for timeline in actor.values()for k in timeline)
                             for name,animation in animations.items()},
               'sourceChannels':graph['channelCount'],'sourceKeys':graph['keyCount'],
               'writtenKeys':export_keys,
               'scope':'Bounded source-data interoperability recovery for the inspected editor 3.8 files; no newly authored motion.'}
    (destination/f'{label}-recovery-manifest.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))
    return runtime

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True,
                        help='Original .spine file; only the inspected 3.8.75/3.8.99 structures are tested')
    parser.add_argument('--output',type=Path,required=True,
                        help='Destination directory for runtime JSON, manifest and evidence')
    parser.add_argument('--label',choices=('fire','paired'),default='fire',
                        help='Output filename prefix only; does not select a source or parser')
    args = parser.parse_args()
    export(args.label,args.source,args.output)
