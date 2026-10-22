import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readSkeletonJson,Pose} from '../../../vendor/rigby2d/src/core/index.js';
import {decodePng} from '../../../vendor/rigby2d/src/mcp/png.js';
import {createVolumetricLid} from './volumetric_lid.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const json=await read('exports/bean-chest.json'),spec=await read('source/rig_spec.json'),actions=await read('source/actions.json');
const plan=await read('evidence/pose-plan.json'),manifest=await read('source/parts.json');
const {skeleton:doc,warnings}=readSkeletonJson(json,'bean-chest-validation');
if(warnings.length)throw new Error(warnings.join('; '));
const lid=createVolumetricLid(spec.volume),restVolume=lid.evaluate(0);
const name=q=>doc.slots[q.slot].name;
const rest=new Map(new Pose(doc).quads(doc).map(q=>[name(q),q]));
const hingeControls=['bottomRearLeft','bottomRearRight'].map(key=>lid.cornerIndices[key]);
let frames=0,maxHingeError=0,maxBodyMotion=0,maxProjectionError=0,maxPhysicalThicknessError=0;
const summaries=[];
function plannedAngle(samples,time){let i=0;while(i+1<samples.length&&samples[i+1].time<time)i++;if(i+1===samples.length)return samples[i].angle;const t=(time-samples[i].time)/(samples[i+1].time-samples[i].time);return samples[i].angle+(samples[i+1].angle-samples[i].angle)*t;}
for(const animation of doc.animations){
 const action=actions[animation.name],sampled=plan.actions[animation.name].sampledAngles;
 if(!action)throw new Error(`Unplanned animation ${animation.name}`);
 for(const [field,eventName] of [['release','treasure_release'],['reveal','treasure_revealed'],['close','lid_closed']]){
  const expected=action[field],keys=(json.animations[animation.name].events??[]).filter(e=>e.name===eventName);
  if(expected===undefined?keys.length:keys.length!==1||Math.abs(keys[0].time-expected)>1e-8)throw new Error(`Event mismatch ${animation.name}/${eventName}`);
 }
 const count=Math.round(animation.duration*240)+1;let first,last,minLidFaces=Infinity,maxLidFaces=0;
 for(let f=0;f<count;f++){
  const time=f/240,pose=new Pose(doc);pose.apply(doc,animation,time,1);pose.updateWorld(doc);
  const quads=pose.quads(doc),byName=new Map(quads.map(q=>[name(q),q]));
  const geometry=lid.evaluate(plannedAngle(sampled,time));
  for(const [i,control] of lid.controls.entries()){
   const actual=pose.world[doc.boneIndex(control.name)].apply([0,0]);
   maxProjectionError=Math.max(maxProjectionError,Math.hypot(actual[0]-geometry.controls[i].spine[0],actual[1]-geometry.controls[i].spine[1]));
  }
  for(const i of hingeControls){
   const actual=pose.world[doc.boneIndex(lid.controls[i].name)].apply([0,0]);
   const expected=restVolume.controls[i].spine;
   maxHingeError=Math.max(maxHingeError,Math.hypot(actual[0]-expected[0],actual[1]-expected[1]));
  }
  for(const corner of ['RearLeft','RearRight','FrontLeft','FrontRight']){
   const a=geometry.corners[`top${corner}`].world,b=geometry.corners[`bottom${corner}`].world;
   maxPhysicalThicknessError=Math.max(maxPhysicalThicknessError,Math.abs(Math.hypot(...a.map((v,i)=>v-b[i]))-spec.volume.dimensions.thickness));
  }
  for(const material of ['box_back','box_front','clasp']){
   const q=byName.get(material),r=rest.get(material);if(!q)throw new Error(`Fixed surface disappeared ${material}`);
   q.positions.forEach((p,i)=>{maxBodyMotion=Math.max(maxBodyMotion,Math.hypot(p[0]-r.positions[i][0],p[1]-r.positions[i][1]));});
  }
  const order=quads.map(name),faces=order.filter(n=>n.startsWith('lid_'));
  minLidFaces=Math.min(minLidFaces,faces.length);maxLidFaces=Math.max(maxLidFaces,faces.length);
  if(!faces.length)throw new Error(`Entire physical lid disappeared ${animation.name}@${time}`);
  const front=order.indexOf('box_front'),clasp=order.indexOf('clasp');
  if(clasp!==order.length-1)throw new Error(`Clasp is occluded ${animation.name}@${time}`);
  if(faces.includes('lid_top')?faces.some(n=>order.indexOf(n)<front):faces.some(n=>order.indexOf(n)>front))throw new Error(`Lid/body layer mismatch ${animation.name}@${time}`);
  if(faces.includes('lid_bottom')&&order.indexOf('lid_bottom')<order.indexOf('box_back'))throw new Error(`Cavity covers inner lid ${animation.name}@${time}`);
  const reward=byName.get('reward');
  if((action.release===undefined||time<action.release-1e-8)&&reward?.color[3]>1e-8)throw new Error(`Early reward ${animation.name}@${time}`);
  if(action.reveal!==undefined&&Math.abs(time-action.reveal)<1e-8){
   if(reward.color[3]<.99||spec.origin[1]-Math.min(...reward.positions.map(p=>p[1]))>=633)throw new Error(`Reward is not clear of front rim ${animation.name}`);
  }
  const signature=quads.filter(q=>q.color[3]>.001).map(q=>({name:name(q),positions:q.positions.flat(),color:q.color}));
  if(!f)first=signature;last=signature;frames++;
 }
 if(['showcase','rig_test'].includes(animation.name)&&JSON.stringify(first)!==JSON.stringify(last))throw new Error(`${animation.name} fails closed loop`);
 summaries.push({name:animation.name,frames:count,minLidFaces,maxLidFaces});
}
// BoxGeometry positions are Float32, so projected fixed corners include its quantization.
if(maxHingeError>1e-4||maxBodyMotion>1e-6||maxProjectionError>1||maxPhysicalThicknessError>1e-4)throw new Error(`Volume mismatch: ${JSON.stringify({maxHingeError,maxBodyMotion,maxProjectionError,maxPhysicalThicknessError})}`);
const partMap=new Map(manifest.parts.map(p=>[p.id,p]));
const backPart=partMap.get('box_back'),bandPart=partMap.get('hinge_band');
const back=decodePng(await fs.readFile(path.join(root,'exports/images/box_back.png'))),band=decodePng(await fs.readFile(path.join(root,'exports/images/hinge_band.png')));
let minHingeAlpha=1;
for(let x=350;x<=1100;x+=5)for(let y=494;y<=502;y++){
 const a=back.data[((y-backPart.y)*back.width+x-backPart.x)*4+3]/255;
 const b=band.data[((y-bandPart.origin[1])*band.width+x-bandPart.origin[0])*4+3]/255;
 minHingeAlpha=Math.min(minHingeAlpha,b+a*(1-b));
}
if(minHingeAlpha<.98)throw new Error(`Incomplete hinge material ${minHingeAlpha}`);
const report={status:'passed',runtime:'Rigby2D 6069ae2 + Three.js 0.186.1 BoxGeometry/PerspectiveCamera',sampledHz:240,frames,maxHingeError,maxBodyMotion,maxProjectionError,maxPhysicalThicknessError,physicalThickness:spec.volume.dimensions.thickness,minHingeAlpha,actions:summaries,buildManifestSha256:createHash('sha256').update(await fs.readFile(path.join(root,'exports/build-manifest.json'))).digest('hex'),scope:'Actual 2D playback checked against projected Three rigid cuboid, fixed hinge/body, non-disappearing lid with real thickness, layer order, event timing and reward gate. Visual material/perspective acceptance and external Spine consumption are recorded separately.'};
await fs.writeFile(path.join(root,'evidence/rig-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
