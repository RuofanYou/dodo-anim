import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeSkeletonJson } from '../vendor/rigby2d/src/core/index.js';
import { writeSkeletonBinary } from '../vendor/rigby2d/src/core/binary.js';
import { zip } from '../vendor/rigby2d/src/editor/zip.js';
import { Workspace, createTools } from '../vendor/rigby2d/src/mcp/tools.js';
import { readSource, imageFile } from './validation.mjs';

const workbench = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pythonDefault = process.env.ANIMATION_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const usage = 'node scripts/workbench.mjs doctor|init|build|validate|preview [project directory or workbench.json] [--python PATH] [--exchange] [--port 3041]';
function argumentsOf(args) {
  const options = { python: pythonDefault, port: 3041, exchange: false };
  const positional = [];
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--exchange') options.exchange = true;
    else if (value === '--python' || value === '--port') {
      if (!args[index + 1]) throw new Error(`Missing value for ${value}`);
      options[value.slice(2)] = args[++index];
    } else if (value.startsWith('--')) throw new Error(`Unknown option ${value}`);
    else positional.push(value);
  }
  if (positional.length > 2) throw new Error(usage);
  if (/[\\/]/.test(options.python)) options.python = path.resolve(options.python);
  return { command: positional[0], target: positional[1] ?? '.', options };
}
function relativeFile(directory, value, field) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /^[a-z]:[\\/]/i.test(value)) throw new Error(`${field} must be a nonempty relative path`);
  return path.resolve(directory, value);
}
export async function loadConfig(target) {
  let filename = path.resolve(target);
  if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'workbench.json');
  const data = JSON.parse(await fs.readFile(filename, 'utf8'));
  const directory = path.dirname(filename);
  if (typeof data.name !== 'string' || !data.name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(data.name) || ['.', '..'].includes(data.name)) throw new Error('name must be a portable file name, without path separators');
  for (const field of ['skeleton', 'parts', 'output']) relativeFile(directory, data[field], field);
  for (const field of ['sourceImage', 'buildScript', 'validationScript']) if (data[field] !== undefined) relativeFile(directory, data[field], field);
  if (data.inputs !== undefined) {
    if (!Array.isArray(data.inputs)) throw new Error('inputs must be an array of relative file paths');
    data.inputs.forEach((file, index) => relativeFile(directory, file, `inputs[${index}]`));
  }
  if (relativeFile(directory, data.skeleton, 'skeleton') === path.join(relativeFile(directory, data.output, 'output'), `${data.name}.json`)) throw new Error('skeleton source and output JSON must be different files');
  return { ...data, directory, filename };
}
function execute(program, args, config, options, input) {
  const result = spawnSync(program, args, { cwd: config?.directory ?? workbench, encoding: 'utf8', input, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ANIMATION_PROJECT_DIR: config?.directory ?? '', ANIMATION_WORKBENCH_DIR: workbench, ANIMATION_PYTHON: options.python } });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  if (result.stdout.trim()) process.stdout.write(result.stdout);
}
function projectScript(config, field, options) {
  if (!config[field]) return;
  const script = relativeFile(config.directory, config[field], field);
  const extension = path.extname(script).toLowerCase();
  if (!['.mjs', '.js', '.py'].includes(extension)) throw new Error(`${field}: use a local .mjs, .js or .py script`);
  execute(extension === '.py' ? options.python : process.execPath, [script], config, options);
}
const outputOf = config => relativeFile(config.directory, config.output, 'output');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const portablePath = value => value.split(path.sep).join('/');
async function inputHashes(config, source) {
  const record = {};
  const add = (file, bytes) => { record[portablePath(path.relative(config.directory, file))] = sha256(bytes); };
  add(config.filename, await fs.readFile(config.filename));
  add(relativeFile(config.directory, config.skeleton, 'skeleton'), source.skeletonBytes);
  for (const image of source.images) add(imageFile(relativeFile(config.directory, config.parts, 'parts'), image.name), image.bytes);
  if (config.sourceImage) {
    const file = relativeFile(config.directory, config.sourceImage, 'sourceImage');
    add(file, await fs.readFile(file));
  }
  if (config.buildScript) {
    const file = relativeFile(config.directory, config.buildScript, 'buildScript');
    add(file, await fs.readFile(file));
  }
  for (const [index, value] of (config.inputs ?? []).entries()) {
    const file = relativeFile(config.directory, value, `inputs[${index}]`);
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch (error) { throw new Error(`Cannot read inputs[${index}] '${value}': ${error.message}`); }
    add(file, bytes);
  }
  return record;
}
async function verifyBuild(config, source) {
  const output = outputOf(config);
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(output, 'build-manifest.json'), 'utf8')); }
  catch { throw new Error('Build manifest is missing or unreadable; run build before validate'); }
  const inputs = await inputHashes(config, source);
  if (manifest.name !== config.name || manifest.runtimeCommit !== '6069ae2ef8cfbb622053a84e7ccd4acc74c06415' || Object.keys(inputs).length !== Object.keys(manifest.inputs ?? {}).length || Object.entries(inputs).some(([file, hash]) => manifest.inputs[file] !== hash)) throw new Error('Build inputs changed; run build before validate');
  for (const extension of ['json', 'rigby', 'atlas', 'png']) if (!manifest.outputs?.[`${config.name}.${extension}`]) throw new Error(`Build manifest is missing ${config.name}.${extension}; run build`);
  for (const [file, hash] of Object.entries(manifest.outputs ?? {})) {
    let bytes;
    try { bytes = await fs.readFile(inside(output, file)); } catch { throw new Error(`Built output is missing: ${file}; run build`); }
    if (sha256(bytes) !== hash) throw new Error(`Built output changed: ${file}; run build before validate`);
  }
  for (const extension of ['4.3.json', 'skel']) if (await fs.stat(path.join(output, `${config.name}.${extension}`)).catch(() => null)) {
    if (!manifest.outputs[`${config.name}.${extension}`]) throw new Error(`Untracked exchange output ${config.name}.${extension}; run build --exchange`);
  }
  return manifest;
}
async function validate(config, options, source) {
  const output = outputOf(config);
  const reportPath = path.join(output, 'validation.json');
  const report = { status: 'failed', scope: 'Fixed Rigby2D parsing, roundtrip and sampled finite checks; no aesthetic, official Spine runtime, C++ or target-device certification', runtimeCommit: '6069ae2ef8cfbb622053a84e7ccd4acc74c06415', checks: [], projectValidation: config.validationScript ? 'pending' : 'not configured' };
  try {
    source ??= await readSource(relativeFile(config.directory, config.skeleton, 'skeleton'), relativeFile(config.directory, config.parts, 'parts'));
    report.metrics = source.metrics;
    await verifyBuild(config, source);
    const tools = createTools(await Workspace.open([config.directory]));
    const validator = tools.find(tool => tool.name === 'validate_project').handler;
    for (const extension of ['json', 'rigby', '4.3.json', 'skel']) {
      const file = path.join(output, `${config.name}.${extension}`);
      if (extension === 'json' || extension === 'rigby') await fs.access(file);
      else if (!(await fs.stat(file).catch(() => null))) continue;
      const check = await validator({ path: file });
      check.file = path.relative(config.directory, file).replaceAll(path.sep, '/');
      report.checks.push(check);
      const dataWarnings = check.warnings.filter(warning => !warning.startsWith('Binary .skel export is not possible:'));
      if (!check.valid || check.checks.jsonRoundTrip !== 'ok' || dataWarnings.length) throw new Error(`Rigby validation failed: ${JSON.stringify(check)}`);
    }
    projectScript(config, 'validationScript', options);
    report.projectValidation = config.validationScript ? 'passed' : 'not configured';
    report.inputSha256 = sha256(source.skeletonBytes);
    report.status = 'passed';
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
async function build(config, options) {
  projectScript(config, 'buildScript', options);
  if (config.sourceImage) await fs.access(relativeFile(config.directory, config.sourceImage, 'sourceImage'));
  const source = await readSource(relativeFile(config.directory, config.skeleton, 'skeleton'), relativeFile(config.directory, config.parts, 'parts'));
  const inputs = await inputHashes(config, source);
  source.doc.header.images = './images/';
  const exported = writeSkeletonJson(source.doc, { version: source.version });
  if (exported.warnings.length) throw new Error(exported.warnings.join('\n'));
  exported.json.skeleton.images = './images/';
  let exchange;
  const output = outputOf(config);
  const refreshExchange = options.exchange || Boolean(await fs.stat(path.join(output, `${config.name}.4.3.json`)).catch(() => null)) || Boolean(await fs.stat(path.join(output, `${config.name}.skel`)).catch(() => null));
  if (refreshExchange) {
    const result = writeSkeletonJson(source.doc, { version: '4.3', binary: true });
    if (result.warnings.length) throw new Error(result.warnings.join('\n'));
    exchange = { binary: writeSkeletonBinary(result.json), json: writeSkeletonJson(source.doc, { version: '4.3' }).json };
  }
  const entries = [];
  for (const image of source.images) {
    const file = imageFile(path.join(output, 'images'), image.name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, image.bytes);
    entries.push({ path: `images/${image.name}.png`, bytes: image.bytes });
  }
  source.doc.images = source.images.map(({ name, width, height }) => ({ name, width, height, path: `images/${name}.png` }));
  source.doc.workspace = 'game';
  entries.unshift({ path: 'project.json', bytes: new TextEncoder().encode(source.doc.toJson()) });
  await fs.mkdir(output, { recursive: true });
  const base = path.join(output, config.name);
  await fs.writeFile(`${base}.json`, JSON.stringify(exported.json, null, 2) + '\n');
  await fs.writeFile(`${base}.rigby`, zip(entries, new Date('2026-10-21T00:00:00Z')));
  const pack = { outputBase: path.relative(config.directory, base), images: source.images.map(({ name }) => ({ name, file: path.relative(config.directory, imageFile(relativeFile(config.directory, config.parts, 'parts'), name)) })) };
  execute(options.python, [path.join(workbench, 'scripts/pack_atlas.py'), '-'], config, options, JSON.stringify(pack));
  if (exchange) {
    await fs.writeFile(`${base}.4.3.json`, JSON.stringify(exchange.json, null, 2) + '\n');
    await fs.writeFile(`${base}.skel`, exchange.binary);
  }
  const artifacts = [`${config.name}.json`, `${config.name}.rigby`, `${config.name}.atlas`, `${config.name}.png`, ...source.images.map(image => `images/${image.name}.png`), ...(exchange ? [`${config.name}.4.3.json`, `${config.name}.skel`] : [])];
  const hashes = {};
  for (const file of artifacts) hashes[file] = sha256(await fs.readFile(inside(output, file)));
  await fs.writeFile(path.join(output, 'build-manifest.json'), JSON.stringify({ name: config.name, runtimeCommit: '6069ae2ef8cfbb622053a84e7ccd4acc74c06415', inputs, outputs: hashes }, null, 2) + '\n');
  const report = await validate(config, options, source);
  console.log(JSON.stringify({ status: report.status, output: config.output, exchange: Boolean(exchange) }));
}
function inside(root, relative) {
  const filename = path.resolve(root, relative);
  if (path.relative(root, filename).startsWith('..')) throw new Error('Path is outside the served directory');
  return filename;
}
async function preview(config, options) {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be 1..65535');
  const output = outputOf(config);
  await fs.access(path.join(output, `${config.name}.json`));
  const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.atlas': 'text/plain', '.rigby': 'application/zip', '.mp4': 'video/mp4' };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/__workbench/project') { response.setHeader('Content-Type', types['.json']); response.end(JSON.stringify({ name: config.name, assets: '/assets/' })); return; }
      let file;
      if (pathname === '/') file = path.join(workbench, 'templates/preview.html');
      else if (pathname === '/__workbench/player.mjs') file = path.join(workbench, 'templates/player.mjs');
      else if (pathname.startsWith('/assets/')) file = inside(output, pathname.slice(8));
      else if (pathname.startsWith('/project/')) file = inside(config.directory, pathname.slice(9));
      else if (pathname.startsWith('/vendor/')) file = inside(path.join(workbench, 'vendor'), pathname.slice(8));
      else if (pathname.startsWith('/examples/')) file = inside(path.join(workbench, 'examples'), pathname.slice(10));
      else { response.writeHead(404); response.end('Not found'); return; }
      response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.end(await fs.readFile(file));
    } catch (error) { response.writeHead(404); response.end(error.message); }
  });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/`));
}
export async function main(args = process.argv.slice(2)) {
  const { command, target, options } = argumentsOf(args);
  if (command === 'doctor') {
    console.log(`Node ${process.version}; Rigby2D 6069ae2`);
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node 20 or newer is required');
    execute(options.python, ['-c', 'import sys,json,numpy; from PIL import Image; assert sys.version_info >= (3,10), "Python 3.10 or newer is required"; print(json.dumps({"python":sys.version.split()[0],"pillow":Image.__version__,"numpy":numpy.__version__}))'], null, options);
  } else if (command === 'init') {
    const directory = path.resolve(target);
    await fs.mkdir(directory, { recursive: true });
    const template = JSON.parse(await fs.readFile(path.join(workbench, 'templates/workbench.json'), 'utf8'));
    await fs.writeFile(path.join(directory, 'workbench.json'), JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created ${path.join(directory, 'workbench.json')}; supply the referenced artwork and standard Spine JSON.`);
  } else if (['build', 'validate', 'preview'].includes(command)) {
    const config = await loadConfig(target);
    if (command === 'build') await build(config, options);
    else if (command === 'preview') await preview(config, options);
    else {
      const report = await validate(config, options);
      console.log(JSON.stringify({ status: report.status, output: config.output }));
    }
  } else throw new Error(usage);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`workbench: ${error.message}`); process.exitCode = 1; });
