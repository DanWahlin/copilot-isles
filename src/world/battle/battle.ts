import { Group, Matrix4, Vector3 } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField, WaveSampler } from '../contracts';
import { createBrigantine, type Brigantine, type BrigantineEnv } from '../ship';
import { world } from '../uniforms';
import { windAt } from '../wind';
import { ARC_FIRING, ARC_WARNING, ArcSet } from './arcs';
import { elevationFor, insideHull, leadPoint, MUZZLE_SPEED, muzzleLocal } from './ballistics';
import { FogBank } from './fog';
import {
  BallPool,
  BoatPool,
  fxBudget,
  SmokePool,
  SplashPool,
  SplinterPool,
  STORE_POWDER,
  TRAIL_EVERY,
  STORE_TIMBER,
  STORE_WRECKAGE,
  StorePool,
} from './fx';
import { Battery, bearing, gunStations, MAX_RANGE, PORT, STARBOARD, type Side } from './gunnery';
import { RaiderBrain, emptyRaiderView, type RaiderHelm } from './raider-ai';
import { clamp01, seededRandom } from '../../util/math';
import { COURSE, onCourseSelected, type CourseMeta } from '../../course/catalog';

/** A raider in a wave: its name board and its size (docs/specs/BATTLES.md §4.1). */
export interface RaiderSpec {
  name: string;
  kind: 'cutter' | 'brigantine';
}

export interface WaveSpec {
  raiders: readonly RaiderSpec[];
  /**
   * The bosun's question after this wave: a ChoiceQuiz id from src/learn, about the one habit this
   * wave stands for (.plans/battle-plan.md "Teaching map"). The battle only carries the id.
   */
  quiz: string;
}

/** A battle: where it's fought, its waves, and the line on the win card. */
export interface BattlePlan {
  id: string;
  /** The course chapter it recaps. */
  chapter: '00' | '01';
  title: string;
  waves: readonly WaveSpec[];
  /** The win card's line (player copy). */
  won: string;
}

/**
 * A battle plan: the game's part (where it's fought, its raiders' sizes) with the course's (each
 * raider's name, the question after each wave, the win line, the chapter: `course.json` →
 * `hooks.battles.<id>`).
 */
function plan(
  c: CourseMeta,
  id: string,
  title: string,
  kinds: readonly (readonly RaiderSpec['kind'][])[],
): BattlePlan {
  // A course without this battle (it doesn't use the passage's islands) gets an empty plan: the
  // passage's destination isn't open in that course, so the battle never starts.
  const h = c.hooks.battles[id] ?? { chapter: '', won: '', waves: [] };
  return {
    id,
    chapter: h.chapter as BattlePlan['chapter'],
    title,
    waves: kinds.map((wave, w) => ({
      raiders: wave.map((kind, r) => ({ name: h.waves[w]?.raiders[r] ?? '', kind })),
      quiz: h.waves[w]?.quiz ?? '',
    })),
    won: h.won,
  };
}

/**
 * Battle 1, the passage from Anchorage to Port Meridian: two waves, each with the course's quiz (its
 * `hooks.battles`).
 */
const passage = (c: CourseMeta) =>
  plan(c, 'passage-anchorage-meridian', 'Anchorage → Port Meridian', [
    ['cutter', 'cutter'],
    ['brigantine', 'cutter'],
  ]);
export let PASSAGE_BATTLE: BattlePlan = passage(COURSE);

/**
 * Battle 2, the passage from Port Meridian to Thousand-Bough Isle: three waves, each with the course's
 * quiz (its `hooks.battles`).
 */
const meridianPassage = (c: CourseMeta) =>
  plan(c, 'passage-meridian-thousand-bough', 'Port Meridian → Thousand-Bough Isle', [
    ['cutter', 'cutter'],
    ['brigantine', 'cutter'],
    ['brigantine', 'cutter'],
  ]);
export let MERIDIAN_BATTLE: BattlePlan = meridianPassage(COURSE);

export let BATTLE_PLANS: readonly BattlePlan[] = [PASSAGE_BATTLE, MERIDIAN_BATTLE];
onCourseSelected((c) => {
  PASSAGE_BATTLE = passage(c);
  MERIDIAN_BATTLE = meridianPassage(c);
  BATTLE_PLANS = [PASSAGE_BATTLE, MERIDIAN_BATTLE];
});

/** Battle 1's waves (kept for callers that only need the waves). */
export const PASSAGE_WAVES: readonly WaveSpec[] = PASSAGE_BATTLE.waves;

/**
 * Battle sounds (battle-plan.md §1). The battle only says what happened and where; the game maps each
 * kind to the soundscape (near or far cannon by the listener's distance, and so on).
 */
export type BattleSound = 'cannon' | 'whiz' | 'timber' | 'splash' | 'groan' | 'sink' | 'cheer';

/**
 * Staging beats (battle-plan.md §3) for the camera: `intro` (sails in the fog), `broadside` (your guns
 * fire at a raider), `incoming` (a raider fires on you), `strike` (a raider strikes), `clear` (a wave
 * is beaten), `won`, and `breakoff`. Each carries a world position.
 */
export type BattleBeat = 'intro' | 'broadside' | 'incoming' | 'strike' | 'clear' | 'won' | 'breakoff';

export type BattlePhase = 'idle' | 'intro' | 'fight' | 'lull' | 'question' | 'breakoff' | 'won' | 'skipped';

const PLAYER_HULL = 100;
const BREAK_OFF_AT = 15;
const HULL: Record<RaiderSpec['kind'], number> = { cutter: 45, brigantine: 80 };
const SCALE: Record<RaiderSpec['kind'], number> = { cutter: 0.78, brigantine: 1 };
const RAIDER_RELOAD = 9;
const LAY_SECONDS = 1.5;
const LAY_SECONDS_CALM = 2.5;
const SPAWN_RANGE = 230;
/** The intro: the fog forms, the raiders show inside it at REVEAL, and the guns open at the end. */
const INTRO_SECONDS = 5.5;
/** After the fog is fully thick (FogBank grows over 2.5 s), so no ghost of a hull shows through it. */
const INTRO_REVEAL = 2.8;
const LULL_SECONDS = 20;
const STORE_LIFE = 45;
const SINK_SECONDS = 17;
const COLLECT_RADIUS = 9;
const BASE_REPAIR = 25;
const TIMBER_REPAIR = 10;
const QUICK_REPAIR = 30;
const DOUBLE_SHOT = 1.5;
const SUBSTEP = 1 / 60;

interface Combatant {
  readonly index: number;
  readonly player: boolean;
  readonly ship: Brigantine;
  name: string;
  scale: number;
  hull: number;
  maxHull: number;
  readonly batteries: [Battery, Battery];
  /** Which raider each of your batteries is laid on (−1 none). */
  readonly aim: Int8Array;
  readonly brain: RaiderBrain | null;
  readonly helm: RaiderHelm;
  state: 'idle' | 'afloat' | 'struck' | 'gone';
  struckAt: number;
  /** Warning arcs: 0…1 while a raider's side lays its guns on you, −1 when not. */
  readonly lay: Float32Array;
  readonly inverse: Matrix4;
  vx: number;
  vz: number;
  prevX: number;
  prevZ: number;
  readonly obstacles: CircleObstacle[];
  readonly env: BrigantineEnv;
  readonly captions: { struck: string; bearing: [string, string]; close: [string, string, string] };
  readonly shots: ((gun: number) => void)[];
  /** Which way a struck hull lists (+1 to port). */
  listSign: number;
}

/** What the HUD reads (at 10 Hz) and the dev page's debug API returns. */
export interface BattleSnapshot {
  phase: BattlePhase;
  wave: number;
  waves: number;
  hull: number;
  raidersLeft: number;
  raidersTotal: number;
  bears: [boolean, boolean];
  breakOffs: number;
  calm: boolean;
  doubleShot: boolean;
  stores: { timber: number; powder: number };
  lull: number;
  /** The wave's banner, e.g. "Wave 1 of 2: Wrong Fork and Unchecked" (prebuilt per wave). */
  title: string;
  /** What to do next with the helm ("◀ Turn to port: your starboard guns will bear"); '' when none. */
  hint: string;
  /** Which way the hint turns: 1 port, −1 starboard, 0 hold. */
  hintTurn: number;
  /** True while your helmsman has the helm ("Bring her round"). */
  assist: boolean;
}

/** A snapshot before any battle (idle, whole hull), for `Battle.snapshot` to fill. */
export function emptyBattleSnapshot(): BattleSnapshot {
  return {
    phase: 'idle',
    wave: 0,
    waves: 0,
    hull: 1,
    raidersLeft: 0,
    raidersTotal: 0,
    bears: [false, false],
    breakOffs: 0,
    calm: false,
    doubleShot: false,
    stores: { timber: 0, powder: 0 },
    lull: 0,
    title: '',
    hint: '',
    hintTurn: 0,
    assist: false,
  };
}

export interface BattleOptions {
  tier: TierSettings;
  waves: WaveSampler;
  player: Brigantine;
  plan?: readonly WaveSpec[];
  seed?: number;
  /** Called for captions ("Port battery fires", "Splash, short"); strings are prebuilt, not per frame. */
  onCaption?: (text: string) => void;
  /** Called with a reused position object; copy it if you keep it. */
  onSound?: (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void;
  /** Staging beats for the camera director (battle-plan.md §3). */
  onBeat?: (beat: BattleBeat, x: number, z: number) => void;
  /**
   * Open water at (x, z)? Raiders come out of the fog only where it's clear of islands and harbours
   * (§3): the spawn bearing turns away from the wind's until it is. Omitted, everywhere is open.
   */
  openWater?: (x: number, z: number) => boolean;
  /** The ground the raiders sail over (they run aground on islands like your ship); none at sea. */
  ground?: HeightField | null;
}

/** The lookout's call, by where the fog lies from your bow (prebuilt, picked per wave). */
const LOOKOUT = {
  port: [
    'Sails in the fog, off the port bow!',
    'Sails in the fog, off the port beam!',
    'Sails in the fog, off the port quarter!',
  ],
  starboard: [
    'Sails in the fog, off the starboard bow!',
    'Sails in the fog, off the starboard beam!',
    'Sails in the fog, off the starboard quarter!',
  ],
  ahead: 'Sails in the fog, dead ahead!',
  astern: 'Sails in the fog, right astern!',
} as const;

const tmpLocal = new Vector3();
const tmpWorld = new Vector3();
const muzzle = { x: 0, y: 0, z: 0 };
const aimOut = new Float32Array(2);
const wind = new Float32Array(2);
const soundPos = { x: 0, y: 0, z: 0 };
/** A raider's ball within this distance (m) of your ship whistles past. */
const WHIZ_RADIUS = 16;
const SIDE_OF: readonly Side[] = [PORT, STARBOARD];
/** The helm hints, prebuilt: [your battery][turn port, turn starboard, hold]. */
const HINT_TURN: readonly (readonly string[])[] = [
  [
    '◀ Turn to port: your port guns will bear',
    'Turn to starboard: your port guns will bear ▶',
    'Hold her steady: your port guns are coming to bear',
  ],
  [
    '◀ Turn to port: your starboard guns will bear',
    'Turn to starboard: your starboard guns will bear ▶',
    'Hold her steady: your starboard guns are coming to bear',
  ],
];
const HINT_FIRE = ['Your port guns bear: fire!', 'Your starboard guns bear: fire!', 'Both sides bear: fire!'];

/**
 * A sea battle (docs/specs/BATTLES.md): waves of raiders, your broadsides and theirs, damage, struck
 * colours and settling hulls, stores, the lull between waves, and the break-off that replaces losing.
 * Everything visible is pooled at construction; `update` allocates nothing.
 */
export class Battle {
  readonly group = new Group();
  readonly plan: readonly WaveSpec[];
  phase: BattlePhase = 'idle';
  wave = 0;
  calm = false;
  doubleShot = false;
  breakOffs = 0;
  timber = 0;
  powderUntil = -1;
  phaseAt = 0;

  private readonly tier: TierSettings;
  /**
   * The sea as it's drawn, sampled with the battle clock: the battle's clock starts at 0 and stops
   * while the game is paused, the ocean's doesn't, so each sample adds `seaOffset` (set by `update`).
   * Without it the raiders rode, and the splashes sat on, a sea out of phase with the one on screen.
   */
  private readonly waves: WaveSampler;
  private seaOffset = 0;
  private readonly combatants: Combatant[] = [];
  private readonly balls: BallPool;
  private readonly splashes: SplashPool;
  private readonly smoke: SmokePool;
  private readonly splinters: SplinterPool;
  private readonly stores: StorePool;
  private readonly boats: BoatPool;
  private readonly arcs: ArcSet;
  private readonly fog: FogBank;
  private readonly rand: () => number;
  private readonly caption: (text: string) => void;
  private readonly sound: NonNullable<BattleOptions['onSound']>;
  private readonly beat: NonNullable<BattleOptions['onBeat']>;
  private readonly openWater: ((x: number, z: number) => boolean) | null;
  private readonly ground: HeightField | null;
  private title = '';
  private readonly view = emptyRaiderView();
  /** Only one raider lays its guns at a time, so warnings never stack (§7). */
  private token = -1;
  /** The raider the camera and your helmsman are watching (−1 none), with hysteresis. */
  private focusIdx = -1;
  /** Your helmsman: the raiders' own broadside logic, steering for you (or just advising). */
  private readonly helmsman = new RaiderBrain(78);
  private readonly helmView = emptyRaiderView();
  /** What your helmsman would do now; the ship's owner applies it while `assist` is on. */
  readonly assistHelm: RaiderHelm = { trim: 0, rudder: 0 };
  /** "Bring her round": your helmsman steers to the best broadside until you take the helm back. */
  assist = false;
  private hint = '';
  private hintTurn = 0;
  private tokenFree = 0;
  private waveStart = { x: 0, z: 0, heading: 0 };
  private now = 0;
  private accumulator = 0;

  constructor(o: BattleOptions) {
    this.tier = o.tier;
    const sea = o.waves;
    this.waves = {
      heightAt: (x, z, t) => sea.heightAt(x, z, t + this.seaOffset),
      velocityAt: (x, z, t, out) => sea.velocityAt(x, z, t + this.seaOffset, out),
    };
    this.plan = o.plan ?? PASSAGE_WAVES;
    this.rand = seededRandom(o.seed ?? 0xba771e);
    this.caption = o.onCaption ?? (() => undefined);
    this.sound = o.onSound ?? (() => undefined);
    this.beat = o.onBeat ?? (() => undefined);
    this.openWater = o.openWater ?? null;
    this.ground = o.ground ?? null;
    this.group.name = 'battle';
    const budget = fxBudget(o.tier);
    this.balls = new BallPool(budget.balls);
    this.splashes = new SplashPool(budget.splashes);
    this.smoke = new SmokePool(budget.smoke, budget.trail);
    this.splinters = new SplinterPool(budget.splinters);
    this.stores = new StorePool(budget.stores);
    this.boats = new BoatPool(budget.boats);
    this.arcs = new ArcSet(o.tier, 8);
    this.fog = new FogBank(o.tier);
    this.group.add(
      this.fog.mesh,
      this.arcs.mesh,
      this.balls.mesh,
      this.splashes.mesh,
      this.smoke.mesh,
      this.splinters.mesh,
      this.stores.mesh,
      this.boats.mesh,
    );
    if (budget.smoke === 0) this.smoke.mesh.visible = false;
    if (budget.splinters === 0) this.splinters.mesh.visible = false;

    this.combatants.push(this.makeCombatant(0, o.player, true));
    const most = Math.max(...this.plan.map((w) => w.raiders.length));
    const cap = o.tier.tier === 'lite' || o.tier.tier === 'low' ? 2 : 3;
    for (let i = 0; i < Math.min(most, cap); i++) {
      // Raiders draw a little lighter than your ship and leave the ocean's hull cut-out to you.
      const ship = createBrigantine({
        tier: o.tier.tier === 'ultra' || o.tier.tier === 'high' ? 'medium' : o.tier.tier,
        oceanInteraction: false,
        raider: true,
      });
      ship.group.visible = false;
      this.group.add(ship.group);
      this.combatants.push(this.makeCombatant(i + 1, ship, false));
    }
  }

  private makeCombatant(index: number, ship: Brigantine, player: boolean): Combatant {
    const stations = gunStations(this.tier.tier);
    const reload = player ? undefined : RAIDER_RELOAD;
    const obstacles: CircleObstacle[] = [];
    const c: Combatant = {
      index,
      player,
      ship,
      name: player ? 'You' : '',
      scale: 1,
      hull: player ? PLAYER_HULL : 0,
      maxHull: player ? PLAYER_HULL : 1,
      batteries: [new Battery(PORT, stations, reload), new Battery(STARBOARD, stations, reload)],
      aim: new Int8Array([-1, -1]),
      brain: player ? null : new RaiderBrain(58 + index * 9),
      helm: { trim: 0, rudder: 0 },
      state: player ? 'afloat' : 'idle',
      struckAt: 0,
      lay: new Float32Array([-1, -1]),
      inverse: new Matrix4(),
      vx: 0,
      vz: 0,
      prevX: 0,
      prevZ: 0,
      obstacles,
      env: { waves: this.waves, ground: this.ground, obstacles, t: 0 },
      captions: { struck: '', bearing: ['', ''], close: ['', '', ''] },
      shots: [],
      listSign: 1,
    };
    // Each battery's shot callback is bound once, so firing allocates nothing.
    c.shots.push(
      (gun) => this.shoot(c, 0, gun),
      (gun) => this.shoot(c, 1, gun),
    );
    return c;
  }

  get player(): Combatant {
    return this.combatants[0]!;
  }

  /** Obstacles the player's ship must steer round (the raiders' hulls), updated in place each frame. */
  get playerObstacles(): readonly CircleObstacle[] {
    return this.player.obstacles;
  }

  // ---- Flow -------------------------------------------------------------------------------------

  start(t: number): void {
    this.wave = 0;
    this.breakOffs = 0;
    this.timber = 0;
    this.player.hull = PLAYER_HULL;
    this.refit(this.player);
    this.spawnWave(t);
  }

  skip(t: number): void {
    this.clearRaiders();
    this.fog.thin(t);
    if (this.assist) this.setAssist(false);
    this.setPhase('skipped', t);
  }

  /**
   * You sailed out of the battle zone (into an island's waters): the raiders fall back into the fog
   * and the battle rests (phase 'idle'). The wave you were on is kept, with your hull as it is.
   * Between waves (the lull and the question) nothing changes.
   */
  suspend(t: number): void {
    // Between waves there's nobody left to fall back (and the question waits for you).
    if (this.phase !== 'intro' && this.phase !== 'fight' && this.phase !== 'breakoff') return;
    if (this.phase === 'breakoff') {
      this.player.hull = PLAYER_HULL;
      this.refit(this.player);
    }
    this.clearRaiders();
    this.fog.thin(t);
    if (this.assist) this.setAssist(false);
    this.setPhase('idle', t);
  }

  /** Back out on open water after `suspend`: the wave you were on comes out of the fog again. */
  resume(t: number): void {
    if (this.phase !== 'idle') return;
    if (this.wave >= this.plan.length) {
      this.setPhase('won', t);
      return;
    }
    this.spawnWave(t);
  }

  /** Settles once every raider's figurehead is aboard (it loads after the ship is made). */
  shipsReady(): Promise<void> {
    return Promise.all(this.combatants.map((c) => c.ship.figurehead)).then(() => undefined);
  }

  /**
   * For the warm-up before a battle (the game's late warm): every raider (both rigs), the fog, the
   * arcs and each pool drawn once, so the battle's first real frames build nothing. Returns the
   * function that puts everything back as it was (hidden, empty).
   */
  stageWarm(): () => void {
    const restore: (() => void)[] = [];
    for (let i = 1; i < this.combatants.length; i++) {
      const g = this.combatants[i]!.ship.group;
      g.traverse((o) => {
        if (o.visible) return;
        o.visible = true;
        restore.push(() => (o.visible = false));
      });
    }
    for (const m of [this.fog.mesh, this.smoke.mesh, this.splinters.mesh]) {
      const visible = m.visible;
      m.visible = true;
      restore.push(() => (m.visible = visible));
    }
    for (const m of [
      this.fog.mesh,
      this.arcs.mesh,
      this.balls.mesh,
      this.splashes.mesh,
      this.smoke.mesh,
      this.splinters.mesh,
      this.stores.mesh,
      this.boats.mesh,
    ]) {
      const count = m.count;
      m.count = Math.max(1, count);
      restore.push(() => (m.count = count));
    }
    return () => {
      for (const r of restore) r();
    };
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
    for (let i = 1; i < this.combatants.length; i++)
      for (const b of this.combatants[i]!.batteries) b.reloadSeconds = RAIDER_RELOAD * (calm ? 1.5 : 1);
  }

  /** Between waves: a right answer earns a pick (§2.0); `null` skips the question. */
  answer(pick: 'double-shot' | 'repairs' | null): void {
    if (this.phase !== 'question') return;
    if (pick === 'double-shot') this.doubleShot = true;
    if (pick === 'repairs') this.repair(QUICK_REPAIR);
    this.repair(BASE_REPAIR + this.timber * TIMBER_REPAIR);
    this.timber = 0;
    this.wave++;
    if (this.wave >= this.plan.length) {
      this.setPhase('won', this.now);
      const p = this.player.ship.dynamics.pose;
      this.emit('cheer', p.x, 2, p.z);
      this.beat('won', p.x, p.z);
    } else this.spawnWave(this.now);
  }

  private repair(points: number): void {
    this.player.hull = Math.min(PLAYER_HULL, this.player.hull + points);
    this.refit(this.player);
  }

  /** Holes in the canvas grow with the damage a hull has taken. */
  private shotThrough(c: Combatant): void {
    c.ship.uniforms.sailHoles.value = 0.32 * (1 - c.hull / c.maxHull);
  }

  /** A repaired or fresh ship: the shot holes in her hull are patched and her sails match her hull. */
  private refit(c: Combatant): void {
    c.ship.clearScorch();
    this.shotThrough(c);
  }

  private emit(kind: BattleSound, x: number, y: number, z: number, gain = 1): void {
    soundPos.x = x;
    soundPos.y = y;
    soundPos.z = z;
    this.sound(kind, soundPos, gain);
  }

  private setPhase(phase: BattlePhase, t: number): void {
    this.phase = phase;
    this.phaseAt = t;
  }

  private clearRaiders(): void {
    for (let i = 1; i < this.combatants.length; i++) {
      const c = this.combatants[i]!;
      c.state = 'idle';
      c.ship.group.visible = false;
      c.lay.fill(-1);
    }
    this.token = -1;
    this.balls.clear();
  }

  private spawnWave(t: number): void {
    this.clearRaiders();
    const p = this.player.ship.dynamics.pose;
    this.waveStart.x = p.x;
    this.waveStart.z = p.z;
    this.waveStart.heading = p.heading;
    windAt(p.x, p.z, t, wind);
    // Raiders hold the weather gauge: they come from upwind and the wind's beams, out of the fog,
    // turned as little as it takes to keep them (and their fog) out on open water.
    const from = this.openBearing(p.x, p.z, Math.atan2(-wind[0]!, -wind[1]!));
    const spec = this.plan[this.wave]!;
    const n = Math.min(spec.raiders.length, this.combatants.length - 1);
    for (let i = 0; i < n; i++) {
      const c = this.combatants[i + 1]!;
      const r = spec.raiders[i]!;
      // Close enough together that they come out of one fog bank.
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.8;
      const a = from + spread + (this.rand() - 0.5) * 0.3;
      const x = p.x + Math.sin(a) * SPAWN_RANGE;
      const z = p.z + Math.cos(a) * SPAWN_RANGE;
      c.ship.dynamics.reset(x, z, Math.atan2(p.x - x, p.z - z));
      c.ship.setName(r.name);
      c.ship.setRig(r.kind);
      c.name = r.name;
      c.scale = SCALE[r.kind];
      c.ship.group.scale.setScalar(c.scale);
      // Hidden until the fog is thick enough to hide her (INTRO_REVEAL).
      c.ship.group.visible = false;
      c.ship.uniforms.flagLower.value = 0;
      c.ship.group.rotation.set(0, 0, 0);
      c.ship.group.position.set(x, 0, z);
      c.hull = c.maxHull = HULL[r.kind];
      this.refit(c);
      c.state = 'afloat';
      c.prevX = x;
      c.prevZ = z;
      c.vx = c.vz = 0;
      c.lay.fill(-1);
      for (const b of c.batteries) b.loadAll();
      c.captions.struck = `${r.name} strikes her colours`;
      c.captions.bearing[0] = `${r.name} is bearing on you, port side`;
      c.captions.bearing[1] = `${r.name} is bearing on you, starboard side`;
      c.captions.close[0] = `◀ Turn to port and close in on ${r.name}`;
      c.captions.close[1] = `Turn to starboard and close in on ${r.name} ▶`;
      c.captions.close[2] = `Hold your course and close in on ${r.name}`;
    }
    for (const b of this.player.batteries) b.loadAll();
    // The fog bank forms in front of them, with room for the way they make during the intro.
    this.fog.form(p.x, p.z, from, SPAWN_RANGE - 35, 0.9 + (n - 1) * 0.4, t, this.rand);
    this.title = `Wave ${this.wave + 1} of ${this.plan.length}: ${joinNames(spec.raiders, n)}`;
    this.setPhase('intro', t);
    this.caption(lookoutCall(from - p.heading));
    this.beat('intro', this.fog.centre.x, this.fog.centre.z);
  }

  /** The bearing nearest `want` whose spawn ring (the raiders and the fog in front of them) is open water. */
  private openBearing(x: number, z: number, want: number): number {
    const clear = this.openWater;
    if (!clear) return want;
    for (let k = 0; k < 12; k++) {
      // 0, +0.5, −0.5, +1, −1, … radians off the wind's bearing.
      const a = want + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
      let open = true;
      for (let j = -1; j <= 1 && open; j++) {
        const b = a + j * 0.45;
        open =
          clear(x + Math.sin(b) * SPAWN_RANGE, z + Math.cos(b) * SPAWN_RANGE) &&
          clear(x + Math.sin(b) * SPAWN_RANGE * 0.6, z + Math.cos(b) * SPAWN_RANGE * 0.6);
      }
      if (open) return a;
    }
    return want;
  }

  // ---- Your helm --------------------------------------------------------------------------------

  /** Hands the helm to your helmsman ("Bring her round") or takes it back. */
  setAssist(on: boolean): void {
    if (on === this.assist) return;
    if (on && this.phase !== 'fight' && this.phase !== 'intro') return;
    this.assist = on;
    this.caption(on ? 'The helmsman brings her round' : 'You have the helm');
  }

  /** Writes the watched raider's position; false when there's none. */
  focus(out: { x: number; z: number }): boolean {
    if (this.focusIdx < 0) return false;
    const p = this.combatants[this.focusIdx]!.ship.dynamics.pose;
    out.x = p.x;
    out.z = p.z;
    return true;
  }

  /** Picks the nearest raider, sticking with the one you're on unless another is clearly nearer. */
  private pickFocus(): void {
    const pp = this.player.ship.dynamics.pose;
    let best = -1;
    let bestD = Infinity;
    let curD = Infinity;
    for (let i = 1; i < this.combatants.length; i++) {
      const c = this.combatants[i]!;
      if (c.state !== 'afloat' || !c.ship.group.visible) continue;
      const p = c.ship.dynamics.pose;
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      if (i === this.focusIdx) curD = d;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (curD === Infinity || bestD < curD * 0.75) this.focusIdx = best;
  }

  /**
   * Your helmsman works out the best broadside on the watched raider every frame. That gives the hint
   * ("◀ Turn to port: your starboard guns will bear") and, while `assist` is on, the helm itself.
   */
  private adviseHelm(dt: number, t: number): void {
    const fighting = this.phase === 'fight';
    if (fighting) this.pickFocus();
    else if (this.phase !== 'intro') this.focusIdx = -1;
    if (!fighting || this.focusIdx < 0) {
      this.hint = '';
      this.hintTurn = 0;
      this.assistHelm.trim = this.player.ship.dynamics.control.trim;
      this.assistHelm.rudder = 0;
      return;
    }
    const pl = this.player;
    const p = pl.ship.dynamics.pose;
    const target = this.combatants[this.focusIdx]!;
    const tp = target.ship.dynamics.pose;
    windAt(p.x, p.z, t, wind);
    const v = this.helmView;
    v.x = p.x;
    v.z = p.z;
    v.heading = p.heading;
    v.headingRate = pl.ship.dynamics.headingRate;
    v.targetX = tp.x;
    v.targetZ = tp.z;
    v.windX = wind[0]!;
    v.windZ = wind[1]!;
    v.loadedPort = pl.batteries[0]!.loadedCount();
    v.loadedStarboard = pl.batteries[1]!.loadedCount();
    v.hull = pl.hull / PLAYER_HULL;
    v.avoidX = v.avoidZ = 0;
    this.helmsman.steer(dt, v, this.assistHelm);

    const r = this.assistHelm.rudder;
    const turn = r > 0.25 ? 1 : r < -0.25 ? -1 : 0;
    this.hintTurn = turn;
    const port = this.target(pl, 0) >= 0;
    const starboard = this.target(pl, 1) >= 0;
    const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
    const guns = this.helmsman.side === PORT ? 0 : 1;
    if (port || starboard) {
      this.hint = HINT_FIRE[port && starboard ? 2 : port ? 0 : 1]!;
      this.hintTurn = 0;
    } else if (dist > MAX_RANGE) this.hint = target.captions.close[turn === 1 ? 0 : turn === -1 ? 1 : 2]!;
    else this.hint = HINT_TURN[guns]![turn === 1 ? 0 : turn === -1 ? 1 : 2]!;
  }

  private breakOff(t: number): void {
    this.breakOffs++;
    this.setPhase('breakoff', t);
    const p = this.player.ship.dynamics.pose;
    this.beat('breakoff', p.x, p.z);
    this.caption('Break off! The crew pulls back to make repairs.');
  }

  // ---- Guns -------------------------------------------------------------------------------------

  /** Best raider your `side` bears on (−1 none). */
  private target(c: Combatant, sideIdx: number): number {
    const p = c.ship.dynamics.pose;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.combatants.length; i++) {
      const o = this.combatants[i]!;
      if (o === c || o.state !== 'afloat' || o.player === c.player) continue;
      const op = o.ship.dynamics.pose;
      const dx = op.x - p.x;
      const dz = op.z - p.z;
      const off = bearing(p.heading, SIDE_OF[sideIdx]!, dx, dz, 12 * o.scale);
      if (!Number.isFinite(off)) continue;
      const score = off * 60 + Math.hypot(dx, dz) * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  /** True if your `side` bears on any raider right now. */
  bears(sideIdx: number): boolean {
    return this.phase === 'fight' && this.target(this.player, sideIdx) >= 0;
  }

  /**
   * Fires your batteries: `which` 'bearing' fires every side that bears and is loaded (Space, A, Fire);
   * 'port' and 'starboard' fire one side (Z/C, LB/RB). Returns how many guns went off.
   */
  fire(which: 'bearing' | 'port' | 'starboard'): number {
    if (this.phase !== 'fight') return 0;
    let total = 0;
    for (let s = 0; s < 2; s++) {
      if (which === 'port' && s !== 0) continue;
      if (which === 'starboard' && s !== 1) continue;
      const target = this.target(this.player, s);
      if (target < 0) continue;
      const b = this.player.batteries[s]!;
      this.player.aim[s] = target;
      const n = b.fire(this.now);
      if (n > 0) {
        this.caption(s === 0 ? 'Port battery fires' : 'Starboard battery fires');
        const tp = this.combatants[target]!.ship.dynamics.pose;
        this.beat('broadside', tp.x, tp.z);
      }
      total += n;
    }
    if (total === 0 && which !== 'bearing') this.caption('Nothing bears on that side');
    return total;
  }

  private shoot(c: Combatant, sideIdx: number, gun: number): void {
    const b = c.batteries[sideIdx]!;
    const targetIdx = c.player ? c.aim[sideIdx]! : 0;
    const target = this.combatants[targetIdx];
    if (!target || target.state === 'gone') return;
    muzzleLocal(SIDE_OF[sideIdx]!, b.stations[gun]!, muzzle);
    c.ship.group.updateMatrixWorld();
    tmpWorld.set(muzzle.x, muzzle.y, muzzle.z);
    c.ship.group.localToWorld(tmpWorld);
    const tp = target.ship.dynamics.pose;
    const flight = leadPoint(
      tmpWorld.x,
      tmpWorld.y,
      tmpWorld.z,
      tp.x,
      1.2 * target.scale,
      tp.z,
      target.vx,
      target.vz,
      aimOut,
    );
    const dx = aimOut[0]! - tmpWorld.x;
    const dz = aimOut[1]! - tmpWorld.z;
    const range = Math.hypot(dx, dz);
    let elevation = Number.isFinite(flight) ? elevationFor(range, 1.2 * target.scale - tmpWorld.y) : 0.08;
    // Your gunners are steadier than theirs (§4.2).
    const spreadYaw = (c.player ? 0.03 : 0.1) * (this.rand() + this.rand() - 1);
    const spreadElev = (c.player ? 0.01 : 0.03) * (this.rand() + this.rand() - 1);
    elevation = (Number.isFinite(elevation) ? elevation : 0.08) + spreadElev;
    const yaw = Math.atan2(dx, dz) + spreadYaw;
    const horiz = MUZZLE_SPEED * Math.cos(elevation);
    const vx = Math.sin(yaw) * horiz;
    const vz = Math.cos(yaw) * horiz;
    const vy = MUZZLE_SPEED * Math.sin(elevation);
    let damage = (c.player ? 6 + this.rand() * 3 : 4 + this.rand() * 3) * (6 / b.count);
    if (c.player && this.doubleShot) damage *= DOUBLE_SHOT;
    if (!c.player && this.calm) damage *= 0.5;
    this.balls.spawn(c.index, tmpWorld.x, tmpWorld.y, tmpWorld.z, vx, vy, vz, damage);
    this.emit('cannon', tmpWorld.x, tmpWorld.y, tmpWorld.z, 0.85 + this.rand() * 0.3);
    // Smoke rolls out of the gunport and is carried along with the ship.
    const ux = Math.sin(yaw);
    const uz = Math.cos(yaw);
    const rm = world.reducedMotion.value > 0.5;
    for (let k = 0; k < 3; k++) {
      const s = 5 + k * 5;
      this.smoke.spawn(
        tmpWorld.x + ux * (0.5 + k * 1.2),
        tmpWorld.y + k * 0.15,
        tmpWorld.z + uz * (0.5 + k * 1.2),
        ux * s + c.vx,
        0.5 + k * 0.3,
        uz * s + c.vz,
        this.now,
        rm ? 2.2 : 5 + k,
        (rm ? 0.6 : 1) * (1.2 + k * 0.45),
      );
    }
    if (c.player && this.doubleShot && gun === 0) this.doubleShot = false;
    // The hull heels away from its own broadside: each gun's recoil lifts the firing side a touch.
    const calmMotion = world.reducedMotion.value > 0.5 ? 0.5 : 1;
    c.ship.dynamics.kick(SIDE_OF[sideIdx]! * 0.04 * (6 / b.count) * c.scale * calmMotion);
  }

  // ---- Frame ------------------------------------------------------------------------------------

  /** `seaT` is the ocean's clock (the time the drawn waves are at); it defaults to the battle's. */
  update(dt: number, t: number, seaT = t): void {
    this.now = t;
    this.seaOffset = seaT - t;
    const player = this.player;
    // Raiders' sailing and positions; the player's ship is stepped by its owner.
    this.trackVelocity(player, dt);
    this.updateObstacles();
    this.adviseHelm(dt, t);
    for (let i = 1; i < this.combatants.length; i++) {
      const c = this.combatants[i]!;
      if (c.state === 'idle' || c.state === 'gone') continue;
      if (c.state === 'afloat') this.steerRaider(c, dt, t);
      if (c.state === 'struck') this.settle(c, dt, t);
      else {
        c.env.t = t;
        c.ship.update(dt, t, c.env);
      }
      this.trackVelocity(c, dt);
    }
    for (const c of this.combatants) {
      c.ship.group.updateMatrixWorld();
      c.inverse.copy(c.ship.group.matrixWorld).invert();
    }

    if (this.phase === 'fight') this.raiderGunnery(dt);
    if (this.phase === 'fight' || this.phase === 'lull') {
      const boost = t < this.powderUntil ? 1.6 : 1;
      for (const b of player.batteries) b.reloadBoost = boost;
      for (const c of this.combatants) {
        if (c.state !== 'afloat') continue;
        c.batteries[0]!.update(dt, t, c.shots[0]!);
        c.batteries[1]!.update(dt, t, c.shots[1]!);
      }
    }
    for (const c of this.combatants) {
      if (c.state !== 'afloat') continue;
      for (let s = 0; s < 2; s++) {
        const b = c.batteries[s]!;
        for (let g = 0; g < b.count; g++) c.ship.setGunRecoil(s * 6 + g, b.recoil(g, t));
      }
    }

    this.accumulator = Math.min(this.accumulator + dt, SUBSTEP * 6);
    while (this.accumulator >= SUBSTEP) {
      this.balls.step(SUBSTEP);
      this.collide(t);
      this.accumulator -= SUBSTEP;
    }
    this.trailBalls(t);
    this.collectStores(t);
    this.flow(t);

    windAt(player.ship.dynamics.pose.x, player.ship.dynamics.pose.z, t, wind);
    this.balls.sync();
    this.splashes.sync(t);
    this.smoke.update(dt, t, wind[0]!, wind[1]!);
    this.splinters.update(dt, t, this.waves);
    this.stores.update(t, this.waves);
    this.boats.update(dt, t, this.waves);
    this.fog.update(dt, t, wind[0]!, wind[1]!);
    this.drawArcs();
  }

  /** Each ball in flight leaves a puff of smoke every TRAIL_EVERY s, so you can follow the shot. */
  private trailBalls(t: number): void {
    const balls = this.balls;
    for (let i = 0; i < balls.size; i++) {
      if (balls.owner[i] === -1 || balls.age[i]! < balls.trailAt[i]!) continue;
      balls.trailAt[i] = balls.age[i]! + TRAIL_EVERY;
      this.smoke.trail(balls.x[i]!, balls.y[i]!, balls.z[i]!, t);
    }
  }

  private trackVelocity(c: Combatant, dt: number): void {
    const p = c.ship.dynamics.pose;
    if (dt > 0) {
      const k = Math.min(1, dt * 4);
      c.vx += ((p.x - c.prevX) / dt - c.vx) * k;
      c.vz += ((p.z - c.prevZ) / dt - c.vz) * k;
    }
    c.prevX = p.x;
    c.prevZ = p.z;
  }

  private updateObstacles(): void {
    // Two circles per hull (fore and aft) in every other ship's obstacle list; arrays are reused.
    for (const c of this.combatants) {
      let n = 0;
      for (const o of this.combatants) {
        if (o === c || (o.state !== 'afloat' && o.state !== 'struck')) continue;
        const p = o.ship.dynamics.pose;
        for (let k = -1; k <= 1; k += 2) {
          let ob = c.obstacles[n];
          if (!ob) c.obstacles.push((ob = { x: 0, z: 0, r: 0 }));
          ob.x = p.x + Math.sin(p.heading) * 5.5 * k * o.scale;
          ob.z = p.z + Math.cos(p.heading) * 5.5 * k * o.scale;
          ob.r = 4.2 * o.scale;
          n++;
        }
      }
      c.obstacles.length = n;
    }
  }

  private steerRaider(c: Combatant, dt: number, t: number): void {
    const v = this.view;
    const p = c.ship.dynamics.pose;
    const pp = this.player.ship.dynamics.pose;
    windAt(p.x, p.z, t, wind);
    v.x = p.x;
    v.z = p.z;
    v.heading = p.heading;
    v.headingRate = c.ship.dynamics.headingRate;
    v.targetX = pp.x;
    v.targetZ = pp.z;
    v.windX = wind[0]!;
    v.windZ = wind[1]!;
    v.loadedPort = c.batteries[0]!.loadedCount();
    v.loadedStarboard = c.batteries[1]!.loadedCount();
    v.hull = c.hull / c.maxHull;
    v.avoidX = 0;
    v.avoidZ = 0;
    for (let i = 1; i < this.combatants.length; i++) {
      const o = this.combatants[i]!;
      if (o === c || o.state !== 'afloat') continue;
      const op = o.ship.dynamics.pose;
      const dx = p.x - op.x;
      const dz = p.z - op.z;
      const d = Math.hypot(dx, dz);
      if (d < 45 && d > 0.01) {
        v.avoidX += (dx / d) * (45 - d);
        v.avoidZ += (dz / d) * (45 - d);
      }
    }
    // Nothing to do while the player breaks off or between waves: heave to.
    if (this.phase !== 'fight' && this.phase !== 'intro') {
      c.helm.trim = 0.15;
      c.helm.rudder = 0;
    } else c.brain!.steer(dt, v, c.helm);
    c.ship.dynamics.setInput(c.helm);
  }

  private raiderGunnery(dt: number): void {
    const pp = this.player.ship.dynamics.pose;
    const layTime = this.calm ? LAY_SECONDS_CALM : LAY_SECONDS;
    if (this.token >= 0 && this.now > this.tokenFree) {
      const holder = this.combatants[this.token]!;
      if (
        holder.lay[0]! < 0 &&
        holder.lay[1]! < 0 &&
        !holder.batteries[0]!.firing() &&
        !holder.batteries[1]!.firing()
      )
        this.token = -1;
    }
    for (let i = 1; i < this.combatants.length; i++) {
      const c = this.combatants[i]!;
      if (c.state !== 'afloat') continue;
      const p = c.ship.dynamics.pose;
      for (let s = 0; s < 2; s++) {
        const b = c.batteries[s]!;
        const bears = Number.isFinite(bearing(p.heading, SIDE_OF[s]!, pp.x - p.x, pp.z - p.z, 12));
        const ready = b.loadedCount() >= Math.ceil(b.count / 2) && !b.firing();
        if (c.lay[s]! >= 0) {
          if (!bears) {
            c.lay[s] = Math.max(-1, c.lay[s]! - dt * 1.5);
            if (c.lay[s]! <= 0) c.lay[s] = -1;
            continue;
          }
          c.lay[s] = Math.min(1, c.lay[s]! + dt / layTime);
          if (c.lay[s]! >= 1) {
            b.fire(this.now);
            this.beat('incoming', p.x, p.z);
            c.lay[s] = -1;
            this.tokenFree = this.now + 2.5;
          }
        } else if (bears && ready && (this.token < 0 || this.token === i)) {
          this.token = i;
          c.lay[s] = 0;
          this.caption(c.captions.bearing[s]!);
        }
      }
    }
  }

  private collide(t: number): void {
    const balls = this.balls;
    for (let i = 0; i < balls.size; i++) {
      const owner = balls.owner[i]!;
      if (owner === -1) continue;
      const x = balls.x[i]!;
      const y = balls.y[i]!;
      const z = balls.z[i]!;
      if (balls.age[i]! > 8) {
        balls.free(i);
        continue;
      }
      // A raider's ball passing close by your ship whistles once.
      if (owner !== 0 && !balls.whizzed[i]) {
        const pp = this.player.ship.dynamics.pose;
        const dx = x - pp.x;
        const dz = z - pp.z;
        if (dx * dx + dz * dz < WHIZ_RADIUS * WHIZ_RADIUS) {
          balls.whizzed[i] = 1;
          this.emit('whiz', x, y, z);
        }
      }
      let hit = false;
      for (let k = 0; k < this.combatants.length; k++) {
        const c = this.combatants[k]!;
        if (k === owner || (c.state !== 'afloat' && c.state !== 'struck')) continue;
        const p = c.ship.dynamics.pose;
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz > 196 * c.scale * c.scale) continue;
        tmpLocal.set(x, y, z).applyMatrix4(c.inverse);
        if (!insideHull(tmpLocal.x, tmpLocal.y, tmpLocal.z)) continue;
        c.ship.addScorch(tmpLocal.x, tmpLocal.y, tmpLocal.z);
        this.hit(c, balls.damage[i]!, x, y, z, tmpLocal.x >= 0 ? 1 : -1, t);
        hit = true;
        break;
      }
      if (hit) {
        balls.free(i);
        continue;
      }
      if (y < 1.5) {
        const sea = this.waves.heightAt(x, z, t);
        if (y < sea) {
          // The splash goes where the ball crossed the surface during this sub-step, not where the
          // step left it (up to a metre on and under the water).
          const vy = balls.vy[i]!;
          const back = vy < 0 ? Math.min(1, (sea - y) / (-vy * SUBSTEP)) * SUBSTEP : 0;
          const sx = x - balls.vx[i]! * back;
          const sz = z - balls.vz[i]! * back;
          const sy = this.waves.heightAt(sx, sz, t);
          this.splashes.spawn(sx, sy, sz, t, 2.4 + this.rand() * 0.8, 1, this.rand());
          this.emit('splash', sx, sy, sz, 0.8 + this.rand() * 0.3);
          balls.free(i);
        }
      }
    }
  }

  private hit(
    c: Combatant,
    damage: number,
    x: number,
    y: number,
    z: number,
    localSide: number,
    t: number,
  ): void {
    if (c.state !== 'afloat') {
      this.splinters.burst(x, y, z, 0, 0, 3, this.rand);
      this.timberPuff(x, y, z, 0, 0, t);
      return;
    }
    c.hull = Math.max(0, c.hull - damage);
    this.shotThrough(c);
    // Splinters fly off the struck side, outward.
    const h = c.ship.dynamics.pose.heading;
    const nx = Math.cos(h) * localSide;
    const nz = -Math.sin(h) * localSide;
    this.splinters.burst(x, y, z, nx, nz, 4, this.rand);
    this.emit('timber', x, y, z, c.player ? 1.15 : 0.9);
    // A hit shows on the timber where the ball struck (a burst of splinters and a puff of dust and
    // smoke), not as a splash in the sea beside her.
    this.timberPuff(x, y, z, nx, nz, t);
    // A ball striking home rocks the hull away from it, with a short shudder.
    const rm = world.reducedMotion.value > 0.5;
    c.ship.dynamics.kick(localSide * (rm ? 0.03 : 0.07), (this.rand() - 0.5) * (rm ? 0.02 : 0.05));
    if (c.player) {
      c.ship.dynamics.pose.shake = Math.max(c.ship.dynamics.pose.shake, rm ? 0 : 0.3);
      this.caption('Hit! Your hull takes a ball');
      if (c.hull <= BREAK_OFF_AT && this.phase === 'fight') this.breakOff(t);
      return;
    }
    this.caption('Hit!');
    if (c.hull <= 0) this.strike(c, t);
  }

  /** The flash and puff where a ball strikes a hull, thrown out from the struck side. */
  private timberPuff(x: number, y: number, z: number, nx: number, nz: number, t: number): void {
    const rm = world.reducedMotion.value > 0.5;
    // A ball home at the waterline still puffs where you can see it, above the sea.
    const y0 = Math.max(y, this.waves.heightAt(x, z, t) + 0.4);
    for (let k = 0; k < 2; k++)
      this.smoke.spawn(
        x + nx * (0.4 + k * 0.8),
        y0 + k * 0.3,
        z + nz * (0.4 + k * 0.8),
        nx * (3 + k * 2),
        0.8 + k * 0.4,
        nz * (3 + k * 2),
        t,
        rm ? 1.6 : 2.6 + k,
        (rm ? 0.6 : 1) * (0.9 + k * 0.4),
      );
  }

  private strike(c: Combatant, t: number): void {
    c.state = 'struck';
    c.struckAt = t;
    c.lay.fill(-1);
    c.listSign = this.rand() < 0.5 ? 1 : -1;
    const sp = c.ship.dynamics.pose;
    this.emit('groan', sp.x, 1.5, sp.z);
    if (this.token === c.index) this.token = -1;
    this.caption(c.captions.struck);
    const p = c.ship.dynamics.pose;
    this.beat('strike', p.x, p.z);
    const pp = this.player.ship.dynamics.pose;
    // The crew rows away from you, from the far side of the hull.
    const away = Math.atan2(p.x - pp.x, p.z - pp.z);
    this.boats.spawn(p.x + Math.sin(away) * 8, p.z + Math.cos(away) * 8, away + 1.1, t);
    const count = 3 + Math.floor(this.rand() * 3);
    for (let k = 0; k < count; k++) {
      const a = this.rand() * Math.PI * 2;
      const r = 6 + this.rand() * 8;
      this.stores.spawn(
        p.x + Math.sin(a) * r,
        p.z + Math.cos(a) * r,
        this.rand() < 0.6 ? STORE_TIMBER : STORE_POWDER,
        t + STORE_LIFE,
      );
    }
    // Wreckage: broken planks scattered along her side (not collectable), so the stores stand out.
    const bits = 2 + Math.floor(this.rand() * 3);
    for (let k = 0; k < bits; k++) {
      const along = (this.rand() - 0.5) * 20 * c.scale;
      const off = (this.rand() - 0.5) * 9;
      this.stores.spawn(
        p.x + Math.sin(p.heading) * along + Math.cos(p.heading) * off,
        p.z + Math.cos(p.heading) * along - Math.sin(p.heading) * off,
        STORE_WRECKAGE,
        t + STORE_LIFE * (0.5 + this.rand() * 0.4),
      );
    }
  }

  /**
   * A struck raider, staged one beat at a time (battle-plan.md §2): the colours come down the halyard
   * (a small lift first, then hand over hand), the hull takes a list that overshoots and settles,
   * the stern sinks until the bow lifts clear, and she slips under with a last gout of spray.
   */
  private settle(c: Combatant, dt: number, t: number): void {
    const age = t - c.struckAt;
    const g = c.ship.group;
    const pose = c.ship.dynamics.pose;
    c.ship.uniforms.flagLower.value = haulDown(age);
    // She keeps riding the swell at first, so she doesn't freeze on the water.
    const swell = this.waves.heightAt(pose.x, pose.z, t) * Math.max(0, 1 - age / 8);
    const list = c.listSign * 0.26 * spring01(clamp01((age - 1.2) / 3.2));
    const bowUp = -0.3 * smooth(clamp01((age - 5) / 6)) - 0.22 * smooth(clamp01((age - 11) / 4.5));
    const sink =
      1.1 * smooth(clamp01((age - 1.2) / 4)) +
      3.6 * smooth(clamp01((age - 5) / 6)) +
      9 * clamp01((age - 11) / 5) ** 2;
    g.position.set(pose.x, swell - sink * c.scale, pose.z);
    g.rotation.set(bowUp, pose.heading, list, 'YXZ');
    // Air bubbling out along her waterline while she goes down (on the hull, never off it).
    if (age > 1.5 && age < 15.5 && this.rand() < dt * (age > 11 ? 3 : 1.2)) {
      const along = (this.rand() - 0.6) * 16 * c.scale;
      const bx = pose.x + Math.sin(pose.heading) * along;
      const bz = pose.z + Math.cos(pose.heading) * along;
      this.splashes.spawn(bx, this.waves.heightAt(bx, bz, t), bz, t, 0.9 + this.rand() * 0.6, 0, this.rand());
    }
    // Follow-through: the bow slips under with a last gout of spray.
    if (age >= 15.6 && age - dt < 15.6) {
      const fx = Math.sin(pose.heading);
      const fz = Math.cos(pose.heading);
      const bx = pose.x + fx * 9 * c.scale;
      const bz = pose.z + fz * 9 * c.scale;
      const y = this.waves.heightAt(bx, bz, t);
      this.splashes.spawn(bx, y, bz, t, 3.4, 1, this.rand());
      this.emit('sink', bx, y, bz);
      const ax = bx - fx * 4;
      const az = bz - fz * 4;
      this.splashes.spawn(ax, this.waves.heightAt(ax, az, t), az, t, 2.2, 0, this.rand());
    }
    if (age > SINK_SECONDS) {
      c.state = 'gone';
      g.visible = false;
    }
  }

  private collectStores(t: number): void {
    const p = this.player.ship.dynamics.pose;
    const s = this.stores;
    for (let i = 0; i < s.size; i++) {
      if (!s.collectable(i)) continue;
      const dx = s.x[i]! - p.x;
      const dz = s.z[i]! - p.z;
      if (dx * dx + dz * dz > COLLECT_RADIUS * COLLECT_RADIUS) continue;
      s.live[i] = 0;
      if (s.kind[i] === STORE_TIMBER) {
        this.timber++;
        this.caption('Timber aboard: repairs between waves');
      } else {
        this.powderUntil = t + 20;
        this.caption('Dry powder aboard: faster reloads');
      }
    }
  }

  private flow(t: number): void {
    if (this.phase === 'intro') {
      const age = t - this.phaseAt;
      if (age >= INTRO_REVEAL)
        for (let i = 1; i < this.combatants.length; i++) {
          const c = this.combatants[i]!;
          if (c.state === 'afloat') c.ship.group.visible = true;
        }
      if (age >= INTRO_SECONDS) {
        this.fog.thin(t);
        this.setPhase('fight', t);
        this.caption('Run out the guns!');
      }
    } else if (this.phase === 'fight') {
      let left = 0;
      for (let i = 1; i < this.combatants.length; i++) if (this.combatants[i]!.state === 'afloat') left++;
      if (left === 0) {
        this.setPhase('lull', t);
        if (this.assist) this.setAssist(false);
        this.caption('The wave is beaten. Collect the stores before they sink.');
        const p = this.player.ship.dynamics.pose;
        this.emit('cheer', p.x, 2, p.z, 0.8);
        this.beat('clear', p.x, p.z);
      }
    } else if (this.phase === 'lull') {
      let afloat = 0;
      for (let i = 0; i < this.stores.size; i++) if (this.stores.collectable(i)) afloat++;
      if (t - this.phaseAt > LULL_SECONDS || (afloat === 0 && t - this.phaseAt > 4))
        this.setPhase('question', t);
    } else if (this.phase === 'breakoff' && t - this.phaseAt > 2.5) {
      // Back to the start of the same wave with a whole hull; cleared waves stay cleared.
      this.player.hull = PLAYER_HULL;
      this.refit(this.player);
      const d = this.player.ship.dynamics;
      d.reset(this.waveStart.x, this.waveStart.z, this.waveStart.heading);
      this.player.prevX = this.waveStart.x;
      this.player.prevZ = this.waveStart.z;
      this.player.vx = this.player.vz = 0;
      this.spawnWave(t);
    }
  }

  private drawArcs(): void {
    const arcs = this.arcs;
    arcs.begin();
    if (this.phase === 'fight' || this.phase === 'lull') {
      const pl = this.player;
      const p = pl.ship.dynamics.pose;
      for (let s = 0; s < 2; s++) {
        const glow = this.phase === 'fight' && this.target(pl, s) >= 0 ? 1 : 0;
        arcs.add(
          p.x,
          p.z,
          p.heading,
          SIDE_OF[s]!,
          ARC_FIRING,
          1,
          glow * (0.4 + 0.6 * readyShare(pl.batteries[s]!)),
        );
      }
      for (let i = 1; i < this.combatants.length; i++) {
        const c = this.combatants[i]!;
        if (c.state !== 'afloat') continue;
        const cp = c.ship.dynamics.pose;
        for (let s = 0; s < 2; s++) {
          const lay = c.lay[s]!;
          if (lay < 0) continue;
          arcs.add(cp.x, cp.z, cp.heading, SIDE_OF[s]!, ARC_WARNING, lay, 0);
        }
      }
    }
    arcs.end();
  }

  // ---- Read-outs --------------------------------------------------------------------------------

  /** Readiness of your gun `i` on side 0 (port) or 1 (starboard): 0 empty … 1 loaded. */
  readiness(sideIdx: number, gun: number): number {
    return this.player.batteries[sideIdx]!.readiness(gun);
  }

  gunCount(): number {
    return this.player.batteries[0]!.count;
  }

  snapshot(out: BattleSnapshot): BattleSnapshot {
    out.phase = this.phase;
    out.wave = this.wave;
    out.waves = this.plan.length;
    out.hull = this.player.hull / PLAYER_HULL;
    let left = 0;
    let total = 0;
    for (let i = 1; i < this.combatants.length; i++) {
      const c = this.combatants[i]!;
      if (c.state === 'idle') continue;
      total++;
      if (c.state === 'afloat') left++;
    }
    out.raidersLeft = left;
    out.raidersTotal = total;
    out.bears[0] = this.bears(0);
    out.bears[1] = this.bears(1);
    out.breakOffs = this.breakOffs;
    out.calm = this.calm;
    out.doubleShot = this.doubleShot;
    out.stores.timber = this.timber;
    out.stores.powder = this.now < this.powderUntil ? 1 : 0;
    out.lull = this.phase === 'lull' ? Math.max(0, LULL_SECONDS - (this.now - this.phaseAt)) : 0;
    out.title = this.title;
    out.hint = this.hint;
    out.hintTurn = this.hintTurn;
    out.assist = this.assist;
    return out;
  }

  /** Raider poses for tests and the debug API. */
  raiders(): { name: string; x: number; z: number; heading: number; hull: number; state: string }[] {
    return this.combatants.slice(1).map((c) => ({
      name: c.name,
      x: c.ship.dynamics.pose.x,
      z: c.ship.dynamics.pose.z,
      heading: c.ship.dynamics.pose.heading,
      hull: c.hull,
      state: c.state,
    }));
  }

  /** Tests and screenshots: brings raider `i`'s hull down to `hull` (a hit still has to strike her). */
  debugHull(i: number, hull: number): void {
    const c = this.combatants[i + 1];
    if (c && c.state === 'afloat') c.hull = Math.max(1, Math.min(c.hull, hull));
  }

  /** Every ship (yours first) for draw-call accounting. */
  ships(): Brigantine[] {
    return this.combatants.map((c) => c.ship);
  }

  dispose(): void {
    for (let i = 1; i < this.combatants.length; i++) this.combatants[i]!.ship.dispose();
    this.fog.mesh.material.dispose();
    this.fog.release();
    this.smoke.release();
    this.group.traverse((o) => {
      const m = o as unknown as {
        isInstancedMesh?: boolean;
        geometry?: { dispose(): void };
        material?: { dispose(): void };
      };
      if (m.isInstancedMesh) {
        m.geometry?.dispose();
        m.material?.dispose();
      }
    });
  }
}

/** "Wrong Fork", "Wrong Fork and Unchecked", "A, B and C". */
function joinNames(raiders: readonly RaiderSpec[], n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += (i === 0 ? '' : i === n - 1 ? ' and ' : ', ') + raiders[i]!.name;
  return s;
}

/** The lookout's call for fog lying `rel` radians off your bow (positive to port). */
export function lookoutCall(rel: number): string {
  const a = Math.atan2(Math.sin(rel), Math.cos(rel));
  const off = Math.abs(a);
  if (off < 0.2) return LOOKOUT.ahead;
  if (off > Math.PI - 0.3) return LOOKOUT.astern;
  const row = a > 0 ? LOOKOUT.port : LOOKOUT.starboard;
  return row[off < 1.0 ? 0 : off < 2.2 ? 1 : 2];
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

/** 0 → 1 with one overshoot and settle, like a hull taking a list. */
function spring01(x: number): number {
  if (x <= 0) return 0;
  return 1 - Math.exp(-5 * x) * Math.cos(7 * x);
}

/**
 * The struck colours (0 flying … 1 at the deck): a small lift as the halyard is cast off, then down
 * hand over hand, slowing as it nears the deck.
 */
export function haulDown(age: number): number {
  if (age <= 0) return 0;
  if (age < 0.4) return -0.012 * Math.sin((age / 0.4) * Math.PI);
  const k = clamp01((age - 0.4) / 3);
  const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  const hands = Math.sin(k * Math.PI * 10) * 0.012 * (1 - k);
  return clamp01(eased + hands);
}

function readyShare(b: Battery): number {
  return b.loadedCount() / b.count;
}
