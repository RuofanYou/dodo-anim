import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rigc = new URL('../../../validation/spine-consumer/node_modules/rig-c/', import.meta.url);
const {readPlate, Plate} = await import(new URL('tools/plate.ts', rigc).href);
const {rasterisePiece, projector} = await import(new URL('src/render_shared.ts', rigc).href);
const args = process.argv.slice(2);
let ffmpeg = 'ffmpeg';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ffmpeg' && args[i + 1]) ffmpeg = args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}

const sourcePath = path.join(project, 'build/deathwing-native-fire-source.json');
const atlasPath = path.join(project, 'exports/deathwing-native-fire.atlas');
const runtimePath = path.join(project, 'source/spine-webgl-3.8.js');
const specPath = path.join(project, 'source/rig_spec.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const width = 1920, height = 1080, fps = 60, duration = spec.duration;
const frameCount = Math.round(duration * fps);
if (duration !== 6 || frameCount !== 360) throw new Error(`Expected 6 seconds / 360 frames; got ${duration} / ${frameCount}`);
const stage = spec.presentationStage;
const scale = Math.min(width * 0.92 / stage.width, height * 0.92 / stage.height);
const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
const viewport = {
  minX: cx - width / scale / 2, maxX: cx + width / scale / 2,
  minY: cy - height / scale / 2, maxY: cy + height / scale / 2,
  width, height, scale,
};
const projectPoint = projector(viewport);
const background = [245, 242, 233, 255];
const scope = {console, Math, Float32Array, Uint16Array, Uint32Array, Int16Array, ArrayBuffer, Date};
vm.createContext(scope);
vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), scope);
const sp = scope.spine;
const pagePaths = new Map<string, string>();
const atlas = new sp.TextureAtlas(fs.readFileSync(atlasPath, 'utf8'), (name) => {
  const pagePath = path.join(project, 'exports', name);
  const bytes = fs.readFileSync(pagePath);
  pagePaths.set(name, pagePath);
  const image = {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
  return {getImage: () => image, setFilters() {}, setWraps() {}, dispose() {}};
});
const data = new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(source);
const pages = new Map([...pagePaths].map(([name, pagePath]) => [name, readPlate(pagePath)]));
const output = path.join(project, 'exports/deathwing-native-fire.mp4');
const poster = path.join(project, 'evidence/mp4-poster.png');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.mkdirSync(path.dirname(poster), {recursive: true});
const encoder = spawn(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`,
  '-framerate', String(fps), '-i', 'pipe:0', '-an',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', output,
], {stdio: ['pipe', 'ignore', 'pipe']});
let encoderError = '';
encoder.stderr.on('data', (part) => { encoderError += part.toString(); });
const encoded = once(encoder, 'close');
encoder.stdin.on('error', () => {});
const started = Date.now();
for (let index = 0; index < frameCount; index++) {
  const time = index / fps;
  const skeleton = new sp.Skeleton(data);
  const state = new sp.AnimationState(new sp.AnimationStateData(data));
  state.setAnimation(0, 'breathe_fire', false);
  state.update(time);
  state.apply(skeleton);
  skeleton.updateWorldTransform();
  const plate = new Plate(width, height);
  for (let offset = 0; offset < plate.data.length; offset += 4) plate.data.set(background, offset);
  for (const slot of skeleton.drawOrder) {
    const attachment = slot.getAttachment();
    if (!attachment || !slot.bone.active) continue;
    let kind, world, triangles;
    if (attachment instanceof sp.RegionAttachment) {
      kind = 'region';
      world = new Array(8).fill(0);
      attachment.computeWorldVertices(slot.bone, world, 0, 2);
    } else if (attachment instanceof sp.MeshAttachment) {
      kind = 'mesh';
      world = new Array(attachment.worldVerticesLength).fill(0);
      attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, world, 0, 2);
      triangles = Array.from(attachment.triangles);
    } else throw new Error(`Unsupported attachment: ${attachment.name}`);
    const tint = [
      skeleton.color.r * slot.color.r * attachment.color.r,
      skeleton.color.g * slot.color.g * attachment.color.g,
      skeleton.color.b * slot.color.b * attachment.color.b,
      skeleton.color.a * slot.color.a * attachment.color.a,
    ];
    if (tint[3] <= 0) continue;
    const blend = slot.data.blendMode;
    if (blend !== 0 && blend !== 1) throw new Error(`Unsupported blend: ${blend}`);
    const piece = {kind, world, uvs: Array.from(attachment.uvs), triangles, tint, slot: slot.data.name, page: attachment.region.page.name};
    rasterisePiece(pages.get(piece.page), piece, projectPoint, plate, (x, y, r, g, b, a) => {
      if (blend === 0) plate.blend(x, y, [r, g, b, a]);
      else {
        const old = plate.get(x, y);
        plate.set(x, y, [Math.min(255, old[0] + r * a / 255), Math.min(255, old[1] + g * a / 255), Math.min(255, old[2] + b * a / 255), 255]);
      }
    });
  }
  if (index === Math.round(2.6 * fps)) plate.writePng(poster);
  if (!encoder.stdin.write(plate.data)) await once(encoder.stdin, 'drain');
  if ((index + 1) % 60 === 0) console.log(JSON.stringify({frames: index + 1, total: frameCount, seconds: (Date.now() - started) / 1000}));
}
encoder.stdin.end();
const [exitCode] = await encoded;
if (exitCode !== 0) throw new Error(`ffmpeg failed (${exitCode}): ${encoderError}`);
const sha256 = (input) => crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
const inputs = [sourcePath, atlasPath, runtimePath, specPath, ...pagePaths.values()].map((input) => ({path: path.relative(project, input), sha256: sha256(input)}));
const report = {
  output: path.relative(project, output), outputSha256: sha256(output), poster: path.relative(project, poster),
  width, height, fps, duration, frames: frameCount, firstSample: 0, lastSample: (frameCount - 1) / fps,
  animation: 'breathe_fire', runtime: 'official spine-ts 3.8',
  renderer: 'rig-c rasterisePiece with source-over normal and source-alpha additive over opaque background',
  background, stage, viewport, margin: 'fit stage inside central 92% of frame dimensions',
  encoding: {codec: 'libx264', preset: 'medium', crf: 18, pixelFormat: 'yuv420p', faststart: true, audio: false},
  inputs, elapsedSeconds: (Date.now() - started) / 1000,
};
fs.writeFileSync(path.join(project, 'evidence/mp4-export.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output, poster, frames: frameCount, elapsedSeconds: report.elapsedSeconds}));
