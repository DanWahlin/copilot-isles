// A GitHub Pages stand-in for the network tests (tools/audiotest.mjs): serves a build under the
// Pages sub-path (/copilot-isles/) with Range requests, gzip for text, ETag/304 and
// `Cache-Control: max-age=600`, as Pages does. Over HTTP/2 (`h2`, a throwaway self-signed certificate
// made with openssl) it can also shape the line by request priority: Pages (Fastly) serves the
// browser's RFC 9218 priorities, so high-priority fetches (`u=1`) go before an `<audio>` element's
// stream (`u=3`), which a plain local server (or Chrome's own throttling) never shows.
//
// node tools/lib/pages-server.mjs --root=dist [--port=4176] [--h2] [--shape=<bytes/s>]
// The rate can change while it runs: GET /__rate?bps=<bytes/s> (0: unshaped).
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import http2 from 'node:http2';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESS = /^(text\/|application\/(javascript|json)|image\/svg)/;
const CHUNK = 16 * 1024;
const TICK_MS = 10;

/** `u=` and `i` from an RFC 9218 `priority` header (urgency 3, not incremental, when absent). */
function parsePriority(h = '') {
  const u = /u=(\d)/.exec(h);
  return { urgency: u ? Number(u[1]) : 3, incremental: /(^|[\s,])i($|[\s,;])/.test(h) };
}

/** A self-signed certificate for 127.0.0.1 in `dir` (made once). */
function certificate(dir) {
  const key = path.join(dir, 'pages-server-key.pem');
  const cert = path.join(dir, 'pages-server-cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '30',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ]);
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/**
 * Starts the server. `shape` is the line's rate in bytes/s (0: unshaped; it needs `h2`, since the
 * priorities only come over HTTP/2). Resolves with its base URL, `setRate` and `close`.
 */
export function startPagesServer({
  root,
  port = 4176,
  prefix = '/copilot-isles/',
  h2 = false,
  shape = 0,
  certDir = path.join(os.tmpdir(), 'copilot-isles-pages-server'),
}) {
  const dir = path.resolve(root);
  const gzCache = new Map();
  let rate = shape;
  /** Responses being sent through the shaped line. */
  const active = [];
  let seq = 0;
  let turn = 0;
  let ticker = null;

  const tick = () => {
    if (!rate) {
      for (const s of active.splice(0)) s.res.end(s.body.subarray(s.off));
      return;
    }
    let budget = (rate * TICK_MS) / 1000;
    while (budget > 0 && active.length) {
      // The most urgent first; equal urgencies share (incremental) or go in order (not incremental).
      let best = 7;
      for (const s of active) best = Math.min(best, s.urgency);
      const group = active.filter((s) => s.urgency === best);
      const ordered = group.filter((s) => !s.incremental);
      const pick = ordered.length
        ? ordered.reduce((a, b) => (a.seq < b.seq ? a : b))
        : group[turn++ % group.length];
      const n = Math.min(CHUNK, pick.body.length - pick.off, Math.ceil(budget));
      const chunk = pick.body.subarray(pick.off, pick.off + n);
      pick.off += n;
      budget -= n;
      if (pick.off >= pick.body.length) {
        active.splice(active.indexOf(pick), 1);
        pick.res.end(chunk);
      } else pick.res.write(chunk);
    }
  };

  const send = (req, res, body) => {
    if (!rate || body.length === 0) return void res.end(body);
    ticker ??= setInterval(tick, TICK_MS);
    const s = { res, body, off: 0, seq: seq++, ...parsePriority(req.headers.priority) };
    active.push(s);
    res.on('close', () => {
      const i = active.indexOf(s);
      if (i >= 0) active.splice(i, 1);
    });
  };

  const handler = (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__rate') {
      rate = Number(url.searchParams.get('bps') || 0);
      return void res.end(`rate ${rate}`);
    }
    if (!url.pathname.startsWith(prefix)) return void res.writeHead(404).end('not found');
    let rel = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) return void res.writeHead(403).end();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return void res.writeHead(404).end('not found');
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const etag = `"${st.mtimeMs.toString(16)}-${st.size.toString(16)}"`;
      const head = {
        'content-type': type,
        'cache-control': 'max-age=600',
        etag,
        'last-modified': st.mtime.toUTCString(),
        'access-control-allow-origin': '*',
        vary: 'Accept-Encoding',
      };
      if (req.headers['if-none-match'] === etag) return void res.writeHead(304, head).end();
      if (COMPRESS.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        let body = gzCache.get(file + etag);
        if (!body) {
          body = zlib.gzipSync(fs.readFileSync(file), { level: 6 });
          gzCache.set(file + etag, body);
        }
        res.writeHead(200, { ...head, 'content-encoding': 'gzip', 'content-length': body.length });
        return void (req.method === 'HEAD' ? res.end() : send(req, res, body));
      }
      head['accept-ranges'] = 'bytes';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      let start = 0;
      let end = st.size - 1;
      if (range) {
        start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
        if (range[1] !== '' && range[2] !== '') end = Math.min(end, Number(range[2]));
        start = Math.max(0, start);
        if (start > end)
          return void res.writeHead(416, { ...head, 'content-range': `bytes */${st.size}` }).end();
        res.writeHead(206, {
          ...head,
          'content-range': `bytes ${start}-${end}/${st.size}`,
          'content-length': end - start + 1,
        });
      } else res.writeHead(200, { ...head, 'content-length': st.size });
      if (req.method === 'HEAD') return void res.end();
      if (rate) return void send(req, res, fs.readFileSync(file).subarray(start, end + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
    });
  };

  const server = h2
    ? http2.createSecureServer({ ...certificate(certDir), allowHTTP1: true }, handler)
    : http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `${h2 ? 'https' : 'http'}://127.0.0.1:${port}${prefix.replace(/\/$/, '')}`,
        setRate: (bps) => {
          rate = Math.max(0, bps);
        },
        close: () =>
          new Promise((r) => {
            clearInterval(ticker);
            for (const s of active.splice(0)) s.res.destroy();
            server.close(() => r());
            // HTTP/2 sessions keep the server open until they end.
            server.closeAllConnections?.();
          }),
      }),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const opt = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.length ? v.join('=') : true];
    }),
  );
  const s = await startPagesServer({
    root: opt.root || 'dist',
    port: Number(opt.port || 4176),
    h2: !!opt.h2,
    shape: Number(opt.shape || 0),
  });
  console.log(`pages-server: ${s.url}/`);
}
