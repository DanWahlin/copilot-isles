import type { CircleObstacle, HeightField, WaveSampler } from '../world/contracts';

/** An oriented rectangle footprint (buildings, stalls, crates). `rot` is a yaw about +y (three's convention). */
export interface BoxCollider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  /** Top height above its base, used by the camera (defaults to "tall"). */
  height?: number;
  /** World heights it spans; a walker whose feet are outside [y0, y1] passes it (see CircleObstacle). */
  y0?: number;
  y1?: number;
  /**
   * The drawn top (world y) the camera keeps its pad over, where the walker's span reaches higher (a
   * hand rail that a hop mustn't clear, but that the camera may pass over).
   */
  eyeTop?: number;
}

export type SurfaceKind = 'sand' | 'grass' | 'rock' | 'stone' | 'wood' | 'water';

/**
 * A man-made walkable surface (quay, pier, deck) that overrides the terrain where it returns a height.
 * `y` is the walker's feet, for surfaces stacked over each other (a spiral stair); without it a
 * surface returns its lowest level there.
 */
export interface WalkSurface {
  heightAt(x: number, z: number, y?: number): number | null;
  kind: SurfaceKind | ((x: number, z: number) => SurfaceKind);
}

/** Fresh water at a point (`CollisionWorldOptions.inland`). */
export interface InlandWater {
  /** Its surface (m). */
  level: number;
  /**
   * The bed you wade on (m): the terrain, or lower where the water is drawn deeper than the tier's
   * coarse ground under it (a stream's bed, see `naturalWaterAt`).
   */
  floor: number;
}

export interface CollisionWorldOptions {
  ground: HeightField;
  waves?: WaveSampler;
  surfaces?: WalkSurface[];
  circles?: readonly CircleObstacle[];
  boxes?: readonly BoxCollider[];
  /**
   * Fresh water above the sea (lakes, streams) at (x, z) over the terrain's height `ground` there,
   * written to `out`; false where there's none.
   */
  inland?: (x: number, z: number, ground: number, out: InlandWater) => boolean;
}

interface Bucket {
  circles: CircleObstacle[];
  boxes: BoxCollider[];
}

const CELL = 16;
const NO_BUCKET: Bucket = { circles: [], boxes: [] };
/** The share of the camera pad a camera-only blocker keeps when the pivot is in its pad. */
const PIVOT_PAD = 0.35;
/** Boxes this tall (m) or more are buildings, whose roofs can rise over their `height` (see cameraBlockedAt). */
const ROOF_MIN = 2.5;
const ROOF_PITCH = 0.8;
/** How far under a span's pad `cameraCeilingAt` puts the pivot, so the pad tests see it outside. */
const CEIL_GAP = 0.01;

/**
 * Static collision for walking (Phase 0 S6): terrain + man-made surfaces for ground height, and
 * circles/oriented boxes for walls, bucketed in a 16 m grid. Rapier isn't needed for a kinematic
 * walker and would add ~1.5 MB of wasm to the first island (issue #14).
 */
export class CollisionWorld {
  readonly ground: HeightField;
  readonly waves: WaveSampler | null;
  private readonly inland: CollisionWorldOptions['inland'] | null;
  private readonly fresh: InlandWater = { level: 0, floor: 0 };
  private readonly surfaces: WalkSurface[];
  private readonly grid = new Map<number, Bucket>();
  /** Camera-only blockers (addCameraBox): walkers, sight lines and audits don't see them. */
  private readonly cameraGrid = new Map<number, Bucket>();
  private readonly dynamic: CircleObstacle[] = [];
  /** Moving camera-only blockers (addCameraDynamic): the crate yard's crates. */
  private readonly cameraDynamic: CircleObstacle[] = [];
  private readonly normal = new Float32Array(3);

  constructor(o: CollisionWorldOptions) {
    this.ground = o.ground;
    this.waves = o.waves ?? null;
    this.inland = o.inland ?? null;
    this.surfaces = o.surfaces ?? [];
    for (const c of o.circles ?? []) this.addCircle(c);
    for (const b of o.boxes ?? []) this.addBox(b);
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  private cellAt(x: number, z: number): Bucket | undefined {
    return this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  private insert(x: number, z: number, r: number, add: (b: Bucket) => void): void {
    this.insertInto(this.grid, x, z, r, add);
  }

  private insertInto(
    grid: Map<number, Bucket>,
    x: number,
    z: number,
    r: number,
    add: (b: Bucket) => void,
  ): void {
    const x0 = Math.floor((x - r) / CELL),
      x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL),
      z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let b = grid.get(k);
        if (!b) grid.set(k, (b = { circles: [], boxes: [] }));
        add(b);
      }
  }

  /** Static circles. The bucket is padded by 1 m so walkers near a cell edge still see them. */
  addCircle(c: CircleObstacle): void {
    this.insert(c.x, c.z, c.r + 1, (b) => b.circles.push(c));
  }

  addBox(b: BoxCollider): void {
    this.insert(b.x, b.z, Math.hypot(b.hx, b.hz) + 1, (k) => k.boxes.push(b));
  }

  /** Moving circles (NPCs, the ship's hull). Mutate the objects in place each frame. */
  addDynamic(c: CircleObstacle): void {
    this.dynamic.push(c);
  }

  removeDynamic(c: CircleObstacle): void {
    const i = this.dynamic.indexOf(c);
    if (i >= 0) this.dynamic.splice(i, 1);
  }

  /**
   * Takes colliders out again (an island that has unloaded): static circles and boxes, camera-only
   * blockers, and moving ones, matched by identity.
   */
  remove(items: Iterable<CircleObstacle | BoxCollider>): void {
    const gone = new Set<object>(items);
    if (gone.size === 0) return;
    const keep = <T extends object>(list: T[]) => {
      let w = 0;
      for (let r = 0; r < list.length; r++) if (!gone.has(list[r]!)) list[w++] = list[r]!;
      list.length = w;
    };
    for (const grid of [this.grid, this.cameraGrid])
      for (const [k, b] of grid) {
        keep(b.circles);
        keep(b.boxes);
        if (b.circles.length === 0 && b.boxes.length === 0) grid.delete(k);
      }
    keep(this.dynamic);
    keep(this.cameraDynamic);
  }

  /**
   * The man-made surface height at (x, z), if one is at or above the terrain. `y` (the walker's feet)
   * picks the level of a stacked surface (see WalkSurface).
   */
  surfaceHeightAt(x: number, z: number, y?: number): number | null {
    return this.surfaceOver(x, z, y, this.ground.heightAt(x, z));
  }

  /** `surfaceHeightAt` over the terrain's height `t` there. */
  private surfaceOver(x: number, z: number, y: number | undefined, t: number): number | null {
    let best: number | null = null;
    for (const s of this.surfaces) {
      const sh = s.heightAt(x, z, y);
      if (sh !== null && sh >= t - 0.05 && (best === null || sh > best)) best = sh;
    }
    return best;
  }

  /** Walkable height: the highest man-made surface, else the terrain (or the bed under fresh water). */
  groundAt(x: number, z: number, y?: number): number {
    const t = this.ground.heightAt(x, z);
    return this.surfaceOver(x, z, y, t) ?? this.bedAt(x, z, t);
  }

  /**
   * The walkable height under a camera at height y: the lower of `groundAt(x, z)` (a stacked surface's
   * lowest level) and `groundAt(x, z, y)` (the level at the camera's height), with the terrain and the
   * bed looked up once (the follow camera asks this ~1000 times a frame).
   */
  groundUnder(x: number, z: number, y: number): number {
    const t = this.ground.heightAt(x, z);
    const floor = t - 0.05;
    let low: number | null = null;
    let at: number | null = null;
    for (const s of this.surfaces) {
      const a = s.heightAt(x, z);
      if (a !== null && a >= floor && (low === null || a > low)) low = a;
      const b = s.heightAt(x, z, y);
      if (b !== null && b >= floor && (at === null || b > at)) at = b;
    }
    if (low !== null && at !== null) return Math.min(low, at);
    const bed = this.bedAt(x, z, t);
    return Math.min(low ?? bed, at ?? bed);
  }

  /** The terrain at (x, z) (its height `g`), or the bed you wade on where fresh water lies over it. */
  private bedAt(x: number, z: number, g = this.ground.heightAt(x, z)): number {
    return this.inland?.(x, z, g, this.fresh) ? Math.min(g, this.fresh.floor) : g;
  }

  /** Terrain normal y (1 = flat). Man-made surfaces count as flat. */
  slopeAt(x: number, z: number, y?: number): number {
    if (this.surfaceHeightAt(x, z, y) !== null) return 1;
    return this.ground.normalAt(x, z, this.normal)[1] ?? 1;
  }

  waterAt(x: number, z: number, t: number): number {
    const sea = this.waves ? this.waves.heightAt(x, z, t) : 0;
    if (!this.inland?.(x, z, this.ground.heightAt(x, z), this.fresh)) return sea;
    return Math.max(sea, this.fresh.level);
  }

  surfaceAt(x: number, z: number, t = 0, y?: number): SurfaceKind {
    const g = this.ground.heightAt(x, z);
    for (const s of this.surfaces) {
      const sh = s.heightAt(x, z, y);
      if (sh !== null && sh >= g - 0.05) return typeof s.kind === 'function' ? s.kind(x, z) : s.kind;
    }
    if (this.waterAt(x, z, t) - this.bedAt(x, z) > 0.12) return 'water';
    const m = this.ground.masksAt(x, z);
    if (m.rock + m.cliff > Math.max(m.sand, m.grass)) return 'rock';
    return m.grass > m.sand ? 'grass' : 'sand';
  }

  /**
   * Pushes a circle (x, z, r) out of every obstacle it overlaps, writing the result into `p`.
   * Returns true if anything was hit. Up to three passes settle corners between neighbours. With
   * the walker's feet `y`, colliders that span other heights (`y0`/`y1`) let it pass.
   */
  pushOut(p: { x: number; z: number }, r: number, y?: number): boolean {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      const b = this.cellAt(p.x, p.z);
      let moved = false;
      if (b) {
        for (const c of b.circles) if (spans(c, y)) moved = pushCircle(p, r, c) || moved;
        for (const box of b.boxes) if (spans(box, y)) moved = pushBox(p, r, box) || moved;
      }
      for (const c of this.dynamic) moved = pushCircle(p, r, c) || moved;
      hit ||= moved;
      if (!moved) break;
    }
    return hit;
  }

  /** Every static box collider (tests and audits), deduplicated across grid cells. */
  boxes(): BoxCollider[] {
    const out = new Set<BoxCollider>();
    for (const b of this.grid.values()) for (const x of b.boxes) out.add(x);
    return [...out];
  }

  /** Every static circle collider (tests and audits), deduplicated across grid cells. */
  circles(): CircleObstacle[] {
    const out = new Set<CircleObstacle>();
    for (const b of this.grid.values()) for (const c of b.circles) out.add(c);
    return [...out];
  }

  /**
   * Whether a sight line through (x, y, z) is blocked: a box below its top, or a big round collider
   * (a tower, a fountain, a lighthouse: radius 1.5 m or more, up to its `height`, else 12 m). Used by
   * the follow camera and scripted shots.
   */
  sightBlockedAt(x: number, y: number, z: number, pad = 0.2): boolean {
    if (this.occludedAt(x, y, z, pad)) return true;
    const b = this.cellAt(x, z);
    if (!b) return false;
    for (const c of b.circles) {
      if (c.r < 1.5 || Math.hypot(x - c.x, z - c.z) >= c.r + pad) continue;
      if (y < this.groundAt(c.x, c.z) + (c.height ?? 12)) return true;
    }
    return false;
  }

  /**
   * Whether the follow camera's eye at (x, y, z) is in or within `pad` of a collider. Unlike
   * `sightBlockedAt`, small round colliders count too (barrels, posts, crates: up to their `height`,
   * else 2 m), colliders with a span (`y0`/`y1`) use it, a box stands on the walkable height at its
   * centre (a shed on a pier, not the seabed under it), and a building's roof can rise over its top.
   * Camera-only blockers (addCameraBox) count too, unless the pivot (px, py, pz) is in the same one.
   */
  cameraBlockedAt(x: number, y: number, z: number, pad: number, px = NaN, py = NaN, pz = NaN): boolean {
    const b = this.cellAt(x, z);
    if (b) {
      for (const box of b.boxes) if (this.boxBlocksEye(box, x, y, z, pad)) return true;
      for (const c of b.circles) if (this.circleBlocksEye(c, x, y, z, pad)) return true;
    }
    const k = this.cameraGrid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NO_BUCKET;
    // A camera-only blocker the pivot is in too (the player walks through a cliff's overhang or by
    // a rock's rough box) doesn't count, or the camera would fold onto the player's head. A pivot only
    // in its pad (the player beside a wall) keeps a thinner pad, so the eye can't slide into the face.
    const thin = pad * PIVOT_PAD;
    for (const box of k.boxes)
      if (
        this.boxBlocksEye(box, x, y, z, pad) &&
        (!this.boxBlocksEye(box, px, py, pz, pad) ||
          (this.boxBlocksEye(box, x, y, z, thin) && !this.boxBlocksEye(box, px, py, pz, thin)))
      )
        return true;
    for (const c of k.circles) if (this.cameraCircleBlocks(c, x, y, z, pad, thin, px, py, pz)) return true;
    for (const c of this.cameraDynamic)
      if (this.cameraCircleBlocks(c, x, y, z, pad, thin, px, py, pz)) return true;
    return false;
  }

  /**
   * How low the camera's pivot at (x, z) must sit, at most `y`, to keep `pad` under every collider
   * with a span (`y0`/`y1`) over it: a lamp head, an awning, a balcony, a lintel. Colliders whose
   * underside comes within `pad` of `floor` or lower (a rock or a cliff the player walks through)
   * are left to `cameraBlockedAt`'s pivot rule.
   */
  cameraCeilingAt(x: number, y: number, z: number, pad: number, floor: number): number {
    const b = this.cellAt(x, z) ?? NO_BUCKET;
    const k = this.cameraGrid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? NO_BUCKET;
    let top = y;
    // A few passes, for a lower span that the first drop reaches (a lantern under its arm).
    for (let pass = 0; pass < 4; pass++) {
      const was = top;
      top = this.ceilingBoxes(b.boxes, x, top, z, pad, floor);
      top = this.ceilingBoxes(k.boxes, x, top, z, pad, floor);
      top = this.ceilingCircles(b.circles, x, top, z, pad, floor);
      top = this.ceilingCircles(k.circles, x, top, z, pad, floor);
      top = this.ceilingCircles(this.cameraDynamic, x, top, z, pad, floor);
      if (top === was) break;
    }
    return top;
  }

  private ceilingBoxes(
    list: BoxCollider[],
    x: number,
    y: number,
    z: number,
    pad: number,
    floor: number,
  ): number {
    for (const box of list) {
      if (box.y1 === undefined || box.y0 === undefined || box.y0 - pad <= floor) continue;
      if (y < box.y0 - pad || y > box.y1 + pad) continue;
      const [lx, lz] = toLocal(box, x, z);
      if (Math.abs(lx) - box.hx <= pad && Math.abs(lz) - box.hz <= pad) y = box.y0 - pad - CEIL_GAP;
    }
    return y;
  }

  private ceilingCircles(
    list: CircleObstacle[],
    x: number,
    y: number,
    z: number,
    pad: number,
    floor: number,
  ): number {
    for (const c of list) {
      if (c.y1 === undefined || c.y0 === undefined || c.y0 - pad <= floor) continue;
      if (y < c.y0 - pad || y > c.y1 + pad) continue;
      const r = c.r + pad;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) y = c.y0 - pad - CEIL_GAP;
    }
    return y;
  }

  /**
   * Adds a box the camera can't enter but walkers pass (a rock's or a cliff's rough shape, a wall
   * top the player never stands beside). Give it a span (`y0`/`y1`).
   */
  addCameraBox(b: BoxCollider): void {
    this.insertInto(this.cameraGrid, b.x, b.z, Math.hypot(b.hx, b.hz) + 1, (k) => k.boxes.push(b));
  }

  /** A moving round camera-only blocker (a pushed crate); mutate it in place (see addCameraBox). */
  addCameraDynamic(c: CircleObstacle): void {
    this.cameraDynamic.push(c);
  }

  /** A round camera-only blocker (see addCameraBox). */
  addCameraCircle(c: CircleObstacle): void {
    this.insertInto(this.cameraGrid, c.x, c.z, c.r + 1, (k) => k.circles.push(c));
  }

  private boxBlocksEye(box: BoxCollider, x: number, y: number, z: number, pad: number): boolean {
    const [lx, lz] = toLocal(box, x, z);
    const ex = Math.abs(lx) - box.hx,
      ez = Math.abs(lz) - box.hz;
    // NaN (no pivot) fails this test, so a missing point is never inside.
    if (!(ex <= pad && ez <= pad)) return false;
    if (box.y1 !== undefined) return y >= (box.y0 ?? -Infinity) - pad && y <= (box.eyeTop ?? box.y1) + pad;
    const h = box.height ?? 9;
    // A roof rises ROOF_PITCH m per metre in from the eaves (which overhang the walls by `pad`).
    const roof = h >= ROOF_MIN ? Math.max(0, pad - Math.max(ex, ez)) * ROOF_PITCH : 0;
    return y < this.groundAt(box.x, box.z) + h + pad + roof;
  }

  private cameraCircleBlocks(
    c: CircleObstacle,
    x: number,
    y: number,
    z: number,
    pad: number,
    thin: number,
    px: number,
    py: number,
    pz: number,
  ): boolean {
    if (!this.circleBlocksEye(c, x, y, z, pad)) return false;
    if (!this.circleBlocksEye(c, px, py, pz, pad)) return true;
    return this.circleBlocksEye(c, x, y, z, thin) && !this.circleBlocksEye(c, px, py, pz, thin);
  }

  private circleBlocksEye(c: CircleObstacle, x: number, y: number, z: number, pad: number): boolean {
    const dx = x - c.x,
      dz = z - c.z,
      r = c.r + pad;
    if (!(dx * dx + dz * dz < r * r)) return false;
    if (c.y1 !== undefined) return y >= (c.y0 ?? -Infinity) - pad && y <= c.y1 + pad;
    return y < this.groundAt(c.x, c.z) + (c.height ?? (c.r >= 1.5 ? 12 : 2)) + pad;
  }

  /** Whether (x, y, z) lies inside a box footprint below its top. Used by the camera. */
  occludedAt(x: number, y: number, z: number, pad = 0.25): boolean {
    const b = this.cellAt(x, z);
    if (!b) return false;
    for (const box of b.boxes) {
      const [lx, lz] = toLocal(box, x, z);
      if (Math.abs(lx) > box.hx + pad || Math.abs(lz) > box.hz + pad) continue;
      if (box.y1 !== undefined) {
        if (y >= (box.y0 ?? -Infinity) - pad && y <= box.y1 + pad) return true;
      } else if (y < this.ground.heightAt(box.x, box.z) + (box.height ?? 9)) return true;
    }
    return false;
  }
}

/** Whether a collider spans the walker's feet `y` (always, without a span or a `y`). */
function spans(c: { y0?: number; y1?: number }, y: number | undefined): boolean {
  if (y === undefined || c.y1 === undefined) return true;
  return y >= (c.y0 ?? -Infinity) && y <= c.y1;
}

const local: [number, number] = [0, 0];

/** World → box-local (the inverse of a +y rotation by `rot`). */
function toLocal(b: BoxCollider, x: number, z: number): [number, number] {
  const dx = x - b.x,
    dz = z - b.z;
  const c = Math.cos(b.rot),
    s = Math.sin(b.rot);
  local[0] = dx * c - dz * s;
  local[1] = dx * s + dz * c;
  return local;
}

function pushCircle(p: { x: number; z: number }, r: number, c: CircleObstacle): boolean {
  const dx = p.x - c.x,
    dz = p.z - c.z;
  const min = r + c.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-5) {
    p.x = c.x + min;
    return true;
  }
  const k = (min - d) / d;
  p.x += dx * k;
  p.z += dz * k;
  return true;
}

function pushBox(p: { x: number; z: number }, r: number, b: BoxCollider): boolean {
  const [lx, lz] = toLocal(b, p.x, p.z);
  if (Math.abs(lx) >= b.hx + r || Math.abs(lz) >= b.hz + r) return false;
  const cx = Math.max(-b.hx, Math.min(b.hx, lx));
  const cz = Math.max(-b.hz, Math.min(b.hz, lz));
  const ox = lx - cx,
    oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  let nx: number, nz: number;
  if (d2 > 1e-10) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    nx = lx + ox * k;
    nz = lz + oz * k;
  } else if (b.hx - Math.abs(lx) < b.hz - Math.abs(lz)) {
    // Centre inside the box: leave through the nearest face.
    nx = Math.sign(lx || 1) * (b.hx + r);
    nz = lz;
  } else {
    nx = lx;
    nz = Math.sign(lz || 1) * (b.hz + r);
  }
  const c = Math.cos(b.rot),
    s = Math.sin(b.rot);
  p.x = b.x + nx * c + nz * s;
  p.z = b.z - nx * s + nz * c;
  return true;
}
