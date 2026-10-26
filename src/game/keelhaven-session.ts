import type { Object3D } from 'three/webgpu';
import type { SliceName } from '../audio/soundscape/bank';
import { buildSlice } from '../engine/build-slice';
import { islandSign } from '../course/active';
import { puzzleContent, puzzleOn, textOf } from '../course/puzzles';
import type { CircleObstacle } from '../world/contracts';
import { naturalWaterAt } from '../world/islands/fresh-water-natural';
import { KEELHAVEN_ANCHORS } from '../world/islands/keelhaven/anchors';
import { DeckIndex } from '../world/islands/keelhaven/decks';
import { keelhavenWater } from '../world/islands/keelhaven/height';
import type { KeelhavenWorld } from '../world/islands/keelhaven/index';
import { KEELHAVEN, toWorld } from '../world/islands/keelhaven/layout';
import { KEELHAVEN_SET } from '../world/islands/keelhaven/props';
import { BOARD } from '../world/islands/keelhaven/town';
import { DOCKS, PADS, worksWaterAt } from '../world/islands/keelhaven/works';
import { createBottles, type BottleSite } from '../world/sites/bottles';
import { loadVillageKit } from '../world/village/kit';
import { createChoiceCard } from './choice-card';
import { createKeelhavenCircuits } from './keelhaven-circuits';
import type { BoxCollider, InlandWater, WalkSurface } from './collision';
import type { CameraShot } from './follow-camera';
import type { IslandContentHost } from './island-code';
import { KEELHAVEN_NPCS, keelhavenExtras } from './keelhaven-npcs';
import { keelhavenNpcScript } from './keelhaven-quests';
import { MARKET_PUZZLE, marketStall } from './market/stalls';
import { NpcCrowd, type Npc } from './npcs';
import type { Puzzle } from './puzzles/types';
import type { ScriptStep } from './script';
import { storyHolds, type StoryCondition } from './story';

/**
 * Keelhaven's content in the play session (docs/specs/ISLAND-03-keelhaven.md §4-§7): the cast at the
 * island's anchors, its chests and bottles, the works' fences and camera boxes, its walk surfaces (the
 * quay, the copings, the caissons, the gates' walkways, the verandas, the stair up the North Head) and
 * its water, and the set pieces the scripts wait on (the cues: the Bard's re-take, the Evidence Board,
 * the sounding, the tool chest, the bell cord, the ledgers, the chalk spyglass, the chests). It talks
 * to the world only through `KeelhavenWorld` and its layout data, and to the session through the host.
 */
export interface KeelhavenContent {
  /** The island's walk surfaces, live once the world's streamed. */
  readonly surface: WalkSurface;
  /** The Keel River (wade its shallows) and the works' still water (the basin, the docks, the locks). */
  inland(x: number, z: number, ground: number, out: InlandWater): boolean;
  setup(world: KeelhavenWorld): Promise<{ roots: Object3D[]; reveal(): void }>;
  teardown(): void;
  readonly npcs: readonly Npc[];
  readonly ids: ReadonlySet<string>;
  script(id: string): { steps: readonly ScriptStep[] } | null;
  updateNpcs(dt: number, at: { x: number; y: number; z: number }, eye: { x: number; z: number }): void;
  update(dt: number, t: number): void;
  bottles(): { id: string; x: number; z: number; read: boolean }[];
  debug: Record<string, (...args: never[]) => unknown>;
  dispose(): void;
}

/** Within this distance (m) of the island's centre its cast runs. */
const NEAR = 900;

/** A cove frame point (u, y, v) and what to look at, as a camera shot. */
function shotUv(u: number, y: number, v: number, tu: number, ty: number, tv: number): CameraShot {
  const p = toWorld(u, v);
  const t = toWorld(tu, tv);
  return { x: p.x, y, z: p.z, tx: t.x, ty, tz: t.z };
}

const yard = PADS.yard.y;
const SHOTS = {
  board: shotUv(BOARD.u - 1, 7.4, BOARD.v + 10, BOARD.u, 5.8, BOARD.v),
  planks: shotUv(179, 8.6, DOCKS.v[0] - 1, 173.4, yard + 0.6, DOCKS.v[0] - 3),
  rack: shotUv(179, 8.4, DOCKS.v[1] - 8, KEELHAVEN_SET.chestTo.u, yard + 0.6, KEELHAVEN_SET.chestTo.v),
  bell: shotUv(178.5, 7.6, DOCKS.v[0] + 11, KEELHAVEN_SET.bell.u, yard + 1.5, KEELHAVEN_SET.bell.v + 1.4),
  ledgers: shotUv(60, 8, -41.5, 60, yard + 1.4, -49.4),
  spyglass: shotUv(42, 9, -16, 32, 5, -28),
} as const;

/** The chests the island places (spec §3.12, as built): beside the strata cut, at Drydock 2's head, on the cut's arm. */
const CHESTS = [
  { id: 'C3.1', u: KEELHAVEN_SET.strata.u, v: KEELHAVEN_SET.strata.v + 3, face: [1, 0.3] },
  { id: 'C3.2', u: 169.6, v: DOCKS.v[1] - 5.6, face: [1, 0] },
  { id: 'C3.3', u: -33, v: -51.4, face: [0.3, 1] },
] as const;

/** The message bottles (the chapter's troubleshooting, B3.1-B3.5). */
const BOTTLES = [
  { id: 'B3.1', u: 6, v: 16 },
  { id: 'B3.2', u: 171.5, v: DOCKS.v[2] + 3 },
  { id: 'B3.3', u: 66, v: -44 },
  { id: 'B3.4', u: 70, v: -22.5 },
  { id: 'B3.5', u: 6, v: -84 },
] as const;

/** Every chest and bottle id the island places (`IslandCode.chests`). */
export const KEELHAVEN_CHEST_IDS: readonly string[] = [
  ...CHESTS.map((c) => c.id),
  ...BOTTLES.map((b) => b.id),
];

export function createKeelhavenContent(host: IslandContentHost): KeelhavenContent {
  let world: KeelhavenWorld | null = null;
  let decks: DeckIndex | null = null;
  let crowd: NpcCrowd | null = null;
  let bottleSite: BottleSite | null = null;
  let disposed = false;
  const ids = new Set(KEELHAVEN_NPCS.map((n) => n.id));
  const q = () => host.puzzleHost.quests();
  const story = (name: StoryCondition<'keelhaven'>) => storyHolds('keelhaven', name, q());
  const water = keelhavenWater();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const sfx = (id: SliceName, at: { x: number; y: number; z: number }, gain: number) =>
    host.audio?.sfx.oneShot(id, at, gain);
  const atUv = (u: number, y: number, v: number) => ({ ...toWorld(u, v), y });
  const card = createChoiceCard({ blocked: () => !!host.learn?.busy, reduced: host.reducedMotion });
  /** The set pieces' card: it has the keys while it's up. */
  const ask = async (a: Parameters<typeof card.ask>[0]): Promise<string> => {
    host.setModal(true);
    try {
      return await card.ask(a);
    } finally {
      host.setModal(false);
    }
  };

  const surface: WalkSurface = {
    heightAt: (x, z, y) => decks?.heightAt(x, z, y) ?? null,
    kind: (x, z) => (decks?.woodAt(x, z) ? 'wood' : 'stone'),
  };

  /** Bumped by each teardown, so a setup still building for a freed world stops. */
  let generation = 0;
  /** What this setup added to the session's world, interactions, chests and puzzles. */
  const added = {
    colliders: [] as (BoxCollider | CircleObstacle)[],
    interactions: [] as string[],
    chests: [] as string[],
    puzzles: [] as Puzzle[],
  };
  const addInteraction = (i: Parameters<IslandContentHost['interactions']['add']>[0]) => {
    added.interactions.push(i.id);
    return host.interactions.add(i);
  };

  // ---- Cues the scripts wait on (spec W.4) ----

  /** The Bard's re-take (puzzles/retake.json, a ceremony): play back, find the wrong bar, record again. */
  host.cues.set('kh-retake', async () => {
    if (!puzzleOn('retake')) return;
    const T = (k: string) => textOf(puzzleContent('retake'), k);
    const lyra = KEELHAVEN_ANCHORS.lyra;
    const strum = async (n: number) => {
      for (let i = 0; i < n; i++) {
        sfx('lute_strum', { x: lyra.x, y: lyra.y + 1.2, z: lyra.z }, 0.8);
        await wait(host.reducedMotion() ? 260 : 520);
      }
    };
    const head = { eyebrow: 'Lyra Wren', title: T('playBack') };
    const play = await ask({ ...head, prompt: T('hint1'), options: [{ id: 'play', label: T('playBack') }] });
    if (!play || !world) return card.close();
    card.busy(true);
    await strum(3);
    card.busy(false);
    const bars = ['bar1', 'bar2', 'bar3'];
    const tried = new Set<string>();
    for (;;) {
      const pick = await ask({
        ...head,
        prompt: T('pick'),
        options: bars.map((b) => ({ id: b, label: T(b), tried: tried.has(b) })),
      });
      if (!pick || !world) return card.close();
      // The second bar rings wrong (a red ripple on the music line).
      if (pick === 'bar2') break;
      tried.add(pick);
      card.message(T('wrongBar'), 'bad');
      await wait(900);
    }
    card.message(T('found'), 'good');
    const again = await ask({
      ...head,
      title: T('recordAgain'),
      prompt: T('found'),
      options: [{ id: 'record', label: T('recordAgain') }],
    });
    if (!again || !world) return card.close();
    card.busy(true);
    await strum(4);
    sfx('chime_solve', lyra, 0.8);
    card.message(T('clean'), 'good');
    await wait(1100);
    card.busy(false);
    card.close();
  });

  /** The Evidence Board: the camera turns to it for its matching quiz (M3.1, the next step). */
  host.cues.set('kh-board', async () => {
    host.frame(SHOTS.board);
    await wait(host.reducedMotion() ? 500 : 1400);
  });

  /** Sounding: four planks ring true, then the sluice floods Drydock 1 (four tests pass, then a build). */
  host.cues.set('kh-sounding', async () => {
    if (!world) return;
    host.frame(SHOTS.planks);
    const planks = KEELHAVEN_SET.planks;
    for (let i = 0; i < planks.length; i++) {
      const pick = await ask({
        eyebrow: 'Dory Pascoe',
        title: `${i + 1} / ${planks.length}`,
        prompt: i === 0 ? 'Tap each plank with the sounding hammer.' : 'It rings true. The next one.',
        options: [{ id: 'tap', label: 'Tap the plank' }],
      });
      if (!pick || !world) return card.close();
      const p = planks[i]!;
      sfx('timber_hit', atUv(p.u, yard + 0.7, p.v), 0.7);
      await wait(250);
    }
    const sluice = await ask({
      eyebrow: 'Dory Pascoe',
      title: `${planks.length} / ${planks.length}`,
      prompt: 'Every plank rings true. Pull the sluice.',
      options: [{ id: 'sluice', label: 'Pull the sluice' }],
    });
    if (!sluice || !world) return card.close();
    const s = KEELHAVEN_SET.sluice;
    sfx('lever', atUv(s.u, yard + 1, s.v), 0.8);
    await wait(300);
    sfx('gate_lift', atUv(s.u, yard, s.v), 0.7);
    card.message('The dock floods and the hull floats.', 'good');
    await wait(host.reducedMotion() ? 600 : 1500);
    card.close();
    host.backToTalk();
  });

  /** The tool chest: you carry it into Drydock 2 (each new worktree needs its own install). */
  host.cues.set('kh-tool-chest', async () => {
    if (!world) return;
    const pick = await ask({
      eyebrow: 'Dory Pascoe',
      title: 'Drydock 2',
      prompt: 'Its rack is empty. Carry the tool chest over.',
      options: [{ id: 'carry', label: 'Carry the tool chest' }],
    });
    if (!pick || !world) return card.close();
    card.close();
    await host.fade(true, host.reducedMotion() ? 200 : 380);
    world.toolChest.set(true);
    host.cut(SHOTS.rack);
    await host.fade(false, 300);
    sfx('crate_thud', atUv(KEELHAVEN_SET.chestTo.u, yard + 0.4, KEELHAVEN_SET.chestTo.v), 0.8);
    await wait(host.reducedMotion() ? 500 : 1400);
    host.backToTalk();
  });

  /** The bell cord (Run: the winch turns where it stands) and the winch by hand (copy and paste). */
  host.cues.set('kh-bell-cord', async () => {
    if (!world) return;
    host.frame(SHOTS.bell);
    const run = islandSign('keelhaven', 'bellCord');
    const paste = islandSign('keelhaven', 'winch');
    const done = new Set<string>();
    while (done.size < 2) {
      const pick = await ask({
        eyebrow: 'Dory Pascoe',
        title: 'The work order',
        prompt: done.size
          ? 'The winch keeps its place for the next order. Now the other way.'
          : 'Two ways to run it.',
        options: [
          { id: 'run', label: run, tried: done.has('run') },
          { id: 'paste', label: paste, tried: done.has('paste') },
        ],
      });
      if (!pick || !world) return card.close();
      if (done.has(pick)) continue;
      done.add(pick);
      const b = KEELHAVEN_SET.bell;
      const w = KEELHAVEN_SET.winch;
      if (pick === 'run') sfx('gondola_bell', atUv(b.u, yard + 2.4, b.v), 0.8);
      sfx('crane_ratchet', atUv(w.u, yard + 1, w.v), 0.7);
      await wait(700);
    }
    card.close();
    host.backToTalk();
  });

  /** The ledgers: set the Issues ledger's port to your fork; the Pull requests ledger keeps its own. */
  host.cues.set('kh-ledgers', async () => {
    if (!world) return;
    host.frame(SHOTS.ledgers);
    const issues = islandSign('keelhaven', 'ledgerIssues');
    const pulls = islandSign('keelhaven', 'ledgerPulls');
    const all = islandSign('keelhaven', 'ledgerAll');
    const fork = islandSign('keelhaven', 'ledgerFork');
    const tried = new Set<string>();
    for (;;) {
      const pick = await ask({
        eyebrow: 'Harbourmaster Stroud',
        title: issues,
        prompt: `${issues}: ${all}`,
        options: [
          { id: 'all', label: all, tried: tried.has('all') },
          { id: 'fork', label: fork },
        ],
      });
      if (!pick || !world) return card.close();
      if (pick === 'fork') break;
      tried.add(pick);
      card.message(`${issues}: ${all}`, 'bad');
      await wait(700);
    }
    const l0 = KEELHAVEN_SET.ledgers[0];
    sfx('stone_turn', atUv(l0.u, yard + 0.6, l0.v), 0.6);
    const open = await ask({
      eyebrow: 'Harbourmaster Stroud',
      title: pulls,
      prompt: `${issues}: ${fork}`,
      options: [{ id: 'open', label: pulls }],
    });
    if (!open || !world) return card.close();
    card.message(`${pulls}: ${all}`, 'info');
    await wait(host.reducedMotion() ? 900 : 1800);
    card.close();
    host.backToTalk();
  });

  /** The chalk spyglass: you pick one sail of the slipway's model hull, and the slip shows the mark. */
  host.cues.set('kh-chalk-spyglass', async () => {
    if (!world) return;
    host.frame(SHOTS.spyglass);
    const pick = await ask({
      eyebrow: 'Barty Quist',
      title: 'The chalk spyglass',
      prompt: 'Pick one sail to mark.',
      options: [
        { id: 'fore', label: 'The foresail' },
        { id: 'main', label: 'The mainsail' },
        { id: 'jib', label: 'The jib' },
      ],
    });
    if (!pick || !world) return card.close();
    sfx('quill', host.player, 0.7);
    card.message('A chalk ring marks it, and the slip shows the mark.', 'good');
    await wait(host.reducedMotion() ? 700 : 1500);
    card.close();
    host.backToTalk();
  });

  for (const c of CHESTS)
    host.cues.set(`kh-chest:${c.id}`, async () => {
      await host.openChest(c.id);
    });

  // ---- The Two Circuits (spec §5) and the Seal (§4.5) ----
  const circuits = createKeelhavenCircuits(host, {
    ask,
    card: {
      message: (t, tone) => card.message(t, tone),
      busy: (on) => card.busy(on),
      close: () => card.close(),
      choose: (id) => card.choose(id),
    },
  });
  host.cues.set('kh-ring', () => circuits.cue('ring'));
  host.cues.set('kh-flight', () => circuits.cue('flight'));
  host.cues.set('kh-seal', () => circuits.seal());

  async function setup(w: KeelhavenWorld): Promise<{ roots: Object3D[]; reveal(): void }> {
    const none = { roots: [] as Object3D[], reveal() {} };
    if (disposed || world) return none;
    world = w;
    const gen = generation;
    const gone = () => disposed || gen !== generation;
    const works = w.works;
    decks = new DeckIndex(works.decks);
    for (const b of works.colliders) host.world.addBox(b);
    for (const c of works.circles) host.world.addCircle(c);
    for (const b of works.cameraBoxes) host.world.addCameraBox(b);
    added.colliders.push(...works.colliders, ...works.circles, ...works.cameraBoxes);
    // Dory's tool chest is on Drydock 2's rack once you've carried it (the save says so).
    w.toolChest.set(story('dockKitted'));

    // The cast at their anchors (on the walk surfaces there), a character a slice.
    const anchors = { ...w.anchors } as Record<string, (typeof w.anchors)['lyra']>;
    const cast = [
      ...KEELHAVEN_NPCS,
      ...keelhavenExtras(anchors).filter(
        (n) => n.id !== marketStall('keelhaven').keeper.npc || puzzleOn(MARKET_PUZZLE),
      ),
    ];
    const made = await NpcCrowd.createAsync(
      host.characters,
      cast,
      anchors,
      host.world,
      host.tier,
      host.camera,
      { ...anchors.lyra! },
      buildSlice,
      () => !gone(),
    );
    if (gone()) {
      made.dispose();
      return none;
    }
    crowd = made;
    await buildSlice();
    const roots: Object3D[] = [];
    for (const n of crowd.list) {
      n.character.group.visible = false;
      host.scene.add(n.character.group);
      host.detail.add(n.character.group);
      host.addNpcTalk(n);
      added.interactions.push(`npc:${n.spec.id}`);
      roots.push(n.character.group);
    }
    await buildSlice();
    if (gone()) return none;

    for (const c of CHESTS) {
      const p = toWorld(c.u, c.v);
      const y = host.world.surfaceHeightAt(p.x, p.z) ?? host.world.groundAt(p.x, p.z);
      const f = toWorld(c.u + c.face[0], c.v + c.face[1]);
      const g = host.placeChest(c.id, p.x, y, p.z, Math.atan2(f.x - p.x, f.z - p.z), host.detail);
      if (!g) continue;
      added.chests.push(c.id);
      g.visible = false;
      roots.push(g);
    }
    // Message bottles (B3.1-B3.5): the chapter's troubleshooting.
    const kit = await loadVillageKit();
    if (gone()) return none;
    bottleSite = createBottles({
      kit,
      ground: (x, z) => host.world.groundAt(x, z),
      spots: BOTTLES.map((b, i) => ({ id: b.id, ...toWorld(b.u, b.v), yaw: 0.4 + i * 1.7 })),
    });
    bottleSite.group.visible = false;
    host.scene.add(bottleSite.group);
    host.detail.add(bottleSite.group);
    roots.push(bottleSite.group);
    for (const [id, p] of Object.entries(bottleSite.spots())) {
      if (host.learn?.isChestOpen(id)) bottleSite.setCollected(id, true);
      addInteraction({
        id: `bottle:${id}`,
        label: () => 'Read the message in the bottle',
        x: p.x,
        y: p.y,
        z: p.z,
        radius: 2,
        enabled: () => host.puzzleHost.canAct() && !!host.learn && !host.learn.isChestOpen(id),
        onInteract: () => void readBottle(id, p),
      });
    }
    // The circuits: their stations, lamps and moving hulls, laid out as the save says.
    for (const p of circuits.create(w)) {
      host.puzzles.push(p);
      added.puzzles.push(p);
    }
    return {
      roots,
      reveal() {
        for (const r of roots) r.visible = true;
      },
    };
  }

  async function readBottle(id: string, at: { x: number; y: number; z: number }): Promise<void> {
    sfx('bottle_pop', at, 0.9);
    bottleSite?.setCollected(id, true);
    await host.learn?.openChest(id);
  }

  function teardown(): void {
    generation++;
    card.close();
    circuits.teardown();
    if (!world) return;
    host.world.remove(added.colliders);
    for (const id of added.interactions) host.interactions.remove(id);
    for (const p of added.puzzles) {
      const i = host.puzzles.indexOf(p);
      if (i >= 0) host.puzzles.splice(i, 1);
      p.dispose();
    }
    host.removeChests(added.chests);
    added.colliders.length = added.interactions.length = added.chests.length = added.puzzles.length = 0;
    crowd?.dispose();
    crowd = null;
    if (bottleSite) {
      bottleSite.group.removeFromParent();
      bottleSite.dispose();
      bottleSite = null;
    }
    decks = null;
    world = null;
  }

  return {
    surface,
    inland(x, z, ground, out) {
      if (!world) return false;
      const level = worksWaterAt(x, z);
      if (level !== null && level > ground) {
        out.level = level;
        out.floor = ground;
        return true;
      }
      return naturalWaterAt(water, x, z, ground, out);
    },
    setup,
    teardown,
    get npcs() {
      return crowd?.list ?? [];
    },
    ids,
    script: (id) => keelhavenNpcScript(id, q()),
    updateNpcs(dt, at, eye) {
      if (crowd && Math.hypot(eye.x - KEELHAVEN.center.x, eye.z - KEELHAVEN.center.z) < NEAR)
        crowd.update(dt, at);
    },
    update(dt) {
      if (world) circuits.update(dt);
    },
    bottles: () =>
      Object.entries(bottleSite?.spots() ?? {}).map(([id, p]) => ({
        id,
        x: p.x,
        z: p.z,
        read: !!host.learn?.isChestOpen(id),
      })),
    debug: {
      ready: () => !!world,
      decks: () => world?.works.decks.length ?? 0,
      card: () => card.view,
      choose: (id: string) => card.choose(id),
      toolChestOnRack: () => story('dockKitted'),
      hull: (id: 'search' | 'note' | 'stats') => circuits.debug.hull(id),
      /** Plays the Seal's moment (for a test's shots). */
      seal: () => circuits.seal(),
      /** Frames a view of the lock flight for a test's shots (`null` gives the camera back). */
      view: (name: 'lock1' | 'pound' | null) => {
        if (!name) return host.frame(null);
        const u = name === 'lock1' ? 62 : 44;
        host.frame(shotUv(u + 6, yard + 8, -42, u, 2.5, -60));
      },
      lamp: (key: string) => circuits.debug.lamp(key),
    },
    dispose() {
      disposed = true;
      teardown();
      card.dispose();
    },
  };
}
