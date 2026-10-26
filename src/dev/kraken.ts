import { Vector3, type Object3D } from 'three/webgpu';
import { createAudio } from '../audio';
import { createPost } from '../engine/post';
import { compileProgressively, warmProgressively } from '../engine/warm';
import { BATTLE_SOUNDS, createBattleAudio } from '../game/battle-audio';
import { createOcean } from '../world/ocean/ocean';
import { createBrigantine, type Brigantine, type BrigantineEnv } from '../world/ship';
import { BRIGANTINE_HALF_LENGTH, halfBeamAt } from '../world/ship/lines';
import { skipSunShadows, skipSunShadowsWhereOff } from '../world/sky/cached-sun-shadow';
import { createSky } from '../world/sky/sky-system';
import { world } from '../world/uniforms';
import { wrapAngle } from '../util/math';
import type { HazardArea, HazardHit, HazardKind, KrakenHull, TellPlan } from '../world/kraken/hazards';
import type { Kraken } from '../world/kraken/kraken';
import { compileAndStart, createDevHarness, engineStats, seaOrbitControls } from './harness';

/**
 * Kraken prototype (devpages/kraken.html). Scenarios:
 * - `wreck`: a raider at rest; the kraken tells, rises beside her, coils round her hull and
 *   foremast, squeezes until she creaks and breaks, pulls her apart, and goes back under;
 * - `fight`: the same on the raiders' flagship under sail, with your ship sailing alongside;
 * - `dodge`: your ship on a course; a slam and a sweep tell, you turn away, they strike (near misses);
 *   then a raider chasing you sails straight over a tell on her course: the strike catches her and
 *   the kraken takes her (the quick wrap);
 * - `sightings`: distant sightings (ambient), from your deck.
 * Keys: Space play/pause, . step, R restart, M reduced motion, 1/2/3 Lite/Medium/High, B backend,
 * W/F/D the scenarios, S sightings, K a sighting now. Flags: ?webgl, ?tier=, ?rm, ?shot, ?wait,
 * ?time= (hour), ?scenario=wreck|fight|dodge|sightings, ?nomusic.
 */
type Scenario = 'wreck' | 'fight' | 'dodge' | 'surface' | 'sightings';
const SCENARIOS: readonly Scenario[] = ['wreck', 'fight', 'dodge', 'surface', 'sightings'];

const harness = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = harness;
const { scene, camera, clock } = engine;
clock.set(Number(q.get('time') ?? 16.4), Number(q.get('az') ?? 35));
world.reducedMotion.value = q.has('rm') ? 1 : 0;

const sky = createSky(renderer, scene, tier, backend);
const ocean = createOcean({ tier, env: sky.env });
scene.add(ocean.mesh);

const audio = createAudio();
const listener = { x: 0, y: 0, z: 0 };
const listenerFwd = { x: 0, y: 0, z: -1 };
const onSound = createBattleAudio(audio, listener);
let audioOn = false;
const unlock = () => {
  if (audioOn) return;
  audioOn = true;
  void audio.unlock().then(() => {
    void audio.sfx.preload(BATTLE_SOUNDS);
    if (!q.has('nomusic')) audio.music.setIsland('battle');
  });
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// Two ships: the raiders' flagship (the battle's raider model) and yours.
const flagship = createBrigantine({
  tier: tier.tier === 'ultra' || tier.tier === 'high' ? 'medium' : tier.tier,
  oceanInteraction: false,
  raider: true,
});
flagship.setName('Grey Gull');
const mine = createBrigantine({ tier: tier.tier });
mine.setName('Wanderer');
// A raider that chases you in the dodge (and is lured over a tell).
const raider = createBrigantine({
  tier: tier.tier === 'ultra' || tier.tier === 'high' ? 'medium' : tier.tier,
  oceanInteraction: false,
  raider: true,
});
raider.setName('Black Gannet');
scene.add(flagship.group, mine.group, raider.group);
// The raiders draw like the battle's: no sun-shadow shaders of their own.
if (tier.shadowCascades > 0) {
  skipSunShadows(flagship.group);
  skipSunShadows(raider.group);
}
await Promise.all([flagship.figurehead, mine.figurehead, raider.figurehead]);
const envOf = (): BrigantineEnv => ({ waves: ocean.field, ground: null, obstacles: [], t: 0 });
const flagEnv = envOf();
const myEnv = envOf();
const raiderEnv = envOf();

// The kraken loads with this page only (dynamic imports: never in the game's chunks).
const [{ KrakenEncounter }, { KrakenSightings }] = await Promise.all([
  import('../world/kraken/encounter'),
  import('../world/kraken/sightings'),
]);
const kraken = await KrakenEncounter.create({ tier, waves: ocean.field, onSound });
kraken.reducedMotion = q.has('rm');
kraken.prepare(flagship, 'flagship');
kraken.prepare(raider, 'raider');
/** The ships its strikes can hit (the battle fills these each frame): yours and the raiders. */
const hull = (id: string, catchable: boolean): KrakenHull => ({
  id,
  bowX: 0,
  bowZ: 0,
  sternX: 0,
  sternZ: 0,
  halfBeam: halfBeamAt(0, 1),
  catchable,
});
const hulls: Record<string, KrakenHull> = {
  mine: hull('mine', false),
  flagship: hull('flagship', true),
  raider: hull('raider', true),
};
const shipOf: Record<string, Brigantine> = { mine, flagship, raider };
const NAMES: Record<string, string> = { mine: 'Wanderer', flagship: 'Grey Gull', raider: 'Black Gannet' };
const hullList: KrakenHull[] = [];
scene.add(kraken.group);
const player = { x: 0, z: 0, heading: 0, speed: 0 };
const sightings = await KrakenSightings.create({
  tier,
  waves: ocean.field,
  seed: Number(q.get('seed') ?? 0x6b72),
  gates: { player },
  onSound: (kind, pos, gain) => audio.sfx.oneShot(kind === 'rise' ? 'big_splash' : 'splash', pos, gain * 1.5),
});
scene.add(sightings.group);

// The lookout's calls (placeholder words for the prototype; the battle takes its words from the course pack).
const caption = document.createElement('div');
caption.style.cssText =
  'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);padding:10px 18px;border-radius:10px;' +
  'background:rgb(7 20 30 / 70%);color:#fff;font:600 20px/1.3 ui-sans-serif,system-ui,sans-serif;' +
  'opacity:0;transition:opacity .4s';
document.body.append(caption);
let captionUntil = 0;
const say = (text: string, t: number) => {
  caption.textContent = text;
  caption.style.opacity = '1';
  captionUntil = t + 3.2;
};
const bearing = (x: number, z: number) => {
  const p = mine.dynamics.pose;
  const rel = wrapAngle(Math.atan2(x - p.x, z - p.z) - p.heading);
  const off = Math.abs(rel);
  // Heading grows to port (the ship's +x side): a positive bearing is on her port side.
  const side = rel > 0 ? 'port' : 'starboard';
  return off < 0.25
    ? 'dead ahead'
    : off > 2.6
      ? 'astern'
      : off < 1.1
        ? `off the ${side} bow`
        : `on the ${side} beam`;
};
/** The last strike's clearance (m) from your hull, and whether it hit. */
const lastStrike = { act: '', clearance: NaN, hit: false };
/** The dodge's helm: 0 on course, ±1 turned away (set at the call: from the telling event). */
let dodgeTurn = 0;
let dodgeAway = 0;
/** When the helm goes over (s into the scenario). */
let turnAt = Infinity;
/** The last hazard told (the dodge camera leans toward it). */
const hazardSeen = { x: 0, z: 0, w: 0 };
/** Every ship hit, in order (the HUD and the probes read it). */
const hitLog: { t: number; shipId: string; kind: string; strike: boolean; damage: number }[] = [];
/** The lure: when the tell on the raider's course was placed, and when the kraken caught her. */
const lure = { placedAt: NaN, caughtAt: NaN, heading: 0 };
kraken.on((e) => {
  const t = clock.sim;
  if (e.type === 'telling' && e.act !== 'retreat')
    say(
      e.act === 'rise' || e.act === 'wrap'
        ? `Bubbles and a great shadow ${bearing(e.x, e.z)}! Something big below!`
        : `Bubbles and a shadow ${bearing(e.x, e.z)}! Hard over!`,
      t,
    );
  // Your helmsman reads the evidence and turns away at the call.
  if (
    e.type === 'telling' &&
    (e.act === 'slam' || e.act === 'sweep') &&
    scenario === 'dodge' &&
    Number.isNaN(lure.placedAt)
  ) {
    // The helm goes over as the evidence builds, about when the arm breaks the water.
    turnAt = st + HAZARD_SPECS[e.act].tell * 0.9;
    hazardSeen.x = e.x;
    hazardSeen.z = e.z;
    hazardSeen.w = 1;
  }
  if (e.type === 'striking' && (e.act === 'slam' || e.act === 'sweep')) {
    lastStrike.act = e.act;
    lastStrike.clearance = Infinity;
    lastStrike.hit = false;
  }
  if (e.type === 'striking' && e.act === 'wrap' && kraken.phase() === 'grip' && scenario !== 'dodge')
    say('It has the Grey Gull!', t);
  if (e.type === 'struck')
    for (const h of e.hits as readonly HazardHit[])
      hitLog.push({ t: st, shipId: h.shipId, kind: h.kind, strike: h.strike, damage: h.damage });
  if (e.type === 'caught') {
    lure.caughtAt = st;
    say(`It has the ${NAMES[e.shipId] ?? 'raider'}! It's taking her down!`, t);
  }
});

const controls = seaOrbitControls(camera, canvas);
controls.maxDistance = 500;
controls.minDistance = 4;
let director = true;
controls.addEventListener('start', () => (director = false));

/**
 * Scripted shots by the kraken's phase: from (start) and to (end) camera places and a target, from the
 * wreck (its +x is the kraken's side). The camera holds each beat and pushes in slowly across it.
 */
const SHOTS: Record<string, readonly [number[], number[], number[]]> = {
  none: [
    [-34, 9, 30],
    [-33, 9, 29],
    [6, 4, 0],
  ],
  tell: [
    [-10, 26, 32],
    [-7, 23, 28],
    [10, 0, -1],
  ],
  tips: [
    [-26, 8, 30],
    [-23, 7, 26],
    [5, 2, 0],
  ],
  rise: [
    [-30, 10, 34],
    [-26, 10, 30],
    [3, 6, 0],
  ],
  arc: [
    [-30, 12, 32],
    [-17, 10, 22],
    [0, 12, 8],
  ],
  hang: [
    [-17, 10, 22],
    [-14, 9, 19],
    [0, 13, 8],
  ],
  grip: [
    [-22, 11, 25],
    [-18, 9, 21],
    [2, 5, 1],
  ],
  squeeze: [
    [-17, 8, 19],
    [-13, 6, 15],
    [2, 3, 0],
  ],
  break: [
    [-30, 12, 27],
    [-28, 11, 25],
    [3, 3, 0],
  ],
  under: [
    [-34, 10, 24],
    [-32, 8, 20],
    [5, 1, 0],
  ],
  withdraw: [
    [-32, 9, 27],
    [-30, 8, 25],
    [8, 2, 0],
  ],
  finale: [
    [-16, 6, 15],
    [-8, 4.5, 8],
    [15, 3.5, -1.5],
  ],
  retreat: [
    [-30, 9, 30],
    [-29, 9, 29],
    [12, 3, 0],
  ],
  surfaced: [
    [-30, 9, 30],
    [-29, 9, 29],
    [12, 3, 0],
  ],
};

let scenario: Scenario = (SCENARIOS as readonly string[]).includes(q.get('scenario') ?? '')
  ? (q.get('scenario') as Scenario)
  : 'wreck';
/** Seconds into the scenario. */
let st = 0;
const fired = new Set<string>();
const once = (key: string, at: number) => st >= at && !fired.has(key) && !!fired.add(key);
const deck = { yaw: Math.PI / 2, pitch: 0.02 };
/** The camera on your deck whatever the scenario (dev shots). */
let deckCam = false;
const camGoal = new Vector3();
const lookGoal = new Vector3();
const at = new Vector3();
const camFocus = new Vector3();
const lookDir = new Vector3();
const bow = new Float32Array(2);
const stern = new Float32Array(2);
let snapCamera = true;

/** Steers `ship` toward `heading` (a simple helm for the scenarios). */
function steer(ship: Brigantine, heading: number, trim: number): void {
  const err = wrapAngle(heading - ship.dynamics.pose.heading);
  ship.dynamics.setInput({
    trim,
    rudder: Math.max(-1, Math.min(1, err * 2.4 - ship.dynamics.headingRate * 1.2)),
  });
}

function setup(): void {
  st = 0;
  fired.clear();
  dodgeTurn = 0;
  turnAt = Infinity;
  deckCam = false;
  hazardSeen.w = 0;
  lastStrike.act = '';
  hitLog.length = 0;
  lure.placedAt = lure.caughtAt = NaN;
  kraken.reset();
  sightings.clear();
  director = true;
  snapCamera = true;
  caption.style.opacity = '0';
  mine.group.visible = scenario !== 'wreck';
  flagship.group.visible = scenario === 'wreck' || scenario === 'fight';
  raider.group.visible = scenario === 'dodge';
  // The ships the kraken's strikes can hit in this scenario.
  hullList.length = 0;
  if (mine.group.visible) hullList.push(hulls.mine!);
  if (flagship.group.visible) hullList.push(hulls.flagship!);
  if (raider.group.visible) hullList.push(hulls.raider!);
  kraken.setHulls(hullList);
  if (scenario === 'wreck') flagship.restartMotion(0, 0, 0);
  if (scenario === 'fight') {
    // Yours sails abeam of the flagship, on the far side from where the kraken rises, a little astern.
    const h = 0.9;
    flagship.restartMotion(0, 0, h);
    mine.restartMotion(-38 * Math.cos(h) - 22 * Math.sin(h), 38 * Math.sin(h) - 22 * Math.cos(h), h);
  }
  if (scenario === 'dodge') {
    mine.restartMotion(0, 0, COURSE);
    // Astern of you and off your port quarter, chasing.
    const s = Math.sin(COURSE);
    const c = Math.cos(COURSE);
    raider.restartMotion(-s * 70 + c * 34, -c * 70 - s * 34, COURSE);
  }
  if (scenario === 'sightings' || scenario === 'surface') mine.restartMotion(0, 0, 0);
}

/** One step of the scenario: its script, the ships, the kraken. */
function advance(dt: number, t: number): void {
  st += dt;
  if (scenario === 'wreck') {
    if (once('wrap', 1)) kraken.wrapAndBreak(flagship, { finale: true });
    flagship.dynamics.setInput({ trim: 0, rudder: 0 });
  } else if (scenario === 'fight') {
    // Both under sail on a broad reach; the kraken takes the flagship mid-fight.
    // She sails on until its arms close on her (from then the kraken holds her).
    if (st < 3 + kraken.beats.grip - 2) steer(flagship, 0.9, 0.7);
    steer(mine, 0.9, st > 14 ? 0.3 : 0.6);
    if (once('wrap', 3)) kraken.wrapAndBreak(flagship);
  } else if (scenario === 'dodge') {
    // On course; at the lookout's call, hard over away from the evidence, then back on course.
    if (st >= turnAt) {
      dodgeTurn = dodgeAway;
      turnAt = Infinity;
    }
    steer(mine, COURSE + dodgeTurn * 0.8, 0.8);
    if (once('slam', 2)) placeHazard('slam', 1);
    if (once('calm', 12)) dodgeTurn = 0;
    if (once('sweep', 14)) placeHazard('sweep', -1);
    if (once('calm2', 24)) dodgeTurn = 0;
    if (q.has('nododge')) dodgeTurn = 0;
    // The raider chases you (toward where you'll be) until the tell on her course: she doesn't
    // read the evidence, and sails straight on into it.
    const p = mine.dynamics.pose;
    const r = raider.dynamics.pose;
    // She closes on a line abeam of yours (34 m off), so her course isn't your wake.
    const ax = Math.cos(p.heading) * 34;
    const az = -Math.sin(p.heading) * 34;
    if (Number.isNaN(lure.placedAt))
      lure.heading = Math.atan2(
        p.x + Math.sin(p.heading) * 40 + ax - r.x,
        p.z + Math.cos(p.heading) * 40 + az - r.z,
      );
    if (Number.isNaN(lure.caughtAt)) steer(raider, lure.heading, 0.95);
    if (once('lure', LURE_AT)) {
      lure.placedAt = st;
      lure.heading = r.heading;
      kraken.planTell(tellPlan, r, 'slam', 'intercept');
      kraken.hazardAt(tellPlan);
      hazardSeen.x = tellPlan.x;
      hazardSeen.z = tellPlan.z;
      say(`Bubbles and a shadow on the ${NAMES.raider}'s course! Lead her over it!`, t);
    }
    if (once('leave', LURE_AT + 24)) kraken.retreat();
  } else if (scenario === 'surface') {
    // The kraken surfaces off your starboard side (the battle's `rise`), then goes back under.
    if (once('rise', 1)) kraken.rise(40, 12, -Math.PI / 2);
    if (once('leave', 26)) kraken.retreat();
  }
  if (scenario !== 'wreck' && dt > 0) mine.update(dt, t, myEnv);
  if (scenario === 'dodge' && dt > 0) raider.update(dt, t, raiderEnv);
  // Each ship's hull where the kraken's strikes test it.
  for (const h of hullList) {
    const ship = shipOf[h.id]!;
    ship.bowWorld(bow);
    ship.sternWorld(stern);
    h.bowX = bow[0]!;
    h.bowZ = bow[1]!;
    h.sternX = stern[0]!;
    h.sternZ = stern[1]!;
  }
  if ((scenario === 'wreck' || scenario === 'fight') && dt > 0) flagship.update(dt, t, flagEnv);
  myEnv.t = flagEnv.t = raiderEnv.t = t;
  kraken.update(dt, t, camera);
  // Your hull against the hazards' danger areas (until the lure: then the camera's on the raider).
  if (scenario === 'dodge' && lastStrike.act && Number.isNaN(lure.placedAt)) {
    mine.bowWorld(bow);
    mine.sternWorld(stern);
    const beam = halfBeamAt(0, 1);
    if (kraken.hitsHull(bow[0]!, bow[1]!, stern[0]!, stern[1]!, beam)) lastStrike.hit = true;
    for (const d of kraken.dangers(dangers)) {
      const c = clearance(d, bow, stern, beam);
      lastStrike.clearance = Math.min(lastStrike.clearance, c);
    }
  }
  const pose = mine.dynamics.pose;
  player.x = pose.x;
  player.z = pose.z;
  player.heading = pose.heading;
  player.speed = pose.speed;
  if (scenario === 'sightings') sightings.update(dt, t, camera, renderer.domElement.height);
}
const COURSE = 0.9;
/** When the tell goes down on the raider's course (s into the dodge). */
const LURE_AT = 24;
const tellPlan = { x: 0, z: 0, heading: 0, kind: 'slam', radius: 0, tell: 0, eta: 0 } as TellPlan;
/**
 * A hazard where your ship would be when it strikes, just inside its danger area on her present
 * course (`side` +1 to starboard of it): held on, she'd be hit; turning away at the call, she clears
 * it by a little (a near miss).
 */
function placeHazard(kind: HazardKind, side: number): void {
  const p = mine.dynamics.pose;
  const spec = HAZARD_SPECS[kind];
  const v = Math.max(1.5, p.speed);
  const ahead = v * hazardImpactAt(spec) + (kind === 'sweep' ? 6 : 2);
  // Just inside the area on her course; the sweep's arc edge needs a little less.
  const off = side * (spec.radius + halfBeamAt(0, 1) - 1.6);
  const s = Math.sin(p.heading);
  const c = Math.cos(p.heading);
  const x = p.x + s * ahead + c * off;
  const z = p.z + c * ahead - s * off;
  // It strikes toward her course: a slam lands across it, a sweep's arc faces it.
  dodgeAway = side > 0 ? -1 : 1;
  kraken.hazard(x, z, kind, Math.atan2(p.x + s * ahead - x, p.z + c * ahead - z));
}
const dangers: HazardArea[] = [];
const { HAZARD_SPECS, hazardClearance, hazardImpactAt } = await import('../world/kraken/hazards');
const { ease } = await import('../world/kraken/arm-paths');
const clearance = (d: HazardArea, b: Float32Array, s: Float32Array, beam: number) =>
  hazardClearance(d, b[0]!, b[1]!, s[0]!, s[1]!, beam);

function frameCamera(dt: number): void {
  if (!director) return;
  const k = snapCamera ? 1 : 1 - Math.exp(-dt * 0.9);
  snapCamera = false;
  if (deckCam) {
    // Falls through to the deck camera below.
  } else if (scenario === 'wreck') {
    const [a, z, l] = SHOTS[kraken.phase()] ?? SHOTS.none!;
    const u = ease(kraken.phaseProgress());
    kraken.wreckPosition(at);
    if (kraken.phase() === 'none') at.copy(flagship.group.position).setY(0);
    camGoal.set(
      at.x + a[0]! + (z[0]! - a[0]!) * u,
      a[1]! + (z[1]! - a[1]!) * u,
      at.z + a[2]! + (z[2]! - a[2]!) * u,
    );
    lookGoal.set(at.x + l[0]!, l[1]!, at.z + l[2]!);
  } else if (scenario === 'surface') {
    // Off your ship's side, looking at the kraken as it surfaces with its arms round it.
    kraken.bodyPosition(at);
    camGoal.set(at.x - 46, 9, at.z + 18);
    lookGoal.set(at.x, 4, at.z);
  } else if (scenario === 'fight') {
    // From beyond your ship, high, looking past her at the flagship: what you'd see in the fight.
    kraken.wreckPosition(at);
    if (kraken.phase() === 'none') at.copy(flagship.group.position).setY(0);
    // Off your ship's quarter, so she's in the corner of the frame and her rigging isn't in the way.
    const m = mine.group.position;
    const dx = at.x - m.x;
    const dz = at.z - m.z;
    const d = Math.hypot(dx, dz) || 1;
    camGoal.set(m.x - (dx / d) * 26 + (dz / d) * 24, 17, m.z - (dz / d) * 26 - (dx / d) * 24);
    lookGoal.set(at.x, 4, at.z);
  } else if (scenario === 'dodge' && !Number.isNaN(lure.placedAt)) {
    // The lure: from her far side, high, looking across her at the tell on her course (your ship off
    // to one side, beyond), then at her wreck.
    if (Number.isNaN(lure.caughtAt))
      at.set((raider.group.position.x + hazardSeen.x) / 2, 0, (raider.group.position.z + hazardSeen.z) / 2);
    else kraken.wreckPosition(at);
    const m = mine.group.position;
    const dx = at.x - m.x;
    const dz = at.z - m.z;
    const d = Math.hypot(dx, dz) || 1;
    const close = Math.min(1, (st - lure.placedAt) / 8);
    // Away from your ship and round to her side.
    const far = 46 - 12 * close;
    camGoal.set(
      at.x + (dx / d) * far * 0.6 - (dz / d) * far,
      20 - 5 * close,
      at.z + (dz / d) * far * 0.6 + (dx / d) * far,
    );
    lookGoal.set(at.x, 3, at.z);
  } else if (scenario === 'dodge') {
    // Astern and above your ship, looking ahead along her course.
    const g = mine.group;
    camGoal.set(-18, 34, -34).applyMatrix4(g.matrixWorld);
    camGoal.y = 34;
    lookGoal.set(4, 0, 30).applyMatrix4(g.matrixWorld);
    // Toward the evidence while a hazard's up, so its ring and strike are in the frame.
    if (hazardSeen.w > 0) lookGoal.lerp(at.set(hazardSeen.x, 0, hazardSeen.z), 0.45 * hazardSeen.w);
    lookGoal.y = 0;
  } else {
    // On your quarterdeck, looking out to sea over the rail.
    const g = mine.group;
    camGoal.set(2.9, 5.6, -9.2).applyMatrix4(g.matrixWorld);
    const h = mine.dynamics.pose.heading + deck.yaw;
    lookGoal.set(
      camGoal.x + Math.sin(h) * 100,
      camGoal.y + Math.tan(deck.pitch) * 100,
      camGoal.z + Math.cos(h) * 100,
    );
    camera.position.copy(camGoal);
    controls.target.copy(lookGoal);
    return;
  }
  camera.position.lerp(camGoal, k);
  controls.target.lerp(lookGoal, k);
}

let playing = !q.has('wait');
let stepOnce = 0;
let ready = false;
let hudAt = 0;
const hud = document.getElementById('hud')!;

engine.add({
  frame(dt, t) {
    const run = ready && (playing || stepOnce > 0);
    const step = run ? (stepOnce > 0 ? stepOnce : dt) : 0;
    if (stepOnce > 0) clock.sim += stepOnce;
    stepOnce = 0;
    if (scenario === 'dodge' || scenario === 'fight') {
      const p = mine.dynamics.pose;
      ocean.field.setFocus(p.x, p.z);
    } else ocean.field.setFocus(0, 0);
    advance(step, t);
    frameCamera(dt);
    controls.update();
    if (kraken.shake > 0) {
      const s = kraken.shake;
      camera.position.x += Math.sin(t * 61) * s * 0.4;
      camera.position.y += Math.sin(t * 47 + 1) * s * 0.3;
    }
    ocean.update(camera);
    listener.x = camera.position.x;
    listener.y = camera.position.y;
    listener.z = camera.position.z;
    camera.getWorldDirection(lookDir);
    listenerFwd.x = lookDir.x;
    listenerFwd.y = lookDir.y;
    listenerFwd.z = lookDir.z;
    audio.sfx.setListener(listener, listenerFwd);
    audio.update(dt);
    camFocus.set(camera.position.x, 0, camera.position.z);
    sky.update(clock, camFocus, dt, camera);
    if (t > captionUntil && caption.style.opacity !== '0') caption.style.opacity = '0';
    if (t - hudAt > 0.15) {
      hudAt = t;
      const [a, b] = engineStats(harness);
      const c = sightings.current;
      let line = `${scenario} · ${st.toFixed(1)} s · ${kraken.phase()}`;
      if (scenario === 'sightings')
        line = `sightings · ${c ? `${c.kind} ×${c.arms} at ${Math.round(Math.hypot(c.x - camera.position.x, c.z - camera.position.z))} m` : `next in ${Math.max(0, sightings.planner.nextAt - t).toFixed(0)} s`}`;
      if (scenario === 'dodge' && lastStrike.act)
        line += `\n${lastStrike.act}: ${lastStrike.hit ? 'HIT' : 'miss'}, clearance ${Number.isFinite(lastStrike.clearance) ? lastStrike.clearance.toFixed(1) : '–'} m`;
      const last = hitLog[hitLog.length - 1];
      if (last)
        line += `\nstruck: ${last.shipId} −${last.damage} (${last.kind}${last.strike ? '' : ', standing arm'})`;
      if (!Number.isNaN(lure.caughtAt)) line += ` · caught: ${NAMES.raider}`;
      hud.textContent = `${a}\n${b}\n${line}${kraken.reducedMotion ? ' · reduced motion' : ''}${playing ? '' : ' · paused'}`;
    }
  },
});

const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;
await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);

/**
 * Warms what shows later (the kraken under the water, the flagship's pieces, splinters, splashes,
 * marks and sightings) like the game's late warm: pipelines for the scene pass first, then one real
 * draw of each, so nothing builds a shader or uploads mid-scene (the hitch guard stays empty).
 */
async function warm(): Promise<void> {
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const roots: Object3D[] = [kraken.group, sightings.group];
  const undo = [kraken.stageWarm(), sightings.stageWarm()];
  for (const r of roots) if (sky.sun.castShadow) skipSunShadowsWhereOff(r);
  try {
    const compile = (obj: Object3D) =>
      post ? post.compileObject(obj) : renderer.compileAsync(obj, camera, scene);
    for (const r of roots) await compileProgressively(r, compile, nextFrame, 3);
    const endShadowWarm = sky.shadowWarm(roots);
    try {
      await warmProgressively(roots, nextFrame, {
        targetMs: 3,
        startBatch: 2,
        frameCost: () => engine.cpuMs,
        solo: (obj) => !!(obj as { isInstancedMesh?: boolean }).isInstancedMesh,
      });
    } finally {
      endShadowWarm();
    }
  } finally {
    for (const u of undo) u();
  }
}
// Both ships are drawn before the warm too (one shows only in some scenarios).
mine.group.visible = flagship.group.visible = raider.group.visible = true;
// The page's own first frames (sky, sea, ships, post) are its warm-up too.
await engine.counters.excuse(new Promise((r) => setTimeout(r, 500)));
/** Shader programs before the kraken's warm: the page without it (sky, sea, ships, post). */
const programsBefore = engine.counters.last.programs;
await engine.counters.excuse(warm());
await new Promise((r) => setTimeout(r, 200));
ready = true;

// ---- Controls ---------------------------------------------------------------------------------
const playBtn = document.getElementById('play') as HTMLButtonElement;
const rmBtn = document.getElementById('rm') as HTMLButtonElement;
const setPlaying = (on: boolean) => {
  playing = on;
  // Paused, the whole sea holds still (stills and stepping).
  clock.paused = !on;
  playBtn.textContent = on ? 'Pause' : 'Play';
};
const scenarioButtons = document.querySelectorAll<HTMLButtonElement>('[data-scenario]');
const restart = (next: Scenario = scenario) => {
  scenario = next;
  scenarioButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scenario === scenario)));
  setup();
  setPlaying(true);
};
const setReduced = (on: boolean) => {
  kraken.reducedMotion = on;
  world.reducedMotion.value = on ? 1 : 0;
  rmBtn.setAttribute('aria-pressed', String(on));
  restart();
};
rmBtn.setAttribute('aria-pressed', String(kraken.reducedMotion));
const reload = (key: string, value: string | null) => {
  const u = new URL(location.href);
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  u.searchParams.set('scenario', scenario);
  location.href = u.toString();
};
playBtn.onclick = () => setPlaying(!playing);
const step = () => {
  setPlaying(false);
  stepOnce = 1 / 30;
};
(document.getElementById('step') as HTMLButtonElement).onclick = step;
(document.getElementById('restart') as HTMLButtonElement).onclick = () => restart();
rmBtn.onclick = () => setReduced(!kraken.reducedMotion);
scenarioButtons.forEach((b) => (b.onclick = () => restart(b.dataset.scenario as Scenario)));
document.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.tier === tier.tier));
  b.onclick = () => reload('tier', b.dataset.tier!);
});
const backendBtn = document.getElementById('backend') as HTMLButtonElement;
backendBtn.textContent = backend === 'webgpu' ? 'WebGL2' : 'WebGPU';
backendBtn.onclick = () => reload('webgl', backend === 'webgpu' ? '' : null);
const KINDS = ['tip', 'group', 'arc'] as const;
let kindAt = 0;
const sight = (kind?: (typeof KINDS)[number], distance?: number) => {
  if (scenario !== 'sightings') restart('sightings');
  // The deck camera first: a sighting is placed in the camera's view.
  snapCamera = true;
  frameCamera(1);
  camera.updateMatrixWorld();
  sightings.force(kind ?? (tier.tier === 'lite' ? 'tip' : KINDS[kindAt++ % KINDS.length]), distance);
};
(document.getElementById('sight') as HTMLButtonElement).onclick = () => sight();
const KEYS: Record<string, () => void> = {
  Space: () => setPlaying(!playing),
  Period: step,
  KeyR: () => restart(),
  KeyM: () => setReduced(!kraken.reducedMotion),
  Digit1: () => reload('tier', 'lite'),
  Digit2: () => reload('tier', 'medium'),
  Digit3: () => reload('tier', 'high'),
  KeyB: () => backendBtn.click(),
  KeyW: () => restart('wreck'),
  KeyU: () => restart('surface'),
  KeyF: () => restart('fight'),
  KeyD: () => restart('dodge'),
  KeyS: () => restart('sightings'),
  KeyK: () => sight(),
};
addEventListener('keydown', (e) => {
  if (!e.repeat) KEYS[e.code]?.();
});
restart(scenario);
if (q.has('wait')) setPlaying(false);

/**
 * How bent each arm over the water is (a probe for "no spikes"): the most a joint stands off the line
 * from where the arm leaves the water to its tip, as a share of that part's length. Arms with less
 * than its two tip bones over the water are left out (one bone can't bend).
 */
const _j = new Vector3();
const bendsOf = (k: Kraken, who: string) => {
  const out: { who: string; arm: number; bend: number; shown: number }[] = [];
  if (!k.group.visible) return out;
  for (const arm of k.arms) {
    if (!arm.root.visible) continue;
    const pts: number[] = [];
    for (const b of arm.poser.bones) {
      b.getWorldPosition(_j);
      pts.push(_j.x, _j.y, _j.z);
    }
    // The tip: the last bone's end joint.
    const n = pts.length / 3;
    const L = arm.poser.lengths;
    arm.root.getObjectByName('Tentacle15_end')!.getWorldPosition(_j);
    pts.push(_j.x, _j.y, _j.z);
    const m = n + 1;
    const sea = (i: number) => ocean.field.heightAt(pts[i * 3]!, pts[i * 3 + 2]!, clock.sim);
    let first = -1;
    // Where it first leaves the water (a hooked tip may dip back in and out again).
    for (let i = 1; i < m && first < 0; i++)
      if (pts[i * 3 + 1]! > sea(i) && pts[(i - 1) * 3 + 1]! <= sea(i - 1)) first = i;
    if (first < 0) continue;
    const y0 = pts[(first - 1) * 3 + 1]! - sea(first - 1);
    const y1 = pts[first * 3 + 1]! - sea(first);
    const c = -y0 / (y1 - y0);
    const a = [0, 1, 2].map(
      (q) => pts[(first - 1) * 3 + q]! + (pts[first * 3 + q]! - pts[(first - 1) * 3 + q]!) * c,
    );
    const e = [0, 1, 2].map((q) => pts[(m - 1) * 3 + q]! - a[q]!);
    const ll = e[0]! ** 2 + e[1]! ** 2 + e[2]! ** 2;
    let worst = 0;
    let len = 0;
    let px = a[0]!,
      py = a[1]!,
      pz = a[2]!;
    for (let i = first; i < m; i++) {
      const x = pts[i * 3]!,
        y = pts[i * 3 + 1]!,
        z = pts[i * 3 + 2]!;
      len += Math.hypot(x - px, y - py, z - pz);
      px = x;
      py = y;
      pz = z;
      const v = [x - a[0]!, y - a[1]!, z - a[2]!];
      const u = ll > 0 ? Math.min(1, Math.max(0, (v[0]! * e[0]! + v[1]! * e[1]! + v[2]! * e[2]!) / ll)) : 0;
      worst = Math.max(worst, Math.hypot(v[0]! - e[0]! * u, v[1]! - e[1]! * u, v[2]! - e[2]! * u));
    }
    if (len < L[n - 1]! + L[n - 2]!) continue;
    out.push({ who, arm: arm.index, bend: worst / len, shown: len });
  }
  return out;
};
const bends = () => [
  ...bendsOf(kraken.kraken, 'wrap'),
  ...bendsOf(kraken.hazards.kraken, 'hazard'),
  ...bendsOf(sightings.kraken, 'sighting'),
];

const dev = window as unknown as Record<string, unknown>;
const stats = () => ({
  ...engine.counters.last,
  fps: engine.fps,
  backend,
  tier: tier.tier,
  scenario,
  phase: kraken.phase(),
  time: st,
  strike: { ...lastStrike },
  hits: hitLog.slice(),
  dodge: { turn: dodgeTurn, away: dodgeAway, at: turnAt, heading: mine.dynamics.pose.heading },
  lure: { ...lure },
  speed: mine.dynamics.pose.speed,
  sighting: sightings.current ? { ...sightings.current } : null,
  programsBefore,
});
dev.__kraken = {
  ready: true,
  kraken,
  sightings,
  ships: { flagship, mine, raider },
  stats,
  play: () => setPlaying(true),
  pause: () => setPlaying(false),
  restart: (s?: Scenario) => restart(s),
  reduced: setReduced,
  /** Restarts `s` and runs it to `time` (s) in 1/30 s steps without drawing, then pauses there. */
  seek: (time: number, s: Scenario = scenario) => {
    restart(s);
    setPlaying(false);
    while (st < time) {
      clock.sim += 1 / 30;
      advance(1 / 30, clock.sim);
    }
    snapCamera = true;
    director = true;
  },
  director: (on: boolean) => (director = on),
  /** Runs the scenario on by `seconds` in 1/30 s steps without drawing (paused after). */
  run: (seconds: number) => {
    setPlaying(false);
    const end = st + seconds;
    while (st < end) {
      clock.sim += 1 / 30;
      advance(1 / 30, clock.sim);
    }
    snapCamera = true;
  },
  setCam: (p: number[], target: number[]) => {
    director = false;
    camera.position.set(p[0]!, p[1]!, p[2]!);
    controls.target.set(target[0]!, target[1]!, target[2]!);
    controls.update();
  },
  /** A sighting now: `kind` tip, group or arc, at `distance` m (the planner's rules still apply). */
  sight,
  /** The deck camera's look: `yaw` from the bow (radians), `pitch` up. */
  /** Your deck's camera in any scenario, looking `yaw` from the bow. */
  deckView: (yaw: number, pitch = 0.02) => {
    deck.yaw = yaw;
    deck.pitch = pitch;
    deckCam = true;
    director = true;
    snapCamera = true;
  },
  deckLook: (yaw: number, pitch = 0.02) => {
    deck.yaw = yaw;
    deck.pitch = pitch;
    director = true;
  },
  hitches: () => engine.counters.hitches.slice(),
  bends,
  unlockAudio: unlock,
  halfLength: BRIGANTINE_HALF_LENGTH,
};
dev.__isles = {
  hitches: () => engine.counters.hitches.slice(),
  stalls: () => engine.counters.stalls.slice(),
};
dev.__dev = { ready: true, stats };
