// Verifies the asset toolchain (run `npm run toolchain` first to install local pieces).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localKtx = join(root, '.tools/ktx/bin/ktx');
const localRhubarb = join(root, '.tools/rhubarb/rhubarb');

function version(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .trim()
      .split('\n')[0];
  } catch {
    return null;
  }
}

let blender = '';
try {
  blender = JSON.parse(readFileSync(join(root, '.tools/paths.json'), 'utf8')).blender || '';
} catch {
  /* not set up yet */
}

const checks = [
  {
    name: 'ktx (KTX-Software)',
    required: true,
    v: version(existsSync(localKtx) ? localKtx : 'ktx', ['--version']),
  },
  {
    name: 'gltf-transform',
    required: true,
    v: version(join(root, 'node_modules/.bin/gltf-transform'), ['--version']),
  },
  { name: 'rhubarb', required: true, v: version(localRhubarb, ['--version']) },
  { name: 'ffmpeg', required: true, v: version('ffmpeg', ['-version']) },
  { name: 'blender', required: false, v: blender ? version(blender, ['-v']) : null },
];

let failed = false;
for (const c of checks) {
  const ok = Boolean(c.v);
  if (!ok && c.required) failed = true;
  console.log(`${ok ? 'ok  ' : c.required ? 'MISSING' : 'warn'}  ${c.name.padEnd(20)} ${c.v ?? ''}`);
}
if (failed) {
  console.error('\nRequired tools are missing. Run `npm run toolchain`.');
  process.exit(1);
}
