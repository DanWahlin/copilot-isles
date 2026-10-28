import { Color, Vector4, type Object3D } from 'three/webgpu';
import { uniform, uniformArray } from 'three/tsl';
import { ISLAND_FLORA_PALETTES } from '../islands/flora-palettes';
import { floraFeet } from './feet';
import type { FloraSpecies } from './types';

// TSL's fluent typings don't cover every mixed scalar/vector graph here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** Room in the species table (every island's species, in `ISLAND_FLORA_PALETTES` order). */
export const FLORA_SPECIES_MAX = 24;

/** How the grass material colours a form's heads: 0 round (eye to rim), 1 along (base to tip). */
const FORM_CODE = { bloom: 0, cap: 0, spike: 1, frond: 1 } as const;

/** Each species' place in the shared table, worked out once from the palettes (data, not state). */
const INDEX = new Map<FloraSpecies, number>();
const SHAPES: Vector4[] = [];
const EYES: Vector4[] = [];
for (const palette of ISLAND_FLORA_PALETTES)
  for (const s of palette.species) {
    INDEX.set(s, SHAPES.length);
    const eye = new Color(s.eye);
    SHAPES.push(new Vector4(s.cup, s.throat, (s.size[0] + s.size[1]) / 2, s.glow ?? 0));
    EYES.push(new Vector4(eye.r, eye.g, eye.b, FORM_CODE[s.form]));
  }
if (SHAPES.length > FLORA_SPECIES_MAX) throw new Error('flora: too many species for the shared table');
while (SHAPES.length < FLORA_SPECIES_MAX) {
  SHAPES.push(new Vector4());
  EYES.push(new Vector4());
}

/** A species' row in the shared table (the grass material reads it by this index). */
export function floraSpeciesIndex(species: FloraSpecies): number {
  const i = INDEX.get(species);
  if (i === undefined) throw new Error(`flora: ${species.id} isn't in ISLAND_FLORA_PALETTES`);
  return i;
}

/** Flowers draw out to this share of the grass's reach (the terrain's drift speckle carries on past it). */
export const FLOWER_REACH = 0.85;

let table: { shape: AnyNode; eye: AnyNode } | null = null;

/**
 * The species table as shared uniform arrays: per row, the head's shape (cup, throat, mean radius,
 * glow) and its eye (linear rgb, and the form: 0 a round head, 1 a spike). One pair of nodes for every
 * grass material, so every island's grass keeps the one shader.
 */
export function floraSpeciesTable(): { shape: AnyNode; eye: AnyNode } {
  return (table ??= {
    shape: uniformArray(SHAPES, 'vec4').setName('floraShape'),
    eye: uniformArray(EYES, 'vec4').setName('floraEye'),
  });
}

/** How many feet part the grass and flowers at once: the nearest characters to the camera. */
export const FLORA_PUSHERS = 3;

/** Feet only part the grass this close to the camera (m); their push fades out over the last third. */
const PUSH_RANGE = 30;
/** How far (m) round a character's feet the blades lean away. */
export const PUSH_RADIUS = 1;
/**
 * How long (s) the push's tail takes to catch up with the feet: blades a character has passed ease
 * back upright over about this long (`floraPushAt`). Reduced motion has no tail (no spring).
 */
export const PUSH_EASE = 0.5;
/** A pusher whose tail wasn't updated for this long (s) starts again at its feet (no streak). */
const TAIL_STALE = 0.3;

/**
 * Each pusher as (x, z, radius m, strength 0-1); strength 0 is off. Shared by every grass material.
 * The feet are its head; `floraPushTails` holds where its tail is (x, z).
 */
export const floraPushers = Array.from({ length: FLORA_PUSHERS }, (_, i) =>
  uniform(new Vector4(0, 0, PUSH_RADIUS, 0)).setName(`floraPush${i}`),
);
export const floraPushTails = Array.from({ length: FLORA_PUSHERS }, (_, i) =>
  uniform(new Vector4(0, 0, 0, 0)).setName(`floraPushTail${i}`),
);

/** Operations `floraPushAt` needs, on numbers (CPU, tests) or TSL nodes (the shader). */
export interface PushMath<T> {
  k(v: number): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  div(a: T, b: T): T;
  max(a: T, b: T): T;
  min(a: T, b: T): T;
  sqrt(a: T): T;
  smoothstep(e0: T, e1: T, x: T): T;
}

/**
 * One pusher's push on a blade at (px, pz): its feet at (hx, hz) and its tail at (tx, tz), radius `r`
 * and strength `w`. Blades within `r` of the line from the tail to the feet lean straight away from it,
 * most at the feet and none at the tail, so a blade the feet have passed eases back as the tail comes
 * by. Returns the push (x, z), up to `w` long. Written once for the CPU and the shader.
 */
export function floraPushAt<T>(
  M: PushMath<T>,
  px: T,
  pz: T,
  hx: T,
  hz: T,
  tx: T,
  tz: T,
  r: T,
  w: T,
): { x: T; z: T } {
  const ax = M.sub(px, hx),
    az = M.sub(pz, hz);
  const bx = M.sub(tx, hx),
    bz = M.sub(tz, hz);
  const len2 = M.add(M.mul(bx, bx), M.mul(bz, bz));
  // Along the line from the feet (0) to the tail (1); a still character's line is a point (0).
  const s = M.min(M.max(M.div(M.add(M.mul(ax, bx), M.mul(az, bz)), M.max(len2, M.k(1e-4))), M.k(0)), M.k(1));
  const dx = M.sub(ax, M.mul(bx, s)),
    dz = M.sub(az, M.mul(bz, s));
  const d = M.sqrt(M.add(M.mul(dx, dx), M.mul(dz, dz)));
  const near = M.sub(M.k(1), M.smoothstep(M.mul(r, M.k(0.3)), r, d));
  const fresh = M.sub(M.k(1), M.smoothstep(M.k(0), M.k(1), s));
  const k = M.div(M.mul(M.mul(near, fresh), w), M.max(d, M.k(0.05)));
  return { x: M.mul(dx, k), z: M.mul(dz, k) };
}

const nearest: (Object3D | null)[] = Array.from({ length: FLORA_PUSHERS }, () => null);
const nearestD = new Float64Array(FLORA_PUSHERS);
/** Each character's tail: x, z and when (s) it was last moved. */
const tails = new WeakMap<Object3D, Float64Array>();

/** Whether `o` and every parent up to its scene are visible. */
function shown(o: Object3D): boolean {
  let p: Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    if (!p.parent) return (p as { isScene?: boolean }).isScene === true;
    p = p.parent;
  }
  return false;
}

let eyeX = 0;
let eyeZ = 0;

/** Keeps `o` among the nearest feet to (eyeX, eyeZ), nearest first. */
function considerFeet(o: Object3D): void {
  const e = o.matrixWorld.elements;
  const d = (e[12]! - eyeX) ** 2 + (e[14]! - eyeZ) ** 2;
  if (d >= nearestD[FLORA_PUSHERS - 1]! || !shown(o)) return;
  let k = FLORA_PUSHERS - 1;
  while (k > 0 && nearestD[k - 1]! > d) {
    nearestD[k] = nearestD[k - 1]!;
    nearest[k] = nearest[k - 1]!;
    k--;
  }
  nearestD[k] = d;
  nearest[k] = o;
}

/**
 * Points the pushers at the feet of the characters nearest the camera at (x, z), each frame (no
 * allocation but a character's first tail). Positions come from the characters' world matrices, so
 * they lag a frame at most. Each tail follows its feet, `PUSH_EASE` s behind (at once with reduced
 * motion: `reduced`). `now` is in seconds.
 */
export function updateFloraPushers(
  x: number,
  z: number,
  now = performance.now() / 1000,
  reduced = false,
): void {
  eyeX = x;
  eyeZ = z;
  nearest.fill(null);
  nearestD.fill(PUSH_RANGE * PUSH_RANGE);
  // `forEach` with a named callback: iterating with for…of would make an iterator every frame.
  floraFeet.forEach(considerFeet);
  for (let i = 0; i < FLORA_PUSHERS; i++) {
    const o = nearest[i];
    const v = floraPushers[i]!.value;
    const tail = floraPushTails[i]!.value;
    if (!o) {
      v.w = 0;
      continue;
    }
    const fx = o.matrixWorld.elements[12]!,
      fz = o.matrixWorld.elements[14]!;
    let t = tails.get(o);
    if (!t) tails.set(o, (t = new Float64Array([fx, fz, now])));
    const dt = now - t[2]!;
    // A third of the ease's length is its time constant: about 95 % caught up after `PUSH_EASE`.
    const follow = reduced || dt > TAIL_STALE || dt < 0 ? 1 : 1 - Math.exp((-3 * dt) / PUSH_EASE);
    t[0] = t[0]! + (fx - t[0]!) * follow;
    t[1] = t[1]! + (fz - t[1]!) * follow;
    t[2] = now;
    // Faded out with distance from the camera, so a far character's push never switches on at once.
    const d = Math.sqrt(nearestD[i]!);
    const w = 1 - Math.min(1, Math.max(0, (d - PUSH_RANGE * 0.66) / (PUSH_RANGE * 0.34)));
    v.set(fx, fz, PUSH_RADIUS, w * w * (3 - 2 * w));
    tail.set(t[0]!, t[1]!, 0, 0);
  }
}
