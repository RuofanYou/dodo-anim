import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const rigc=new URL('../../../validation/spine-consumer/node_modules/rig-c/',import.meta.url);
const {readPlate,Plate}=await import(new URL('tools/plate.ts',rigc).href);
const {rasterisePiece,projector,viewportFor}=await import(new URL('src/render_shared.ts',rigc).href);
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=JSON.parse(fs.readFileSync(path.join(project,'build/composite-poses.json'),'utf8'));
const {stage}=data,viewport=viewportFor(stage.x,stage.y,stage.x+stage.width,stage.y+stage.height,1500),projectPoint=projector(viewport);
const pages=new Map();for(const f of data.frames)for(const q of f.pieces)if(!pages.has(q.page))pages.set(q.page,readPlate(path.join(project,'exports',q.page)));
const background=[247,244,237,255],plates=[];
for(const frame of data.frames){
 const plate=new Plate(viewport.width,viewport.height);for(let i=0;i<plate.data.length;i+=4)plate.data.set(background,i);
 for(const q of frame.pieces){if(q.tint[3]<=0)continue;if(![0,1].includes(q.blend))throw Error('Unsupported blend');rasterisePiece(pages.get(q.page),q,projectPoint,plate,(x,y,r,g,b,a)=>{if(q.blend===0)plate.blend(x,y,[r,g,b,a]);else{const old=plate.get(x,y);plate.set(x,y,[Math.min(255,old[0]+r*a/255),Math.min(255,old[1]+g*a/255),Math.min(255,old[2]+b*a/255),255]);}});}
 const output=path.join(project,'evidence',`composite-${frame.time.toFixed(2)}.png`);plate.writePng(output);plates.push({plate,time:frame.time});console.log(output);
}
const contact=new Plate(viewport.width*2,viewport.height*2+52);for(let i=0;i<contact.data.length;i+=4)contact.data.set(background,i);
plates.forEach(({plate,time},i)=>{const ox=i%2*viewport.width,oy=Math.floor(i/2)*(viewport.height+26);for(let y=0;y<plate.height;y++)for(let x=0;x<plate.width;x++)contact.set(ox+x,oy+y,plate.get(x,y));contact.text(`${time.toFixed(2)}s`,ox+8,oy+viewport.height+6,2,[55,55,55,255]);});
contact.writePng(path.join(project,'evidence/composite-contact.png'));
fs.writeFileSync(path.join(project,'evidence/render-audit.json'),JSON.stringify({runtime:'official spine-ts 3.8',render:'existing rig-c rasterizer with explicit original normal/additive compositing',sampleTimes:data.frames.map(f=>f.time),viewport,source:'build/deathwing-native-fire-source.json',atlas:'exports/deathwing-native-fire.atlas'},null,2));
