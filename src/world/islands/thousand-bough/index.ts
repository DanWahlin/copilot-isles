import { Group, type Camera, type Vector3 } from 'three/webgpu';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle, HeightField } from '../../contracts';
import type { PlantInstance } from '../../vegetation/types';
import type { VillageAnchor, VillageKit } from '../../village/kit';
import type { TbAnchorName, ThousandBoughSystem } from './contract';
import { thousandBoughWater } from './height';
import { THOUSAND_BOUGH } from './layout';
import { BEACON_Y } from './set-pieces';
import { createThousandBoughWaterMesh } from './water-mesh';
import type { CameraBlockerBox } from '../../terrain/camera-blockers';
import { branchCameraBoxes, createBanyan } from './tree';
import { thousandBoughPlantsSliced } from './vegetation';
import { createMist, type Mist } from './mist';
import type { ThousandBoughRocks } from './rocks';
import { createGlows, type Glow, type Glows } from '../../life/fireflies';
import { mulberry32 } from '../../../util/math';
import { thousandBoughHeight } from './height';
import { WalkClearance } from './village/clearance';
import { createTreeVillage } from './village';
import { wharfShipObstacles } from './village/structure';
import { LATE_BRIDGES, villageWalkable, type WalkHit } from './village/surfaces';

/** The island's anchors (§3.7) as village anchors: NPC stands, interaction spots and cameras. */
export function thousandBoughAnchors(): Record<TbAnchorName, VillageAnchor> {
  const out = {} as Record<TbAnchorName, VillageAnchor>;
  for (const [name, a] of Object.entries(THOUSAND_BOUGH.anchors))
    out[name as TbAnchorName] = { x: a.x, y: a.y, z: a.z, heading: a.heading };
  return out;
}

/**
 * Step 0's stub of the island's system: the anchors and an empty group. The views resolve at once
 * and do nothing, so the content can be built against the real contract before the world exists.
 */
export function createThousandBoughStub(): ThousandBoughSystem {
  const group = new Group();
  group.name = 'thousand-bough';
  const done = () => Promise.resolve();
  const none = () => {};
  return {
    group,
    anchors: thousandBoughAnchors(),
    walkable: () => null,
    surfaceKind: () => 'grass',
    colliders: () => [],
    circles: () => [],
    cameraBoxes: () => [],
    inland: () => null,
    flume: {
      setRound: done,
      setBoard: none,
      setCursor: none,
      tileCenter(row: number, col: number, out: Vector3) {
        const f = THOUSAND_BOUGH.flume;
        return out.set(f.cols[col] ?? f.center.x, f.rowY[row] ?? 22, f.rows[row] ?? f.center.z);
      },
      demoSharedTrough: done,
      runFlows: done,
      resetWater: none,
    },
    spire: { playJam: done, openSecondBridge: done, preview: none },
    mast: { hoist: done, lowerAll: none },
    fx: { sealCascade: done, gondolaSend: done, lanternHouse: none, skyBasketEnabled: none },
    update: none,
    dispose: none,
  };
}

/** Fireflies per tier (spec §9.8), and halos round the lanterns (none on Lite). */
const FIREFLIES: Record<TierSettings['tier'], number> = {
  lite: 0,
  low: 120,
  medium: 420,
  high: 800,
  ultra: 1100,
};

function glowPoints(tier: TierSettings, lanterns: readonly { x: number; y: number; z: number }[]): Glow[] {
  const out: Glow[] = [];
  if (tier.tier !== 'lite')
    for (const l of lanterns) out.push({ x: l.x, y: l.y, z: l.z, wander: 0, size: 0.62, kind: 1 });
  // The Crown Beacon's own glow: the first light the Seal's wave reaches.
  if (tier.tier !== 'lite')
    out.push({
      x: THOUSAND_BOUGH.tree.x,
      y: BEACON_Y,
      z: THOUSAND_BOUGH.tree.z,
      wander: 0,
      size: 7,
      kind: 1,
    });
  const rand = mulberry32(0xf1ef);
  const water = thousandBoughWater();
  const n = FIREFLIES[tier.tier];
  // Low over the valley round the tree, the Fern Walk and the pools.
  const hubs = [
    { x: THOUSAND_BOUGH.tree.x, z: THOUSAND_BOUGH.tree.z, r: 80 },
    { x: 1925, z: -1495, r: 40 },
    { x: 1960, z: -1470, r: 45 },
    { x: 2120, z: -1600, r: 40 },
    // Thickest low over the water: the Booth Pools, the Mirror Pool, the Silver Thread's pool.
    { x: 1918, z: -1499, r: 22 },
    { x: 2135, z: -1612, r: 24 },
    { x: 1880, z: -1610, r: 16 },
  ];
  for (let i = 0; i < n; i++) {
    const h = hubs[i % hubs.length]!;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * h.r;
    const x = h.x + Math.cos(a) * r;
    const z = h.z + Math.sin(a) * r;
    const ground = thousandBoughHeight(x, z);
    if (ground < 1) continue;
    out.push({
      x,
      y: Math.max(ground, water.levelAt(x, z) ?? ground) + 0.35 + rand() * rand() * 3.2,
      z,
      wander: 0.8 + rand() * 1.6,
      size: 0.14 + rand() * 0.08,
      kind: 0,
    });
  }
  return out;
}

/**
 * The Seal's cascade (spec §4.4): the lantern halos light from the Beacon down, deck by deck, over 6 s
 * (they're dim until then), the fireflies rise in a slow spiral, and the mist thins by 30 %, over 10 s
 * (all at once with reduced motion, over 2 s).
 */
async function glowsCascade(glows: Glows | null, mist: Mist | null, reducedMotion: boolean): Promise<void> {
  const seconds = reducedMotion ? 2 : 10;
  const wave = reducedMotion ? 2 : 6;
  const start = performance.now();
  await new Promise<void>((done) => {
    const step = () => {
      const s = (performance.now() - start) / 1000;
      const k = Math.min(1, s / seconds);
      glows?.setStrength(1 + k * 0.6);
      glows?.setHalos(HALO_REST, Math.min(1, s / wave) * 1.1);
      if (!reducedMotion) glows?.setRise(k * 14);
      mist?.setDensity(1 - 0.3 * k);
      if (k < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

/** How bright the lantern halos are before the Seal lights them. */
const HALO_REST = 0.12;

/** What the stream needs beyond the contract: the ship's obstacles, the plants, and a per-frame camera. */
export interface ThousandBoughWorld extends ThousandBoughSystem {
  /** The wharf's piles and the cove's rocks, for the ship. */
  shipObstacles(): CircleObstacle[];
  /** The island's plants (the jungle), built a slice at a time, for `vegetation.addPlants`. */
  plants(breathe: () => Promise<void>): Promise<PlantInstance[]>;
  /** Picks levels of detail for the camera (no allocation). */
  frame(camera: Camera): void;
  /** The Sky Basket's cage along its ride (0 the Root Hall, 1 the Crown), for the lift's transit. */
  skyBasketCar(t: number): void;
}

export interface ThousandBoughOptions {
  tier: TierSettings;
  /** The island's own baked ground. */
  heightField: HeightField;
  kit: VillageKit;
  /** The island's boulders and the Spire (built with the terrain): their fences and camera blockers. */
  rocks?: Pick<ThousandBoughRocks, 'circles' | 'cameraBoxes'> | null;
}

/**
 * Builds Thousand-Bough's world (spec §9.1): its fresh water, the great banyan, the tree village (the
 * Great Stair, decks, bridges, lifts and houses), the Flume Terrace, the Spire, the signal mast, the
 * mist and the life, a few milliseconds a frame (`breathe` between stages).
 */
export async function createThousandBoughAsync(
  o: ThousandBoughOptions,
  breathe: () => Promise<void>,
): Promise<ThousandBoughWorld> {
  const base = createThousandBoughStub();
  const group = base.group;
  const water = createThousandBoughWaterMesh();
  group.add(water.mesh);
  await breathe();
  const clearance = new WalkClearance();
  await breathe();
  const banyan = createBanyan(o.tier, clearance);
  group.add(banyan.near, banyan.far, banyan.sister);
  await breathe();
  const village = await createTreeVillage({ tier: o.tier, kit: o.kit, clearance }, breathe);
  group.add(village.group);
  await breathe();
  const mist = createMist(o.tier, clearance);
  if (mist) group.add(mist.sprite);
  const points = glowPoints(o.tier, village.out.lanterns);
  const glows = points.length ? createGlows(points, 'thousand-bough-glows') : null;
  if (glows) group.add(glows.sprite);
  // Dim until the Seal's cascade lights them from the Beacon (64 m) down to the wharf.
  glows?.setHalos(HALO_REST, 0, BEACON_Y + 1, BEACON_Y + 1);
  const rocks = o.rocks ?? { circles: [], cameraBoxes: [] };
  const closed = new Set<string>(LATE_BRIDGES);
  const hit: WalkHit = { id: '', kind: 'wood' };
  const camBoxes: CameraBlockerBox[] = [
    ...village.out.cameraBoxes,
    ...rocks.cameraBoxes,
    ...branchCameraBoxes(),
  ];
  const circles = [...village.out.circles, ...rocks.circles];
  return {
    ...base,
    walkable: (x, z, y) => villageWalkable(x, z, y, undefined, closed),
    surfaceKind(x, z, y) {
      return villageWalkable(x, z, y, hit, closed) === null ? 'grass' : hit.kind;
    },
    colliders: () => village.out.colliders,
    circles: () => circles,
    cameraBoxes: () => camBoxes,
    inland: (x, z) => thousandBoughWater().levelAt(x, z),
    flume: village.flume,
    spire: {
      ...base.spire,
      async openSecondBridge() {
        village.r3.visible = true;
        closed.delete('R3');
        // The end gates stop applying (the walker's feet are never that low).
        for (const c of village.out.lateColliders.get('R3') ?? []) {
          c.y0 = -1000;
          c.y1 = -999;
        }
      },
    },
    shipObstacles: () => wharfShipObstacles(),
    async plants(breathe) {
      const steps = thousandBoughPlantsSliced(o.tier.tier, clearance, banyan.roots, o.heightField);
      for (;;) {
        const r = steps.next();
        if (r.done) return r.value;
        await breathe();
      }
    },
    frame(camera) {
      banyan.lod(camera.position.x, camera.position.z);
    },
    mast: village.pieces,
    fx: {
      ...base.fx,
      async sealCascade(reducedMotion) {
        village.pieces.beacon(true);
        await glowsCascade(glows, mist, reducedMotion);
      },
      gondolaSend: () => village.pieces.gondolaSend(),
      skyBasketEnabled: (on) => village.pieces.skyBasketEnabled(on),
    },
    skyBasketCar: (t) => village.pieces.skyBasketCar(t),
    update(dt, t) {
      village.flume.update(dt);
      village.pieces.update(dt, t);
      village.signs.update();
    },
    dispose() {
      water.dispose();
      banyan.dispose();
      village.dispose();
      mist?.dispose();
      glows?.dispose();
    },
  };
}
