import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TextureAtlas, AtlasAttachmentLoader, SkeletonJson, SkeletonBinary } from '@esotericsoftware/spine-core';
import { spinePoser } from 'rig-c/render';

const [directory, name, animationName, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: bun compare-spine-formats.mjs input-directory name animation output.json');
const input = path.resolve(directory);
const files = [`${name}.4.3.json`, `${name}.skel`, `${name}.atlas`];
const bytes = await Promise.all(files.map(file => fs.readFile(path.join(input, file))));
const atlas = () => new AtlasAttachmentLoader(new TextureAtlas(bytes[2].toString()));
const json = new SkeletonJson(atlas()).readSkeletonData(JSON.parse(bytes[0]));
const binary = new SkeletonBinary(atlas()).readSkeletonData(new Uint8Array(bytes[1]));
assert.deepEqual(binary.bones.map(b => b.name), json.bones.map(b => b.name));
assert.deepEqual(binary.animations.map(a => a.name), json.animations.map(a => a.name));
const animation = json.animations.find(a => a.name === animationName);
assert.ok(animation, `Missing animation ${animationName}`);
const fps = 240, count = Math.ceil(animation.duration * fps);
const sample = data => {
  const frames = [];
  spinePoser(data).animation(animationName, undefined, fps, count, (frame, posed) => {
    const bones = posed.bones().map(b => [b.worldX, b.worldY, b.a, b.b, b.c, b.d]);
    const pieces = posed.pieces({ subset: undefined, unclipped: false, texture: false }).map(piece => ({ slot: piece.slot, world: [...piece.world], tint: [...piece.tint] }));
    assert.ok([...bones.flat(), ...pieces.flatMap(p => [...p.world, ...p.tint])].every(Number.isFinite), `Nonfinite pose at ${frame / fps}`);
    frames.push({ bones, pieces });
  });
  return frames;
};
const left = sample(json), right = sample(binary);
let maxBoneError = 0, maxVertexError = 0, maxTintError = 0, maxCoordinate = 0, worstVertex = null;
const discrepantFrames = [];
for (let f = 0; f < left.length; f++) {
  const a = left[f], b = right[f];
  assert.deepEqual(b.pieces.map(p => p.slot), a.pieces.map(p => p.slot), `Draw order differs at ${f / fps}`);
  a.bones.forEach((bone, i) => bone.forEach((value, j) => { maxBoneError = Math.max(maxBoneError, Math.abs(value - b.bones[i][j])); }));
  let frameError=0;
  a.pieces.forEach((piece, i) => {
    assert.equal(b.pieces[i].world.length, piece.world.length);
    piece.world.forEach((value, j) => { const error=Math.abs(value - b.pieces[i].world[j]); if(error>maxVertexError)worstVertex={frame:f,time:f/fps,slot:piece.slot,vertexComponent:j,json:value,binary:b.pieces[i].world[j]};maxVertexError=Math.max(maxVertexError,error);frameError=Math.max(frameError,error);maxCoordinate = Math.max(maxCoordinate, Math.abs(value)); });
    piece.tint.forEach((value, j) => { maxTintError = Math.max(maxTintError, Math.abs(value - b.pieces[i].tint[j])); });
  });
  if(frameError>.1)discrepantFrames.push({frame:f,time:f/fps,error:frameError});
}
const report = { status: maxVertexError <= .1 && maxTintError <= 1 / 255 ? 'passed' : 'failed', runtime: '@esotericsoftware/spine-core@4.3.13', sampler: 'rig-c@2.65.1 spinePoser / AnimationState', animation: animationName, sampledHz: fps, frames: left.length, jsonVersion: json.version, binaryVersion: binary.version, maxBoneError, maxVertexError, maxTintError, maxCoordinate, worstVertex,discrepantFrames,inputSha256: Object.fromEntries(files.map((file, i) => [file, createHash('sha256').update(bytes[i]).digest('hex')])), scope: 'Official runtime loaded actual JSON and binary, compared geometry, tint and draw order through the complete animation; visual quality and C++/Skia are separate checks.' };
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
assert.equal(report.status, 'passed', 'JSON/binary playback geometry differs');
