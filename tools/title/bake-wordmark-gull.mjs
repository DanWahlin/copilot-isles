import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const perchedPath = resolve(root, 'tools/title/source/seagull-poly-google.glb');
const flyingPath = resolve(root, 'tools/title/source/flying-seagull-poly-google.glb');
const outDir = resolve(root, 'public/title');
const frame = 256;
const cols = 8;
const rows = 2;
const frames = [
  ...Array.from({ length: 8 }, (_, i) => ({
    name: `flight-${i}`,
    model: 'flying',
    yaw: -0.28,
    pitch: -0.08,
    roll: Math.sin((i / 8) * Math.PI * 2) * 0.08,
    flap: i,
  })),
  { name: 'flare', model: 'flying', yaw: -0.28, pitch: 0.18, roll: 0, flare: true },
  { name: 'idle', model: 'perched', yaw: -0.32, pitch: 0, roll: 0 },
  { name: 'head-left', model: 'perched', yaw: -0.62, pitch: 0, roll: 0 },
  { name: 'head-right', model: 'perched', yaw: 0.08, pitch: 0, roll: 0 },
  { name: 'call', model: 'perched', yaw: -0.32, pitch: 0.05, roll: 0 },
  { name: 'crouch', model: 'perched', yaw: -0.32, pitch: -0.24, roll: 0, crouch: true },
  { name: 'idle-bob', model: 'perched', yaw: -0.25, pitch: 0.04, roll: 0, bob: true },
];

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
  JSON.stringify({ frame, cols, rows, frames }, null, 2),
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
