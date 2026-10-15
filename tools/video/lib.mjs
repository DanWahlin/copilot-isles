// Shared plumbing for tools/video/record.mjs: launching Chrome for a recording, the recorder (CDP
// screencast frames → constant-rate H.264, plus the game's own audio as PCM), the actions a scenario
// plays with (real key presses and mouse clicks), and the post-processing (title card, cuts with
// fades, mux, contact sheet, index page).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GPU_ARGS } from '../lib/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FPS = 30;
/** The viewport, screencast and video size (`setSize`, record.mjs `--size=1920x1080`). */
export let SIZE = { width: 1280, height: 720 };
/** The screencast's JPEG quality (0–100; `setJpegQuality`, record.mjs `--jpeg=100`). */
export let JPEG_QUALITY = 90;
export const QUALITY_PRESETS = Object.freeze({
  review: Object.freeze({ preset: 'slow', videoBitrate: '1200k', tune: 'animation', audioBitrate: '128k' }),
  high: Object.freeze({ preset: 'medium', crf: '19', tune: null, audioBitrate: '160k' }),
  // Highlight reels and other finals: near-transparent H.264 for upload and editing.
  master: Object.freeze({ preset: 'slow', crf: '16', tune: null, profile: 'high', audioBitrate: '256k' }),
});

/** Parses "1920x1080" (or { width, height }) and sets the capture size. Both must be even. */
export function setSize(spec) {
  const m = typeof spec === 'string' ? /^(\d+)x(\d+)$/.exec(spec.trim()) : null;
  const width = m ? Number(m[1]) : spec?.width;
  const height = m ? Number(m[2]) : spec?.height;
  if (!(width >= 320 && height >= 180 && width % 2 === 0 && height % 2 === 0))
    throw new Error(`bad size ${JSON.stringify(spec)} (use e.g. 1920x1080)`);
  SIZE = { width, height };
  return SIZE;
}

export function setJpegQuality(q) {
  const n = Number(q);
  if (!(n >= 1 && n <= 100)) throw new Error(`bad JPEG quality ${q} (1–100)`);
  JPEG_QUALITY = n;
  return n;
}
/**
 * What a change in the page takes to reach a screencast frame (the next rendered frame, then the
 * compositor) while the audio tap hears a sound in the same JS turn. Measured with sync-check.mjs
 * (flash + beep, five pairs): the sound led by 33–57 ms, so the audio is held back this much.
 */
export const AUDIO_LAG_MS = 45;

// ---- launch ------------------------------------------------------------------------------------

/**
 * Chrome (headless, real GPU, WebGPU on, autoplay allowed so the AudioContext runs) and one page at
 * SIZE (1280×720 unless `setSize` changed it), DPR 1, with the audio tap (and, with `cursor`, a
 * drawn mouse pointer) injected before any game script. Playwright keeps Chrome's
 * `--mute-audio`, so nothing plays on the speakers; the tap reads the graph before the output.
 */
export async function launch({ onPcm, cursor = false } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [...GPU_ARGS, '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript({ path: path.join(HERE, 'audio-tap.js') });
  // Headless Chrome draws no pointer; scenarios that use the mouse on camera can show one.
  if (cursor) await page.addInitScript({ path: path.join(HERE, 'cursor.js') });
  await page.exposeFunction('__recPush', (b64) => onPcm?.(Buffer.from(b64, 'base64')));
  return { browser, context, page };
}

// ---- recorder ----------------------------------------------------------------------------------

/**
 * Records the page from `start()` to `stop()`: screencast frames are laid onto a constant 30 fps
 * timeline by their own timestamps (each slot shows the newest frame at or before it) and piped to
 * ffmpeg, and the audio tap's PCM goes to a file. `t0` (epoch ms of the first frame) and the
 * audio's start (`audioAt`) line the two up later.
 */
export class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.raw = path.join(dir, 'raw.mp4');
    this.pcmPath = path.join(dir, 'audio.pcm');
    this.pcm = null;
    this.t0 = null;
    this.slots = 0;
    this.last = null;
    this.cuts = [];
    this.marks = [];
    this.audio = null;
    this.audioWait = null;
    this.frames = 0;
    this.lastTs = null;
    /** Gaps between delivered frames: the longest, and how many were over 100 ms (a visible stall). */
    this.maxGap = 0;
    this.stalls = 0;
    /** [seconds into the clip, ms] for each of those gaps (a reel keeps them out of its cuts). */
    this.gaps = [];
  }

  async waitForAudio() {
    while (!this.stopped && !this.audio) {
      await new Promise((r) => setTimeout(r, 100));
      if (this.stopped) break;
      this.audio = await this.page.evaluate(() => window.__rec?.start() ?? null).catch(() => null);
    }
    if (!this.audio) console.warn('[video] no AudioContext to record; this clip is silent');
  }

  /** The PCM sink for `launch({ onPcm })`. */
  push(buf) {
    if (this.pcm) fs.writeSync(this.pcm, buf);
  }

  async start({ audio = true } = {}) {
    fs.mkdirSync(this.dir, { recursive: true });
    this.ff = spawn(
      'ffmpeg',
      [
        ...['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS)],
        '-i',
        '-',
        // Fit every frame to SIZE (frames can arrive smaller, e.g. 1280×633) so libx264 always gets
        // even dimensions and the clip keeps one frame size.
        '-vf',
        `scale=${SIZE.width}:${SIZE.height}:force_original_aspect_ratio=decrease,` +
          `pad=${SIZE.width}:${SIZE.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
        ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p'],
        this.raw,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    this.ffDone = new Promise((resolve) => this.ff.on('close', resolve));
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', (f) => this.onFrame(f));
    if (audio) {
      this.pcm = fs.openSync(this.pcmPath, 'w');
      this.audio = await this.page.evaluate(() => window.__rec?.start() ?? null);
      // No AudioContext yet (a title screen makes it on the first click or key): start the audio as
      // soon as one connects. Its start time is on the same clock, so it still lines up.
      if (!this.audio) this.audioWait = this.waitForAudio();
    }
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: JPEG_QUALITY,
      maxWidth: SIZE.width,
      maxHeight: SIZE.height,
      everyNthFrame: 1,
    });
    await this.page.waitForTimeout(300);
  }

  onFrame({ data, metadata, sessionId }) {
    this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
    if (this.stopped) return;
    const ts = metadata?.timestamp ? metadata.timestamp * 1000 : Date.now();
    const buf = Buffer.from(data, 'base64');
    this.frames++;
    if (this.lastTs !== null) {
      const gap = ts - this.lastTs;
      if (gap > this.maxGap) this.maxGap = gap;
      if (gap > 100) {
        this.stalls++;
        this.gaps.push([+((this.lastTs - this.t0) / 1000).toFixed(2), Math.round(gap)]);
      }
    }
    this.lastTs = ts;
    if (this.t0 === null) {
      this.t0 = ts;
      this.last = buf;
      return;
    }
    this.fill(ts);
    this.last = buf;
  }

  /** Writes the current frame into every slot before `ts`. */
  fill(ts) {
    while (this.t0 + (this.slots * 1000) / FPS < ts) {
      this.ff.stdin.write(this.last);
      this.slots++;
    }
  }

  /** Epoch ms now, on the frames' clock. */
  now() {
    return Date.now();
  }

  mark(label) {
    this.marks.push({ t: this.now(), label });
  }

  async stop() {
    const end = this.now();
    await this.cdp.send('Page.stopScreencast').catch(() => undefined);
    this.stopped = true;
    await this.audioWait;
    if (this.last) this.fill(end);
    this.ff.stdin.end();
    await this.ffDone;
    if (this.audio) {
      const a = await this.page.evaluate(() => window.__rec.stop());
      // The first sample captured may be a few frames after the one asked for (see audio-tap.js).
      if (a) this.audio = { ...this.audio, ...a, at: this.audio.at + (a.late / a.sampleRate) * 1000 };
    }
    if (this.pcm) fs.closeSync(this.pcm);
    this.pcm = null;
    this.end = end;
    return {
      raw: this.raw,
      t0: this.t0,
      end,
      duration: this.slots / FPS,
      frames: this.frames,
      size: { ...SIZE },
      jpeg: JPEG_QUALITY,
      // Frames the page delivered per second of clip, and its longest stall.
      fps: +(this.frames / Math.max(0.001, this.slots / FPS)).toFixed(2),
      maxGapMs: Math.round(this.maxGap),
      stalls: this.stalls,
      gaps: this.gaps,
      cuts: this.cuts,
      marks: this.marks,
      audio: this.audio && fs.existsSync(this.pcmPath) ? { ...this.audio, pcm: this.pcmPath } : null,
    };
  }
}

// ---- actions -----------------------------------------------------------------------------------

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Camera-relative move keys for a relative angle (0 = straight ahead, + = to the left). */
const DIRS8 = [
  [0, ['KeyW']],
  [Math.PI / 4, ['KeyW', 'KeyA']],
  [Math.PI / 2, ['KeyA']],
  [(3 * Math.PI) / 4, ['KeyS', 'KeyA']],
  [Math.PI, ['KeyS']],
  [(-3 * Math.PI) / 4, ['KeyS', 'KeyD']],
  [-Math.PI / 2, ['KeyD']],
  [-Math.PI / 4, ['KeyW', 'KeyD']],
];
const keysFor = (rel) => {
  let best = DIRS8[0];
  for (const d of DIRS8) if (Math.abs(wrap(d[0] - rel)) < Math.abs(wrap(best[0] - rel))) best = d;
  return best[1];
};

/**
 * The actions a scenario plays with. Everything the player does on screen goes through real input
 * (keyboard and mouse); `S` (page.evaluate) is for reading state and for off-camera setup.
 */
export function makeApi(page, rec, { log = () => undefined } = {}) {
  const S = (f, a) => page.evaluate(f, a);
  const pause = (ms) => page.waitForTimeout(ms);
  const held = new Set();
  /** Where the mouse is (Playwright starts it at the top-left corner). */
  let mouse = { x: 0, y: 0 };
  const down = async (c) => {
    if (held.has(c)) return;
    held.add(c);
    await page.keyboard.down(c);
  };
  const up = async (c) => {
    if (!held.has(c)) return;
    held.delete(c);
    await page.keyboard.up(c);
  };
  const releaseAll = async () => {
    for (const c of [...held]) await up(c);
  };

  const api = {
    page,
    rec,
    S,
    pause,
    log,
    /** Player/session state from the dev page. */
    state: () => S(() => window.__dev.state()),
    /** Dialogue, quiz, card and quest state. */
    learn: () =>
      S(() => {
        const l = window.__dev.learn.getState();
        const st = window.__dev.state();
        return {
          quiz: l.quiz
            ? {
                id: l.quiz.quiz.id,
                type: l.quiz.quiz.type,
                correct: l.quiz.last?.correct ?? null,
                answered: !!l.quiz.last,
              }
            : null,
          reveal: l.reveal?.page.id ?? null,
          banner: l.banner?.title ?? null,
          forkForm: l.forkForm?.from ?? null,
          dialogue: st?.dialogue ?? false,
          welcome: st?.welcome ?? false,
          mode: st?.mode,
          quests: window.__dev.learn.progress.data.quests,
        };
      }),
    prompt: () => S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null),
    subtitle: () => S(() => document.querySelector('.hud-subtitle')?.textContent ?? ''),

    /** A key press held long enough for the game's per-frame poll to see it. */
    async press(code, ms = 110) {
      await down(code);
      await pause(ms);
      await up(code);
      await pause(60);
    },
    async hold(codes, ms) {
      for (const c of [].concat(codes)) await down(c);
      await pause(ms);
      for (const c of [].concat(codes)) await up(c);
    },
    releaseAll,

    /** Off-camera only: put the captain somewhere (and the camera behind them). */
    teleport: (x, z, heading = 0, y) =>
      S(([x, z, h, y]) => window.__dev.session().debug.teleport(x, z, h, y), [x, z, heading, y]),
    /** Off-camera only: snap the camera. */
    look: (yaw, pitch) => S(([y, p]) => window.__dev.look(y, p), [yaw, pitch]),
    /** Eases the camera to a yaw/pitch over `ms`, as a mouse drag would. */
    easeLook: (yaw, pitch, ms = 900) =>
      S(
        ([yaw, pitch, ms]) =>
          new Promise((resolve) => {
            const cam = window.__dev.session().camera;
            const y0 = cam.yaw,
              p0 = cam.pitch;
            const dy = Math.atan2(Math.sin(yaw - y0), Math.cos(yaw - y0));
            const t0 = performance.now();
            const step = () => {
              const k = Math.min(1, (performance.now() - t0) / ms);
              const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
              cam.yaw = y0 + dy * e;
              if (pitch !== null && pitch !== undefined) cam.pitch = p0 + (pitch - p0) * e;
              if (k < 1) requestAnimationFrame(step);
              else resolve();
            };
            step();
          }),
        [yaw, pitch ?? null, ms],
      ),

    /**
     * Walks the captain to (x, z) with the move keys (camera-relative, picked each tick from the
     * eight directions), running when it's far. Resolves when within `tol` metres, or false when
     * stuck or out of time.
     */
    async walkTo(x, z, { tol = 0.5, run = 7, timeout = 25_000 } = {}) {
      const t0 = Date.now();
      let lastD = Infinity,
        lastProgress = Date.now();
      let ok = false;
      while (Date.now() - t0 < timeout) {
        const p = await S(() => {
          const s = window.__dev.session();
          return { x: s.player.x, z: s.player.z, yaw: s.camera.yaw };
        });
        const dx = x - p.x,
          dz = z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < tol) {
          ok = true;
          break;
        }
        if (d < lastD - 0.2) {
          lastD = d;
          lastProgress = Date.now();
        } else if (Date.now() - lastProgress > 2500) break;
        const rel = wrap(Math.atan2(dx, dz) - p.yaw);
        const want = new Set(keysFor(rel));
        if (d > run) want.add('ShiftLeft');
        for (const c of [...held]) if (!want.has(c)) await up(c);
        for (const c of want) await down(c);
        await pause(d < 1.5 ? 30 : 70);
      }
      await releaseAll();
      if (!ok) log(`walkTo(${x.toFixed(1)}, ${z.toFixed(1)}) stopped short`);
      await pause(250);
      return ok;
    },

    /** Turns the captain toward (x, z) with short taps of the move keys (steps a few centimetres). */
    async face(x, z, tol = 0.3) {
      for (let k = 0; k < 8; k++) {
        const p = await S(() => {
          const s = window.__dev.session();
          return { x: s.player.x, z: s.player.z, h: s.player.heading, yaw: s.camera.yaw };
        });
        const want = Math.atan2(x - p.x, z - p.z);
        if (Math.abs(wrap(want - p.h)) < tol) return true;
        const keys = keysFor(wrap(want - p.yaw));
        await api.hold(keys, 90);
        await pause(220);
      }
      return false;
    },

    /**
     * Presses E once the interact prompt reads `text` (a beat after it shows, as a player reads it).
     * Returns false (and presses nothing) if it never does.
     */
    async interact(text, { timeout = 4000, beat = 450 } = {}) {
      const ok = await api.waitFor(
        (t) => document.querySelector('.hud-prompt.show')?.textContent?.includes(t),
        text,
        timeout,
      );
      if (!ok) {
        log(`no "${text}" prompt (saw ${JSON.stringify(await api.prompt())})`);
        return false;
      }
      await pause(beat);
      await api.press('KeyE');
      return true;
    },

    /** Waits for a page condition. */
    waitFor: (fn, arg, timeout = 30_000) =>
      page
        .waitForFunction(fn, arg, { timeout })
        .then(() => true)
        .catch(() => false),

    /** Where an NPC stands (Anchorage, Port Meridian or Thousand-Bough cast). */
    npc: (id) =>
      S((id) => {
        const s = window.__dev.session();
        const n = s.npcs.list.find((v) => v.spec.id === id);
        if (n) return { id, name: n.spec.name, x: n.x, y: n.y, z: n.z, h: n.heading };
        return s.debug.cast().find((v) => v.id === id) ?? null;
      }, id),

    /**
     * Off-camera: finds a side of an NPC where the talk prompt shows (in front first, then round
     * them), and stands the captain `back` metres further out on that line, facing them. Returns the
     * talk spot to walk to on camera.
     */
    async approachSpot(id, { reach = 2.1, back = 3.5, sides = [0, 1, -1, 2, -2, 3, -3, 4] } = {}) {
      const n = await api.npc(id);
      if (!n) throw new Error(`no NPC ${id}`);
      for (const r of [reach, reach + 0.8]) {
        for (const k of sides) {
          const a = n.h + (k * Math.PI) / 4;
          const sx = n.x + Math.sin(a) * r,
            sz = n.z + Math.cos(a) * r;
          const at = await S(
            ([x, z, h, y]) => {
              window.__dev.session().debug.teleport(x, z, h, y);
              return window.__dev.state();
            },
            [sx, sz, a + Math.PI, n.y + 0.3],
          );
          await pause(250);
          const p = await api.prompt();
          if (Math.abs(at.y - n.y) < 1 && p?.includes('Talk to')) {
            const bx = n.x + Math.sin(a) * (r + back),
              bz = n.z + Math.cos(a) * (r + back);
            await api.teleport(bx, bz, a + Math.PI, n.y + 0.3);
            const b = await api.state();
            if (Math.abs(b.y - n.y) > 1) await api.teleport(sx, sz, a + Math.PI, n.y + 0.3);
            // The opening shot needs room behind the captain (a wall pulls the camera into the hat).
            await pause(900);
            const room = await S(() => {
              const s = window.__dev.session();
              const c = window.__dev.camera.position;
              return Math.hypot(c.x - s.player.x, c.y - s.player.y - 1, c.z - s.player.z);
            });
            if (room < 3.2 && k !== sides.at(-1)) continue;
            return { x: sx, z: sz, npc: n, heading: a + Math.PI };
          }
        }
      }
      throw new Error(`no talk prompt round ${id}`);
    },

    /** Walks up to an NPC (from `approachSpot`) and presses E once the talk prompt shows. */
    async talkTo(spot) {
      await api.walkTo(spot.x, spot.z, { tol: 0.45 });
      await api.face(spot.npc.x, spot.npc.z);
      const ok = await api.waitFor(
        () => document.querySelector('.hud-prompt.show')?.textContent?.includes('Talk to'),
        null,
        3000,
      );
      if (!ok) log(`no talk prompt at ${spot.npc.id}`);
      await pause(350);
      await api.press('KeyE');
      await api.waitFor(
        () => window.__dev.state().dialogue || window.__dev.learn.getState().quiz,
        null,
        5000,
      );
    },

    /**
     * Plays a conversation through like a player: voiced lines run on their own, cards are read
     * and closed with E, quizzes are answered with the number keys (a wrong one first when
     * `wrongFirst` lists its id). Stops when `until(state)` or when nothing's been on for `idle` ms.
     */
    async converse({ until = null, idle = 1500, wrongFirst = [], readMs = 3200, timeout = 120_000 } = {}) {
      const t0 = Date.now();
      let quiet = null;
      const wrongDone = new Set();
      while (Date.now() - t0 < timeout) {
        const s = await api.learn();
        if (until?.(s)) return s;
        if (s.quiz) {
          quiet = null;
          await api.answerQuiz({ wrong: wrongFirst.includes(s.quiz.id) && !wrongDone.has(s.quiz.id) });
          wrongDone.add(s.quiz.id);
        } else if (s.reveal || s.banner) {
          quiet = null;
          await pause(readMs);
          await api.press('KeyE');
          await pause(700);
        } else if (s.dialogue || s.welcome) {
          quiet = null;
          await pause(250);
        } else {
          quiet ??= Date.now();
          if (!until && Date.now() - quiet > idle) return s;
          await pause(200);
        }
      }
      log('converse timed out');
      return api.learn();
    },

    /** Answers the open quiz through its own keys (or a click for a hotspot), then Continue (E). */
    async answerQuiz({ wrong = false, readMs = 2600 } = {}) {
      const q = await S(() => {
        const a = window.__dev.learn.getState().quiz;
        if (!a) return null;
        const quiz = a.quiz;
        const opts = quiz.options?.map((o) => o.id) ?? null;
        return {
          type: quiz.type,
          right: opts ? opts.indexOf(quiz.answer) : -1,
          n: opts?.length ?? 0,
          answered: !!a.last,
        };
      });
      if (!q) return;
      await pause(readMs);
      const choose = async (i) => {
        await api.press(`Digit${i + 1}`);
        await pause(1800);
      };
      if ((q.type === 'mc' || q.type === 'scenario') && q.right >= 0) {
        if (wrong) {
          await choose((q.right + 1) % q.n);
          await pause(1500);
          await api.press('KeyE');
          await pause(900);
        }
        await choose(q.right);
      } else if (q.type === 'hotspot') {
        const box = await S(() => {
          const quiz = window.__dev.learn.getState().quiz.quiz;
          const t = quiz.targets.find((x) => x.correct);
          const f = document.querySelector('.ci-hotspot-frame').getBoundingClientRect();
          return {
            x: f.left + f.width * (t.rect[0] + t.rect[2] / 2),
            y: f.top + f.height * (t.rect[1] + t.rect[3] / 2),
          };
        });
        await page.mouse.move(box.x - 120, box.y + 60);
        await page.mouse.move(box.x, box.y, { steps: 12 });
        await page.mouse.click(box.x, box.y);
        await pause(1800);
      } else {
        // Ordering/matching/multi: set through the store (these need drags this tool doesn't do).
        await S(() => window.__dev.answer());
        await pause(1800);
      }
      await api.press('KeyE');
      await pause(800);
    },

    /** Moves the mouse from where it is to (x, y) over `ms`, eased, as a hand would. */
    async glide(x, y, ms = 700) {
      const from = mouse;
      const n = Math.max(6, Math.round(ms / 25));
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        mouse = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
        await page.mouse.move(mouse.x, mouse.y);
        await pause(ms / n);
      }
    },

    /**
     * Moves the mouse to an element's centre and clicks it: in a few quick steps, or with `ms`, a
     * visible glide (for scenarios that draw the pointer).
     */
    async click(selector, { ms = 0 } = {}) {
      const box = await page.locator(selector).first().boundingBox();
      if (!box) return false;
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      if (ms) await api.glide(x, y, ms);
      else await page.mouse.move(x, y, { steps: 10 });
      mouse = { x, y };
      await pause(120);
      await page.mouse.click(x, y);
      return true;
    },

    /** Marks a moment in the timeline (printed in the report). */
    mark: (label) => rec?.mark(label),

    /**
     * Watches for new elements matching `selector` (captions, toasts) and returns a function that
     * turns each one into a mark (`<prefix>: <text>`, at the moment it showed, on the frames' clock).
     */
    async watchText(selector, prefix = 'text') {
      await S((sel) => {
        const seen = new WeakSet();
        const list = [];
        (window.__recWatch ??= {})[sel] = list;
        const look = () => {
          for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            list.push({ t: performance.timeOrigin + performance.now(), text: el.textContent.trim() });
          }
          requestAnimationFrame(look);
        };
        look();
      }, selector);
      return async () => {
        const list = await S((sel) => window.__recWatch?.[sel] ?? [], selector);
        if (!rec) return list;
        for (const m of list) rec.marks.push({ t: m.t, label: `${prefix}: ${m.text.slice(0, 60)}` });
        rec.marks.sort((a, b) => a.t - b.t);
        return list;
      };
    },

    /** Runs `fn` and drops everything it shows from the video (a fade covers the join). */
    async cut(fn) {
      const a = rec?.now();
      const r = await fn();
      if (rec) rec.cuts.push([a, rec.now()]);
      return r;
    },

    /**
     * Runs `fn` (a long wait: a sail, a walk) and keeps only its first `head` and last `tail`
     * milliseconds in the video, with a fade over the cut.
     */
    async cutWhile(fn, { head = 3500, tail = 3000 } = {}) {
      const a = rec?.now();
      const r = await fn();
      const b = rec?.now();
      if (rec && b - a > head + tail + 1500) rec.cuts.push([a + head, b - tail]);
      return r;
    },
  };
  return api;
}

// ---- the dev page --------------------------------------------------------------------------------

/**
 * Opens the play dev page (`?shot` hides its stats, `?quiet` skips the first flyover), presses
 * "Set sail" so audio unlocks as it would for a player, and waits for the session.
 */
export async function openDevPage(page, { base, tier = 'high', time = 16, flags = [] }) {
  const q = ['shot', 'quiet', `time=${time}`, `tier=${tier}`, ...flags].join('&');
  await page.goto(`${base}/devpages/play.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('go')?.disabled, null, { timeout: 180_000 });
  await page.click('#go');
  await page.waitForFunction(() => window.__dev?.ready && window.__dev.session(), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
}

/** Off-camera: plays any dialogue/cards through quickly (E skips lines). */
export async function skipTalk(page, ms = 60_000) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const l = window.__dev.learn.getState();
      const st = window.__dev.state();
      return { busy: !!(st.dialogue || st.welcome || l.quiz || l.reveal || l.banner), quiz: !!l.quiz };
    });
    if (!s.busy) {
      if (++quiet > 6) return;
    } else quiet = 0;
    if (s.quiz) await page.evaluate(() => window.__dev.answer());
    if (s.busy) await page.evaluate(() => window.__dev.tap('KeyE'));
    await page.waitForTimeout(250);
  }
}

// ---- post-processing -----------------------------------------------------------------------------

export function run(cmd, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) =>
      code === 0 ? resolve(out || err) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-2000)}`)),
    );
    if (!quiet) p.stderr.pipe(process.stderr);
  });
}

export async function probeDuration(file) {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  return Number(out.trim());
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Renders the title card (the game's colours and type over a blurred frame of the clip). */
export async function renderTitle(browser, meta, bgJpg, outPng) {
  // The card is laid out 1280 CSS px wide; the device scale factor brings it up to SIZE.
  const scale = SIZE.width / 1280;
  const page = await browser.newPage({
    viewport: { width: 1280, height: Math.round(SIZE.height / scale) },
    deviceScaleFactor: scale,
  });
  const bg =
    bgJpg && fs.existsSync(bgJpg)
      ? `data:image/jpeg;base64,${fs.readFileSync(bgJpg).toString('base64')}`
      : '';
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:100vw;height:100vh;overflow:hidden;background:#06121b;color:#f6ecd6;
      font-family:Georgia,'Times New Roman',serif}
    .bg{position:absolute;inset:-40px;background:url('${bg}') center/cover;filter:blur(14px) saturate(1.1) brightness(.62)}
    .shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgb(6 18 27/35%),rgb(6 18 27/88%))}
    .card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:880px;padding:46px 56px 42px;
      border-radius:22px;background:rgb(10 22 32/62%);border:1px solid rgb(232 200 138/34%);
      box-shadow:0 24px 70px rgb(0 0 0/45%);text-align:center}
    .eyebrow{font:600 15px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#e8c88a}
    h1{margin:18px 0 6px;font-weight:300;font-size:56px;letter-spacing:.03em;line-height:1.08}
    .npc{font-style:italic;color:rgb(246 236 214/72%);font-size:21px;margin-bottom:24px}
    .rule{width:120px;height:1px;margin:0 auto 24px;background:linear-gradient(90deg,transparent,#e8c88a,transparent)}
    .teach{font-size:23px;line-height:1.45;color:#f6ecd6}
    .chapter{margin-top:22px;font:500 15px/1.3 ui-sans-serif,system-ui,sans-serif;color:#b9d8e5;letter-spacing:.04em}
  </style></head><body><div class="bg"></div><div class="shade"></div><div class="card">
    <div class="eyebrow">${esc(meta.island)}${meta.code ? ` · ${esc(meta.code)}` : ''}</div>
    <h1>${esc(meta.title)}</h1>
    ${meta.who ? `<div class="npc">${esc(meta.who)}</div>` : ''}
    <div class="rule"></div>
    <div class="teach">${esc(meta.subtitle)}</div>
    ${meta.chapter ? `<div class="chapter">${esc(meta.chapter)}</div>` : ''}
  </div></body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: outPng });
  await page.close();
}

/**
 * Builds the final MP4: the title card (3 s), then the clip with its cuts removed (each join
 * faded through black), the audio lined up by the recorder's clocks, at 30 fps H.264 + AAC.
 */
export async function finalize({ take, title, out, audio = true, titleSeconds = 3, quality = 'review' }) {
  const encoding = QUALITY_PRESETS[quality];
  if (!encoding) throw new Error(`unknown output quality "${quality}"`);
  const fade = 0.35;
  const dur = take.duration;
  // Keep-segments on the clip's timeline (seconds from its first frame).
  const cuts = take.cuts
    .map(([a, b]) => [Math.max(0, (a - take.t0) / 1000), Math.min(dur, (b - take.t0) / 1000)])
    .filter(([a, b]) => b - a > 0.5)
    .sort((x, y) => x[0] - y[0]);
  const keep = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at + 0.3) keep.push([at, a]);
    at = Math.max(at, b);
  }
  if (dur > at + 0.3) keep.push([at, dur]);

  const args = ['-y', '-loglevel', 'error', '-i', take.raw];
  const hasAudio = audio && take.audio;
  if (hasAudio)
    args.push('-f', 's16le', '-ar', String(take.audio.sampleRate), '-ac', '2', '-i', take.audio.pcm);
  else args.push('-f', 'lavfi', '-t', String(dur + 1), '-i', 'anullsrc=r=48000:cl=stereo');
  if (title) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(titleSeconds), '-i', title);
  args.push('-f', 'lavfi', '-t', String(titleSeconds), '-i', 'anullsrc=r=48000:cl=stereo');
  const titleIn = title ? 2 : -1;
  const silentIn = title ? 3 : 2;

  const f = [];
  // Audio on the clip's timeline: positive offset = the audio started after the first frame.
  const off = hasAudio ? (take.audio.at - take.t0 + AUDIO_LAG_MS) / 1000 : 0;
  const lineUp =
    off >= 0
      ? `adelay=${Math.round(off * 1000)}:all=1`
      : `atrim=start=${(-off).toFixed(4)},asetpts=PTS-STARTPTS`;
  f.push(`[1:a]aresample=48000,${lineUp},apad=whole_dur=${dur.toFixed(3)}[aclip]`);
  // The screencast's JPEGs decode as full-range YUV; players expect limited range. Frames can come in
  // smaller than the viewport (a 1280×633 frame when the page's visual viewport shrinks), and an odd
  // height stops libx264, so every frame is fitted and padded to SIZE first.
  f.push(
    `[0:v]scale=${SIZE.width}:${SIZE.height}:force_original_aspect_ratio=decrease,` +
      `pad=${SIZE.width}:${SIZE.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
      `scale=out_range=tv,format=yuv420p,split=${keep.length}${keep.map((_, i) => `[vs${i}]`).join('')}`,
  );
  f.push(`[aclip]asplit=${keep.length}${keep.map((_, i) => `[as${i}]`).join('')}`);
  const parts = [];
  if (title) {
    f.push(
      `[${titleIn}:v]scale=${SIZE.width}:${SIZE.height},setsar=1,fps=${FPS},format=yuv420p,` +
        `fade=in:st=0:d=0.4,fade=out:st=${titleSeconds - 0.45}:d=0.45[tv]`,
    );
    f.push(`[${silentIn}:a]aresample=48000[ta]`);
    parts.push('[tv][ta]');
  }
  keep.forEach(([a, b], i) => {
    const len = b - a;
    const fin = i === 0 && !title ? 0 : fade;
    f.push(
      `[vs${i}]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS,setsar=1` +
        `${fin ? `,fade=in:st=0:d=${fin}` : ''},fade=out:st=${(len - fade).toFixed(3)}:d=${fade}[v${i}]`,
    );
    f.push(
      `[as${i}]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS` +
        `${fin ? `,afade=in:st=0:d=${fin}` : ''},afade=out:st=${(len - fade).toFixed(3)}:d=${fade}[a${i}]`,
    );
    parts.push(`[v${i}][a${i}]`);
  });
  f.push(`${parts.join('')}concat=n=${parts.length}:v=1:a=1[v][a]`);
  const commonArgs = [...args, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]'];
  const tune = encoding.tune ? ['-tune', encoding.tune] : [];
  const rate = encoding.videoBitrate ? ['-b:v', encoding.videoBitrate] : ['-crf', encoding.crf];
  const videoArgs = [
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    encoding.preset,
    ...tune,
    ...rate,
    ...(encoding.profile ? ['-profile:v', encoding.profile] : []),
    '-pix_fmt',
    'yuv420p',
  ];
  const colorArgs = [
    '-color_range',
    'tv',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
  ];
  const audioArgs = ['-c:a', 'aac', '-b:a', encoding.audioBitrate, '-ar', '48000'];
  if (encoding.videoBitrate) {
    const passLogfile = path.join(path.dirname(take.raw), `review-${process.pid}-${Date.now()}`);
    try {
      await run('ffmpeg', [
        ...commonArgs,
        ...videoArgs,
        '-pass',
        '1',
        '-passlogfile',
        passLogfile,
        ...colorArgs,
        ...audioArgs,
        '-f',
        'null',
        '-',
      ]);
      await run('ffmpeg', [
        ...commonArgs,
        ...videoArgs,
        '-pass',
        '2',
        '-passlogfile',
        passLogfile,
        ...colorArgs,
        ...audioArgs,
        '-movflags',
        '+faststart',
        out,
      ]);
    } finally {
      for (const suffix of ['-0.log', '-0.log.mbtree']) fs.rmSync(`${passLogfile}${suffix}`, { force: true });
    }
  } else {
    await run('ffmpeg', [
      ...commonArgs,
      ...videoArgs,
      ...colorArgs,
      ...audioArgs,
      '-movflags',
      '+faststart',
      out,
    ]);
  }
  return { keep, cuts, offset: off, duration: await probeDuration(out) };
}

/** Six frames from across the video (after the title) in a 3×2 sheet (each frame half SIZE). */
export async function contactSheet(video, png, skip = 3) {
  const dur = await probeDuration(video);
  const span = Math.max(1, dur - skip - 1);
  const args = ['-y', '-loglevel', 'error'];
  for (let i = 0; i < 6; i++) args.push('-ss', (skip + 0.5 + (span * i) / 5.2).toFixed(2), '-i', video);
  const f = [];
  const tile = `${SIZE.width / 2}:${SIZE.height / 2}`;
  for (let i = 0; i < 6; i++) f.push(`[${i}:v]scale=${tile},setsar=1[f${i}]`);
  f.push(
    `${[0, 1, 2, 3, 4, 5].map((i) => `[f${i}]`).join('')}xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[out]`,
  );
  args.push('-filter_complex', f.join(';'), '-map', '[out]', '-frames:v', '1', png);
  await run('ffmpeg', args);
}

/** One page that plays every video in the folder, with its title and what it teaches. */
export function writeIndex(dir) {
  const items = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && fs.existsSync(path.join(dir, f.replace(/\.json$/, '.mp4'))))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.id.localeCompare(b.id));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Copilot Isles · gameplay videos</title>
<style>
body{margin:0;padding:28px 32px 48px;background:#06121b;color:#f6ecd6;font-family:Georgia,serif}
h1{font-weight:300;letter-spacing:.06em;margin:0 0 4px}
p.lead{margin:0 0 26px;color:rgb(246 236 214/70%);font-style:italic}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:26px}
figure{margin:0;background:rgb(10 22 32/70%);border:1px solid rgb(232 200 138/25%);border-radius:14px;overflow:hidden}
video{display:block;width:100%;aspect-ratio:16/9;background:#000}
figcaption{padding:14px 18px 18px}
.eyebrow{font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#e8c88a}
h2{margin:6px 0 6px;font-weight:400;font-size:22px}
.teach{color:rgb(246 236 214/85%);line-height:1.4}
.meta{margin-top:8px;font:13px system-ui,sans-serif;color:#b9d8e5}
a{color:#e8c88a}
</style></head><body>
<h1>Copilot Isles · gameplay videos</h1>
<p class="lead">Each one is recorded live from the game (WebGPU, High tier) with its own audio.</p>
<div class="grid">
${items
  .map(
    (
      m,
    ) => `<figure><video controls preload="metadata" src="${esc(m.id)}.mp4" poster="${esc(m.id)}.jpg"></video>
<figcaption><div class="eyebrow">${esc(m.island)}${m.code ? ` · ${esc(m.code)}` : ''}</div>
<h2>${esc(m.title)}</h2><div class="teach">${esc(m.subtitle)}</div>
<div class="meta">${esc(m.chapter ?? '')} · ${fmt(m.duration)} · <a href="${esc(m.id)}.png">contact sheet</a></div>
</figcaption></figure>`,
  )
  .join('\n')}
</div></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
