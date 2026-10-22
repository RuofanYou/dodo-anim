import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const body=JSON.parse(await fs.readFile(path.join(project,'source/body.json'))),native=JSON.parse(await fs.readFile(path.join(project,'source/native-fire.json')));
const spec=JSON.parse(await fs.readFile(path.join(project,'source/rig_spec.json')));
const clone=x=>JSON.parse(JSON.stringify(x)),round=x=>Math.round(x*1e7)/1e7,prefix='native__';
const scope={console,Math,Float32Array,Uint16Array,Uint32Array,Int16Array,ArrayBuffer,Date};vm.createContext(scope);
vm.runInContext(await fs.readFile(path.join(project,'source/spine-webgl-3.8.js'),'utf8'),scope);const sp=scope.spine;
const atlasText=[],awaitBytes=new Map();
for(const name of await fs.readdir(path.join(project,'assets/parts/native'))){if(!name.endsWith('.png'))continue;const bytes=await fs.readFile(path.join(project,'assets/parts/native',name)),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);awaitBytes.set(name,bytes);atlasText.push(`native/${name}\nsize: ${w}, ${h}\nformat: RGBA8888\nfilter: Linear, Linear\nrepeat: none\n${name.slice(0,-4)}\n  rotate: false\n  xy: 0, 0\n  size: ${w}, ${h}\n  orig: ${w}, ${h}\n  offset: 0, 0\n  index: -1\n`);}
const atlas=new sp.TextureAtlas(atlasText.join('\n'),name=>{const base=name.replace(/^native\//,''),b=awaitBytes.get(base);const image={width:b.readUInt32BE(16),height:b.readUInt32BE(20)};return {getImage:()=>image,setFilters(){},setWraps(){},dispose(){}};});
const data=new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData({...native,skeleton:{...native.skeleton,spine:'3.8.99'}});
const skeleton=new sp.Skeleton(data),mix=new sp.AnimationStateData(data);mix.defaultMix=.08;
mix.defaultMix=spec.emission.mix;
const state=new sp.AnimationState(mix),fps=60,duration=spec.duration,{start:onset,loopStart,stop,clear}=spec.emission;
const samples=[];let phase='hidden',active=false,maxExtent=0;
const rgba=c=>[c.r,c.g,c.b,c.a].map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');
for(let i=0;i<=duration*fps;i++){
 const time=round(i/fps);if(active&&i)state.update(1/fps);
 const next=time+1e-8>=stop?'end':time+1e-8>=loopStart?'ing':time+1e-8>=onset?'effect':'hidden';
 if(next!==phase){if(next!=='hidden'){state.setAnimation(0,next,next==='ing');active=true;}phase=next;}
 if(active)state.apply(skeleton);skeleton.updateWorldTransform();
 const emitter=skeleton.findBone('bone');if(!emitter)throw Error('Missing original emitter control bone');
 const sample={time,phase,emitter:[emitter.worldX,emitter.worldY],bones:skeleton.bones.map(b=>({name:b.data.name,x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY,shearX:b.shearX,shearY:b.shearY})),slots:skeleton.slots.map(s=>({name:s.data.name,color:rgba(s.color),attachment:s.getAttachment()?.name??null})),drawOrder:skeleton.drawOrder.map(s=>s.data.name)};
 if(time>=onset&&time<=clear){for(const slot of skeleton.drawOrder){const a=slot.getAttachment();if(!a||slot.color.a*a.color.a<=.01)continue;if(!(a instanceof sp.RegionAttachment))throw Error('This adapter expects the recovered original region-only fire');const world=new Array(8).fill(0);a.computeWorldVertices(slot.bone,world,0,2);for(let j=0;j<8;j+=2)maxExtent=Math.max(maxExtent,world[j]-emitter.worldX);}}
 samples.push(sample);
}
if(!(maxExtent>0))throw Error('No visible original flame extent');
const targetLength=spec.targetWorldLength,worldScale=targetLength/maxExtent,headScale=body.bones.find(b=>b.name==='head').scaleX;
if(headScale!==body.bones.find(b=>b.name==='head').scaleY)throw Error('Expected uniform retained head scale');
const localScale=worldScale/headScale;
const nativeBoneOffset=body.bones.length+1;
const bones=[...clone(body.bones),{name:'fire_root',parent:'mouth_socket',scaleX:localScale,scaleY:localScale},...native.bones.map(b=>({...clone(b),name:prefix+b.name,parent:b.parent?prefix+b.parent:'fire_root'}))];
const nativeSlots=native.slots.map(s=>({...clone(s),name:prefix+s.name,bone:prefix+s.bone,attachment:s.attachment?prefix+s.attachment:s.attachment}));
const slots=[...clone(body.slots.slice(0,2)),...nativeSlots,...clone(body.slots.slice(2))];
const attachments=clone(body.skins[0].attachments);
for(const skin of native.skins){if(skin.name!=='default')throw Error('Unexpected source skin');for(const [slotName,entries]of Object.entries(skin.attachments)){
 attachments[prefix+slotName]={};for(const [name,original]of Object.entries(entries)){
  const a=clone(original);a.path='native/'+(original.path??name);if(a.type==='mesh'){let p=0;const stream=a.vertices;while(p<stream.length){const count=stream[p++];for(let j=0;j<count;j++){stream[p]+=nativeBoneOffset;p+=4;}}}
  attachments[prefix+slotName][prefix+name]=a;
 }
}}
function renameAnimation(original){
 const a=clone(original),out={};
 for(const key of Object.keys(a))if(!['bones','slots','drawOrder'].includes(key))throw Error('Source animation needs explicit remapping: '+key);
 if(a.bones)out.bones=Object.fromEntries(Object.entries(a.bones).map(([name,v])=>[prefix+name,v]));
 if(a.slots)out.slots=Object.fromEntries(Object.entries(a.slots).map(([name,v])=>{if(v.attachment)for(const f of v.attachment)if(f.name!=null)f.name=prefix+f.name;return [prefix+name,v];}));
 if(a.drawOrder)out.drawOrder=a.drawOrder.map(f=>({...f,...(f.offsets?{offsets:f.offsets.map(v=>({...v,slot:prefix+v.slot}))}:{})}));
 return out;
}
const animations=Object.fromEntries(Object.entries(native.animations).map(([name,a])=>[prefix+name,renameAnimation(a)]));
const combined=clone(body.animations.breathe_fire);combined.bones??={};combined.slots??={};
function addBoneChannel(name,channel,keys,defaults){
 const equals=(key,values)=>Object.entries(values).every(([k,v])=>Math.abs(key[k]-v)<1e-7);
 if(keys.every(k=>equals(k,defaults)))return;
 const first=Object.fromEntries(Object.keys(defaults).map(k=>[k,keys[0][k]]));
 (combined.bones[name]??={})[channel]=keys.every(k=>equals(k,first))?[keys[0]]:keys;
}
for(let i=0;i<native.bones.length;i++){
 const setup=data.bones[i],name=prefix+setup.name,points=samples.map(s=>s.bones[i]);
 if(!setup.scaleX||!setup.scaleY)throw Error('Zero original setup scale');
 const rotation=points.map((p,i)=>({time:samples[i].time,angle:round(p.rotation-setup.rotation)}));
 for(let j=1;j<rotation.length;j++){while(rotation[j].angle-rotation[j-1].angle>180)rotation[j].angle-=360;while(rotation[j].angle-rotation[j-1].angle< -180)rotation[j].angle+=360;}
 addBoneChannel(name,'rotate',rotation,{angle:0});
 addBoneChannel(name,'translate',points.map((p,i)=>({time:samples[i].time,x:round(p.x-setup.x),y:round(p.y-setup.y)})),{x:0,y:0});
 addBoneChannel(name,'scale',points.map((p,i)=>({time:samples[i].time,x:round(p.scaleX/setup.scaleX),y:round(p.scaleY/setup.scaleY)})),{x:1,y:1});
 addBoneChannel(name,'shear',points.map((p,i)=>({time:samples[i].time,x:round(p.shearX-setup.shearX),y:round(p.shearY-setup.shearY)})),{x:0,y:0});
}
combined.bones.fire_root={translate:samples.map(s=>({time:s.time,x:round(-s.emitter[0]*localScale),y:round(-s.emitter[1]*localScale)})),scale:[{time:0,x:0,y:0,curve:'stepped'},{time:onset,x:1,y:1,curve:'stepped'},{time:round(clear+1/fps),x:0,y:0,curve:'stepped'},{time:duration,x:0,y:0}]};
for(let i=0;i<native.slots.length;i++){
 const name=prefix+native.slots[i].name,attachment=[];let last;
 for(const s of samples){const a=s.slots[i].attachment;if(a!==last){attachment.push({time:s.time,name:a==null?null:prefix+a});last=a;}}
 combined.slots[name]={color:samples.map(s=>({time:s.time,color:s.slots[i].color})),attachment};
}
let previousOrder='';combined.drawOrder=[];
for(const s of samples){const key=s.drawOrder.join('|');if(key===previousOrder)continue;previousOrder=key;
 const offsets=native.slots.flatMap((slot,i)=>{const desired=s.drawOrder.indexOf(slot.name);if(desired<0)throw Error('Source draw-order slot missing');return desired===i?[]:[{slot:prefix+slot.name,offset:desired-i}];});
 combined.drawOrder.push({time:s.time,...(offsets.length?{offsets}:{})});
}
animations.breathe_fire=combined;
const result={skeleton:{...clone(body.skeleton),spine:'3.8.99',images:'./images/',...spec.presentationStage},bones,slots,skins:[{name:'default',attachments}],animations};
await fs.mkdir(path.join(project,'build'),{recursive:true});await fs.mkdir(path.join(project,'evidence'),{recursive:true});
await fs.writeFile(path.join(project,'build/deathwing-native-fire-source.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(project,'evidence/schedule-samples.json'),JSON.stringify({fps,duration,schedule:{onset,loopStart,stop,clear,mixDuration:mix.defaultMix},sourceEmitter:'bone',sourceMaxExtent:maxExtent,targetNominalWorldLength:targetLength,worldScale,parentHeadScale:headScale,wrapperLocalScale:localScale,samples},null,2)+'\n');
await fs.writeFile(path.join(project,'evidence/adaptation.json'),JSON.stringify({character:'Existing character rig, artwork and 6-second body tracks retained.',effect:'Original Spine fire source rig, artwork and five source animations retained under native__ names.',composition:'Official Spine 3.8 AnimationState schedules effect[0,.2], ing loop, end with .08 mixing; 60Hz local-pose sampling; source motion not redesigned.',registration:'Per-frame original emitter world point is registered to mouth_socket by wrapper translation; wrapper scale compensates the retained headScale1.35.',bodyBoneCount:body.bones.length,nativeBoneCount:native.bones.length,bones:bones.length,slots:slots.length,sourceAnimations:Object.keys(native.animations),targetNominalWorldLength:targetLength,presentationStage:result.skeleton},null,2)+'\n');
console.log(JSON.stringify({bones:bones.length,slots:slots.length,animations:Object.keys(animations),sourceMaxExtent:maxExtent,worldScale,wrapperLocalScale:localScale}));
