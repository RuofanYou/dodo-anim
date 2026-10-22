import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scope={console,Math,Float32Array,Uint16Array,Uint32Array,Int16Array,ArrayBuffer,Date};vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(project,'source/spine-webgl-3.8.js'),'utf8'),scope);const sp=scope.spine;
const raw=JSON.parse(fs.readFileSync(path.join(project,'build/deathwing-native-fire-source.json'),'utf8'));
const atlas=new sp.TextureAtlas(fs.readFileSync(path.join(project,'exports/deathwing-native-fire.atlas'),'utf8'),name=>{const b=fs.readFileSync(path.join(project,'exports',name)),image={width:b.readUInt32BE(16),height:b.readUInt32BE(20)};return{getImage:()=>image,setFilters(){},setWraps(){},dispose(){}};});
const data=new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(raw),frames=[];
for(const time of [1.75,2.6,3.4,4]){
 const sk=new sp.Skeleton(data),state=new sp.AnimationState(new sp.AnimationStateData(data));state.setAnimation(0,'breathe_fire',false);state.update(time);state.apply(sk);sk.updateWorldTransform();const pieces=[];
 for(const slot of sk.drawOrder){const a=slot.getAttachment();if(!a||!slot.bone.active)continue;let world,kind;if(a instanceof sp.RegionAttachment){kind='region';world=new Array(8).fill(0);a.computeWorldVertices(slot.bone,world,0,2);}else if(a instanceof sp.MeshAttachment){kind='mesh';world=new Array(a.worldVerticesLength).fill(0);a.computeWorldVertices(slot,0,a.worldVerticesLength,world,0,2);}else throw Error('Unsupported attachment');pieces.push({kind,world,uvs:Array.from(a.uvs),...(kind==='mesh'?{triangles:Array.from(a.triangles)}:{}),slot:slot.data.name,attachment:a.name,page:a.region.page.name,blend:slot.data.blendMode,tint:[sk.color.r*slot.color.r*a.color.r,sk.color.g*slot.color.g*a.color.g,sk.color.b*slot.color.b*a.color.b,sk.color.a*slot.color.a*a.color.a]});}
 frames.push({time,pieces});
}
fs.writeFileSync(path.join(project,'build/composite-poses.json'),JSON.stringify({stage:raw.skeleton,frames}));
console.log(JSON.stringify({sampleTimes:frames.map(f=>f.time),runtime:'official spine-ts 3.8'}));
