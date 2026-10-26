/**
 * The kraken's colours: deep-sea teal-green. The Pirate Kit tentacle's atlas holds four flat swatches
 * (its back stripe, its sides, its sucker-side stripe and its suckers); the game redraws them as a
 * dark green-teal back and a pale sea-green underside (split by which way each vertex faces), with
 * amber-gold suckers and a few darker mottled spots on the back. The body uses the same colours, and
 * its eyes glow amber (the one material's emissive picks out only that amber), so the kraken is still
 * one look, one shader.
 */
export interface KrakenSwatch {
  /** The atlas swatch (sRGB) baked into the tentacle's vertex colours (tools/kraken/fetch-tentacle.mjs). */
  readonly source: number;
  /** What the game draws it as (sRGB). */
  readonly drawn: number;
}

/** sRGB colours the game draws the kraken in. */
export const KRAKEN_COLORS = {
  /** The outer side of the arms and the top of the mantle (a touch lighter than its darkest, so it reads on the sea). */
  back: 0x306a62,
  /** The arms' back stripe and the mottled spots. */
  backDark: 0x1f4d4a,
  /** The inner, sucker side and the belly. */
  under: 0x9fd0b8,
  /** The suckers, and their lighter rims. */
  sucker: 0xd9a441,
  suckerRim: 0xe8be68,
  /** The eyes: a glowing amber (the only colour bright enough in red to glow), a dark slit, a glint. */
  eye: 0xffb347,
  pupil: 0x120c06,
  glint: 0xf2efe6,
} as const;

/** The tentacle atlas's swatches, by what they are on the arm. */
export const KRAKEN_ATLAS = {
  /** The bulk of the tube: its sides (back or underside by which way it faces). */
  sides: 0xdb71a3,
  /** The sucker-side stripe. */
  under: 0xe890b2,
  /** The back stripe. */
  back: 0xa14b7c,
  /** The suckers. */
  sucker: 0xff9a0c,
} as const;

/** sRGB 0…255 to linear. */
export function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** A hex sRGB colour as linear rgb, written into `out`. */
export function hexToLinear(hex: number, out: number[] | Float32Array, at = 0): void {
  out[at] = srgbToLinear((hex >> 16) & 255);
  out[at + 1] = srgbToLinear((hex >> 8) & 255);
  out[at + 2] = srgbToLinear(hex & 255);
}

const ATLAS = [KRAKEN_ATLAS.sides, KRAKEN_ATLAS.under, KRAKEN_ATLAS.back, KRAKEN_ATLAS.sucker];
const SOURCE = new Float32Array(12);
ATLAS.forEach((hex, i) => hexToLinear(hex, SOURCE, i * 3));
const C = {
  back: [0, 0, 0],
  backDark: [0, 0, 0],
  under: [0, 0, 0],
  sucker: [0, 0, 0],
  suckerRim: [0, 0, 0],
};
hexToLinear(KRAKEN_COLORS.back, C.back);
hexToLinear(KRAKEN_COLORS.backDark, C.backDark);
hexToLinear(KRAKEN_COLORS.under, C.under);
hexToLinear(KRAKEN_COLORS.sucker, C.sucker);
hexToLinear(KRAKEN_COLORS.suckerRim, C.suckerRim);

/** The tentacle's sucker side in its mesh's own frame (the suckers' mean normal). */
const SUCKER_SIDE = [0, -0.998, 0.06] as const;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A cheap, stable value in [0, 1) at a point: the mottling's spots. */
function mottle(x: number, y: number, z: number): number {
  const a = Math.sin(x * 12.9 + y * 7.3 + z * 3.1) * Math.sin(y * 9.7 - z * 5.3 + x * 2.2);
  const b = Math.sin(y * 4.1 + x * 6.7) * Math.sin(z * 8.3 - y * 3.9);
  return 0.5 + 0.35 * a + 0.15 * b;
}

/**
 * Recolours the tentacle's linear vertex colours (rgb triples) in place: each vertex takes the colour
 * of the atlas swatch nearest to it, the sides split into back and underside by their normal, the
 * back mottled. `normals` and `positions` are the mesh's own (bind pose); `extent` is its length (for
 * the mottling's scale). Returns how many vertices matched no swatch closely (0 for the kit's mesh).
 */
export function recolourTentacle(
  colors: Float32Array,
  normals: Float32Array,
  positions: Float32Array,
  extent: number,
): number {
  let strays = 0;
  const k = 14 / Math.max(1e-6, extent);
  for (let v = 0; v + 2 < colors.length; v += 3) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const d =
        (colors[v]! - SOURCE[i * 3]!) ** 2 +
        (colors[v + 1]! - SOURCE[i * 3 + 1]!) ** 2 +
        (colors[v + 2]! - SOURCE[i * 3 + 2]!) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 0.002) strays++;
    const facing =
      normals[v]! * SUCKER_SIDE[0] + normals[v + 1]! * SUCKER_SIDE[1] + normals[v + 2]! * SUCKER_SIDE[2];
    let r: number;
    let g: number;
    let b: number;
    if (best === 3) {
      // A sucker's face, lighter toward its rim (where it turns away from the sucker side).
      const rim = 1 - smooth(0.75, 0.97, facing);
      r = C.sucker[0]! + (C.suckerRim[0]! - C.sucker[0]!) * rim;
      g = C.sucker[1]! + (C.suckerRim[1]! - C.sucker[1]!) * rim;
      b = C.sucker[2]! + (C.suckerRim[2]! - C.sucker[2]!) * rim;
    } else {
      // Back to underside by which way it faces; the back stripe stays dark.
      const under = best === 1 ? 1 : best === 2 ? 0 : smooth(0.15, 0.6, facing);
      const back = best === 2 ? C.backDark : C.back;
      // Darker mottled spots on the back.
      const spot =
        smooth(0.62, 0.78, mottle(positions[v]! * k, positions[v + 1]! * k, positions[v + 2]! * k)) *
        (1 - under);
      r = (back[0]! + (C.under[0]! - back[0]!) * under) * (1 - 0.35 * spot);
      g = (back[1]! + (C.under[1]! - back[1]!) * under) * (1 - 0.35 * spot);
      b = (back[2]! + (C.under[2]! - back[2]!) * under) * (1 - 0.35 * spot);
    }
    colors[v] = r;
    colors[v + 1] = g;
    colors[v + 2] = b;
  }
  return strays;
}

/**
 * The red channel (linear) over which a colour glows: only the eyes' amber reaches it (the suckers'
 * amber-gold is well under), so the one material's emissive lights the eyes alone.
 */
export const KRAKEN_GLOW_RED = 0.93;
