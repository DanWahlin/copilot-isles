import {
  Group,
  RenderTarget,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import {
  attribute,
  clamp,
  float,
  fract,
  fwidth,
  min,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import type { IslesAudio } from '../audio';
import { AMBIENT_BEDS } from '../audio/beds';
import type { SliceName } from '../audio/soundscape/bank';
import type { Engine } from '../engine/engine';
import type { Input } from '../engine/input';
import { createBrigantine, type Brigantine } from '../world/ship';
import { createCabin, type Cabin } from './cabin';
import { drawChartArt } from './chart-art';
import { CHART_ISLANDS, chartIsland, worldToPaper, type ChartIslandId } from './chart-map';
import { createChartPaper, rollRadius, type ChartPaper } from './chart-paper';
import { createIslandProps, type IslandProps } from './chart-props';
import { islandGeometry, runSliced, sampleIslandGrid, type IslandGrid } from './island-grid';
import {
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  flashIn,
  latchOpen,
  lidOpen,
  openingBeats,
  paperSettle,
  phase,
  popUp,
  unrollAmount,
  waterReach,
  type OpeningBeats,
  type OpeningKind,
} from './timeline';

/** Where the dive ends: a camera eye and look-at in the world, on one of the chart's islands. */
export interface DiveTarget {
  island: ChartIslandId;
  eye: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
}

export interface OpeningOptions {
  engine: Engine;
  input: Input;
  /** The audio engine once it's unlocked (null before the first gesture, or in tests). */
  audio: () => IslesAudio | null;
  /** Told when the opening starts or stops holding on the living chart for the load. */
  onHold?: (holding: boolean) => void;
  /** Told when the chest starts or stops waiting for the player to open it. */
  onPrompt?: (prompting: boolean) => void;
}

/** What's only known at Set sail (or Continue): set with `start()` once the opening's prepared. */
export interface OpeningStart {
  kind: OpeningKind;
  reduced: boolean;
  /** Engraved on the chest's nameplate. */
  captainName: string;
  sails: string | null;
}

export interface Opening {
  readonly kind: OpeningKind;
  /** Seconds since the cabin came up (tests). */
  readonly time: number;
  readonly holding: boolean;
  /** How long the cabin's compile took under the Set sail veil (tests). */
  readonly compileMs: number;
  /** The island's heavy build is done: the chest beat can play on (smoothly) from here. */
  release(): void;
  /** Fades the warm-dark veil down over the title (true) or up off the cabin (false). */
  veil(down: boolean, ms: number): Promise<void>;
  /**
   * Builds the cabin, the chart and its islands (CPU work, a little each frame), so it can run in
   * the background on the title and captain screens. Nothing touches the GPU until `play`.
   */
  prepare(): Promise<void>;
  /** Compiles the cabin's pipelines a piece per frame (captain screen); `play` waits for it. */
  warm(): Promise<void>;
  /** Sets the voyage's details and poses the first shot (after `prepare`). */
  start(details: OpeningStart): void;
  /** Under the veil: compiles and uploads everything (one hidden draw), then lifts the veil off the cabin. */
  play(): Promise<void>;
  /** E, Space, a click or tap, gamepad A: opens the chest when it's waiting, otherwise skips ahead. */
  press(): void;
  /** Skips ahead (Esc, the Skip button). */
  skip(): void;
  /** The chest is waiting to be opened (tests). */
  readonly prompting: boolean;
  /** Resolves once the beat has reached the living chart (where it holds for the load). */
  ready(): Promise<void>;
  /** The dive into the chart; resolves at the spray flash's peak, when the world takes over. */
  dive(target: DiveTarget): Promise<void>;
  /** Renders the world behind the cabin too (warming its uploads out of sight). */
  setDrawWorld(on: boolean): void;
  /** Removes the cabin; the flash fades off the world. */
  finish(): void;
  dispose(): void;
}

/** Seconds for the camera to ease in to the chest, and how long the chest waits before it opens itself. */
const APPROACH = 1.8;
const AUTO_OPEN = 12;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

/** A camera pose: eye and look-at. */
interface Pose {
  eye: Vector3;
  look: Vector3;
}

const pose = (ex: number, ey: number, ez: number, lx: number, ly: number, lz: number): Pose => ({
  eye: new Vector3(ex, ey, ez),
  look: new Vector3(lx, ly, lz),
});

export function createOpening(o: OpeningOptions): Opening {
  const { engine } = o;
  let kind: OpeningKind = 'voyage';
  let beats: OpeningBeats = openingBeats(kind);
  let reduced = false;
  const scene = new Scene();
  scene.name = 'opening';
  const camera = new PerspectiveCamera(40, engine.camera.aspect, 0.0004, 40);

  // ---- the DOM veils: warm dark (scene changes) and white spray (the dive) ----
  const veilEl = document.createElement('div');
  veilEl.className = 'ci-opening-veil';
  const flashEl = document.createElement('div');
  flashEl.className = 'ci-opening-flash';
  const sprayEl = document.createElement('div');
  sprayEl.className = 'ci-opening-spray';
  document.body.append(veilEl, flashEl, sprayEl);
  // The on-screen invitation over the lock: a glowing ring (≥ 44 px) you can click or tap, with
  // its words and keys below. E, Enter, Space and gamepad A press it too.
  const lockEl = document.createElement('button');
  lockEl.type = 'button';
  lockEl.className = 'ci-opening-lock';
  lockEl.setAttribute('aria-label', 'Open the chest');
  lockEl.tabIndex = -1;
  const lockLabel = document.createElement('span');
  lockLabel.textContent = 'Open the chest';
  const lockKeys = document.createElement('small');
  lockKeys.textContent = 'E · Space · click';
  lockLabel.append(lockKeys);
  lockEl.append(lockLabel);
  lockEl.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
  lockEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.append(lockEl);

  function setPrompt(on: boolean): void {
    if (on === prompting) return;
    prompting = on;
    lockEl.classList.toggle('show', on);
    lockEl.tabIndex = on ? 0 : -1;
    if (on) lockEl.focus({ preventScroll: true });
    o.onPrompt?.(on);
  }

  function open(): void {
    if (opened) return;
    opened = true;
    openedAt = performance.now();
    setPrompt(false);
  }

  const lockScreen = new Vector3();
  function placeLockButton(): void {
    if (!cabin) return;
    lockScreen.copy(cabin.chest.lockAt);
    cabin.chest.group.localToWorld(lockScreen);
    lockScreen.project(camera);
    const r = engine.renderer.domElement.getBoundingClientRect();
    lockEl.style.setProperty('--x', `${(r.left + (lockScreen.x * 0.5 + 0.5) * r.width).toFixed(1)}px`);
    lockEl.style.setProperty('--y', `${(r.top + (-lockScreen.y * 0.5 + 0.5) * r.height).toFixed(1)}px`);
  }

  /** Spray droplets bursting outward through the flash (CSS, started as the flash rises). */
  function spray(): void {
    sprayEl.replaceChildren();
    for (let i = 0; i < 22; i++) {
      const d = document.createElement('i');
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const r = 38 + Math.random() * 34;
      d.style.setProperty('--dx', `${Math.cos(a) * r}vmax`);
      d.style.setProperty('--dy', `${Math.sin(a) * r * 0.8}vmax`);
      d.style.setProperty('--s', `${0.6 + Math.random() * 1.6}`);
      d.style.animationDelay = `${(beats.dive - beats.flashLead * 0.6 + Math.random() * 0.25).toFixed(2)}s`;
      sprayEl.append(d);
    }
    sprayEl.classList.add('go');
  }

  let cabin: Cabin | null = null;
  let paper: ChartPaper | null = null;
  let ship: Brigantine | null = null;
  let props: IslandProps | null = null;
  const chartRoot = new Group();
  const rollPivot = new Group();
  const paperHolder = new Group();
  const islandsGroup = new Group();
  const islandRise = new Map<ChartIslandId, { value: number }>();
  const islandMeshes: Mesh[] = [];
  const islandMat: MeshStandardNodeMaterial[] = [];
  const chartAt = new Vector3();
  const shipAt = new Vector3();
  let rOut0 = rollRadius(0);

  let t = 0;
  let playing = false;
  let disposed = false;
  let holding = false;
  let readyResolve: (() => void) | null = null;
  let readyDone = false;
  let diving: {
    target: DiveTarget;
    time: number;
    from: Pose;
    to: Pose;
    c1: Vector3;
    c2: Vector3;
    resolve: () => void;
  } | null = null;
  let quickFlash: { time: number; resolve: () => void; target: DiveTarget } | null = null;
  let cueIndex = 0;
  /** The player skipped: the dive, when it comes, is just the flash. */
  let hurry = false;
  /** The beat holds at `beats.gate` (the establishing shot) until the flow says the build is done. */
  let released = false;
  let gated = 0;
  /** The player has opened the chest (or it opened itself after a while); Continue and reduced motion start open. */
  let opened = false;
  /** Seconds since the build finished (the camera eases in to the chest), and since the prompt showed. */
  let sinceRelease = -1;
  let promptTime = 0;
  let prompting = false;
  let openedAt = -1;

  // ---- camera shots (cabin metres; the desk top is y ≈ 0.8, chest at z ≈ -0.43) ----
  const WIDE = pose(0.05, 1.62, 2.55, 0, 1.0, -0.7);
  const CHEST = pose(0.12, 1.4, 1.48, 0, 0.95, -0.42);
  const RISE = pose(-0.05, 1.5, 1.35, 0, 1.12, -0.3);
  const OVER = pose(0.02, 1.68, 0.98, 0, 0.8, 0.1);
  const ALIVE = pose(-0.2, 1.36, 0.82, -0.14, 0.8, 0.15);
  const STILL = pose(0.0, 1.55, 1.25, 0, 0.84, -0.12);
  const cam: Pose = { eye: new Vector3(), look: new Vector3() };

  function blend(a: Pose, b: Pose, x: number, lift = 0): void {
    const e = easeInOutCubic(x);
    cam.eye.lerpVectors(a.eye, b.eye, e);
    cam.eye.y += Math.sin(e * Math.PI) * lift;
    cam.look.lerpVectors(a.look, b.look, e);
  }

  function shotAt(time: number): void {
    if (reduced) {
      cam.eye.copy(STILL.eye);
      cam.look.copy(STILL.look);
      return;
    }
    if (kind === 'continue') {
      cam.eye.copy(ALIVE.eye);
      cam.look.copy(ALIVE.look);
    } else if (time < beats.latch + 0.2) {
      // In to the chest once the island's built, then hold there while it waits to be opened.
      blend(WIDE, CHEST, sinceRelease < 0 ? 0 : Math.min(1, sinceRelease / APPROACH));
      cam.eye.y += Math.sin(gated * 0.5) * 0.004;
    } else if (time < beats.rise + 0.4) blend(CHEST, RISE, phase(time, beats.latch + 0.2, beats.rise + 0.4));
    else if (time < beats.unroll + 0.6) {
      blend(RISE, OVER, phase(time, beats.rise + 0.4, beats.unroll + 0.6), 0.05);
      // Keep an eye on the flying roll.
      tmpA.copy(rollPivot.position);
      rollPivot.parent?.localToWorld(tmpA);
      cam.look.lerp(tmpA, 0.35 * Math.sin(phase(time, beats.rise + 0.4, beats.unroll + 0.6) * Math.PI));
    } else if (time < beats.water) blend(OVER, OVER, 1);
    else blend(OVER, ALIVE, phase(time, beats.water, beats.ready));
    // Holding: a slow breath around the living chart.
    const breathe = Math.max(0, time - beats.ready);
    if (breathe > 0) {
      cam.eye.x += Math.sin(breathe * 0.23) * 0.05;
      cam.eye.y += Math.sin(breathe * 0.31) * 0.02;
      cam.eye.z += (1 - Math.cos(breathe * 0.17)) * -0.03;
    }
  }

  // ---- the beat ----
  function applyBeat(time: number): void {
    if (!cabin || !paper) return;
    const chest = cabin.chest;
    const full = kind === 'continue' || reduced;
    const lid = full ? 1 : lidOpen(time, beats);
    chest.hinge.rotation.x = -1.92 * lid;
    chest.hasp.rotation.x = (full ? 1 : latchOpen(time, beats)) * 1.25;
    // A small squash as the latch snaps and as the lid's weight comes off it (follow-through).
    const snap = full ? 0 : Math.max(0, 1 - Math.abs(time - beats.latch - 0.04) / 0.12);
    const heave = full ? 0 : Math.max(0, 1 - Math.abs(time - beats.lid) / 0.25);
    chest.group.scale.set(1 + snap * 0.012 + heave * 0.01, 1 - snap * 0.02 - heave * 0.018, 1 + snap * 0.012);
    cabin.puff.value = full ? 1 : phase(time, beats.lid + 0.1, beats.lid + 1.6);
    cabin.sparks.value = full
      ? 0.5
      : Math.min(1, Math.max(0, lid)) * (1 - 0.5 * phase(time, beats.riseEnd, beats.ready));
    chest.glow.value = full
      ? 0.35
      : Math.min(1, Math.max(0, lid)) * (0.35 + 0.65 * (1 - phase(time, beats.lidEnd, beats.ready)));

    // The roll: rises out of the chest, turns, arcs to the desk and lands with a small bounce.
    const un = full ? 1 : unrollAmount(time, beats);
    paper.unroll.value = un;
    paper.settle.value = full ? 0 : paperSettle(time, beats);
    const landing = tmpA.set(chartAt.x - paperW / 2, chartAt.y + rOut0, chartAt.z);
    if (full || time >= beats.unroll) {
      rollPivot.position.copy(landing);
      rollPivot.rotation.set(0, 0, 0);
    } else {
      const start = tmpB.copy(cabin.chestAt).add(cabin.chest.inside);
      const top = tmpC.copy(cabin.chestAt);
      top.y += 0.78;
      top.z += 0.1;
      const x = phase(time, beats.rise, beats.riseEnd);
      if (x < 0.42) {
        const e = easeOutBack(x / 0.42, 1.2);
        rollPivot.position.lerpVectors(start, top, e);
        rollPivot.rotation.set(0, Math.PI / 2, 0);
      } else {
        const y = (x - 0.42) / 0.58;
        const e = easeInOutCubic(y);
        rollPivot.position.lerpVectors(top, landing, e);
        rollPivot.position.y += Math.sin(e * Math.PI) * 0.12;
        rollPivot.rotation.set(0, (Math.PI / 2) * (1 - e), 0);
      }
      // A slow turn of the roll about its own axis as it travels.
      rollPivot.rotateZ(-x * 1.2);
    }
    rollPivot.visible = full || time >= beats.rise - 0.05;
    paper.water.value = full ? 1 : waterReach(time, beats);
    // The roll casts a shadow on the desk; once flat, the sheet mustn't shadow its own swell.
    paper.mesh.castShadow = un < 0.999;
    for (const src of CHART_ISLANDS) {
      const r = islandRise.get(src.id);
      if (r)
        r.value = full
          ? 1
          : Math.min(
              1.25,
              phase(
                time,
                src.id === 'anchorage' ? beats.anchorage : beats.meridian,
                (src.id === 'anchorage' ? beats.anchorage : beats.meridian) + 1.1,
              ),
            );
    }
    for (const m of islandMeshes) m.visible = full || time > beats.anchorage + 0.04;
    if (props) {
      props.rise.value = full ? 1 : phase(time, beats.anchorage + 0.8, beats.meridian + 2.0);
      props.lamp.value = full ? 1 : phase(time, beats.meridian + 1.6, beats.ready);
      props.fog.value = full ? 1 : phase(time, beats.water + 0.6, beats.water + 1.6);
    }
    if (ship) {
      const s = full ? 1 : popUp(time, beats.ship, 0.7);
      // Always drawn (tiny until it pops up), so its late-loading figurehead uploads before warm-up ends.
      ship.group.scale.setScalar(shipScale * Math.max(1e-4, s));
      ship.uniforms.trim.value = full ? 1 : easeOutCubic(phase(time, beats.ship + 0.5, beats.ship + 1.6));
    }
  }

  type Cue = readonly [at: number, name: SliceName, gain: number];
  let CUES: readonly Cue[] = [];
  const buildCues = (): readonly Cue[] =>
    kind === 'continue' || reduced
      ? []
      : [
          [beats.latch - 0.02, 'opening_latch', 1],
          [beats.lid - 0.12, 'opening_lid', 0.9],
          [beats.lid + 0.12, 'opening_poof', 0.55],
          [beats.lid + 0.3, 'opening_magic', 0.75],
          [beats.rise + 0.1, 'opening_paper', 0.55],
          [beats.unroll + 0.15, 'opening_paper', 0.9],
          [beats.unrollEnd - 0.05, 'opening_popup', 0.4],
          [beats.water, 'opening_water', 0.9],
          [beats.anchorage + 0.05, 'opening_popup', 0.8],
          [beats.meridian + 0.05, 'opening_popup', 0.7],
          [beats.anchorage + 1.0, 'opening_popup', 0.45],
          [beats.ship + 0.5, 'opening_sail', 0.8],
        ];

  function cues(time: number): void {
    const audio = o.audio();
    if (!audio) return;
    while (cueIndex < CUES.length && time >= CUES[cueIndex]![0]) {
      const [, name, gain] = CUES[cueIndex]!;
      audio.sfx.oneShot(name, undefined, gain);
      cueIndex++;
    }
  }

  /** Seconds the cabin has been on screen (the lantern, flames, dust and water run on it). */
  let ambient = 0;
  let nextCreak = 0.3;
  /** The lantern creaks at the ends of its swing, every other swing, until the chart's out. */
  function lanternCreaks(): void {
    if (reduced || kind === 'continue' || ambient < nextCreak) return;
    if (t < beats.unroll) o.audio()?.sfx.oneShot('opening_lantern', undefined, 0.4);
    nextCreak += 4.8;
  }

  let paperW = 1;
  let shipScale = 1;
  const removeSystem = engine.add({
    frame(dt) {
      if (!playing || disposed || !cabin || !paper) return;
      // The beat keeps real time while the island loads (a long frame skips ahead a little, up to 0.1 s).
      const step = Math.min(dt, 0.1);
      const s = o.input.poll();
      if (s.menu && t > 0.5) api.skip();
      else if ((s.interact || s.jump) && t > 0.5) api.press();
      if (!diving && !quickFlash) {
        // The beat waits at the gate: first on the wide shot for the island's heavy build (it hides
        // frozen frames), then on the chest until the player opens it (or it opens by itself).
        if (released && sinceRelease < 0) sinceRelease = 0;
        if (sinceRelease >= 0) sinceRelease += step;
        const approached = sinceRelease >= APPROACH;
        if (!(released && opened && approached) && t + step >= beats.gate) {
          t = Math.max(t, beats.gate);
          gated += step;
        } else t += step;
        const invite = !opened && approached && t <= beats.gate + 1e-4;
        if (invite) {
          promptTime += step;
          if (promptTime >= AUTO_OPEN) open();
        }
        setPrompt(invite && !opened);
        const breath = 0.5 - 0.5 * Math.cos(promptTime * 3.2);
        const glowTo = prompting ? 0.55 + 0.45 * breath : 0;
        cabin.chest.lockGlow.value += (glowTo - cabin.chest.lockGlow.value) * Math.min(1, step * 4);
        cabin.chest.keyhole.value = prompting
          ? 0.4 + 0.25 * breath
          : released
            ? Math.max(0, cabin.chest.keyhole.value - step * 1.5)
            : keyholePulse(gated);
        if (prompting) placeLockButton();
        const waiting = !released && gated > 6 && !opened;
        if (t >= beats.ready && !readyDone) {
          readyDone = true;
          readyResolve?.();
        }
        const hold = (t >= beats.ready && !diving) || waiting;
        if (hold !== holding) {
          holding = hold;
          o.onHold?.(hold);
        }
      }
      applyBeat(t);
      cues(t);
      paper.time.value += step;
      // The room lives on its own clock (the beat's stops while it waits for the build or a click).
      ambient += step;
      props?.update(step, ambient);
      cabin.update(step, ambient, reduced);
      lanternCreaks();
      if (diving) {
        const before = diving.time;
        diving.time += step;
        const cueAt = Math.max(0, beats.dive - 2.05);
        if (before < cueAt + 1e-6 && diving.time >= cueAt)
          o.audio()?.sfx.oneShot('opening_whoosh', undefined, 0.9);
        const x = Math.min(1, diving.time / beats.dive);
        const e = x * x * (3 - 2 * x) * 0.35 + easeInOutCubic(x) * 0.65;
        cubic(diving.from.eye, diving.c1, diving.c2, diving.to.eye, e, cam.eye);
        cam.look.lerpVectors(diving.from.look, diving.to.look, easeInOutCubic(Math.min(1, x * 1.25)));
        flashEl.style.opacity = String(flashIn(diving.time, beats));
        if (x >= 1) {
          const done = diving.resolve;
          diving = null;
          done();
        }
      } else if (quickFlash) {
        quickFlash.time += step;
        const f = Math.min(1, quickFlash.time / 0.35);
        flashEl.style.opacity = String(f * f * (3 - 2 * f));
        if (f >= 1) {
          const done = quickFlash.resolve;
          quickFlash = null;
          done();
        }
        shotAt(t);
      } else shotAt(t);
      camera.aspect = engine.camera.aspect;
      camera.updateProjectionMatrix();
      camera.position.copy(cam.eye);
      camera.lookAt(cam.look);
      camera.updateMatrixWorld();
      cabin.setCamera(camera);
    },
  });

  const cutscene = {
    drawWorld: false,
    render() {
      engine.renderer.render(scene, camera);
    },
  };

  /** Builds everything (see `prepare`); `disposed` checks stop it if the voyage is abandoned. */
  async function build(): Promise<void> {
    const grids: IslandGrid[] = [];
    // A few milliseconds a frame, so the title and captain screens keep their frame rate.
    for (const src of CHART_ISLANDS) grids.push(await runSliced(sampleIslandGrid(src), sliceBudget));
    if (disposed) return;
    await document.fonts?.ready;
    const art = drawChartArt(grids);
    // Sun shadows only where the tier has them (the world's sky makes the same choice, so the
    // renderer's shadow switch, and so every pipeline, stays as compiled).
    const shadows = engine.tier.shadowCascades > 0;
    if (shadows) engine.renderer.shadowMap.enabled = true;
    const slices = { lite: 0, low: 8, medium: 14, high: 20, ultra: 24 }[engine.tier.tier];
    cabin = createCabin({
      shadowMap: shadows ? Math.min(2048, engine.tier.shadowMap || 1024) : 0,
      shaftSlices: slices,
      captainName: '',
    });
    scene.add(cabin.group);
    paper = createChartPaper(art);
    paperW = 1.0;
    rOut0 = rollRadius(0);
    chartAt.set(0, cabin.deskY + 0.0058, 0.17);
    paperHolder.position.set(paperW / 2, -rOut0, 0);
    paper.mesh.castShadow = true;
    paper.mesh.receiveShadow = true;
    paperHolder.add(paper.mesh);
    rollPivot.add(paperHolder);
    chartRoot.add(rollPivot);
    islandsGroup.position.copy(chartAt);
    chartRoot.add(islandsGroup);
    scene.add(chartRoot);
    for (const g of grids) {
      const rise = uniform(0);
      islandRise.set(g.src.id, rise);
      const geo: BufferGeometry = islandGeometry(g);
      const mat = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
      // Pop-up: the middle stands first and the coast last, each part overshooting a touch.
      const x = clamp(rise.sub(attribute('spread', 'float').mul(0.35)).div(0.65), 0, 1);
      const back = float(1)
        .add(float(2.6).mul(x.sub(1).pow(3)))
        .add(float(1.6).mul(x.sub(1).pow(2)));
      mat.positionNode = vec3(positionLocal.x, positionLocal.y.mul(back), positionLocal.z);
      // Ink contour lines every 8 m, like the chart's own hand: the drawing rising into relief.
      const hm = attribute('hm', 'float');
      const v = hm.div(8);
      const d = min(fract(v), float(1).sub(fract(v)));
      const w = fwidth(v);
      const line = float(1)
        .sub(smoothstep(w.mul(0.6), w.mul(1.6), d))
        .mul(smoothstep(1, 2.5, hm))
        .mul(smoothstep(0.35, 0.9, rise));
      mat.colorNode = vec3(1).mul(float(1).sub(line.mul(0.55)));
      const m = new Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `chart ${g.src.id}`;
      islandsGroup.add(m);
      islandMeshes.push(m);
      islandMat.push(mat);
    }
    props = createIslandProps(grids, false);
    islandsGroup.add(props.group);
    // The tiny brigantine, sailing in to Anchorage from the north (the real ship, scaled down).
    ship = createBrigantine({ tier: 'lite' });
    const anchorage = chartIsland('anchorage');
    worldToPaper(anchorage, -55, 0, -265, shipAt);
    shipScale = anchorage.scale * 5;
    ship.group.position.set(shipAt.x, 0.0006, shipAt.z);
    ship.group.rotation.y = Math.PI * 0.94;
    islandsGroup.add(ship.group);
    applyBeat(kind === 'continue' || reduced ? 99 : 0);
    shotAt(0);
    camera.position.copy(cam.eye);
    camera.lookAt(cam.look);
    prepared = true;
  }

  let preparing: Promise<void> | null = null;
  /** Main-thread time per frame for the background build; Infinity once the Set sail veil is down. */
  const sliceBudget = { ms: 8 };
  /** Under the veil: whatever's left of the build and compile runs flat out. */
  let flatOut = false;
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  let warming: Promise<void> | null = null;
  /**
   * Compiles the cabin's pipelines (asynchronously, with everything showing, so nothing compiles
   * mid-beat). Started on the captain screen, it's done well before Set sail.
   */
  async function warmUp(): Promise<void> {
    await api.prepare();
    if (disposed) return;
    const hidden: { visible: boolean }[] = [];
    scene.traverse((obj) => {
      if (!obj.visible) {
        hidden.push(obj);
        obj.visible = true;
      }
    });
    // One piece at a time with a short break between (not a whole frame), so the captain screen
    // never freezes on one long compile, and it still finishes quickly.
    const pieces: Mesh[] = [];
    scene.traverse((obj) => {
      if ((obj as Mesh).isMesh || (obj as { isLine?: boolean }).isLine) pieces.push(obj as Mesh);
    });
    for (const piece of pieces) {
      if (disposed) break;
      await engine.renderer.compileAsync(piece, camera, scene);
      if (!flatOut) await yieldNow();
    }
    // One draw into a tiny offscreen target: the sun's shadow pass compiles and every texture
    // (the chart's ink, the nameplate) uploads now, not under the Set sail veil.
    if (!disposed && !flatOut) {
      const rt = new RenderTarget(8, 8);
      const before = engine.renderer.getRenderTarget();
      engine.renderer.setRenderTarget(rt);
      engine.renderer.render(scene, camera);
      engine.renderer.setRenderTarget(before);
      rt.dispose();
    }
    for (const h of hidden) h.visible = false;
  }
  let prepared = false;
  let compileMs = 0;
  const api: Opening = {
    get kind() {
      return kind;
    },
    get time() {
      return t;
    },
    get holding() {
      return holding;
    },
    get prompting() {
      return prompting;
    },
    get compileMs() {
      return compileMs;
    },
    release() {
      released = true;
    },
    veil(down, ms) {
      veilEl.style.transitionDuration = `${ms}ms`;
      veilEl.style.opacity = down ? '1' : '0';
      return new Promise((r) => window.setTimeout(r, ms));
    },
    prepare() {
      preparing ??= build();
      return preparing;
    },
    warm() {
      warming ??= warmUp();
      return warming;
    },
    start(details) {
      kind = details.kind;
      reduced = details.reduced;
      beats = openingBeats(kind);
      CUES = buildCues();
      released = kind === 'continue';
      opened = kind === 'continue' || reduced;
      sinceRelease = -1;
      promptTime = 0;
      openedAt = -1;
      setPrompt(false);
      t = 0;
      cueIndex = 0;
      ambient = 0;
      nextCreak = 0.3;
      cabin?.setCaptainName(details.captainName);
      ship?.setSails(details.sails);
      applyBeat(kind === 'continue' || reduced ? 99 : 0);
      shotAt(0);
      camera.aspect = engine.camera.aspect;
      camera.updateProjectionMatrix();
      camera.position.copy(cam.eye);
      camera.lookAt(cam.look);
      camera.updateMatrixWorld();
    },
    async play() {
      sliceBudget.ms = Infinity;
      flatOut = true;
      await api.prepare();
      if (disposed || !prepared) return;
      const t0 = performance.now();
      await api.warm();
      compileMs = performance.now() - t0;
      if (disposed) return;
      // One draw with everything showing, under the veil: every geometry and texture uploads now.
      const hidden: { visible: boolean }[] = [];
      scene.traverse((obj) => {
        if (!obj.visible) {
          hidden.push(obj);
          obj.visible = true;
        }
      });
      engine.renderer.render(scene, camera);
      for (const h of hidden) h.visible = false;
      applyBeat(kind === 'continue' || reduced ? 99 : 0);
      engine.cutscene = cutscene;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (disposed) return;
      playing = true;
      const audio = o.audio();
      if (audio) {
        const sfx = audio.sfx;
        sfx.preload(['opening_whoosh', 'opening_spray', ...CUES.map((c) => c[1])]);
        // Inside the cabin: timbers creak; the open sea outside is muffled.
        sfx.setBed('opening_cabin', 0.55);
        sfx.setBed('wind', AMBIENT_BEDS.wind * 0.25);
        sfx.setBed('surf_far', AMBIENT_BEDS.surf_far * 0.4);
      }
      void api.veil(false, beats.fadeIn * 1000);
    },
    press() {
      if (disposed || quickFlash) return;
      // The first press opens the chest (now, or as soon as it's ready); later ones skip ahead.
      if (!opened) return open();
      if (performance.now() - openedAt < 450) return;
      api.skip();
    },
    skip() {
      if (quickFlash || disposed) return;
      opened = true;
      setPrompt(false);
      if (t < beats.ready) {
        // Straight to the living chart (through a quick warm dip, not a hard cut).
        const to = beats.ready;
        void api.veil(true, 200).then(() => {
          t = to;
          cueIndex = 99;
          void api.veil(false, 380);
        });
      }
      hurry = true;
      // Mid-dive: cut to the flash from where the camera is.
      if (diving) {
        quickFlash = {
          time: Number(flashEl.style.opacity || 0) * 0.35,
          resolve: diving.resolve,
          target: diving.target,
        };
        diving = null;
      }
    },
    ready() {
      if (readyDone) return Promise.resolve();
      return new Promise((r) => (readyResolve = r));
    },
    dive(target) {
      return new Promise((resolve) => {
        holding = false;
        o.onHold?.(false);
        const isl = chartIsland(target.island);
        const to: Pose = { eye: new Vector3(), look: new Vector3() };
        const p = { x: 0, y: 0, z: 0 };
        worldToPaper(isl, target.eye.x, target.eye.y, target.eye.z, p);
        to.eye.set(p.x, p.y, p.z).add(chartAt);
        worldToPaper(isl, target.look.x, target.look.y, target.look.z, p);
        to.look.set(p.x, p.y, p.z).add(chartAt);
        if (reduced || hurry) {
          // Reduced motion (or a skip): no dive, just a short crossfade into the world.
          if (reduced) flashEl.classList.add('reduced');
          quickFlash = { time: 0, resolve, target };
          return;
        }
        const from: Pose = { eye: cam.eye.clone(), look: cam.look.clone() };
        // Plunge into the chart's sea along the flyover's opening heading, pitched down through the
        // surface (the spray flash hides the turn to the world's level view).
        const heading = tmpA.copy(to.look).sub(to.eye).setY(0).normalize();
        const surface = to.eye.clone().setY(chartAt.y + 0.0015);
        to.eye
          .copy(surface)
          .addScaledVector(heading, -0.012)
          .setY(chartAt.y + 0.012);
        to.look.copy(surface).addScaledVector(heading, 0.03);
        const c1 = from.eye.clone().lerp(to.eye, 0.3);
        c1.y += 0.16;
        const c2 = to.eye.clone().addScaledVector(heading, -0.18);
        c2.y += 0.14;
        spray();
        diving = { target, time: 0, from, to, c1, c2, resolve };
      });
    },
    setDrawWorld(on) {
      cutscene.drawWorld = on;
    },
    finish() {
      api.dispose();
      flashEl.style.transitionDuration = reduced ? '600ms' : '900ms';
      flashEl.style.opacity = '0';
      const sfx = o.audio()?.sfx;
      if (sfx && !reduced) {
        sfx.oneShot('opening_spray', undefined, 1);
        sfx.oneShot('big_splash', undefined, 0.25);
      }
      window.setTimeout(() => flashEl.remove(), 1000);
      window.setTimeout(() => sprayEl.remove(), 2000);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      // Out on the open sea again.
      const beds = o.audio()?.sfx;
      if (beds) {
        beds.setBed('opening_cabin', 0);
        beds.setBed('wind', AMBIENT_BEDS.wind);
        beds.setBed('surf_far', AMBIENT_BEDS.surf_far);
      }
      removeSystem();
      if (engine.cutscene === cutscene) engine.cutscene = null;
      veilEl.remove();
      lockEl.remove();
      if (!flashEl.style.opacity || flashEl.style.opacity === '0') sprayEl.remove();
      cabin?.dispose();
      paper?.dispose();
      ship?.dispose();
      props?.dispose();
      for (const m of islandMeshes) m.geometry.dispose();
      for (const m of islandMat) m.dispose();
      scene.clear();
    },
  };
  return api;
}

/** The keyhole's glow while the chest waits: a slow breath, brightening a little the longer it waits. */
function keyholePulse(waited: number): number {
  const breath = 0.5 - 0.5 * Math.cos(waited * 2.4);
  return Math.min(1, waited / 1.5) * (0.35 + 0.65 * breath) * Math.min(1, 0.6 + waited * 0.04);
}

function cubic(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, x: number, out: Vector3): Vector3 {
  const u = 1 - x;
  const a = u * u * u;
  const b = 3 * u * u * x;
  const c = 3 * u * x * x;
  const d = x * x * x;
  out.set(
    p0.x * a + p1.x * b + p2.x * c + p3.x * d,
    p0.y * a + p1.y * b + p2.y * c + p3.y * d,
    p0.z * a + p1.z * b + p2.z * c + p3.z * d,
  );
  return out;
}
