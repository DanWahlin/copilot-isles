#!/usr/bin/env node
// Films a scenario played live in the game (real key presses at a human pace) and turns it into an
// MP4 with the game's own audio, a title card, and a contact sheet, plus an index page that plays
// every video in the output folder. See tools/video/README.md.
//
//   node tools/video/record.mjs --list
//   node tools/video/record.mjs --scenario=<id>[,<id>…] [--base=http://127.0.0.1:5395] [--tier=high]
//        [--out=<dir>] [--no-audio] [--no-title] [--keep]
//   node tools/video/record.mjs --scenario=<id> --refinish   (rebuilds the MP4 from a --keep run)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFlags } from '../lib/browser.mjs';
import {
  Recorder,
  contactSheet,
  finalize,
  launch,
  makeApi,
  openDevPage,
  renderTitle,
  run,
  writeIndex,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5395';
const tier = opt.tier || 'high';
const out = path.resolve(opt.out || path.join(os.homedir(), 'Movies', 'copilot-isles'));

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
  const work = path.join(out, '.work', id);
  const notes = [];
  const log = (m) => {
    notes.push(m);
    console.log(`[${id}] ${m}`);
  };
  const t0 = Date.now();
  let rec = null;
  const { browser, page } = await launch({ onPcm: (b) => rec?.push(b) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    let take;
    if (opt.refinish) {
      take = JSON.parse(fs.readFileSync(path.join(work, 'take.json'), 'utf8'));
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
        await openDevPage(page, { base, tier, flags: sc.flags ?? [] });
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
      fs.writeFileSync(path.join(work, 'take.json'), JSON.stringify(take, null, 1));
      log(`recorded ${take.duration.toFixed(1)} s (${take.frames} frames, ${take.cuts.length} cuts)`);
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
    if (!opt.keep && !opt.refinish) fs.rmSync(work, { recursive: true, force: true });
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
writeIndex(out);
console.log(JSON.stringify({ out, index: path.join(out, 'index.html'), report }, null, 1));
process.exit(report.some((r) => r.failed) ? 1 : 0);
