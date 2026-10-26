import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import { seededRandom, segmentDistance } from '../../util/math';
import { SplashPool } from '../battle/fx';
import type { HeightField, WaveSampler } from '../contracts';
import type { QuietSea } from '../life/quiet-sea';
import { leapPixels } from '../life/leaps/director';
import { world } from '../uniforms';
import { Kraken, poseFreeArm, type KrakenArm } from './kraken';
import { freeStance, type FreeStance } from './arm-paths';

/**
 * Distant kraken sightings: ambient sea life, like the leaping dolphins and flying fish. Now and
 * then (minutes apart, seeded) one to three tentacles break the surface far off, sway or curl for a
 * few seconds and sink back with a swirl; sometimes one tip, sometimes a group, rarely the slow arc
 * of the mantle's back. It shows the kraken is out there without a fight: it never comes near the
 * ship or into her path, and never touches her.
 *
 * The game decides where it may happen (`allowed`: not in a harbour or during a script, the opening
 * or the chart; `quiet`: not in a battle or a puzzle course) and where the sea is open (`water`).
 * Like a leap, a sighting needs a visible cause: one that would show under a few pixels is skipped.
 */

export type SightingKind = 'tip' | 'group' | 'arc';

export interface SightingPlan {
  kind: SightingKind;
  x: number;
  z: number;
  /** The way the group faces, or the arc travels (radians, like a ship's heading). */
  heading: number;
  /** Tentacles that show (0 for an arc: only the mantle's back). */
  arms: number;
  /** How long it shows (s), rise to gone. */
  duration: number;
  start: number;
  seed: number;
}

/** What the camera sees (a sighting must be in view and big enough). */
export interface SightingView {
  x: number;
  y: number;
  z: number;
  /** The camera's look along the sea (unit, xz). */
  forwardX: number;
  forwardZ: number;
  fovDeg: number;
  aspect: number;
  viewportHeight: number;
  zoom: number;
}

export interface SightingsGates {
  /** Open, deep water at (x, z) (no shore, reef or harbour near). Default: everywhere. */
  water?: (x: number, z: number) => boolean;
  /** Stretches of sea kept quiet (a battle, a puzzle course). */
  quiet?: QuietSea | null;
  /** The game's own gate: false in a harbour, during a script, the opening or the chart. */
  allowed?: () => boolean;
  /** The player's ship (her path is kept clear). */
  player?: { x: number; z: number; heading: number; speed: number } | null;
}

export interface SightingRules {
  minDistance: number;
  maxDistance: number;
  /** Seconds between sightings (a random gap between these). */
  minGap: number;
  maxGap: number;
  /** The first one comes this many seconds after the start, at least. */
  firstAfter: number;
  /** Below this size on screen (px) a sighting is skipped. */
  minPixels: number;
  /** No sighting this close (m) to the player's course over the next while. */
  pathClearance: number;
}

export const SIGHTING_RULES: SightingRules = {
  minDistance: 150,
  maxDistance: 400,
  minGap: 150,
  maxGap: 330,
  firstAfter: 90,
  minPixels: 8,
  pathClearance: 140,
};

/**
 * The biggest size (m) each kind shows above the water, which the pixel rule reads (as a leap reads
 * an animal's length): a tip's height, a group's spread, the mantle's length.
 */
export const SIGHTING_SPAN: Readonly<Record<SightingKind, number>> = { tip: 24, group: 32, arc: 22 };
/** How long each kind shows (s). */
const DURATION: Readonly<Record<SightingKind, number>> = { tip: 13, group: 15, arc: 15 };
/** How far off (m) a sighting's sound is placed, on its bearing. */
const SOUND_REACH = 160;
/** Seconds to wait after a moment with no place for one. */
const RETRY = 8;

/**
 * Plans sightings: when the next is due and where (pure: no scene, testable). A plan is in view,
 * 300–900 m off, on open water, clear of quiet zones and the player's course, and big enough on
 * screen. Lite plans a single tip.
 */
export class SightingsPlanner {
  nextAt: number;
  private rng: () => number;
  readonly rules: SightingRules;

  constructor(seed = 0x6b72_5eed, rules: Partial<SightingRules> = {}, now = 0) {
    this.rules = { ...SIGHTING_RULES, ...rules };
    this.rng = seededRandom(seed);
    this.nextAt = now + this.rules.firstAfter + this.rng() * (this.rules.maxGap - this.rules.minGap) * 0.5;
  }

  due(now: number): boolean {
    return now >= this.nextAt;
  }

  /** After a sighting ends: the next one a few minutes on. */
  scheduleAfter(now: number): void {
    this.nextAt = now + this.rules.minGap + this.rng() * (this.rules.maxGap - this.rules.minGap);
  }

  /**
   * A place for a sighting now, or null (and a retry a little later). `force` picks the kind and
   * distance (the dev page's key) but keeps every other rule.
   */
  plan(
    now: number,
    view: SightingView,
    gates: SightingsGates,
    lite: boolean,
    force: { kind?: SightingKind; distance?: number } | null = null,
  ): SightingPlan | null {
    const r = this.rules;
    if (!force && gates.allowed && !gates.allowed()) return this.retry(now);
    if (gates.quiet?.everywhere) return this.retry(now);
    const roll = this.rng();
    let kind: SightingKind = force?.kind ?? (roll < 0.1 ? 'arc' : roll < 0.45 ? 'group' : 'tip');
    if (lite) kind = 'tip';
    const halfFov =
      Math.atan(Math.tan((view.fovDeg * Math.PI) / 360) * view.aspect) / Math.max(1e-3, view.zoom);
    const p = gates.player;
    for (let attempt = 0; attempt < 40; attempt++) {
      const d = force?.distance ?? r.minDistance + this.rng() * (r.maxDistance - r.minDistance);
      // Well inside the frame, so it's seen whole.
      const off = (this.rng() - 0.5) * 2 * halfFov * 0.6;
      const c = Math.cos(off);
      const s = Math.sin(off);
      const dx = view.forwardX * c - view.forwardZ * s;
      const dz = view.forwardX * s + view.forwardZ * c;
      const x = view.x + dx * d;
      const z = view.z + dz * d;
      if (gates.water && !gates.water(x, z)) continue;
      if (gates.quiet?.blocks(x, z, 80)) continue;
      if (p) {
        if (Math.hypot(x - p.x, z - p.z) < r.minDistance) continue;
        // Her course for the next minute and a half (and a little ahead even when she's still).
        const ahead = Math.max(250, p.speed * 90);
        const ex = p.x + Math.sin(p.heading) * ahead;
        const ez = p.z + Math.cos(p.heading) * ahead;
        if (segmentDistance(x, z, p.x, p.z, ex, ez) < r.pathClearance) continue;
      }
      const dist = Math.hypot(x - view.x, z - view.z, view.y);
      if (sightingPixels(kind, dist, view) < r.minPixels) continue;
      const arms = kind === 'tip' ? 1 : kind === 'arc' ? 0 : 2 + Math.floor(this.rng() * 2);
      return {
        kind,
        x,
        z,
        heading: this.rng() * Math.PI * 2,
        arms,
        duration: DURATION[kind],
        start: now,
        seed: Math.floor(this.rng() * 0xffffffff) >>> 0,
      };
    }
    return this.retry(now);
  }

  private retry(now: number): null {
    this.nextAt = Math.max(this.nextAt, now + RETRY);
    return null;
  }
}

/** How big (px) a sighting of `kind` looks from `dist` m. */
export function sightingPixels(kind: SightingKind, dist: number, view: SightingView): number {
  return leapPixels(SIGHTING_SPAN[kind], dist, view.fovDeg, view.viewportHeight, view.zoom);
}

/**
 * Open, deep water for a sighting: deep at (x, z) and no land within `shore` m (samples on rings).
 * For an island's `water` gate.
 */
export function deepWaterAt(field: HeightField, x: number, z: number, shore = 140): boolean {
  if (field.heightAt(x, z) > -8) return false;
  for (let r = 20; r <= shore; r += 20)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (field.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > -1) return false;
    }
  return true;
}

export interface KrakenSightingsOptions {
  tier: TierSettings;
  waves: WaveSampler;
  gates?: SightingsGates;
  seed?: number;
  rules?: Partial<SightingRules>;
  /** Faint, far sounds: `rise` as it breaks the water, `sink` as it goes under. */
  onSound?: (kind: 'rise' | 'sink', pos: { x: number; y: number; z: number }, gain: number) => void;
  base?: string;
}

const _p = new Vector3();
const _fwd = new Vector3();
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** Where each arm of a group stands (m, the group's frame) and how high its tip stands (m over the sea). */
const SPOTS = [
  [0, 0, 24],
  [-17, 11, 16],
  [14, -12, 19],
] as const;
/** The sighting arms' scales (by socket), before the sighting kraken's own scale. */
const SIGHTING_ARM_SCALES: readonly number[] = [1.8, 1.7, 1.15, 1.05, 1.2, 1.0, 1.25, 1.8];
/** A single tip's height (m over the sea). */
const TIP_HEIGHT = 26;
/** A free arm bends, so it needs more of itself over the water than its tip's height. */
const BENT = 1.3;

/**
 * The sightings in the scene: one small kraken (Lite: one arm; else three and the body for an arc)
 * on the battle kraken's tentacle and material (no new shader), at most one sighting at a time.
 * Hidden between sightings; `stageWarm` shows every part for the warm-up.
 */
export class KrakenSightings {
  readonly group = new Group();
  readonly planner: SightingsPlanner;
  readonly splashes: SplashPool;
  gates: SightingsGates;
  /** The sighting showing now, or null. */
  current: SightingPlan | null = null;
  readonly kraken: Kraken;
  private readonly waves: WaveSampler;
  private readonly lite: boolean;
  private readonly onSound: KrakenSightingsOptions['onSound'];
  private readonly view: SightingView = {
    x: 0,
    y: 0,
    z: 0,
    forwardX: 0,
    forwardZ: -1,
    fovDeg: 50,
    aspect: 16 / 9,
    viewportHeight: 720,
    zoom: 1,
  };
  private readonly sound = { x: 0, y: 0, z: 0 };
  private rand = seededRandom(1);
  /** Each arm's state for the sighting: 0 under, 1 rising, 2 up, 3 going down. */
  private readonly risen: Uint8Array;
  private gentle = false;
  /** Each arm's free pose (always bent: up tip first, curled; down curling, in an arc). */
  private readonly stances: FreeStance[] = [];
  /** Which way each arm leans (radians); it turns as the arm goes down (a swirl). */
  private readonly lean: Float32Array;
  private t = 0;
  /** An arc's spray: 0 not yet, 1 up, 2 under again. */
  private arcCue = 0;
  /** The sighting ends early (its gate closed): seconds into it when it started going down. */
  private leaveAt = Infinity;
  private pending: { kind?: SightingKind; distance?: number } | null = null;

  private constructor(o: KrakenSightingsOptions, kraken: Kraken) {
    this.kraken = kraken;
    this.waves = o.waves;
    this.lite = o.tier.tier === 'lite';
    this.onSound = o.onSound;
    this.gates = o.gates ?? {};
    this.planner = new SightingsPlanner(o.seed, o.rules);
    this.group.name = 'kraken sightings';
    // Bigger than the battle's kraken (about twice): it reads clearly at 150–400 m, from the deck.
    kraken.group.scale.setScalar(2.2);
    kraken.measure();
    kraken.group.visible = false;
    this.group.add(kraken.group);
    this.splashes = new SplashPool(this.lite ? 10 : 20);
    this.group.add(this.splashes.mesh);
    this.risen = new Uint8Array(kraken.arms.length);
    this.lean = new Float32Array(kraken.arms.length);
    for (let k = 0; k < kraken.arms.length; k++) this.stances.push({ len: 0, curl: 0, bow: 0 });
    kraken.onPose = (arm, k) => this.poseArm(arm, k);
    this.reset();
  }

  static async create(o: KrakenSightingsOptions): Promise<KrakenSightings> {
    const sockets = o.tier.tier === 'lite' ? [0] : [0, 3, 6];
    const kraken = await Kraken.load({
      tier: o.tier.tier,
      base: o.base,
      sockets,
      scales: SIGHTING_ARM_SCALES,
      clipSpeed: 0.45,
    });
    return new KrakenSightings(o, kraken);
  }

  /** Ends any sighting at once (nothing shows). */
  clear(): void {
    this.reset();
    this.pending = null;
    this.splashes.clear();
  }

  private reset(): void {
    this.current = null;
    this.leaveAt = Infinity;
    this.kraken.group.visible = false;
    this.kraken.body.drawn.visible = false;
    for (let k = 0; k < this.kraken.arms.length; k++) {
      const arm = this.kraken.arms[k]!;
      arm.sink = arm.length + 4;
      arm.root.rotation.set(0, 0, 0);
      this.risen[k] = 0;
      this.stances[k]!.len = 0;
    }
  }

  /** A sighting as soon as one fits the rules (the dev page's key). */
  force(kind?: SightingKind, distance?: number): void {
    this.pending = { kind, distance };
  }

  /** For the warm-up: every part shown; returns the undo. */
  stageWarm(): () => void {
    const k = this.kraken;
    const was = k.group.visible;
    const body = k.body.drawn.visible;
    const sc = this.splashes.mesh.count;
    k.group.visible = true;
    k.body.drawn.visible = true;
    const arms = k.arms.map((a) => a.root.visible);
    for (const a of k.arms) a.root.visible = true;
    this.splashes.mesh.count = Math.max(1, sc);
    return () => {
      k.group.visible = was;
      k.body.drawn.visible = body;
      k.arms.forEach((a, i) => (a.root.visible = arms[i]!));
      this.splashes.mesh.count = sc;
    };
  }

  update(dt: number, t: number, camera: PerspectiveCamera, viewportHeight: number): void {
    if (!this.current) {
      if (dt > 0 && (this.pending || this.planner.due(t))) this.tryStart(t, camera, viewportHeight);
    } else this.animate(dt, t, camera);
    this.splashes.sync(t);
  }

  private tryStart(t: number, camera: PerspectiveCamera, viewportHeight: number): void {
    const v = this.view;
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    v.x = camera.position.x;
    v.y = camera.position.y;
    v.z = camera.position.z;
    v.forwardX = _fwd.x;
    v.forwardZ = _fwd.z;
    v.fovDeg = camera.fov;
    v.aspect = camera.aspect;
    v.zoom = camera.zoom;
    v.viewportHeight = viewportHeight;
    const plan = this.planner.plan(t, v, this.gates, this.lite, this.pending);
    this.pending = null;
    if (!plan) return;
    this.start(plan);
  }

  private start(plan: SightingPlan): void {
    this.reset();
    this.current = plan;
    this.arcCue = 0;
    this.rand = seededRandom(plan.seed);
    this.gentle = world.reducedMotion.value > 0.5;
    const k = this.kraken;
    k.group.visible = true;
    k.group.position.set(plan.x, 0, plan.z);
    k.group.rotation.set(0, plan.heading, 0);
    // The arms hang off the body's root: it stays put unless the mantle itself shows (an arc, armless).
    k.body.drawn.visible = plan.kind === 'arc';
    k.body.root.position.set(0, plan.kind === 'arc' ? -30 : 0, 0);
    k.body.root.rotation.set(0, 0, 0);
    const scale = k.group.scale.y;
    for (let i = 0; i < k.arms.length; i++) {
      const arm = k.arms[i]!;
      const spot = SPOTS[i] ?? SPOTS[0];
      // A group spreads its arms round the spot.
      arm.socket.set(spot[0] / scale, -2, spot[1] / scale);
      arm.root.rotation.set(0.1 * (this.rand() - 0.5), this.rand() * Math.PI * 2, 0.1 * (this.rand() - 0.5));
      this.lean[i] = this.rand() * Math.PI * 2;
      k.play(i, 'Tentacle_Idle', 0, 0.4 + this.rand() * 0.15, true);
    }
  }

  /** How far up arm `i` is at `u` s into the sighting (0 under, 1 fully up). */
  private shown(i: number, u: number, plan: SightingPlan): number {
    return this.risenAt(i, u, plan) * (1 - this.goneAt(i, u, plan));
  }

  private risenAt(i: number, u: number, plan: SightingPlan): number {
    if (i >= plan.arms) return 0;
    // Slow, as a creature this size moves: a long rise, a long slide back under.
    return smooth((u - i * 1.1) / (this.gentle ? 5 : 4));
  }

  private goneAt(i: number, u: number, plan: SightingPlan): number {
    if (i >= plan.arms) return 1;
    const fall = this.gentle ? 5 : 4.5;
    const end = Math.min(plan.duration, this.leaveAt) - 0.3 * (plan.arms - 1 - i);
    return smooth((u - (end - fall)) / fall);
  }

  /** How much of arm `i` stands over the water (m along it). */
  private heightOf(i: number, plan: SightingPlan): number {
    return (plan.kind === 'tip' ? TIP_HEIGHT : (SPOTS[i] ?? SPOTS[0])[2]) * BENT;
  }

  /** Arm `k` each frame: a free arm (always bent) where it breaks the water, leaning its way. */
  private poseArm(arm: KrakenArm, k: number): void {
    const st = this.stances[k]!;
    if (st.len <= 0.05) return;
    arm.root.getWorldPosition(_p);
    const lx = Math.sin(this.lean[k]!);
    const lz = Math.cos(this.lean[k]!);
    const ex = _p.x + lx * 3;
    const ez = _p.z + lz * 3;
    const phase = (this.t / (this.gentle ? 9 : 7)) * Math.PI * 2 + k * 2.1;
    poseFreeArm(arm, ex, ez, this.waves.heightAt(ex, ez, this.t), st, phase, this.gentle ? 0.5 : 0.9, lx, lz);
  }

  private animate(dt: number, t: number, camera: PerspectiveCamera): void {
    const plan = this.current!;
    const u = t - plan.start;
    const k = this.kraken;
    // A gate that closes mid-sighting (a battle, a harbour) sends it down at once.
    if (this.leaveAt === Infinity && this.gates.allowed && !this.gates.allowed()) this.leaveAt = u + 2.6;
    if (this.gates.quiet?.everywhere && this.leaveAt === Infinity) this.leaveAt = u + 2.6;
    for (let i = 0; i < k.arms.length; i++) {
      const arm = k.arms[i]!;
      const share = this.shown(i, u, plan);
      const st = freeStance(
        this.stances[i]!,
        this.heightOf(i, plan),
        this.risenAt(i, u, plan),
        this.goneAt(i, u, plan),
      );
      // Tall and far: a gentler J and hook than the battle's arms (at this length theirs would arch
      // back into the sea). A lone tip hooks a little more; a group's others lean.
      st.curl += plan.kind === 'tip' ? -0.1 : -0.25;
      st.bow += i > 0 ? -0.15 : -0.3;
      arm.sink = share > 0.001 ? arm.length * 0.3 : arm.length + 4;
      const state = this.risen[i]!;
      if (state === 0 && share > 0.02) {
        this.risen[i] = 1;
        this.ring(arm.root, t, 1);
        if (i === 0) this.emit('rise', 0.5);
      } else if (state === 1 && u > i * 1.1 + 5) {
        this.risen[i] = 2;
        // Up: a curl or a slow sway.
        if (plan.kind === 'group' && i > 0) k.play(i, 'Tentacle_Poke', 1.6, 0.3);
        else if (plan.kind === 'tip') k.play(i, 'Tentacle_Attack2', 1.8, 0.28);
      } else if (state === 2 && u > Math.min(plan.duration, this.leaveAt) - 4.5 - 0.3 * (plan.arms - 1 - i)) {
        this.risen[i] = 3;
        k.play(i, 'Tentacle_Idle', 1.5, 0.45);
        this.ring(arm.root, t, 0.8);
        if (i === 0) this.emit('sink', 0.35);
      }
      // Going down, it turns: a swirl as it slides under.
      if (state === 3) this.lean[i] = this.lean[i]! + dt * 0.7;
    }
    if (plan.kind === 'arc') {
      // The mantle's back rolls up out of the sea and under again, travelling mantle first as a squid swims.
      const a = smooth(u / plan.duration);
      const body = k.body.root;
      body.rotation.set(1.2, 0, 0.12 * Math.sin(u * 0.6));
      body.position.set(0, -12 + 8.1 * Math.sin(Math.PI * Math.min(1, u / plan.duration)), -6 + 12 * a);
      // Spray where the back breaks the water, and again as it goes under.
      if (this.arcCue === 0 && u > plan.duration * 0.22) {
        this.arcCue = 1;
        this.ring(body, t, 1.2);
        this.emit('rise', 0.5);
      } else if (this.arcCue === 1 && u > plan.duration * 0.8) {
        this.arcCue = 2;
        this.ring(body, t, 1);
        this.emit('sink', 0.35);
      }
    }
    k.place();
    this.t = t;
    k.update(dt, t, camera, null, 0);
    if (u > plan.duration + 0.5) {
      this.reset();
      this.planner.scheduleAfter(t);
    }
  }

  /** Spray round the arm where it meets the sea: a low ring (gentle: smaller, fewer, no plume). */
  private ring(root: Group, t: number, scale: number): void {
    root.getWorldPosition(_p);
    const n = this.gentle ? 3 : this.lite ? 4 : 6;
    const r = 3.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = _p.x + Math.cos(a) * r;
      const z = _p.z + Math.sin(a) * r;
      const big = !this.gentle && i === 0;
      this.splashes.spawn(
        x,
        this.waves.heightAt(x, z, t),
        z,
        t,
        (this.gentle ? 1.6 : 2.6) * scale,
        big ? 1 : 0,
        this.rand(),
      );
    }
  }

  private emit(kind: 'rise' | 'sink', gain: number): void {
    // Heard along its bearing but no farther than SOUND_REACH: at its true range the sound's
    // fall-off leaves nothing, and this keeps it faint, far and in the right direction.
    const g = this.kraken.group.position;
    const dx = g.x - this.view.x;
    const dz = g.z - this.view.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1, SOUND_REACH / d);
    this.sound.x = this.view.x + dx * k;
    this.sound.y = 0;
    this.sound.z = this.view.z + dz * k;
    this.onSound?.(kind, this.sound, gain * (this.gentle ? 0.6 : 1));
  }

  dispose(): void {
    this.kraken.dispose();
    this.splashes.mesh.geometry.dispose();
  }
}
