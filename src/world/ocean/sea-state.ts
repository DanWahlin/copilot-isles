/**
 * The sea state (PLAN §6 Water system, Settings → Sea state): one model for the waves, the wind, the
 * foam and the sailing. Each state scales the one Gerstner table in waves.ts (amplitude and steepness
 * per component, longest first), sets the wind (mean speed and gusts), the whitecaps, spindrift, bow
 * spray and coast surf, the cloud drift, the wind and surf beds, and how the ship handles. Breeze is
 * today's sea: every factor is 1 (or the old constant) and every new term 0, so the sea and the ship
 * are byte for byte what they were (breeze-fingerprint.test.ts).
 *
 * The CPU reads `seaState.live` (the wave field, the wind, the ship), and the GPU reads the same
 * numbers through uniforms (sea-uniforms.ts), so a change needs no new shader. A change eases over
 * `SEA_EASE_S`; sea battles, the Three Helms' course and the title hold the fixed sea (`hold`).
 * Pure TS: no three.js here, so physics and tests use it as is.
 */

export type SeaStateId = 'calm' | 'breeze' | 'fresh' | 'gale';

export const SEA_STATE_IDS: readonly SeaStateId[] = ['calm', 'breeze', 'fresh', 'gale'];

/** The default, and the fixed sea that battles and puzzle courses keep (today's). */
export const DEFAULT_SEA_STATE: SeaStateId = 'breeze';

/** The number of Gerstner components (waves.ts `ALL_WAVES`). */
export const SEA_WAVES = 6;

/** Seconds a change of sea state takes to ease in (the sea builds or lies down; never a jump). */
export const SEA_EASE_S = 5;

export interface SeaParams {
  /** Per Gerstner component, longest first: × the table's amplitude. */
  amp: number[];
  /** Per component: × the table's steepness Q (sharper crests). */
  steep: number[];
  /** Mean wind speed (m/s): sailing, flags and the beds. */
  windSpeed: number;
  /** Gust strength (the gust factor is 1 ± this; wind.ts `GUST`). */
  gust: number;
  /** Wind the eye sees (m/s): grass, palms and sails sway with it, ripples drift with it. */
  swayWind: number;
  /** Whitecaps start this far up the crest (height over the summed amplitude); lower is more foam. */
  capFrom: number;
  /** Whitecap strength from the wind (the old `smoothstep(4, 11, wind) × 0.7 + 0.3`). */
  capWind: number;
  /** Wind-blown streaks of foam along the wind, 0-1. */
  spindrift: number;
  /** Bow spray when she drives into a sea, 0-1. */
  spray: number;
  /** × the coast surf ribbon's foam. */
  surf: number;
  /** × the volumetric clouds' drift. */
  cloudDrift: number;
  /** × the wind bed, and the surf bed. */
  windBed: number;
  surfBed: number;
  /** × the heel the sails put on her. */
  heel: number;
  /** × how far the seas pitch her (a short sea under a long hull pitches her harder than its slope). */
  pitch: number;
  /** × her target speed (light airs set less sail's worth; a gale's reefed). */
  sailing: number;
  /** Leeway: sideways push per m/s of wind on her beam (m/s²). */
  leeway: number;
  /** × how quickly she answers the helm. */
  helm: number;
  /** The sea slewing her bow: rad/s per m/s of the swell's orbital velocity across her. */
  yaw: number;
}

export interface SeaState {
  id: SeaStateId;
  name: string;
  /** One line for Settings. */
  blurb: string;
  params: SeaParams;
}

/** The old whitecap wind factor, so Breeze's foam is today's. */
export function capWindFor(windSpeed: number): number {
  const k = Math.min(1, Math.max(0, (windSpeed - 4) / 7));
  return k * k * (3 - 2 * k) * 0.7 + 0.3;
}

const params = (p: Omit<SeaParams, 'capWind' | 'swayWind'>): SeaParams => ({
  ...p,
  swayWind: p.windSpeed,
  capWind: capWindFor(p.windSpeed),
});

export const SEA_STATES: Readonly<Record<SeaStateId, SeaState>> = {
  calm: {
    id: 'calm',
    name: 'Calm',
    blurb: 'Glassy water and a gentle swell. Light airs, so she sails slowly.',
    params: params({
      amp: [0.42, 0.3, 0.2, 0.14, 0.1, 0.08],
      steep: [0.7, 0.65, 0.6, 0.6, 0.6, 0.6],
      windSpeed: 2.6,
      gust: 0.3,
      capFrom: 3,
      spindrift: 0,
      spray: 0,
      surf: 0.45,
      cloudDrift: 0.45,
      windBed: 0.35,
      surfBed: 0.55,
      heel: 1,
      pitch: 1,
      sailing: 0.66,
      leeway: 0,
      helm: 1,
      yaw: 0,
    }),
  },
  breeze: {
    id: 'breeze',
    name: 'Breeze',
    blurb: 'A steady sailing breeze and a lively swell. The way the islands were made to look.',
    params: params({
      amp: [1, 1, 1, 1, 1, 1],
      steep: [1, 1, 1, 1, 1, 1],
      windSpeed: 6.5,
      gust: 0.45,
      capFrom: 0.62,
      spindrift: 0,
      spray: 0,
      surf: 1,
      cloudDrift: 1,
      windBed: 1,
      surfBed: 1,
      heel: 1,
      pitch: 1,
      sailing: 1,
      leeway: 0,
      helm: 1,
      yaw: 0,
    }),
  },
  fresh: {
    id: 'fresh',
    name: 'Fresh',
    blurb: 'Whitecaps on every wave and a stiff wind. She heels and runs faster.',
    params: params({
      amp: [1.6, 1.6, 1.55, 1.5, 1.4, 1.3],
      steep: [1.15, 1.15, 1.15, 1.12, 1.1, 1.1],
      windSpeed: 9.5,
      gust: 0.5,
      capFrom: 0.42,
      spindrift: 0.3,
      spray: 0.45,
      surf: 1.35,
      cloudDrift: 1.7,
      windBed: 1.5,
      surfBed: 1.35,
      heel: 1.1,
      pitch: 1.4,
      sailing: 1.1,
      leeway: 0.025,
      helm: 0.92,
      yaw: 0.04,
    }),
  },
  gale: {
    id: 'gale',
    name: 'Gale',
    blurb: 'Big seas, heavy whitecaps and flying spray. She pitches and heels hard, but she’s safe.',
    params: params({
      amp: [3, 2.6, 2.3, 2.1, 1.8, 1.6],
      steep: [1.45, 1.45, 1.4, 1.35, 1.3, 1.25],
      windSpeed: 17,
      gust: 0.55,
      capFrom: 0.2,
      spindrift: 0.85,
      spray: 1,
      surf: 1.9,
      cloudDrift: 3,
      windBed: 2.3,
      surfBed: 1.9,
      heel: 1.25,
      pitch: 2.3,
      sailing: 1.2,
      leeway: 0.06,
      helm: 0.8,
      yaw: 0.08,
    }),
  },
};

export function isSeaStateId(v: unknown): v is SeaStateId {
  return typeof v === 'string' && (SEA_STATE_IDS as readonly string[]).includes(v);
}

export function cloneSeaParams(p: SeaParams): SeaParams {
  return { ...p, amp: p.amp.slice(), steep: p.steep.slice() };
}

/** Copies `src` into `out` exactly (no arithmetic, so Breeze stays byte-identical). */
export function copySeaParams(src: SeaParams, out: SeaParams): SeaParams {
  for (let i = 0; i < SEA_WAVES; i++) {
    out.amp[i] = src.amp[i]!;
    out.steep[i] = src.steep[i]!;
  }
  out.windSpeed = src.windSpeed;
  out.gust = src.gust;
  out.swayWind = src.swayWind;
  out.capFrom = src.capFrom;
  out.capWind = src.capWind;
  out.spindrift = src.spindrift;
  out.spray = src.spray;
  out.surf = src.surf;
  out.cloudDrift = src.cloudDrift;
  out.windBed = src.windBed;
  out.surfBed = src.surfBed;
  out.heel = src.heel;
  out.pitch = src.pitch;
  out.sailing = src.sailing;
  out.leeway = src.leeway;
  out.helm = src.helm;
  out.yaw = src.yaw;
  return out;
}

/** Eased weight (smootherstep): no step in the sea's speed of change at either end. */
export function seaEase(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** `out` = `a` → `b` at eased weight `k` (0-1); at 1 it's `b` exactly. */
export function blendSeaParams(a: SeaParams, b: SeaParams, k: number, out: SeaParams): SeaParams {
  if (k >= 1) return copySeaParams(b, out);
  const w = seaEase(k);
  const l = (x: number, y: number) => x + (y - x) * w;
  for (let i = 0; i < SEA_WAVES; i++) {
    out.amp[i] = l(a.amp[i]!, b.amp[i]!);
    out.steep[i] = l(a.steep[i]!, b.steep[i]!);
  }
  out.windSpeed = l(a.windSpeed, b.windSpeed);
  out.gust = l(a.gust, b.gust);
  out.swayWind = l(a.swayWind, b.swayWind);
  out.capFrom = l(a.capFrom, b.capFrom);
  out.capWind = l(a.capWind, b.capWind);
  out.spindrift = l(a.spindrift, b.spindrift);
  out.spray = l(a.spray, b.spray);
  out.surf = l(a.surf, b.surf);
  out.cloudDrift = l(a.cloudDrift, b.cloudDrift);
  out.windBed = l(a.windBed, b.windBed);
  out.surfBed = l(a.surfBed, b.surfBed);
  out.heel = l(a.heel, b.heel);
  out.pitch = l(a.pitch, b.pitch);
  out.sailing = l(a.sailing, b.sailing);
  out.leeway = l(a.leeway, b.leeway);
  out.helm = l(a.helm, b.helm);
  out.yaw = l(a.yaw, b.yaw);
  return out;
}

/**
 * Reduced motion (PLAN §9) caps what moves on screen at Breeze's size, the sea the game was tuned
 * and checked for: the waves' height and steepness, the gusts, the sway wind, the sails' heel, her
 * pitch, the sea slewing her bow and the bow spray's flashes. What doesn't move the view stays the
 * state's own: its whitecaps, spindrift, surf, sounds, and how fast she sails. So a Gale under reduced motion reads (and sounds)
 * like a gale, but the horizon and the deck move no more than in a Breeze, and Calm stays calm.
 */
export function capSeaMotion(p: SeaParams, out: SeaParams): SeaParams {
  const cap = SEA_STATES.breeze.params;
  copySeaParams(p, out);
  for (let i = 0; i < SEA_WAVES; i++) {
    out.amp[i] = Math.min(p.amp[i]!, cap.amp[i]!);
    out.steep[i] = Math.min(p.steep[i]!, cap.steep[i]!);
  }
  out.gust = Math.min(p.gust, cap.gust);
  out.swayWind = Math.min(p.swayWind, cap.swayWind);
  out.heel = Math.min(p.heel, cap.heel);
  out.pitch = Math.min(p.pitch, cap.pitch);
  out.yaw = Math.min(p.yaw, cap.yaw);
  out.spray = Math.min(p.spray, cap.spray);
  return out;
}

/** A source that holds the sea at its fixed state while it returns true. */
export type SeaHold = () => boolean;

/**
 * The live sea: the player's setting (or the fixed sea while something holds it), eased over
 * `SEA_EASE_S`. `update` runs once a frame on the world's clock before anything samples the sea;
 * it allocates nothing.
 */
export class SeaStateDriver {
  /** What the sea is now: read by the wave field, the wind, the ship, the uniforms and the beds. */
  readonly live: SeaParams = cloneSeaParams(SEA_STATES[DEFAULT_SEA_STATE].params);
  /** Bumped whenever `live` changes, so readers can skip copying when it hasn't. */
  version = 0;
  private setting: SeaStateId = DEFAULT_SEA_STATE;
  private reduced = false;
  private readonly holds = new Set<SeaHold>();
  private readonly from = cloneSeaParams(this.live);
  private readonly to = cloneSeaParams(this.live);
  /** Ease progress, 0-1 (1: settled at `to`). */
  private k = 1;
  /** The target `to` was made for: -1 the fixed sea, else the setting's index × 2 + reduced. */
  private code = SEA_STATE_IDS.indexOf(DEFAULT_SEA_STATE) * 2;
  private lastT = Number.NaN;
  private heldNow = false;

  /** The player's choice (Settings). */
  get chosen(): SeaStateId {
    return this.setting;
  }

  /** True while a battle, a puzzle course or the title holds the fixed sea. */
  get fixed(): boolean {
    return this.heldNow;
  }

  /** True once the live sea has reached its target. */
  get settled(): boolean {
    return this.k >= 1;
  }

  setSetting(id: SeaStateId): void {
    this.setting = isSeaStateId(id) ? id : DEFAULT_SEA_STATE;
  }

  setReducedMotion(on: boolean): void {
    this.reduced = on;
  }

  /** Holds the fixed sea while `when()` is true, until the returned function is called. */
  hold(when: SeaHold): () => void {
    this.holds.add(when);
    return () => {
      this.holds.delete(when);
    };
  }

  /** Advances the ease to world time `t` (s). Safe to call more than once a frame. */
  update(t: number): void {
    const dt = Number.isFinite(this.lastT) ? Math.min(0.25, Math.max(0, t - this.lastT)) : 0;
    this.lastT = t;
    this.retarget(false);
    if (this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / SEA_EASE_S);
    blendSeaParams(this.from, this.to, this.k, this.live);
    this.version++;
  }

  /** Jumps to the target at once (behind a veil: a new voyage, the title, a battle's start). */
  snap(): void {
    this.retarget(true);
    if (this.k >= 1) return;
    this.k = 1;
    copySeaParams(this.to, this.live);
    this.version++;
  }

  private retarget(force: boolean): void {
    let held = false;
    for (const h of this.holds) if (h()) held = true;
    this.heldNow = held;
    const code = held ? -1 : SEA_STATE_IDS.indexOf(this.setting) * 2 + (this.reduced ? 1 : 0);
    if (code === this.code && !force) return;
    if (code === this.code && this.k >= 1) return;
    if (code !== this.code) {
      this.code = code;
      copySeaParams(this.live, this.from);
      const target = SEA_STATES[held ? DEFAULT_SEA_STATE : this.setting].params;
      if (this.reduced && !held) capSeaMotion(target, this.to);
      else copySeaParams(target, this.to);
      this.k = 0;
    }
  }
}

/** The game's one live sea. */
export const seaState = new SeaStateDriver();
