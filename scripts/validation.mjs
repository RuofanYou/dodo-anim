import fs from 'node:fs/promises';
import path from 'node:path';
import { readSkeletonJson, Pose, AnimationState } from '../vendor/rigby2d/src/core/index.js';
import { usedImages } from '../vendor/rigby2d/src/editor/io.js';

function inspect(value, at = '$') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Nonfinite number at ${at}`);
  if (Array.isArray(value)) {
    if (value.length && value.every(key => key && typeof key === 'object' && 'time' in key)) {
      let previous = -Infinity;
      for (const key of value) {
        if (!Number.isFinite(key.time) || key.time < 0 || key.time < previous) throw new Error(`Invalid or unordered key time at ${at}: ${key.time}`);
        previous = key.time;
      }
    }
    value.forEach((child, index) => inspect(child, `${at}[${index}]`));
  } else if (value && typeof value === 'object') {
    if ('curve' in value) {
      const curve = value.curve;
      if (!(curve === 'linear' || curve === 'stepped' || typeof curve === 'number' || (Array.isArray(curve) && curve.length > 0 && curve.length % 4 === 0 && curve.every(Number.isFinite)))) throw new Error(`Invalid Spine curve at ${at}.curve`);
    }
    for (const [key, child] of Object.entries(value)) inspect(child, `${at}.${key}`);
  }
}

export function imageFile(directory, name) {
  const file = path.resolve(directory, `${name}.png`);
  const relative = path.relative(path.resolve(directory), file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Image '${name}' escapes the configured parts directory`);
  return file;
}

export function checkDocument(doc) {
  const structure = doc.validate();
  if (structure) throw new Error(structure);
  const attachments = [...doc.slots.flatMap(slot => slot.attachments), ...doc.skins.flatMap(skin => skin.slots.flatMap(slot => slot.attachments))];
  for (const attachment of attachments) {
    if (attachment.weights) for (const [index, weights] of attachment.weights.entries()) {
      if (!weights.length) throw new Error(`${attachment.name}: vertex ${index} has no influences`);
      let total = 0;
      for (const weight of weights) {
        if (!Number.isInteger(weight.bone) || weight.bone < 0 || weight.bone >= doc.bones.length) throw new Error(`${attachment.name}: missing influence bone ${weight.bone}`);
        if (![weight.x, weight.y, weight.weight].every(Number.isFinite) || weight.weight < 0) throw new Error(`${attachment.name}: invalid influence at vertex ${index}`);
        total += weight.weight;
      }
      if (Math.abs(total - 1) > 1e-4) throw new Error(`${attachment.name}: vertex ${index} weights sum to ${total}, expected 1`);
    }
    if (attachment.type === 'mesh') {
      const count = attachment.uvs.length / 2;
      if (!Number.isInteger(count) || count === 0 || attachment.uvs.some(value => !Number.isFinite(value))) throw new Error(`${attachment.name}: invalid mesh UVs`);
      if (attachment.weights ? attachment.weights.length !== count : attachment.vertices?.length !== count * 2) throw new Error(`${attachment.name}: UV and vertex counts differ`);
      if (attachment.triangles.length % 3 || attachment.triangles.some(index => !Number.isInteger(index) || index < 0 || index >= count)) throw new Error(`${attachment.name}: triangle references a missing vertex`);
    }
  }
  const checkPose = (pose, label) => {
    for (const matrix of pose.world) if (![matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty].every(Number.isFinite)) throw new Error(`Nonfinite bone transform: ${label}`);
    for (const quad of pose.quads(doc)) if (![...quad.positions.flat(), ...quad.uvs.flat(), ...quad.color].every(Number.isFinite)) throw new Error(`Nonfinite drawable: ${label}/${quad.attachment.name}`);
  };
  checkPose(new Pose(doc), 'setup');
  const animations = [];
  for (const animation of doc.animations) {
    if (!Number.isFinite(animation.duration) || animation.duration < 0) throw new Error(`Invalid duration: ${animation.name}`);
    const state = new AnimationState();
    const pose = new Pose(doc);
    state.play(doc, animation.name, false, 0);
    const times = new Set([0, animation.duration]);
    for (let index = 1; index < Math.ceil(animation.duration * 60); index++) times.add(index / 60);
    const keys = value => {
      if (Array.isArray(value)) for (const child of value) keys(child);
      else if (value && typeof value === 'object') { if ('time' in value) times.add(value.time); for (const child of Object.values(value)) keys(child); }
    };
    keys(animation);
    let previous = 0;
    for (const time of [...times].sort((a, b) => a - b)) {
      if (!Number.isFinite(time) || time < 0 || time > animation.duration + 1e-6) throw new Error(`Key outside animation duration: ${animation.name}/${time}`);
      state.update(doc, time - previous);
      state.apply(doc, pose);
      checkPose(pose, `${animation.name}@${time}`);
      previous = time;
    }
    animations.push({ name: animation.name, duration: animation.duration, samples: times.size });
  }
  return { bones: doc.bones.length, slots: doc.slots.length, animations };
}

export async function readSource(skeletonFile, imagesDirectory) {
  const skeletonBytes = await fs.readFile(skeletonFile);
  const raw = JSON.parse(skeletonBytes.toString('utf8'));
  inspect(raw);
  const version = /^(3\.8|4\.2|4\.3)(?:\.|$)/.exec(raw.skeleton?.spine ?? '')?.[1];
  if (!version) throw new Error(`Unsupported or missing skeleton.spine: ${raw.skeleton?.spine}; expected 3.8, 4.2 or 4.3`);
  const { skeleton: doc, warnings } = readSkeletonJson(raw, path.basename(skeletonFile, '.json'));
  if (warnings.length) throw new Error(`Rigby format warnings:\n${warnings.join('\n')}`);
  const metrics = checkDocument(doc);
  const images = [];
  for (const name of usedImages(doc)) {
    let bytes;
    try { bytes = await fs.readFile(imageFile(imagesDirectory, name)); } catch (error) { throw new Error(`Missing PNG '${name}' in parts directory: ${error.message}`); }
    if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Not a readable PNG: ${name}`);
    images.push({ name, bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
  }
  return { raw, doc, version, images, metrics, skeletonBytes };
}
