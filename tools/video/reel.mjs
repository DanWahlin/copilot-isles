#!/usr/bin/env node
// Builds a highlight reel from takes filmed live in the game (record.mjs scenarios): each segment is
// one or more parts (a take's stretch, in → out) that crossfade into each other, every join fades the
// picture to black and the sound to silence and back, and the whole thing is encoded once at the
// reel's quality (`master` by default). Missing takes are filmed first (one at a time) and kept, so
// the edit can be re-run with new in/out points without filming again. See tools/video/README.md.
//
//   node tools/video/reel.mjs --reel=highlights [--out=<dir>] [--base=http://127.0.0.1:5395]
//        [--refinish] [--retake=<id>[,<id>…]] [--takes-only]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { parseFlags } from '../lib/browser.mjs';
import { AUDIO_LAG_MS, FPS, QUALITY_PRESETS, probeDuration, run, setSize } from './lib.mjs';
import { renderLowerThird } from './lower-third.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const opt = parseFlags();
if (!opt.reel) {
  const ids = fs.readdirSync(path.join(HERE, 'reels')).filter((f) => f.endsWith('.mjs'));
  console.log(`Reels: ${ids.map((f) => f.replace(/\.mjs$/, '')).join(', ')}`);
  console.log('Use --reel=<id>.');
  process.exit(opt.list ? 0 : 1);
}
const reel = (await import(pathToFileURL(path.join(HERE, 'reels', `${opt.reel}.mjs`)).href)).default;
const base = opt.base || 'http://127.0.0.1:5395';
const out = path.resolve(opt.out || path.join(os.homedir(), 'Movies', 'copilot-isles', 'reels', reel.id));
const work = path.join(out, '.work');
const takesDir = path.join(work, 'takes');
// Each reel's sheets in their own folder, so versions sharing an output folder keep theirs.
const reviewDir = path.join(out, 'review', reel.id);
const size = setSize(reel.size ?? '1920x1080');
const fade = reel.fade ?? 0.45;
const quality = reel.quality ?? 'master';
const encoding = QUALITY_PRESETS[quality];
if (!encoding) throw new Error(`unknown quality ${quality}`);
fs.mkdirSync(takesDir, { recursive: true });
fs.mkdirSync(reviewDir, { recursive: true });

const log = (m) => console.log(`[reel] ${m}`);
const takePath = (id) => path.join(takesDir, id, 'take.json');
const readTake = (id) => JSON.parse(fs.readFileSync(takePath(id), 'utf8'));

// ---- film the missing takes ---------------------------------------------------------------------

const retake = new Set(
  String(opt.retake ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const needed = [...new Set(reel.segments.flatMap((s) => s.parts.map((p) => p.take)))];
for (const id of needed) {
  if (fs.existsSync(takePath(id)) && !retake.has(id)) continue;
  if (opt.refinish) throw new Error(`--refinish: no kept take for ${id} (${takePath(id)})`);
  log(`filming ${id}`);
  const code = await new Promise((resolve) => {
    const p = spawn(
      process.execPath,
      [
        path.join(HERE, 'record.mjs'),
        `--scenario=${id}`,
        `--base=${base}`,
        `--tier=${reel.tier ?? 'high'}`,
        `--size=${size.width}x${size.height}`,
        `--jpeg=${reel.jpeg ?? 90}`,
        '--take-only',
        '--keep',
        `--out=${work}`,
        `--work=${takesDir}`,
      ],
      { stdio: 'inherit' },
    );
    p.on('close', resolve);
  });
  if (code !== 0 || !fs.existsSync(takePath(id))) throw new Error(`filming ${id} failed (exit ${code})`);
}
if (opt['takes-only']) process.exit(0);

// ---- resolve the edit ---------------------------------------------------------------------------

/**
 * A time in a take: seconds, or `{ mark, at = 0, last = false }` (the first mark whose label starts
 * with `mark`, or matches it if it's a RegExp; `last` takes the last one) plus `at` seconds.
 */
function timeIn(take, ref, what) {
  if (typeof ref === 'number') return ref;
  const marks = take.marks.filter((m) =>
    ref.mark instanceof RegExp ? ref.mark.test(m.label) : m.label.startsWith(ref.mark),
  );
  const m = ref.last ? marks.at(-1) : marks[0];
  if (!m) throw new Error(`${what}: no mark "${ref.mark}" in ${take.scenario}`);
  return (m.t - take.t0) / 1000 + (ref.at ?? 0);
}

/** Integrated loudness (LUFS) and true peak (dBTP) of a file's sound, optionally of [from, to] s. */
async function loudness(file, from = null, to = null) {
  const trim = from === null ? '' : `atrim=start=${from.toFixed(3)}:end=${to.toFixed(3)},`;
  const out = await run('ffmpeg', [
    ...['-nostats', '-hide_banner', '-i', file, '-vn'],
    ...['-af', `${trim}ebur128=peak=true`, '-f', 'null', '-'],
  ]);
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const TP = Number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1] ?? -99);
  return { I, TP: Number.isFinite(TP) ? TP : -99 };
}

const takes = new Map(needed.map((id) => [id, readTake(id)]));
const segments = reel.segments.map((seg, index) => {
  // Parts crossfade (picture and sound) into each other: a part's first `xfade` seconds overlap the
  // end of the one before it.
  const pieces = seg.parts.map((part, pi) => {
    const take = takes.get(part.take);
    const what = `${seg.id} part ${pi + 1}`;
    const a = timeIn(take, part.in, `${what} in`);
    const b = timeIn(take, part.out, `${what} out`);
    if (!(b > a + 0.3)) throw new Error(`${what}: out (${b.toFixed(2)}) isn't after in (${a.toFixed(2)})`);
    return { take, a, b, xfade: pi ? (part.xfade ?? seg.xfade ?? 0.35) : 0 };
  });
  const length = pieces.reduce((s, p) => s + (p.b - p.a) - p.xfade, 0);
  const first = index === 0;
  const last = index === reel.segments.length - 1;
  // `crossfadeIn: d` joins a segment to the one before with a d-second crossfade instead of a fade
  // through black (neither side fades).
  const xin = !first && seg.crossfadeIn ? seg.crossfadeIn : 0;
  const xout = !last && reel.segments[index + 1].crossfadeIn ? reel.segments[index + 1].crossfadeIn : 0;
  return {
    ...seg,
    pieces,
    length,
    crossfadeIn: xin,
    fadeIn: xin ? 0 : (seg.fadeIn ?? (first ? (reel.openFade ?? 0.6) : fade)),
    fadeOut: xout ? 0 : (seg.fadeOut ?? (last ? (reel.closeFade ?? 1.2) : fade)),
  };
});

// ---- checks -------------------------------------------------------------------------------------

const warnings = [];
const total = segments.reduce((s, g) => s + g.length - g.crossfadeIn, 0);
const maxHighlight = reel.maxHighlight ?? 10;
for (const g of segments) {
  if (g.highlight !== false && g.length > maxHighlight + 0.05)
    warnings.push(`${g.id} is ${g.length.toFixed(2)} s (over ${maxHighlight} s)`);
  // Screencast stalls (a frozen picture) inside what's kept.
  for (const p of g.pieces)
    for (const [t, ms] of p.take.gaps ?? [])
      if (t >= p.a && t <= p.b && ms > 150)
        warnings.push(`${g.id}: a ${ms} ms stall at ${t} s in ${p.take.scenario}`);
}
if (reel.maxTotal && total > reel.maxTotal + 0.05)
  warnings.push(`the reel is ${total.toFixed(2)} s (over ${reel.maxTotal} s)`);

/** The take's audio as samples on the clip's timeline, for level checks at the cut points. */
const pcmCache = new Map();
function levelAt(take, t, span = 0.25) {
  if (!take.audio?.pcm || !fs.existsSync(take.audio.pcm)) return null;
  let pcm = pcmCache.get(take.audio.pcm);
  if (!pcm) {
    const buf = fs.readFileSync(take.audio.pcm);
    pcm = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
    pcmCache.set(take.audio.pcm, pcm);
  }
  const off = (take.audio.at - take.t0 + AUDIO_LAG_MS) / 1000;
  const sr = take.audio.sampleRate;
  const i0 = Math.max(0, Math.round((t - off - span / 2) * sr));
  const i1 = Math.min(pcm.length / 2, Math.round((t - off + span / 2) * sr));
  if (i1 <= i0) return -120;
  let sum = 0;
  for (let i = i0; i < i1; i++) {
    const v = (pcm[i * 2] + pcm[i * 2 + 1]) / 65536;
    sum += v * v;
  }
  return +(10 * Math.log10(sum / (i1 - i0) + 1e-12)).toFixed(1);
}

// ---- lower thirds -------------------------------------------------------------------------------

/**
 * `lowerThird: { k, t, b, ch, c, chLine, part, at = 1, hold = 6.5, tail = 1, showUnroll }` on a
 * segment: the card (lower-third.html) unrolls in `at` seconds after the segment's fade-in ends, or
 * after the start of its `part`-th part (0-based) when `part` is set (the seal
 * stamps down after it), holds `hold` seconds, fades out,
 * and is gone at least `tail` seconds before the segment's fade-out starts (the hold shortens to
 * fit). Rendered once per run into <out>/.work/lower-thirds/<reel>/<segment>/.
 */
/** Seconds into segment `g` where its `pi`-th part starts (where its crossfade begins). */
function partStartOf(g, pi) {
  let t = 0;
  for (let k = 1; k <= pi; k++) t += g.pieces[k - 1].b - g.pieces[k - 1].a - g.pieces[k].xfade;
  return t;
}
/**
 * A time in segment `g`, given against part `pi`: seconds from the part's start, or a take time
 * (`{ mark, at }`, as for in and out points) in that part's take.
 */
function segTime(g, pi, at, what) {
  const p = g.pieces[pi];
  if (!p) throw new Error(`${what}: ${g.id} has no part ${pi}`);
  return partStartOf(g, pi) + (typeof at === 'number' ? at : timeIn(p.take, at, what) - p.a);
}

const browser = await chromium.launch({ headless: true });
for (const g of segments) {
  const lt = g.lowerThird;
  if (!lt) continue;
  const render = await renderLowerThird(browser, lt, path.join(work, 'lower-thirds', reel.id, g.id), {
    fps: FPS,
    layout: lt.layout ?? 'lower',
  });
  // `part: i` times the card from the start of the segment's i-th part; `at` may be a take mark.
  const start =
    lt.part || typeof lt.at === 'object'
      ? segTime(g, lt.part ?? 0, lt.at ?? 1, `${g.id} lower third`)
      : g.fadeIn + (lt.at ?? 1);
  // `out: false`: no way out; it holds to the end of the segment (its fade to black covers it).
  const outSeconds = lt.out === false ? 0 : render.outSeconds;
  // `until: { segment, before = 1.5 }`: the card spans the joins after this segment (laid over the
  // joined reel, so it stays steady through a crossfade) and is gone `before` seconds before that
  // segment starts (where its crossfade begins).
  let latest = lt.out === false ? g.length : g.length - g.fadeOut - (lt.tail ?? 1);
  if (lt.until) {
    const si = segments.indexOf(g);
    const ui = segments.findIndex((x) => x.id === lt.until.segment);
    if (ui <= si) throw new Error(`${g.id}: lower third "until" must name a later segment`);
    let at = 0;
    for (let k = si + 1; k <= ui; k++) at += segments[k - 1].length - segments[k].crossfadeIn;
    latest = at - (lt.until.before ?? 1.5);
  }
  const hold = Math.min(
    lt.out === false || lt.until ? (lt.hold ?? Infinity) : (lt.hold ?? 6.5),
    latest - start - render.inSeconds - outSeconds,
  );
  if (hold < 3) throw new Error(`${g.id}: no room for the lower third (hold ${hold.toFixed(2)} s)`);
  g.lt = {
    ...render,
    outSeconds,
    start,
    hold,
    holdStart: start + render.inSeconds,
    end: start + render.inSeconds + hold + outSeconds,
  };
}

/**
 * `closeups: [{ label, part = 0, at, dur = 3, crop: { x, y, w, h }, scale = 2, x, y }]` on a segment:
 * a stretch of the picture's own region `crop` (the game's real UI, e.g. a session terminal),
 * magnified `scale`× with lanczos and laid over the scene at (x, y) with a thin parchment border and
 * a soft shadow, fading in and out (0.3 s). `at` is seconds into the part, or a take mark.
 */
for (const g of segments)
  g.cu = (g.closeups ?? []).map((c, k) => {
    const start = segTime(g, c.part ?? 0, c.at, `${g.id} close-up ${k + 1}`);
    const dur = c.dur ?? 3;
    const sc = c.scale ?? 2;
    const w = Math.round((c.crop.w * sc) / 2) * 2,
      h = Math.round((c.crop.h * sc) / 2) * 2;
    if (start < g.fadeIn || start + dur > g.length - g.fadeOut)
      throw new Error(`${g.id}: close-up ${k + 1} runs into the section's fades`);
    return { ...c, start, dur, w, h, x: c.x ?? Math.round((1920 - w) / 2), y: c.y ?? 60 };
  });

// ---- the edit -----------------------------------------------------------------------------------

// Two stages: each segment is cut, crossfaded, overlaid and faded into its own near-lossless file
// (one small filter graph each, which also keeps ffmpeg's scheduler from stalling on a graph with
// dozens of inputs), then the segments are joined and encoded once at the reel's quality.
const W = size.width,
  H = size.height;
const segDir = path.join(work, 'segments', reel.id);
fs.mkdirSync(segDir, { recursive: true });
const colorTags = [
  '-color_range',
  'tv',
  '-colorspace',
  'bt709',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'bt709',
];
let t0 = Date.now();
for (const [si, g] of segments.entries()) {
  const args = ['-y', '-loglevel', 'error'];
  const filters = [];
  let input = 0;
  g.pieces.forEach((p, pi) => {
    const take = p.take;
    const off = take.audio ? (take.audio.at - take.t0 + AUDIO_LAG_MS) / 1000 : 0;
    const dur = p.b - p.a;
    const vi = input++;
    args.push('-ss', p.a.toFixed(3), '-t', dur.toFixed(3), '-i', take.raw);
    const ai = input++;
    if (take.audio)
      args.push(...['-f', 's16le', '-ar', String(take.audio.sampleRate), '-ac', '2', '-i', take.audio.pcm]);
    else args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    // The screencast's JPEGs decode as full-range YUV; players expect limited range (as finalize).
    filters.push(
      `[${vi}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,scale=out_range=tv,format=yuv420p,` +
        `fps=${FPS},trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS,settb=AVTB[v${si}_${pi}]`,
    );
    // Audio on the clip's timeline: sample 0 of the PCM sits at `off` seconds into the take.
    const start = p.a - off;
    const lineUp =
      start >= 0
        ? `atrim=start=${start.toFixed(4)},asetpts=PTS-STARTPTS`
        : `adelay=${Math.round(-start * 1000)}:all=1`;
    filters.push(
      `[${ai}:a]aresample=48000,${take.audio ? lineUp : 'anull'},apad,` +
        `atrim=duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS[a${si}_${pi}]`,
    );
  });
  // Parts crossfade (picture and sound) across each join.
  let v = `v${si}_0`,
    a = `a${si}_0`,
    len = g.pieces[0].b - g.pieces[0].a;
  for (let pi = 1; pi < g.pieces.length; pi++) {
    const x = g.pieces[pi].xfade;
    filters.push(
      `[${v}][v${si}_${pi}]xfade=transition=fade:duration=${x}:offset=${(len - x).toFixed(3)}[vx${si}_${pi}]`,
    );
    filters.push(`[${a}][a${si}_${pi}]acrossfade=d=${x}:c1=tri:c2=tri[ax${si}_${pi}]`);
    v = `vx${si}_${pi}`;
    a = `ax${si}_${pi}`;
    len += g.pieces[pi].b - g.pieces[pi].a - x;
  }
  for (const [k, c] of g.cu.entries()) {
    // A close-up: the region cut from this segment's own picture (same timestamps), magnified.
    const B = 4;
    const f = 0.3;
    const end = c.start + c.dur;
    const fades = (from) =>
      `fade=in:st=${from.toFixed(3)}:d=${f}:alpha=1,fade=out:st=${(from + c.dur - f).toFixed(3)}:d=${f}:alpha=1`;
    filters.push(`[${v}]split=2[cb${si}_${k}][cs${si}_${k}]`);
    filters.push(
      `[cs${si}_${k}]trim=start=${c.start.toFixed(3)}:end=${end.toFixed(3)},` +
        `crop=${c.crop.w}:${c.crop.h}:${c.crop.x}:${c.crop.y},scale=${c.w}:${c.h}:flags=lanczos,` +
        `pad=${c.w + 2 * B}:${c.h + 2 * B}:${B}:${B}:color=0xE8D09C,format=yuva420p,${fades(c.start)}[cz${si}_${k}]`,
    );
    filters.push(
      `color=c=black@0.6:s=${c.w + 2 * B}x${c.h + 2 * B}:r=${FPS}:d=${c.dur.toFixed(3)},format=rgba,` +
        `pad=iw+80:ih+80:40:40:color=black@0,gblur=sigma=12,` +
        `setpts=PTS-STARTPTS+${c.start.toFixed(3)}/TB,${fades(c.start)}[csh${si}_${k}]`,
    );
    filters.push(
      `[cb${si}_${k}][csh${si}_${k}]overlay=x=${c.x - 40 + 6}:y=${c.y - 40 + 10}:eof_action=pass[cv${si}_${k}]`,
    );
    filters.push(`[cv${si}_${k}][cz${si}_${k}]overlay=x=${c.x}:y=${c.y}:eof_action=pass[cw${si}_${k}]`);
    v = `cw${si}_${k}`;
  }
  if (g.lt && g.lowerThird.dim) {
    // Behind an end card: the picture softens and darkens over `ramp` seconds as the card comes in.
    const { blur = 14, darken = 0.14, ramp = 1 } = g.lowerThird.dim;
    const s0 = g.lt.start.toFixed(3);
    filters.push(`[${v}]split=2[da${si}][db${si}]`);
    filters.push(`[db${si}]gblur=sigma=${blur},eq=brightness=${-darken}:saturation=0.8[dc${si}]`);
    filters.push(`[da${si}][dc${si}]blend=all_expr='A+(B-A)*clip((T-${s0})/${ramp},0,1)'[dd${si}]`);
    v = `dd${si}`;
  }
  if (g.lt && !g.lowerThird.until) {
    // The lower third: way in, hold, way out (transparent PNGs), placed at its start and laid over
    // the picture; converted with the picture's own matrix and range so the parchment's colours hold.
    const { dir, box, start, hold } = g.lt;
    const i0 = input++;
    args.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, 'in-%03d.png'));
    const i1 = input++;
    args.push(
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-t',
      hold.toFixed(3),
      '-i',
      path.join(dir, 'hold.png'),
    );
    const outIn = g.lt.outSeconds ? input++ : -1;
    if (outIn >= 0)
      args.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, 'out-%03d.png'));
    filters.push(
      `[${i0}:v][${i1}:v]${outIn >= 0 ? `[${outIn}:v]` : ''}concat=n=${outIn >= 0 ? 3 : 2}:v=1:a=0,format=rgba,` +
        `scale=out_color_matrix=bt709:out_range=tv,format=yuva420p,` +
        `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[lt${si}]`,
    );
    filters.push(`[${v}][lt${si}]overlay=x=${box.x}:y=${box.y}:eof_action=pass:format=yuv420[vl${si}]`);
    v = `vl${si}`;
    // `duck` dB: the sound dips under an end card as it comes in (no silence).
    if (g.lowerThird.duck) {
      const s0 = g.lt.start.toFixed(3);
      const k = (1 - 10 ** (-g.lowerThird.duck / 20)).toFixed(4);
      filters.push(`[${a}]volume='1-${k}*clip((t-${s0})/1,0,1)':eval=frame[ad${si}]`);
      a = `ad${si}`;
    }
  }
  const fi = g.fadeIn,
    fo = g.fadeOut;
  const vf = [fi ? `fade=in:st=0:d=${fi}` : '', fo ? `fade=out:st=${(len - fo).toFixed(3)}:d=${fo}` : ''];
  const af = [fi ? `afade=in:st=0:d=${fi}` : '', fo ? `afade=out:st=${(len - fo).toFixed(3)}:d=${fo}` : ''];
  filters.push(`[${v}]${vf.filter(Boolean).join(',') || 'null'}[sv]`);
  filters.push(`[${a}]${af.filter(Boolean).join(',') || 'anull'}[sa]`);
  g.file = path.join(segDir, `${String(si + 1).padStart(2, '0')}-${g.id}.mkv`);
  await run('ffmpeg', [
    ...args,
    ...['-filter_complex', filters.join(';'), '-map', '[sv]', '-map', '[sa]'],
    ...['-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-pix_fmt', 'yuv420p'],
    ...colorTags,
    ...['-c:a', 'pcm_s16le', '-ar', '48000', g.file],
  ]);
  // Loudness (EBU R128): each section is levelled with one gain (no compressor, so nothing pumps)
  // to the reel's `loudness` (LUFS; a segment's own `loudness` wins), with its true peak kept at or
  // under `truePeak` dBTP (the gain is lowered if it would push a peak over).
  if (reel.loudness) {
    const m = await loudness(g.file);
    const target = g.loudness ?? reel.loudness;
    const ceiling = reel.truePeak ?? -1;
    g.gain = Math.min(target - m.I, ceiling - m.TP);
    g.measured = m;
  } else g.gain = 0;
  log(`segment ${g.id} (${g.length.toFixed(2)} s${g.gain ? `, gain ${g.gain.toFixed(1)} dB` : ''})`);
}
log(`segments cut in ${Math.round((Date.now() - t0) / 1000)} s`);

// Segments in order: a crossfade where a segment asks for one, otherwise straight on (each side
// has already faded through black).
const args = ['-y', '-loglevel', 'error'];
const filters = [];
for (const [si, g] of segments.entries()) {
  args.push('-i', g.file);
  filters.push(
    `[${si}:v]settb=AVTB,setpts=PTS-STARTPTS[sv${si}]`,
    `[${si}:a]asetpts=PTS-STARTPTS${g.gain ? `,volume=${g.gain.toFixed(2)}dB` : ''}[sa${si}]`,
  );
}
{
  let v = 'sv0',
    a = 'sa0',
    len = segments[0].length;
  for (let si = 1; si < segments.length; si++) {
    const x = segments[si].crossfadeIn;
    if (x) {
      filters.push(
        `[${v}][sv${si}]xfade=transition=fade:duration=${x}:offset=${(len - x).toFixed(3)}[jv${si}]`,
      );
      filters.push(`[${a}][sa${si}]acrossfade=d=${x}:c1=tri:c2=tri[ja${si}]`);
    } else filters.push(`[${v}][${a}][sv${si}][sa${si}]concat=n=2:v=1:a=1[jv${si}][ja${si}]`);
    v = `jv${si}`;
    a = `ja${si}`;
    len += segments[si].length - x;
  }
  // Lower thirds that span joins (`until`) go over the joined picture, at their place in the reel.
  let at = 0;
  let nextInput = segments.length;
  for (const [si, g] of segments.entries()) {
    at -= g.crossfadeIn;
    g.reelStart = at;
    at += g.length;
    if (!g.lt || !g.lowerThird.until) continue;
    const { dir, box, start, hold } = g.lt;
    const base = nextInput;
    nextInput += 3;
    args.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, 'in-%03d.png'));
    args.push(...['-loop', '1', '-framerate', String(FPS), '-t', hold.toFixed(3)]);
    args.push('-i', path.join(dir, 'hold.png'));
    args.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(dir, 'out-%03d.png'));
    filters.push(
      `[${base}:v][${base + 1}:v][${base + 2}:v]concat=n=3:v=1:a=0,format=rgba,` +
        `scale=out_color_matrix=bt709:out_range=tv,format=yuva420p,` +
        `setpts=PTS-STARTPTS+${(g.reelStart + start).toFixed(3)}/TB[lj${si}]`,
    );
    filters.push(`[${v}][lj${si}]overlay=x=${box.x}:y=${box.y}:eof_action=pass:format=yuv420[vj${si}]`);
    v = `vj${si}`;
  }
  filters.push(`[${v}]null[v]`, `[${a}]anull[a]`);
}

const final = path.join(out, reel.output ?? `${reel.id}.mp4`);
const temp = path.join(work, `${reel.id}.tmp.mp4`);
log(`joining ${segments.length} segments (${total.toFixed(2)} s) at ${W}×${H}, ${quality}`);
t0 = Date.now();
await run('ffmpeg', [
  ...args,
  '-filter_complex',
  filters.join(';'),
  ...['-map', '[v]', '-map', '[a]'],
  ...['-r', String(FPS), '-c:v', 'libx264', '-preset', encoding.preset],
  ...(encoding.videoBitrate ? ['-b:v', encoding.videoBitrate] : ['-crf', encoding.crf]),
  ...(encoding.tune ? ['-tune', encoding.tune] : []),
  ...(encoding.profile ? ['-profile:v', encoding.profile] : []),
  ...['-pix_fmt', 'yuv420p'],
  ...['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'],
  ...['-c:a', 'aac', '-b:a', encoding.audioBitrate, '-ar', '48000'],
  ...['-movflags', '+faststart'],
  temp,
]);
fs.renameSync(temp, final);
const duration = await probeDuration(final);
log(`wrote ${final} (${duration.toFixed(2)} s) in ${Math.round((Date.now() - t0) / 1000)} s`);

// A poster frame for the page's player (the reel opens on a fade from black).
const poster = path.join(out, `${reel.id}-poster.jpg`);
await run('ffmpeg', [
  ...['-y', '-loglevel', 'error', '-ss', String(reel.posterAt ?? 3), '-i', final],
  ...['-frames:v', '1', '-q:v', '2', poster],
]);

// Still stretches in the finished reel (no change for 0.6 s or more): a capture stall would show
// here, but so does a static screen (the Chart, a quiz or a card); the takes' `gaps` tell them apart.
const freeze = await run('ffmpeg', [
  ...['-hide_banner', '-i', final, '-vf', 'freezedetect=n=0.002:d=0.6', '-an', '-f', 'null', '-'],
]);
// Each section's loudness in the finished reel.
{
  let at = 0;
  for (const g of segments) {
    at -= g.crossfadeIn;
    g.final = await loudness(final, at, at + g.length);
    at += g.length;
  }
}
const whole = await loudness(final);

const still = [...freeze.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => [
  +(+m[1]).toFixed(2),
  +(+m[2]).toFixed(2),
]);

// ---- review sheets and the page -----------------------------------------------------------------

/** The part and take time `k` (0–1) of the way through a segment's kept picture. */
function keptTime(g, k) {
  let want = k * g.length;
  for (let pi = 0; pi < g.pieces.length; pi++) {
    const p = g.pieces[pi];
    const len = p.b - p.a - (pi ? p.xfade : 0);
    if (want <= len || pi === g.pieces.length - 1) return [p, p.a + (pi ? p.xfade : 0) + Math.min(want, len)];
    want -= len;
  }
  return [g.pieces.at(-1), g.pieces.at(-1).b];
}

const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const partsText = (row) =>
  row.parts
    .map(
      (p, i) =>
        `${i ? `crossfade ${p.xfade} s → ` : ''}<b>${esc(p.take)}</b> ${p.in.toFixed(2)}–${p.out.toFixed(2)} s`,
    )
    .join(' ');
let reelAt = 0;
const report = [];
for (const [si, g] of segments.entries()) {
  reelAt -= g.crossfadeIn;
  const name = `${String(si + 1).padStart(2, '0')}-${g.id}`;
  const firstP = g.pieces[0],
    lastP = g.pieces.at(-1);
  const shots = [
    ['in', firstP, firstP.a + 0.02],
    ['25%', ...keptTime(g, 0.25)],
    ['50%', ...keptTime(g, 0.5)],
    ['75%', ...keptTime(g, 0.75)],
    ['out', lastP, lastP.b - 0.05],
  ];
  // Extra frames a segment asks for (`checkFrames: [{ label, part = 0, at }]`, `at` a take time).
  for (const cf of g.checkFrames ?? []) {
    const p = g.pieces[cf.part ?? 0];
    shots.push([cf.label, p, timeIn(p.take, cf.at, `${g.id} check frame`)]);
  }
  // Each crossfade's two sides.
  for (let pi = 1; pi < g.pieces.length; pi++)
    shots.push(
      [`join ${pi} from`, g.pieces[pi - 1], g.pieces[pi - 1].b - 0.05],
      [`join ${pi} to`, g.pieces[pi], g.pieces[pi].a + 0.02],
    );
  shots.sort((x, y) => g.pieces.indexOf(x[1]) - g.pieces.indexOf(y[1]) || x[2] - y[2]);
  // The lower third at full hold, from the finished reel (also kept full size for checking).
  let ltFull = null;
  if (g.lt) {
    const t = reelAt + g.lt.holdStart + g.lt.hold / 2;
    const reelTake = { take: { raw: final, scenario: path.basename(final) } };
    shots.push(['lower third (hold)', reelTake, t]);
    // `showUnroll: true`: three frames of the way in (25 %, 60 %, unrolled with the seal down).
    if (g.lowerThird.showUnroll) {
      const s0 = reelAt + g.lt.start;
      shots.push(
        ['unroll 25 %', reelTake, s0 + 0.25 * g.lt.unrollSeconds],
        ['unroll 60 %', reelTake, s0 + 0.6 * g.lt.unrollSeconds],
        ['unrolled, seal down', reelTake, s0 + g.lt.inSeconds + 0.04],
      );
    }
    ltFull = `review/${reel.id}/${name}-lower-third.png`;
    await run('ffmpeg', [
      ...['-y', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', final],
      ...['-frames:v', '1', path.join(out, ltFull)],
    ]);
  }
  // Each close-up at full hold (sheet frame and a full-size PNG).
  for (const [k, c] of g.cu.entries()) {
    const t = reelAt + c.start + c.dur / 2;
    shots.push([
      `close-up: ${c.label ?? k + 1}`,
      { take: { raw: final, scenario: path.basename(final) } },
      t,
    ]);
    await run('ffmpeg', [
      ...['-y', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', final],
      ...['-frames:v', '1', path.join(out, `review/${reel.id}/${name}-closeup-${k + 1}.png`)],
    ]);
  }
  const frames = [];
  for (const [label, p, t] of shots) {
    const jpg = path.join(work, 'frames', `${name}-${frames.length}.jpg`);
    fs.mkdirSync(path.dirname(jpg), { recursive: true });
    await run('ffmpeg', [
      ...['-y', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', p.take.raw],
      ...['-frames:v', '1', '-vf', 'scale=640:-1', '-q:v', '3', jpg],
    ]);
    frames.push({
      label,
      take: p.take.scenario,
      t,
      src: `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`,
    });
  }
  // Sound level (dBFS, 0.25 s) just inside each end of each part: high at an end means a cut word.
  const levels = g.pieces.map((p) => [levelAt(p.take, p.a + 0.15), levelAt(p.take, p.b - 0.15)]);
  const row = {
    id: g.id,
    label: g.label,
    parts: g.pieces.map((p) => ({
      take: p.take.scenario,
      in: +p.a.toFixed(2),
      out: +p.b.toFixed(2),
      xfade: p.xfade,
    })),
    length: +g.length.toFixed(2),
    crossfadeIn: g.crossfadeIn,
    reelStart: +reelAt.toFixed(2),
    reelEnd: +(reelAt + g.length).toFixed(2),
    levelsDb: levels,
    loudness: {
      gainDb: +(g.gain ?? 0).toFixed(1),
      lufs: +g.final.I.toFixed(1),
      truePeakDbtp: +g.final.TP.toFixed(1),
    },
    closeups: g.cu.map((c) => ({
      label: c.label,
      in: +(reelAt + c.start).toFixed(2),
      out: +(reelAt + c.start + c.dur).toFixed(2),
      full: `review/${reel.id}/${name}-closeup-${g.cu.indexOf(c) + 1}.png`,
    })),
    takeFps: [...new Set(g.pieces.map((p) => p.take.fps))],
    takeMaxGapMs: Math.max(...g.pieces.map((p) => p.take.maxGapMs ?? 0)),
    sheet: `review/${reel.id}/${name}.png`,
    ...(g.lt
      ? {
          lowerThird: {
            title: g.lowerThird.t,
            end: g.lowerThird.layout === 'end',
            in: +(reelAt + g.lt.start).toFixed(2),
            holdFrom: +(reelAt + g.lt.holdStart).toFixed(2),
            holdTo: +(reelAt + g.lt.holdStart + g.lt.hold).toFixed(2),
            out: +(reelAt + g.lt.end).toFixed(2),
            full: ltFull,
          },
        }
      : {}),
  };
  reelAt += g.length;
  await sheetPage.setContent(`<!doctype html><html><head><style>
    body{margin:0;padding:18px 20px;background:#06121b;color:#f6ecd6;font:14px system-ui,sans-serif;width:max-content}
    h1{font:400 24px Georgia,serif;margin:0 0 4px}.meta{color:#b9d8e5;margin-bottom:12px}
    .row{display:flex;gap:10px}figure{margin:0}img{display:block;width:320px;border:1px solid #2c4150}
    figcaption{margin-top:4px;color:#e8c88a}
  </style></head><body><h1>${si + 1}. ${esc(g.label)}</h1>
  <div class="meta">${partsText(row)} · <b>${row.length.toFixed(2)} s</b> · reel ${fmt(row.reelStart)}–${fmt(row.reelEnd)}</div>
  <div class="row">${frames
    .map(
      (f) =>
        `<figure><img src="${f.src}"><figcaption>${esc(f.label)} · ${esc(f.take)} ${f.t.toFixed(2)} s</figcaption></figure>`,
    )
    .join('')}</div></body></html>`);
  await sheetPage.locator('body').screenshot({ path: path.join(out, row.sheet) });
  report.push(row);
}
await browser.close();

const summary = {
  reel: reel.id,
  file: final,
  duration: +duration.toFixed(2),
  planned: +total.toFixed(2),
  size: `${W}x${H}`,
  fps: FPS,
  quality,
  bytes: fs.statSync(final).size,
  loudness: { lufs: +whole.I.toFixed(1), truePeakDbtp: +whole.TP.toFixed(1) },
  still,
  warnings,
  segments: report,
  built: new Date().toISOString(),
};
fs.writeFileSync(path.join(out, `${reel.id}.json`), JSON.stringify(summary, null, 1));

const mb = (b) => `${(b / 1_000_000).toFixed(1)} MB`;
// Earlier versions (other reels' edit reports in this folder), shown smaller below this one.
const earlier = (reel.alsoShow ?? [])
  .map((v) => {
    const file = path.join(out, `${v.reel}.json`);
    if (!fs.existsSync(file)) return null;
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const poster = `${v.reel}-poster.jpg`;
    return `<div class="older"><h2>${esc(v.label)}</h2>
<video controls preload="metadata" src="${esc(path.basename(r.file))}"${
      fs.existsSync(path.join(out, poster)) ? ` poster="${esc(poster)}"` : ''
    }></video>
<div class="meta">${esc(path.basename(r.file))} · ${fmt(r.duration)} · ${esc(r.size)} · ${mb(r.bytes)} ·
<a href="${esc(v.reel)}.json">edit report</a>${v.note ? ` · ${esc(v.note)}` : ''}</div></div>`;
  })
  .filter(Boolean)
  .join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(reel.title ?? reel.id)}</title>
<style>
body{margin:0;padding:28px 32px 48px;background:#06121b;color:#f6ecd6;font-family:Georgia,serif}
h1{font-weight:300;letter-spacing:.06em;margin:0 0 4px}
p.lead{margin:0 0 22px;color:rgb(246 236 214/70%);font-style:italic}
.hero{max-width:1400px;background:rgb(10 22 32/70%);border:1px solid rgb(232 200 138/25%);border-radius:14px;overflow:hidden;margin-bottom:30px}
.hero video{display:block;width:100%;aspect-ratio:16/9;background:#000}
.hero .meta{padding:12px 18px;font:14px system-ui,sans-serif;color:#b9d8e5}
h2{font-weight:400;font-size:22px;margin:0 0 14px}
.seg{margin:0 0 22px;background:rgb(10 22 32/70%);border:1px solid rgb(232 200 138/25%);border-radius:12px;padding:14px 16px;max-width:1400px}
.seg h3{margin:0 0 6px;font-weight:400;font-size:19px}
.seg .meta{font:13px system-ui,sans-serif;color:#b9d8e5;margin-bottom:10px}
.seg img{display:block;max-width:100%;border-radius:6px}
.warn{color:#ffb4a0;font:14px system-ui,sans-serif}
.older{max-width:760px;margin:30px 0 34px;background:rgb(10 22 32/70%);border:1px solid rgb(232 200 138/25%);border-radius:12px;overflow:hidden}
.older h2{margin:12px 16px 10px}
.older video{display:block;width:100%;aspect-ratio:16/9;background:#000}
.older .meta{padding:10px 16px;font:13px system-ui,sans-serif;color:#b9d8e5}
a{color:#e8c88a}
</style></head><body>
<h1>${esc(reel.title ?? reel.id)}${reel.version ? ` · ${esc(reel.version)}` : ''}</h1>
<p class="lead">${esc(reel.lead ?? 'Recorded live from the game with its own sound.')}</p>
<div class="hero"><video controls preload="metadata" src="${esc(path.basename(final))}" poster="${esc(path.basename(poster))}"></video>
<div class="meta">${esc(path.basename(final))} · ${fmt(duration)} · ${W}×${H}, ${FPS} fps · ${mb(summary.bytes)} ·
<a href="${esc(path.basename(final))}" download>download</a> · <a href="${esc(reel.id)}.json">edit report</a></div></div>
${warnings.length ? `<p class="warn">Check: ${warnings.map(esc).join('<br>')}</p>` : ''}
${earlier}
<h2>Segments${reel.version ? ` (${esc(reel.version)})` : ''}</h2>
${report
  .map(
    (r, i) => `<div class="seg"><h3>${i + 1}. ${esc(r.label)}</h3>
<div class="meta">${r.crossfadeIn ? `crossfade ${r.crossfadeIn} s from the one before · ` : ''}${partsText(r)} · <b>${r.length.toFixed(2)} s</b> · in the reel at ${fmt(r.reelStart)}–${fmt(r.reelEnd)}${
      r.lowerThird
        ? `<br>${r.lowerThird.end ? 'End card' : 'Lower third'} “${esc(r.lowerThird.title)}”: in ${fmt(r.lowerThird.in)}, full ${fmt(r.lowerThird.holdFrom)}–${fmt(r.lowerThird.holdTo)}, gone ${fmt(r.lowerThird.out)} · <a href="${esc(r.lowerThird.full)}">full-size frame</a>`
        : ''
    }${r.closeups
      .map(
        (c) =>
          `<br>Close-up “${esc(c.label ?? '')}”: ${fmt(c.in)}–${fmt(c.out)} · <a href="${esc(c.full)}">full-size frame</a>`,
      )
      .join('')}${
      r.loudness
        ? `<br>Loudness ${r.loudness.lufs} LUFS, true peak ${r.loudness.truePeakDbtp} dBTP (gain ${r.loudness.gainDb} dB)`
        : ''
    }</div>
<a href="${esc(r.sheet)}"><img src="${esc(r.sheet)}" alt="Review frames for ${esc(r.label)}"></a></div>`,
  )
  .join('\n')}
</body></html>`;
fs.writeFileSync(path.join(out, reel.index ?? 'index.html'), html);
console.log(JSON.stringify(summary, null, 1));
