#!/usr/bin/env node
// Bakes the in-game chart label's art (docs/specs/LOWER-THIRDS.md §7): the torn, burnt-edged
// parchment and the blank wax seal, drawn once in Chrome from our own HTML/CSS (the look of the
// highlight reel's lower third, style A) and saved as small WebPs. The game draws them as plain
// images, so it never runs the SVG turbulence and displacement filters while the label animates.
//
//   node tools/ui/bake-chart-label.mjs [--out=src/game/chart-label]
//
// Geometry (video px, the reel's 1920×1080 card): the paper is 1180×236 with a margin for the rough
// edge and the drop shadow (left/right 40, top 30, bottom 56), so paper.webp is 1260×322 video px.
// The seal is 104 px across in a 150×150 box. Both are saved at SCALE device px per video px; the
// border-image slices in src/game/hud.css (.hud-label-paper) are in those image px. The filters use
// fixed seeds, so a re-bake gives the same edge.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launchChrome, parseFlags } from '../lib/browser.mjs';

const opt = parseFlags();
const out = path.resolve(opt.out || 'src/game/chart-label');
const SCALE = 1.25;
const PAPER = { w: 1180, h: 236, left: 40, top: 30, right: 40, bottom: 56 };
const SEAL = { d: 104, box: 150 };

const PAGE = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
.paper{position:absolute;left:${PAPER.left}px;top:${PAPER.top}px;width:${PAPER.w}px;height:${PAPER.h}px;
  background:
    radial-gradient(ellipse at 20% 30%,rgba(255,246,220,.55),transparent 55%),
    radial-gradient(ellipse at 80% 70%,rgba(196,150,90,.35),transparent 60%),
    radial-gradient(ellipse at 60% 20%,rgba(170,120,60,.18),transparent 50%),
    linear-gradient(180deg,#f3e3bd,#e8d09c);
  box-shadow:inset 0 0 38px 10px rgba(122,72,24,.55),inset 0 0 6px 2px rgba(80,40,10,.6);
  filter:url(#rough) drop-shadow(0 10px 22px rgba(0,0,0,.55))}
.grain{position:absolute;left:${PAPER.left + 8}px;top:${PAPER.top + 8}px;width:${PAPER.w - 16}px;
  height:${PAPER.h - 16}px;filter:url(#grain);mix-blend-mode:multiply;opacity:.35}
.seal{position:absolute;left:${(SEAL.box - SEAL.d) / 2}px;top:${(SEAL.box - SEAL.d) / 2 - 4}px;
  width:${SEAL.d}px;height:${SEAL.d}px;border-radius:50%;
  background:radial-gradient(circle at 38% 34%,#d0463a,#9b1d16 55%,#6d100c);
  box-shadow:0 6px 12px rgba(0,0,0,.5),inset 0 -6px 10px rgba(0,0,0,.35),inset 0 4px 8px rgba(255,160,140,.35);
  filter:url(#seal)}
</style></head><body>
<svg width="0" height="0" style="position:absolute">
  <filter id="rough" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.15  0 0 0 0.9 0"/>
  </filter>
  <filter id="seal" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7"/>
  </filter>
</svg>${body}</body></html>`;

const browser = await launchChrome({ gpu: false });
mkdirSync(out, { recursive: true });
const bake = async (name, w, h, body, quality) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: SCALE });
  await page.setContent(PAGE(w, h, body));
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  const webp = await sharp(png).webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
  const file = path.join(out, `${name}.webp`);
  writeFileSync(file, webp);
  const meta = await sharp(webp).metadata();
  console.log(
    `${path.relative(process.cwd(), file)}  ${meta.width}×${meta.height}  ${(webp.length / 1024).toFixed(1)} KB`,
  );
};
const W = PAPER.left + PAPER.w + PAPER.right;
const H = PAPER.top + PAPER.h + PAPER.bottom;
await bake('paper', W, H, '<div class="paper"></div><div class="grain"></div>', 72);
await bake('seal', SEAL.box, SEAL.box, '<div class="seal"></div>', 85);
await browser.close();
