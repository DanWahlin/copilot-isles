/**
 * P1.2 The Three Helms (Chapter 01, Rhea): the three session modes sailed in your own ship, out in
 * the bay south of Port Meridian's harbour mouth, in the course's order.
 *
 * - Interactive ("step-by-step collaboration"): she sails one leg at a time and heaves to at each
 *   mark, and you say when to sail the next.
 * - Plan ("plan first, execute when ready"): the whole route is charted on the water and listed,
 *   and nothing moves until you approve it. Then she sails it straight through.
 * - Autopilot ("end-to-end execution without interruption"): you give her the destination (your
 *   berth on the east arm) and she sails there and moors, with no stops.
 *
 * The crew trims the sails to a set pace on these runs, so the wind never stalls a lesson.
 */

export type HelmMode = 'interactive' | 'plan' | 'autopilot';

export interface HelmRun {
  mode: HelmMode;
  /** The buoy you sail up to to take this helm. */
  buoy: { x: number; z: number };
  /** The flag colour on the buoy and its route markers (linear-friendly deep colours). */
  colour: number;
  /** Waypoints after the buoy. Interactive heaves to at each one; the others sail through. */
  route: readonly { x: number; z: number }[];
  /** Metres per second while she sails the run. */
  speed: number;
  /** The plan as Rhea charts it (Plan only): one short line per leg. */
  plan?: readonly string[];
}

export const HELM_ORDER: readonly HelmMode[] = ['interactive', 'plan', 'autopilot'];

/** Where the east-arm berth's approach begins (the Autopilot run hands over to docking there). */
export const BERTH_APPROACH = { x: 747.4, z: -676 } as const;

export const MERIDIAN_HELMS: Readonly<Record<HelmMode, HelmRun>> = {
  interactive: {
    mode: 'interactive',
    buoy: { x: 680, z: -582 },
    colour: 0x1f6fb2,
    route: [
      { x: 640, z: -532 },
      { x: 700, z: -500 },
      { x: 736, z: -548 },
    ],
    speed: 4.4,
  },
  plan: {
    mode: 'plan',
    buoy: { x: 742, z: -560 },
    colour: 0xc9831c,
    route: [
      { x: 782, z: -510 },
      { x: 840, z: -502 },
      { x: 836, z: -554 },
      { x: 804, z: -566 },
    ],
    speed: 4.8,
    plan: [
      'Run south to the first marker',
      'Reach east along the coast',
      'Come about at the far marker',
      'Finish at the Autopilot buoy',
    ],
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
