import { Vector3, type Object3D, type PerspectiveCamera } from 'three/webgpu';
import type { IslesAudio } from '../audio';
import type { SoundLoopHandle, SoundLoopName } from '../audio/soundscape/soundscape';
import type { SliceName } from '../audio/soundscape/bank';
import { buildSlice } from '../engine/build-slice';
import type { TierSettings } from '../engine/quality';
import type { LearnStore } from '../learn/store';
import type { CharacterLibrary } from '../world/characters';
import type { FarCull } from '../world/far-cull';
import type { ThousandBoughSystem } from '../world/islands/thousand-bough/contract';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import { createBottles, type BottleSite } from '../world/sites/bottles';
import { loadVillageKit } from '../world/village/kit';
import type { CollisionWorld, WalkSurface } from './collision';
import type { CameraShot } from './follow-camera';
import type { Interactions } from './interaction';
import { NpcCrowd, type Npc } from './npcs';
import { createChannelRouting } from './puzzles/channel-routing/puzzle';
import { FlagHoist, FLAGS, type FlagSymbol } from './puzzles/flag-hoist';
import { createPracticeSession } from './puzzles/practice-session';
import type { Puzzle, PuzzleHost } from './puzzles/types';
import type { ScriptStep } from './script';
import { THOUSAND_BOUGH_NPCS, thousandBoughExtras } from './thousand-bough-npcs';
import { FEN_SOLVED, thousandBoughNpcScript } from './thousand-bough-quests';
import { createViewStore } from './puzzles/channel-routing/view';
import type { FlagHoistView } from '../ui/puzzles/FlagHoist';

/**
 * Thousand-Bough Isle's content in the play session (docs/specs/ISLAND-02-thousand-bough.md §4-§7):
 * the cast at the island's anchors, its chests and bottles, Channel Routing and the Spire twist, the
 * Flag Hoist, the Booth Pools, the Cloud gondola, the Sky Basket, the Lantern House and the Seal's
 * Thousand Lanterns. It talks to the world only through the island's contract (`ThousandBoughSystem`)
 * and its layout data, and to the session through this host.
 */
export interface ThousandBoughHost {
  characters: CharacterLibrary;
  tier: TierSettings;
  camera: PerspectiveCamera;
  scene: { add(o: Object3D): void };
  world: CollisionWorld;
  detail: FarCull;
  learn: LearnStore | null;
  audio: IslesAudio | null;
  interactions: Interactions;
  puzzleHost: PuzzleHost;
  /** The player's feet (walk mode). */
  player: { readonly x: number; readonly y: number; readonly z: number };
  walking(): boolean;
  say(ids: readonly string[]): Promise<void>;
  /** An unvoiced line (Ines's reasons, Wingman's hints). */
  text(speaker: string, line: string): Promise<void>;
  frame(shot: CameraShot | null): void;
  cut(shot: CameraShot): void;
  fade(on: boolean, ms?: number): Promise<void>;
  /** Back to the open conversation's shot (after a cutaway). */
  backToTalk(): void;
  /** Puts the walker somewhere, facing `heading`, with the camera behind. */
  place(x: number, z: number, heading: number, y?: number): void;
  /** The board or the hoist owns the keys and camera. */
  setModal(on: boolean): void;
  reducedMotion(): boolean;
  addNpcTalk(n: Npc): void;
  /** A treasure chest at a spot (the session's chests, saved and opened like the others). */
  placeChest(id: string, x: number, y: number, z: number, heading: number, detail: FarCull): Object3D | null;
  openChest(id: string): Promise<void>;
  cues: Map<string, () => Promise<void>>;
  puzzles: Puzzle[];
}

export interface ThousandBoughContent {
  /** The island's walk surfaces (decks, the stair, bridges), live once the world's streamed. */
  readonly surface: WalkSurface;
  /** Its pools and streams, for wading. */
  inland(x: number, z: number): number | null;
  /** Builds the cast, chests, bottles and set pieces once the world's in (hidden until `reveal`). */
  setup(sys: ThousandBoughSystem): Promise<{ roots: Object3D[]; reveal(): void }>;
  readonly npcs: readonly Npc[];
  readonly ids: ReadonlySet<string>;
  script(id: string): { steps: readonly ScriptStep[] } | null;
  /** The board or the hoist has the keys (the session skips its own). */
  modal(): boolean;
  /** Close to the island (its cast runs only then). */
  near(x: number, z: number): boolean;
  /** The cast's idle life while the camera's near the island (`at` is who they turn to). */
  updateNpcs(dt: number, at: { x: number; y: number; z: number }, eye: { x: number; z: number }): void;
  update(dt: number, t: number): void;
  bottles(): { id: string; x: number; z: number; read: boolean }[];
  debug: Record<string, (...args: never[]) => unknown>;
  dispose(): void;
}

const A = THOUSAND_BOUGH.anchors;
/** The great banyan's centre (spec §3: T). */
const TREE_X = 2010,
  TREE_Z = -1560;
const shotOf = (eye: { x: number; y: number; z: number }, at: { x: number; y: number; z: number }) => ({
  x: eye.x,
  y: eye.y,
  z: eye.z,
  tx: at.x,
  ty: at.y,
  tz: at.z,
});
/** H8 Seal Cascade and H7 Above the Mist (§2.8). */
export const SEAL_SHOT: CameraShot = shotOf({ x: 1960, y: 30, z: -1470 }, { x: 2010, y: 40, z: -1560 });
const CROWN_SHOT: CameraShot = shotOf({ x: 2010, y: 52.3, z: -1548 }, { x: 1931, y: 4, z: -1372 });
const GONDOLA_SHOT: CameraShot = shotOf(
  { x: 2028, y: 31.5, z: -1544 },
  { x: THOUSAND_BOUGH.gondola.loft.x, y: 70, z: THOUSAND_BOUGH.gondola.loft.z },
);

/** Booths: Lyra's three players, one instrument each (spec §7): inside one, you hear its part up close. */
const BOOTHS = [
  { id: 'a', anchor: A.boothA, sound: 'booth_kalimba' },
  { id: 'b', anchor: A.boothB, sound: 'booth_flute' },
  { id: 'c', anchor: A.boothC, sound: 'booth_rainstick' },
] as const;

/** The island's water you can hear (spec §8.2): the falls roar, the pools' cascades and Fernrun. */
const WATER_SOUNDS: readonly { name: SoundLoopName; x: number; y: number; z: number; gain: number }[] = [
  { name: 'waterfall_large', x: 2010, y: 30, z: -1678, gain: 0.55 }, // the Veil
  { name: 'waterfall_large', x: 2148, y: 24, z: -1648, gain: 0.7 }, // Great Falls
  { name: 'waterfall_small', x: 1880, y: 14, z: -1614, gain: 0.45 }, // Silver Thread
  { name: 'stream', x: 1921, y: 6.5, z: -1494, gain: 0.35 }, // the Booth Pools' cascades
  { name: 'stream', x: 1962, y: 12, z: -1528, gain: 0.3 }, // Fernrun by the plank bridge
];
/** Within this distance (m) of the island's centre its sounds play; beds fade out beyond it. */
const HEAR = 480;
/** The island's beds, very low (Dan liked the faint gulls at 0.12): drips after the shower and frogs. */
const BEDS = { rain_canopy: 0.12, frogs_dusk: 0.07 } as const;

/**
 * The Seal (spec §4.4): cut to the tree (H8), the Elder's Beacon kindles and the Thousand Lanterns run
 * down every bough, the Sky Basket starts running, then back to the conversation.
 */
export async function playSeal(
  sys: Pick<ThousandBoughSystem, 'fx'>,
  host: Pick<ThousandBoughHost, 'fade' | 'cut' | 'backToTalk' | 'reducedMotion' | 'audio' | 'player'>,
  wait: (ms: number) => Promise<unknown>,
): Promise<void> {
  const reduced = host.reducedMotion();
  await host.fade(true, 260);
  host.cut(SEAL_SHOT);
  await host.fade(false, 260);
  host.audio?.sfx.oneShot('chime_solve', A.elder, 1);
  // Hold on the tree while the light runs down every bough.
  await Promise.all([sys.fx.sealCascade(reduced), wait(reduced ? 2400 : 5200)]);
  sys.fx.skyBasketEnabled(true);
  host.audio?.sfx.oneShot('crowd_cheer_small', host.player, 0.7);
  await wait(reduced ? 600 : 1800);
  await host.fade(true, 260);
  host.backToTalk();
  await host.fade(false, 260);
}

export function createThousandBoughContent(host: ThousandBoughHost): ThousandBoughContent {
  let sys: ThousandBoughSystem | null = null;
  let crowd: NpcCrowd | null = null;
  let bottleSite: BottleSite | null = null;
  let disposed = false;
  let unwatchBranch: (() => void) | null = null;
  const ids = new Set(THOUSAND_BOUGH_NPCS.map((n) => n.id));
  const q = () => host.puzzleHost.quests();
  const done = (id: string) => q()[id] === 'done';
  const sfx = (id: SliceName, at: { x: number; y: number; z: number }, gain: number) =>
    host.audio?.sfx.oneShot(id, at, gain);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ---- P2.1 Channel Routing (and P2.2) ----
  let routing: ReturnType<typeof createChannelRouting> | null = null;
  let openBoardSoon = false;
  let modal = false;
  const setModal = (on: boolean) => {
    modal = on;
    host.setModal(on);
  };

  // ---- P2.3 Flag Hoist ----
  const hoistView = createViewStore<FlagHoistView>({
    open: false,
    step: 0,
    of: 4,
    order: '',
    message: null,
    focus: 0,
    busy: false,
  });
  let hoist: FlagHoist | null = null;
  let hoistDone: (() => void) | null = null;
  let unmountHoist: (() => void) | null = null;
  const pad = new Map<number, boolean>();

  async function hoistFlag(symbol: FlagSymbol): Promise<void> {
    const h = hoist;
    if (!h || hoistView.get().busy || !sys) return;
    const mast = A.flagMast;
    const r = h.hoist(symbol);
    hoistView.set({ busy: true, focus: FLAGS.findIndex((f) => f.symbol === symbol) });
    sfx('rope_hoist', mast, 0.7);
    await sys.mast.hoist(symbol, r.ok);
    if (!r.ok) {
      hoistView.set({ message: { text: r.reason, tone: 'bad' } });
      await host.text('Ines', r.reason.replace(/`([^`]+)`/g, '$1'));
      hoistView.set({ busy: false });
      return;
    }
    hoistView.set({ message: { text: `${symbol}: that’s the one!`, tone: 'good' } });
    if (r.done || h.index === 1) await host.say(['tb.ines.flag.ok']);
    if (r.done) {
      sfx('chime_solve', mast, 0.8);
      await wait(600);
      hoistView.set({ open: false, busy: false });
      setModal(false);
      hoistDone?.();
      return;
    }
    hoistView.set({ step: h.index, order: h.order!.text, message: null });
    await host.say([h.order!.line]);
    hoistView.set({ busy: false });
  }

  async function runHoist(): Promise<void> {
    if (!sys) return;
    hoist = new FlagHoist();
    sys.mast.lowerAll();
    if (!unmountHoist) {
      const { mountFlagHoist } = await import('../ui/puzzles/FlagHoist');
      unmountHoist = mountFlagHoist({
        get: hoistView.get,
        subscribe: hoistView.subscribe,
        hoist: (s) => void hoistFlag(s),
      });
    }
    // From the trunk side of the deck, looking out past the mast to the cove (the sun's to the right).
    const m = A.flagMast;
    const ix = TREE_X - m.x,
      iz = TREE_Z - m.z;
    const il = Math.hypot(ix, iz) || 1;
    host.frame(
      shotOf(
        {
          x: m.x + (ix / il) * 7.5 - (iz / il) * 2.5,
          y: m.y + 3.4,
          z: m.z + (iz / il) * 7.5 + (ix / il) * 2.5,
        },
        { x: m.x - (ix / il) * 4, y: m.y + 6.5, z: m.z - (iz / il) * 4 },
      ),
    );
    setModal(true);
    hoistView.set({
      open: true,
      step: 0,
      of: 4,
      order: hoist.order!.text,
      message: null,
      busy: true,
      focus: 0,
    });
    const finished = new Promise<void>((r) => (hoistDone = r));
    await host.say([hoist.order!.line]);
    hoistView.set({ busy: false });
    await finished;
    hoistDone = null;
    host.backToTalk();
  }

  // ---- Booth Pools: step into a booth to hear its player up close ----
  let inBooth: string | null = null;
  // ---- The island's soundscape, while you're near ----
  let hearing = false;
  const loops: SoundLoopHandle[] = [];
  const boothLoops: SoundLoopHandle[] = [];
  let parrotIn = 20;
  function setHearing(on: boolean): void {
    if (on === hearing || !host.audio) return;
    hearing = on;
    const sfxs = host.audio.sfx;
    for (const [bed, gain] of Object.entries(BEDS)) sfxs.setBed(bed as keyof typeof BEDS, on ? gain : 0);
    if (on) {
      for (const w of WATER_SOUNDS) loops.push(sfxs.loop(w.name, w, w.gain));
      for (const b of BOOTHS) boothLoops.push(sfxs.loop(b.sound, { ...b.anchor, y: b.anchor.y + 1.6 }, 0.05));
    } else {
      for (const l of loops.splice(0)) l.stop();
      for (const l of boothLoops.splice(0)) l.stop();
    }
  }

  // ---- The Sky Basket: Root Hall ↔ Crown Deck, once the Elder sends it down ----
  const basketOpen = () => !!q()['Q2.9'] && q()['Q2.9'] !== 'start';
  let riding = false;
  async function rideBasket(up: boolean): Promise<void> {
    if (riding || !host.walking()) return;
    riding = true;
    const from = up ? A.skyBasketBottom : A.skyBasketTop;
    const to = up ? A.skyBasketTop : A.skyBasketBottom;
    sfx('crane_ratchet', from, 0.8);
    // The world can move the basket's cage (ThousandBoughWorld.skyBasketCar, 0 bottom → 1 top).
    const car = (sys as { skyBasketCar?: (t: number) => void } | null)?.skyBasketCar;
    await host.fade(true, host.reducedMotion() ? 200 : 420);
    car?.(up ? 1 : 0);
    // Step off the landing toward the deck's middle.
    const h = up ? Math.atan2(2010 - to.x, -1556 - to.z) : Math.atan2(2010 - to.x, -1560 - to.z) + Math.PI;
    host.place(to.x + Math.sin(h) * 1.4, to.z + Math.cos(h) * 1.4, h, to.y);
    await wait(host.reducedMotion() ? 150 : 650);
    await host.fade(false, 360);
    sfx('gear_hang', to, 0.6);
    riding = false;
  }

  // ---- Cues the scripts wait on ----
  host.cues.set('tb-chest:C2.1', async () => {
    await host.openChest('C2.1');
  });
  host.cues.set('tb-gondola', async () => {
    if (!sys) return;
    host.frame(GONDOLA_SHOT);
    sfx('gondola_bell', A.gondolaBell, 0.8);
    void sys.fx.gondolaSend();
    await wait(host.reducedMotion() ? 600 : 1600);
    host.backToTalk();
  });
  host.cues.set('tb-flume-demo', async () => {
    await routing?.demo();
  });
  host.cues.set('tb-flume-clear', async () => {
    await routing?.demoClear();
  });
  host.cues.set('tb-flume-open', async () => {
    openBoardSoon = true;
  });
  host.cues.set('tb-flag-hoist', () => runHoist());
  host.cues.set('tb-crown-view', async () => {
    if (done('Q2.9') || q()['Q2.9'] === 'exam') return;
    crownView = true;
    host.frame(CROWN_SHOT);
    await wait(host.reducedMotion() ? 1200 : 2600);
    crownView = false;
    host.backToTalk();
  });
  let sealing = false;
  let crownView = false;
  host.cues.set('tb-seal', async () => {
    if (!sys) return;
    sealing = true;
    await playSeal(sys, host, wait);
    sealing = false;
  });

  const surface: WalkSurface = {
    heightAt: (x, z, y) => sys?.walkable(x, z, y) ?? null,
    kind: (x, z) => sys?.surfaceKind(x, z) ?? 'wood',
  };

  async function setup(s: ThousandBoughSystem): Promise<{ roots: Object3D[]; reveal(): void }> {
    const none = { roots: [] as Object3D[], reveal() {} };
    if (disposed || sys) return none;
    sys = s;
    // The Practice Bough's sign shows the player's practice branch (Your setup): painted now, before
    // the island's warm-up uploads its atlas, and again when they change it (behind the setup form).
    const branch = () => host.learn?.getState().setup.branch ?? null;
    s.setPracticeBranch(branch());
    unwatchBranch = host.learn?.subscribe(() => sys?.setPracticeBranch(branch())) ?? null;
    for (const b of s.colliders()) host.world.addBox(b);
    for (const c of s.circles()) host.world.addCircle(c);
    for (const b of s.cameraBoxes()) host.world.addCameraBox(b);

    // The cast at their anchors (decks keep the anchor's height).
    const anchors = s.anchors as unknown as Record<string, typeof s.anchors.tamsin>;
    const cast = [
      ...THOUSAND_BOUGH_NPCS.map((n) => ({ ...n, keepY: true })),
      ...thousandBoughExtras(anchors, q()['Q2.5'] === 'done'),
    ];
    crowd = new NpcCrowd(host.characters, cast, anchors, host.world, host.tier, host.camera, {
      ...anchors.tamsin,
    });
    await buildSlice();
    const roots: Object3D[] = [];
    for (const n of crowd.list) {
      n.character.group.visible = false;
      host.scene.add(n.character.group);
      host.detail.add(n.character.group);
      host.addNpcTalk(n);
      roots.push(n.character.group);
    }
    await buildSlice();
    if (disposed) return none;

    // Chests: Lyra's by the third booth, and one in the cave behind Great Falls.
    // Each faces the way you come to it: C2.1 the Fern Walk, C2.2 the Mirror Pool out of the cave.
    const faces: Record<string, { x: number; z: number }> = {
      'C2.1': { x: 1950, z: -1510 },
      'C2.2': { x: 2120, z: -1595 },
    };
    for (const c of THOUSAND_BOUGH.chests) {
      const f = faces[c.id] ?? A.lyra;
      const g = host.placeChest(c.id, c.x, c.y, c.z, Math.atan2(f.x - c.x, f.z - c.z), host.detail);
      if (g) {
        g.visible = false;
        roots.push(g);
      }
    }
    // Message bottles (B2.1-B2.3): the chapter's troubleshooting.
    const kit = await loadVillageKit();
    if (disposed) return none;
    bottleSite = createBottles({
      kit,
      ground: (x, z) => host.world.groundAt(x, z),
      spots: THOUSAND_BOUGH.bottles.map((b, i) => ({ id: b.id, x: b.x, z: b.z, yaw: 0.7 + i * 1.9 })),
    });
    bottleSite.group.visible = false;
    host.scene.add(bottleSite.group);
    host.detail.add(bottleSite.group);
    roots.push(bottleSite.group);
    for (const [id, p] of Object.entries(bottleSite.spots())) {
      if (host.learn?.isChestOpen(id)) bottleSite.setCollected(id, true);
      host.interactions.add({
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

    // Set pieces.
    routing = createChannelRouting(
      {
        ...host.puzzleHost,
        frame: host.frame,
        say: host.say,
        wingman: (t) => void host.text('Wingman', t),
        project: (x, y, z) => project(x, y, z),
        setModal,
        reducedMotion: host.reducedMotion,
        fade: host.fade,
        closing: FEN_SOLVED,
      },
      s,
    );
    host.puzzles.push(routing);
    // Rook's practice session, with the player's own branch and issue number (Your setup).
    host.puzzles.push(
      createPracticeSession({
        rook: A.rook,
        player: host.player,
        setup: () => host.learn?.getState().setup ?? null,
        started: () => !!q()['Q2.7'],
      }),
    );
    host.interactions.add({
      id: 'gondola:bell',
      label: () => 'Ring the gondola bell',
      ...A.gondolaBell,
      radius: 2.2,
      enabled: () => host.puzzleHost.canAct() && done('Q2.4'),
      onInteract: () => void ringGondola(),
    });
    for (const [id, a, up] of [
      ['basket:bottom', A.skyBasketBottom, true],
      ['basket:top', A.skyBasketTop, false],
    ] as const)
      host.interactions.add({
        id,
        label: () => (up ? 'Ride the Sky Basket up' : 'Ride the Sky Basket down'),
        x: a.x,
        y: a.y,
        z: a.z,
        radius: 2.6,
        enabled: () => host.puzzleHost.canAct() && basketOpen() && !riding,
        onInteract: () => void rideBasket(up),
      });
    s.fx.skyBasketEnabled(basketOpen());
    let lantern: 'day' | 'night' = 'day';
    host.interactions.add({
      id: 'lantern:lever',
      label: () => (lantern === 'day' ? 'Close the shutters' : 'Open the shutters'),
      ...A.lanternHouse,
      radius: 2.2,
      enabled: () => host.puzzleHost.canAct() && done('Q2.9'),
      onInteract: () => {
        lantern = lantern === 'day' ? 'night' : 'day';
        sfx('lever', A.lanternHouse, 0.6);
        s.fx.lanternHouse(lantern);
      },
    });
    if (q()['Q2.5'] === 'done') {
      void s.spire.openSecondBridge();
      s.spire.preview('feature', 5173, true);
      s.spire.preview('docs', 5174, true);
    }
    if (done('Q2.9')) void s.fx.sealCascade(true);

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

  let gondolaBusy = false;
  async function ringGondola(): Promise<void> {
    if (!sys || gondolaBusy) return;
    gondolaBusy = true;
    sfx('gondola_bell', A.gondolaBell, 0.9);
    void sys.fx.gondolaSend();
    await host.say(['tb.oak.gondola']);
    gondolaBusy = false;
  }

  const projected = new Vector3();
  function project(x: number, y: number, z: number): { x: number; y: number; scale: number } | null {
    const cam = host.camera;
    projected.set(x, y, z).project(cam);
    if (projected.z > 1 || projected.z < -1) return null;
    const w = innerWidth,
      h = innerHeight;
    const dist = cam.position.distanceTo(projected.set(x, y, z));
    const scale = h / (2 * Math.tan(((cam.fov * Math.PI) / 180) * 0.5) * Math.max(0.1, dist));
    projected.set(x, y, z).project(cam);
    return { x: (projected.x * 0.5 + 0.5) * w, y: (-projected.y * 0.5 + 0.5) * h, scale };
  }

  function pollHoistPad(): void {
    const p = navigator.getGamepads?.().find((g) => g && g.connected && g.mapping === 'standard');
    if (!p) return;
    const edge = (i: number) => {
      const d = !!p.buttons[i]?.pressed;
      const was = pad.get(i) ?? false;
      pad.set(i, d);
      return d && !was;
    };
    const v = hoistView.get();
    if (edge(14) || edge(15)) hoistView.set({ focus: (v.focus + 1) % FLAGS.length });
    if (edge(12) || edge(13)) hoistView.set({ focus: (v.focus + FLAGS.length - 1) % FLAGS.length });
    if (edge(0) && !v.busy) void hoistFlag(FLAGS[hoistView.get().focus]!.symbol);
  }

  return {
    surface,
    inland: (x, z) => sys?.inland(x, z) ?? null,
    setup,
    get npcs() {
      return crowd?.list ?? [];
    },
    ids,
    script: (id) => thousandBoughNpcScript(id, q()),
    modal: () => modal,
    near: (x, z) => Math.hypot(x - THOUSAND_BOUGH.center.x, z - THOUSAND_BOUGH.center.z) < 700,
    updateNpcs(dt, at, eye) {
      if (crowd && Math.hypot(eye.x - THOUSAND_BOUGH.center.x, eye.z - THOUSAND_BOUGH.center.z) < 700)
        crowd.update(dt, at);
    },
    update(dt) {
      if (!sys) return;
      if (openBoardSoon && host.puzzleHost.canAct()) {
        openBoardSoon = false;
        void routing?.open();
      }
      if (hoistView.get().open) pollHoistPad();
      // The booths: inside one, its player sounds up close (and the island's music steps back).
      let booth: string | null = null;
      if (host.walking())
        for (const b of BOOTHS)
          if (Math.hypot(host.player.x - b.anchor.x, host.player.z - b.anchor.z) < 1.4) booth = b.id;
      if (booth !== inBooth) {
        inBooth = booth;
        // Inside a booth its player is clear and close; outside, the three are a faint blend.
        BOOTHS.forEach((b, i) => boothLoops[i]?.setGain(booth === b.id ? 0.9 : booth ? 0.02 : 0.05));
      }
      const eye = host.camera.position;
      setHearing(Math.hypot(eye.x - THOUSAND_BOUGH.center.x, eye.z - THOUSAND_BOUGH.center.z) < HEAR);
      // Now and then a parrot calls from the canopy (more often by the pools).
      if (hearing && host.walking() && (parrotIn -= dt) <= 0) {
        parrotIn = 25 + Math.random() * 40;
        const a = Math.random() * Math.PI * 2;
        sfx(
          'parrot_call',
          { x: host.player.x + Math.sin(a) * 18, y: host.player.y + 12, z: host.player.z + Math.cos(a) * 18 },
          0.35,
        );
      }
    },
    bottles: () =>
      Object.entries(bottleSite?.spots() ?? {}).map(([id, p]) => ({
        id,
        x: p.x,
        z: p.z,
        read: !!host.learn?.isChestOpen(id),
      })),
    debug: {
      ready: () => !!sys,
      routing: () => routing?.debug ?? null,
      hoist: () => ({ ...hoistView.get(), index: hoist?.index ?? -1 }),
      hoistFlag: (s: FlagSymbol) => hoistFlag(s),
      rideBasket: (up: boolean) => rideBasket(up),
      inBooth: () => inBooth,
      sealing: () => sealing,
      crownView: () => crownView,
    },
    dispose() {
      disposed = true;
      unwatchBranch?.();
      setHearing(false);
      crowd?.dispose();
      unmountHoist?.();
      if (bottleSite) {
        bottleSite.group.removeFromParent();
        bottleSite.dispose();
      }
      for (const id of ['gondola:bell', 'basket:bottom', 'basket:top', 'lantern:lever'])
        host.interactions.remove(id);
      for (const b of THOUSAND_BOUGH.bottles) host.interactions.remove(`bottle:${b.id}`);
    },
  };
}
