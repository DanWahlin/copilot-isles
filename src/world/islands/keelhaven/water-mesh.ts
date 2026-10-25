import type { WaterStrips } from '../../sites/water';
import { createMeridianWaterMesh } from '../meridian-water-mesh';
import type { WaterStream } from '../meridian-water';
import { NATURAL_POOL } from '../fresh-water-natural';
import { KEELHAVEN, toWorld } from './layout';
import { CANAL, CHAMBERS, GATES } from './works';
import { keelhavenHeight, keelhavenWater } from './height';

/** Rows down a curtain and columns across it. */
const ROWS = 22;
const COLS = 6;
/** How far (m) a curtain's sheet stays clear of the cliff under it. */
const CLEAR = 1.5;
/** Where a curtain ends, under the sea's surface (the sea hides its foot). */
const FOOT_Y = -1.2;

/** A curtain off a sea fall's lip: its lip, the way out (unit x, z) and how far out it lands. */
export interface Curtain {
  x: number;
  y: number;
  z: number;
  ox: number;
  oz: number;
  /** Out from the lip at drop `d` below it: `reach · √d` (m). */
  reach: number;
  width: number;
}

/**
 * The curtain at the end of a sea fall's stream: it leaves the lip along the stream's last reach and
 * falls in a curve (out by `reach · √drop`), `reach` the least that keeps it `CLEAR` m off the cliff
 * at every row (sampled on `ground`).
 */
export function seaFallCurtain(
  s: WaterStream,
  ground: (x: number, z: number) => number = keelhavenHeight,
): Curtain {
  const n = s.count;
  const x = s.x[n - 1]!;
  const z = s.z[n - 1]!;
  const back = Math.max(0, n - 4);
  const dx = x - s.x[back]!;
  const dz = z - s.z[back]!;
  const len = Math.hypot(dx, dz) || 1;
  const ox = dx / len;
  const oz = dz / len;
  const y = s.surface[n - 1]! + 0.1;
  const drop = y - FOOT_Y;
  let reach = 0.8;
  for (; reach < 6; reach += 0.1) {
    let clear = true;
    for (let r = 1; r <= ROWS && clear; r++) {
      const d = (drop * r) / ROWS;
      const out = reach * Math.sqrt(d);
      if (ground(x + ox * out, z + oz * out) > y - d - CLEAR) clear = false;
    }
    if (clear) break;
  }
  return { x, y, z, ox, oz, reach, width: s.spec.halfWidth * 2.4 };
}

/** A curtain's sheet: white at the lip and where it lands, streaked between (the shared falls look). */
function addCurtain(strips: WaterStrips, c: Curtain): void {
  const drop = c.y - FOOT_Y;
  // Across, so the sheet's normal faces out from the cliff (`WaterStrips.quad` winds by it).
  const ax = c.oz;
  const az = -c.ox;
  const at = (r: number, k: number): [number, number, number] => {
    const d = (drop * r) / ROWS;
    const out = c.reach * Math.sqrt(d);
    // It fans out a little as it falls, and bows out in its middle.
    const across = (k / COLS - 0.5) * c.width * (1 + (r / ROWS) * 0.5);
    const bow = Math.cos((k / COLS - 0.5) * Math.PI) * 0.6;
    return [c.x + c.ox * (out + bow) + ax * across, c.y - d, c.z + c.oz * (out + bow) + az * across];
  };
  for (let r = 0; r < ROWS; r++)
    for (let k = 0; k < COLS; k++) {
      const ya = (drop * r) / ROWS;
      const yb = (drop * (r + 1)) / ROWS;
      strips.quad(
        at(r, k),
        at(r, k + 1),
        at(r + 1, k),
        at(r + 1, k + 1),
        ya,
        yb,
        { fill: 1, speed: 3.2, foam: r < 2 ? 1 : r >= ROWS - 4 ? 0.95 : 0.4, kind: -1 },
        k / COLS,
        (k + 1) / COLS,
      );
    }
}

/**
 * The works' still water: the basin, the flooded dock and the canal's chambers (still pools in the
 * natural look, their depth to the floor), in tiles so the ripples stay fine; and at each lock gate,
 * the water leaking through the mitre and down the gate's face into the chamber below.
 */
function addWorksWater(strips: WaterStrips): void {
  const TILE = 8;
  for (const c of CHAMBERS) {
    if (c.water === null) continue;
    const depth = c.water - c.floor;
    const nu = Math.max(1, Math.ceil((c.u1 - c.u0) / TILE));
    const nv = Math.max(1, Math.ceil((c.v1 - c.v0) / TILE));
    const y = c.water;
    const d = [depth, depth, depth, depth];
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const u0 = c.u0 + ((c.u1 - c.u0) * i) / nu;
        const u1 = c.u0 + ((c.u1 - c.u0) * (i + 1)) / nu;
        const v0 = c.v0 + ((c.v1 - c.v0) * j) / nv;
        const v1 = c.v0 + ((c.v1 - c.v0) * (j + 1)) / nv;
        const p = (u: number, v: number) => {
          const w = toWorld(u, v);
          return [w.x, y, w.z];
        };
        strips.quad(
          p(u0, v0),
          p(u0, v1),
          p(u1, v0),
          p(u1, v1),
          u0,
          u1,
          { fill: 1, speed: 0.08, kind: NATURAL_POOL },
          v0,
          v1,
          {
            depth: d,
            along: [u0, u0, u1, u1],
          },
        );
      }
  }
  // Leaks at the gates: a thin white sheet down the mitre from the upper water to the lower.
  for (const g of GATES) {
    const up = CHAMBERS.find(
      (c) => Math.abs(c.u0 - g) < 0.01 && c.water !== null && !c.name.startsWith('dock'),
    );
    const down = CHAMBERS.find((c) => Math.abs(c.u1 - g) < 0.01);
    if (!up || !down) continue;
    const yTop = up.water! - 0.1;
    const yBot = (down.water ?? 0) + 0.02;
    for (const side of [-1, 1]) {
      const v = CANAL.v + side * 0.6;
      const a = toWorld(g + 1.35, v - 0.35);
      const b = toWorld(g + 1.35, v + 0.35);
      const c = toWorld(g + 1.2, v - 0.4);
      const e = toWorld(g + 1.2, v + 0.4);
      strips.quad(
        [a.x, yTop, a.z],
        [b.x, yTop, b.z],
        [c.x, yBot, c.z],
        [e.x, yBot, e.z],
        0,
        yTop - yBot,
        { fill: 0.8, speed: 2.4, foam: 0.85, kind: -1 },
        0,
        1,
      );
    }
  }
}

/**
 * Keelhaven's fresh water as one static mesh in the shared flowing-water material (no new program):
 * the Falls Pool and the Keel River as natural water over the drawn ground, Ribbon Falls and the sea
 * falls' cascades in the falling-water look, and a curtain off each sea fall's lip into the sea.
 */
export function createKeelhavenWaterMesh(
  ground: (x: number, z: number) => number = keelhavenHeight,
): WaterStrips {
  const water = keelhavenWater();
  const line = KEELHAVEN.water.ribbon.line;
  const foot = toWorld(line[line.length - 1]![0], line[line.length - 1]![1]);
  const curtains = KEELHAVEN.water.seaFalls
    .map((f, i) => (f.curtain ? water.streams[2 + i] : null))
    .filter((s): s is WaterStream => s !== null)
    .map((s) => seaFallCurtain(s));
  return createMeridianWaterMesh(water, {
    name: 'keelhaven fresh water',
    maxQuads: 4200,
    natural: {
      ground,
      // Where Ribbon Falls lands in the Falls Pool.
      plunges: [{ x: foot.x, z: foot.z, r: KEELHAVEN.water.ribbon.halfWidth * 2 + 5 }],
    },
    extra: (strips) => {
      for (const c of curtains) addCurtain(strips, c);
      addWorksWater(strips);
    },
  });
}
