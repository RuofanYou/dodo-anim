import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Skeleton, Pose } from '../vendor/rigby2d/src/core/index.js';
import { unzip } from '../vendor/rigby2d/src/editor/zip.js';

const [referencePath, rebuiltPath, reportPath] = process.argv.slice(2);
if (!referencePath || !rebuiltPath) throw new Error('Usage: node validation/compare-reference.mjs <reference.rigby> <rebuilt.rigby> [report.json]');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function readProject(file) {
  const files = unzip(new Uint8Array(await fs.readFile(file)));
  const project = files.get('project.json');
  if (!project) throw new Error(`Missing project.json: ${file}`);
  return {
    doc: Skeleton.fromJson(new TextDecoder().decode(project)),
    images: Object.fromEntries([...files].filter(([name]) => name.startsWith('images/') && name.endsWith('.png')).map(([name, bytes]) => [name, hash(bytes)]).sort(([a], [b]) => a.localeCompare(b))),
  };
}
const reference = await readProject(referencePath);
const rebuilt = await readProject(rebuiltPath);
if (JSON.stringify(reference.images) !== JSON.stringify(rebuilt.images)) throw new Error('Reference and rebuild have different PNG bytes');
if (reference.doc.animations.length !== rebuilt.doc.animations.length) throw new Error('Animation counts differ');
const actions = [];
let frames = 0, maxGeometryError = 0, maxColorError = 0;
for (const animation of reference.doc.animations) {
  const other = rebuilt.doc.animations.find(value => value.name === animation.name);
  if (!other || other.duration !== animation.duration) throw new Error(`Missing animation or duration differs: ${animation.name}`);
  const samples = Math.ceil(animation.duration * 60) + 1;
  for (let index = 0; index < samples; index++) {
    const time = Math.min(index / 60, animation.duration);
    const snapshots = [reference.doc, rebuilt.doc].map(doc => {
      const pose = new Pose(doc);
      pose.apply(doc, doc.animation(animation.name), time, 1);
      pose.updateWorld(doc);
      return pose.quads(doc);
    });
    if (snapshots[0].length !== snapshots[1].length) throw new Error(`Attachment counts differ at ${animation.name}@${time}`);
    for (let quad = 0; quad < snapshots[0].length; quad++) {
      const a = snapshots[0][quad], b = snapshots[1][quad];
      if (a.kind !== b.kind || a.image !== b.image || a.positions.length !== b.positions.length || JSON.stringify(a.uvs) !== JSON.stringify(b.uvs) || JSON.stringify(a.triangles) !== JSON.stringify(b.triangles)) throw new Error(`Draw topology differs: ${animation.name}@${time}/${quad}`);
      a.positions.forEach((point, vertex) => point.forEach((value, axis) => {
        maxGeometryError = Math.max(maxGeometryError, Math.abs(value - b.positions[vertex][axis]));
      }));
      a.color.forEach((value, channel) => {
        maxColorError = Math.max(maxColorError, Math.abs(value - b.color[channel]));
      });
    }
    frames++;
  }
  actions.push({ name: animation.name, duration: animation.duration, samples });
}
if (maxGeometryError > 1e-5 || maxColorError > 1e-8) throw new Error(`Reference differs: geometry=${maxGeometryError}, color=${maxColorError}`);
const report = {
  status: 'passed', scope: '60 Hz geometry, topology, UV, colour and embedded PNG comparison against the accepted wizard snapshot; does not validate an unfamiliar asset or another runtime.',
  pngFiles: Object.keys(reference.images).length,
  pngSha256: reference.images,
  actions, frames, maxGeometryError, maxColorError,
};
if (reportPath) await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, frames, pngFiles: report.pngFiles, maxGeometryError, maxColorError }));
