import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/finalize-cast.mjs <downloaded-native.mp4>');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'exports/bean-wizard-cast-1080p.mp4');
const result = spawnSync(process.env.ANIMATION_FFMPEG || 'ffmpeg', [
  '-hide_banner', '-y', '-i', path.resolve(input), '-an', '-c:v', 'libx264',
  '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-movflags', '+faststart', output,
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(output);
