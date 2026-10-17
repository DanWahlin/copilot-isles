import { Group, Vector3 } from 'three/webgpu';
import { MARKET } from '../../content/market';
import { unreflected } from '../reflection';
import type { VillageAnchor } from '../village/kit';
import { MARKET_LAYOUT } from '../meridian-town/model-market';
import { SignSet, type PaintedSign } from './sign';
import { marketText as T } from '../../game/market/jobs';

/** A held camera shot: the eye, and the point it looks at (the follow camera's `CameraShot`). */
export interface MarketShot {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

/** One signboard's text: its category, price, the names the board rule picked, and how many more. */
export interface MarketBoardText {
  category: string;
  price: number;
  names: readonly string[];
  more: number;
}

export interface MarketJobNote {
  id: string;
  note: string;
  size: 'quick' | 'hard';
}

export interface ModelMarketSite {
  readonly group: Group;
  /** Where you stand at the counter, facing it. */
  readonly stand: { x: number; y: number; z: number; heading: number };
  /** The counter's front (where E works from). */
  readonly counter: { x: number; y: number; z: number };
  /** The stall square on from the plaza (concept B's close-up), held while the market is open. */
  readonly shot: MarketShot;
  /** Ticks the done jobs' notes on the cork board. */
  setDone(ids: readonly string[]): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const INK = '#3b2616';
const CREAM = '#fbefd6';
const GOLD = '#ffe2a0';
/** Board faces by category: sage, sky blue, red (the size and the stars say it too). */
const FILL = ['#93ad74', '#3a78bd', '#ad2c26'] as const;
/** Lettering per board: dark ink on the pale sage board, cream on the blue and red ones. */
const INK_ON = ['#24301c', CREAM, CREAM] as const;
const TITLE_ON = ['#2f4a1f', GOLD, GOLD] as const;
const MORE_ON = ['#3d4f2c', '#e9d9b6', '#e9d9b6'] as const;

/**
 * The Model Market's lettering (docs/specs/MODEL-MARKET.md §2): the three hanging boards, the small
 * name plaque, the House special plaque on the counter and the notes on the jobs board, as one sign atlas
 * (one draw, the painted-sign material: no new shader). The stall itself is part of the town
 * (src/world/meridian-town/model-market.ts); this only letters it.
 */
export function createModelMarketSigns(o: {
  /** The stall's origin (the town's `modelMarket` anchor). */
  origin: VillageAnchor;
  boards: readonly MarketBoardText[];
  jobs: readonly MarketJobNote[];
  done: readonly string[];
}): ModelMarketSite {
  const group = new Group();
  group.name = 'model market signs';
  // A Meridian site, so never in the Anchorage harbour mirror (PLAN §15.4).
  unreflected.add(group);
  const root = new Group();
  root.position.set(o.origin.x, o.origin.y, o.origin.z);
  root.rotation.y = o.origin.heading;
  group.add(root);
  root.updateMatrixWorld(true);

  const signs = new SignSet('model market signs');
  const L = MARKET_LAYOUT;
  o.boards.forEach((b, i) => {
    const spot = L.boards[i];
    if (!spot) return;
    const lines = [
      T('boardHead', { category: b.category, price: b.price }),
      ...b.names,
      ...(b.more > 0 ? [T('more', { n: b.more })] : []),
    ];
    const ink = INK_ON[i] ?? CREAM;
    const s = signs.add(lines, spot.w - 0.06, spot.h - 0.06, {
      layout: 'list',
      fill: FILL[i],
      size: 0.1,
      colors: lines.map((_, k) =>
        k === 0
          ? (TITLE_ON[i] ?? GOLD)
          : k === lines.length - 1 && b.more > 0
            ? (MORE_ON[i] ?? '#e9d9b6')
            : ink,
      ),
      scales: lines.map((_, k) => (k === 0 ? 1.12 : k === lines.length - 1 && b.more > 0 ? 0.8 : 1)),
    });
    s.object.position.set(spot.x, spot.top - spot.h / 2, L.boardZ);
    root.add(s.object);
  });
  const plaque = signs.add(
    [T('plaque', { price: MARKET.autoPrice }), T('plaqueSub')],
    L.plaque.w,
    L.plaque.h,
    {
      fill: '#26302a',
      size: 0.08,
      colors: [CREAM, '#d9e3c9'],
      scales: [1, 0.82],
    },
  );
  plaque.object.position.set(L.plaque.x, L.plaque.y, L.plaque.z);
  root.add(plaque.object);
  const name = signs.add([T('nameTop'), T('nameBottom')], L.name.w, L.name.h, {
    size: 0.17,
    colors: [GOLD, CREAM],
    scales: [1, 0.86],
  });
  name.object.position.set(L.name.x, L.name.y, L.name.z);
  root.add(name.object);

  const noteLines = (j: MarketJobNote, done: boolean) => [
    j.note,
    done ? T('noteDone') : MARKET.sizes[j.size].label,
  ];
  const notes: { job: MarketJobNote; sign: PaintedSign; done: boolean }[] = [];
  o.jobs.forEach((j, i) => {
    const spot = L.notes[i];
    if (!spot) return;
    const done = o.done.includes(j.id);
    const sign = signs.add(noteLines(j, done), L.noteSize.w, L.noteSize.h, {
      look: 'cloth',
      size: 0.13,
      colors: [INK, done ? '#2f6b34' : '#7a5226'],
      scales: [1, 0.8],
    });
    sign.object.position.set(spot.x, spot.y, L.cork.z + 0.012);
    sign.object.rotation.z = spot.rz;
    root.add(sign.object);
    notes.push({ job: j, sign, done });
  });
  const signMesh = signs.finalize();
  group.add(signMesh);
  signs.update();

  const world = (lx: number, ly: number, lz: number) =>
    new Vector3(lx, ly, lz).applyMatrix4(root.matrixWorld);
  const standAt = world(L.stand.x, 0, L.stand.z);
  const counterAt = world(L.counter.x, 0, L.counter.z);
  // Square on from the plaza at a standing eye height, like concept B's close-up: the three boards
  // across the top, Gilda at the counter in the middle, the jar, the bell and the jobs board.
  const eye = world(-0.4, 2.8, 6.6);
  const at = world(0.1, 2.85, -2.0);

  return {
    group,
    stand: { x: standAt.x, y: o.origin.y, z: standAt.z, heading: o.origin.heading + Math.PI },
    counter: { x: counterAt.x, y: o.origin.y, z: counterAt.z },
    shot: { x: eye.x, y: eye.y, z: eye.z, tx: at.x, ty: at.y, tz: at.z },
    setDone(ids) {
      for (const n of notes) {
        const done = ids.includes(n.job.id);
        if (done === n.done) continue;
        n.done = done;
        n.sign.redraw(noteLines(n.job, done), { colors: [INK, done ? '#2f6b34' : '#7a5226'] });
      }
    },
    update() {},
    dispose() {
      unreflected.delete(group);
      signs.dispose();
      group.clear();
    },
  };
}
