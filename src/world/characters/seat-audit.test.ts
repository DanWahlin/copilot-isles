import { readFileSync } from 'node:fs';
import { Box3, type BufferGeometry } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BODY_CONFIG } from './index';
import { parseCharacterGlb, seatedSkin, type RigSource } from './prop-audit';
import { BENCH_OUT, SIT, seatBlock } from './seat-fit';
import type { NpcId, SourceKey } from './types';
import { makeBuckets } from '../village/kit';
import { box } from '../village/pieces';
import { addPierFootboard, addPierSideStructure, addQuayBench } from '../islands/anchorage/village';
import { KEELHAVEN_ANCHORS } from '../islands/keelhaven/anchors';
import { keelhavenHeight } from '../islands/keelhaven/height';
import { MERIDIAN } from '../islands/meridian';
import { THOUSAND_BOUGH as TB } from '../islands/thousand-bough/layout';
import { thousandBoughHeight } from '../islands/thousand-bough/height';
import { COVE } from '../layout';
import { EXTRA_BENCH_PAVING, MOLE_PAVING_TOP, addBenchSeat } from '../meridian-town/index';
import { ALL_WAVES } from '../ocean/waves';
import { DEFAULT_SEA_STATE, SEA_STATES } from '../ocean/sea-state';

/**
 * Every seated NPC on its seat, in the sit it plays: no hip or leg skin more than 2 cm inside any
 * part of the seat (or the floor or deck under it), the hips within 5 cm over the seat's top, and
 * each boot within 3 cm of a surface under it. And every seat stands over the high-water line. Salt's
 * legs went through his bench, his boots under it; Bruno's and Rosa's boots hung clear of the ground
 * under Port Meridian's tall benches; Salter's block stood in the surf (issue 363). Each seat is
 * built by the builder the island uses, at the origin facing +z, with the NPC where its spec puts it.
 */

const FILES: Record<string, string> = {
  captain_npc: 'captain-npc.glb',
  anne_npc: 'anne-npc.glb',
  henry_npc: 'henry-npc.glb',
};
const rigs = new Map<SourceKey, Promise<RigSource>>();
function rig(key: SourceKey): Promise<RigSource> {
  let r = rigs.get(key);
  if (!r) {
    const url = new URL(`../../../public/packs/testcove/characters/${FILES[key]}`, import.meta.url);
    r = parseCharacterGlb(new Uint8Array(readFileSync(url)), key);
    rigs.set(key, r);
  }
  return r;
}

interface Seat {
  /** The seat's parts and what's under it, in the NPC's frame (+z its facing, y 0 the seat's top). */
  parts: Box3[];
}

const boxes = (geos: readonly BufferGeometry[], dz = 0, dy = 0) =>
  geos.map((g) => {
    g.computeBoundingBox();
    return g.boundingBox!.clone().translate({ x: 0, y: dy, z: -dz } as never);
  });
/** A floor or deck slab under the seat, its top `at` (from the seat's top), from `back` to `front` in z. */
const slab = (at: number, front = 4, back = -4) =>
  new Box3().set({ x: -4, y: at - 0.3, z: back } as never, { x: 4, y: at, z: front } as never);

/** A seat block from a floor `top - floor` under its top, as seatBlock builds it. */
function blockSeat(top: number, floor: number): () => Seat {
  return () => {
    const b = makeBuckets();
    seatBlock(b, 0, 0, 0, floor - top, 0);
    return { parts: [...boxes(b.wood), slab(floor - top)] };
  };
}

/**
 * The high-water line (m over the still sea, y 0): the default sea's highest crest, every wave's
 * height at once (the waves aren't damped toward a shore, so this is how far up a beach they reach).
 */
const HIGH_WATER = ALL_WAVES.reduce((h, w, i) => h + w.a * SEA_STATES[DEFAULT_SEA_STATE].params.amp[i]!, 0);

/** The tavern stage's top at Port Meridian (meridian-town `TAVERN_PAD` + 0.6), Lyra's block's floor. */
const STAGE = MERIDIAN.pads.tavern.height + 0.6;
const kettle = TB.anchors.extraFisher;
const salter = KEELHAVEN_ANCHORS.extraFisher;

/** Each seated NPC: its body, its seat in its frame, and the world's height under the seat. */
const SEATS: Record<string, { body: NpcId; seat: () => Seat; ground: number }> = {
  'Salt on his quay bench (Anchorage)': {
    body: 'old_sailor',
    seat: () => {
      const b = makeBuckets();
      const top = addQuayBench(b, { boxes: [] }, 0, 0, 0, 0);
      return { parts: [...boxes(b.wood, 0, -top), slab(-top)] };
    },
    // On the quay's paving (village.ts).
    ground: COVE.quay.height + 0.06,
  },
  'Old Finn on the pier’s edge beam (Anchorage)': {
    body: 'fisherman',
    // The pier's west edge beam and the deck, in Finn's frame (crane.ts `finn`: facing -x, so his
    // forward is the world's -x).
    seat: () => {
      const p = COVE.pier;
      const ax = p.x - p.width / 2 - 0.29 + SIT.front;
      const ay = p.deck + 0.05;
      const b = makeBuckets();
      addPierSideStructure(b, p, -122, -72, true);
      const toFinn = (g: Box3) =>
        new Box3().set(
          { x: g.min.z - COVE.finn.z, y: g.min.y - ay, z: ax - g.max.x } as never,
          { x: g.max.z - COVE.finn.z, y: g.max.y - ay, z: ax - g.min.x } as never,
        );
      const inFinn = (geos: readonly BufferGeometry[]) =>
        geos.map((g) => (g.computeBoundingBox(), toFinn(g.boundingBox!)));
      const west = inFinn(b.rope).sort((u, v) => v.max.z - u.max.z)[0]!;
      // His footboard under his boots, bracketed to the beam.
      const step = makeBuckets();
      addPierFootboard(step, p);
      // The deck: its top at the pier's deck, out to 0.17 m past its width (village.ts).
      const deck = new Box3().set(
        { x: -4, y: p.deck - 0.3 - ay, z: ax - (p.x + p.width / 2 + 0.17) } as never,
        { x: 4, y: p.deck - ay, z: ax - (p.x - p.width / 2 - 0.17) } as never,
      );
      return { parts: [west, deck, ...inFinn(step.rope)] };
    },
    ground: COVE.pier.deck,
  },
  'Old Bruno on his bench on the mole (Port Meridian)': {
    body: 'mer_fisher',
    seat: () => {
      const b = makeBuckets();
      const top = addBenchSeat(b, 0, 0, 0, 0, 0.74);
      return { parts: [...boxes([...b.wood], BENCH_OUT, -top), slab(-top)] };
    },
    ground: MOLE_PAVING_TOP,
  },
  'Signora Rosa on her bench (Port Meridian)': {
    body: 'mer_matron',
    seat: () => {
      const b = makeBuckets();
      const top = addBenchSeat(b, 0, 0, 0, 0, 1);
      return { parts: [...boxes([...b.wood], BENCH_OUT, -top), slab(-top)] };
    },
    ground: EXTRA_BENCH_PAVING,
  },
  'Lyra on her block on the stage (Port Meridian)': {
    body: 'lyra',
    seat: blockSeat(STAGE + SIT.height, STAGE),
    ground: STAGE,
  },
  'Weaver Bea on her block in the Root Hall (Thousand-Bough)': {
    body: 'tb_weaver',
    // On the hall's floor (thousand-bough/village/index.ts).
    seat: blockSeat(TB.anchors.extraWeaver.y, 18.5),
    ground: 18.5,
  },
  'Old Kettle on his block on the shore (Thousand-Bough)': {
    body: 'tb_fisher',
    seat: blockSeat(kettle.y, thousandBoughHeight(kettle.x, kettle.z)),
    ground: lowestUnder(kettle, thousandBoughHeight),
  },
  'Old Salter on his block on the beach (Keelhaven)': {
    body: 'kh_salter',
    seat: blockSeat(salter.y, keelhavenHeight(salter.x, salter.z)),
    ground: lowestUnder(salter, keelhavenHeight),
  },
};

/** The lowest ground under a seat block and its sitter's boots (a 1 m square round the anchor). */
function lowestUnder(a: { x: number; z: number }, height: (x: number, z: number) => number): number {
  let low = Infinity;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) low = Math.min(low, height(a.x + i * 0.25, a.z + j * 0.25));
  return low;
}

/** How deep a point is inside a box (0 outside). */
function depth(b: Box3, x: number, y: number, z: number): number {
  return Math.max(0, Math.min(x - b.min.x, b.max.x - x, y - b.min.y, b.max.y - y, z - b.min.z, b.max.z - z));
}

describe('seated NPCs sit on their seats', () => {
  it('the shared sit fits a seat built to it: hips on top, boots on the floor', () => {
    expect(SIT.drop).toBeGreaterThan(SIT.height);
    const b = makeBuckets();
    const g = seatBlock(b, 0, 0, 0, 0, SIT.height);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeCloseTo(SIT.front, 5);
    expect(g.boundingBox!.max.y).toBeCloseTo(SIT.height, 5);
    void box;
  });

  for (const [name, { body, seat }] of Object.entries(SEATS))
    it(name, { timeout: 60_000 }, async () => {
      const skin = seatedSkin(await rig(BODY_CONFIG[body].source), body).legs;
      const s = seat();
      const faults: string[] = [];
      let worst = 0;
      let hips = Infinity;
      // Each boot's (left, right: by side of the NPC's middle) nearest approach to a surface under it.
      const boot = [Infinity, Infinity];
      const top = s.parts[0]!;
      for (let i = 0; i < skin.length; i += 4) {
        const x = skin[i]!;
        const y = skin[i + 1]! - SIT.drop;
        const z = skin[i + 2]!;
        const part = skin[i + 3]!;
        for (const p of s.parts) worst = Math.max(worst, depth(p, x, y, z));
        if (part <= 1 && z >= top.min.z && z <= top.max.z && x >= top.min.x && x <= top.max.x)
          hips = Math.min(hips, y);
        if (part === 3) {
          const side = x < 0 ? 0 : 1;
          boot[side] = Math.min(boot[side]!, y - surfaceUnder(s.parts, x, y, z));
        }
      }
      if (worst > 0.02) faults.push(`the hips or legs are ${(worst * 100).toFixed(1)} cm inside the seat`);
      if (!(hips >= -0.02 && hips <= 0.05))
        faults.push(`the hips are ${(hips * 100).toFixed(1)} cm over the seat's top`);
      for (const [i, gap] of boot.entries())
        if (!(gap <= 0.03))
          faults.push(
            `the ${i ? 'right' : 'left'} boot is ${(gap * 100).toFixed(1)} cm over what's under it`,
          );
      expect(faults).toEqual([]);
    });

  it('every seat stands over the high-water line', () => {
    expect(HIGH_WATER).toBeGreaterThan(0.5);
    const wet = Object.entries(SEATS)
      .filter(([, s]) => !(s.ground >= HIGH_WATER))
      .map(([name, s]) => `${name}: ${s.ground.toFixed(2)} m`);
    expect(wet).toEqual([]);
  });
});

/** The highest top of a part under (x, z) that isn't over the point (a boot may be 2 cm into it). */
function surfaceUnder(parts: readonly Box3[], x: number, y: number, z: number): number {
  let under = -Infinity;
  for (const p of parts)
    if (x >= p.min.x && x <= p.max.x && z >= p.min.z && z <= p.max.z && p.max.y <= y + 0.02)
      under = Math.max(under, p.max.y);
  return under;
}
