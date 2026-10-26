#!/usr/bin/env node
// Streaming audio on a slow connection: the real game on a throttled network (Chrome's network
// emulation), played the way a new player plays it, with every sound timed. The title (the first
// press starts the music), the Chart, New Voyage, Juno's cabin, the chest, the dive and the fly-in,
// Anchorage (its theme, ambience and Wingman's welcome), Nell, a jump to Port Meridian and to
// Thousand-Bough (the music handover and the island streaming), and (with --flow=full) a sea battle
// (the battle music, the cannons).
//
// In the page it logs each music <audio> element (events, readyState, how far it's buffered, its
// gain) and samples whether an audible track's clock moves (a gap: it's playing and turned up, but
// the clock stands still while it waits for data), each voice line's fetch, decode and start against
// its caption (a voiced caption without its voice is silent; a late voice is out of sync), each
// sound effect a play asked for before it had loaded (a dropped first play), and the AudioContext's
// state. From Chrome it logs every download (priority, start, end, bytes) to show what competes with
// the sound at each moment. `--tap` also records the game's mix (tools/video/audio-tap.js) and keeps
// its loudness envelope.
//
// The gate (exit 1): a music gap over --max-gap ms after a track started, a voiced caption whose voice
// didn't play, a voice line that played under the wrong caption, or a page error.
//
// The network matters: GitHub Pages serves HTTP/2 by request priority, so the game's high-priority
// fetches went before the music's stream and starved it; a local HTTP/1.1 server (or Chrome's own
// throttling) never shows that. `--serve=dist` serves the build like Pages (tools/lib/pages-server.mjs:
// HTTP/2 under /kraken-isles/, the line shaped to the profile by priority; Chrome adds the round trip).
//
// npm run build && node tools/audiotest.mjs --serve=dist [--port=4176]
// node tools/audiotest.mjs --base=https://danwahlin.github.io/kraken-isles (the live site)
//   [--profile=slow4g|fast3g|dsl|none] [--visits=cold|cold,warm] [--flow=opening|islands|full]
//   [--tier=high] [--webgl] [--tap] [--max-gap=300] [--out=/tmp/audiotest] [--headed]
//   [--insecure --shaped] (another local pages-server: its own certificate, and its line shaped)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GPU_ARGS, collectLogs, parseFlags } from './lib/browser.mjs';
import { OPEN_FLAGS } from './lib/islands.mjs';
import { startPagesServer } from './lib/pages-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const opt = parseFlags();
let base = String(opt.base || 'http://127.0.0.1:4173').replace(/\/$/, '');
const profileName = String(opt.profile || 'slow4g');
const visits = String(opt.visits || 'cold').split(',');
const flowName = String(opt.flow || 'opening');
const tier = String(opt.tier || 'high');
const maxGap = Number(opt['max-gap'] || 300);
const out = String(opt.out || '/tmp/audiotest');
const label = String(opt.label || '');
fs.mkdirSync(out, { recursive: true });
let server = null;
if (opt.serve) {
  opt.insecure = true;
  opt.shaped = true;
  server = await startPagesServer({
    root: String(opt.serve),
    port: Number(opt.port || 4176),
    h2: true,
    certDir: out,
  });
  base = server.url;
}
if (opt.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/** Chrome's network emulation: bytes/s down and up, and the added round trip in ms. */
const PROFILES = {
  fast3g: { down: 1.6e6 / 8, up: 750e3 / 8, latency: 150, name: 'Fast 3G (1.6 Mbps, 150 ms)' },
  slow4g: { down: 4e6 / 8, up: 3e6 / 8, latency: 100, name: 'Slow 4G (4 Mbps, 100 ms)' },
  dsl: { down: 10e6 / 8, up: 1e6 / 8, latency: 40, name: 'DSL (10 Mbps, 40 ms)' },
  none: { down: -1, up: -1, latency: 0, name: 'Unthrottled' },
};
const profile = PROFILES[profileName];
if (!profile) throw new Error(`unknown --profile=${profileName}`);
// Waits scale with the line: Fast 3G streams the island for minutes.
const slow = profileName === 'fast3g' ? 4 : profileName === 'slow4g' ? 2 : 1;

/** In the page before any game script: the sound probes (see the header). */
function audioProbe() {
  const now = () => performance.timeOrigin + performance.now();
  const log = [];
  const samples = [];
  const voiceBytes = new Map();
  const sfxBytes = new Map();
  const tags = new WeakMap();
  const decks = [];
  const push = (o) => log.push({ t: now(), ...o });
  const fileOf = (url) =>
    String(url || '')
      .split('/')
      .pop()
      .split('?')[0];
  const baseOf = (url) => fileOf(url).replace(/\.(webm|m4a|ogg)$/, '');
  window.__ap = { log, samples };

  addEventListener('pointerdown', () => push({ kind: 'press' }), true);
  addEventListener('keydown', () => push({ kind: 'key' }), true);

  const ofetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
    const voice = /\/voice\/[^?]*\.(webm|m4a)(\?|$)/.test(url);
    const sfx = /\/audio\/[^/?]+\.(ogg|m4a)(\?|$)/.test(url);
    if (!voice && !sfx) return ofetch.call(this, input, init);
    const name = baseOf(url);
    // A sound effect fetched from inside a play (not a preload): that play was dropped.
    const stack = new Error().stack || '';
    const miss = sfx && /oneShotAt|playSlice/.test(stack);
    push({ kind: voice ? 'voice-fetch' : 'sfx-fetch', name, miss });
    return ofetch.call(this, input, init).then((res) => {
      const read = res.arrayBuffer.bind(res);
      res.arrayBuffer = () =>
        read().then((buf) => {
          (voice ? voiceBytes : sfxBytes).set(buf.byteLength, name);
          push({ kind: voice ? 'voice-loaded' : 'sfx-loaded', name, bytes: buf.byteLength });
          return buf;
        });
      return res;
    });
  };

  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (data, ...rest) {
    const n = data?.byteLength ?? -1;
    const v = voiceBytes.get(n);
    const s = sfxBytes.get(n);
    return decode.call(this, data, ...rest).then((buf) => {
      if (v) tags.set(buf, { voice: v });
      else if (s) tags.set(buf, { sfx: s });
      return buf;
    });
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const tag = this.buffer ? tags.get(this.buffer) : null;
    if (tag?.voice) push({ kind: 'voice-start', name: tag.voice });
    else if (tag?.sfx) push({ kind: 'sfx-start', name: tag.sfx });
    return start.apply(this, args);
  };

  // The AudioContext's life: made, resumed, running.
  const Ctx = window.AudioContext;
  if (Ctx) {
    window.AudioContext = class extends Ctx {
      constructor(o) {
        super(o);
        push({ kind: 'ctx', state: this.state });
        this.addEventListener('statechange', () => push({ kind: 'ctx', state: this.state }));
      }
    };
  }

  // Music: each <audio> element through the graph, and the gain it feeds.
  const mes = BaseAudioContext.prototype.createMediaElementSource;
  BaseAudioContext.prototype.createMediaElementSource = function (el) {
    const node = mes.call(this, el);
    const deck = watch(el);
    deck.source = node;
    return node;
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const deck = decks.find((d) => d.source === this);
    if (deck && dest instanceof GainNode) deck.gain = dest;
    return connect.call(this, dest, ...rest);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const deck = watch(this);
    if (this.paused) {
      deck.playAt = now();
      deck.started = false;
    }
    push({
      kind: 'music-play',
      name: baseOf(this.currentSrc || this.src),
      rs: this.readyState,
      paused: this.paused,
    });
    return play.apply(this, arguments);
  };
  const EVENTS = [
    'loadstart',
    'loadedmetadata',
    'canplay',
    'canplaythrough',
    'playing',
    'waiting',
    'stalled',
    'suspend',
    'pause',
    'ended',
    'error',
    'abort',
    'emptied',
  ];
  const ahead = (el) => {
    const b = el.buffered;
    for (let i = 0; i < b.length; i++)
      if (b.start(i) <= el.currentTime + 0.05 && b.end(i) >= el.currentTime) return b.end(i) - el.currentTime;
    return 0;
  };
  function watch(el) {
    let deck = decks.find((d) => d.el === el);
    if (deck) return deck;
    deck = { el, source: null, gain: null, playAt: 0, started: false, lastT: 0, lastCT: 0, gapFrom: 0 };
    decks.push(deck);
    for (const ev of EVENTS)
      el.addEventListener(ev, () =>
        push({
          kind: 'media',
          ev,
          name: baseOf(el.currentSrc || el.src),
          rs: el.readyState,
          ct: +el.currentTime.toFixed(2),
          ahead: +ahead(el).toFixed(1),
        }),
      );
    return deck;
  }
  // Every 50 ms: is each audible track's clock moving? Every 250 ms: a sample for the charts.
  let n = 0;
  setInterval(() => {
    const t = now();
    n++;
    for (const d of decks) {
      const el = d.el;
      const gain = d.gain ? d.gain.gain.value : 1;
      const audible = !el.paused && !el.ended && gain > 0.02;
      const ct = el.currentTime;
      const name = baseOf(el.currentSrc || el.src);
      if (d.lastT && audible) {
        const dt = (t - d.lastT) / 1000;
        let dct = ct - d.lastCT;
        // A loop's wrap or a seek counts as progress.
        if (dct < 0 || dct > dt + 0.5) dct = dt;
        const moving = dct > dt * 0.25;
        if (moving && !d.started) {
          d.started = true;
          push({ kind: 'music-audible', name, wait: Math.round(t - d.playAt) });
        } else if (d.started && !moving && !d.gapFrom) d.gapFrom = d.lastT;
        else if (d.started && moving && d.gapFrom) {
          push({ kind: 'music-gap', name, from: d.gapFrom, ms: Math.round(t - d.gapFrom) });
          d.gapFrom = 0;
        }
      }
      if (!audible && d.gapFrom) {
        push({ kind: 'music-gap', name, from: d.gapFrom, ms: Math.round(t - d.gapFrom), open: true });
        d.gapFrom = 0;
      }
      d.lastT = t;
      d.lastCT = ct;
      if (n % 5 === 0 && (audible || !el.paused))
        samples.push({
          t,
          name,
          ct: +ct.toFixed(2),
          rs: el.readyState,
          ahead: +ahead(el).toFixed(1),
          gain: +gain.toFixed(3),
        });
    }
  }, 50);

  // Captions: the cabin's and the HUD's, as they change.
  let last = '';
  const read = () => {
    const cabin = document.querySelector('.ci-opening-caption.show .ci-opening-caption-line');
    const hud = document.querySelector('.hud-subtitle.show .hud-line');
    const el = cabin ?? hud;
    const text = el?.textContent?.trim() ?? '';
    if (text !== last) {
      last = text;
      push({ kind: 'caption', text, src: cabin ? 'cabin' : hud ? 'hud' : '' });
    }
  };
  const loop = () => {
    read();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(read, 100);
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function lineIndex() {
  try {
    const res = await fetch(`${base}/courses/copilot-app/voice/manifest.json`);
    const manifest = await res.json();
    const exact = new Map();
    for (const l of manifest.lines) exact.set(norm(l.text), l);
    return (text) => {
      const n = norm(text);
      if (!n) return null;
      const hit = exact.get(n);
      if (hit) return hit;
      for (const l of manifest.lines) {
        const m = norm(l.text);
        if (m.length > 24 && (n.startsWith(m.slice(0, 40)) || m.startsWith(n.slice(0, 40)))) return l;
      }
      return null;
    };
  } catch {
    return () => null;
  }
}

/** Moves the mouse in small steps over `ms`. */
async function glide(page, from, to, ms) {
  const n = Math.max(8, Math.round(ms / 25));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(ms / n);
  }
}

async function clickEl(page, selector, from, ms = 600) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await glide(page, from, to, ms);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  return to;
}

const until = (page, fn, arg, timeout) =>
  page
    .waitForFunction(fn, arg, { timeout, polling: 200 })
    .then(() => true)
    .catch(() => false);
const S = (page, js) =>
  page.evaluate(`(() => { const s = window.__flow.debugSession; return ${js}; })()`).catch(() => null);

/** Lets a running dialogue play out (or `ms` pass). */
async function drain(page, ms) {
  await page.waitForTimeout(1200);
  await until(page, () => !window.__flow.debugSession?.debug.state().dialogue, null, ms);
}

/** The flow, with marks (`mark(label)`) at each scene. Real mouse and keys up to the island. */
async function playFlow(page, mark, errors) {
  const W = 1600;
  const H = 900;
  const at = (fx, fy) => ({ x: W * fx, y: H * fy });
  mark('title');
  await page.waitForTimeout(400);
  // The first press: a drag of the ship (it starts the title's music and sea).
  let p = at(0.62, 0.62);
  await glide(page, at(0.8, 0.85), p, 300);
  await page.mouse.down();
  mark('press');
  await glide(page, p, at(0.44, 0.6), 1500);
  await glide(page, at(0.44, 0.6), at(0.54, 0.64), 900);
  await page.mouse.up();
  p = at(0.54, 0.64);
  await page.waitForTimeout(3000);
  mark('chart');
  p = await clickEl(page, '.ci-menu-list button:has-text("Chart")', p);
  await until(page, () => window.__flow.getState().screen === 'chart', null, 8000);
  await page.waitForTimeout(3000);
  p = await clickEl(page, '.ci-back', p);
  await until(page, () => window.__flow.getState().screen === 'title', null, 8000);
  await page.waitForTimeout(600);
  mark('captain');
  p = await clickEl(page, '.ci-menu-list button:has-text("New Voyage")', p);
  // With more than one course pack, New Voyage lists them first: the voiced course is the one to hear.
  await until(page, () => ['course', 'captain'].includes(window.__flow.getState().screen), null, 8000);
  if ((await page.evaluate(() => window.__flow.getState().screen)) === 'course') {
    await page.waitForTimeout(600);
    p = await clickEl(page, '[data-course="copilot-app"]', p);
  }
  await until(page, () => window.__flow.getState().screen === 'captain', null, 8000);
  await page.waitForTimeout(600);
  p = await clickEl(page, 'input[placeholder="What should the crew call you?"]', p);
  await page.keyboard.type('Dan', { delay: 150 });
  await page.waitForTimeout(1000);
  p = await clickEl(page, '.ci-panel-actions .ci-primary', p);
  mark('cabin');
  await glide(page, p, at(0.97, 0.97), 400);
  const lock = await until(
    page,
    () => !!document.querySelector('.ci-opening-lock.show'),
    null,
    240_000 * slow,
  );
  if (!lock) {
    errors.push('the chest never waited to be opened');
    return;
  }
  // Juno's chest line, then open it.
  await until(page, () => !document.querySelector('.ci-opening-caption.show'), null, 15_000);
  await page.waitForTimeout(800);
  await clickEl(page, '.ci-opening-lock.show', at(0.97, 0.97));
  mark('dive');
  await glide(page, at(0.5, 0.5), at(0.98, 0.98), 400);
  const ashore = await until(
    page,
    () =>
      window.__flow.getState().screen === 'playing' &&
      window.__flow.debugSession?.debug.arrival()?.phase === 'done',
    null,
    300_000 * slow,
  );
  if (!ashore) {
    errors.push('never got ashore on Anchorage');
    return;
  }
  mark('anchorage');
  // Wingman's welcome (voiced), then Nell's first lines.
  await drain(page, 60_000);
  await page.waitForTimeout(2000);
  if (flowName === 'opening') return;
  // The battle first: a talk would hold the helm, and a jump to another island skips the battle.
  if (flowName === 'full') await battle(page, mark, errors);
  else {
    mark('nell');
    await S(page, 's.debug.talk("nell")');
    await page.waitForTimeout(9000);
  }
  mark('meridian');
  // From the Chart, as a player jumps (opening it starts Port Meridian streaming).
  await page.evaluate(() => window.__flow.openChart());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__flow.travelTo('island:meridian'));
  const there = await until(
    page,
    () => window.__flow.debugSession?.island === 'meridian' && window.__flow.getState().screen === 'playing',
    null,
    240_000 * slow,
  );
  if (!there) errors.push('never got to Port Meridian');
  await page.waitForTimeout(2500);
  await S(page, 's.debug.skipArrival()');
  await drain(page, 40_000);
  // Someone in town has a word (an NPC's voiced lines, loaded as the talk starts).
  const npc = await S(page, 's.debug.cast()[0]?.id ?? null');
  if (npc) {
    mark(`talk ${npc}`);
    await S(page, `s.debug.talk(${JSON.stringify(npc)})`);
    await page.waitForTimeout(9000);
  }
  await page.waitForTimeout(2000);
  mark('thousand-bough');
  await page.evaluate(() => window.__flow.travelTo('island:thousand-bough'));
  const tb = await until(
    page,
    () =>
      window.__flow.debugSession?.island === 'thousand-bough' &&
      window.__flow.getState().screen === 'playing',
    null,
    240_000 * slow,
  );
  if (!tb) errors.push('never got to Thousand-Bough');
  await page.waitForTimeout(2500);
  await S(page, 's.debug.skipArrival()');
  await drain(page, 40_000);
  await page.waitForTimeout(6000);
}

/**
 * Anchorage's Seal, board, and sail out until the lookout calls sails (as tools/battletest.mjs); fire
 * a few broadsides, then skip the rest from the pause menu.
 */
async function battle(page, mark, errors) {
  mark('to-battle');
  await S(
    page,
    `(() => { for (const q of ['Q0.2','Q0.3','Q0.4','Q0.5','Q0.6','Q0.7','Q0.8','Q0.9','Q0.10','Q0.11']) s.debug.quest(q, 'done'); })()`,
  );
  await page.waitForTimeout(800);
  await S(page, 's.debug.board()');
  await until(page, () => window.__flow.debugSession?.debug.state().mode === 'sail', null, 30_000);
  await page.waitForTimeout(1500);
  if (!(await S(page, '!!s.debug.battleRun()'))) {
    errors.push('boarding with the Seal built no battle');
    return;
  }
  const started = () => S(page, '!!s.debug.battleRun()?.started');
  // As tools/battletest.mjs: sails up (W), steer for Port Meridian with A and D, and after 40 s a jump
  // to ~60 m short of the open water.
  const sailToward = async (x, z, ms) => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const t0 = Date.now();
    let key = null;
    while (Date.now() - t0 < ms && !(await started())) {
      const st = await S(page, 's.debug.state().ship');
      if (st) {
        const want = Math.atan2(x - st.x, z - st.z);
        const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
        const next = Math.abs(d) < 0.08 ? null : d > 0 ? 'KeyA' : 'KeyD';
        if (next !== key) {
          if (key) await page.keyboard.up(key);
          if (next) await page.keyboard.down(next);
          key = next;
        }
      }
      await page.waitForTimeout(150);
    }
    if (key) await page.keyboard.up(key);
  };
  await sailToward(747, -700, 40_000);
  if (!(await started())) {
    await S(page, 's.debug.sailTo(215, -360, 2.2)');
    await sailToward(747, -700, 120_000);
  }
  if (!(await started())) {
    errors.push('the lookout never called sails');
    return;
  }
  mark('battle');
  await page.waitForTimeout(700);
  if (await page.$('.bh-brief')) await page.keyboard.press('Enter');
  await S(page, 's.debug.battleRun().battle.setCalm(true)');
  const t1 = Date.now();
  while (Date.now() - t1 < 25_000) {
    const snap = await S(page, 's.debug.battleRun()?.battle.snapshot({ bears: [0, 0], stores: {} }) ?? null');
    if (snap?.phase === 'fight') {
      if (!snap.assist) await page.keyboard.press('KeyR');
      if (snap.bears?.[0] || snap.bears?.[1]) await page.keyboard.press('Space');
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__flow.pause());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__flow.skipBattle());
  await page.waitForTimeout(2000);
}

/** One visit: load, play the flow, and collect everything on the epoch clock. */
async function visit(context, page, kind, lookup) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.down > 0)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: opt.shaped ? -1 : profile.down,
      uploadThroughput: opt.shaped ? -1 : profile.up,
    });
  const requests = new Map();
  let clockOffset = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    clockOffset ??= e.wallTime * 1000 - e.timestamp * 1000;
    const r = requests.get(e.requestId) ?? { bytes: 0 };
    Object.assign(r, {
      url: e.request.url,
      type: e.type,
      priority: e.request.initialPriority,
      t0: e.wallTime * 1000,
      range: e.request.headers?.Range ?? e.request.headers?.range ?? null,
    });
    requests.set(e.requestId, r);
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.fromSW = !!e.response.fromServiceWorker;
    r.fromCache = !!e.response.fromDiskCache;
    r.tResp = e.timestamp * 1000 + (clockOffset ?? 0);
  });
  // Bytes as they arrive, so a stream the player cancels (a media request) still counts.
  cdp.on('Network.dataReceived', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.received = (r.received ?? 0) + (e.encodedDataLength || e.dataLength || 0);
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.t1 = e.timestamp * 1000 + (clockOffset ?? 0);
    r.bytes = e.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.t1 = e.timestamp * 1000 + (clockOffset ?? 0);
    r.failed = e.errorText;
    r.canceled = !!e.canceled;
    r.bytes = r.received ?? 0;
  });

  const marks = [];
  const mark = (l) => {
    marks.push({ t: Date.now(), label: l });
    console.log(
      `[audiotest] ${profileName} ${kind} +${((Date.now() - (marks[0]?.t ?? Date.now())) / 1000).toFixed(1)}s ${l}`,
    );
  };
  const errors = [];
  const pcm = [];
  let tapAt = null;
  page.__onPcm = (b) => pcm.push(b);

  const t0 = Date.now();
  mark('load');
  await page.goto(`${base}/?debug${OPEN_FLAGS}&tier=${tier}${opt.webgl ? '&webgl' : ''}`, {
    waitUntil: 'load',
    timeout: 300_000,
  });
  if (kind === 'warm') await page.evaluate(() => localStorage.clear());
  const titled = await until(
    page,
    () => window.__flow?.getState().screen === 'title' && !document.getElementById('loading'),
    null,
    600_000,
  );
  if (!titled) errors.push('no title');
  const titleMs = Date.now() - t0;
  let flowError = null;
  const tapStart = opt.tap
    ? (async () => {
        await until(page, () => window.__rec?.state() === 'running', null, 120_000);
        const r = await page.evaluate(() => window.__rec.start());
        tapAt = r?.at ?? null;
      })()
    : Promise.resolve();
  try {
    if (titled) await playFlow(page, mark, errors);
  } catch (e) {
    flowError = e.message;
    errors.push(e.message);
  }
  mark('end');
  await tapStart.catch(() => undefined);
  let tapInfo = null;
  if (opt.tap && tapAt) tapInfo = await page.evaluate(() => window.__rec.stop()).catch(() => null);
  const probe = await page.evaluate(() => ({
    log: window.__ap?.log ?? [],
    samples: window.__ap?.samples ?? [],
    hitches: window.__isles?.hitches() ?? [],
    stalls: window.__isles?.stalls() ?? [],
  }));
  await cdp.detach().catch(() => undefined);
  return analyse({
    kind,
    t0,
    titleMs,
    marks,
    errors,
    flowError,
    probe,
    requests: [...requests.values()],
    lookup,
    pcm: Buffer.concat(pcm),
    tapAt,
    tapInfo,
  });
}

/** Loudness per 50 ms of the recorded mix (dBFS), from 16-bit stereo PCM. */
function envelope(pcm, sampleRate) {
  const frames = pcm.length / 4;
  const win = Math.round(sampleRate * 0.05);
  const outEnv = [];
  for (let f = 0; f + win <= frames; f += win) {
    let sum = 0;
    for (let i = f; i < f + win; i++) {
      const l = pcm.readInt16LE(i * 4) / 32768;
      const r = pcm.readInt16LE(i * 4 + 2) / 32768;
      sum += (l * l + r * r) / 2;
    }
    outEnv.push(Math.max(-90, Math.round(10 * Math.log10(sum / win + 1e-12))));
  }
  return outEnv;
}

function analyse(run) {
  const { probe, marks, lookup, t0 } = run;
  const rel = (t) => +((t - t0) / 1000).toFixed(2);
  const sceneAt = (t) => {
    let s = 'load';
    for (const m of marks) if (m.t <= t && m.label !== 'end') s = m.label;
    return s;
  };
  const log = probe.log;
  const press = log.find((e) => e.kind === 'press');
  const audible = log.filter((e) => e.kind === 'music-audible');
  const firstMusic = audible.find((e) => !press || e.t >= press.t);
  const gaps = log
    .filter((e) => e.kind === 'music-gap')
    .map((g) => ({ at: rel(g.from), ms: g.ms, name: g.name, scene: sceneAt(g.from), open: !!g.open }));
  const waits = audible.map((e) => ({ at: rel(e.t), name: e.name, waitMs: e.wait, scene: sceneAt(e.t) }));

  // Captions against voices.
  const caps = [];
  const capLog = log.filter((e) => e.kind === 'caption');
  for (let i = 0; i < capLog.length; i++) {
    const c = capLog[i];
    if (!c.text) continue;
    const end = capLog.slice(i + 1).find((d) => d.text !== c.text)?.t ?? Date.now();
    const line = lookup(c.text);
    const prev = caps[caps.length - 1];
    if (prev && prev.text === c.text && c.t - prev.to < 400) {
      prev.to = end;
      continue;
    }
    caps.push({ from: c.t, to: end, text: c.text, id: line?.id ?? null, src: c.src });
  }
  const voiceStarts = log.filter((e) => e.kind === 'voice-start');
  const voiceFetches = log.filter((e) => e.kind === 'voice-fetch');
  const voiced = caps
    .filter((c) => c.id)
    .map((c) => {
      const start = voiceStarts.find((v) => v.name === c.id && v.t >= c.from - 1500 && v.t <= c.to);
      const late = voiceStarts.find((v) => v.name === c.id && v.t > c.to && v.t < c.to + 15_000);
      const fetchAt = voiceFetches.find((v) => v.name === c.id && v.t >= c.from - 60_000 && v.t <= c.to);
      return {
        at: rel(c.from),
        id: c.id,
        scene: sceneAt(c.from),
        shownMs: Math.round(c.to - c.from),
        lateMs: start ? Math.round(start.t - c.from) : null,
        silent: !start,
        afterCaption: !!late && !start,
        fetchedBeforeMs: fetchAt ? Math.round(c.from - fetchAt.t) : null,
      };
    });
  // A voice that started under another line's caption (or none).
  const strays = voiceStarts
    .filter((v) => !caps.some((c) => c.id === v.name && v.t >= c.from - 1500 && v.t <= c.to))
    .map((v) => ({ at: rel(v.t), id: v.name, scene: sceneAt(v.t) }));
  const sfxMisses = log
    .filter((e) => e.kind === 'sfx-fetch' && e.miss)
    .map((e) => ({ at: rel(e.t), name: e.name, scene: sceneAt(e.t) }));
  const ctx = log.filter((e) => e.kind === 'ctx').map((e) => ({ at: rel(e.t), state: e.state }));
  const media = log
    .filter((e) => e.kind === 'media' || e.kind === 'music-play')
    .map((e) => ({ at: rel(e.t), ev: e.ev ?? 'play()', name: e.name, rs: e.rs, ct: e.ct, ahead: e.ahead }));
  const requests = run.requests
    .filter((r) => r.t0)
    .map((r) => ({
      url: r.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, ''),
      type: r.type,
      priority: r.priority,
      at: rel(r.t0),
      end: r.t1 ? rel(r.t1) : null,
      kb: Math.round((r.bytes ?? 0) / 1024),
      status: r.status ?? null,
      sw: r.fromSW || undefined,
      cache: r.fromCache || undefined,
      range: r.range || undefined,
      failed: r.failed || undefined,
    }))
    .sort((a, b) => a.at - b.at);
  const firstSoundT = firstMusic?.t ?? null;
  const bytesBefore = (t) =>
    t === null
      ? null
      : Math.round(
          run.requests.filter((r) => r.t1 && r.t1 <= t).reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024,
        );
  let env = null;
  if (run.pcm.length && run.tapInfo?.sampleRate)
    env = { at: rel(run.tapAt), step: 0.05, db: envelope(run.pcm, run.tapInfo.sampleRate) };
  const scenes = marks.map((m) => ({ at: rel(m.t), label: m.label }));
  const summary = {
    kind: run.kind,
    titleS: +(run.titleMs / 1000).toFixed(1),
    firstMusicAfterPressMs: firstMusic && press ? Math.round(firstMusic.t - press.t) : null,
    kbBeforeFirstMusic: bytesBefore(firstSoundT),
    kbPressToFirstMusic:
      firstSoundT !== null && press
        ? Math.round(
            run.requests
              .filter((r) => r.t1 && r.t1 <= firstSoundT && r.t1 >= press.t)
              .reduce((s, r) => s + (r.bytes ?? 0), 0) / 1024,
          )
        : null,
    musicGaps: gaps.filter((g) => g.ms > 100).length,
    musicGapsOver300: gaps.filter((g) => g.ms > maxGap).length,
    worstMusicGapMs: gaps.reduce((m, g) => Math.max(m, g.ms), 0),
    musicGapMsTotal: gaps.reduce((m, g) => m + g.ms, 0),
    trackWaits: waits,
    voiced: voiced.length,
    voiceSilent: voiced.filter((v) => v.silent).length,
    voiceLateOver300: voiced.filter((v) => v.lateMs !== null && v.lateMs > 300).length,
    worstVoiceLateMs: voiced.reduce((m, v) => Math.max(m, v.lateMs ?? 0), 0),
    voiceStrays: strays.length,
    sfxMisses: sfxMisses.length,
    requests: requests.length,
    mbTotal: +(run.requests.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1048576).toFixed(1),
    hitches: probe.hitches.length,
    errors: run.errors,
  };
  return {
    summary,
    scenes,
    gaps,
    voiced,
    strays,
    sfxMisses,
    ctx,
    media,
    samples: probe.samples.map((s) => ({ ...s, t: rel(s.t) })),
    requests,
    envelope: env,
    stalls: probe.stalls,
    hitches: probe.hitches,
  };
}

if (server) server.setRate(Math.max(0, profile.down));
else if (opt.shaped) await fetch(`${new URL(base).origin}/__rate?bps=${Math.max(0, profile.down)}`);
const lookup = await lineIndex();
const args = [...GPU_ARGS];
if (opt.insecure) args.push('--ignore-certificate-errors');
const browser = await chromium.launch({ channel: 'chrome', headless: !opt.headed, args });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: !!opt.insecure,
});
const page = await context.newPage();
const logs = collectLogs(page, { types: ['error'] });
await page.addInitScript(audioProbe);
if (opt.tap) {
  await page.addInitScript({ path: path.join(HERE, 'video', 'audio-tap.js') });
  await page.exposeFunction('__recPush', (b64) => page.__onPcm?.(Buffer.from(b64, 'base64')));
}
const results = [];
for (const kind of visits) {
  const r = await visit(context, page, kind, lookup);
  results.push(r);
  const s = r.summary;
  console.log(
    `[audiotest] ${profileName} ${kind}: title ${s.titleS}s, first music ${s.firstMusicAfterPressMs ?? '-'} ms after the press ` +
      `(${s.kbBeforeFirstMusic ?? '-'} KB before it), music gaps ${s.musicGaps} (worst ${s.worstMusicGapMs} ms), ` +
      `voiced ${s.voiced} (silent ${s.voiceSilent}, late>300 ${s.voiceLateOver300}, worst ${s.worstVoiceLateMs} ms, strays ${s.voiceStrays}), ` +
      `sfx misses ${s.sfxMisses}, ${s.mbTotal} MB${s.errors.length ? `, ERRORS ${s.errors.join('; ')}` : ''}`,
  );
  for (const g of r.gaps)
    console.log(`   gap ${String(g.ms).padStart(5)} ms at ${g.at}s ${g.name} (${g.scene})`);
  for (const v of r.voiced.filter((x) => x.silent || (x.lateMs ?? 0) > 300))
    console.log(`   voice ${v.id} at ${v.at}s (${v.scene}): ${v.silent ? 'SILENT' : `${v.lateMs} ms late`}`);
  for (const v of r.strays) console.log(`   stray voice ${v.id} at ${v.at}s (${v.scene})`);
}
await browser.close();
await server?.close();
const file = path.join(out, `audiotest-${profileName}${label ? `-${label}` : ''}.json`);
fs.writeFileSync(
  file,
  JSON.stringify({
    profile: profileName,
    profileName: profile.name,
    base,
    flow: flowName,
    tier,
    results,
    logs,
  }),
);
const failed =
  logs.length > 0 ||
  results.some(
    (r) =>
      r.summary.errors.length || r.summary.musicGapsOver300 || r.summary.voiceSilent || r.summary.voiceStrays,
  );
console.log(JSON.stringify({ profile: profileName, ok: !failed, out: file, logs: logs.slice(0, 10) }));
process.exit(failed ? 1 : 0);
