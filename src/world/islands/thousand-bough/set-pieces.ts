import { Group, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import type { VillageKit } from '../../village/kit';
import { mergeWithRigidParts, type RigidParts } from '../../sites/rigid-parts';
import type { PaintedSign, SignSet } from '../../sites/sign';
import type { SignalMastView } from './contract';
import { THOUSAND_BOUGH as TB, TREE } from './layout';
import { thousandBoughHeight } from './height';
import { PAINT, beam, box, cone, lanternPaint, makeBuckets, rod, rope, type Buckets } from './village/pieces';
import { BASKET, bridgeY, COLUMN_TOP, DECKS } from './village/surfaces';
import type { BridgeSpec } from './layout';
import { hasActiveCourse } from '../../../course/active';
import type { PuzzleFile } from '../../../course/pack';
import { puzzleMaybe } from '../../../course/puzzles';

/**
 * The tree village's moving set pieces: the Signal Deck's mast and its four flags (the course's symbols), the
 * Cloud gondola gliding up into the mist on Thunder Crown every 90 s, the Sky Basket's cage, the
 * Crown Beacon, and the Spire twist's two lanterns (the blue and teal crews' previews, carried out onto
 * the Spire Bridge until they jam at mid-span). Static parts go into the village's buckets; the
 * moving ones are rigid parts of one merged mesh per material (no new shader), placed without
 * allocating.
 */

/** The Signal Deck's halyards, one flag each (the Flag Hoist's bins hang on them in order). */
export const HALYARDS = 4;
const MAST_H = 12;

/** What's painted on each flag: the course's symbols (`puzzles/flag-hoist.json` → `bins`), in order. */
function flagSymbols(): string[] {
  const bins = hasActiveCourse()
    ? (puzzleMaybe<PuzzleFile & { bins?: { symbol: string }[] }>('flag-hoist')?.bins ?? [])
    : [];
  return Array.from({ length: HALYARDS }, (_, i) => bins[i]?.symbol ?? '');
}

const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const ONE = new Vector3(1, 1, 1);
const HIDE = new Matrix4().makeScale(0, 0, 0);
const Y = new Vector3(0, 1, 0);

/** The Crown Beacon's size against its first draft (a 2 m lantern read as a lamp on a pole). */
export const BEACON_SCALE = 2.2;
/** The Beacon's lantern's centre: its foot on the column's rounded top. */
export const BEACON_Y = COLUMN_TOP + 1.9 + 1.25 * BEACON_SCALE;

export interface SetPieces extends SignalMastView {
  group: Group;
  gondolaSend(): Promise<void>;
  skyBasketEnabled(on: boolean): void;
  /** The Sky Basket's cage along its ride: 0 at the Root Hall, 1 at the Crown. */
  skyBasketCar(t: number): void;
  /** The Crown Beacon lit (after the Seal). */
  beacon(on: boolean): void;
  /** The Spire twist (P2.2): the blue and teal crews' lanterns jam mid-span on the first lookout's bridge. */
  spireJam(): Promise<void>;
  /** A crew's lantern walks to (or shows at) a lookout, or goes out. */
  spireLantern(crew: 'blue' | 'teal', lookout: 1 | 2, on: boolean): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/** The halyard posts on the Signal Deck: four, 3 m apart along its outer rail. */
export function halyardPosts(): { x: number; y: number; z: number }[] {
  const d = DECKS.L2SW;
  const r = d.rect;
  return Array.from({ length: HALYARDS }, (_, i) => {
    const v = (i - 1.5) * 3;
    const u = r.hu - 1.4;
    return { x: r.x + u * r.ux - v * r.uz, y: d.y, z: r.z + u * r.uz + v * r.ux };
  });
}

export function createSetPieces(kit: VillageKit, statics: Buckets, signs: SignSet): SetPieces {
  const group = new Group();
  group.name = 'thousand-bough-set-pieces';
  const mast = TB.anchors.flagMast;
  // The mast, its yard and stays; the four halyards from the posts to the yard.
  rod(
    statics,
    'wood',
    { x: mast.x, y: mast.y - 0.4, z: mast.z },
    { x: mast.x, y: mast.y + MAST_H, z: mast.z },
    0.2,
    8,
    PAINT.weathered,
    0.12,
  );
  const posts = halyardPosts();
  const yardY = mast.y + MAST_H - 0.8;
  const a0 = posts[0]!;
  const a3 = posts[3]!;
  const yx = (a3.x - a0.x) / 9;
  const yz = (a3.z - a0.z) / 9;
  beam(
    statics,
    'wood',
    { x: mast.x - yx * 6, y: yardY, z: mast.z - yz * 6 },
    { x: mast.x + yx * 6, y: yardY, z: mast.z + yz * 6 },
    0.14,
    0.14,
    PAINT.weathered,
  );
  const blocks = posts.map((_p, i) => ({
    x: mast.x + yx * (i - 1.5) * 3.2,
    y: yardY - 0.15,
    z: mast.z + yz * (i - 1.5) * 3.2,
  }));
  posts.forEach((p, i) => {
    rod(
      statics,
      'wood',
      { x: p.x, y: p.y - 0.1, z: p.z },
      { x: p.x, y: p.y + 1.4, z: p.z },
      0.09,
      6,
      PAINT.teakDark,
    );
    rope(statics, { x: p.x, y: p.y + 1.3, z: p.z }, blocks[i]!, 0.05, 0.015, PAINT.rope, 4);
    box(statics, 'metal', blocks[i]!.x, blocks[i]!.y, blocks[i]!.z, 0.18, 0.24, 0.18, 0, PAINT.iron);
  });
  // A pennant at the masthead.
  const pennant = signs.add(['Thousand-Bough'], 2.2, 0.5, { look: 'cloth', twoSided: true });
  pennant.object.position.set(mast.x + 1.15, mast.y + MAST_H - 0.3, mast.z);
  // The flags: painted cloth with the course's symbols, run up their halyards.
  const flags: {
    sign: PaintedSign;
    t: number;
    target: number;
    drop: boolean;
    done: (() => void) | null;
  }[] = flagSymbols().map((symbol, i) => {
    const sign = signs.add([symbol], 0.9, 0.62, { look: 'cloth', twoSided: true, size: 0.5 });
    const p = posts[i]!;
    sign.object.position.set(p.x, p.y + 1.6, p.z);
    sign.object.rotation.y = Math.atan2(yx, yz) + Math.PI / 2;
    return { sign, t: 0, target: 0, drop: false, done: null };
  });

  // The gondola: towers, the cable, the station's bull-wheel frame and the Cloud Loft's pavilion.
  const st = TB.gondola.station;
  const loftGround = thousandBoughHeight(TB.gondola.loft.x, TB.gondola.loft.z);
  const loft = { x: TB.gondola.loft.x, y: Math.max(TB.gondola.loft.y, loftGround + 4), z: TB.gondola.loft.z };
  for (const s of [-1, 1])
    for (const t of [-1, 1])
      rod(
        statics,
        'wood',
        { x: st.x + s * 1.2, y: DECKS.L1E.y - 0.2, z: st.z + t * 1.2 },
        { x: st.x + s * 1.2, y: st.y + 3.2, z: st.z + t * 1.2 },
        0.12,
        6,
        PAINT.teakDark,
      );
  cone(statics, 'thatch', st.x, st.y + 3.1, st.z, 2.4, 1.6, 4, PAINT.thatch, 0, (g) =>
    g.rotateY(Math.PI / 4),
  );
  rod(
    statics,
    'wood',
    { x: st.x - 1, y: st.y + 2.2, z: st.z },
    { x: st.x + 1, y: st.y + 2.2, z: st.z },
    0.7,
    12,
    PAINT.teakDark,
  );
  const cableTop = { x: loft.x, y: loft.y + 2.8, z: loft.z };
  const cableStart = { x: st.x, y: st.y + 2.4, z: st.z };
  rope(statics, cableStart, cableTop, 2.5, 0.04, PAINT.iron, 24);
  // The Cloud Loft: a pale lilac sailcloth pavilion on posts.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const px = loft.x + Math.cos(a) * 3;
    const pz = loft.z + Math.sin(a) * 3;
    const g = thousandBoughHeight(px, pz);
    rod(
      statics,
      'wood',
      { x: px, y: g - 0.5, z: pz },
      { x: px, y: loft.y + 3.4, z: pz },
      0.14,
      6,
      PAINT.weathered,
    );
  }
  cone(statics, 'cloth', loft.x, loft.y + 3.2, loft.z, 4.4, 3.4, 12, PAINT.lilac);
  box(statics, 'wood', loft.x, loft.y + 0.1, loft.z, 6.4, 0.25, 6.4, 0.3, PAINT.plank);

  // Moving parts: the gondola's car, the Sky Basket's cage (wood); the Beacon's flame (glow).
  const moving = makeBuckets();
  const woodParts: BufferGeometry[] = [];
  const glowParts: BufferGeometry[] = [];
  const takeWood = (fn: (b: Buckets) => void) => {
    const b = makeBuckets();
    fn(b);
    woodParts.push(flatMerge([...b.wood, ...b.thatch.map((g) => g)]));
  };
  takeWood((b) => {
    box(b, 'wood', 0, -1.6, 0, 1.6, 1.1, 1.3, 0, PAINT.teak);
    rod(b, 'wood', { x: 0, y: -1.05, z: 0 }, { x: 0, y: 0, z: 0 }, 0.05, 4, PAINT.iron);
    box(b, 'wood', 0, -0.95, 0, 1.9, 0.12, 1.6, 0, PAINT.teakDark);
  });
  takeWood((b) => {
    box(b, 'wood', 0, 0.06, 0, 2.2, 0.12, 2.2, 0, PAINT.plank);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      box(b, 'wood', x, 1.15, z, 0.1, 2.3, 0.1, 0, PAINT.teakDark);
    for (const yy of [1.05, 2.25])
      for (const s of [-1, 1]) {
        box(b, 'wood', 0, yy, s, 2.1, 0.08, 0.08, 0, PAINT.teak);
        box(b, 'wood', s, yy, 0, 0.08, 0.08, 2.1, 0, PAINT.teak);
      }
  });
  {
    const b = makeBuckets();
    const g = box(
      b,
      'glow',
      0,
      0,
      0,
      1.1 * BEACON_SCALE,
      1.5 * BEACON_SCALE,
      1.1 * BEACON_SCALE,
      0.4,
      0xffffff,
    );
    lanternPaint(g, 6.5);
    for (let i = 0; i < g.getAttribute('color').count; i++) g.getAttribute('color').setXYZ(i, 6.5, 6.2, 5.2);
    glowParts.push(flatMerge(b.glow));
  }
  // The Spire twist's lanterns on their staffs (wood 2-3, glow 1-2): the blue crew's and the teal crew's.
  for (const dye of [PAINT.blue, PAINT.teal]) {
    takeWood((b) => {
      // A big stage lantern (it has to read from the twist camera, 20 m off) held up on a pole: a
      // few triangles, as these parts are drawn wherever the set pieces are.
      rod(b, 'wood', { x: 0, y: -1.3, z: 0 }, { x: 0, y: -0.36, z: 0 }, 0.06, 4, PAINT.teakDark, 0.06, true);
    });
    const b = makeBuckets();
    const g = box(b, 'glow', 0, 0, 0, 0.62, 0.76, 0.62, 0, 0xffffff);
    const c = g.getAttribute('color');
    // Bright, but not so bright it washes out to white: the crew's colour has to show.
    const k = 2.4 / 255;
    for (let i = 0; i < c.count; i++)
      c.setXYZ(i, ((dye >> 16) & 255) * k + 0.1, ((dye >> 8) & 255) * k + 0.1, (dye & 255) * k + 0.1);
    glowParts.push(flatMerge(b.glow));
  }
  void moving;
  const wood = mergeWithRigidParts([], woodParts, { bounds: true });
  const glow = mergeWithRigidParts([], glowParts, { bounds: true });
  const meshOf = (p: RigidParts, key: 'wood' | 'glow') => {
    const m = new Mesh(p.geometry, kit.materials[key] as Material);
    m.name = `thousand-bough-moving-${key}`;
    m.castShadow = key === 'wood';
    m.receiveShadow = key === 'wood';
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  meshOf(wood, 'wood');
  meshOf(glow, 'glow');
  // The Beacon's cage on the column's top: a big brass lantern (about 5 m), lit by the Seal.
  const S = BEACON_SCALE;
  const beaconY = BEACON_Y;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    rod(
      statics,
      'metal',
      { x: TREE.x + Math.cos(a) * 0.9 * S, y: beaconY - 1.1 * S, z: TREE.z + Math.sin(a) * 0.9 * S },
      { x: TREE.x + Math.cos(a) * 0.7 * S, y: beaconY + 1.1 * S, z: TREE.z + Math.sin(a) * 0.7 * S },
      0.07 * S,
      5,
      PAINT.brass,
    );
  }
  cone(statics, 'metal', TREE.x, beaconY + 1.05 * S, TREE.z, 1.2 * S, 0.9 * S, 12, PAINT.brass);
  rod(
    statics,
    'metal',
    { x: TREE.x, y: beaconY + 1.9 * S, z: TREE.z },
    { x: TREE.x, y: beaconY + 2.3 * S, z: TREE.z },
    0.12 * S,
    8,
    PAINT.brass,
  );
  rod(
    statics,
    'metal',
    { x: TREE.x, y: beaconY - 1.25 * S, z: TREE.z },
    { x: TREE.x, y: beaconY - 1.05 * S, z: TREE.z },
    1.05 * S,
    12,
    PAINT.brass,
  );
  void COLUMN_TOP;

  let gondolaT = 0;
  let send: (() => void) | null = null;
  let sendT = 0;
  let basketOn = false;
  let basket = 0;
  let beaconOn = false;
  // The two lanterns: on which bridge, how far along (0 the Three Landings, 1 the Spire), where
  // they're walking to, and the jam's bump (seconds since it started; −1: none).
  const R2 = TB.bridges.find((b) => b.id === 'R2')!;
  const R3 = TB.bridges.find((b) => b.id === 'R3')!;
  const lanterns = [
    { on: false, path: R2 as BridgeSpec, t: 0.22, to: 0.22, wood: 2, glow: 1 },
    { on: false, path: R2 as BridgeSpec, t: 0.78, to: 0.78, wood: 3, glow: 2 },
  ];
  let jam = -1;
  let jammed: (() => void) | null = null;
  const placeLantern = (l: (typeof lanterns)[number], side: number, bump: number) => {
    if (!l.on) {
      wood.set(l.wood, HIDE);
      glow.set(l.glow, HIDE);
      return;
    }
    const b = l.path;
    const t = l.t + bump;
    const walking = Math.abs(l.to - l.t) > 1e-3;
    const bob = walking ? Math.abs(Math.sin(gondolaT * 9)) * 0.06 : 0;
    // Carried at hand height along the bridge's centre line, swinging a little.
    V.set(
      b.from.x + (b.to.x - b.from.x) * t,
      bridgeY(b, Math.min(1, Math.max(0, t))) + 1.3 + bob,
      b.from.z + (b.to.z - b.from.z) * t,
    );
    // Facing along the bridge, the way it's carried (the two face each other).
    Q.setFromAxisAngle(Y, Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z) + (side > 0 ? 0 : Math.PI));
    M.compose(V, Q, ONE);
    wood.set(l.wood, M);
    glow.set(l.glow, M);
  };
  const placeLanterns = () => {
    // The jam: they bump nose to nose a few times, then stand stuck.
    const u = jam < 0 ? 1 : Math.min(1, jam / 1.4);
    const bump = jam < 0 ? 0 : Math.max(0, Math.sin(jam * 13)) * 0.012 * (1 - u);
    placeLantern(lanterns[0]!, 1, bump);
    placeLantern(lanterns[1]!, -1, -bump);
  };
  const placeCable = (t: number, out: Vector3) => {
    const sag = 2.5 * 4 * t * (1 - t);
    return out.set(
      cableStart.x + (cableTop.x - cableStart.x) * t,
      cableStart.y + (cableTop.y - cableStart.y) * t - sag,
      cableStart.z + (cableTop.z - cableStart.z) * t,
    );
  };
  const yaw = Math.atan2(cableTop.x - cableStart.x, cableTop.z - cableStart.z);
  const place = () => {
    // The car: up the cable and back, a 90 s round trip (it waits at each end).
    const period = TB.gondola.period;
    const u = (gondolaT % period) / period;
    const leg = u < 0.5 ? u * 2 : (1 - u) * 2;
    const t = Math.min(1, Math.max(0, (leg - 0.1) / 0.8));
    const e = t * t * (3 - 2 * t);
    Q.setFromAxisAngle(Y, yaw);
    wood.set(0, M.compose(placeCable(e, V), Q, ONE));
    Q.identity();
    if (basketOn)
      wood.set(
        1,
        M.compose(
          V.set(
            BASKET.x,
            TB.skyBasket.bottomY + (TB.skyBasket.topY - TB.skyBasket.bottomY) * basket,
            BASKET.z,
          ),
          Q,
          ONE,
        ),
      );
    else wood.set(1, M.compose(V.set(BASKET.x, TB.skyBasket.topY, BASKET.z), Q, ONE));
    glow.set(0, beaconOn ? M.compose(V.set(TREE.x, beaconY, TREE.z), Q, ONE) : HIDE);
    placeLanterns();
    wood.commit();
    glow.commit();
  };
  place();

  const self: SetPieces = {
    group,
    async hoist(halyard, ok) {
      const f = flags[halyard];
      if (!f) return;
      await new Promise<void>((done) => {
        f.target = 1;
        f.drop = !ok;
        f.done = done;
      });
    },
    lowerAll() {
      for (const f of flags) {
        f.target = 0;
        f.drop = false;
      }
    },
    async gondolaSend() {
      await new Promise<void>((done) => {
        send = done;
        sendT = 0;
        // Start the car up from the station now.
        const period = TB.gondola.period;
        gondolaT = Math.floor(gondolaT / period) * period;
      });
    },
    skyBasketEnabled(on) {
      basketOn = on;
      place();
    },
    skyBasketCar(t) {
      basket = Math.max(0, Math.min(1, t));
      place();
    },
    beacon(on) {
      beaconOn = on;
      place();
    },
    spireJam() {
      const [f, d] = lanterns;
      // Out from each end of the first lookout's bridge (or bump again, if they're already stuck there).
      for (const [l, from, to] of [
        [f!, 0.22, 0.475],
        [d!, 0.78, 0.525],
      ] as const) {
        if (!l.on || l.path !== R2) {
          l.on = true;
          l.path = R2;
          l.t = from;
        }
        l.to = to;
      }
      jam = -1;
      jammed?.();
      return new Promise<void>((done) => (jammed = done));
    },
    spireLantern(crew, lookout, on) {
      const l = lanterns[crew === 'blue' ? 0 : 1]!;
      const path = lookout === 1 ? R2 : R3;
      if (!on) l.on = false;
      else if (!l.on || l.path !== path) {
        // Appears on its bridge (a cut, not a walk across), part way, and walks to its lookout.
        l.path = path;
        l.t = l.on ? 0.6 : 1;
        l.on = true;
      }
      l.to = 1;
      place();
    },
    update(dt) {
      gondolaT += dt;
      // The lanterns walk at about 3.5 m/s; once both stand at mid-span, the jam's bump plays.
      let walking = false;
      for (const l of lanterns) {
        const len = Math.hypot(l.path.to.x - l.path.from.x, l.path.to.z - l.path.from.z);
        const step = (3.5 * dt) / len;
        if (Math.abs(l.to - l.t) > 1e-3) {
          l.t += Math.sign(l.to - l.t) * Math.min(Math.abs(l.to - l.t), step);
          walking = true;
        } else l.t = l.to;
      }
      if (jammed && !walking) {
        jam = jam < 0 ? 0 : jam + dt;
        if (jam > 1.6) {
          const d = jammed;
          jammed = null;
          jam = -1;
          d();
        }
      }
      if (send) {
        sendT += dt;
        if (sendT > TB.gondola.period * 0.5) {
          const d = send;
          send = null;
          d();
        }
      }
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i]!;
        const want = f.drop && f.t >= 0.98 ? 0 : f.target;
        if (f.drop && f.t >= 0.98) f.target = 0;
        const before = f.t;
        f.t += Math.sign(want - f.t) * Math.min(Math.abs(want - f.t), dt * 0.55);
        if (f.t !== before) {
          const p = posts[i]!;
          const top = blocks[i]!;
          const h = p.y + 1.6 + (top.y - 0.6 - (p.y + 1.6)) * f.t;
          f.sign.object.position.set(p.x + (top.x - p.x) * f.t, h, p.z + (top.z - p.z) * f.t);
        }
        if (f.done && f.t === want && (want === 1 || f.drop)) {
          if (!f.drop || f.t === 0) {
            const d = f.done;
            f.done = null;
            if (f.drop) f.drop = false;
            d();
          }
        }
      }
      place();
    },
    dispose() {
      wood.geometry.dispose();
      glow.geometry.dispose();
    },
  };
  return self;
}

function flatMerge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of flat) count += g.getAttribute('position').count;
  const out = flat[0]!.clone();
  for (const name of ['position', 'normal', 'uv', 'color'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of flat) {
      arr.set(g.getAttribute(name).array as Float32Array, o);
      o += g.getAttribute(name).count * size;
    }
    out.setAttribute(
      name,
      new (out.getAttribute(name).constructor as typeof import('three/webgpu').BufferAttribute)(arr, size),
    );
  }
  return out;
}
