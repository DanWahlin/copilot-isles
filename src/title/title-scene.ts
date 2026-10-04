import { Vector3 } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { createOcean } from '../world/ocean/ocean';
import { createSky } from '../world/sky/sky-system';
import { createDistantRanges } from '../world/terrain/distant-ranges';
import { createBrigantine, gullPerches, type BrigantineEnv } from '../world/ship';
import type { LeapsSystem, ScreenRect } from '../world/life/leaps';
import type { BirdsSystem } from '../world/life/birds';
import { world } from '../world/uniforms';
import { bindTitleDrag, TitleOrbit } from './title-orbit';
import type { TierSettings } from '../engine/quality';
import { createTitleWordmarkGull } from './title-wordmark-gull';

export interface TitleBackdrop {
  setAvoidRects(rects: ScreenRect[]): void;
  /** Flies the voyage's sail palette (Paint Your Sails). */
  setSails(paletteId: string | null): void;
  /** Whether dragging the scene turns the view (only while the title menu itself is showing). */
  setInteractive(on: boolean): void;
  /** Drag-to-look state, for tests. */
  readonly orbit: TitleOrbit;
  dispose(): void;
}

/**
 * The title backdrop (PLAN §13.5, POC §3.1): open ocean, sky, and your brigantine at anchor,
 * swinging gently on its rope, with distant tropical islands in the haze and a slow golden-hour orbit.
 * Anchorage Cay still streams after New Voyage; the horizon islands are one merged, lit mesh.
 * The ship sits right of centre so the menu column on the left stays clear. Dragging turns the view
 * round the ship (title-orbit.ts), and the wheel zooms.
 */
export function createTitleBackdrop(engine: Engine): TitleBackdrop {
  const { renderer, scene, tier, camera, clock } = engine;
  const backdropTier = titleBackdropTier(tier);
  const sky = createSky(renderer, scene, backdropTier, engine.backend, { title: true });
  const ocean = createOcean({ tier: backdropTier, env: sky.env });
  const ranges = createDistantRanges(backdropTier);
  const ship = createBrigantine({ tier: tier.tier });
  const anchor = { x: 0, z: 0, heading: 2.3 };
  let leaps: LeapsSystem | null = null;
  let birds: BirdsSystem | null = null;
  const wordmarkGull = createTitleWordmarkGull(undefined, { object: ship.group, perches: gullPerches() });
  let disposed = false;
  let avoidRects = titleAvoidRects();
  const loadLeaps = async () => {
    if (disposed || backdropTier.leaps <= 0) return;
    const { createLeaps } = await import('../world/life/leaps');
    if (disposed) return;
    const created = createLeaps({ tier: backdropTier, titleMode: true, avoidRects });
    await renderer.compileAsync(created.group, camera);
    if (disposed) {
      created.dispose();
      return;
    }
    leaps = created;
    scene.add(created.group);
  };
  // A few gulls wheeling far off over the sea (Tidewater's flock), loaded after first paint so the
  // title's first frame and program budget stay as they were.
  // The flock's centre rides ~180 m out in front of the orbiting camera (a little right, over the
  // open sea beside the ship), so the gulls wheel in the distance whichever way the view turns.
  const flockCenter = new Vector3();
  const loadBirds = async () => {
    if (disposed || backdropTier.birds <= 0) return;
    const { createBirds } = await import('../world/life/birds');
    if (disposed) return;
    const created = createBirds({
      tier: { ...backdropTier, birds: Math.min(backdropTier.birds, 2) },
      perches: [],
      center: flockCenter,
      radius: 90,
      altitude: [10, 32],
      scale: 0.9,
      seed: 0x6a11,
    });
    await renderer.compileAsync(created.group, camera);
    if (disposed) {
      created.dispose();
      return;
    }
    birds = created;
    scene.add(created.group);
  };
  const lazyBirdsTimer = typeof window !== 'undefined' ? window.setTimeout(() => void loadBirds(), 2500) : 0;
  const lazyLeapsTimer = typeof window !== 'undefined' ? window.setTimeout(() => void loadLeaps(), 4000) : 0;
  ship.dynamics.reset(anchor.x, anchor.z, anchor.heading);
  scene.add(ocean.mesh, ranges, ship.group);
  scene.add(wordmarkGull.group);
  if (typeof window !== 'undefined') {
    (window as unknown as { __dev: object }).__dev = {
      ready: true,
      stats: () => ({ wordmarkGull: wordmarkGull.stats(), birds: birds ? 1 : 0 }),
    };
  }

  const shipEnv: BrigantineEnv = { waves: ocean.field, ground: null, obstacles: [], t: 0 };

  clock.set(17.1, -35);
  sky.invalidate();
  camera.fov = 42;
  camera.updateProjectionMatrix();

  const focus = new Vector3();
  const look = new Vector3();
  const orbit = new TitleOrbit(0.35);
  let interactive = true;
  const unbind = bindTitleDrag(renderer.domElement, orbit, () => interactive);
  const remove = engine.add(
    {
      frame(dt, t) {
        // Swing on the anchor rope: slow yaw and a little drift around the anchor.
        const pose = ship.dynamics.pose;
        pose.heading = anchor.heading + Math.sin(t * 0.07) * 0.22 + Math.sin(t * 0.023) * 0.12;
        pose.x = anchor.x + Math.sin(t * 0.05) * 1.2;
        pose.z = anchor.z + Math.cos(t * 0.04) * 1.0;
        shipEnv.t = t;
        ship.update(dt, t, shipEnv);

        orbit.update(dt, world.reducedMotion.value > 0.5);
        const r = orbit.radius;
        const yaw = orbit.yaw;
        camera.position.set(Math.sin(yaw) * r, orbit.height + Math.sin(t * 0.11) * 0.4, Math.cos(yaw) * r);
        // Aim left of the ship so it sits right of centre, clear of the menu column. Looking down from
        // higher up, aim a little lower so the ship stays framed.
        const sx = Math.cos(yaw),
          sz = -Math.sin(yaw);
        const side = 14 * (r / 58);
        look.set(anchor.x - sx * side, 9 - (orbit.height - 7.5) * 0.35, anchor.z - sz * side);
        camera.lookAt(look);

        ocean.update(camera);
        updateTitleRects(leaps);
        wordmarkGull.update(dt, t, camera);
        leaps?.update(dt, t, camera);
        if (birds) {
          const fx = look.x - camera.position.x,
            fz = look.z - camera.position.z;
          const fl = Math.hypot(fx, fz) || 1;
          flockCenter.set(
            camera.position.x + (fx / fl) * 180 - (fz / fl) * 30,
            0,
            camera.position.z + (fz / fl) * 180 + (fx / fl) * 30,
          );
          birds.update(dt, t, camera);
        }
        focus.set(camera.position.x, 0, camera.position.z);
        sky.update(clock, focus, dt, camera);
      },
    },
    true,
  );

  return {
    setAvoidRects(rects: ScreenRect[]) {
      avoidRects = rects;
      leaps?.setAvoidRects(rects);
    },
    setSails(paletteId: string | null) {
      ship.setSails(paletteId);
    },
    setInteractive(on: boolean) {
      interactive = on;
      wordmarkGull.setEnabled(on);
      if (!on && orbit.dragging) orbit.up(performance.now() / 1000);
      renderer.domElement.style.cursor = on ? 'grab' : '';
    },
    orbit,
    dispose() {
      disposed = true;
      unbind();
      if (lazyLeapsTimer) window.clearTimeout(lazyLeapsTimer);
      if (lazyBirdsTimer) window.clearTimeout(lazyBirdsTimer);
      remove();
      scene.remove(ocean.mesh, ranges, ship.group);
      scene.remove(wordmarkGull.group);
      if (leaps) scene.remove(leaps.group);
      leaps?.dispose();
      if (birds) scene.remove(birds.group);
      birds?.dispose();
      wordmarkGull.dispose();
      ship.dispose();
      ocean.dispose();
      sky.dispose();
      ranges.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
    },
  };
}

function updateTitleRects(leaps: LeapsSystem | null): void {
  leaps?.setAvoidRects(titleAvoidRects());
}

function titleBackdropTier(tier: TierSettings): TierSettings {
  if (tier.tier !== 'high' && tier.tier !== 'ultra') return { ...tier, leaps: 0 };
  return {
    ...tier,
    shadowCascades: 0,
    shadowMap: 0,
    dynamicShadows: false,
    cloudShadowRes: 0,
    ssao: false,
    bloom: false,
    leaps: 0,
  };
}

function titleAvoidRects(): ScreenRect[] {
  if (typeof window === 'undefined') return [{ x: 0, y: 0, w: 430, h: 720 }];
  const w = window.innerWidth;
  const h = window.innerHeight;
  return [
    { x: 0, y: 0, w: Math.min(460, w * 0.42), h },
    { x: Math.max(0, w * 0.5 - 260), y: Math.max(0, h - 150), w: 520, h: 150 },
  ];
}
