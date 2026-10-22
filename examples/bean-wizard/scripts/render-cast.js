import { Skeleton } from '../../../vendor/rigby2d/src/core/index.js';
import { unzip } from '../../../vendor/rigby2d/src/editor/zip.js';
import { renderJob } from '../../../vendor/rigby2d/src/editor/render/offline.js';

const status = document.querySelector('#status');
const button = document.querySelector('#render');
function shiftKeys(value, offset) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.time === 'number') value.time += offset;
  for (const child of Object.values(value)) if (child && typeof child === 'object') shiftKeys(child, offset);
}
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    status.textContent = '加载最终源文件…';
    const response = await fetch('../exports/bean-wizard.rigby', { cache: 'no-store' });
    if (!response.ok) throw new Error(`源文件 HTTP ${response.status}`);
    const files = unzip(new Uint8Array(await response.arrayBuffer()));
    const project = files.get('project.json');
    if (!project) throw new Error('源文件缺少 project.json');
    const doc = Skeleton.fromJson(new TextDecoder().decode(project));
    const images = new Map();
    await Promise.all([...files].filter(([name]) => name.startsWith('images/') && name.endsWith('.png')).map(async ([name, bytes]) => {
      images.set(name.slice(7, -4), await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
    }));
    const cast = doc.animations.find(animation => animation.name === 'cast');
    if (!cast || Math.abs(cast.duration - 2.2) > 0.001) throw new Error(`施法动作时长与导出契约不符：${cast?.duration}`);
    const share = structuredClone(cast);
    share.name = 'cast-share';
    shiftKeys(share, 0.4);
    share.duration = 3;
    doc.animations.push(share);
    const settings = { ...doc.settings, width: 1080, height: 1080, fps: 30, background: [248 / 255, 244 / 255, 233 / 255, 1], frame: null };
    const result = await renderJob(doc, images, { animation: doc.animations.length - 1, skin: null, settings, start: 0, end: 89, format: 'mp4', quality: 'high', name: 'bean-wizard-cast-native' }, (done, total) => {
      status.textContent = `原生离线渲染 ${done} / ${total} 帧`;
      return true;
    });
    const video = result?.find(file => file.name.endsWith('.mp4'));
    if (!video) throw new Error('渲染没有返回 MP4');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([video.bytes], { type: 'video/mp4' }));
    link.download = video.name;
    link.textContent = '下载原生 MP4';
    document.body.append(link);
    link.click();
    status.textContent = `导出完成：${video.name}，${video.bytes.length} 字节，90 帧 / 3 秒。`;
    document.body.dataset.complete = 'true';
    document.body.dataset.bones = String(doc.bones.length);
    document.body.dataset.slots = String(doc.slots.length);
    document.body.dataset.images = String(images.size);
    for (const bitmap of images.values()) bitmap.close();
  } catch (error) {
    status.textContent = `导出失败：${error.message}`;
    console.error(error);
  } finally {
    button.disabled = false;
  }
});
