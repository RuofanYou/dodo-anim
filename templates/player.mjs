import { readSkeletonJson, Pose, AnimationState, parseAtlas } from '/vendor/rigby2d/src/core/index.js';
import { WebGLRenderer } from '/vendor/rigby2d/src/webgl/renderer.js';
import { animationBounds } from '/vendor/rigby2d/src/editor/output.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#canvas');
const overlay = $('#overlay');
const context = overlay.getContext('2d');
let doc, pose, state, renderer, textures, bounds, camera, gl;
let elapsed = 0, duration = 0, last = null, playing = true;
async function get(url) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response; }
function resize() {
  const rectangle = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = overlay.width = Math.max(1, Math.round(rectangle.width * dpr));
  canvas.height = overlay.height = Math.max(1, Math.round(rectangle.height * dpr));
  if (bounds) camera = { x: (bounds[0] + bounds[2]) / 2, y: (bounds[1] + bounds[3]) / 2, zoom: Math.min(canvas.width / Math.max(1, bounds[2] - bounds[0]), canvas.height / Math.max(1, bounds[3] - bounds[1])) * 0.88 };
  else camera = { x: 0, y: 0, zoom: 1 };
}
function fit() {
  bounds = null;
  const indices = doc.animations.length ? doc.animations.map((_, index) => index) : [null];
  for (const index of indices) {
    const value = animationBounds(doc, index, 60);
    if (value) bounds = bounds ? [Math.min(bounds[0], value[0]), Math.min(bounds[1], value[1]), Math.max(bounds[2], value[2]), Math.max(bounds[3], value[3])] : value;
  }
  resize();
}
function select(time = 0) {
  const index = Number($('#animation').value);
  duration = index < 0 ? 0 : doc.animations[index].duration;
  pose = new Pose(doc);
  state = new AnimationState();
  elapsed = Math.max(0, Math.min(time, duration));
  if (index >= 0) {
    state.play(doc, doc.animations[index].name, false, 0);
    state.apply(doc, pose);
    let previous = 0;
    while (previous < elapsed) { const next = Math.min(elapsed, previous + 1 / 60); state.update(doc, next - previous); state.apply(doc, pose); previous = next; }
  }
  last = null;
  $('#seek').max = duration || 1;
}
function drawBones() {
  context.clearRect(0, 0, overlay.width, overlay.height);
  if (!$('#bones').checked) return;
  const project = ([x, y]) => [canvas.width / 2 + (x - camera.x) * camera.zoom, canvas.height / 2 - (y - camera.y) * camera.zoom];
  context.strokeStyle = '#ee8e3d'; context.fillStyle = '#fff8db'; context.lineWidth = 1.5 * (devicePixelRatio || 1);
  doc.bones.forEach((bone, index) => {
    const start = project(pose.world[index].apply([0, 0]));
    const end = project(pose.world[index].apply([bone.length, 0]));
    context.beginPath(); context.moveTo(...start); context.lineTo(...end); context.stroke();
    context.beginPath(); context.arc(...start, 2.5 * (devicePixelRatio || 1), 0, Math.PI * 2); context.fill(); context.stroke();
  });
}
function frame(timestamp) {
  if (last !== null && playing && duration > 0) {
    const dt = Math.min(0.1, (timestamp - last) / 1000) * Number($('#speed').value);
    if (elapsed + dt >= duration && $('#loop').checked) select((elapsed + dt) % duration);
    else { const step = Math.min(dt, duration - elapsed); elapsed += step; state.update(doc, step); state.apply(doc, pose); if (elapsed >= duration) playing = false; }
  }
  last = timestamp;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  renderer.begin(canvas.width, canvas.height, camera);
  renderer.drawSkeleton(doc, pose, textures); renderer.end(); drawBones();
  $('#seek').value = elapsed; $('#time').value = `${elapsed.toFixed(2)} / ${duration.toFixed(2)}s`; $('#play').textContent = playing ? '暂停' : '播放';
  requestAnimationFrame(frame);
}
try {
  const config = await (await get('/__workbench/project')).json();
  document.title = $('#title').textContent = config.name;
  $('#download').href = config.assets + encodeURIComponent(config.name) + '.rigby';
  const raw = await (await get(config.assets + encodeURIComponent(config.name) + '.json')).json();
  const loaded = readSkeletonJson(raw, config.name);
  if (loaded.warnings.length) throw new Error(loaded.warnings.join('; '));
  doc = loaded.skeleton;
  const atlas = parseAtlas(await (await get(config.assets + encodeURIComponent(config.name) + '.atlas')).text());
  const pages = {};
  await Promise.all(atlas.pages.map(async page => { pages[page.name] = await createImageBitmap(await (await get(config.assets + page.name.split('/').map(encodeURIComponent).join('/'))).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }));
  gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true }) || canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
  if (!gl) throw new Error('此浏览器没有可用 WebGL');
  renderer = new WebGLRenderer(gl); textures = renderer.atlasTextures(atlas, pages);
  $('#animation').add(new Option('设置姿态', '-1'));
  doc.animations.forEach((animation, index) => $('#animation').add(new Option(animation.name, String(index))));
  $('#animation').value = doc.animations.length ? '0' : '-1';
  $('#skin').add(new Option('default', ''));
  doc.skins.forEach(skin => $('#skin').add(new Option(skin.name, skin.name)));
  $('#animation').addEventListener('change', () => { select(); playing = true; });
  $('#skin').addEventListener('change', () => { doc.skin = $('#skin').value || null; select(elapsed); fit(); });
  $('#play').addEventListener('click', () => { playing = !playing; last = null; });
  $('#replay').addEventListener('click', () => { select(); playing = true; });
  $('#seek').addEventListener('input', () => { select(Number($('#seek').value)); playing = false; });
  $('#background').addEventListener('change', () => document.body.classList.toggle('dark', $('#background').value === 'dark'));
  window.addEventListener('resize', resize);
  select(); fit();
  $('#status').textContent = `${doc.bones.length} 骨骼 · ${doc.slots.length} 插槽 · 固定 Rigby2D 原生运行时`;
  document.body.dataset.ready = 'true';
  requestAnimationFrame(frame);
} catch (error) { $('#status').textContent = error.message; document.body.dataset.error = error.message; console.error(error); }
