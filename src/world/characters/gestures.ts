import { smoothstep } from '../../util/math';

/**
 * Conversational body language for NPCs (issue #187). Gestures are authored key poses with
 * anticipation (a small wind-up the other way), a stroke that lands on a stressed word, an overshoot,
 * a settle, a hold and a follow-through back to rest, sampled on Catmull-Rom curves so the hand
 * travels on arcs. Voiced lines time the strokes from their word timings; unvoiced talk picks
 * stressed moments on its own. The torso never pitches: only arms, hands and the head move.
 */
export type GestureKind = 'beat' | 'offer' | 'point' | 'raise' | 'spread' | 'nod';

/** Which hand an NPC talks with: the one that isn't holding something, or either. */
export type GestureHand = 'left' | 'right' | 'either';

/**
 * How a teacher talks with their hands: `ledger` keeps one hand on what they carry, `open` uses both
 * hands, `commander` sets a fist on the hip and gestures with the other hand.
 */
export type GestureStyle = 'ledger' | 'open' | 'commander';

/** +1 is the character's left arm, -1 the right. */
export type Side = 1 | -1;

/**
 * An arm and hand pose in the character's own frame (+x left, +y up, +z forward), radians, as offsets
 * from the clip: `flex` swings the upper arm forward, `abduct` lifts it out to the side, `elbow` bends
 * the forearm up, `twist` rolls the forearm palm-up, `wrist` bends the hand palm-down; `curl`, `index`
 * and `thumb` close the middle finger, the index and the thumb toward the palm (negative opens them).
 * `inward` folds the forearm in toward the body across the front plane (hands on hips); it isn't keyed.
 */
export interface ArmPose {
  flex: number;
  abduct: number;
  elbow: number;
  inward: number;
  twist: number;
  wrist: number;
  curl: number;
  index: number;
  thumb: number;
}

const CHANNELS = 8;
type Key = readonly [t: number, ...pose: number[]];
const REST = [0, 0, 0, 0, 0, 0, 0, 0] as const;
const rest = (t: number): Key => [t, ...REST];

interface GestureDef {
  /** Keys relative to the stroke (t = 0 lands on the stressed word). */
  readonly keys: readonly Key[];
  readonly bothHands?: boolean;
}

/** Authored gestures: [t, flex, abduct, elbow, twist, wrist, curl, index, thumb]. */
export const GESTURES: Record<Exclude<GestureKind, 'nod'>, GestureDef> = {
  // A downward beat of the open hand at chest height: lift and cock the wrist, chop, rebound.
  beat: {
    keys: [
      rest(-0.55),
      [-0.14, 0.56, 0.14, 0.92, 0.3, -0.35, -0.05, -0.1, 0],
      [0, 0.5, 0.13, 0.62, 0.3, 0.32, -0.1, -0.15, 0],
      [0.1, 0.48, 0.13, 0.56, 0.3, 0.42, -0.08, -0.12, 0],
      [0.32, 0.52, 0.13, 0.68, 0.28, 0.16, 0, -0.05, 0.05],
      [0.85, 0.48, 0.12, 0.66, 0.24, 0.1, 0.05, 0, 0.05],
      rest(1.35),
    ],
  },
  // Palm-up offer: the hand sinks palm-down by the belly, then opens out and up on the word.
  offer: {
    keys: [
      rest(-0.5),
      [-0.2, 0.12, 0.02, 0.85, -0.15, 0.25, 0.45, 0.4, 0.35],
      [0, 0.74, 0.26, 0.86, 1.0, -0.18, -0.1, -0.12, -0.1],
      [0.14, 0.79, 0.3, 0.8, 1.1, -0.28, -0.12, -0.15, -0.12],
      [0.42, 0.72, 0.26, 0.9, 1.05, -0.14, -0.05, -0.06, -0.05],
      [1.2, 0.68, 0.24, 0.94, 0.98, -0.1, 0, 0, 0],
      [1.65, 0.24, 0.08, 0.52, 0.3, 0.1, 0.15, 0.15, 0.1],
      rest(2.1),
    ],
  },
  // Point: pull the hand back by the hip and cock it, then thrust the index out on the word, hold.
  point: {
    keys: [
      rest(-0.5),
      [-0.2, -0.14, 0.12, 0.72, -0.15, 0.3, 0.6, 0.5, 0.4],
      [0, 1.06, 0.24, 0.3, 0.2, -0.05, 1.35, -0.12, 0.95],
      [0.12, 1.14, 0.27, 0.2, 0.22, -0.12, 1.4, -0.16, 1.0],
      [0.36, 1.04, 0.24, 0.3, 0.2, -0.02, 1.35, -0.1, 0.95],
      [1.1, 0.99, 0.22, 0.36, 0.15, 0.04, 1.3, -0.05, 0.9],
      [1.55, 0.35, 0.12, 0.5, 0.05, 0.12, 0.4, 0.3, 0.25],
      rest(2.0),
    ],
  },
  // One finger up ("one more thing"): a small dip, then the forearm rises with the index up.
  raise: {
    keys: [
      rest(-0.45),
      [-0.15, 0.1, 0.08, 0.7, 0, 0.15, 0.7, 0.55, 0.45],
      [0, 0.36, 0.16, 1.72, 0.35, -0.12, 1.35, -0.12, 0.65],
      [0.1, 0.38, 0.17, 1.82, 0.38, -0.18, 1.4, -0.16, 0.7],
      [0.32, 0.36, 0.16, 1.7, 0.35, -0.1, 1.35, -0.1, 0.65],
      [0.95, 0.34, 0.15, 1.66, 0.3, -0.05, 1.3, -0.05, 0.6],
      [1.4, 0.14, 0.06, 0.75, 0.08, 0.1, 0.45, 0.35, 0.3],
      rest(1.85),
    ],
  },
  // Both hands open out to the sides, palms up: gather in front, then spread on the word.
  spread: {
    bothHands: true,
    keys: [
      rest(-0.5),
      [-0.18, 0.28, 0.04, 0.95, -0.15, 0.18, 0.4, 0.35, 0.3],
      [0, 0.58, 0.42, 0.82, 1.0, -0.2, -0.12, -0.12, -0.1],
      [0.15, 0.6, 0.47, 0.74, 1.08, -0.3, -0.15, -0.15, -0.12],
      [0.42, 0.58, 0.41, 0.84, 1.02, -0.15, -0.06, -0.06, -0.05],
      [1.05, 0.55, 0.39, 0.88, 0.96, -0.1, 0, 0, 0],
      [1.5, 0.15, 0.2, 0.45, 0.3, 0.05, 0.12, 0.12, 0.1],
      rest(1.95),
    ],
  },
};

/** A fist set on the hip, elbow out, held while a commander talks. */
export const HIP_FIST: Readonly<ArmPose> = {
  flex: -0.22,
  abduct: 0.28,
  elbow: 0.15,
  inward: 1.55,
  twist: -0.3,
  wrist: 0.35,
  curl: 1.45,
  index: 1.4,
  thumb: 0.8,
};

const STYLE_KINDS: Record<GestureStyle, readonly Exclude<GestureKind, 'nod'>[]> = {
  ledger: ['point', 'offer', 'beat', 'raise'],
  open: ['spread', 'offer', 'point', 'beat'],
  commander: ['point', 'beat', 'offer', 'raise'],
};

export interface SpokenWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

export interface Accent {
  /** Seconds into the line where the stroke lands. */
  t: number;
  kind: GestureKind;
}

const STOP = new Set(
  (
    'a an and are as at be but by can do for from has have he her his i if in is it its it’s me my no not ' +
    'of on or our she so than that’s the their them then there’s they this’ll to up us was we were what ' +
    'when where which who will with you your you’re you’ll you’ve i’m i’ve we’ll let’s just'
  ).split(' '),
);
const DEICTIC = new Set(
  'here there this that these those see look below beside behind next top end left right up'.split(' '),
);
const COUNTING = new Set('first one only every always never each all three both'.split(' '));

/**
 * Picks the stressed words of a line, at most one stroke every ~2 s, and what to do on each: point at
 * "there" and "that", a finger up for "first" and "only", an offer for a question, a spread (or offer)
 * for an exclamation, otherwise beats and offers in turn. Never the same gesture twice running.
 */
export function planAccents(
  words: readonly SpokenWord[],
  text: string,
  duration: number,
  style: GestureStyle,
): Accent[] {
  const kinds = STYLE_KINDS[style];
  const scored = words.map((w, i) => {
    const bare = w.word.toLowerCase();
    let score = 0;
    if (!STOP.has(bare)) score += bare.length >= 7 ? 2 : bare.length >= 5 ? 1 : 0.4;
    if (i > 0 && /^[A-Z]/.test(w.word) && !/[.!?]\s*$/.test(textBefore(text, w.word))) score += 1.6;
    // "Over there" is what a hand most wants to show.
    if (DEICTIC.has(bare)) score += 3;
    if (COUNTING.has(bare)) score += 1.2;
    if (i === words.length - 1) score -= 0.6;
    return { w, i, score, bare };
  });
  const budget = Math.max(duration > 1.2 ? 1 : 0, Math.floor(duration / 2.3) + (duration > 3 ? 1 : 0));
  const picked: typeof scored = [];
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= budget || s.score < 1) break;
    if (s.w.start < 0.35 || s.w.start > duration - 0.25) continue;
    if (picked.some((p) => Math.abs(p.w.start - s.w.start) < 1.9)) continue;
    picked.push(s);
  }
  picked.sort((a, b) => a.w.start - b.w.start);
  const question = /\?\s*$/.test(text);
  const exclaim = /!/.test(text);
  let last: GestureKind | null = null;
  return picked.map((p, n) => {
    let kind: GestureKind;
    if (DEICTIC.has(p.bare) && kinds.includes('point')) kind = 'point';
    else if (COUNTING.has(p.bare) && kinds.includes('raise')) kind = 'raise';
    else if (question && n === picked.length - 1) kind = 'offer';
    else if (exclaim && n === 0) kind = kinds.includes('spread') ? 'spread' : 'offer';
    else kind = n % 2 === 0 ? 'beat' : 'offer';
    if (kind === last)
      kind = (['beat', 'offer', 'point'] as const).find((k) => k !== last && kinds.includes(k))!;
    last = kind;
    return { t: p.w.start + 0.04, kind };
  });
}

function textBefore(text: string, word: string): string {
  const at = text.indexOf(word);
  return at > 0 ? text.slice(0, at) : '';
}

/** Samples a gesture's keys at `t` (seconds from its stroke) into `out`, on a Catmull-Rom curve. */
export function sampleGesture(kind: Exclude<GestureKind, 'nod'>, t: number, out: ArmPose): ArmPose {
  const keys = GESTURES[kind].keys;
  const first = keys[0]![0];
  const last = keys[keys.length - 1]![0];
  const tc = Math.min(last, Math.max(first, t));
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]![0] <= tc) i++;
  const k0 = keys[Math.max(0, i - 1)]!;
  const k1 = keys[i]!;
  const k2 = keys[i + 1]!;
  const k3 = keys[Math.min(keys.length - 1, i + 2)]!;
  const u = (tc - k1[0]) / Math.max(1e-4, k2[0] - k1[0]);
  for (let c = 0; c < CHANNELS; c++) {
    const v = catmull(k0[c + 1]!, k1[c + 1]!, k2[c + 1]!, k3[c + 1]!, u);
    setChannel(out, c, v);
  }
  return out;
}

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

function setChannel(out: ArmPose, c: number, v: number): void {
  switch (c) {
    case 0:
      out.flex = v;
      break;
    case 1:
      out.abduct = v;
      break;
    case 2:
      out.elbow = v;
      break;
    case 3:
      out.twist = v;
      break;
    case 4:
      out.wrist = v;
      break;
    case 5:
      out.curl = v;
      break;
    case 6:
      out.index = v;
      break;
    default:
      out.thumb = v;
  }
}

export function zeroPose(out: ArmPose): ArmPose {
  out.flex = out.abduct = out.elbow = out.inward = 0;
  out.twist = out.wrist = out.curl = out.index = out.thumb = 0;
  return out;
}

export function newPose(): ArmPose {
  return { flex: 0, abduct: 0, elbow: 0, inward: 0, twist: 0, wrist: 0, curl: 0, index: 0, thumb: 0 };
}

function blendInto(out: ArmPose, from: ArmPose, w: number): void {
  out.flex += (from.flex - out.flex) * w;
  out.abduct += (from.abduct - out.abduct) * w;
  out.elbow += (from.elbow - out.elbow) * w;
  out.inward += (from.inward - out.inward) * w;
  out.twist += (from.twist - out.twist) * w;
  out.wrist += (from.wrist - out.wrist) * w;
  out.curl += (from.curl - out.curl) * w;
  out.index += (from.index - out.index) * w;
  out.thumb += (from.thumb - out.thumb) * w;
}

/** One frame of body language: each arm's offsets, the head nod and tilt, and a torso turn (yaw). */
export interface GestureFrame {
  readonly left: ArmPose;
  readonly right: ArmPose;
  /** Head-only nod, radians down. */
  nod: number;
  /** Head roll toward the gesturing hand, radians. */
  tilt: number;
  /** Shoulders turn into the gesture, radians (yaw only). */
  turn: number;
  /** Whether anything is moving this frame. */
  active: boolean;
}

interface Scheduled {
  at: number;
  kind: GestureKind;
  side: Side;
}

const MAX_SCHEDULE = 16;

/**
 * Schedules and plays a talker's gestures. A voiced line brings its own stroke times (`plan`);
 * otherwise, while talking, it lands a stroke every few seconds on its own. `random` is injectable.
 */
export class GesturePlanner {
  readonly frame: GestureFrame = {
    left: newPose(),
    right: newPose(),
    nod: 0,
    tilt: 0,
    turn: 0,
    active: false,
  };
  private readonly schedule: Scheduled[] = Array.from({ length: MAX_SCHEDULE }, () => ({
    at: 0,
    kind: 'beat' as GestureKind,
    side: 1 as Side,
  }));
  private count = 0;
  private clock = 0;
  private on = false;
  private planned = false;
  /** Between their own lines: hands still, small nods, a head tilt held to one side. */
  private listening = false;
  private listenTilt = 0;
  private tiltSide: Side = 1;
  private nextFree = 0;
  private last: GestureKind | null = null;
  private lastSide: Side = 1;
  private hip = 0;
  private readonly a = newPose();
  private readonly b = newPose();

  constructor(
    private readonly hand: GestureHand,
    private readonly canNod: boolean,
    private readonly style: GestureStyle = 'open',
    private readonly random: () => number = Math.random,
  ) {}

  get active(): boolean {
    return this.on;
  }

  /** The free hand (the one that gestures); the other holds a ledger or rests on the hip. */
  private get talkSide(): Side | null {
    return this.hand === 'left' ? 1 : this.hand === 'right' ? -1 : null;
  }

  start(): void {
    this.on = true;
    this.planned = false;
    this.count = 0;
    this.clock = 0;
    this.nextFree = 0.4 + this.random() * 0.5;
  }

  stop(): void {
    this.on = false;
    this.planned = false;
    this.listening = false;
    this.count = 0;
  }

  /** Listens between their own lines (someone else speaking, a quiz, a puzzle): no hand talk. */
  listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.planned = false;
    this.count = 0;
    this.clock = 0;
    this.nextFree = 1.2 + this.random() * 1.4;
    this.tiltSide = this.random() < 0.5 ? 1 : -1;
  }

  get isListening(): boolean {
    return this.on && this.listening;
  }

  /** Lands strokes on a voiced line's stressed words (null drops back to free timing). */
  plan(words: readonly SpokenWord[] | null, text = '', duration = 0): void {
    this.listening = false;
    this.count = 0;
    this.clock = 0;
    this.planned = !!words?.length;
    if (!words?.length) {
      this.nextFree = 0.4 + this.random() * 0.4;
      return;
    }
    for (const accent of planAccents(words, text, duration, this.style)) {
      this.push(accent.t, accent.kind);
    }
    // A short line with nothing stressed gets a small nod on its first content word instead.
    if (!this.count && this.canNod && words.length > 1) this.push(words[1]!.start, 'nod');
  }

  update(dt: number): GestureFrame {
    const f = this.frame;
    zeroPose(f.left);
    zeroPose(f.right);
    f.nod = 0;
    f.tilt = 0;
    f.turn = 0;
    const hipTarget = this.on && this.style === 'commander' && this.talkSide !== null ? 1 : 0;
    this.hip += (hipTarget - this.hip) * (1 - Math.exp(-dt * 4));
    if (this.hip > 0.002) this.blendHip(this.hip);
    if (!this.on) {
      f.active = this.hip > 0.002;
      return f;
    }
    this.clock += dt;
    // A listener's head cocks a little to one side and stays there, changing side now and then.
    this.listenTilt +=
      ((this.listening ? this.tiltSide * 0.06 : 0) - this.listenTilt) * (1 - Math.exp(-dt * 2));
    f.tilt = this.listenTilt;
    if (!this.planned && this.clock >= this.nextFree) {
      if (this.listening) {
        if (this.canNod) this.push(this.clock + 0.15, 'nod');
        this.nextFree = this.clock + 2.6 + this.random() * 2.8;
        if (this.random() < 0.3) this.tiltSide = -this.tiltSide as Side;
      } else {
        const kind = this.pickFree();
        this.push(this.clock + 0.5, kind);
        this.nextFree = this.clock + 2.4 + this.random() * 1.8;
      }
    }
    // Play the latest gesture whose window has opened, crossfading out of the one before it.
    let cur = -1;
    for (let i = 0; i < this.count; i++) {
      const s = this.schedule[i]!;
      if (this.clock >= s.at + this.spanStart(s.kind)) cur = i;
    }
    if (cur >= 0) {
      const s = this.schedule[cur]!;
      const t = this.clock - s.at;
      const end = this.spanEnd(s.kind);
      if (t <= end) {
        this.sampleInto(s, t, 1);
        if (cur > 0) {
          const p = this.schedule[cur - 1]!;
          const pt = this.clock - p.at;
          const fade = 1 - smoothstep(0, 0.32, t - this.spanStart(s.kind));
          if (fade > 0 && pt <= this.spanEnd(p.kind)) this.sampleInto(p, pt, fade);
        }
      }
    }
    f.active = true;
    return f;
  }

  private sampleInto(s: Scheduled, t: number, w: number): void {
    const f = this.frame;
    if (s.kind === 'nod') {
      const u = Math.min(1, Math.max(0, (t + 0.15) / 1.3));
      // Two small dips of the head only; a listener's "mm-hm" is one softer dip.
      const nod = this.listening
        ? 0.07 * Math.sin(u * Math.PI) ** 2
        : 0.13 * Math.sin(u * Math.PI) * (0.5 - 0.5 * Math.cos(u * Math.PI * 4));
      f.nod = f.nod * (1 - w) + nod * w;
      return;
    }
    const pose = sampleGesture(s.kind, t, this.a);
    const both = GESTURES[s.kind].bothHands;
    const main = s.side === 1 ? f.left : f.right;
    blendInto(main, pose, w);
    if (both) blendInto(s.side === 1 ? f.right : f.left, pose, w);
    // The head tips a touch toward the stroke and the shoulders turn into it (yaw only, no lean).
    const env = smoothstep(-0.3, 0, t) * (1 - smoothstep(0.6, 1.4, t));
    f.tilt += ((both ? 0 : s.side * 0.05 * env) - f.tilt) * w;
    f.turn += ((both ? 0 : s.side * 0.07 * env) - f.turn) * w;
  }

  private blendHip(w: number): void {
    const side = this.talkSide;
    if (side === null) return;
    const off = side === 1 ? this.frame.right : this.frame.left;
    Object.assign(this.b, HIP_FIST);
    blendInto(off, this.b, w);
  }

  private push(at: number, kind: GestureKind): void {
    if (this.count >= MAX_SCHEDULE) {
      // Drop the oldest; the schedule only ever looks a line ahead.
      const first = this.schedule.shift()!;
      this.schedule.push(first);
      this.count--;
    }
    const s = this.schedule[this.count++]!;
    s.at = at;
    s.kind =
      GESTURES[kind as Exclude<GestureKind, 'nod'>]?.bothHands && this.hand !== 'either' ? 'offer' : kind;
    s.side = this.pickSide();
    this.last = s.kind;
  }

  private pickFree(): GestureKind {
    const kinds = STYLE_KINDS[this.style];
    const options = kinds.filter(
      (k) => k !== this.last && (!GESTURES[k].bothHands || this.hand === 'either'),
    ) as GestureKind[];
    if (this.canNod && this.last !== 'nod') options.push('nod');
    return options[Math.floor(this.random() * options.length) % options.length]!;
  }

  private pickSide(): Side {
    const side = this.talkSide;
    if (side !== null) return side;
    // Mostly alternate, so an either-handed talker doesn't favour one arm.
    this.lastSide = this.random() < 0.7 ? (-this.lastSide as Side) : this.lastSide;
    return this.lastSide;
  }

  private spanStart(kind: GestureKind): number {
    return kind === 'nod' ? -0.15 : GESTURES[kind].keys[0]![0];
  }

  private spanEnd(kind: GestureKind): number {
    return kind === 'nod' ? 1.15 : GESTURES[kind].keys[GESTURES[kind].keys.length - 1]![0];
  }
}
