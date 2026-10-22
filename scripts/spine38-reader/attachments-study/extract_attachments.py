from pathlib import Path
import hashlib, json, struct, zlib

HERE = Path(__file__).resolve().parent

class Reader:
    def __init__(self, data, start, next_ref, refs):
        self.d, self.p, self.next_ref, self.refs = data, start, next_ref, dict(refs)
        self.objects = []
    def u(self):
        value = 0; shift = 0
        while True:
            b = self.d[self.p]; self.p += 1
            value |= (b & 127) << shift
            if b < 128: return value
            shift += 7
            if shift > 35: raise ValueError(f'varint at {self.p}')
    def raw_string(self):
        first = self.d[self.p]
        if first == 0x81: self.p += 1; return ''
        if first == 0x80: self.p += 1; return None
        chars = []
        while True:
            b = self.d[self.p]; self.p += 1; chars.append(chr(b & 127))
            if b & 128: return ''.join(chars)
    def new(self, kind, start):
        obj = {'kind':kind,'wireRef': self.next_ref,'offset':start,'fields':{}}
        self.next_ref += 1; self.refs[obj['wireRef']] = obj
        self.objects.append(obj)
        return obj
    def ref(self, kind, parse):
        start = self.p; ref = self.u()
        if ref == 0: return None
        if ref != 1:
            return {'ref':ref}
        obj = self.new(kind, start); parse(obj); obj['endOffset'] = self.p
        return {'ref':obj['wireRef']}
    def string(self):
        return self.ref('string', lambda obj: obj.update(value=self.raw_string()))
    def color(self, obj):
        obj['value'] = self.d[self.p:self.p+4].hex(); self.p += 4
    def enum(self, obj): obj['value'] = self.u()
    def float_array(self,obj):
        count=self.u();obj['value']=[self.f()for _ in range(count)]
    def int_array(self,obj):
        count=self.u();obj['value']=[self.u()for _ in range(count)]
    def short_array(self,obj):
        count=self.u();obj['value']=list(struct.unpack_from('>'+str(count)+'H',self.d,self.p));self.p+=count*2
    def array(self,obj):
        count=self.u();obj['value']=[self.generic()for _ in range(count)]
    def point(self,obj):
        count=self.u()
        for i in range(count):
            tag=self.u();start=self.p;value=self.generic()
            obj['fields'][str(tag)]={'offset':start,'endOffset':self.p,'value':value}
    def weight_graph(self,obj):
        count=self.u()
        for i in range(count):
            tag=self.u();start=self.p;value=self.generic()
            obj['fields'][str(tag)]={'offset':start,'endOffset':self.p,'value':value}
    def f(self):
        value = struct.unpack_from('>f', self.d, self.p)[0]; self.p += 4; return value
    def generic(self):
        start=self.p; token=self.u()
        if token==0: return None
        if token==0x1e: return self.ref('color',self.color)
        if token==0x2b: return self.ref('region',self.region)
        if token==0x2e: return self.ref('mesh',self.mesh)
        if token==0x11: return self.ref('float-array',self.float_array)
        if token==0x10: return self.ref('int-array',self.int_array)
        if token==0x2f: return self.ref('short-array',self.short_array)
        if token==0x0f: return self.ref('array',self.array)
        if token==0x36: return self.ref('weight-point',self.point)
        if token==0x47: return self.ref('weight-graph',self.weight_graph)
        if token==0x0c:
            ref=self.u()
            if ref<2:raise ValueError(f'unexpected new bone at {start:#x}')
            return {'ref':ref}
        raise ValueError(f'unsupported class {token:#x} at {start:#x}; next={self.d[start:start+80].hex(" ")}')
    def slot(self,obj):
        count=self.u(); obj['fieldCount']=count
        for i in range(count):
            tag=self.u(); start=self.p
            if tag in [0,2]: value={'ref':self.u()}
            elif tag==1: value=self.string()
            elif tag in [3,12,126]: value=bool(self.u())
            elif tag in [4,5,8,9,10,11]: value=self.generic()
            elif tag==7: value=self.ref('blend',self.enum)
            else: raise ValueError(f'unknown slot tag {tag} at {start:#x}')
            obj['fields'][str(tag)]={'offset':start,'endOffset':self.p,'value':value}
    def mesh(self,obj):
        count=self.u();obj['fieldCount']=count
        for i in range(count):
            tag=self.u();start=self.p
            if tag in [9,10,11,16,17,19,20,21]: value=self.f()
            elif tag in [1,14]: value=self.string()
            elif tag in [8,12,13,18,28,29,31]: value=self.generic()
            elif tag==0:value=self.ref('slot',self.slot)
            elif tag in [4,26,27,34]:value={'ref':self.u()}
            elif tag in [5,30,32,33,35]:value=bool(self.u())
            elif tag==7:value=self.u()
            else:raise ValueError(f'unknown mesh tag {tag} at {start:#x}; next={self.d[start:start+40].hex(" ")}')
            obj['fields'][str(tag)]={'offset':start,'endOffset':self.p,'value':value}
    def region(self,obj):
        count=self.u(); obj['fieldCount']=count
        for i in range(count):
            tag=self.u(); start=self.p
            if 6<=tag<=12: value=self.f()
            elif tag in [1,13]: value=self.string()
            elif tag==14: value=self.generic()
            elif tag==0: value=self.ref('slot',self.slot)
            elif tag==4: value={'ref':self.u()}
            elif tag in [5,32,33,35]: value=bool(self.u())
            else: raise ValueError(f'unknown region tag {tag} at {start:#x}')
            obj['fields'][str(tag)]={'offset':start,'endOffset':self.p,'value':value}
    def value(self, ref):
        if ref is None: return None
        obj=self.refs.get(ref['ref'])
        if not obj:return {'unresolvedRef':ref['ref']}
        return obj['value']if 'value'in obj else {'kind':obj['kind'],'wireRef':ref['ref']}

def run(label,path,bone_count,start):
    data=zlib.decompress(path.read_bytes(),-15)
    next_ref = 4*(bone_count-1)+15
    r=Reader(data,start,next_ref,{4:{'kind':'skeleton'},6:{'kind':'string','value':''}})
    error=None
    try:
        while r.p<len(data) and data[r.p]in [0x2b,0x2e]:
            r.generic()
    except Exception as e: error=str(e)
    result={'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'decompressedLength':len(data),'startOffset':start,'endOffset':r.p,'nextWireRef':r.next_ref,'error':error,'attachmentCountDeclared':data[start-1],'attachmentCountRecovered':sum(o['kind']in ['region','mesh']for o in r.objects),'objects':r.objects}
    result['slots']=[]
    for obj in r.objects:
        if obj['kind']!='slot':continue
        fields=obj['fields']
        if not all(str(k) in fields for k in [1,2,5,7,9]):continue
        result['slots'].append({'wireRef':obj['wireRef'],'offset':obj['offset'],'name':r.value(fields['1']['value']),'boneWireRef':fields['2']['value']['ref'],'color':r.value(fields['5']['value']),'blendRaw':r.value(fields['7']['value']),'setupAttachmentWireRef':fields['9']['value']['ref']})
    (HERE/f'{label}-attachments-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(label, 'objects',len(r.objects),'slots',len(result['slots']),'end',hex(r.p),'next',r.next_ref,'error',error)
    return result,r

def source_order(data,slots):
    names={s['wireRef']:s['name']for s in slots}
    candidates=[]
    for start,b in enumerate(data):
        if b!=13:continue
        p=start;items=[]
        try:
            while len(items)<len(slots):
                begin=p
                def u():
                    nonlocal p
                    v=0;shift=0
                    while True:
                        b=data[p];p+=1;v|=(b&127)<<shift
                        if b<128:return v
                        shift+=7
                        if shift>35:raise ValueError('varint')
                if u()!=13:break
                ref=u()
                if ref not in names:break
                items.append({'offset':begin,'endOffset':p,'wireRef':ref,'name':names[ref]})
        except (IndexError,ValueError):continue
        if len(items)==len(slots) and len({x['wireRef']for x in items})==len(slots):
            candidates.append({'startOffset':start,'endOffset':p,'items':items})
    if len(candidates)!=1:raise ValueError(f'expected unique complete slot-ref sequence, got {len(candidates)}')
    return candidates[0]

def runtime_fragment(result,r,label):
    if result['error']or result['attachmentCountRecovered']!=result['attachmentCountDeclared']:
        raise ValueError('attachment array was not fully read')
    bones=json.loads((HERE.parent/'bones-study'/f'{label}-bones-evidence.json').read_text())['records']
    bone_names={b['wireReferenceToken']:b['name']for b in bones}
    bone_indices={b['wireReferenceToken']:b['index']for b in bones}
    order=source_order(r.d,result['slots'])
    (HERE/f'{label}-setup-slot-order.json').write_text(json.dumps(order,indent=2)+'\n')
    slots_by_ref={s['wireRef']:s for s in result['slots']}
    slots=[]
    for item in order['items']:
        slot=slots_by_ref[item['wireRef']]
        attachment=r.refs[slot['setupAttachmentWireRef']]
        fields=attachment['fields']
        blend={1:'normal',2:'additive'}.get(slot['blendRaw'])
        if blend is None:raise ValueError(f'unknown blend ordinal {slot["blendRaw"]}')
        slots.append({'name':slot['name'],'bone':bone_names[slot['boneWireRef']],
                      'attachment':r.value(fields['1']['value']),'color':slot['color'],'blend':blend})
    attachments={}
    for obj in r.objects:
        if obj['kind']not in ['region','mesh']:continue
        f=obj['fields'];slot=slots_by_ref[f['0']['value']['ref']]
        name=r.value(f['1']['value'])
        if obj['kind']=='region':
            a={k:f[str(tag)]['value']for k,tag in [('x',6),('y',7),('scaleX',8),('scaleY',9),('rotation',10),('width',11),('height',12)]}
            a['color']=r.value(f['14']['value'])
            image_path=r.value(f['13']['value'])
        else:
            a={'type':'mesh','width':f['16']['value'],'height':f['17']['value'],
               'uvs':r.value(f['12']['value']),'triangles':r.value(f['13']['value']),
               'edges':r.value(f['8']['value']),'hull':f['7']['value']/4,
               'color':r.value(f['31']['value'])}
            graph=r.refs[f['28']['value']['ref']]
            weighted_bones=r.value(graph['fields']['1']['value'])
            points=r.value(graph['fields']['2']['value'])
            vertices=[]
            for point_ref in points:
                point=r.refs[point_ref['ref']]
                weights=r.value(point['fields']['0']['value'])
                positions=r.value(point['fields']['1']['value'])
                included=[i for i,w in enumerate(weights)if w>0]
                vertices.append(len(included))
                for i in included:
                    vertices.extend([bone_indices[weighted_bones[i]['ref']],positions[i*2],positions[i*2+1],weights[i]])
            a['vertices']=vertices
            image_path=r.value(f['14']['value'])
        if image_path:a['path']=image_path
        attachments.setdefault(slot['name'],{})[name]=a
    fragment={'slots':slots,'skins':[{'name':'default','attachments':attachments}]}
    (HERE/f'{label}-runtime-setup-fragment.json').write_text(json.dumps(fragment,indent=2)+'\n')
    (HERE/f'{label}-slot-reference-map.json').write_text(json.dumps({str(s['wireRef']):s['name']for s in result['slots']},indent=2)+'\n')
    return fragment,order
