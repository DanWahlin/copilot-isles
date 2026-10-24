import { Group, Mesh, Vector3, type Object3D } from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import type { Engine } from '../engine/engine';
import { islandsTakeSunShadows } from '../engine/quality';
import { coarserRocksOnLite, disposeTree, singlePassWaterOnLite } from './island-parts';
import { releaseRemovedObjects } from '../util/dispose-three';
import { HarborMirror } from './ocean/harbor-mirror';
import { createOcean, type Ocean } from './ocean/ocean';
import { releaseWaterDepthTexture } from './ocean/water-depth-texture';
import { releaseTextureStandIns } from '../engine/texture-stand-in';
import { skipSunShadows } from './sky/cached-sun-shadow';
import { createSky, type SkySystem } from './sky/sky-system';
import { createCoastFoam } from './terrain/coast-foam';
import { seaStackShipObstacle } from './terrain/sea-stack-shape';
import { HEADLAND_CLIFF_AREA, headlandCaveShipObstacle } from './terrain/headland-cliff-shape';
import { createDistantRangesAsync } from './terrain/distant-ranges';
import { loadTerrainPack } from './terrain/bake';
import { createTerrainAsync, type CreatedTerrain } from './terrain/terrain-mesh';
import { releaseTerrainTextures } from './terrain/terrain-material';
import { releaseTerrainNoiseTexture } from './terrain/noise-texture';
import { CompositeHeightField } from './terrain/composite-height-field';
import { COVE } from './layout';
import { createStarfish, type StarfishSystem } from './starfish';
import { setSignResolution } from './sites/sign';
import { createAnchorageStream, type AnchorageStream } from './islands/anchorage/stream';
import { createAnchorageSilhouette } from './islands/anchorage/silhouette';
import { anchorageMirrorFacades } from './islands/anchorage/mirror-facades';
import { createBeachDebris, type BeachDebrisSystem } from './debris/beach-debris';
import { addLiteShipLods, createBrigantine, type Brigantine } from './ship';
import { createVegetation, type VegetationSystem } from './vegetation';
import { loadVillageKit, releaseVillageKitTextures } from './village/kit';
import { DOCK_GULL_SPOT, createVillage, type VillageSystem } from './islands/anchorage/village';
import { ANCHORAGE_VEGETATION } from './islands/anchorage/vegetation-rules';
import { ANCHORAGE_FLORA } from './islands/anchorage/flora';
import { createWreckSteps, wreckWaterline, type WreckSystem } from './islands/anchorage/wreck';
import { createDockGull, type DockGull } from './life/dock-gull';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../engine/packs';
import { createFishingBoat, type FishingBoat } from './life/fishing-boat';
import { ANCHORAGE_FISHING_BOATS } from './islands/anchorage/life';
import { createBirds, type BirdsSystem } from './life/birds';
import type { LeapsSystem } from './life/leaps';
import { QuietSea } from './life/quiet-sea';
import { villageExclusionAsync } from './village-exclusion';
import { BRIGANTINE_CARGO, createCoveSites, type CoveSites } from './sites';
import type { CircleObstacle } from './contracts';
import { FarCull } from './far-cull';
import type { IslandStream, ResidentIsland } from './islands/island-stream';
import { BLOB_RANGE, BlobShadows } from './blob-shadows';
import { COURSE, courseIsland } from '../course/catalog';
import { HOME_ISLAND, ISLAND_REGISTRY, STREAMED_ISLANDS, type IslandId } from '../islands/registry';

export interface CoveScene {
  sky: SkySystem;
  ocean: Ocean;
  mirror: HarborMirror | null;
  terrain: CreatedTerrain;
  heightField: CompositeHeightField;
  foam: Mesh;
  ranges: Group;
  /** Anchorage (Chapter 00), the home island: built with the world, dormant (a silhouette) while you're elsewhere. */
  anchorage: AnchorageStream;
  /**
   * The streamed islands (Port Meridian, Thousand-Bough Isle…), by id (src/islands/registry.ts):
   * each streamed in when something needs it and freed once you've left.
   */
  islands: Partial<Record<IslandId, IslandStream>>;
  /** Every island as residency sees it (the home island and the streamed ones), by id. */
  residents: Record<IslandId, ResidentIsland>;
  vegetation: VegetationSystem | null;
  ship: Brigantine;
  village: VillageSystem;
  /** The wreck on the sand bar between the lighthouse point and the pier (one draw). */
  wreck: WreckSystem;
  /** Puzzle set pieces (the P0.1 mill race). */
  sites: CoveSites;
  /** Shells, pebbles, driftwood, and seaweed along hero beaches. */
  debris: BeachDebrisSystem;
  birds: BirdsSystem | null;
  leaps: LeapsSystem | null;
  /** Stretches of sea the leaping fish and dolphins keep out of (a battle, a puzzle's course). */
  quietSea: QuietSea;
  /**
   * How objects that join after the island's warm-up get warmed (the game's flow sets one that
   * matches the post's scene pass); without one they're precompiled with `compileAsync`.
   */
  setLateWarm(warm: ((roots: Object3D[]) => Promise<void>) | null): void;
  /** Warms late arrivals (a sea battle's ships) through that warm, or `compileAsync` without one. */
  warmLate(roots: Object3D[]): Promise<void>;
  /**
   * The world's warm-up is done (`warmWorld`): what it drew is warm, so Anchorage may now swap to its
   * silhouette by distance (its parts hidden before then would miss the warm).
   */
  worldWarmed(): void;
  /** The starfish to collect on both islands (the session sets their ground and which are found). */
  starfish: StarfishSystem;
  /**
   * Each island's small detail (people, puzzle sites, chests, props), culled while the camera is far
   * from that island; the game adds what it places (`FarCull.add`).
   */
  detail: Record<IslandId, FarCull>;
  /**
   * Frozen shots on a dev page (tools/shots.mjs): puts what moves on its own state back to the same
   * start in every run, for a frame held at sim time `t`. The ship goes back to its mooring and
   * replays 30 s of the swell up to `t`, and the birds go back to their seeded start. Not for play.
   */
  holdStill(t: number): void;
  dispose(): void;
}

/**
 * Past this distance (m) from Anchorage's centre the island draws as a neighbour (PLAN §12.3): its
 * village's thin timber, ironwork, rope and cloth, its loose props and rocks drop out (they're at
 * least ~575 m away, a pixel or less). Its terrain, walls, roofs and lights stay.
 */
const NEIGHBOUR_RANGE = { anchorage: 700 };

export interface CoveOptions {
  /** Base URL for packs (dev: '/packs', built: './packs'). */
  packBase?: string;
  vegetation?: boolean;
  birds?: boolean;
  onProgress?: (p: number, msg: string) => void;
  /**
   * Called between build stages; resolve it on the next frame to let the screen update while the
   * island builds (the opening's cabin keeps animating). Defaults to no pause.
   */
  breathe?: () => Promise<void>;
  /** The island's sky, made ahead (the game flow makes it under the opening's veil); else made here. */
  sky?: SkySystem | null;
}

/**
 * Assembles the Test Cove world (Phase 0 §2) into an engine: sky + lighting, ocean, terrain with
 * coast foam and distant ranges, and vegetation. The ship, village, characters, and life plug in
 * alongside as they land. Shared by the game flow and the cove dev page.
 */
export async function createCove(engine: Engine, o: CoveOptions = {}): Promise<CoveScene> {
  const { renderer, scene, tier, clock, camera } = engine;
  // Where the tier has sun shadows but the islands don't take them (Low: blob shadows instead), the
  // islands skip the shadow lookup without a second shader per look.
  const skipIslandShadows = tier.shadowCascades > 0 && !islandsTakeSunShadows(tier);
  const report = o.onProgress ?? (() => {});
  const breathe = o.breathe ?? (() => Promise.resolve());
  setSignResolution(tier.tier);
  report(0.1, 'Raising the sky');
  const sky = o.sky ?? createSky(renderer, scene, tier, engine.backend);
  await breathe();
  const cloudShadowNode = sky.cloudShadowNode?.(positionWorld.xz);
  const params =
    typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const mirrorDisabled = params.has('nomirror');
  // Each streamed island's code is its own chunk, fetched while the home island builds.
  const streamCode = Promise.all(STREAMED_ISLANDS.map((e) => e.code()));
  const mirror = tier.mirror ? new HarborMirror({ renderer, tier, disabled: mirrorDisabled }) : null;
  const ocean = createOcean({ tier, env: sky.env, mirror: mirror?.input, terrainDepth: true });
  await breathe();
  scene.add(ocean.mesh);

  report(0.3, 'Charting the cove');
  const data = await loadTerrainPack(`${o.packBase ?? '/packs'}/testcove/terrain`);
  await breathe();
  const terrain = await createTerrainAsync(
    { tier, data, cloudShadowNode, recessSteep: HEADLAND_CLIFF_AREA },
    breathe,
  );
  await breathe();
  if (skipIslandShadows) skipSunShadows(terrain.group);
  await coarserRocksOnLite(terrain.group, tier);
  const heightField = new CompositeHeightField(-52);
  heightField.add(
    { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
    terrain.heightField,
  );
  const foam = createCoastFoam(data, terrain.heightField, { rings: [wreckWaterline()] });
  await breathe();
  const ranges = await createDistantRangesAsync(tier, breathe);
  await breathe();
  scene.add(terrain.group, foam, ranges);
  const shipObstacles: CircleObstacle[] = [];
  // The streamed islands (src/islands/registry.ts): their silhouettes now, their worlds on demand.
  // `?no<flag>` leaves one out (`?nomeridian`, `?nothousandbough`).
  const factories = await streamCode;
  const islands: Partial<Record<IslandId, IslandStream>> = {};
  const streams: IslandStream[] = STREAMED_ISLANDS.map((island, i) => {
    const create = factories[i]!.stream;
    if (!create) throw new Error(`${island.id}: a streamed island's code has no stream`);
    const stream = create({
      scene,
      tier,
      packBase: o.packBase ?? '/packs',
      cloudShadowNode,
      breathe,
      heightField,
      shipObstacles,
      vegetation: () => vegetation,
      sky,
      birds: o.birds !== false,
      skipShadows: skipIslandShadows,
      disabled: params.has(`no${island.flag}`),
      island,
      nearLoads: () => island.stream!.nearLoads === 'always' || !!courseIsland(island.id, COURSE),
    });
    islands[island.id] = stream;
    return stream;
  });
  report(0.5, 'Building the harbor');
  const villageKit = typeof window === 'undefined' ? undefined : await loadVillageKit();
  const village = await createVillage({ tier, heightField, kit: villageKit });
  await breathe();
  if (skipIslandShadows) skipSunShadows(village.group);
  singlePassWaterOnLite(village.group, tier);
  scene.add(village.group);
  const sites = await createCoveSites({
    tier,
    heightField: terrain.heightField,
    ground: (x, z) => village.walkable(x, z) ?? terrain.heightField.heightAt(x, z),
  });
  if (skipIslandShadows) skipSunShadows(sites.group);
  singlePassWaterOnLite(sites.group, tier);
  scene.add(sites.group);
  await breathe();
  const villageMask = excludeVillageAndSites(await villageExclusionAsync(village, breathe), sites);
  const debris = createBeachDebris({
    heightField: terrain.heightField,
    tier,
    exclude: villageMask,
  });
  scene.add(debris.group);

  let vegetation: VegetationSystem | null = null;
  if (o.vegetation !== false) {
    report(0.6, 'Planting palms');
    vegetation = await createVegetation({
      heightField,
      heightGrid: terrain.heightGrid,
      tier,
      renderer,
      island: ANCHORAGE_VEGETATION,
      exclude: villageMask,
      extraPlants: village.plantings,
      flora: ANCHORAGE_FLORA,
    });
    if (skipIslandShadows) skipSunShadows(vegetation.group);
    scene.add(vegetation.group);
  }
  await breathe();

  report(0.8, 'Rigging the brigantine');
  await breathe();
  const ship = createBrigantine({ tier: tier.tier });
  await addLiteShipLods(ship, tier);
  ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
  if (skipIslandShadows) skipSunShadows(ship.group);
  scene.add(ship.group);
  sites.crane.setShip(ship.group, BRIGANTINE_CARGO);
  // The wreck draws with the ship's material, so it joins the scene before the island compiles.
  await breathe();
  const wreckSteps = createWreckSteps(tier.tier);
  let wreck: WreckSystem;
  for (;;) {
    const r = wreckSteps.next();
    if (r.done) {
      wreck = r.value;
      break;
    }
    await breathe();
  }
  if (skipIslandShadows) skipSunShadows(wreck.mesh);
  // ?nowreck leaves her out of the scene (a census without her); her obstacles stay.
  if (!params.has('nowreck')) scene.add(wreck.mesh);
  shipObstacles.push(
    ...village.shipObstacles,
    ...sites.shipObstacles,
    ...wreck.shipObstacles,
    seaStackShipObstacle(),
  );
  const caveButtress = headlandCaveShipObstacle(terrain.heightField);
  if (caveButtress) shipObstacles.push(caveButtress);
  const shipEnv = {
    waves: ocean.field,
    ground: heightField,
    obstacles: shipObstacles,
    t: 0,
  };
  let birds: BirdsSystem | null = null;
  if (o.birds !== false && tier.birds > 0) {
    birds = createBirds({
      tier,
      perches: [...village.perches, ...wreck.perches],
      center: new Vector3(COVE.harbor.center.x, 0, COVE.harbor.center.z + 40),
      radius: 220,
    });
    scene.add(birds.group);
  }

  // The title's seagull lives on the pier-end bollard by the crane board (one draw; +1 program). It
  // joins the scene before the island's pipelines are compiled, so its first draw doesn't stall.
  let dockGull: DockGull | null = null;
  if (o.birds !== false && tier.birds > 0) {
    const gull = createDockGull({
      loader: new GLTFLoader(),
      url: packs.url('/packs/testcove/life/dock-gull.glb'),
      at: DOCK_GULL_SPOT,
      heading: Math.PI / 2,
    });
    try {
      await gull.ready;
      scene.add(gull.group);
      dockGull = gull;
    } catch {
      gull.dispose();
    }
  }

  // Anchorage's fishing boats (a rowboat and two fishermen each), in the scene before the island compiles.
  const fishingBoats: FishingBoat[] = [];
  if (tier.tier !== 'lite') {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const boats = ANCHORAGE_FISHING_BOATS.map((at, i) =>
      createFishingBoat({
        loader,
        base: packs.url('/packs/testcove/life/'),
        at,
        waves: ocean.field,
        seed: 7 + i,
      }),
    );
    for (const boat of boats) {
      try {
        await boat.ready;
        scene.add(boat.group);
        shipObstacles.push(boat.shipObstacle);
        fishingBoats.push(boat);
      } catch {
        boat.dispose();
      }
    }
  }

  // The starfish (one draw; +1 program), in the scene before the island compiles.
  const starfish = createStarfish();
  scene.add(starfish.mesh);

  // Low and Lite have no shadow map for moving things: characters get blob shadows (one draw; +1 program).
  const blobs = tier.tier === 'low' || tier.tier === 'lite' ? new BlobShadows(BLOB_RANGE[tier.tier]) : null;
  if (blobs) scene.add(blobs.mesh);

  /** The flow's warm for anything that joins after the world's warm-up (`setLateWarm`). */
  let lateWarm: ((roots: Object3D[]) => Promise<void>) | null = null;
  let worldWarm = false;
  // Anchorage goes dormant while you're at another island (PLAN §13.3): its parts leave the scene
  // and their GPU copies are freed, and its silhouette (ground and buildings) stands in. It stands in
  // past its swap distance too, while it's still resident.
  const anchorageFar = createAnchorageSilhouette({
    heightField: terrain.heightField,
    bounds: { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
    breathe,
  });
  // What the harbour mirror (Ultra) reflects of the island: the hills, the village front and the quay
  // as the silhouette's big shapes in its one cheap look (the real ones would each be a second set of
  // shaders), drawn by the mirror alone (#31).
  const mirrorStandIn = mirror?.enabled
    ? createAnchorageSilhouette({
        heightField: terrain.heightField,
        bounds: { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
        breathe,
        mirror: true,
        houses: villageKit
          ? await anchorageMirrorFacades(villageKit, terrain.heightField, breathe)
          : undefined,
      })
    : null;
  const anchorage = createAnchorageStream({
    scene,
    terrain,
    silhouette: anchorageFar.group,
    parts: () =>
      [
        terrain.group,
        foam,
        village.group,
        sites.group,
        debris.group,
        wreck.mesh,
        birds?.group,
        dockGull?.group,
        ...fishingBoats.map((b) => b.group),
        ...(vegetation?.home() ?? []),
      ].filter((o): o is Object3D => !!o),
    plantsAwake: (on) => vegetation?.setHomeAwake(on),
    breathe,
    warm: (roots) => (worldWarm && lateWarm ? lateWarm(roots) : null),
  });

  let leaps: LeapsSystem | null = null;
  const quietSea = new QuietSea();
  let disposed = false;
  let result: CoveScene | null = null;
  const immediateLeaps = typeof location !== 'undefined' && location.pathname.includes('leaps');
  const loadLeaps = async () => {
    if (disposed || leaps || tier.leaps <= 0) return;
    const { createLeaps } = await import('./life/leaps');
    if (disposed || leaps) return;
    const created = createLeaps({ tier, heightField, waves: ocean.field, quiet: quietSea });
    // In the scene for its warm (which keeps it from being drawn until it's built), then live.
    scene.add(created.group);
    if (lateWarm) await lateWarm([created.group]);
    else await renderer.compileAsync(created.group, camera);
    if (disposed) {
      scene.remove(created.group);
      created.dispose();
      return;
    }
    leaps = created;
    if (result) result.leaps = created;
  };
  if (immediateLeaps) void loadLeaps();
  const leapsTimer =
    !immediateLeaps && typeof window !== 'undefined'
      ? window.setTimeout(() => void engine.counters.excuse(loadLeaps()), 90000)
      : 0;

  const home = ISLAND_REGISTRY[HOME_ISLAND];
  const homeDetail = new FarCull(home.center.x, home.center.z, home.ranges.detail, tier.detailCullRatio);
  const detail = { [HOME_ISLAND]: homeDetail } as unknown as Record<IslandId, FarCull>;
  const residents = { [HOME_ISLAND]: anchorage } as unknown as Record<IslandId, ResidentIsland>;
  for (const e of STREAMED_ISLANDS) {
    detail[e.id] = islands[e.id]!.detail;
    residents[e.id] = islands[e.id]!;
  }
  const neighbour = new FarCull(COVE.island.center.x, COVE.island.center.z, NEIGHBOUR_RANGE.anchorage);
  for (const mesh of village.neighbourDetail) neighbour.add(mesh);
  // The loose rocks only: the cliff and the sea stack are the island's shape.
  for (const rocks of terrain.group.getObjectByName('terrain-rocks')?.children ?? [])
    if (/Rock_/.test(rocks.name)) neighbour.add(rocks);
  // The ships' small parts (lanterns, blocks, boards) by size alone, wherever they sail.
  const shipDetail = new FarCull(0, 0, Infinity, tier.detailCullRatio);
  if (tier.detailCullRatio > 0) {
    shipDetail.add(ship.group);
    for (const boat of fishingBoats) shipDetail.add(boat.group);
  }
  homeDetail.add(sites.group);
  homeDetail.add(debris.group);
  homeDetail.add(wreck.mesh);
  if (dockGull) homeDetail.add(dockGull.group);

  const focus = new Vector3();
  // What the harbour mirror leaves out, refilled each frame (some systems arrive late) without a new array.
  // The island itself is its stand-in there (`mirrorStandIn`); the ship reflects its big shapes, its
  // small parts are `unreflected` (brigantine.ts).
  const mirrorHidden: (Object3D | null | undefined)[] = [];
  const fillMirrorHidden = () => {
    mirrorHidden.length = 0;
    mirrorHidden.push(
      ocean.mesh,
      terrain.group,
      foam,
      ranges,
      village.group,
      sites.group,
      debris.group,
      wreck.mesh,
      vegetation?.group,
      birds?.group,
      dockGull?.group,
      leaps?.group,
    );
    mirrorHidden.push(anchorage.silhouette);
    for (const stream of streams) stream.mirrorHidden(mirrorHidden);
    return mirrorHidden;
  };
  mirror?.setHidden(fillMirrorHidden);
  const removeSystem = engine.add({
    frame(dt, t) {
      ocean.update(camera, t);
      shipEnv.t = t;
      ship.update(dt, t, shipEnv);
      // A dormant Anchorage's parts are out of the scene, and past its swap distance they're hidden
      // (its silhouette draws): they don't update until it's shown again (decided first).
      anchorage.update(camera);
      const home = anchorage.shown;
      if (home) terrain.update(camera);
      homeDetail.update(camera.position.x, camera.position.z);
      shipDetail.update(camera.position.x, camera.position.z);
      neighbour.update(camera.position.x, camera.position.z);
      for (const stream of streams) stream.update(camera, dt, t);
      vegetation?.update(camera);
      if (home) {
        village.update(dt, t, camera);
        sites.update(dt, t);
        birds?.update(dt, t, camera);
        dockGull?.update(dt, t, camera);
        for (const boat of fishingBoats) boat.update(dt, t, camera);
      }
      starfish.update(dt, t, camera);
      leaps?.update(dt, t, camera);
      focus.set(camera.position.x, 0, camera.position.z);
      sky.update(clock, focus, dt, camera);
      if (mirror) {
        mirror.update(renderer, scene, camera, fillMirrorHidden());
      }
      mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    },
  });
  // The far islands' silhouettes are built a few rows a breath: in the scene before the island compiles.
  await Promise.all([...streams.map((st) => st.silhouetteReady), anchorageFar.ready, mirrorStandIn?.ready]);
  if (mirror && mirrorStandIn) {
    mirror.reflectOnly(mirrorStandIn.group);
    scene.add(mirrorStandIn.group);
  }
  report(0.9, 'Lighting the lanterns');

  result = {
    sky,
    ocean,
    mirror,
    terrain,
    heightField,
    foam,
    ranges,
    anchorage,
    islands,
    residents,
    vegetation,
    ship,
    village,
    wreck,
    sites,
    debris,
    birds,
    leaps,
    quietSea,
    starfish,
    detail,
    setLateWarm(warm) {
      lateWarm = warm;
    },
    worldWarmed() {
      worldWarm = true;
    },
    async warmLate(roots) {
      if (lateWarm) return lateWarm(roots);
      for (const r of roots) await renderer.compileAsync(r, camera, scene);
    },
    holdStill(t) {
      ship.restartMotion(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
      const step = 1 / 60;
      for (let k = 30 * 60; k >= 0; k--) {
        shipEnv.t = t - k * step;
        ship.update(step, shipEnv.t, shipEnv);
      }
      birds?.reset();
    },
    dispose() {
      disposed = true;
      if (leapsTimer) window.clearTimeout(leapsTimer);
      removeSystem();
      // A dormant Anchorage's parts are out of the scene, so the voyage's end doesn't see them: they
      // stay out, and are told they're disposed here once their owners have freed them.
      const parked: Object3D[] = [];
      for (const r of anchorage.parkedRoots()) r.traverse((o) => void parked.push(o));
      scene.remove(
        ocean.mesh,
        terrain.group,
        foam,
        ranges,
        village.group,
        debris.group,
        ship.group,
        wreck.mesh,
      );
      if (vegetation) scene.remove(vegetation.group);
      if (birds) scene.remove(birds.group);
      if (dockGull) scene.remove(dockGull.group);
      if (leaps) scene.remove(leaps.group);
      disposeTree(foam);
      if (mirrorStandIn) {
        scene.remove(mirrorStandIn.group);
        disposeTree(mirrorStandIn.group);
      }
      disposeTree(ranges);
      anchorage.dispose();
      for (const stream of streams) stream.dispose();
      birds?.dispose();
      dockGull?.dispose();
      for (const boat of fishingBoats) {
        scene.remove(boat.group);
        boat.dispose();
      }
      starfish.dispose();
      blobs?.dispose();
      leaps?.dispose();
      village.dispose();
      wreck.dispose();
      sites.dispose();
      debris.dispose();
      ship.dispose();
      mirror?.dispose();
      vegetation?.dispose();
      terrain.dispose();
      ocean.dispose();
      sky.dispose();
      // The shared terrain, kit, sea-floor and stand-in textures' GPU copies (their data stays cached
      // for the next voyage).
      releaseTerrainTextures();
      releaseTerrainNoiseTexture();
      releaseVillageKitTextures();
      releaseWaterDepthTexture();
      releaseTextureStandIns();
      releaseRemovedObjects(parked, scene);
    },
  };
  return result;
}

function excludeVillageAndSites(
  village: (x: number, z: number) => boolean,
  sites: CoveSites,
): (x: number, z: number) => boolean {
  return (x, z) => village(x, z) || sites.excludes(x, z);
}
