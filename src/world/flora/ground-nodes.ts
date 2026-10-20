import { Color, Vector4 } from 'three/webgpu';
import {
  Fn,
  If,
  cameraPosition,
  clamp,
  cross,
  float,
  floor,
  fract,
  fwidth,
  int,
  max,
  mix,
  smoothstep,
  step,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { ISLAND_FLORA_PALETTES } from '../islands/flora-palettes';
import { DRIFT_BINS, driftLeads, driftNodes, pickSpecies } from './drift';
import type { FloraSpecies } from './types';

// TSL's fluent typings don't cover every mixed scalar/vector graph here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** How much of the sward the open grassy ground takes, unless the palette says. */
const SWARD_COVER = 0.55;
/** How far (m) a palette's island fades in past its rectangle's edge. */
const EDGE = 30;

/**
 * The flower dots: one per `DOT_CELL` (m) at a drift's heart, `DOT_RADIUS` (m) across their middle,
 * so seen from afar a drift is a sprinkle of small round blooms, gathered into clumps.
 */
const DOT_CELL = 0.4;
const DOT_RADIUS = 0.075;
/** Dots fade out between these distances (m) and as they shrink under ~2 pixels; the wash takes over. */
const DOT_FAR = [30, 48] as const;
/** Speckle outside any drift (a light sprinkle), against a drift's heart (1). */
const SPRINKLE = 0.05;
/**
 * Dots keep round on screen down to this foreshortening (their along-view reach, radius / it, stays
 * within the 0.75 of a cell the 2 × 2 search covers); past it they fade into the wash.
 */
const SQUASH_MIN = 0.24;
/** Share of the lattice cells holding a dot at a drift's heart. */
const DOT_FILL = 0.85;
/** Share of a drift's dots that are its lead's colour (the rest its companion's). */
const LEAD_DOTS = 0.72;
/** The drift's colour wash: gentle up close (the dots carry it), stronger far off where they've gone. */
const WASH = { near: 0.2, far: 0.42 } as const;

/**
 * A species' colour as the terrain shows it far off: the middle of its pair, with near-whites warmed
 * toward its eye and dimmed, since a pale fleck on green reads as litter, not a flower.
 */
function farColour(s: FloraSpecies, out: Color): Color {
  const a = new Color(s.colours[0]);
  const b = new Color(s.colours[1]);
  out.copy(a).lerp(b, 0.5);
  const luma = out.r * 0.2126 + out.g * 0.7152 + out.b * 0.0722;
  const pale = Math.min(1, Math.max(0, (luma - 0.45) / 0.35));
  if (pale > 0) out.lerp(new Color(s.eye), 0.4 * pale).multiplyScalar(1 - 0.25 * pale);
  return out;
}

/**
 * Each island's drift colours, `DRIFT_BINS` rows per island (in `ISLAND_FLORA_PALETTES` order): row k
 * holds the far colour (linear rgb) of the lead `driftLead` picks for bin k, and in its alpha 1, or 0
 * for an island without drift leads. One look-up per colour, however many islands and species.
 */
export function floraDriftRows(): Vector4[] {
  const rows: Vector4[] = [];
  const c = new Color();
  for (const p of ISLAND_FLORA_PALETTES) {
    const leads = driftLeads(p);
    for (let k = 0; k < DRIFT_BINS; k++) {
      const s = leads.length > 0 ? pickSpecies(leads, (k + 0.5) / DRIFT_BINS) : null;
      if (s) farColour(s, c);
      rows.push(s ? new Vector4(c.r, c.g, c.b, 1) : new Vector4());
    }
  }
  return rows;
}

let table: AnyNode = null;

/** Our own small hash of a 2D cell and a salt: [0, 1). */
function hash(c: AnyNode, salt: number): AnyNode {
  const a = fract(
    c.x
      .mul(0.1731)
      .add(c.y.mul(0.2903))
      .add(salt * 0.0917),
  );
  const b = fract(
    c.x
      .mul(0.3119)
      .sub(c.y.mul(0.1187))
      .add(salt * 0.1543),
  );
  return fract(
    a
      .add(b)
      .add(0.13)
      .mul(a.mul(41.7).add(b.mul(23.3)).add(5.1)),
  );
}

/** Each island's sward at a ground point, and its drifts' constants (see `floraSward`). */
export interface FloraSward {
  /** 0-1: inside an island with a palette. */
  inside: AnyNode;
  /** The sward's tone (linear rgb) over lush and dry ground, and the forest floor's moss. */
  lush: AnyNode;
  dry: AnyNode;
  moss: AnyNode;
  /** How much of the sward the open grassy ground takes (0-1). */
  cover: AnyNode;
  /** The island's index, its drifts' seed, coverage and lead share (they switch hard between islands). */
  island: AnyNode;
  seed: AnyNode;
  coverage: AnyNode;
  leadShare: AnyNode;
}

/**
 * The islands' sward as the terrain sees it at the world point `P` (vec3): each palette's sward and
 * moss tones, faded in by its rectangle, and its drifts' constants. One graph, no uniforms.
 */
export function floraSward(P: AnyNode): FloraSward {
  let inside: AnyNode = float(0);
  let lush: AnyNode = vec3(0, 0, 0);
  let dry: AnyNode = vec3(0, 0, 0);
  let moss: AnyNode = vec3(0, 0, 0);
  let cover: AnyNode = float(0);
  let island: AnyNode = float(0);
  let seed: AnyNode = float(0);
  let coverage: AnyNode = float(0);
  let leadShare: AnyNode = float(0);
  const c = new Color();
  const tone = (hex: number) => {
    c.set(hex);
    return vec3(c.r, c.g, c.b);
  };
  ISLAND_FLORA_PALETTES.forEach((p, index) => {
    const b = p.bounds;
    const w = smoothstep(b.minX - EDGE, b.minX, P.x)
      .mul(float(1).sub(smoothstep(b.maxX, b.maxX + EDGE, P.x)))
      .mul(smoothstep(b.minZ - EDGE, b.minZ, P.z))
      .mul(float(1).sub(smoothstep(b.maxZ, b.maxZ + EDGE, P.z)));
    inside = inside.add(w);
    lush = lush.add(tone(p.sward.lush).mul(w));
    dry = dry.add(tone(p.sward.dry).mul(w));
    moss = moss.add(tone(p.sward.moss).mul(w));
    cover = cover.add(w.mul(p.sward.cover ?? SWARD_COVER));
    const on = step(0.5, w);
    island = island.add(on.mul(index));
    seed = seed.add(on.mul(p.drifts.seed));
    coverage = coverage.add(on.mul(p.drifts.coverage));
    leadShare = leadShare.add(on.mul(p.drifts.leadShare));
  });
  return { inside, lush, dry, moss, cover, island, seed, coverage, leadShare };
}

export interface FloraDriftInputs {
  sward: FloraSward;
  /** World position and normal of the ground point. */
  P: AnyNode;
  N: AnyNode;
  /** 0-1: where the open ground shows flowers (meadow, a little on forest floors). */
  open: AnyNode;
  /** Dots start this far (m) from the camera (past the flower plants' reach where they're drawn). */
  near: number;
  /** 0-1 noise about a metre across (the terrain's fine grass noise): gathers the dots into clumps. */
  clump: AnyNode;
  /** 0-1 noise several metres across (the terrain's meadow macro): breaks up the wash. */
  patch: AnyNode;
  /** The sward's grain (a multiplier near 1), so the wash keeps the ground's texture. */
  grain: AnyNode;
}

/**
 * The islands' flower drifts carried on in the ground past the flower plants' reach (and from the
 * feet on Lite, which draws none), as `vec4(colour, amount)` to mix the ground toward. A drift is
 * the same ~18 m patch as the scatter's (`driftNodes` shares `driftAt`'s steps), shown as:
 * - a soft wash of its colours, patchy, that grows stronger with distance as the dots give out;
 * - small round dots, clumped, thinning toward its edge, mostly its lead's colour and some of a
 *   companion's. They're round on screen: stretched along the view by the ground's foreshortening,
 *   so on a slope or at a glancing angle they read as flowers, not dashes. They fade with distance and
 *   as they shrink under a couple of pixels.
 * All of it is skipped (a branch) off the open ground, and the dots past their distance.
 */
export function floraDrifts(i: FloraDriftInputs): AnyNode {
  const lut = (table ??= uniformArray(floraDriftRows(), 'vec4').setName('floraDrift'));
  const { sward, P, N } = i;
  // Derivatives outside the branch (they need uniform control flow).
  const pixel = vec2(fwidth(P.x), fwidth(P.z)).length();
  return Fn(() => {
    // Shared values set before the branch reads them (see `withVars` in vegetation/materials.ts).
    const p = P.toVar();
    const n = N.toVar();
    const open = i.open.toVar();
    const px = pixel.toVar();
    const clump = i.clump.toVar();
    const patch = i.patch.toVar();
    const grain = i.grain.toVar();
    const island = sward.island.toVar();
    const seed = sward.seed.toVar();
    const coverage = sward.coverage.toVar();
    const leadShare = sward.leadShare.toVar();
    const out = vec4(0, 0, 0, 0).toVar();
    If(open.greaterThan(0.01), () => {
      const xz = vec2(p.x, p.z);
      const drift = driftNodes(xz, seed, coverage);
      const row = (pick: AnyNode) =>
        lut.element(int(island.mul(DRIFT_BINS).add(clamp(floor(pick.mul(DRIFT_BINS)), 0, DRIFT_BINS - 1))));
      const lead = row(drift.lead).toVar();
      // The companion: another of the island's leads, picked per drift.
      const companion = row(fract(drift.lead.mul(7.31).add(0.37))).toVar();
      const strength = drift.strength.mul(lead.w).toVar();
      const toEye = cameraPosition.sub(p);
      const dist = toEye.length();
      // Round on screen: across the view a dot is a circle; along it, it's stretched by how much the
      // ground is foreshortened there (its tangent along the view, against the view ray).
      const view = toEye.div(dist);
      const flat = vec2(view.x, view.z);
      const along = flat.div(max(flat.length(), 1e-4)).toVar();
      const rise = n.x.mul(along.x).add(n.z.mul(along.y)).negate().div(max(n.y, 0.2));
      const foreshorten = (cross as AnyNode)(vec3(along.x, rise, along.y), view)
        .length()
        .toVar();
      const squash = clamp(foreshorten, SQUASH_MIN, 1).toVar();
      // A pixel's size across the view (m): the derivatives' length is mostly the along-view footprint.
      const across = px.mul(foreshorten).toVar();
      // Dots give out with distance, once they shrink under a couple of pixels, and at glancing
      // angles where they'd have to stretch past their cells to stay round (the wash carries on).
      const dots = smoothstep(i.near, i.near * 1.4 + 1, dist)
        .mul(float(1).sub(smoothstep(DOT_FAR[0], DOT_FAR[1], dist)))
        .mul(smoothstep(0.7, 1.4, float(DOT_RADIUS).div(max(across, 1e-4))))
        .mul(smoothstep(SQUASH_MIN * 0.7, SQUASH_MIN * 1.1, foreshorten))
        .toVar();
      // The wash: the drift's colours, patchy, gentle near and stronger where the dots have gone.
      const washTone = mix(lead.xyz, companion.xyz, 0.3).mul(grain);
      const washAmount = strength
        .mul(smoothstep(0.15, 0.6, patch.mul(0.6).add(clump.mul(0.4))))
        .mul(mix(WASH.far, WASH.near, dots))
        .mul(open);
      out.assign(vec4(washTone, washAmount));
      If(dots.greaterThan(0.001), () => {
        // The four cells round the nearest lattice corner: a dot may reach 0.75 of a cell from its
        // centre, so it can stretch along the view (round on screen) without being cut by a cell edge.
        const q = xz.div(DOT_CELL);
        const base = floor(q.sub(0.5));
        // Clumps: dots swell where the ground's fine noise is high and shrink away where it's low (a
        // smooth size, not an on/off, so no dot is cut at a clump's edge); smaller toward a drift's edge.
        const radius = float(DOT_RADIUS)
          .mul(smoothstep(0.32, 0.62, clump))
          .mul(strength.mul(0.4).add(0.6))
          .toVar();
        const soft = max(across.mul(0.75), radius.mul(0.3)).toVar();
        const chance = max(strength, float(SPRINKLE)).mul(DOT_FILL).toVar();
        const share = mix(float(LEAD_DOTS), float(0.9), leadShare.sub(0.6).mul(2)).toVar();
        for (const [ox, oz] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const cell = base.add(vec2(ox, oz));
          const h1 = hash(cell, 1);
          const h2 = fract(h1.mul(53.17).add(0.29));
          const roll = (a: number, b: number) => fract(h1.mul(a).add(h2.mul(b)));
          const o = q.sub(cell).sub(vec2(h1, h2).mul(0.5).add(0.25)).mul(DOT_CELL);
          const a = o.x.mul(along.x).add(o.y.mul(along.y));
          const c = o.x.mul(along.y).sub(o.y.mul(along.x));
          const d = vec2(c, a.mul(squash)).length();
          const dot = float(1)
            .sub(smoothstep(radius.sub(soft), radius.add(soft), d))
            .mul(step(roll(13.7, 3.1), chance))
            .mul(dots)
            .mul(open);
          const tone = mix(companion.xyz, lead.xyz, step(roll(29.1, 11.3), share)).mul(
            roll(7.7, 23.9).mul(0.3).add(0.85),
          );
          // Over what's there: `out` is (colour, amount), so mix by this dot's share of the total.
          const total = out.w.add(dot.mul(float(1).sub(out.w)));
          out.assign(vec4((mix as AnyNode)(out.xyz, tone, dot.div(max(total, 1e-4))), total));
        }
      });
    });
    return out;
  })();
}
