// Renders the highlight reel's lower third (lower-third.html, style A) as transparent PNGs for
// reel.mjs to composite: the card and the seal are each drawn once (so the parchment's rough edge and
// grain are identical in every frame). The way in unrolls the card left to right like a scroll
// opening (a mask on the finished card, with a rolled curl on its leading edge), then the wax seal
// stamps down; the way out is a plain fade. Both are short PNG sequences; the hold is one still.
//
// Fonts: Fraunces, Alegreya, Alegreya SC and Cinzel (SIL Open Font License), downloaded once from
// Google Fonts into tools/.cache/fonts/ (git-ignored) and injected as data URLs, so a render never
// depends on the network after the first one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, '..', '.cache', 'fonts');
const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Alegreya:wght@500&family=Alegreya+SC:wght@700' +
  '&family=Cinzel:wght@700&family=Fraunces:opsz,wght@9..144,800&display=block';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0 Safari/537.36';
/** The faces the card needs, checked after loading (document.fonts.check). */
const FACES = ['500 29px Alegreya', '700 24px "Alegreya SC"', '700 40px Cinzel', '800 50px Fraunces'];

/**
 * Where a card sits in the 1920×1080 frame. `box`: the region rendered (with room for the shadow
 * and the seal), `paper`: the parchment's extent in box coordinates (the rough edge reaches a few
 * pixels past it), `seal`: the seal's centre in box coordinates and its diameter (it scales about
 * its centre as it stamps down). `lower` is the lower third; `end` is the reel's centred end card.
 */
const LAYOUTS = {
  lower: {
    box: { x: 0, y: 700, w: 1340, h: 380 },
    paper: { x0: 72, x1: 72 + 1180, y0: 1080 - 64 - 236 - 700, y1: 1080 - 64 - 700 },
    seal: { x: 72 + 1180 + 26 - 52, y: 1080 - 64 - 236 - 30 + 52 - 700, d: 104 },
  },
  end: {
    box: { x: 300, y: 220, w: 1320, h: 640 },
    paper: { x0: 110, x1: 110 + 1100, y0: 110, y1: 110 + 420 },
    seal: { x: 110 + 1100 + 26 - 60, y: 110 - 30 + 60, d: 120 },
  },
};
/** The lower third's region (reel.mjs places its overlay here). */
export const LT_BOX = LAYOUTS.lower.box;
/** The unroll (s), then the seal's stamp (s): the way in is both, the way out a fade. */
const UNROLL = 0.8;
const STAMP = 0.3;
export const LT_IN = UNROLL + STAMP;
export const LT_OUT = 0.5;

/** The Latin subsets of the fonts as an @font-face sheet with data URLs (downloaded once). */
export async function fontCss() {
  const cached = path.join(FONT_DIR, 'fonts.css');
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(FONT_DIR, { recursive: true });
    const css = await (await fetch(FONT_CSS, { headers: { 'User-Agent': UA } })).text();
    const blocks = css.split('/* ').filter((b) => /^latin(-ext)? \*\//.test(b));
    if (!blocks.length) throw new Error('no Latin font faces in the Google Fonts CSS');
    let out = '';
    for (const block of blocks) {
      const url = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
      if (!url) continue;
      const file = path.join(FONT_DIR, path.basename(new URL(url).pathname));
      if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      out += `/* ${block.replace(url, path.basename(file))}`;
    }
    fs.writeFileSync(cached, out);
  }
  return fs
    .readFileSync(cached, 'utf8')
    .replace(
      /url\(([^)]+\.woff2)\)/g,
      (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(FONT_DIR, f)).toString('base64')})`,
    );
}

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeOutBack = (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
const clamp = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/**
 * The pose `t` seconds into the way in. The reveal edge runs from just left of the parchment to
 * just past its right end (eased out over UNROLL); the curl on it is 30 px wide and shrinks away
 * over the last stretch. Then the seal stamps down: 125% to 100% with a small settle, its contact
 * shadow tightening as it lands.
 */
function inPose(t, { paper }) {
  const u = clamp(t / UNROLL);
  const e = easeOutCubic(u);
  const edge = paper.x0 - 16 + (paper.x1 + 16 - (paper.x0 - 16)) * e;
  const curl = 30 * (1 - smooth(0.78, 1, u));
  const s = clamp((t - UNROLL) / 0.25);
  const k = easeOutCubic(s);
  return {
    edge,
    // The mask runs on past the paper as the curl goes, uncovering the card's shadow on the right.
    clip: edge + 90 * smooth(0.8, 1, u),
    curl,
    cardA: 1,
    sealA: t < UNROLL ? 0 : clamp(s / 0.25),
    sealS: t < UNROLL ? 1.25 : 1.25 - 0.25 * easeOutBack(s),
    shadow: k,
  };
}

/** The way out: everything fades together (eased in), without moving. */
const outPose = (t, { box }) => {
  const a = 1 - clamp(t / LT_OUT) ** 2;
  return { edge: box.w, clip: box.w, curl: 0, cardA: a, sealA: a, sealS: 1, shadow: 1 };
};

/**
 * Renders one lower third into `dir`: `in-NNN.png` (the way in), `hold.png`, `out-NNN.png` (the way
 * out), each LT_BOX-sized with a transparent background, plus `card.png`/`seal.png` and `full.png`
 * (the hold over a transparent 1920×1080 frame, for checking). `text` is { k, t, b, ch, c, chLine };
 * with `layout: 'end'` it's the end card: { k (the small label), t (the title), tag (the line under
 * it), b, credit }, centred and larger, with an anchor on the seal.
 */
export async function renderLowerThird(browser, text, dir, { fps = 30, layout = 'lower' } = {}) {
  const L = LAYOUTS[layout];
  if (!L) throw new Error(`unknown card layout ${layout}`);
  const { box, paper } = L;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.rmSync(path.join(dir, f));
  const css = await fontCss();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const parts = {};
  let titleSize = null;
  for (const part of ['card', 'seal']) {
    await page.goto(
      `${pathToFileURL(path.join(HERE, 'lower-third.html')).href}?part=${part}&layout=${layout}`,
    );
    await page.addStyleTag({ content: css });
    await page.evaluate((t) => window.setText(t), text);
    // Load every face explicitly (a hidden part uses no text, so nothing would ask for them).
    await page.evaluate((faces) => Promise.all(faces.map((f) => document.fonts.load(f))), FACES);
    await page.evaluate(() => document.fonts.ready);
    const missing = await page.evaluate((faces) => faces.filter((f) => !document.fonts.check(f)), FACES);
    if (missing.length) throw new Error(`lower third: fonts not loaded: ${missing.join(', ')}`);
    titleSize = await page.evaluate(() => window.fitTitle());
    // Nothing may overflow the parchment.
    const over = await page.evaluate(() => {
      const box = document.querySelector('.lt').getBoundingClientRect();
      return [...document.querySelectorAll('.kicker, .title, .tag, .body, .chapter')]
        .filter((e) => e.offsetParent)
        .map((e) => ({ c: e.className, r: e.getBoundingClientRect(), sw: e.scrollWidth, cw: e.clientWidth }))
        .filter(({ r, sw, cw }) => sw > cw + 2 || r.right > box.right - 30 || r.bottom > box.bottom - 12)
        .map(({ c, r, sw, cw }) => `${c} ${Math.round(r.right)}×${Math.round(r.bottom)} (${sw}/${cw})`);
    });
    if (part === 'card' && over.length)
      throw new Error(`lower third "${text.t}": text overflows the card (${over.join(', ')})`);
    await page.waitForTimeout(100);
    const file = path.join(dir, `${part}.png`);
    await page.screenshot({
      path: file,
      omitBackground: true,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    });
    parts[part] = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  // The motion: the finished card is only masked (never redrawn), so its edge can't shimmer.
  const W = box.w,
    H = box.h;
  const curlTop = paper.y0 - 6,
    curlH = paper.y1 - paper.y0 + 12;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
    .full{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
    /* A faint shadow the curl casts back onto the paper just revealed (only where there's paper). */
    #cast{background:linear-gradient(to left,rgba(70,38,12,.38),rgba(70,38,12,0)) no-repeat;
      -webkit-mask:url(${parts.card}) 0 0/${W}px ${H}px no-repeat;mask:url(${parts.card}) 0 0/${W}px ${H}px no-repeat}
    /* The rolled curl: a cylinder of the same parchment, lit along its top, with a soft shadow. */
    #curl{position:absolute;top:${curlTop}px;height:${curlH}px;border-radius:50%/14px;
      background:
        linear-gradient(180deg,rgba(255,250,232,.7),rgba(255,250,232,0) 22%,rgba(0,0,0,0) 78%,rgba(70,38,12,.35)),
        linear-gradient(90deg,#9a6c34,#d9b97f 22%,#fbefcf 44%,#efdcae 58%,#c99d5e 82%,#7d5426);
      box-shadow:3px 8px 14px rgba(0,0,0,.45),inset 0 0 3px rgba(80,40,10,.55)}
    #sealShadow{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.6),rgba(0,0,0,0))}
    #seal{transform-origin:${L.seal.x}px ${L.seal.y}px}
  </style></head><body>
    <img id="card" class="full" src="${parts.card}"><div id="cast" class="full"></div>
    <div id="curl"></div><div id="sealShadow"></div><img id="seal" class="full" src="${parts.seal}">
  </body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const shoot = async (pose, file) => {
    await page.evaluate(
      ([p, W, sealC]) => {
        const $ = (id) => document.getElementById(id);
        $('card').style.clipPath = `inset(0 ${Math.max(0, W - p.clip)}px 0 0)`;
        $('card').style.opacity = String(p.cardA);
        const on = p.curl > 0.5;
        $('curl').style.display = on ? 'block' : 'none';
        $('curl').style.left = `${p.edge - p.curl * 0.35}px`;
        $('curl').style.width = `${p.curl}px`;
        $('cast').style.display = on ? 'block' : 'none';
        $('cast').style.backgroundPosition = `${p.edge - 44}px 0`;
        $('cast').style.backgroundSize = `${44 - p.curl * 0.35}px 100%`;
        $('cast').style.opacity = String(p.curl / 30);
        const d = sealC.d * (1.45 - 0.35 * p.shadow);
        Object.assign($('sealShadow').style, {
          left: `${sealC.x - d / 2}px`,
          top: `${sealC.y - d / 2 + 4 + 10 * (1 - p.shadow)}px`,
          width: `${d}px`,
          height: `${d}px`,
          opacity: String(p.sealA * (0.15 + 0.35 * p.shadow)),
        });
        $('seal').style.transform = `scale(${p.sealS})`;
        $('seal').style.opacity = String(p.sealA);
      },
      [pose, W, L.seal],
    );
    await page.screenshot({ path: path.join(dir, file), omitBackground: true });
  };
  const inFrames = Math.round(LT_IN * fps);
  const outFrames = Math.round(LT_OUT * fps);
  for (let k = 0; k < inFrames; k++) await shoot(inPose(k / fps, L), `in-${String(k).padStart(3, '0')}.png`);
  await shoot(inPose(LT_IN + 1, L), 'hold.png');
  for (let k = 1; k <= outFrames; k++)
    await shoot(outPose(k / fps, L), `out-${String(k - 1).padStart(3, '0')}.png`);
  // The hold over a full transparent frame, for checking at full size.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <img src="data:image/png;base64,${fs.readFileSync(path.join(dir, 'hold.png')).toString('base64')}"
      style="position:absolute;left:${box.x}px;top:${box.y}px"></body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.screenshot({ path: path.join(dir, 'full.png'), omitBackground: true });
  await page.close();
  return {
    dir,
    box,
    inFrames,
    outFrames,
    inSeconds: inFrames / fps,
    outSeconds: outFrames / fps,
    unrollSeconds: UNROLL,
    titleSize,
  };
}
