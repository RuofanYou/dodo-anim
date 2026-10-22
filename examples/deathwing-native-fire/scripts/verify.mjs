import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>JSON.parse(await fs.readFile(path.join(project,p),'utf8'));
const body=await read('source/body.json'),native=await read('source/native-fire.json'),json=await read('build/deathwing-native-fire-source.json'),provenance=await read('source/provenance.json');
const prefix='native__',sha=b=>createHash('sha256').update(b).digest('hex');
assert.deepEqual(json.bones.slice(0,body.bones.length),body.bones);
assert.equal(json.bones.length,body.bones.length+1+native.bones.length);
assert.equal(json.slots.length,body.slots.length+native.slots.length);
for(const [name,track]of Object.entries(body.animations.breathe_fire.bones))assert.deepEqual(json.animations.breathe_fire.bones[name],track);
for(const [name,track]of Object.entries(body.animations.breathe_fire.slots))assert.deepEqual(json.animations.breathe_fire.slots[name],track);
const bodyNames=new Set(body.bones.map(b=>b.name));let weightedInfluences=0;
for(const [slot,entries]of Object.entries(json.skins[0].attachments))for(const attachment of Object.values(entries)){
 if(attachment.type!=='mesh')continue;
 const stream=attachment.vertices;let p=0;
 while(p<stream.length){const count=stream[p++];assert(Number.isInteger(count)&&count>0);let weight=0;for(let i=0;i<count;i++){const index=stream[p];assert(Number.isInteger(index)&&index>=0&&index<json.bones.length);if(!slot.startsWith(prefix))assert(bodyNames.has(json.bones[index].name));weight+=stream[p+3];p+=4;weightedInfluences++;}assert(Math.abs(weight-1)<.00001);}
 assert.equal(p,stream.length);
}
const materials=[];
for(const image of provenance.images){const bytes=await fs.readFile(path.join(project,image.copy));assert.equal(sha(bytes),image.sha256);materials.push(image.copy);}
const unprefix=name=>name?.startsWith(prefix)?name.slice(prefix.length):name;
for(const [name,original]of Object.entries(native.animations)){
 const actual=JSON.parse(JSON.stringify(json.animations[prefix+name]));
 if(actual.bones)actual.bones=Object.fromEntries(Object.entries(actual.bones).map(([n,v])=>[unprefix(n),v]));
 if(actual.slots)actual.slots=Object.fromEntries(Object.entries(actual.slots).map(([n,v])=>{if(v.attachment)for(const f of v.attachment)if(f.name!=null)f.name=unprefix(f.name);return[unprefix(n),v];}));
 if(actual.drawOrder)for(const frame of actual.drawOrder)if(frame.offsets)for(const offset of frame.offsets)offset.slot=unprefix(offset.slot);
 assert.deepEqual(actual,original,'Original source animation changed: '+name);
}
const scope={console,Math,Float32Array,Uint16Array,Uint32Array,Int16Array,ArrayBuffer,Date};vm.createContext(scope);vm.runInContext(await fs.readFile(path.join(project,'source/spine-webgl-3.8.js'),'utf8'),scope);const sp=scope.spine;
const imageBytes=new Map();for(const image of provenance.images){const key=image.copy.replace(/^assets\/parts\//,'').replace(/\.png$/,'');imageBytes.set(key,await fs.readFile(path.join(project,image.copy)));}
function dataFor(raw){
 const paths=new Set();for(const skin of raw.skins)for(const entries of Object.values(skin.attachments))for(const[name,a]of Object.entries(entries))paths.add(a.path??name);
 const pageImages=new Map(),texts=[];
 for(const name of paths){const key=imageBytes.has(name)?name:'native/'+name,bytes=imageBytes.get(key);assert(bytes,'Missing material '+name);const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20),page=name+'.png';pageImages.set(page,bytes);texts.push(`${page}\nsize: ${w}, ${h}\nformat: RGBA8888\nfilter: Linear, Linear\nrepeat: none\n${name}\n  rotate: false\n  xy: 0, 0\n  size: ${w}, ${h}\n  orig: ${w}, ${h}\n  offset: 0, 0\n  index: -1\n`);}
 const atlas=new sp.TextureAtlas(texts.join('\n'),name=>{const b=pageImages.get(name),image={width:b.readUInt32BE(16),height:b.readUInt32BE(20)};return{getImage:()=>image,setFilters(){},setWraps(){},dispose(){}};});
 return new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(raw);
}
const combinedData=dataFor(json),bodyData=dataFor(body),cs=new sp.Skeleton(combinedData),bs=new sp.Skeleton(bodyData);
const ca=new sp.AnimationState(new sp.AnimationStateData(combinedData)),ba=new sp.AnimationState(new sp.AnimationStateData(bodyData));
ca.setAnimation(0,'breathe_fire',false);ba.setAnimation(0,'breathe_fire',false);
let maxBodyMatrixError=0,maxEmitterDistance=0,registrationSamples=0,worldNonfinite=0;
for(let frame=0;frame<=360;frame++){
 if(frame){ca.update(1/60);ba.update(1/60);}ca.apply(cs);ba.apply(bs);cs.updateWorldTransform();bs.updateWorldTransform();
 for(let i=0;i<body.bones.length;i++)for(const field of ['a','b','c','d','worldX','worldY'])maxBodyMatrixError=Math.max(maxBodyMatrixError,Math.abs(cs.bones[i][field]-bs.bones[i][field]));
 for(const b of cs.bones)for(const k of ['a','b','c','d','worldX','worldY'])if(!Number.isFinite(b[k]))worldNonfinite++;
 const t=frame/60;
 if(t>=1.65-1e-8&&t<=4.1+1e-8){const mouth=cs.findBone('mouth_socket'),emitter=cs.findBone(prefix+'bone');maxEmitterDistance=Math.max(maxEmitterDistance,Math.hypot(mouth.worldX-emitter.worldX,mouth.worldY-emitter.worldY));registrationSamples++;}
}
assert.equal(worldNonfinite,0);assert(maxBodyMatrixError<1e-6);assert(maxEmitterDistance<.002);
const report={status:'passed',bodyBonesByteValueUnchanged:true,bodyTracksUnchanged:true,originalSourceAnimationsUnchanged:Object.keys(native.animations),boneCount:json.bones.length,slotCount:json.slots.length,weightedInfluencesChecked:weightedInfluences,allMaterialHashesMatched:materials,bodyMatrixSamples:361,maxBodyMatrixError,emitterSamples:registrationSamples,maxEmitterDistance,worldNonfinite,scope:'Original data and adapted registration checked using official Spine 3.8. Does not certify appearance, 4.3 equivalence, C++/Skia, or target-device performance.'};
await fs.writeFile(path.join(project,'evidence/verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
