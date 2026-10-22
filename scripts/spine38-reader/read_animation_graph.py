#!/usr/bin/env python3
"""Read observed editor 3.8 animation records without changing the source.

This bounded interoperability decoder rejects unobserved classes and fields.
Source frame positions and editor-only fields remain in the evidence graph.
"""
from pathlib import Path
import importlib.util
import json
import struct

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('attachment_reader', HERE/'attachments-study/extract_attachments.py')
attachment_reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(attachment_reader)

class Reader(attachment_reader.Reader):
    def tag_fields(self, obj, schema):
        count = self.u()
        obj['fieldCount'] = count
        for _ in range(count):
            tag = self.u()
            start = self.p
            if tag not in schema:
                raise ValueError(f'unknown {obj["kind"]} field {tag} at {start:#x}')
            value = schema[tag]()
            obj['fields'][str(tag)] = {'offset': start, 'endOffset': self.p, 'value': value}

    def pointer(self):
        return {'ref': self.u()}

    def boolean(self):
        value = self.u()
        if value not in (0, 1):
            raise ValueError(f'non-boolean {value} at {self.p:#x}')
        return bool(value)

    def animation(self, obj):
        self.tag_fields(obj, {0:self.pointer, 1:self.string, 2:self.generic,
                             3:self.boolean, 5:self.boolean, 6:self.boolean, 7:self.generic})

    def actor(self, obj):
        self.tag_fields(obj, {0:self.pointer, 1:self.pointer, 2:self.generic, 4:self.boolean})

    def channel(self, obj):
        self.tag_fields(obj, {0:self.pointer, 1:lambda:self.ref('channel-type', self.enum),
                             2:self.generic, 3:self.pointer, 4:self.boolean,
                             5:self.boolean, 6:self.boolean, 7:self.boolean, 8:self.boolean})

    def keyframe(self, obj):
        schema = {0:self.pointer, 1:self.pointer, 2:self.f,
                  3:lambda:self.ref('curve-type',self.enum),
                  13:self.generic, 14:self.generic, 15:self.generic, 16:self.generic, 17:self.f}
        for tag in range(4, 12):
            schema[tag] = self.f
        self.tag_fields(obj, schema)

    def folder(self, obj):
        self.tag_fields(obj, {0:self.generic, 1:self.string, 2:self.pointer,
                             3:self.boolean, 4:self.generic, 5:self.generic})

    def order_offset(self, obj):
        self.tag_fields(obj, {0:self.pointer, 1:self.u})

    def generic(self):
        start = self.p
        token = self.u()
        parsers = {0x12:('animation',self.animation), 0x13:('actor',self.actor),
                   0x14:('channel',self.channel), 0x52:('keyframe',self.keyframe),
                   0x6c:('animation-folder',self.folder), 0x27:('draw-order-offset',self.order_offset)}
        if token in parsers:
            kind, parser = parsers[token]
            return self.ref(kind, parser)
        self.p = start
        return super().generic()

    def resolve(self, pointer, expected=None):
        if pointer is None:
            return None
        ref = pointer['ref']
        if ref == 0:
            return None
        if ref not in self.refs:
            raise ValueError(f'unresolved reference {ref}')
        obj = self.refs[ref]
        if expected and obj['kind'] != expected:
            raise ValueError(f'reference {ref} expected {expected}, got {obj["kind"]}')
        return obj

def fvalue(obj, tag):
    return obj['fields'][str(tag)]['value']

def decode(label, path, bone_count, attachment_start):
    _, attachments = attachment_reader.run(label, path, bone_count, attachment_start)
    r = Reader(attachments.d, attachments.p, attachments.next_ref, attachments.refs)
    assert r.u() == 7, 'expected skeleton animations field'
    start = r.p
    array_pointer = r.generic()
    animations = r.resolve(array_pointer, 'array')['value']
    graph = []
    channels = 0
    keys = 0
    for pointer in animations:
        animation = r.resolve(pointer, 'animation')
        name = r.resolve(fvalue(animation,1),'string')['value']
        item = {'name': name, 'wireRef': animation['wireRef'], 'actors': []}
        for target_pointer in r.resolve(fvalue(animation,2),'array')['value']:
            actor = r.resolve(target_pointer,'actor')
            assert fvalue(actor,0)['ref'] == animation['wireRef']
            target = fvalue(actor,1)['ref']
            actor_item = {'wireRef': actor['wireRef'], 'targetWireRef': target, 'channels': []}
            for cp in r.resolve(fvalue(actor,2),'array')['value']:
                channel = r.resolve(cp,'channel')
                assert fvalue(channel,0)['ref'] == actor['wireRef']
                ordinal = r.resolve(fvalue(channel,1),'channel-type')['value']
                channel_item = {'wireRef':channel['wireRef'], 'typeOrdinal':ordinal, 'keys':[]}
                for kp in r.resolve(fvalue(channel,2),'array')['value']:
                    key = r.resolve(kp,'keyframe')
                    assert fvalue(key,0)['ref'] == actor['wireRef']
                    assert fvalue(key,1)['ref'] == channel['wireRef']
                    record = {'wireRef': key['wireRef'], 'offset':key['offset'],
                              'frame':fvalue(key,2),
                              'curveType':r.resolve(fvalue(key,3),'curve-type')['value'],
                              'bezier':[fvalue(key,x)for x in range(4,8)],
                              'values':[fvalue(key,x)for x in range(8,12)],
                              'valuesHex':[r.d[key['fields'][str(x)]['offset']:key['fields'][str(x)]['endOffset']].hex()for x in range(8,12)],
                              'attachment':fvalue(key,13), 'field14':fvalue(key,14),
                              'field15':fvalue(key,15), 'field16':fvalue(key,16),
                              'field17':fvalue(key,17)}
                    if ordinal == 40:
                        offsets = []
                        for op in r.resolve(record['field15'],'array')['value']:
                            offset_obj = r.resolve(op,'draw-order-offset')
                            encoded = fvalue(offset_obj,1)
                            offsets.append({'slotWireRef':fvalue(offset_obj,0)['ref'],
                                            'offset':(encoded>>1)^-(encoded&1)})
                        record['drawOrderOffsets'] = offsets
                    channel_item['keys'].append(record)
                    keys += 1
                actor_item['channels'].append(channel_item)
                channels += 1
            item['actors'].append(actor_item)
        graph.append(item)
    result = {'source':str(path), 'arrayInflatedRange':[start,r.p], 'nextWireRef':r.next_ref,
              'animationCount':len(graph),'channelCount':channels,'keyCount':keys,
              'animations':graph,'objects':r.objects,
              'followingBytesHex':r.d[r.p:r.p+64].hex(' ')}
    (HERE/(label+'-animation-graph.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k]for k in ['animationCount','channelCount','keyCount','arrayInflatedRange','nextWireRef']}))
    return result,r
