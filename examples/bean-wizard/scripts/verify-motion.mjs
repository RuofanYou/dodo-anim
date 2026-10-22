import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pose } from '../../../vendor/rigby2d/src/core/index.js';
import { loadProject } from '../../../vendor/rigby2d/src/mcp/tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reopened = (await loadProject(path.join(root, 'exports/bean-wizard.rigby'))).doc;
const rigSpec = JSON.parse(await fs.readFile(path.join(root, 'source/rig_spec.json'), 'utf8'));
const actions = JSON.parse(await fs.readFile(path.join(root, 'source/actions.json'), 'utf8'));
const partManifest = JSON.parse(await fs.readFile(path.join(root, 'source/parts.json'), 'utf8'));
const holdingHand = reopened.boneIndex('holding_hand');
const holdingTarget = reopened.boneIndex('holding_target');
const wand = reopened.boneIndex('wand');
if ([holdingHand, holdingTarget, wand].some((index) => index === null)) throw new Error('Required hand constraint or wand bone is missing');
let maxHandTargetError = 0;
let minWandAngle = Infinity;
let maxWandAngle = -Infinity;
let projectileMaxSourceX = -Infinity;
let minMeshAreaRatio = Infinity;
let maxSharedNeckVertexError = 0;
const area = (positions, a, b, c) => (positions[b][0] - positions[a][0]) * (positions[c][1] - positions[a][1]) - (positions[b][1] - positions[a][1]) * (positions[c][0] - positions[a][0]);
const restMeshes = new Map(new Pose(reopened).quads(reopened).filter((quad) => quad.kind === 'mesh').map((quad) => [quad.slot, quad]));
const neckVertices = new Map();
for (const quad of restMeshes.values()) {
  const name = reopened.slots[quad.slot].name;
  if (!rigSpec.neckSurface?.sharedParts.includes(name)) continue;
  const part = partManifest.parts.find((candidate) => candidate.id === name);
  for (let index = 0; index < quad.positions.length; index++) {
    const x = part.x + quad.attachment.uvs[index * 2] * part.width;
    const y = part.y + quad.attachment.uvs[index * 2 + 1] * part.height;
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    if (!neckVertices.has(key)) neckVertices.set(key, []);
    neckVertices.get(key).push({ slot: quad.slot, index });
  }
}
const sharedNeckVertices = [...neckVertices.values()].filter((vertices) => vertices.length > 1);
if (rigSpec.neckSurface && sharedNeckVertices.length === 0) throw new Error('Connected neck surfaces have no shared source-space grid vertices');
const sampleResults = [];
for (const animation of reopened.animations) {
  if (!(animation.duration > 0)) throw new Error(`Animation has no duration: ${animation.name}`);
  const frameCount = Math.ceil(animation.duration * 60) + 1;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const signatures = new Set();
  let quadMin = Infinity;
  let quadMax = 0;
  let firstPositions;
  let lastPositions;
    let firstColors;
    let lastColors;
  for (let index = 0; index < frameCount; index++) {
    const time = Math.min(index / 60, animation.duration);
    const pose = new Pose(reopened);
    pose.apply(reopened, animation, time, 1);
    pose.updateWorld(reopened);
    const hand = pose.world[holdingHand].apply([0, 0]);
    const target = pose.world[holdingTarget].apply([0, 0]);
    maxHandTargetError = Math.max(maxHandTargetError, Math.hypot(hand[0] - target[0], hand[1] - target[1]));
    const wandWorld = pose.world[wand];
    const wandAngle = Math.atan2(wandWorld.b, wandWorld.a) * 180 / Math.PI;
    minWandAngle = Math.min(minWandAngle, wandAngle);
    maxWandAngle = Math.max(maxWandAngle, wandAngle);
    const quads = pose.quads(reopened).filter((quad) => quad.color[3] > 0.01);
    const bySlot = new Map(quads.map((quad) => [quad.slot, quad]));
    for (const vertices of sharedNeckVertices) {
      const first = bySlot.get(vertices[0].slot).positions[vertices[0].index];
      for (const vertex of vertices.slice(1)) {
        const position = bySlot.get(vertex.slot).positions[vertex.index];
        maxSharedNeckVertexError = Math.max(maxSharedNeckVertexError, Math.hypot(position[0] - first[0], position[1] - first[1]));
      }
    }
    quadMin = Math.min(quadMin, quads.length);
    quadMax = Math.max(quadMax, quads.length);
    const points = [];
    for (const quad of quads) {
      const positions = quad.positions.flat();
      if (positions.some((value) => !Number.isFinite(value))) throw new Error(`Nonfinite position: ${animation.name} @ ${time}`);
      for (let point = 0; point < positions.length; point += 2) {
        bounds[0] = Math.min(bounds[0], positions[point]);
        bounds[1] = Math.min(bounds[1], positions[point + 1]);
        bounds[2] = Math.max(bounds[2], positions[point]);
        bounds[3] = Math.max(bounds[3], positions[point + 1]);
      }
      points.push(...positions.map((value) => Number(value.toFixed(5))));
      if (reopened.slots[quad.slot].name === actions.projectile.slot) projectileMaxSourceX = Math.max(projectileMaxSourceX, ...quad.positions.map(([x]) => x + rigSpec.origin[0]));
      if (quad.kind === 'mesh') {
        const rest = restMeshes.get(quad.slot);
        for (let triangle = 0; triangle < quad.triangles.length; triangle += 3) {
          const [a, b, c] = quad.triangles.slice(triangle, triangle + 3);
          const ratio = area(quad.positions, a, b, c) / area(rest.positions, a, b, c);
          if (!Number.isFinite(ratio) || ratio <= 0.15) throw new Error(`Mesh folded/collapsed: ${animation.name}/${quad.image} @ ${time}; area ratio ${ratio}`);
          minMeshAreaRatio = Math.min(minMeshAreaRatio, ratio);
        }
      }
    }
    if (!quads.length) throw new Error(`No visible attachments: ${animation.name} @ ${time}`);
    signatures.add(JSON.stringify(points));
    const colors = quads.flatMap((quad) => quad.color);
    if (index === 0) { firstPositions = points; firstColors = colors; }
    lastPositions = points;
    lastColors = colors;
  }
  if (signatures.size < 2) throw new Error(`No changing rendered pose: ${animation.name}`);
  const seam = Math.max(...firstPositions.map((value, index) => Math.abs(value - lastPositions[index])));
  if (seam > 0.05) throw new Error(`${animation.name} does not return to its first pose: ${seam} units exceeds 0.05`);
  const colorSeam = Math.max(...firstColors.map((value, index) => Math.abs(value - lastColors[index])));
  if (colorSeam > 1 / 255) throw new Error(`${animation.name} color/alpha does not return to its first pose: ${colorSeam}`);
  sampleResults.push({ name: animation.name, duration: animation.duration, sampledFrames: frameCount, distinctPoses: signatures.size, visibleQuadRange: [quadMin, quadMax], bounds: bounds.map((number) => Number(number.toFixed(3))), loopGeometrySeam: Number(seam.toFixed(5)), loopColorSeam: colorSeam });
}
if (maxHandTargetError > 0.5) throw new Error(`Holding hand moved ${maxHandTargetError} source pixels away from broom grip target`);
if (maxSharedNeckVertexError > 0.001) throw new Error(`Head/chest surfaces separate by ${maxSharedNeckVertexError} pixels at shared source vertices`);
if (projectileMaxSourceX > actions.projectile.sourceCanvasRightLimit) throw new Error(`Projectile right bound ${projectileMaxSourceX} exceeds source canvas + 200: ${actions.projectile.sourceCanvasRightLimit}`);
const report = {
  runtime: 'Rigby2D 0.2.4, pinned upstream 6069ae2ef8cfbb622053a84e7ccd4acc74c06415',
  status: 'passed',
  scope: 'Wizard-authored constraints only: broom contact, mesh area, shared neck vertices, bounded projectile, authored return-to-rest. Does not prove visual quality or target C++ runtime compatibility.',
  bones: reopened.bones.length,
  slots: reopened.slots.length,
  sampleResults,
  motionChecks: { maxHandTargetError, wandWorldAngleRange: [minWandAngle, maxWandAngle], minMeshAreaRatio, projectileMaxSourceX, projectileSourceRightLimit: actions.projectile.sourceCanvasRightLimit, neckSharedSourceVertices: sharedNeckVertices.length, maxSharedNeckVertexError }
};
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'evidence/motion-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, sampledFrames: sampleResults.reduce((sum, action) => sum + action.sampledFrames, 0), maxHandTargetError, minMeshAreaRatio, maxSharedNeckVertexError }));
