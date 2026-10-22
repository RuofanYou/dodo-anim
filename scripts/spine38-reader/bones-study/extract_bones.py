#!/usr/bin/env python3
"""Bounded, read-only decoder for the observed 3.8.75/3.8.99 bone block.

This is an interoperability study, not a general .spine reader. Every value
retains its decompressed-stream offset. Unknown fields remain raw evidence.
"""
import hashlib
import json
import re
import struct
import zlib

PREFIX = bytes.fromhex('0c 01 1a 00 04 01 01')

def varint(data, offset):
    start, value, shift = offset, 0, 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7f) << shift
        if byte < 128:
            return value, offset, {'offset': start, 'hex': data[start:offset].hex(' '), 'value': value}
        shift += 7
        if shift > 28:
            raise ValueError(f'oversized varint at {start}')

def ascii_string(data, offset):
    start, out = offset, bytearray()
    while True:
        byte = data[offset]
        offset += 1
        out.append(byte & 0x7f)
        if byte >= 128:
            return out.decode('ascii'), offset, {'offset': start, 'hex': data[start:offset].hex(' ')}
        if offset - start > 200:
            raise ValueError(f'unbounded ASCII string at {start}')

def float_field(data, offset, expected_tag):
    assert data[offset] == expected_tag, (offset, data[offset], expected_tag)
    value = struct.unpack_from('>f', data, offset + 1)[0]
    return value, offset + 5, {'tagOffset': offset, 'valueOffset': offset + 1,
                               'hex': data[offset:offset+5].hex(' '), 'value': value}

def decode(path):
    compressed = path.read_bytes()
    data = zlib.decompress(compressed, -15)
    matches = [m.start() for m in re.finditer(re.escape(PREFIX), data)]
    assert matches, 'no observed bone prefix'
    start = matches[0]
    assert data[start-3:start-1] == bytes.fromhex('0f 01')
    declared_count = data[start-1]
    assert declared_count == len(matches), (declared_count, len(matches))
    records = []
    object_references = {}
    next_reference = 8
    def allocate(kind, source_offset, value=None):
        nonlocal next_reference
        token = next_reference
        next_reference += 1
        object_references[token] = {'kind':kind,'newMarkerOffset':source_offset,'value':value}
        return token
    offset = start
    for i in range(declared_count):
        begin = offset
        assert data[offset:offset+3] == bytes.fromhex('0c 01 1a')
        ref = allocate('Bone',offset+1)
        offset += 3
        assert data[offset] == 0
        skeleton_reference,offset,skeleton_evidence = varint(data,offset+1)
        assert skeleton_reference == 4
        assert data[offset:offset+2] == bytes.fromhex('01 01')
        name_ref = allocate('String:name',offset+1)
        offset += 2
        name, offset, name_evidence = ascii_string(data, offset)
        object_references[ref]['value'] = name
        object_references[name_ref]['value'] = name
        assert data[offset:offset+3] == bytes.fromhex('02 01 03')
        offset += 3
        parent, offset, parent_evidence = varint(data, offset)
        fields = {}
        for tag in range(4, 15):
            value, offset, evidence = float_field(data, offset, tag)
            fields[str(tag)] = evidence
        assert data[offset:offset+3] == bytes.fromhex('11 1e 01')
        color_offset = offset
        color = data[offset+3:offset+7].hex()
        color_ref = allocate('Color',offset+2,color)
        offset += 7
        fields['17'] = {'tagOffset': color_offset, 'valueOffset': color_offset+3,
                        'hex': data[color_offset:offset].hex(' '), 'rgbaHex': color}
        for tag in range(23, 27):
            value, offset, evidence = float_field(data, offset, tag)
            fields[str(tag)] = evidence

        tail_start = offset
        assert data[offset] == 27
        field27, offset, f27 = varint(data, offset+1)
        if field27 == 1:
            enum_ref = allocate('Enum:field27',f27['offset'])
            ordinal, offset, ordinal_evidence = varint(data, offset)
            object_references[enum_ref]['value'] = ordinal
            f27['newValueOrdinalCandidate'] = ordinal_evidence
            f27['wireReferenceToken'] = enum_ref
        else:
            assert field27 in object_references
            f27['resolvedValue'] = object_references[field27]
        assert data[offset] == 28
        field28, offset, f28 = varint(data, offset+1)
        if field28 == 1:
            icon_ref = allocate('String:field28',f28['offset'])
            icon, offset, icon_evidence = ascii_string(data, offset)
            object_references[icon_ref]['value'] = icon
            f28['newStringValue'] = {'text': icon, **icon_evidence}
            f28['wireReferenceToken'] = icon_ref
        else:
            assert field28 in object_references
            f28['resolvedValue'] = object_references[field28]
        assert data[offset] == 29 and data[offset+2] == 30
        assert data[offset+1] in (0,1) and data[offset+3] in (0,1)
        assert data[offset+4:offset+8] == bytes.fromhex('1f 0f 01 00')
        array_ref = allocate('Array:field31',offset+6,[])
        f29,f30 = data[offset+1],data[offset+3]
        offset += 8
        assert data[offset] == 126
        offset += 2

        records.append({
            'index': i, 'name': name, 'wireReferenceToken': ref,
            'inflatedRange': [begin, offset], 'nameBytes': name_evidence,
            'skeletonReference':skeleton_evidence,'nameWireReferenceToken':name_ref,
            'colorWireReferenceToken':color_ref,'field31ArrayWireReferenceToken':array_ref,
            'parentReference': parent_evidence,
            'currentEditorTransformFields': {name: fields[str(tag)]['value']
                for name, tag in [('x',4),('y',5),('rotation',6),('scaleX',7),('scaleY',8)]},
            'setupTransformFields': {name: fields[str(tag)]['value']
                for name, tag in [('x',10),('y',11),('rotation',12),('scaleX',13),('scaleY',14)]},
            'color': color, 'fields': fields,
            'unknownOrUnverifiedTail': {'inflatedRange':[tail_start,offset],
                'hex':data[tail_start:offset].hex(' '), 'field27':f27, 'field28':f28,
                'field29':f29,'field30':f30,'field126':data[offset-1]},
        })
    reference_map = {r['wireReferenceToken']: r['name'] for r in records}
    for r in records:
        parent = r['parentReference']['value']
        if parent == 0:
            r['parent'] = None
        else:
            assert parent in reference_map, (r['name'], parent)
            r['parent'] = reference_map[parent]
            assert [n['name'] for n in records[:r['index']]].count(r['parent']) == 1
    return {'source':str(path), 'sourceSha256':hashlib.sha256(compressed).hexdigest(),
            'compressedBytes':len(compressed), 'inflatedBytes':len(data),
            'boneBlockInflatedRange':[start,offset], 'boneCountOffset':start-1,
            'boneCount':declared_count, 'records':records,
            'referenceMap':reference_map,'allBoneBlockObjectReferences':object_references,
            'nextWireReferenceTokenAfterBoneBlock':next_reference,
            'followingBytesHex':data[offset:offset+32].hex(' ')}, data
