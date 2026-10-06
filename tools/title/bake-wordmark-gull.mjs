import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const perchedPath = resolve(root, 'tools/title/source/seagull-poly-google.glb');
const flyingPath = resolve(root, 'tools/title/source/flying-seagull-poly-google.glb');
// Poly by Google, CC-BY 3.0 (https://poly.pizza/m/0WRzrtCIIRp, https://poly.pizza/m/6Tpj_vcWP3f).
// tools/*/source/ is git-ignored, so fetch the unmodified GLBs on first use.
const SOURCES = [
  [perchedPath, 'https://static.poly.pizza/76d4eea2-3700-43ae-b65c-7f6ea2dc5d23.glb'],
  [flyingPath, 'https://static.poly.pizza/ee7ad6b3-ebdc-4494-ba1e-8b6190004df5.glb'],
];
await mkdir(resolve(root, 'tools/title/source'), { recursive: true });
for (const [path, url] of SOURCES) {
  if (existsSync(path)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}
const outDir = resolve(root, 'public/title');
const frame = 256;
const cols = 8;
const rows = 4;
/** The row the standing gull's soles sit on (PERCHED_FOOT_Y in src/title/title-wordmark-gull.ts). */
const PERCHED_FOOT_Y = 194;
/** Landing-flare frames: a full braking wingbeat with the feet down. */
const FLARE_FRAMES = 6;
/** How far the feet swing down for landing (radians about the hips). */
const LEGS_DOWN = 1.7;
/**
 * The touchdown cells. It lands side-on, as it flew in (yaw 1.29 turns the standing gull's +z
 * beak to the flying frames' heading), wings still raised and legs bent under the weight, then
 * folds its wings back along its body and turns to face out like the idle cell (yaw -0.32).
 */
const TOUCHDOWN = [
  { yaw: 1.29, pitch: -0.22, crouch: true, roll: 0, sweep: 0.15, scale: 1 },
  { yaw: 1.25, pitch: -0.16, crouch: true, roll: 0.45, sweep: 0.6, scale: 0.95 },
  { yaw: 1.12, pitch: -0.1, crouch: false, roll: 0.95, sweep: 1.1, scale: 0.82 },
  { yaw: 0.9, pitch: -0.05, crouch: false, roll: 1.3, sweep: 1.4, scale: 0.65 },
  { yaw: 0.55, pitch: -0.02, crouch: false, roll: 1.45, sweep: 1.5, scale: 0.45 },
  { yaw: 0.2, pitch: 0, crouch: false },
  { yaw: -0.08, pitch: 0, crouch: false },
];
const frames = [
  ...Array.from({ length: 8 }, (_, i) => ({
    name: `flight-${i}`,
    model: 'flying',
    yaw: -0.28,
    pitch: -0.08,
    roll: Math.sin((i / 8) * Math.PI * 2) * 0.08,
    flap: i,
  })),
  // Slot 8 is the flare's first frame (wings high over the back), so the sheet's old cells keep
  // their places.
  flareFrame(0, 'flare'),
  { name: 'idle', model: 'perched', yaw: -0.32, pitch: 0, roll: 0 },
  { name: 'head-left', model: 'perched', yaw: -0.62, pitch: 0, roll: 0 },
  { name: 'head-right', model: 'perched', yaw: 0.08, pitch: 0, roll: 0 },
  { name: 'call', model: 'perched', yaw: -0.32, pitch: 0.05, roll: 0 },
  { name: 'crouch', model: 'perched', yaw: -0.32, pitch: -0.24, roll: 0, crouch: true },
  { name: 'idle-bob', model: 'perched', yaw: -0.25, pitch: 0.04, roll: 0, bob: true },
  { name: 'glide', model: 'flying', yaw: -0.28, pitch: -0.08, roll: 0, glide: true },
  ...Array.from({ length: FLARE_FRAMES - 1 }, (_, i) => flareFrame(i + 1)),
  // Touchdown: the standing gull lands with its wings still raised and its legs taking the weight
  // (a crouch), then folds them back along its body as it straightens up.
  ...TOUCHDOWN.map((t, i) => ({
    name: `land-${i}`,
    model: 'perched',
    yaw: t.yaw,
    pitch: t.pitch,
    roll: 0,
    crouch: t.crouch,
    landWings: t.roll === undefined ? undefined : { roll: t.roll, sweep: t.sweep, scale: t.scale },
  })),
];

/** One frame of the landing flare. The body's pitch-up comes from the page, so it can ease in. */
function flareFrame(i, name = `flare-${i}`) {
  return {
    name,
    model: 'flying',
    yaw: -0.28,
    pitch: -0.08,
    roll: 0,
    flareBeat: i,
    flareOf: FLARE_FRAMES,
    legs: LEGS_DOWN,
  };
}

const mime = (p) =>
  ({
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.glb': 'model/gltf-binary',
    '.wasm': 'application/wasm',
  })[extname(p)] ?? 'application/octet-stream';

function server() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let path;
    if (url.pathname === '/') {
      res.setHeader('content-type', 'text/html');
      res.end(
        `<!doctype html><html><body style="margin:0;background:transparent"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><canvas id="c" width="${frame * cols}" height="${frame * rows}"></canvas><script type="module" src="/bake.js"></script></body></html>`,
      );
      return;
    }
    if (url.pathname === '/bake.js') path = resolve(root, 'tools/title/wordmark-gull-bake-page.mjs');
    else if (url.pathname.startsWith('/node_modules/')) path = resolve(root, url.pathname.slice(1));
    else if (url.pathname === '/frames.json') path = resolve(root, 'tools/title/wordmark-gull-frames.json');
    else if (url.pathname === '/perched.glb') path = perchedPath;
    else if (url.pathname === '/flying.glb') path = flyingPath;
    if (!path || !existsSync(path)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', mime(path));
    createReadStream(path).pipe(res);
  });
}

await mkdir(outDir, { recursive: true });
await writeFile(
  resolve(root, 'tools/title/wordmark-gull-frames.json'),
  JSON.stringify({ frame, cols, rows, perchedFootY: PERCHED_FOOT_Y, frames }, null, 2),
);

const srv = server();
await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
const port = srv.address().port;
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({
    viewport: { width: frame * cols, height: frame * rows },
    deviceScaleFactor: 1,
  });
  page.on('console', (m) => console.log('[browser]', m.type(), m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async () => window.__bakeWordmarkGull());
  const base64 = result.webp.split(',')[1];
  await writeFile(resolve(outDir, 'wordmark-gull.webp'), Buffer.from(base64, 'base64'));
  await writeFile(resolve(outDir, 'wordmark-gull.json'), JSON.stringify(result.meta, null, 2));
  console.log(`wrote public/title/wordmark-gull.webp (${Buffer.byteLength(base64, 'base64')} bytes)`);
} finally {
  await browser.close();
  await new Promise((resolve) => srv.close(resolve));
}
