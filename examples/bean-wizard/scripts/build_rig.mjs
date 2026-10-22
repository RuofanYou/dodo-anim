import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readSkeletonJson, Pose } from '../../../vendor/rigby2d/src/core/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'source/parts.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const spec = JSON.parse(await fs.readFile(path.join(root, 'source/rig_spec.json'), 'utf8'));
const choreography = JSON.parse(await fs.readFile(path.join(root, 'source/actions.json'), 'utf8'));
if (manifest.canvasWidth !== 1254 || manifest.canvasHeight !== 1254) throw new Error(`Source canvas ${manifest.canvasWidth}×${manifest.canvasHeight}; rig expects the accepted 1254×1254 concept.`);
const parts = manifest.parts;
if (!Array.isArray(parts)) throw new Error('parts.json must contain parts[]');
const actualIds = new Set(parts.map((part) => part.id));
if (actualIds.size !== parts.length) throw new Error('Duplicate part IDs');
for (const id of actualIds) if (!spec.bindings[id]) throw new Error(`Unmapped source part '${id}'. Known consumers: ${Object.keys(spec.bindings).join(', ')}`);
for (const id of Object.keys(spec.bindings)) if (!actualIds.has(id)) throw new Error(`Expected original-pixel part '${id}' is missing from ${parts.length} available parts.`);
const radians = (degrees) => degrees * Math.PI / 180;
const degrees = (angle) => angle * 180 / Math.PI;
const round = (value) => Number(value.toFixed(7));
const boneMap = new Map();
for (let index = 0; index < spec.bones.length; index++) {
  const bone = spec.bones[index];
  if (bone.parent && !boneMap.has(bone.parent)) throw new Error(`Bone '${bone.id}' must follow parent '${bone.parent}'`);
  bone.index = index;
  bone.worldX = bone.pivot[0] - spec.origin[0];
  bone.worldY = spec.origin[1] - bone.pivot[1];
  bone.worldRotation = -degrees(Math.atan2(bone.aim[1] - bone.pivot[1], bone.aim[0] - bone.pivot[0]));
  bone.length ??= Math.hypot(bone.aim[0] - bone.pivot[0], bone.aim[1] - bone.pivot[1]);
  boneMap.set(bone.id, bone);
}
const inverse = (bone, x, y) => {
  const dx = x - bone.worldX;
  const dy = y - bone.worldY;
  const angle = radians(bone.worldRotation);
  return [round(Math.cos(angle) * dx + Math.sin(angle) * dy), round(-Math.sin(angle) * dx + Math.cos(angle) * dy)];
};
const bones = spec.bones.map((bone) => {
  const parent = bone.parent ? boneMap.get(bone.parent) : null;
  const position = parent ? inverse(parent, bone.worldX, bone.worldY) : [bone.worldX, bone.worldY];
  return { name: bone.id, ...(bone.parent ? { parent: bone.parent } : {}), x: position[0], y: position[1], rotation: round(bone.worldRotation - (parent?.worldRotation ?? 0)), length: round(bone.length) };
});
function chainWeights(rule, x, y) {
  const blend = (a, b, t) => [[a, 1 - t], [b, t]].filter(([, weight]) => weight > 0.000001);
  const neckWeights = () => {
    const [headEnd, torsoCenter, pelvisStart] = spec.neckSurface.worldYBreaks;
    if (!(headEnd < torsoCenter && torsoCenter < pelvisStart)) throw new Error('Neck Y field must define three ascending transition points');
    return y <= headEnd ? [[0, 1]] : y < torsoCenter ? blend(0, 1, (y - headEnd) / (torsoCenter - headEnd)) : y < pelvisStart ? blend(1, 2, (y - torsoCenter) / (pelvisStart - torsoCenter)) : [[2, 1]];
  };
  if (rule === 'cape') {
    const tail = x >= 720 ? [[0, 1]] : x >= 480 ? blend(1, 0, (x - 480) / 240) : x >= 280 ? blend(2, 1, (x - 280) / 200) : [[2, 1]];
    const [tailEnd, neckStart] = spec.neckSurface.capeTransitionX;
    if (!(tailEnd < neckStart)) throw new Error('Cape X transition must ascend from tail to neck');
    if (x <= tailEnd) return tail;
    const neck = neckWeights().map(([index, weight]) => [index + 3, weight]);
    if (x >= neckStart) return neck;
    const t = (x - tailEnd) / (neckStart - tailEnd);
    return [...tail.map(([index, weight]) => [index, weight * (1 - t)]), ...neck.map(([index, weight]) => [index, weight * t])];
  }
  if (rule === 'brush') return x >= 427 ? [[0, 1]] : x <= 200 ? [[1, 1]] : blend(1, 0, (x - 200) / 227);
  if (rule === 'hat') {
    if (y > 390 || x >= 550) return [[0, 1]];
    if (x >= 420) return blend(1, 0, (x - 420) / 130);
    return x >= 210 ? blend(2, 1, (x - 210) / 210) : [[2, 1]];
  }
  if (rule === 'holding_arm') return x <= 707 ? [[0, 1]] : x >= 766 ? [[1, 1]] : blend(0, 1, (x - 707) / 59);
  if (rule === 'wand_arm') return x <= 900 ? [[0, 1]] : x < 958 ? blend(0, 1, (x - 900) / 58) : [[1, 1]];
  if (rule === 'neck') return neckWeights();
  throw new Error(`No mesh weight rule '${rule}'`);
}
function mesh(part, binding) {
  const { chain, weightRule } = binding.mesh;
  const axis = (start, size, count, breaks = []) => {
    if (!binding.mesh.gridStep) return Array.from({ length: count + 1 }, (_, index) => start + index / count * size);
    const step = binding.mesh.gridStep;
    const values = [start, start + size];
    for (let value = Math.ceil(start / step) * step; value < start + size; value += step) if (value > start) values.push(value);
    for (const value of breaks) if (value > start && value < start + size) values.push(value);
    return [...new Set(values)].sort((a, b) => a - b);
  };
  const xs = axis(part.x, part.width, binding.mesh.columns);
  const ys = axis(part.y, part.height, binding.mesh.rows, binding.mesh.globalYBreaks);
  const columns = xs.length - 1;
  const rows = ys.length - 1;
  const order = [];
  for (let x = 0; x <= columns; x++) order.push([x, 0]);
  for (let y = 1; y <= rows; y++) order.push([columns, y]);
  for (let x = columns - 1; x >= 0; x--) order.push([x, rows]);
  for (let y = rows - 1; y > 0; y--) order.push([0, y]);
  const hull = order.length;
  for (let y = 1; y < rows; y++) for (let x = 1; x < columns; x++) order.push([x, y]);
  const indices = new Map(order.map(([x, y], index) => [`${x},${y}`, index]));
  const uvs = [];
  const vertices = [];
  const expected = [];
  for (const [gridX, gridY] of order) {
    const sourceX = xs[gridX];
    const sourceY = ys[gridY];
    const u = (sourceX - part.x) / part.width;
    const v = (sourceY - part.y) / part.height;
    const worldX = sourceX - spec.origin[0];
    const worldY = spec.origin[1] - sourceY;
    uvs.push(round(u), round(v));
    const weights = chainWeights(weightRule, sourceX, sourceY);
    if (Math.abs(weights.reduce((sum, [, weight]) => sum + weight, 0) - 1) > 1e-8) throw new Error(`Weights do not sum to one for ${part.id}`);
    vertices.push(weights.length);
    for (const [chainIndex, weight] of weights) {
      const bone = boneMap.get(chain[chainIndex]);
      if (!bone) throw new Error(`Mesh ${part.id} references missing bone ${chain[chainIndex]}`);
      const local = inverse(bone, worldX, worldY);
      vertices.push(bone.index, local[0], local[1], round(weight));
    }
    expected.push([worldX, worldY]);
  }
  const triangles = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const tl = indices.get(`${x},${y}`);
    const tr = indices.get(`${x + 1},${y}`);
    const bl = indices.get(`${x},${y + 1}`);
    const br = indices.get(`${x + 1},${y + 1}`);
    triangles.push(tl, tr, br, tl, br, bl);
  }
  if (triangles.length / 3 !== 2 * order.length - hull - 2) throw new Error(`Invalid triangulated hull for ${part.id}`);
  return { attachment: { type: 'mesh', path: part.id, width: part.width, height: part.height, uvs, vertices, triangles, hull }, expected };
}
await fs.mkdir(path.join(root, 'build'), { recursive: true });
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
const slots = [];
const skin = {};
const meshExpectations = new Map();
const imageHashes = {};
for (const part of [...parts].sort((a, b) => a.z - b.z)) {
  const binding = spec.bindings[part.id];
  const bone = boneMap.get(binding.bone);
  if (!bone) throw new Error(`Missing bone ${binding.bone} for part ${part.id}`);
  const png = await fs.readFile(path.resolve(root, part.file));
  if (png.readUInt32BE(16) !== part.width || png.readUInt32BE(20) !== part.height) throw new Error(`PNG dimensions do not match source metadata: ${part.id}`);
  imageHashes[part.id] = createHash('sha256').update(png).digest('hex');
  slots.push({ name: part.id, bone: binding.bone, attachment: part.id, ...(part.id === 'spark' ? { color: 'ffffffcc' } : {}) });
  let attachment;
  if (binding.mesh) {
    const result = mesh(part, binding);
    attachment = result.attachment;
    meshExpectations.set(part.id, result.expected);
  } else {
    const center = inverse(bone, part.x + part.width / 2 - spec.origin[0], spec.origin[1] - part.y - part.height / 2);
    attachment = { type: 'region', path: part.id, x: center[0], y: center[1], rotation: round(-bone.worldRotation), width: part.width, height: part.height };
  }
  skin[part.id] = { [part.id]: attachment };
}
const ease = [0.25, 0, 0.35, 1];
const animations = {};
for (const action of choreography.actions) {
  const animation = { bones: {}, slots: {} };
  for (const [name, channels] of Object.entries(action.bones)) {
    if (!boneMap.has(name)) throw new Error(`Unknown animation bone ${name}`);
    const out = {};
    for (const [channel, keys] of Object.entries(channels)) out[channel] = keys.map(([time, x, y], index) => {
      if (!(time >= 0 && time <= action.duration)) throw new Error(`Key outside ${action.name} duration: ${time}`);
      return { time, ...(channel === 'rotate' ? { angle: x } : { x, y }), ...(index < keys.length - 1 ? { curve: ease } : {}) };
    });
    animation.bones[name] = out;
  }
  for (const [name, keys] of Object.entries(action.opacity ?? {})) {
    if (!actualIds.has(name)) throw new Error(`Opacity key references missing image slot '${name}'`);
    animation.slots[name] = { color: keys.map(([time, opacity], index) => {
      if (!(opacity >= 0 && opacity <= 1)) throw new Error(`Alpha out of range for ${action.name}/${name}: ${opacity}`);
      return { time, color: `ffffff${Math.round(opacity * 255).toString(16).padStart(2, '0')}`, ...(index < keys.length - 1 ? { curve: ease } : {}) };
    }) };
  }
  if (action.events?.length) animation.events = action.events;
  animations[action.name] = animation;
}
const json = { skeleton: { spine: '3.8.99', images: './images/', fps: 30, x: -627, y: -474, width: 1254, height: 1254 }, bones, slots, skins: { default: skin }, ik: spec.ik, events: { cast_release: {} }, animations };
const projectile = choreography.projectile;
const boltBone = boneMap.get(projectile.bone);
const sparkPart = parts.find((part) => part.id === projectile.sourcePart);
const boltCenter = inverse(boltBone, sparkPart.x + sparkPart.width / 2 - spec.origin[0], spec.origin[1] - sparkPart.y - sparkPart.height / 2);
slots.push({ name: projectile.slot, bone: projectile.bone, attachment: projectile.slot, color: 'ffffff00' });
skin[projectile.slot] = { [projectile.slot]: { type: 'region', path: projectile.sourcePart, x: boltCenter[0], y: boltCenter[1], rotation: round(-boltBone.worldRotation), width: sparkPart.width, height: sparkPart.height } };
const releaseSkeleton = readSkeletonJson(json, 'bean-wizard-release').skeleton;
const releasePose = new Pose(releaseSkeleton);
releasePose.apply(releaseSkeleton, releaseSkeleton.animation('cast'), projectile.release, 1);
releasePose.updateWorld(releaseSkeleton);
const flightWorld = releasePose.world[boneMap.get('flight_root').index];
const sparkWorld = releasePose.world[boneMap.get('spark').index];
const releasePosition = flightWorld.inverse().apply(sparkWorld.apply([0, 0]));
const restBolt = bones[boltBone.index];
const start = [releasePosition[0] - restBolt.x, releasePosition[1] - restBolt.y];
const end = [start[0] + projectile.distance, start[1] + projectile.distance * 0.12];
for (const action of choreography.actions) {
  animations[action.name].slots[projectile.slot] = { color: [{ time: 0, color: 'ffffff00' }, { time: action.duration, color: 'ffffff00' }] };
}
animations.cast.bones[projectile.bone] = {
  translate: [{ time: 0, x: 0, y: 0 }, { time: projectile.release - 0.001, x: round(start[0]), y: round(start[1]), curve: 'stepped' }, { time: projectile.release, x: round(start[0]), y: round(start[1]) }, { time: projectile.flightEnd, x: round(end[0]), y: round(end[1]) }, { time: projectile.flightEnd + 0.01, x: 0, y: 0, curve: 'stepped' }, { time: 2.2, x: 0, y: 0 }],
  scale: [{ time: 0, x: 1, y: 1 }, { time: projectile.release - 0.001, x: projectile.scale, y: projectile.scale }, { time: projectile.flightEnd, x: 0.18, y: 0.18 }, { time: projectile.flightEnd + 0.01, x: 1, y: 1 }, { time: 2.2, x: 1, y: 1 }]
};
animations.cast.slots[projectile.slot].color = [{ time: 0, color: 'ffffff00', curve: 'stepped' }, { time: projectile.release - 0.001, color: 'ffffff00', curve: 'stepped' }, { time: projectile.release, color: 'ffffffff' }, { time: projectile.flightEnd, color: 'ffffff00' }, { time: 2.2, color: 'ffffff00' }];
const { skeleton, warnings } = readSkeletonJson(json, 'bean-wizard');
if (warnings.length) throw new Error(warnings.join('\n'));
const pose = new Pose(skeleton);
const geometryChecks = [];
for (const quad of pose.quads(skeleton)) {
  if (skeleton.slots[quad.slot].name === projectile.slot) continue;
  const part = parts.find((candidate) => candidate.id === quad.image);
  const expected = meshExpectations.get(quad.image) ?? [[part.x - spec.origin[0], spec.origin[1] - part.y], [part.x + part.width - spec.origin[0], spec.origin[1] - part.y], [part.x + part.width - spec.origin[0], spec.origin[1] - part.y - part.height], [part.x - spec.origin[0], spec.origin[1] - part.y - part.height]];
  const error = Math.max(...quad.positions.flatMap((point, index) => point.map((value, component) => Math.abs(value - expected[index][component]))));
  if (error > 0.001) throw new Error(`Original-pixel rest geometry shifted for ${quad.image}: ${error} source pixels`);
  geometryChecks.push({ part: quad.image, type: quad.kind, maxRestPositionError: error, vertices: expected.length });
}
const resultPath = path.join(root, 'build/bean-wizard-source.json');
await fs.writeFile(resultPath, JSON.stringify(json, null, 2) + '\n');
await fs.writeFile(path.join(root, 'evidence/rig-build.json'), JSON.stringify({ buildCopiesSourcePngBytesWithoutResize: true, artSource: manifest.art_source, hiddenReconstruction: parts.map(({ id, source_pixels, inpainted_hidden_pixels }) => ({ id, source_pixels, inpainted_hidden_pixels })), bones: bones.length, slots: slots.length, imageSha256: imageHashes, meshGeometryChecks: geometryChecks, neckSurface: spec.neckSurface, choreographySha256: createHash('sha256').update(await fs.readFile(path.join(root, 'source/actions.json'))).digest('hex'), projectile, axes: bones.map((bone) => ({ name: bone.name, localRotation: bone.rotation, length: bone.length })), actions: choreography.actions.map(({ name, duration, loop }) => ({ name, duration, loop })) }, null, 2) + '\n');
console.log(JSON.stringify({ skeleton: resultPath, bones: bones.length, slots: slots.length, weightedMeshes: meshExpectations.size, animations: Object.keys(animations) }, null, 2));
