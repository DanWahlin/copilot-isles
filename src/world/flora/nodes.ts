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

/** Feet only part the grass this close to the camera (m). */
const PUSH_RANGE = 30;
/** How far (m) round a character's feet the blades lean away. */
const PUSH_RADIUS = 0.6;

/** Each pusher as (x, z, radius m, strength 0-1); strength 0 is off. Shared by every grass material. */
export const floraPushers = Array.from({ length: FLORA_PUSHERS }, (_, i) =>
  uniform(new Vector4(0, 0, PUSH_RADIUS, 0)).setName(`floraPush${i}`),
);

const nearest: (Object3D | null)[] = Array.from({ length: FLORA_PUSHERS }, () => null);
const nearestD = new Float64Array(FLORA_PUSHERS);

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
 * allocation). Positions come from the characters' world matrices, so they lag a frame at most.
 */
export function updateFloraPushers(x: number, z: number): void {
  eyeX = x;
  eyeZ = z;
  nearest.fill(null);
  nearestD.fill(PUSH_RANGE * PUSH_RANGE);
  // `forEach` with a named callback: iterating with for…of would make an iterator every frame.
  floraFeet.forEach(considerFeet);
  for (let i = 0; i < FLORA_PUSHERS; i++) {
    const o = nearest[i];
    const v = floraPushers[i]!.value;
    if (!o) {
      v.w = 0;
      continue;
    }
    v.set(o.matrixWorld.elements[12]!, o.matrixWorld.elements[14]!, PUSH_RADIUS, 1);
  }
}
