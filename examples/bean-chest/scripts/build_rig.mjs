import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkeletonJson } from '../../../vendor/rigby2d/src/core/index.js';
import { createVolumetricLid, createVolumetricSpine, bakeVolumetricLid } from './volumetric_lid.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, 'source', name), 'utf8'));
const spec = await read('rig_spec.json');
const choreography = await read('actions.json');
const manifest = await read('parts.json');
const parts = new Map(manifest.parts.map(p => [p.id, p]));
const point = ([x,y]) => [x-spec.origin[0],spec.origin[1]-y];
const lid = createVolumetricLid(spec.volume);
const materials = Object.fromEntries(['lid_outer','lid_inner','lid_edge'].map(id => [id,{image:id,width:parts.get(id).width,height:parts.get(id).height}]));
const volume = createVolumetricSpine({lid,materials,parent:'root',boneIndexOffset:1});
const bones = [{ name: 'root' }, ...volume.bones,
  { name: 'reward', parent: 'root', x: 0, y: spec.origin[1] - 900 },
  { name: 'glow', parent: 'root', x: 0, y: spec.origin[1] - 530 },
];
for (let i = 0; i < 7; i++) bones.push({ name: `spark_${i}`, parent: 'root', x: 0, y: spec.origin[1] - 520 });
const slots = [], skin = {};
function slot(name, bone, attachment, visible = true) {
  slots.push({ name, bone, ...(visible ? { attachment: name } : {}) });
  skin[name] = { [name]: attachment };
}
function region(id, options = {}) {
  const p = parts.get(id);
  const [x, y] = point([p.x + p.width / 2, p.y + p.height / 2]);
  return { type: 'region', path: id, x, y, width: p.width, height: p.height, ...options };
}
slot('box_back', 'root', region('box_back'));
slot('hinge_band', 'root', region('hinge_band', { x: point([725, 499])[0], y: point([725, 499])[1] }));
slots.push(...volume.slots);
Object.assign(skin,volume.attachments);
slot('glow', 'glow', { type: 'region', path: 'glow', width: 780, height: 620 });
slots.at(-1).color = 'ffffff00';
slot('reward', 'reward', { type: 'region', path: 'reward', width: spec.rewardSize[0], height: spec.rewardSize[1] });
slots.at(-1).color = 'ffffff00';
for (let i = 0; i < 7; i++) {
  slot(`spark_${i}`, `spark_${i}`, { type: 'region', path: 'spark', width: i % 2 ? 24 : 36, height: i % 2 ? 24 : 36 });
  slots.at(-1).color = 'ffffff00';
}
slot('box_front', 'root', region('box_front'));
slot('clasp', 'root', region('clasp'));

// Shape-preserving Hermite interpolation gives one continuous acceleration between keys.
function value(keys, time, column = 1) {
  if (time <= keys[0][0]) return keys[0][column];
  if (time >= keys.at(-1)[0]) return keys.at(-1)[column];
  let i = 0;
  while (keys[i + 1][0] < time) i++;
  const slope = j => (keys[j + 1][column] - keys[j][column]) / (keys[j + 1][0] - keys[j][0]);
  const tangent = j => {
    if (j === 0 || j === keys.length - 1) return 0;
    const a = slope(j - 1), b = slope(j);
    if (a * b <= 0) return 0;
    const h0 = keys[j][0] - keys[j - 1][0], h1 = keys[j + 1][0] - keys[j][0];
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  };
  const duration = keys[i + 1][0] - keys[i][0], t = (time - keys[i][0]) / duration;
  return (2 * t ** 3 - 3 * t ** 2 + 1) * keys[i][column] + (t ** 3 - 2 * t ** 2 + t) * duration * tangent(i)
    + (-2 * t ** 3 + 3 * t ** 2) * keys[i + 1][column] + (t ** 3 - t ** 2) * duration * tangent(i + 1);
}
const color = alpha => `ffffff${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`;
const r = number => Number(number.toFixed(7));
const animations = {}, posesReport = {};
for (const [name, action] of Object.entries(choreography)) {
  if (!action.angleKeys) continue;
  const times = new Set([0, action.duration, ...action.angleKeys.map(key => key[0]), ...action.rewardKeys.map(key => key[0]), ...[action.release, action.reveal, action.close].filter(Number.isFinite)]);
  for (let i = 1; i < Math.ceil(action.duration * 60); i++) times.add(i / 60);
  const samples = [...times].sort((a, b) => a - b).map(time => ({ time, angle: value(action.angleKeys, time) }));
  const baked = bakeVolumetricLid({lid,samples});
  const animation = { bones: baked.bones, slots: baked.slots, events: [] };
  animation.draworder=[];
  let previousOrder='';
  for(const {time,names,visibleFaces} of baked.faceOrders){
    const effects=['glow','reward',...Array.from({length:7},(_,i)=>`spark_${i}`)];
    const order=visibleFaces.includes('lid_top')
      ? ['box_back','hinge_band',...effects,'box_front',...names,'clasp']
      : ['box_back',...names,'hinge_band',...effects,'box_front','clasp'];
    const signature=order.join('|');
    if(signature===previousOrder)continue;
    previousOrder=signature;
    animation.draworder.push({time,offsets:slots.map((s,i)=>({slot:s.name,offset:order.indexOf(s.name)-i}))});
  }
  const translate = [], rotate = [], rewardAlpha = [], glowAlpha = [], glowScale = [];
  for (const { time } of samples) {
    const y = value(action.rewardKeys, time);
    const gate = action.release === undefined ? 0 : Math.max(0, Math.min(1, (time - action.release) / .15));
    const alpha = value(action.rewardKeys, time, 2) * gate * gate * (3 - 2 * gate);
    const hover = alpha && y < 500 ? Math.sin(time * 2.1) * 2 : 0;
    translate.push({ time: r(time), x: r(hover), y: r(900 - y) });
    rotate.push({ time: r(time), angle: r(alpha ? Math.sin((time - (action.release ?? 0)) * 2.3) * 4 : 0) });
    rewardAlpha.push({ time: r(time), color: color(alpha) });
    glowAlpha.push({ time: r(time), color: color(alpha * (.65 + .12 * Math.sin(time * 4))) });
    glowScale.push({ time: r(time), x: r(1 + .06 * Math.sin(time * 3)), y: r(1 + .05 * Math.sin(time * 3)) });
  }
  animation.bones.reward = { translate, rotate };
  animation.slots.reward = { color: rewardAlpha };
  animation.slots.glow = { color: glowAlpha };
  animation.bones.glow = { scale: glowScale };
  for (let i = 0; i < 7; i++) {
    const start = (action.release ?? action.duration + 1) + i * .065;
    const end = start + .85 + (i % 3) * .1;
    const tx = -310 + i * 103, ty = 230 + (3 - Math.abs(3 - i)) * 76;
    const translations = [], scales = [], alphas = [], rotations = [];
    for (const { time } of samples) {
      const progress = Math.max(0, Math.min(1, (time - start) / (end - start)));
      const active = time >= start && time < end;
      translations.push({ time: r(time), x: r(tx * progress), y: r(ty * progress - 100 * progress * progress) });
      const scale = active ? .7 + .35 * Math.sin(progress * Math.PI) : .2;
      scales.push({ time: r(time), x: r(scale), y: r(scale) });
      rotations.push({ time: r(time), angle: r(progress * (i % 2 ? -150 : 150)) });
      alphas.push({ time: r(time), color: color(active ? Math.sin(progress * Math.PI) ** .7 : 0) });
    }
    animation.bones[`spark_${i}`] = { translate: translations, scale: scales, rotate: rotations };
    animation.slots[`spark_${i}`] = { color: alphas };
  }
  if (action.release !== undefined) animation.events.push({ time: action.release, name: 'treasure_release' });
  if (action.reveal !== undefined) animation.events.push({ time: action.reveal, name: 'treasure_revealed' });
  if (action.close !== undefined) animation.events.push({ time: action.close, name: 'lid_closed' });
  animations[name] = animation;
  posesReport[name] = { duration: action.duration, sampledAngles: samples, faceOrders:baked.faceOrders };
}
const json = { skeleton: { spine: '3.8.99', images: './images/', fps: 60, x: -724, y: -116, width: 1448, height: 1086 }, bones, slots, skins: { default: skin }, events: { treasure_release: {}, treasure_revealed: {}, lid_closed: {} }, animations };
const loaded = readSkeletonJson(json, 'bean-chest');
if (loaded.warnings.length) throw new Error(loaded.warnings.join('; '));
await fs.mkdir(path.join(root, 'build'), { recursive: true });
await fs.writeFile(path.join(root, 'build/bean-chest-source.json'), JSON.stringify(json, null, 2) + '\n');
await fs.writeFile(path.join(root, 'evidence/pose-plan.json'), JSON.stringify({ volume:spec.volume, primitives:lid.primitives, cornerIndices:lid.cornerIndices, controls:lid.controls.map(c=>c.name), actions: posesReport }, null, 2) + '\n');
console.log(JSON.stringify({ bones: bones.length, slots: slots.length, actions: Object.keys(animations), materials: parts.size }));
