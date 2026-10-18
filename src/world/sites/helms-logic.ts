import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { puzzleMaybe } from '../../course/puzzles';
/**
 * P1.2 The Three Helms (Chapter 01, Rhea): three orders sailed in your own ship, out in the bay south
 * of Port Meridian's harbour mouth. At each buoy Rhea hands you an order card, written from the use
 * case column of the course's modes table (01 §Modes), and you pick the helm (the mode) that fits.
 * A wrong pick gets Rhea's reason, and the reef passage under Autopilot stops short: "This passage is
 * one where the approach matters. Chart it first." Then the run teaches its mode by using it:
 *
 * - Interactive ("step-by-step collaboration"): at each mark you choose the next heading. You direct
 *   the work; a yes for each step would be Tool permissions, not the mode.
 * - Plan ("plan first, execute when ready"): Rhea charts the route and the review offers the app's
 *   three options (02 §Exercise: Start a Session from a Branch and Attach an Issue). Her first chart
 *   cuts across the Shoal, so suggesting a change is best; approving the fixed plan sails it in
 *   Autopilot, straight through.
 * - Autopilot ("end-to-end execution without interruption"): you give her the destination (your berth
 *   on the east arm) and she sails there and moors, with no stops.
 *
 * The crew trims the sails to a set pace on these runs, so the wind never stalls a lesson.
 */

export type HelmMode = 'interactive' | 'plan' | 'autopilot';

/** One way to sail an Interactive leg: you choose it at the mark before. */
export interface HelmHeading {
  id: string;
  /** What you tell Rhea (on the choice card and in the session log). */
  label: string;
  /** Points she sails through on the way to the leg's mark (none: straight for it). */
  via: readonly { x: number; z: number }[];
}

export interface HelmRun {
  mode: HelmMode;
  /** The buoy you sail up to to hear this order. */
  buoy: { x: number; z: number };
  /** The flag colour on the buoy and its route markers (linear-friendly deep colours). */
  colour: number;
  /** Waypoints after the buoy. Interactive stops at each one for your next heading; the others sail through. */
  route: readonly { x: number; z: number }[];
  /** Metres per second while she sails the run. */
  speed: number;
  /** The plan as Rhea charts it (Plan only): one short line per leg of `route`. */
  plan?: readonly string[];
  /** Plan only: her first chart, which cuts across the Shoal, and its lines. */
  draft?: { route: readonly { x: number; z: number }[]; plan: readonly string[] };
  /** Interactive only: the two headings you choose between for each leg (to `route[i]`). */
  headings?: readonly (readonly [HelmHeading, HelmHeading])[];
}

/** Rhea's order card at a buoy: an order from the course's use-case column, and the helm that fits. */
export interface HelmOrder {
  /** The voyage's name (the buoy's board and the compass). */
  name: string;
  /** Rhea's voiced line handing you the card. */
  line: string;
  /** The order, on the card. */
  text: string;
  /** Rhea's voiced reason for each wrong helm (Autopilot on the reef passage sets off, then stops). */
  wrong: Readonly<Record<HelmMode, string | null>>;
}

export const HELM_ORDER: readonly HelmMode[] = ['interactive', 'plan', 'autopilot'];

/**
 * The modes as the course describes them (for the Copilot app course, 01 §Modes, "How the app
 * interprets it"), and the three orders, keyed by the helm that fits them (the buoys come in this
 * order, and each run ends near the next buoy): the course pack's `puzzles/three-helms.json`.
 */
export let MODE_INFO: Readonly<Record<HelmMode, { name: string; says: string }>> = {} as Record<
  HelmMode,
  { name: string; says: string }
>;
export let HELM_ORDERS: Readonly<Record<HelmMode, HelmOrder>> = {} as Record<HelmMode, HelmOrder>;
onCourse(() => {
  const c = puzzleMaybe<PuzzleFile & { modes: typeof MODE_INFO; orders: typeof HELM_ORDERS }>('three-helms');
  MODE_INFO = c?.modes ?? ({} as typeof MODE_INFO);
  HELM_ORDERS = c?.orders ?? ({} as typeof HELM_ORDERS);
});

/** How close to a buoy you hear its order (each run stops about 28 m from the next buoy). */
export const TAKE_RANGE = 34;

/** Where the east-arm berth's approach begins (the Autopilot run hands over to docking there). */
export const BERTH_APPROACH = { x: 747.4, z: -676 } as const;

/** The Shoal: a marked hazard on the reef passage that Rhea's first chart cuts straight across. */
export const SHOAL = { x: 813, z: -528 } as const;

/** How far Autopilot gets into the reef passage before Rhea stops her (metres). */
export const BALK_RUN = 16;

export const MERIDIAN_HELMS: Readonly<Record<HelmMode, HelmRun>> = {
  interactive: {
    mode: 'interactive',
    buoy: { x: 680, z: -582 },
    colour: 0x1f6fb2,
    route: [
      { x: 640, z: -532 },
      { x: 700, z: -500 },
      { x: 722, z: -540 },
    ],
    speed: 4.4,
    headings: [
      [
        { id: 'straight', label: 'Straight for mark 1, south-west', via: [] },
        { id: 'south', label: 'South first, then west to mark 1', via: [{ x: 674, z: -536 }] },
      ],
      [
        { id: 'straight', label: 'Straight for mark 2, east', via: [] },
        { id: 'south', label: 'South first, then east to mark 2', via: [{ x: 648, z: -498 }] },
      ],
      [
        { id: 'straight', label: 'Straight for mark 3, north-east', via: [] },
        { id: 'east', label: 'East first, then north to mark 3', via: [{ x: 728, z: -508 }] },
      ],
    ],
  },
  plan: {
    mode: 'plan',
    buoy: { x: 742, z: -560 },
    colour: 0xc9831c,
    route: [
      { x: 782, z: -510 },
      { x: 840, z: -502 },
      { x: 836, z: -554 },
      { x: 822, z: -584 },
    ],
    speed: 4.8,
    plan: [
      'South-east to the first marker',
      'East to the far marker, south of the Shoal',
      'Come about at the far marker',
      'Finish at the Autopilot buoy',
    ],
    draft: {
      route: [
        { x: 782, z: -510 },
        { x: 836, z: -554 },
        { x: 822, z: -584 },
      ],
      plan: [
        'South-east to the first marker',
        'Cut north-east, straight across the Shoal',
        'Finish at the Autopilot buoy',
      ],
    },
  },
  autopilot: {
    mode: 'autopilot',
    buoy: { x: 800, z: -566 },
    colour: 0x2f8f4e,
    route: [
      { x: 774, z: -600 },
      { x: 746, z: -640 },
      { x: BERTH_APPROACH.x, z: BERTH_APPROACH.z },
    ],
    speed: 5.4,
  },
};

/** The points she sails for Interactive leg `leg` with heading `h` (the mark last). */
export function interactiveLeg(leg: number, h: HelmHeading): { x: number; z: number }[] {
  return [...h.via, MERIDIAN_HELMS.interactive.route[leg]!];
}

/** The next helm to sail, or null when all three are done (`done` is the list sailed so far). */
export function nextHelm(done: readonly HelmMode[]): HelmMode | null {
  return HELM_ORDER.find((m) => !done.includes(m)) ?? null;
}

/** The full course for a run: the buoy, then its route. */
export function helmCourse(run: HelmRun): { x: number; z: number }[] {
  return [run.buoy, ...run.route];
}

/**
 * Samples the course as the ship's spline autopilot would sail it (Catmull-Rom through the points),
 * every `step` metres or so, for checks like water depth under the hull.
 */
export function sampleCourse(
  points: readonly { x: number; z: number }[],
  step = 2,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t,
      t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };
  for (let seg = 0; seg < points.length - 1; seg++) {
    const p0 = points[Math.max(0, seg - 1)]!,
      p1 = points[seg]!,
      p2 = points[seg + 1]!,
      p3 = points[Math.min(points.length - 1, seg + 2)]!;
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push({ x: catmull(p0.x, p1.x, p2.x, p3.x, t), z: catmull(p0.z, p1.z, p2.z, p3.z, t) });
    }
  }
  out.push({ ...points[points.length - 1]! });
  return out;
}

/**
 * The water the three runs use (every buoy and mark, with `margin` m of sea round them), as a circle:
 * the leaping fish and dolphins keep out of it while the course is sailed.
 */
export function helmsCourseArea(margin = 30): { x: number; z: number; r: number } {
  const points = HELM_ORDER.flatMap((m) => helmCourse(MERIDIAN_HELMS[m]));
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const r = Math.max(...points.map((p) => Math.hypot(p.x - x, p.z - z)));
  return { x, z, r: r + margin };
}
