import { smoothstep } from '../../util/math';

/**
 * Conversational body language for NPCs. While someone's talking they pick a gesture, hold it for
 * a couple of seconds with small beats, rest, then pick a different one, so nobody loops the same
 * motion for a whole conversation.
 */
export type GestureKind = 'explain' | 'present' | 'point' | 'open' | 'nod' | 'lean';

/** Which hand an NPC talks with: the one that isn't holding something, or either. */
export type GestureHand = 'left' | 'right' | 'either';

/** +1 is the character's left arm, -1 the right. */
export type Side = 1 | -1;

/**
 * An arm pose in the character's own frame (+x left, +y up, +z forward), in radians: `flex`
 * swings the upper arm forward, `abduct` lifts it out to the side, `elbow` bends the forearm up.
 */
export interface ArmPose {
  flex: number;
  abduct: number;
  elbow: number;
}

export interface ActiveGesture {
  kind: GestureKind;
  side: Side;
  /** Seconds since it began. */
  t: number;
  dur: number;
  /** 0 → 1 → 0 over the gesture, easing in and out. */
  weight: number;
  /** True on the frame it begins (clip-driven gestures start their clip then). */
  started: boolean;
}

interface GestureDef {
  weight: number;
  dur: readonly [min: number, max: number];
  /** Needs both hands free. */
  bothHands?: boolean;
}

const GESTURES: Record<GestureKind, GestureDef> = {
  explain: { weight: 3, dur: [2.2, 3.0] },
  present: { weight: 2, dur: [1.8, 2.4] },
  point: { weight: 1, dur: [1.6, 2.2] },
  open: { weight: 2, dur: [2.0, 2.6], bothHands: true },
  nod: { weight: 2, dur: [1.6, 1.6] },
  lean: { weight: 1, dur: [2.0, 2.8] },
};

const GAP: readonly [number, number] = [0.7, 2.2];
const FIRST: readonly [number, number] = [0.35, 0.85];

/** The gesturing arm's pose at `t` seconds in, before the envelope scales it. */
export function gestureArm(kind: GestureKind, t: number, dur: number): ArmPose | null {
  const beat = Math.sin(t * Math.PI * 2 * 2.2);
  switch (kind) {
    case 'explain':
      // Hand out in front at chest height; any higher and a raised palm reads as a wave.
      return { flex: 0.62 + beat * 0.04, abduct: 0.12, elbow: 1.0 + beat * 0.1 };
    case 'present':
      // An open-handed sweep out to the side.
      return { flex: 0.5, abduct: 0.2 + 0.35 * smoothstep(0, dur, t), elbow: 0.75 };
    case 'point':
      return { flex: 1.15, abduct: 0.35, elbow: 0.12 };
    case 'open':
      return { flex: 0.45 + beat * 0.03, abduct: 0.3, elbow: 1.05 + beat * 0.06 };
    default:
      return null;
  }
}

/** Forward lean of the torso for a gesture, in radians. */
export function gestureLean(kind: GestureKind): number {
  return kind === 'lean' ? 0.08 : kind === 'explain' || kind === 'open' ? 0.025 : 0;
}

/** Picks and times gestures for one talker. `random` is injectable for tests. */
export class GesturePlanner {
  private current: ActiveGesture | null = null;
  private last: GestureKind | null = null;
  private lastSide: Side = 1;
  private wait = 0;
  private on = false;

  constructor(
    private readonly hand: GestureHand,
    private readonly canNod: boolean,
    private readonly random: () => number = Math.random,
  ) {}

  get active(): boolean {
    return this.on;
  }

  start(): void {
    this.on = true;
    this.current = null;
    this.wait = lerp(FIRST, this.random());
  }

  stop(): void {
    this.on = false;
    this.current = null;
  }

  update(dt: number): ActiveGesture | null {
    if (!this.on) return null;
    const g = this.current;
    if (g) {
      g.started = false;
      g.t += dt;
      if (g.t < g.dur) {
        g.weight = smoothstep(0, 0.4, g.t) * (1 - smoothstep(g.dur - 0.5, g.dur, g.t));
        return g;
      }
      this.current = null;
      this.wait = lerp(GAP, this.random());
      return null;
    }
    this.wait -= dt;
    if (this.wait > 0) return null;
    const kind = this.pick();
    const side = this.pickSide();
    const def = GESTURES[kind];
    this.last = kind;
    this.lastSide = side;
    this.current = { kind, side, t: 0, dur: lerp(def.dur, this.random()), weight: 0, started: true };
    return this.current;
  }

  private pick(): GestureKind {
    const options = (Object.keys(GESTURES) as GestureKind[]).filter(
      (k) =>
        k !== this.last && (k !== 'nod' || this.canNod) && (!GESTURES[k].bothHands || this.hand === 'either'),
    );
    const total = options.reduce((sum, k) => sum + GESTURES[k].weight, 0);
    let roll = this.random() * total;
    for (const k of options) {
      roll -= GESTURES[k].weight;
      if (roll <= 0) return k;
    }
    return options[options.length - 1]!;
  }

  private pickSide(): Side {
    if (this.hand === 'left') return 1;
    if (this.hand === 'right') return -1;
    // Mostly alternate, so an either-handed talker doesn't favour one arm.
    return this.random() < 0.7 ? (-this.lastSide as Side) : this.lastSide;
  }
}

function lerp([a, b]: readonly [number, number], t: number): number {
  return a + (b - a) * t;
}
