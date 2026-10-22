import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSource } from '../scripts/validation.mjs';
import { loadConfig } from '../scripts/workbench.mjs';
import { encodePng } from '../vendor/rigby2d/src/mcp/png.js';
import { unzip } from '../vendor/rigby2d/src/editor/zip.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.ANIMATION_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const source = () => ({
  skeleton: { spine: '3.8.99' },
  bones: [{ name: 'root' }],
  slots: [{ name: 'surface', bone: 'root', attachment: 'surface' }],
  skins: { default: { surface: { surface: {
    type: 'mesh', path: 'nested/surface', width: 2, height: 2,
    uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], hull: 3,
    vertices: [1, 0, 0, 0, 1, 1, 0, 2, 0, 1, 1, 0, 0, 2, 1],
  } } } },
  animations: { move: { bones: { root: { translate: [{ time: 0, x: 0, y: 0, curve: [0.25, 0.1, 0.25, 1] }, { time: 1, x: 3, y: 1 }] } } } },
});
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'animation workbench test '));
  const parts = path.join(directory, 'parts');
  await fs.mkdir(path.join(parts, 'nested'), { recursive: true });
  const png = encodePng({ width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 120, 50, 80, 0]) });
  await fs.writeFile(path.join(parts, 'nested/surface.png'), png);
  const skeleton = path.join(directory, 'source.json');
  await fs.writeFile(skeleton, JSON.stringify(source()));
  const config = { name: 'test-surface', skeleton: 'source.json', parts: 'parts', output: 'exports' };
  await fs.writeFile(path.join(directory, 'workbench.json'), JSON.stringify(config));
  return { directory, parts, skeleton, config, png };
}
function run(args, cwd = root, env = {}) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/workbench.mjs'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, ANIMATION_PYTHON: python, ...env } });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

test('standard weighted mesh parses and finite poses sample at keys and 60 Hz', async () => {
  const f = await fixture();
  const data = await readSource(f.skeleton, f.parts);
  assert.equal(data.images[0].name, 'nested/surface');
  assert.deepEqual(data.metrics, { bones: 1, slots: 1, animations: [{ name: 'move', duration: 1, samples: 61 }] });
});

test('missing PNG, malformed curve, invalid weights and triangles fail explicitly', async () => {
  const f = await fixture();
  await assert.rejects(readSource(f.skeleton, path.join(f.directory, 'missing')), /Missing PNG/);
  const invalid = source();
  invalid.animations.move.bones.root.translate[0].curve = { interpolation: 'bezier' };
  await fs.writeFile(f.skeleton, JSON.stringify(invalid));
  await assert.rejects(readSource(f.skeleton, f.parts), /Invalid Spine curve/);
  const weights = source();
  weights.skins.default.surface.surface.vertices[4] = 0.7;
  await fs.writeFile(f.skeleton, JSON.stringify(weights));
  await assert.rejects(readSource(f.skeleton, f.parts), /weights sum/);
  const triangles = source();
  triangles.skins.default.surface.surface.triangles[2] = 3;
  await fs.writeFile(f.skeleton, JSON.stringify(triangles));
  await assert.rejects(readSource(f.skeleton, f.parts), /triangle references/);
});

test('build and validate preserve PNG bytes, package editable data and invoke project validation after packaging', async () => {
  const f = await fixture();
  f.config.validationScript = 'verify.mjs';
  await fs.writeFile(path.join(f.directory, 'workbench.json'), JSON.stringify(f.config));
  await fs.writeFile(path.join(f.directory, 'verify.mjs'), 'import fs from "node:fs/promises"; await fs.access("exports/test-surface.rigby"); await fs.access("exports/images/nested/surface.png"); await fs.writeFile("project-check.txt", "passed");');
  run(['build', f.directory, '--exchange']);
  const report = JSON.parse(await fs.readFile(path.join(f.directory, 'exports/validation.json')));
  assert.equal(report.status, 'passed');
  assert.equal(report.projectValidation, 'passed');
  assert.equal(report.checks.length, 4);
  assert.equal(await fs.readFile(path.join(f.directory, 'project-check.txt'), 'utf8'), 'passed');
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'exports/images/nested/surface.png')), Buffer.from(f.png));
  const first = await fs.readFile(path.join(f.directory, 'exports/test-surface.rigby'));
  const entries = unzip(first);
  assert.deepEqual(Buffer.from(entries.get('images/nested/surface.png')), Buffer.from(f.png));
  run(['build', f.directory, '--exchange']);
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'exports/test-surface.rigby')), first);
  run(['validate', path.join(f.directory, 'workbench.json')]);
});

test('a project validation failure fails the CLI and records the failure', async () => {
  const f = await fixture();
  f.config.validationScript = 'fail.mjs';
  await fs.writeFile(path.join(f.directory, 'workbench.json'), JSON.stringify(f.config));
  await fs.writeFile(path.join(f.directory, 'fail.mjs'), 'throw new Error("project-specific contact failure");');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/workbench.mjs'), 'build', f.directory], { encoding: 'utf8', env: { ...process.env, ANIMATION_PYTHON: python } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /project-specific contact failure/);
  const report = JSON.parse(await fs.readFile(path.join(f.directory, 'exports/validation.json')));
  assert.equal(report.status, 'failed');
});

test('validate rejects changed source, PNG or delivery bytes and later builds refresh existing exchange files', async () => {
  const f = await fixture();
  const failedValidation = () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/workbench.mjs'), 'validate', f.directory], { encoding: 'utf8', env: { ...process.env, ANIMATION_PYTHON: python } });
    assert.equal(result.status, 1);
    return result.stderr;
  };
  run(['build', f.directory, '--exchange']);
  const firstBinary = await fs.readFile(path.join(f.directory, 'exports/test-surface.skel'));
  const changed = source();
  changed.animations.move.bones.root.translate[1].x = 15;
  await fs.writeFile(f.skeleton, JSON.stringify(changed));
  assert.match(failedValidation(), /Build inputs changed/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory, 'exports/validation.json'))).status, 'failed');
  run(['build', f.directory]);
  assert.notDeepEqual(await fs.readFile(path.join(f.directory, 'exports/test-surface.skel')), firstBinary);
  const png = encodePng({ width: 2, height: 2, data: new Uint8Array(16).fill(255) });
  await fs.writeFile(path.join(f.parts, 'nested/surface.png'), png);
  assert.match(failedValidation(), /Build inputs changed/);
  run(['build', f.directory]);
  await fs.appendFile(path.join(f.directory, 'exports/test-surface.json'), '\n');
  assert.match(failedValidation(), /Built output changed/);
  await fs.writeFile(f.skeleton, '{');
  failedValidation();
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory, 'exports/validation.json'))).status, 'failed');
});

test('explicit extra source inputs are hashed and stale or missing inputs fail validation', async () => {
  const f = await fixture();
  f.config.inputs = ['actions.json', 'scripts/rig.mjs'];
  f.config.buildScript = 'build.mjs';
  await fs.mkdir(path.join(f.directory, 'scripts'));
  await fs.writeFile(path.join(f.directory, 'actions.json'), '{"open":1}');
  await fs.writeFile(path.join(f.directory, 'scripts/rig.mjs'), 'export const angle = 45;');
  await fs.writeFile(path.join(f.directory, 'build.mjs'), 'import fs from "node:fs/promises"; import { angle } from "./scripts/rig.mjs"; const data=JSON.parse(await fs.readFile("source.json", "utf8")); const actions=JSON.parse(await fs.readFile("actions.json", "utf8")); data.animations.move.bones.root.translate[1].x=actions.open*angle; await fs.writeFile("source.json", JSON.stringify(data));');
  await fs.writeFile(path.join(f.directory, 'workbench.json'), JSON.stringify(f.config));
  run(['build', f.directory]);
  const manifest = JSON.parse(await fs.readFile(path.join(f.directory, 'exports/build-manifest.json')));
  assert.match(manifest.inputs['actions.json'], /^[a-f0-9]{64}$/);
  assert.match(manifest.inputs['scripts/rig.mjs'], /^[a-f0-9]{64}$/);
  const failedValidation = () => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/workbench.mjs'), 'validate', f.directory], { encoding: 'utf8', env: { ...process.env, ANIMATION_PYTHON: python } });
    assert.equal(result.status, 1);
    return result.stderr;
  };
  await fs.writeFile(path.join(f.directory, 'actions.json'), '{"open":2}');
  assert.match(failedValidation(), /Build inputs changed/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.directory, 'exports/validation.json'))).status, 'failed');
  run(['build', f.directory]);
  run(['validate', f.directory]);
  const rebuilt = JSON.parse(await fs.readFile(path.join(f.directory, 'exports/test-surface.json')));
  assert.equal(rebuilt.animations.move.bones.root.translate[1].x, 90);
  await fs.rename(path.join(f.directory, 'scripts/rig.mjs'), path.join(f.directory, 'scripts/rig.saved.mjs'));
  assert.match(failedValidation(), /Cannot read inputs\[1\] 'scripts\/rig\.mjs'/);
});

test('extra source inputs must be an array of relative file paths', async () => {
  const f = await fixture();
  for (const inputs of ['actions.json', [null], [path.resolve(f.directory, 'actions.json')]]) {
    await fs.writeFile(path.join(f.directory, 'workbench.json'), JSON.stringify({ ...f.config, inputs }));
    await assert.rejects(loadConfig(f.directory), /inputs/);
  }
});

test('relative Python executable paths resolve from the CLI caller even when scripts run in another project', { skip: process.platform === 'win32' ? 'creating a Python symlink may require Windows administrator privileges' : false }, async () => {
  const f = await fixture();
  const location = spawnSync(python, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
  assert.equal(location.status, 0, location.stderr);
  const caller = await fs.mkdtemp(path.join(os.tmpdir(), 'animation CLI caller '));
  const pythonFolder = path.join(caller, 'python tools');
  await fs.mkdir(pythonFolder);
  await fs.symlink(location.stdout.trim(), path.join(pythonFolder, 'python'));
  f.config.buildScript = 'check-python.mjs';
  await fs.writeFile(path.join(f.directory, 'workbench.json'), JSON.stringify(f.config));
  await fs.writeFile(path.join(f.directory, 'check-python.mjs'), 'import path from "node:path"; import {spawnSync} from "node:child_process"; if(!path.isAbsolute(process.env.ANIMATION_PYTHON)) throw new Error("interpreter must be absolute"); const r=spawnSync(process.env.ANIMATION_PYTHON,["-c","from PIL import Image"],{encoding:"utf8"}); if(r.status!==0) throw new Error(r.stderr);');
  run(['build', f.directory, '--python', 'python tools/python'], caller);
  run(['validate', f.directory], caller, { ANIMATION_PYTHON: 'python tools/python' });
});
