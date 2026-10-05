/**
 * The opening's timing (docs/specs/OPENING-living-chart.md): when each beat starts and ends, in
 * seconds from Set sail, and the easing curves that give the latch, lid and paper their anticipation
 * and follow-through. Pure functions, so the timing is testable without a renderer.
 */

/** A new voyage plays the whole cabin beat; Continue starts on the living chart and dives. */
export type OpeningKind = 'voyage' | 'continue';

export interface OpeningBeats {
  /** Fade in from warm dark. */
  fadeIn: number;
  /** Where the beat waits (the establishing shot) until the island's heavy build is done. */
  gate: number;
  /** The latch lifts (anticipation), then snaps open at `latch`. */
  latchLift: number;
  latch: number;
  /** The lid dips (anticipation) from `lidDip`, swings open from `lid`, and settles by `lidEnd`. */
  lidDip: number;
  lid: number;
  lidEnd: number;
  /** The rolled chart rises out of the chest and arcs over to the desk. */
  rise: number;
  riseEnd: number;
  /** It unrolls across the desk, then the paper's curl settles. */
  unroll: number;
  unrollEnd: number;
  settleEnd: number;
  /** The inked sea turns to water from the centre outward. */
  water: number;
  waterEnd: number;
  /** Each island pops up from the paper (Anchorage first). */
  anchorage: number;
  meridian: number;
  /** The tiny brigantine pops up and catches the wind. */
  ship: number;
  /** The earliest the dive can start (it waits on the load past this). */
  ready: number;
  /** The dive's length, and how long before its end the spray flash starts. */
  dive: number;
  flashLead: number;
}

const VOYAGE: OpeningBeats = {
  fadeIn: 1.1,
  gate: 1.2,
  latchLift: 1.5,
  latch: 1.78,
  lidDip: 2.15,
  lid: 2.4,
  lidEnd: 3.5,
  rise: 3.3,
  riseEnd: 5.0,
  unroll: 5.0,
  unrollEnd: 6.5,
  settleEnd: 7.4,
  water: 7.2,
  waterEnd: 9.4,
  anchorage: 8.2,
  meridian: 8.8,
  ship: 9.5,
  ready: 11.2,
  dive: 3.6,
  flashLead: 0.8,
};

/** Continue: the chart's already alive on the desk; a moment to take it in, then the dive. */
const CONTINUE: OpeningBeats = {
  fadeIn: 0.8,
  gate: 0,
  latchLift: 0,
  latch: 0,
  lidDip: 0,
  lid: 0,
  lidEnd: 0,
  rise: 0,
  riseEnd: 0,
  unroll: 0,
  unrollEnd: 0,
  settleEnd: 0,
  water: 0,
  waterEnd: 0,
  anchorage: 0,
  meridian: 0,
  ship: 0,
  ready: 1.0,
  dive: 3.2,
  flashLead: 0.7,
};

export function openingBeats(kind: OpeningKind): OpeningBeats {
  return kind === 'voyage' ? VOYAGE : CONTINUE;
}

/** 0 before `a`, 1 after `b`, linear between. */
export function phase(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

export function easeInCubic(x: number): number {
  return x * x * x;
}

/** Overshoots past 1 and settles back (follow-through). `s` sets the overshoot (1.70158 ≈ 10 %). */
export function easeOutBack(x: number, s = 1.70158): number {
  const c3 = s + 1;
  return 1 + c3 * (x - 1) ** 3 + s * (x - 1) ** 2;
}

/**
 * A damped spring's settle: 1 at x = 0 decaying to 0, oscillating `cycles` times (paper and lid
 * wobble after they land).
 */
export function wobble(x: number, cycles = 2.5): number {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  return Math.cos(x * cycles * Math.PI * 2) * (1 - x) ** 2;
}

/**
 * The lid's opening angle (0 closed → 1 fully open) over time, with a dip below 0 before it opens
 * (anticipation) and an overshoot and bounce at the top (follow-through).
 */
export function lidOpen(t: number, b: OpeningBeats): number {
  if (t < b.lidDip) return 0;
  if (t < b.lid) return -0.035 * Math.sin(phase(t, b.lidDip, b.lid) * Math.PI * 0.5);
  const x = phase(t, b.lid, b.lidEnd);
  if (x < 0.62) return -0.035 + 1.035 * easeOutBack(x / 0.62, 1.1);
  // A heavy lid bounces once against its stay before it rests.
  const y = (x - 0.62) / 0.38;
  return 1 - 0.035 * Math.sin(y * Math.PI * 3) * (1 - y) ** 2;
}

/** The latch: lifts a little (anticipation), then snaps open with a small bounce. 0 shut → 1 open. */
export function latchOpen(t: number, b: OpeningBeats): number {
  if (t < b.latchLift) return 0;
  if (t < b.latch) return 0.08 * easeOutCubic(phase(t, b.latchLift, b.latch));
  const x = phase(t, b.latch, b.latch + 0.35);
  return 0.08 + 0.92 * easeOutBack(x, 2.4);
}

/** How far the paper's unrolled (0 rolled → 1 flat), easing into the desk. */
export function unrollAmount(t: number, b: OpeningBeats): number {
  return easeInOutCubic(phase(t, b.unroll, b.unrollEnd));
}

/** The paper's settle after unrolling: its ends lift and relax (1 → 0, oscillating). */
export function paperSettle(t: number, b: OpeningBeats): number {
  if (t < b.unrollEnd - 0.25) return 0;
  if (t < b.unrollEnd) return phase(t, b.unrollEnd - 0.25, b.unrollEnd);
  return wobble(phase(t, b.unrollEnd, b.settleEnd), 1.5);
}

/** The water's reach from the chart's centre (0 → 1 covers every corner). */
export function waterReach(t: number, b: OpeningBeats): number {
  return easeInOutCubic(phase(t, b.water, b.waterEnd));
}

/** A pop-up's rise (0 flat → 1 standing), with an overshoot like a card unfolding. */
export function popUp(t: number, start: number, seconds = 0.9): number {
  if (t <= start) return 0;
  return easeOutBack(phase(t, start, start + seconds), 1.6);
}

/** The spray flash's strength at `x` seconds into the dive (peaks at the dive's end, the swap). */
export function flashIn(x: number, b: OpeningBeats): number {
  const p = phase(x, b.dive - b.flashLead, b.dive);
  return p * p * (3 - 2 * p);
}
