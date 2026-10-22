#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readSkeletonJson, Pose } from '../../../vendor/rigby2d/src/core/index.js';
import { decodePng } from '../../../vendor/rigby2d/src/mcp/png.js';
import { QuadSampler, interpolate, checkSamplingMath } from './neck_coverage_sampling.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['head', 'cape_collar', 'body', 'neck_bridge', 'cape_tail'];
const fps = 60, step = 2, threshold = .98;
const bounds = { xMin: 590, xMax: 865, yMin: 560, yMax: 690 };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
checkSamplingMath();
if (process.argv.includes('--self-check')) {
  console.log('Triangle and GPU texel-centre alpha sampling checks passed.');
  process.exit(0);
}

const inputs = new Map();
async function read(relative) {
  const bytes = await fs.readFile(path.join(root, relative));
  inputs.set(relative, digest(bytes));
  return bytes;
}
const manifest = JSON.parse(await read('source/parts.json'));
const spec = JSON.parse(await read('source/rig_spec.json'));
await read('source/actions.json');
const data = JSON.parse(await read('exports/bean-wizard.json'));
const { skeleton, warnings } = readSkeletonJson(data, 'neck-coverage-verification');
if (warnings.length) throw new Error(`Rigby parser warnings: ${warnings.join('; ')}`);
const parts = new Map(manifest.parts.map(part => [part.id, part]));
const images = new Map();
for (const name of names) if (!parts.has(name)) throw new Error(`Required coverage surface is missing: ${name}`);
for (const [name, part] of parts) {
  if (!part) throw new Error(`Required coverage surface is missing: ${name}`);
  const exported = await read(`exports/images/${name}.png`);
  const source = await read(part.file);
  if (digest(exported) !== digest(source)) throw new Error(`Rebuild required: exported/source PNG bytes differ for ${name}`);
  const image = decodePng(exported);
  if (image.width !== part.width || image.height !== part.height) throw new Error(`PNG/parts.json dimensions differ for ${name}`);
  images.set(name, image);
}
const original = decodePng(await read('source/approved-cutout.png'));
const scripts = ['scripts/verify_neck_coverage.mjs', 'scripts/neck_coverage_sampling.mjs'];
for (const file of scripts) await read(file);

const pose = new Pose(skeleton);
const rest = new Map(pose.quads(skeleton).filter(quad => names.includes(quad.image)).map(quad => [quad.image, quad]));
for (const name of names) {
  const quad = rest.get(name), part = parts.get(name);
  if (!quad) throw new Error(`Surface is not drawn at setup pose: ${name}`);
  for (let i = 0; i < quad.positions.length; i++) {
    const expected = [part.x + quad.uvs[i][0] * part.width - spec.origin[0], spec.origin[1] - part.y - quad.uvs[i][1] * part.height];
    if (Math.hypot(...quad.positions[i].map((value, axis) => value - expected[axis])) > .001) throw new Error(`Rebuild required: setup PNG/mesh registration differs for ${name}`);
  }
}

const bridge = rest.get('neck_bridge'), bridgePart = parts.get('neck_bridge');
const sourceBridge = { ...bridge, positions: bridge.uvs.map(([u, v]) => [bridgePart.x + u * bridgePart.width, bridgePart.y + v * bridgePart.height]) };
const sourceSampler = new QuadSampler(sourceBridge, images.get('neck_bridge'));
const probes = [];
const excluded = [];
let outsideSource = 0, edgeInset = 0;
function rawAlpha(name, x, y) {
  const part = parts.get(name), image = images.get(name);
  const px = x - part.x, py = y - part.y;
  if (px < 0 || py < 0 || px >= part.width || py >= part.height) return 0;
  return image.data[(py * part.width + px) * 4 + 3] / 255;
}
function restMaterialAlpha(x, y, ids = names) {
  let value = 0;
  for (const name of ids) { const a = rawAlpha(name, x, y); value = a + value * (1 - a); }
  return value;
}
for (let y = bounds.yMin; y <= bounds.yMax; y += step) for (let x = bounds.xMin; x <= bounds.xMax; x += step) {
  if (original.data[(y * original.width + x) * 4 + 3] !== 255) { outsideSource++; continue; }
  if (restMaterialAlpha(x, y) < threshold) {
    const owners = [...parts.keys()].filter(name => !names.includes(name) && rawAlpha(name, x, y) > 0);
    if (restMaterialAlpha(x, y, [...parts.keys()]) < threshold) throw new Error(`Rest artwork itself has an uncovered interior pixel at ${x},${y}`);
    excluded.push({ sourcePixel: [x, y], reason: 'This source pixel belongs to other artwork, outside the five connection surfaces', otherSurfaces: owners });
    continue;
  }
  let interior = true;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (original.data[((y + dy) * original.width + x + dx) * 4 + 3] !== 255 || restMaterialAlpha(x + dx, y + dy) < threshold) interior = false;
  }
  if (!interior) { edgeInset++; continue; }
  // The integer phase tests halfway between texel centres, where separately
  // filtered, abutting alpha masks can reveal a seam even if their vertices agree.
  for (const phase of [.5, 0]) {
    const source = [x + phase, y + phase];
    const location = sourceSampler.locate(source);
    if (!location) throw new Error(`Canonical bridge mesh does not span source probe ${source}`);
    probes.push({ source, phase, ...location });
  }
}
if (probes.length < 1000) throw new Error(`Insufficient opaque interior probes: ${probes.length}`);

const expectedCounts = { fly: 241, charge: 169, cast: 133 };
const report = {
  schema: 'bean-wizard-neck-coverage/1',
  status: 'running',
  method: 'Rigby Pose mesh triangles; deformed canonical source probes; inverse triangle UV lookup; bilinear PNG alpha; five independent surfaces composed source-over',
  surfaces: names,
  canonical_mapping_surface: 'neck_bridge geometry, regardless of whether its PNG alpha is opaque',
  coverage_region: bounds,
  source_probe_pixel_step: step,
  source_probe_phases: [[.5, .5], [0, 0]],
  source_probe_filter: 'Approved-cutout alpha=255, source pixel belongs to the five surfaces; 1px inset only along their external boundary. All boundaries between these five surfaces remain included.',
  excluded_other_surface_pixels: excluded,
  excluded_other_surface_pixel_count: excluded.length,
  excluded_external_edge_inset_pixel_count: edgeInset,
  excluded_original_transparent_pixel_count: outsideSource,
  probe_count_per_frame: probes.length,
  fps,
  minimum_required_alpha: threshold,
  frame_count: 0,
  tested_point_count: 0,
  below_threshold_point_count: 0,
  frames_below_threshold: 0,
  minimum_alpha: 1,
  worst: null,
  actions: [],
  frame_results: [],
  failures: [],
  scope: 'Interior connection-band coverage of exported Rigby meshes and part PNGs at 60 Hz; excludes colour continuity, outer silhouette, atlas filtering, browser rasterization, transition mixing, and native C++ playback.'
};

function sampleCoverage(samplers, point) {
  let alpha = 0;
  const surfaces = {};
  for (const name of names) {
    const value = samplers.get(name).sample(point);
    surfaces[name] = value;
    alpha = value + alpha * (1 - value);
  }
  return { alpha, surfaces };
}

for (const action of ['fly', 'charge', 'cast']) {
  const animation = skeleton.animations.find(candidate => candidate.name === action);
  if (!animation) throw new Error(`Missing animation ${action}`);
  const lastFrame = Math.round(animation.duration * fps);
  const count = lastFrame + 1;
  if (Math.abs(lastFrame / fps - animation.duration) > 1e-6 || count !== expectedCounts[action]) throw new Error(`Unexpected frame contract ${action}: ${animation.duration}s / ${count} frames`);
  const summary = { name: action, duration: animation.duration, frames: count, minimum_alpha: 1, frames_below_threshold: 0, below_threshold_points: 0, worst: null };
  for (let frame = 0; frame <= lastFrame; frame++) {
    const time = frame / fps;
    pose.reset(skeleton);
    pose.apply(skeleton, animation, time, 1);
    pose.updateWorld(skeleton);
    const quads = new Map(pose.quads(skeleton).filter(quad => names.includes(quad.image)).map(quad => [quad.image, quad]));
    const samplers = new Map(names.map(name => {
      const quad = quads.get(name);
      if (!quad) throw new Error(`${action}@${time}: surface disappeared: ${name}`);
      return [name, new QuadSampler(quad, images.get(name))];
    }));
    const canonical = quads.get('neck_bridge');
    let minimum = 1, failures = 0, worst = null;
    for (const probe of probes) {
      const point = interpolate(canonical.positions, probe.indices, probe.weights);
      const coverage = sampleCoverage(samplers, point);
      if (!Number.isFinite(coverage.alpha)) throw new Error(`Non-finite alpha ${action}@${time}`);
      if (coverage.alpha < minimum) {
        minimum = coverage.alpha;
        worst = { action, frame, time, source: probe.source, runtime: point, alpha: coverage.alpha, surfaces: coverage.surfaces };
      }
      if (coverage.alpha + 1e-9 < threshold) {
        failures++;
        if (report.failures.length < 100) report.failures.push({ action, frame, time, source: probe.source, runtime: point, alpha: coverage.alpha, surfaces: coverage.surfaces });
      }
    }
    report.frame_count++;
    report.tested_point_count += probes.length;
    report.below_threshold_point_count += failures;
    if (failures) { report.frames_below_threshold++; summary.frames_below_threshold++; }
    summary.below_threshold_points += failures;
    if (minimum < summary.minimum_alpha) { summary.minimum_alpha = minimum; summary.worst = worst; }
    if (minimum < report.minimum_alpha) { report.minimum_alpha = minimum; report.worst = worst; }
    report.frame_results.push({ action, frame, time, minimum_alpha: minimum, below_threshold_points: failures });
  }
  report.actions.push(summary);
  console.log(`${action}: ${count} frames × ${probes.length} probes, minimum alpha ${summary.minimum_alpha.toFixed(8)}, failing frames ${summary.frames_below_threshold}`);
}

report.inputs = Object.fromEntries(inputs);
report.input_snapshot_unchanged = true;
for (const [file, hash] of inputs) if (digest(await fs.readFile(path.join(root, file))) !== hash) report.input_snapshot_unchanged = false;
if (report.frame_count !== 543) throw new Error(`Expected 543 frames, sampled ${report.frame_count}`);
report.status = !report.input_snapshot_unchanged ? 'invalid-input-changed-during-run' : report.below_threshold_point_count ? 'failed' : 'passed';
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
const output = path.join(root, 'evidence/neck-coverage-verification.json');
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, frames: report.frame_count, probes_per_frame: probes.length, point_samples: report.tested_point_count, minimum_alpha: report.minimum_alpha, frames_below_threshold: report.frames_below_threshold, report: output }));
if (report.status !== 'passed') process.exitCode = 1;
