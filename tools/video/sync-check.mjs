#!/usr/bin/env node
// Measures the recorder's audio/video sync: records the play page while flashing the screen white
// and beeping through the game's own AudioContext in the same JS turn, builds the MP4 the same way
// record.mjs does, then finds each flash (frame brightness) and beep (audio onset) in the output.
// A positive offset means the sound comes after the picture.
//   node tools/video/sync-check.mjs [--base=http://127.0.0.1:5395] [--out=<dir>] [--size=1920x1080]
//        [--jpeg=100] [--tier=low]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFlags } from '../lib/browser.mjs';
import { Recorder, finalize, launch, openDevPage, run, setJpegQuality, setSize } from './lib.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5395';
const out = path.resolve(opt.out || path.join(os.homedir(), 'Movies', 'copilot-isles'));
const work = path.join(out, '.work', 'sync-check');
if (opt.size) setSize(String(opt.size));
if (opt.jpeg) setJpegQuality(opt.jpeg);
fs.mkdirSync(work, { recursive: true });

let rec = null;
const { browser, page } = await launch({ onPcm: (b) => rec?.push(b) });
await openDevPage(page, { base, tier: opt.tier || 'low' });
// The beep goes through the game's context so it takes the same path as every game sound.
await page.evaluate(() => {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99;display:none';
  document.body.append(div);
  window.__flash = () => {
    const ctx = window.__rec.context();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 1000;
    g.gain.value = 0.8;
    osc.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    osc.stop(t + 0.12);
    div.style.display = 'block';
    setTimeout(() => (div.style.display = 'none'), 120);
  };
});
await page.waitForTimeout(2000);
rec = new Recorder(page, work);
await rec.start();
const at = [];
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1700 + i * 130);
  at.push(await page.evaluate(() => (window.__flash(), performance.timeOrigin + performance.now())));
}
await page.waitForTimeout(1500);
const take = await rec.stop();
await browser.close();
const mp4 = path.join(work, 'sync-check.mp4');
const fin = await finalize({ take, title: null, out: mp4 });

// Flashes: frames whose average luma jumps above 200.
const vlog = await run('ffmpeg', [
  ...['-hide_banner', '-i', mp4, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG'],
  ...['-an', '-f', 'null', '-'],
]);
const frames = [...vlog.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
const flashes = [];
for (let i = 0; i < frames.length; i++)
  if (frames[i][1] > 200 && (i === 0 || frames[i - 1][1] <= 200)) flashes.push(frames[i][0]);
// Beeps: onsets of 1 kHz energy (Goertzel over 2 ms windows) in the decoded mono track.
const pcmOut = path.join(work, 'check.pcm');
await run('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  mp4,
  '-vn',
  '-ac',
  '1',
  '-ar',
  '48000',
  '-f',
  's16le',
  pcmOut,
]);
const buf = fs.readFileSync(pcmOut);
const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
const win = 96;
const coeff = 2 * Math.cos((2 * Math.PI * 1000) / 48000);
const power = [];
for (let i = 0; i + win <= samples.length; i += win) {
  let s1 = 0,
    s2 = 0;
  for (let j = 0; j < win; j++) {
    const s0 = samples[i + j] / 32768 + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  power.push(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}
const peak = Math.max(...power);
const beeps = [];
for (let k = 1; k < power.length; k++)
  if (
    power[k] > peak * 0.1 &&
    power[k - 1] <= peak * 0.1 &&
    (!beeps.length || (k * win) / 48000 - beeps.at(-1) > 0.5)
  )
    beeps.push((k * win) / 48000);
const pairs = flashes.map((f) => {
  const b = beeps.reduce((best, x) => (Math.abs(x - f) < Math.abs(best - f) ? x : best), Infinity);
  return { flash: +f.toFixed(3), beep: +b.toFixed(3), offsetMs: Math.round((b - f) * 1000) };
});
console.log(
  JSON.stringify(
    {
      mp4,
      audioStartOffsetMs: Math.round(fin.offset * 1000),
      flashes: flashes.length,
      beeps: beeps.length,
      pairs,
    },
    null,
    1,
  ),
);
