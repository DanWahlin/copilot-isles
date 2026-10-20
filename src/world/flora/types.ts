import type { HeightField } from '../contracts';
import type { ScatterBounds, VegetationMasks } from '../vegetation/types';

/**
 * Where a flower or a tuft grows. The island's rules (`FloraRules.habitatAt`) say which habitat a spot
 * is; the palette says which species grow in each. `bank` is a stream's or a pool's edge, `spray` the
 * damp ground a waterfall wets.
 */
export type FloraHabitat = 'meadow' | 'dune' | 'village' | 'forest' | 'bank' | 'spray';

/** Every habitat, in a fixed order (the scatter's species lists). */
export const FLORA_HABITATS: readonly FloraHabitat[] = [
  'meadow',
  'dune',
  'village',
  'forest',
  'bank',
  'spray',
];

/** The habitats of open ground, whose flowers drift (and carry on in the terrain as colour). */
export const DRIFT_HABITATS: readonly FloraHabitat[] = ['meadow', 'forest'];

/**
 * A flower plant's shape (one shared geometry each, all drawn with the grass material). Each is a
 * small plant, not a single head: a few heads on stems of their own over a rosette of leaves.
 * - `bloom`: five-petal heads, flat to cupped (hibiscus, poppy, orchid...);
 * - `spike`: spikes of small flowers (lavender, heliconia, sea oats);
 * - `cap`: a cluster of domed caps on short stems (mushrooms);
 * - `frond`: arching fern fronds (no flowers; the "petal" colours are the fronds').
 */
export type HeadForm = 'bloom' | 'spike' | 'cap' | 'frond';

/** One flower of an island's palette. Colours are sRGB hex. */
export interface FloraSpecies {
  readonly id: string;
  readonly form: HeadForm;
  /** Petal colours: each head is picked somewhere between the two. */
  readonly colours: readonly [number, number];
  /** The head's eye (its centre), blended out toward the petals. */
  readonly eye: number;
  /** How the head dishes: 1 a deep cup, 0 flat, below 0 a dome (a cap). */
  readonly cup: number;
  /** How deep the throat sinks (0 none, 1 a trumpet). */
  readonly throat: number;
  /** Head radius range (m), per head. */
  readonly size: readonly [number, number];
  /** Stem height range (m), per head. */
  readonly stem: readonly [number, number];
  /** Self-lit share of the petal colour (0 none; mushrooms glow faintly, most in the shade and at dusk). */
  readonly glow?: number;
  readonly habitats: readonly FloraHabitat[];
  /** Its share of the mix (relative to the island's other species in the same habitat). */
  readonly weight: number;
  /**
   * Whether it leads drifts, which the terrain carries on as colour past the plants' reach. Default:
   * the blooms and spikes of open ground (`DRIFT_HABITATS`); mushrooms and ferns grow where they grow.
   */
  readonly drifts?: boolean;
}

/**
 * An island's flowers and grass, as data (game art, not course content): "beautify an island" is one
 * palette and its rules. Drifts are ~18 m patches where one species leads; the terrain carries the
 * same drifts on as colour speckle past the flowers' reach.
 */
export interface FloraPalette {
  readonly id: string;
  /** The island's world rectangle: the terrain takes this palette's sward and speckle inside it. */
  readonly bounds: ScatterBounds;
  readonly grass: {
    /** Blade colours from moss through lush and meadow to dry straw (sRGB hex, 4 stops). */
    readonly ramp: readonly [number, number, number, number];
    /** Share of dead straw blades (0-1). */
    readonly straw: number;
  };
  /**
   * The terrain's sward (sRGB hex): the blades' mean over lush and dry ground and the forest floor's
   * moss, which the ground takes under and beyond the blades so no pale soil shows between tufts, and
   * how much of it the open grassy ground takes (0-1, default 0.55; more for a sparse sward).
   */
  readonly sward: {
    readonly lush: number;
    readonly dry: number;
    readonly moss: number;
    readonly cover?: number;
  };
  readonly drifts: {
    /** Share of drift cells that hold a drift (0-1). */
    readonly coverage: number;
    /** Share of a drift's heads that are its lead species. */
    readonly leadShare: number;
    /** Hash salt, so neighbouring islands' drifts differ. */
    readonly seed: number;
  };
  readonly species: readonly FloraSpecies[];
}

/** Blade kind: meadow tussocks, tall sea oats, low creeper or moss cushions. */
export type BladeKind = 'meadow' | 'seaOats' | 'creeper' | 'moss';

/** How a spot reads for the flora: its habitat and how well grass grows there (filled in place). */
export interface FloraSpot {
  habitat: FloraHabitat;
  /** Blade cover (0 none … ~1.4 lush); flowers can still grow where it's 0. */
  weight: number;
  kind: BladeKind;
  /** Where the blades sit on the palette's ramp (0 moss … 1 straw). */
  ramp: number;
}

/** An island's flora: its palette and where each habitat is (data from the island's package). */
export interface FloraRules {
  readonly palette: FloraPalette;
  /** Where the grass and flowers are scattered (cells outside it are skipped). */
  readonly bounds: ScatterBounds;
  /**
   * What grows at a spot, written into `out` (the scatter asks for every candidate, so nothing is
   * allocated); `null` where nothing grows.
   */
  habitatAt(
    x: number,
    z: number,
    y: number,
    masks: VegetationMasks,
    field: HeightField,
    out: FloraSpot,
  ): FloraSpot | null;
  /** Flower plants per 8 m cell at the heart of a drift (before the tier's density). */
  readonly flowersPerCell: number;
  /**
   * Blades: 1 the island's full meadow, lower for a sparse sward (dry hills, a forest's moss), which
   * gathers into stands with bare ground between; 0 for flowers only.
   */
  readonly bladeDensity: number;
  /**
   * Flower plants a habitat has everywhere, against a drift's heart (1). Default: a light sprinkle on
   * open ground (`DRIFT_HABITATS`, where the drifts add the rest), about half elsewhere.
   */
  readonly habitatFill?: Partial<Record<FloraHabitat, number>>;
}
