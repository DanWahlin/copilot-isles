import type { Group } from 'three/webgpu';
import { buildSlice } from '../engine/build-slice';
import type { Character } from '../world/characters';
import type { CircleObstacle } from '../world/contracts';
import { MERIDIAN } from '../world/islands/meridian';
import type { MeridianStream } from '../world/islands/meridian-stream';
import { MARKET_LAYOUT } from '../world/meridian-town/model-market';
import type { MeridianTownSystem } from '../world/meridian-town';
import { MERIDIAN_YARD } from '../world/sites/crate-yard-logic';
import { createCrateYardSite } from '../world/sites/crate-yard';
import { createHelmBuoys } from '../world/sites/helm-buoys';
import { createRecordsAlcoves } from '../world/sites/records-alcoves';
import { loadVillageKit } from '../world/village/kit';
import { puzzleOn, puzzleQuest, puzzleSteps, textOf } from '../course/puzzles';
import type { BoxCollider } from './collision';
import { MERIDIAN_CHESTS } from './cove-quests';
import type { CameraShot } from './follow-camera';
import type { IslandContent, IslandContentHost, IslandSetup } from './island-code';
import { MERIDIAN_NPCS, meridianExtras } from './meridian-npcs';
import { meridianNpcScript } from './meridian-quests';
import { NpcCrowd, type Npc } from './npcs';
import { createCrateYard } from './puzzles/crate-yard';
import { ALCOVES, LETTERS, lettersContent } from './puzzles/hall-letters';
import { createLostLetters, LETTERS_ID, type LettersHost } from './puzzles/lost-letters';
import { createThreeHelms, type HelmsHost } from './puzzles/three-helms';
import type { Puzzle } from './puzzles/types';
import { storyHolds } from './story';

/** Within this distance (m) of the berth (from the camera) the cast lives: their idle life runs only then. */
const NEAR = 700;

type LiftCam = { x: number; y: number; z: number; blocked: number };
const NO_CAST: readonly Npc[] = [];

/**
 * Port Meridian's content in the play session (Chapter 01): the cast at the town's anchors and
 * Lyra's chest, the lift up the citadel bluff, P1.1 The Crate Yard, P1.3 The Lost Letters and P1.2
 * The Three Helms (with Rhea aboard), Mina's tour and the Seal's lighthouse. It comes in with the
 * town (`setup`) and goes with it (`teardown`); what the player has done lives in the save.
 */
export function createMeridianContent(host: IslandContentHost): IslandContent {
  const { world, interactions, puzzles, cues } = host;
  const stream = host.stream as MeridianStream;
  const town = (): MeridianTownSystem | null => stream.world as MeridianTownSystem | null;
  const quests = () => host.puzzleHost.quests();
  const castIds = new Set(MERIDIAN_NPCS.map((m) => m.id));
  let crowd: NpcCrowd | null = null;
  /** The town's colliders and camera blockers while it's in (taken out when it's freed). */
  const townColliders: (CircleObstacle | BoxCollider)[] = [];
  const addTownColliders = (t: MeridianTownSystem) => {
    if (host.disposed() || townColliders.length) return;
    for (const c of t.colliders.circles) world.addCircle(c);
    for (const b of t.colliders.boxes) world.addBox(b);
    for (const b of t.cameraBlockers) world.addCameraBox(b);
    for (const b of stream.rockCameraBlockers) world.addCameraBox(b);
    townColliders.push(
      ...t.colliders.circles,
      ...t.colliders.boxes,
      ...t.cameraBlockers,
      ...stream.rockCameraBlockers,
    );
  };
  const sites: { update(dt: number, t: number): void; dispose(): void; group: Group }[] = [];
  /** Whether the ship's mooring lines run to her (she's tied up at the east arm). */
  let mooredShown = false;

  // P1.3 The Lost Letters: an overlay at Pell's desk, with the camera on the record cabinets.
  const lettersHost: LettersHost = {
    ...host.puzzleHost,
    frame: (shot) => host.frame(shot),
    cut: (shot) => host.cut(shot),
    setModal: host.setModal,
    reducedMotion: host.reducedMotion,
    place: host.placePlayer,
  };
  // P1.2 The Three Helms: the crew takes the wheel for each mode, and Rhea comes aboard to teach it.
  const helmsHost: HelmsHost = {
    ...host.puzzleHost,
    ...host.sea,
    say: (ids) => host.say(ids),
    frame: (shot) => host.frame(shot),
  };
  let rheaAboard: Character | null = null;
  /**
   * Rhea's figure by the wheel, made once: with the cast when the town streams in (so its warm builds
   * her, not the moment you board for the Helms), or at the latest when she comes aboard.
   */
  const makeRheaAboard = (): Character => {
    if (rheaAboard) return rheaAboard;
    rheaAboard = host.characters.create({ body: 'rhea', tier: host.tier });
    const a = host.ship.anchors.helm;
    // Forward of the wheel on the starboard side, turned to face the captain.
    rheaAboard.group.position.set(a.x + 1.35, a.y - 0.18, a.z + 1.2);
    rheaAboard.group.rotation.y = Math.atan2(-1.35, -1.2);
    rheaAboard.play('idle');
    return rheaAboard;
  };
  let rheaIsAboard = false;
  /** Rhea stands by the wheel for the Three Helms (and steps back onto the arm when you land). */
  const setRheaAboard = (on: boolean) => {
    rheaIsAboard = on;
    if (on) makeRheaAboard();
    if (rheaAboard) {
      if (on) host.ship.group.add(rheaAboard.group);
      else rheaAboard.group.removeFromParent();
    }
    const onArm = crowd?.list.find((n) => n.spec.id === 'rhea');
    if (onArm) onArm.character.group.visible = !on;
  };

  // ---- The lift, from the top of the east arm to the citadel bluff ----
  /** Where the lift car is: 0 at the east arm, 1 on the citadel bluff. */
  let liftAt = 0;
  let liftRide: {
    from: number;
    to: number;
    t: number;
    call: number;
    /** Which side the camera rides on (unit, horizontal), picked for a clear view the whole way. */
    cam: LiftCam | null;
  } | null = null;
  const liftShot: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  const liftCarAt = (k: number, out: { x: number; y: number; z: number }) => {
    const a = town()?.anchors;
    const b = a?.liftBottom,
      tp = a?.liftTop;
    if (!b || !tp) return out;
    const e = k * k * (3 - 2 * k);
    out.x = b.tx! + (tp.tx! - b.tx!) * e;
    out.y = b.ty! - 1.4 + (tp.ty! - 1.4 - (b.ty! - 1.4)) * e;
    out.z = b.tz! + (tp.tz! - b.tz!) * e;
    return out;
  };
  const liftPos = { x: 0, y: 0, z: 0 };
  /**
   * The lift ride's camera: one fixed spot out on the harbour side, looking up the notch in the bluff
   * at the car as it climbs, with the citadel above. Picked at the start of each ride from spots
   * along the notch's axis (and a little to either side) for the clearest line to the car over the
   * whole ride; `blocked` is how many of its 21 samples aren't clear (tests want 0).
   */
  function liftCamera(): LiftCam | null {
    const a = town()?.anchors;
    const b = a?.liftBottom,
      tp = a?.liftTop;
    if (!b || !tp) return null;
    let hx = b.tx! - tp.tx!,
      hz = b.tz! - tp.tz!;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    const car = { x: 0, y: 0, z: 0 };
    const blocked = (c: { x: number; y: number; z: number }) => {
      if (world.groundAt(c.x, c.z) > c.y - 1.2) return true;
      const ty = car.y + 1.2;
      const n = Math.ceil(Math.hypot(car.x - c.x, ty - c.y, car.z - c.z) / 0.75);
      for (let i = 1; i < n - 2; i++) {
        const t = i / n;
        const x = c.x + (car.x - c.x) * t,
          y = c.y + (ty - c.y) * t,
          z = c.z + (car.z - c.z) * t;
        if (y < world.groundAt(x, z) + 0.4 || world.sightBlockedAt(x, y, z, 0.15)) return true;
      }
      return false;
    };
    let best: LiftCam | null = null,
      bestScore = Infinity;
    for (const d of [22, 32, 45, 60])
      for (const u of [3, 8, 14, 22])
        for (const sd of [0, -8, 8]) {
          const c = { x: b.tx! + hx * d + hz * sd, y: b.ty! + u, z: b.tz! + hz * d - hx * sd };
          let bad = 0;
          for (let i = 0; i <= 20; i++) {
            liftCarAt(i / 20, car);
            if (blocked(c)) bad += 1;
          }
          // Clear first, then close, low and square on (a steep or distant view loses the car).
          const score = bad * 10 + d * 0.03 + u * 0.04 + Math.abs(sd) * 0.03;
          if (score < bestScore) {
            bestScore = score;
            best = { ...c, blocked: bad };
          }
        }
    return best;
  }

  function rideLift(up: boolean): void {
    if (liftRide || !host.walking() || !town()) return;
    const to = up ? 1 : 0;
    liftRide = { from: 1 - to, to, t: 0, call: liftAt === 1 - to ? 0 : 2.4, cam: liftCamera() };
    host.beginRide();
    host.audio?.sfx.oneShot('crane_ratchet', host.player, 0.8);
  }
  /** The lift: the car comes to you if it's at the other end, then carries you up (or down) the bluff. */
  const updateLift: NonNullable<IslandContent['ride']> = (dt, look, t) => {
    const r = liftRide;
    const tn = town();
    const { cam, camera, hero, player } = host;
    if (!r || !tn) return;
    if (r.call > 0) {
      r.call -= dt;
      tn.setLiftCar(r.from + (r.to - r.from) * Math.max(0, r.call / 2.4));
      cam.update(dt, camera, look, player, player.heading, false, world, t);
      if (r.call > 0) return;
    }
    r.t = Math.min(1, r.t + dt / 8);
    const k = r.from + (r.to - r.from) * r.t;
    tn.setLiftCar(k);
    liftCarAt(k, liftPos);
    const b0 = tn.anchors.liftBottom!,
      t0 = tn.anchors.liftTop!;
    // Stand in the car looking out over the harbour, toward the camera out on the quay.
    const out = { x: b0.x - t0.x, z: b0.z - t0.z };
    hero.group.position.set(liftPos.x, liftPos.y + 0.2, liftPos.z);
    hero.group.rotation.y = Math.atan2(out.x, out.z);
    liftShot.x = r.cam?.x ?? liftPos.x + out.x;
    liftShot.y = r.cam?.y ?? liftPos.y + 6;
    liftShot.z = r.cam?.z ?? liftPos.z + out.z;
    liftShot.tx = liftPos.x;
    liftShot.ty = liftPos.y + 1.2;
    liftShot.tz = liftPos.z;
    cam.frame(liftShot);
    cam.update(dt, camera, look, liftPos, 0, false, world, t);
    if (r.t < 1) return;
    liftAt = r.to;
    liftRide = null;
    const a = tn.anchors[r.to === 1 ? 'liftTop' : 'liftBottom']!;
    // Step off the landing facing away from the lift: inland up top (the camera hangs over the notch
    // with the harbour behind you), back down the arm at the bottom.
    const b1 = tn.anchors.liftBottom!,
      t1 = tn.anchors.liftTop!;
    const heading = r.to === 1 ? Math.atan2(t1.x - b1.x, t1.z - b1.z) : Math.PI;
    const step = r.to === 1 ? 1.6 : 0;
    host.placePlayer(a.x + Math.sin(heading) * step, a.z + Math.cos(heading) * step, heading);
    cam.snapBehind(heading);
    cam.frame(null);
    host.endRide();
    host.audio?.sfx.oneShot('gear_hang', host.player, 0.7);
  };

  // ---- Mina's tour and the Seal ----
  /** A held shot of a landmark from in front of it (Mina's tour, the lighthouse). */
  const landmarkShot = (id: string): CameraShot | null => {
    const a = town()?.anchors[id];
    if (!a || a.tx === undefined) return null;
    const dx = a.tx - a.x,
      dz = a.tz! - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const h = Math.max(0, a.ty! - a.y);
    const back = 5 + h * 0.45;
    return {
      x: a.x - (dx / len) * back + (dz / len) * 2.2,
      y: a.y + 2.6 + h * 0.2,
      z: a.z - (dz / len) * back - (dx / len) * 2.2,
      tx: a.tx,
      ty: a.ty!,
      tz: a.tz!,
    };
  };
  for (const id of ['voyageOffice', 'bountyBoard', 'clockTower', 'outfitter'])
    cues.set(`tour:${id}`, async () => {
      const shot = landmarkShot(id);
      if (shot) host.frame(shot);
      if (id === 'clockTower')
        host.audio?.sfx.oneShot(
          'chime_solve',
          shot ? { x: shot.tx, y: shot.ty, z: shot.tz } : host.player,
          0.9,
        );
      await new Promise((r) => setTimeout(r, 700));
    });
  cues.set('tour:end', async () => {
    const talk = host.talkShot();
    if (talk) host.frame(talk);
  });
  let lighthouseLit = false;
  /**
   * The Seal's shot of the lighthouse: out on the water beyond it and a little to one side, looking
   * back at the lamp with the town and the citadel behind it. Nothing stands between the sea and the
   * mole's end, so it's always clear.
   */
  function lighthouseShot(
    adm: { x: number; y: number; z: number },
    lh: { x: number; y: number; z: number },
  ): CameraShot {
    let dx = lh.x - adm.x,
      dz = lh.z - adm.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const x = lh.x + dx * 30 + dz * 12,
      z = lh.z + dz * 30 - dx * 12;
    return {
      x,
      y: Math.max(lh.y + 7, world.waterAt(x, z, 0) + 3),
      z,
      tx: lh.x - dx * 6,
      ty: lh.y + 9,
      tz: lh.z - dz * 6,
    };
  }
  // The Seal: the lighthouse on the mole lights up across the harbour.
  cues.set('lighthouse', async () => {
    const tn = town();
    const lh = tn?.anchors.lighthouse;
    const adm = tn?.anchors.admiral;
    if (!tn || !lh || !adm) return;
    // Cuts, not eases: the sea shot is across the harbour, and an ease would swoop through the bluff.
    await host.showLighting(lighthouseShot(adm, lh), () => {
      tn.setLighthouseLit(true);
      lighthouseLit = true;
    });
  });

  // ---- The cast, chests and sites, with the town ----
  /**
   * What the content added to the session (colliders, interactions, chests, puzzles), so it can all
   * be taken out again when the island is freed.
   */
  interface Scope {
    colliders: (CircleObstacle | BoxCollider)[];
    interactions: string[];
    chests: string[];
    puzzles: Puzzle[];
  }
  const newScope = (): Scope => ({ colliders: [], interactions: [], chests: [], puzzles: [] });
  const clearScope = (sc: Scope) => {
    world.remove(sc.colliders);
    for (const id of sc.interactions) interactions.remove(id);
    for (const p of sc.puzzles) {
      const i = puzzles.indexOf(p);
      if (i >= 0) puzzles.splice(i, 1);
      p.dispose();
    }
    host.removeChests(sc.chests);
    sc.colliders.length = sc.interactions.length = sc.chests.length = sc.puzzles.length = 0;
  };
  let scope = newScope();
  const addPuzzle = (p: Puzzle) => {
    puzzles.push(p);
    scope.puzzles.push(p);
  };

  const setup = async (built: unknown): Promise<IslandSetup | null> => {
    const tn = built as MeridianTownSystem | null;
    if (!tn || host.disposed() || crowd) return null;
    addTownColliders(tn);
    const sc = scope;
    const cast = [...MERIDIAN_NPCS, ...meridianExtras(tn.anchors)];
    // A character a slice: the whole cast at once stalled a frame for ~150 ms while you sailed.
    const made = await NpcCrowd.createAsync(
      host.characters,
      cast,
      tn.anchors,
      world,
      host.tier,
      host.camera,
      { ...tn.anchors.promenade! },
      buildSlice,
      () => !host.disposed() && !crowd && town() === tn,
    );
    if (host.disposed() || crowd || town() !== tn) {
      made.dispose();
      return null;
    }
    crowd = made;
    await buildSlice();
    for (const n of crowd.list) {
      n.character.group.visible = false;
      host.scene.add(n.character.group);
      host.addNpcTalk(n);
      sc.interactions.push(`npc:${n.spec.id}`);
    }
    await buildSlice();
    const chestRoots: Group[] = [];
    for (const c of MERIDIAN_CHESTS) {
      const n = crowd.list.find((v) => v.spec.id === c.npc);
      if (!n) continue;
      const g = host.placeChestBy(c, n, stream.detail) as Group;
      g.visible = false;
      chestRoots.push(g);
      sc.chests.push(c.id);
    }
    if (storyHolds('meridian', 'sealed', quests())) {
      tn.setLighthouseLit(true);
      lighthouseLit = true;
    }
    // The lift's car where you left it (a reload builds the town with the car at the bottom).
    if (liftAt) tn.setLiftCar(liftAt);
    // The mooring lines go back on (or stay off) on the next frame.
    mooredShown = false;
    // The lift, from the top of the east arm to the citadel bluff.
    for (const [id, up] of [
      ['liftBottom', true],
      ['liftTop', false],
    ] as const) {
      const a = tn.anchors[id];
      if (!a) continue;
      const iid = up ? 'lift:bottom' : 'lift:top';
      sc.interactions.push(iid);
      interactions.add({
        id: iid,
        label: () => (up ? 'Ride the lift up' : 'Ride the lift down'),
        x: a.x,
        y: a.y,
        z: a.z,
        radius: 2.6,
        enabled: () => host.walking() && !host.scripting() && !liftRide,
        onInteract: () => rideLift(up),
      });
    }
    // P1.1 The Crate Yard on the shipyard apron, and P1.2 The Three Helms out in the bay.
    const kit = await loadVillageKit();
    if (host.disposed() || town() !== tn) return null;
    const sitesBefore = sites.length;
    const yardAt = tn.anchors.crateYard;
    if (yardAt) {
      const site = createCrateYardSite({ tier: host.tier, kit, origin: yardAt, layout: MERIDIAN_YARD });
      site.group.visible = false;
      host.scene.add(site.group);
      for (const c of site.colliders.circles) world.addCircle(c);
      for (const b of site.colliders.boxes) world.addBox(b);
      for (const c of site.crateCircles) {
        world.addDynamic(c);
        world.addCameraDynamic(c);
      }
      sc.colliders.push(...site.colliders.circles, ...site.colliders.boxes, ...site.crateCircles);
      sites.push(site);
      if (puzzleOn('crate-yard')) addPuzzle(createCrateYard(host.puzzleHost, site));
    }
    await buildSlice();
    if (host.disposed() || town() !== tn) return null;
    // P1.3 The Lost Letters: record cabinets between the Hall of Records' columns, and Pell's desk.
    const recordsAt = tn.anchors.recordsAlcoves;
    if (recordsAt) {
      const site = createRecordsAlcoves({
        kit,
        origin: recordsAt,
        alcoves: ALCOVES,
        letters: LETTERS.map((l) => l.answer),
        crest: textOf(lettersContent(), 'crest'),
      });
      site.group.visible = false;
      host.scene.add(site.group);
      for (const b of site.colliders.boxes) world.addBox(b);
      sc.colliders.push(...site.colliders.boxes);
      sites.push(site);
      if (puzzleOn('lost-letters')) addPuzzle(createLostLetters(lettersHost, site));
    }
    await buildSlice();
    if (host.disposed() || town() !== tn) return null;
    const buoys = createHelmBuoys({ kit, waves: host.cove.ocean.field });
    buoys.group.visible = false;
    host.scene.add(buoys.group);
    sites.push(buoys);
    if (puzzleOn('three-helms')) addPuzzle(createThreeHelms(helmsHost, buoys, host.cove.quietSea));
    const roots: Group[] = [
      ...crowd.list.map((n) => n.character.group),
      ...chestRoots,
      ...sites.slice(sitesBefore).map((s) => s.group),
    ];
    // Rhea's figure for the Helms joins the warm aboard the ship, hidden, then steps off until needed.
    const aboardFigure = puzzleOn('three-helms') && !rheaAboard ? makeRheaAboard().group : null;
    if (aboardFigure) {
      aboardFigure.visible = false;
      host.ship.group.add(aboardFigure);
      roots.push(aboardFigure);
    }
    for (const n of crowd.list) stream.detail.add(n.character.group);
    for (const s of sites) stream.detail.add(s.group);
    return {
      roots,
      reveal() {
        for (const r of roots) r.visible = true;
        if (aboardFigure && !rheaIsAboard) aboardFigure.removeFromParent();
        // Rhea on the quay stays hidden while she's aboard (setRheaAboard).
        const onArm = crowd?.list.find((n) => n.spec.id === 'rhea');
        if (onArm && rheaAboard?.group.parent) onArm.character.group.visible = false;
      },
    };
  };

  return {
    get npcs() {
      return crowd?.list ?? NO_CAST;
    },
    owns: (id) => castIds.has(id),
    script: (id) =>
      meridianNpcScript(id, quests(), {
        lettersFiled: host.learn ? !!host.learn.progress.data.puzzles[LETTERS_ID]?.solved : undefined,
      }),
    setup,
    // Gilda's stall on the plaza (the stall's part of the town).
    market: (built) => {
      const at = (built as MeridianTownSystem).anchors.modelMarket;
      return at ? { at, layout: MARKET_LAYOUT } : null;
    },
    /** Takes the cast, chests, sites, puzzles and colliders out (before the town is freed). */
    teardown() {
      if (crowd) {
        crowd.dispose();
        crowd = null;
      }
      clearScope(scope);
      scope = newScope();
      for (const site of sites.splice(0)) {
        site.group.removeFromParent();
        site.dispose();
      }
      world.remove(townColliders);
      townColliders.length = 0;
    },
    busy: () => !!liftRide,
    updateNpcs(dt, at, eye) {
      const m = MERIDIAN.harbor.berth;
      if (crowd && Math.hypot(eye.x - m.x, eye.z - m.z) < NEAR) crowd.update(dt, at);
    },
    update(dt, t) {
      for (const site of sites) site.update(dt, t);
      if (rheaAboard?.group.parent) rheaAboard.update(dt);
    },
    ride: (dt, look, t) => {
      if (liftRide) updateLift(dt, look, t);
    },
    onBoard() {
      if (quests()[puzzleQuest('three-helms')] === puzzleSteps('three-helms').helms) setRheaAboard(true);
    },
    onLand: () => setRheaAboard(false),
    moored(on) {
      const tn = town();
      if (on !== mooredShown && tn) {
        mooredShown = on;
        tn.setMooringLines(on);
      }
    },
    speaker: (name) => (name === 'Rhea' && rheaAboard?.group.parent ? rheaAboard : null),
    debug: {
      liftSpots: () => {
        const a = town()?.anchors;
        const b = a?.liftBottom,
          t = a?.liftTop;
        return b && t
          ? { bottom: { x: b.x, z: b.z, h: b.heading }, top: { x: t.x, z: t.z, h: t.heading } }
          : null;
      },
      liftAnchors: () => ({
        liftBottom: town()?.anchors.liftBottom ?? null,
        liftTop: town()?.anchors.liftTop ?? null,
      }),
      liftCamera: () => liftCamera(),
      rheaAboard: () => !!rheaAboard?.group.parent,
      lighthouseLit: () => lighthouseLit,
      // The play page's hands on the town (no story change): the lamp, the lift car and the lines.
      setLighthouseLit: (on: boolean) => town()?.setLighthouseLit(on),
      setLiftCar: (t: number) => town()?.setLiftCar(t),
      setMooringLines: (on: boolean) => town()?.setMooringLines(on),
    },
    dispose() {
      crowd?.dispose();
      for (const site of sites) {
        site.group.removeFromParent();
        site.dispose();
      }
      rheaAboard?.group.removeFromParent();
      rheaAboard?.dispose();
    },
  };
}
