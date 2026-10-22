import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [program, file] of [[process.env.ANIMATION_PYTHON || 'python3', 'split_art.py'], [process.execPath, 'build_rig.mjs']]) {
  const result = spawnSync(program, [path.join(root, 'scripts', file)], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
