import {readSkeletonJson, Pose, AnimationState} from '/vendor/rigby2d/src/core/index.js';
import {WebGLRenderer} from '/vendor/rigby2d/src/webgl/renderer.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#canvas');
const gl = canvas.getContext('webgl', {alpha: false});
const views = {};
let doc, pose, state, renderer, textures, viewport;
let duration = 1.5, elapsed = 0, playing = true, last = null;
async function get(url) {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  return response;
}
function select(time = 0) {
  const animation = doc.animations.find(item => item.name === $('#animation').value);
  duration = animation.duration;
  elapsed = Math.max(0, Math.min(time, duration));
  pose = new Pose(doc);
  state = new AnimationState();
  state.play(doc, animation.name, false, 0);
  state.update(doc, elapsed);
  state.apply(doc, pose);
  viewport = views[animation.name] || views.effect;
  $('#seek').max = duration;
  last = null;
}
function draw(now) {
  if (last !== null && playing) {
    const dt = Math.min(.1, (now - last) / 1000);
    if (elapsed + dt >= duration && $('#loop').checked) select((elapsed + dt) % duration);
    else {
      const step = Math.min(dt, duration - elapsed);
      elapsed += step;
      state.update(doc, step);
      state.apply(doc, pose);
      if (elapsed >= duration) playing = false;
    }
  }
  last = now;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  const v = viewport;
  const camera = {x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2,
    zoom: Math.min(canvas.width / (v.maxX - v.minX), canvas.height / (v.maxY - v.minY)) / 1.06};
  gl.viewport(0, 0, canvas.width, canvas.height);
  const background = $('#background').value === 'dark' ? [16,24,35] : [246,242,233];
  gl.clearColor(...background.map(value => value / 255), 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  renderer.begin(canvas.width, canvas.height, camera);
  renderer.drawSkeleton(doc, pose, textures);
  renderer.end();
  $('#seek').value = elapsed;
  $('#time').value = `${elapsed.toFixed(2)} / ${duration.toFixed(2)}s`;
  $('#play').textContent = playing ? '暂停' : '播放';
  requestAnimationFrame(draw);
}
async function load() {
  if (!gl) throw Error('此浏览器没有可用 WebGL');
  const raw = await (await get('/project/source/native-fire.json')).json();
  const loaded = readSkeletonJson(raw, 'original-fire');
  if (loaded.warnings.length) throw Error(loaded.warnings.join('; '));
  doc = loaded.skeleton;
  const images = {};
  await Promise.all(['fire_1','fire_2','fire_3','fire_4','gole'].map(async name => {
    images[name] = await createImageBitmap(await (await get(`/project/assets/parts/native/${name}.png`)).blob(),
      {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
  }));
  renderer = new WebGLRenderer(gl);
  textures = renderer.imageTextures(images);
  Object.assign(views, await (await get('./source-viewports.json')).json());
  const labels = {effect:'完整喷火 effect', ing:'持续喷射 ing', end:'收束消散 end', animation:'原试动作 animation', animation2:'原试动作 animation2'};
  for (const name of ['effect','ing','end','animation','animation2']) $('#animation').add(new Option(labels[name],name));
  $('#animation').onchange = () => {select(); playing = true;};
  $('#replay').onclick = () => {select(); playing = true;};
  $('#play').onclick = () => {playing = !playing; last = null;};
  $('#seek').oninput = () => {select(Number($('#seek').value)); playing = false;};
  $('#background').onchange = () => document.body.classList.toggle('dark', $('#background').value === 'dark');
  select();
  $('#status').textContent = `${doc.bones.length} 骨骼 · ${doc.slots.length} 插槽 · Rigby2D / 原图 / 原动作`;
  document.body.dataset.ready = 'true';
  requestAnimationFrame(draw);
}
load().catch(error => {$('#status').textContent = String(error); document.body.dataset.error = String(error); console.error(error);});
