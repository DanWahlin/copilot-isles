import { isIslandId, islandEntry } from '../islands/registry';
import { ARCHIPELAGO, chapterParts } from '../ui/chart/archipelago';
import { CARTOUCHE, CHART_D, CHART_W, sheetUV, worldToPaper } from './chart-map';
import { islandShoreline, type IslandGrid } from './island-grid';
import { mulberry32 } from '../util/math';

/**
 * The Captain's Chart drawn in ink (Canvas 2D, once, at the start of the opening): the neatline,
 * rhumb lines and compass rose, the voyage route, every course island (Anchorage and Port Meridian
 * from their real coastlines, the rest still in fog), and their names. A second, smaller canvas holds
 * the masks the paper shader reads: R land, G shallows, B fog.
 */
export interface ChartArt {
  ink: HTMLCanvasElement;
  mask: HTMLCanvasElement;
}

const INK = '#4a3218';
const INK_SOFT = 'rgba(74, 50, 24, 0.5)';
const SEA_INK = 'rgba(46, 92, 112, 0.28)';
const COMPASS = sheetUV(585 / 1000, 365 / 700);

export function drawChartArt(grids: readonly IslandGrid[], inkWidth = 2048): ChartArt {
  const W = inkWidth;
  const H = Math.round((W * CHART_D) / CHART_W);
  const ink = canvas(W, H);
  const mW = 512;
  const mH = Math.round((mW * CHART_D) / CHART_W);
  const mask = canvas(mW, mH);
  const c = ink.getContext('2d')!;
  const m = mask.getContext('2d')!;
  // Opaque black base: the channels add up on it (transparent pixels would read as full strength).
  m.fillStyle = '#000';
  m.fillRect(0, 0, mW, mH);
  const px = (u: number) => u * W;
  const py = (v: number) => v * H;
  const unit = W / 1000;

  // Rhumb lines from the compass rose, and the double neatline.
  c.save();
  c.strokeStyle = 'rgba(107, 74, 32, 0.12)';
  c.lineWidth = 1.2 * unit;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    c.beginPath();
    c.moveTo(px(COMPASS.u), py(COMPASS.v));
    c.lineTo(px(COMPASS.u) + Math.cos(a) * W * 1.5, py(COMPASS.v) + Math.sin(a) * W * 1.5);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = INK_SOFT;
  c.lineWidth = 2.4 * unit;
  c.strokeRect(14 * unit, 14 * unit, W - 28 * unit, H - 28 * unit);
  c.lineWidth = 1.1 * unit;
  c.strokeRect(22 * unit, 22 * unit, W - 44 * unit, H - 44 * unit);

  // The sea's wavy hatching (it's what turns to water).
  c.strokeStyle = SEA_INK;
  c.lineWidth = 1.3 * unit;
  const rand = mulberry32(0xc0ffee);
  for (let i = 0; i < 320; i++) {
    const x = (0.04 + rand() * 0.92) * W;
    const y = (0.05 + rand() * 0.9) * H;
    const l = (8 + rand() * 10) * unit;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + l * 0.25, y - 3 * unit, x + l * 0.5, y);
    c.quadraticCurveTo(x + l * 0.75, y + 3 * unit, x + l, y);
    c.stroke();
  }

  // The voyage route in chapter order (dotted, as on the in-game chart).
  c.save();
  c.strokeStyle = 'rgba(122, 82, 38, 0.75)';
  c.lineWidth = 2.2 * unit;
  c.lineCap = 'round';
  c.setLineDash([0.1, 9 * unit]);
  const pts = ARCHIPELAGO.map((i) => {
    const q = sheetUV(i.x, i.y);
    return [px(q.u), py(q.v)] as const;
  });
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    c.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    );
  }
  c.stroke();
  c.restore();

  // The real islands: their coastlines, traced from the same height functions as the world.
  const p = { x: 0, y: 0, z: 0 };
  const real = new Set<string>();
  for (const grid of grids) {
    real.add(grid.src.id);
    const chains = islandShoreline(grid).filter((ch) => ch.closed && ch.length > 40);
    const path = (ctx: CanvasRenderingContext2D, sx: number, sy: number) => {
      ctx.beginPath();
      for (const ch of chains) {
        ch.points.forEach((q, i) => {
          worldToPaper(grid.src, q.x, 0, q.z, p);
          const x = (p.x / CHART_W + 0.5) * sx;
          const y = (p.z / CHART_D + 0.5) * sy;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
    };
    // Shallows and land into the mask (a soft halo round the land for the turquoise shallows).
    m.save();
    m.globalCompositeOperation = 'lighter';
    m.shadowColor = 'rgb(0, 255, 0)';
    m.shadowBlur = 22;
    m.fillStyle = 'rgb(255, 0, 0)';
    path(m, mW, mH);
    m.fill();
    m.restore();
    // Echo lines round the coast (classic chart water-lines), then the land wash and its coastline.
    c.save();
    path(c, W, H);
    for (const [w, a] of [
      [16, 0.06],
      [9, 0.1],
    ] as const) {
      c.strokeStyle = `rgba(46, 92, 112, ${a})`;
      c.lineWidth = w * unit;
      c.stroke();
    }
    c.fillStyle = 'rgba(214, 190, 128, 0.5)';
    c.fill('evenodd');
    c.strokeStyle = INK;
    c.lineWidth = 2.2 * unit;
    c.stroke();
    c.restore();
  }

  // The islands still to come: placeholders like the in-game chart's locked islands. A sketched
  // parchment island (the water flows round it), a dashed coast, a pencilled contour, and the
  // chapter's badge with a small lock.
  const badges: { x: number; y: number; num: string }[] = [];
  for (const [n, isl] of ARCHIPELAGO.entries()) {
    if (real.has(isl.id)) continue;
    const r = mulberry32(0x5eed + n * 977);
    const at = sheetUV(isl.x, isl.y);
    const rx = (34 + r() * 16) * unit;
    const ry = rx * (0.58 + r() * 0.2);
    const blobPts: [number, number][] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (r() - 0.5) * 0.25;
      const k = 1 + (r() - 0.5) * 0.32;
      blobPts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
    }
    const at2 = (sx: number, sy: number, scale = 1): [number, number][] =>
      blobPts.map(([x, y]) => [at.u * sx + (x / W) * sx * scale, at.v * sy + (y / H) * sy * scale]);
    // Land in the mask, with a halo for its shallows.
    m.save();
    m.globalCompositeOperation = 'lighter';
    m.shadowColor = 'rgb(0, 255, 0)';
    m.shadowBlur = 16;
    m.fillStyle = 'rgb(255, 0, 0)';
    closedCurve(m, at2(mW, mH));
    m.fill();
    m.restore();
    c.save();
    closedCurve(c, at2(W, H, 1.18));
    c.strokeStyle = 'rgba(46, 92, 112, 0.12)';
    c.lineWidth = 7 * unit;
    c.stroke();
    closedCurve(c, at2(W, H));
    c.fillStyle = 'rgba(226, 206, 156, 0.85)';
    c.fill();
    c.setLineDash([7 * unit, 5 * unit]);
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.8 * unit;
    c.stroke();
    c.setLineDash([2 * unit, 6 * unit]);
    c.lineWidth = 1.2 * unit;
    closedCurve(c, at2(W, H, 0.55));
    c.stroke();
    c.restore();
    badges.push({ x: px(at.u) - rx * 0.95, y: py(at.v) - ry * 0.9, num: chapterParts(isl.chapter).num });
  }
  for (const bdg of badges) {
    const R = 15 * unit;
    c.save();
    c.translate(bdg.x, bdg.y);
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fillStyle = '#efe0b8';
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1.6 * unit;
    c.stroke();
    c.font = `600 ${14 * unit}px Fraunces, Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(bdg.num, 0, 0.5 * unit);
    // The lock, hung off the badge's lower right.
    c.translate(R * 0.8, R * 0.8);
    c.fillStyle = INK;
    c.fillRect(-4.2 * unit, -1 * unit, 8.4 * unit, 6.8 * unit);
    c.beginPath();
    c.arc(0, -1 * unit, 2.8 * unit, Math.PI, 0);
    c.lineWidth = 1.4 * unit;
    c.stroke();
    c.restore();
  }

  compassRose(c, px(COMPASS.u), py(COMPASS.v), 64 * unit);

  // Names, in the chart's display face.
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const isl of ARCHIPELAGO) {
    const isReal = real.has(isl.id);
    const at = sheetUV(isl.x, isl.y);
    c.font = `${isReal ? 600 : 500} ${(isReal ? 19 : 15) * unit}px Fraunces, Georgia, serif`;
    c.lineWidth = 5 * unit;
    c.strokeStyle = 'rgba(236, 220, 176, 0.9)';
    c.fillStyle = isReal ? '#2a1d0e' : 'rgba(42, 29, 14, 0.75)';
    const y = py(at.v) + (isIslandId(isl.id) ? islandEntry(isl.id).chartLabelDy : isReal ? 92 : 62) * unit;
    c.strokeText(isl.name, px(at.u), y);
    c.fillText(isl.name, px(at.u), y);
  }
  // The cartouche.
  c.font = `italic 600 ${30 * unit}px Fraunces, Georgia, serif`;
  c.fillStyle = '#3a2812';
  c.fillText('The Kraken Isles', px(CARTOUCHE.u), py(CARTOUCHE.v) - 8 * unit);
  c.font = `${13 * unit}px Fraunces, Georgia, serif`;
  c.fillStyle = INK_SOFT;
  c.fillText('A chart for the captain, drawn by hand', px(CARTOUCHE.u), py(CARTOUCHE.v) + 20 * unit);

  return { ink, mask };
}

function compassRose(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.translate(x, y);
  c.strokeStyle = INK;
  c.lineWidth = r * 0.025;
  c.beginPath();
  c.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const major = i % 4 === 0;
    const half = i % 2 === 0;
    const len = major ? r : half ? r * 0.62 : r * 0.42;
    const w = major ? r * 0.13 : r * 0.08;
    const tip = [Math.cos(a) * len, Math.sin(a) * len];
    const l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w];
    const rt = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(l[0]!, l[1]!);
    c.lineTo(tip[0]!, tip[1]!);
    c.closePath();
    c.fillStyle = major ? '#4a3218' : '#7a5a30';
    c.fill();
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(rt[0]!, rt[1]!);
    c.lineTo(tip[0]!, tip[1]!);
    c.closePath();
    c.fillStyle = major ? '#c9a45c' : '#dcc189';
    c.fill();
    c.stroke();
  }
  c.font = `600 ${r * 0.3}px Fraunces, Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = INK;
  c.fillText('N', 0, -r * 1.14);
  c.restore();
}

function closedCurve(c: CanvasRenderingContext2D, p: readonly [number, number][]): void {
  const n = p.length;
  c.beginPath();
  c.moveTo((p[n - 1]![0] + p[0]![0]) / 2, (p[n - 1]![1] + p[0]![1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % n]!;
    c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  c.closePath();
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
}
