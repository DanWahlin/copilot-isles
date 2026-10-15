#!/usr/bin/env node
// Films a scenario played live in the game (real key presses at a human pace) and turns it into an
// MP4 with the game's own audio, a title card, and a contact sheet, plus an index page that plays
// every video in the output folder. See tools/video/README.md.
//
//   node tools/video/record.mjs --list
//   node tools/video/record.mjs --scenario=<id>[,<id>…] [--base=http://127.0.0.1:5395] [--tier=high]
//        [--out=<dir>] [--quality=review|high|master] [--size=1280x720] [--jpeg=90] [--no-audio]
//        [--no-title] [--keep] [--take-only] [--work=<dir>]
//   node tools/video/record.mjs --scenario=<id> --refinish   (rebuilds the MP4 from a --keep run)
//   node tools/video/record.mjs --recompress --out=<dir>    (re-encodes existing MP4s to review quality)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFlags } from '../lib/browser.mjs';
import {
  FPS,
  QUALITY_PRESETS,
  Recorder,
  contactSheet,
  finalize,
  launch,
  makeApi,
  openDevPage,
  renderTitle,
  run,
  setJpegQuality,
  setSize,
  writeIndex,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5395';
const tier = opt.tier || 'high';
if (opt.recompress && (typeof opt.out !== 'string' || !opt.out.trim())) {
  console.error('--recompress requires --out=<dir>');
  process.exit(2);
}
const out = path.resolve(opt.out || path.join(os.homedir(), 'Movies', 'copilot-isles'));
const workRoot = path.resolve(typeof opt.work === 'string' ? opt.work : path.join(out, '.work'));
try {
  if (opt.size) setSize(String(opt.size));
  if (opt.jpeg) setJpegQuality(opt.jpeg);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

function formatBytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function probeMedia(file) {
  const result = JSON.parse(
    await run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type',
      '-of',
      'json',
      file,
    ]),
  );
  return {
    duration: Number(result.format?.duration),
    streams: new Set((result.streams ?? []).map((stream) => stream.codec_type)),
  };
}

async function recompress(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Output directory does not exist: ${dir}`);
    return 1;
  }
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mp4'))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) {
    console.error(`No MP4 files found in ${dir}`);
    return 1;
  }

  const workDir = path.join(dir, '.work');
  fs.mkdirSync(workDir, { recursive: true });
  const encoding = QUALITY_PRESETS.review;
  const results = [];
  for (const name of files) {
    const input = path.join(dir, name);
    const id = path.parse(name).name;
    const temp = path.join(workDir, `${id}.review.tmp.mp4`);
    const passLogfile = path.join(workDir, `${id}.review-${process.pid}-${Date.now()}`);
    const beforeBytes = fs.statSync(input).size;
    console.log(`[video] recompressing ${name} (${formatBytes(beforeBytes)})`);
    try {
      const before = await probeMedia(input);
      if (!Number.isFinite(before.duration)) throw new Error('input duration is not available');
      if (!before.streams.has('video') || !before.streams.has('audio'))
        throw new Error('input must have audio and video streams');
      const commonArgs = [
        '-y',
        '-loglevel',
        'error',
        '-i',
        input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-map_metadata',
        '0',
      ];
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
          temp,
        ]);
      } finally {
        for (const suffix of ['-0.log', '-0.log.mbtree'])
          fs.rmSync(`${passLogfile}${suffix}`, { force: true });
      }
      const after = await probeMedia(temp);
      if (!after.streams.has('video') || !after.streams.has('audio'))
        throw new Error('encoded file does not have audio and video streams');
      const drift = Math.abs(after.duration - before.duration);
      if (!Number.isFinite(after.duration) || drift > 0.1)
        throw new Error(`duration changed by ${drift.toFixed(3)} s`);
      const afterBytes = fs.statSync(temp).size;
      fs.renameSync(temp, input);
      results.push({ name, beforeBytes, afterBytes, error: null });
    } catch (error) {
      fs.rmSync(temp, { force: true });
      results.push({ name, beforeBytes, afterBytes: fs.statSync(input).size, error: error.message });
    }
  }

  const widths = [18, 12, 12, 12, 8];
  const row = (values) =>
    values
      .map((value, i) =>
        i === 0 || i === 4 ? String(value).padEnd(widths[i]) : String(value).padStart(widths[i]),
      )
      .join(' ');
  console.log('\nReview-quality size summary');
  console.log(row(['Video', 'Before', 'After', 'Saved', 'Status']));
  for (const result of results) {
    console.log(
      row([
        result.name,
        formatBytes(result.beforeBytes),
        formatBytes(result.afterBytes),
        formatBytes(result.beforeBytes - result.afterBytes),
        result.error ? 'FAILED' : 'OK',
      ]),
    );
    if (result.error) console.error(`  ${result.name}: ${result.error}`);
  }
  const beforeTotal = results.reduce((sum, result) => sum + result.beforeBytes, 0);
  const afterTotal = results.reduce((sum, result) => sum + result.afterBytes, 0);
  console.log(
    row([
      'TOTAL',
      formatBytes(beforeTotal),
      formatBytes(afterTotal),
      formatBytes(beforeTotal - afterTotal),
      '',
    ]),
  );
  return results.some((result) => result.error) ? 1 : 0;
}

if (opt.recompress) process.exit(await recompress(out));

const quality = opt.quality || 'review';
if (!Object.hasOwn(QUALITY_PRESETS, quality)) {
  console.error(`Unknown quality "${quality}". Use --quality=review, high or master.`);
  process.exit(1);
}

const scenarios = new Map();
for (const f of fs.readdirSync(path.join(HERE, 'scenarios')).sort()) {
  if (!f.endsWith('.mjs')) continue;
  const s = (await import(pathToFileURL(path.join(HERE, 'scenarios', f)).href)).default;
  scenarios.set(s.id, s);
}
const list = () => {
  console.log('Scenarios:');
  for (const s of scenarios.values()) console.log(`  ${s.id.padEnd(16)} ${s.title} (${s.island})`);
};
if (opt.list || !opt.scenario) {
  list();
  process.exit(opt.list ? 0 : 1);
}
const ids = String(opt.scenario)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const unknown = ids.filter((id) => !scenarios.has(id));
if (unknown.length) {
  console.error(`Unknown scenario: ${unknown.join(', ')}`);
  list();
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const report = [];
for (const id of ids) {
  const sc = scenarios.get(id);
  const work = path.join(workRoot, id);
  const notes = [];
  const log = (m) => {
    notes.push(m);
    console.log(`[${id}] ${m}`);
  };
  const t0 = Date.now();
  let rec = null;
  const { browser, page } = await launch({ onPcm: (b) => rec?.push(b), cursor: !!sc.cursor });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    let take;
    if (opt.refinish) {
      take = JSON.parse(fs.readFileSync(path.join(work, 'take.json'), 'utf8'));
      // Finish at the size it was filmed at.
      if (take.size) setSize(take.size);
      log('rebuilding from the kept recording');
    } else {
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
      // A hung page (a page.evaluate never returns if the renderer stalls) fails this scenario
      // instead of the whole batch.
      let timer;
      const watchdog = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out (15 min)')), 15 * 60_000);
      });
      const film = async () => {
        log(`loading (${tier})`);
        // A scenario can open its own page (the opening starts from the real title screen).
        if (sc.open) await sc.open(page, { base, tier });
        else await openDevPage(page, { base, tier, time: sc.time ?? 16, flags: sc.flags ?? [] });
        const setupApi = makeApi(page, null, { log });
        await sc.setup?.(page, setupApi);
        rec = new Recorder(page, work);
        const api = makeApi(page, rec, { log });
        log('recording');
        await rec.start({ audio: !opt['no-audio'] });
        await sc.play(page, api);
        await api.releaseAll();
        return rec.stop();
      };
      take = await Promise.race([film(), watchdog]).finally(() => clearTimeout(timer));
      take.scenario = id;
      take.tier = tier;
      take.errors = errors;
      take.notes = notes;
      fs.writeFileSync(path.join(work, 'take.json'), JSON.stringify(take, null, 1));
      log(
        `recorded ${take.duration.toFixed(1)} s (${take.frames} frames, ${take.fps} fps delivered, ` +
          `longest gap ${take.maxGapMs} ms, ${take.stalls} gaps over 100 ms, ${take.cuts.length} cuts)`,
      );
    }
    if (opt['take-only']) {
      // The reel builder (reel.mjs) edits from the kept take; no MP4 of its own.
      report.push({
        id,
        take: path.join(work, 'take.json'),
        duration: +take.duration.toFixed(1),
        notes,
        errors,
      });
      continue;
    }

    // A frame from the clip for the title card's background.
    const bg = path.join(work, 'bg.jpg');
    await run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      String(sc.titleFrame ?? 2),
      '-i',
      take.raw,
      '-frames:v',
      '1',
      bg,
    ]);
    const titlePng = path.join(work, 'title.png');
    if (!opt['no-title']) await renderTitle(browser, sc, bg, titlePng);
    const mp4 = path.join(out, `${id}.mp4`);
    const fin = await finalize({
      take,
      title: opt['no-title'] ? null : titlePng,
      out: mp4,
      audio: !opt['no-audio'],
      quality,
    });
    await contactSheet(mp4, path.join(out, `${id}.png`), opt['no-title'] ? 0 : 3);
    await run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      '6',
      '-i',
      mp4,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-1',
      path.join(out, `${id}.jpg`),
    ]);
    const meta = {
      id,
      order: sc.order,
      title: sc.title,
      island: sc.island,
      code: sc.code,
      who: sc.who,
      subtitle: sc.subtitle,
      chapter: sc.chapter,
      duration: fin.duration,
      recorded: new Date().toISOString(),
      tier,
      audioOffset: fin.offset,
      capture: {
        size: take.size,
        jpeg: take.jpeg,
        fps: take.fps,
        maxGapMs: take.maxGapMs,
        stalls: take.stalls,
      },
      kept: fin.keep,
      marks: take.marks.map((m) => ({ t: +((m.t - take.t0) / 1000).toFixed(2), label: m.label })),
      notes,
      errors,
    };
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(meta, null, 1));
    report.push({
      id,
      mp4,
      duration: +fin.duration.toFixed(1),
      audioOffset: +fin.offset.toFixed(3),
      notes,
      errors,
    });
    log(`wrote ${mp4} (${fin.duration.toFixed(1)} s) in ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!opt.keep && !opt.refinish && !opt['take-only']) fs.rmSync(work, { recursive: true, force: true });
  } catch (e) {
    log(`FAILED: ${e.stack || e.message}`);
    await page.screenshot({ path: path.join(out, `${id}-failed.png`) }).catch(() => undefined);
    report.push({ id, failed: e.message, notes, errors });
    if (rec?.ff && !rec.stopped)
      await Promise.race([rec.stop().catch(() => undefined), new Promise((r) => setTimeout(r, 10_000))]);
  } finally {
    await browser.close();
  }
}
if (!opt['take-only']) writeIndex(out);
console.log(JSON.stringify({ out, index: path.join(out, 'index.html'), report }, null, 1));
process.exit(report.some((r) => r.failed) ? 1 : 0);
