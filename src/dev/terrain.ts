import { Frustum, Matrix4, Mesh, Vector3 } from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import { createPost } from '../engine/post';
import { ISLANDS } from '../game/islands';
import { KEELHAVEN, toWorld } from '../world/islands/keelhaven/layout';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import { createOcean } from '../world/ocean/ocean';
import { createSky } from '../world/sky/sky-system';
import { loadTerrainPack } from '../world/terrain/bake';
import { createCoastFoam } from '../world/terrain/coast-foam';
import { createTerrain } from '../world/terrain/terrain-mesh';
import { addWaterDepthTile, waterDepthTileFromTerrain } from '../world/ocean/water-depth-texture';
import {
  compileAndStart,
  createDevHarness,
  engineStats,
  orbitViews,
  seaOrbitControls,
  type CamPose,
} from './harness';

/**
 * Terrain dev page: one island's baked terrain pack with the game's sky, ocean, coast foam and post,
 * and nothing else (no town, plants or rocks). `?pack=testcove|meridian|thousand-bough|keelhaven`
 * (default testcove), `?view=`, `?tier=`, `?webgl`, `?time=`/`?az=` (default: the island's own sky),
 * `?notaa`, `?shot`, `?fog=` (the island's haze scale). `window.__dev` has `setView`, `setCam`, `freeze`, `still`, `restartJitter`,
 * `stats` and `terrainStats` (the terrain's own draws and triangles in view).
 */

interface PackPreset {
  sky: { hours: number; azimuth: number };
  mood?: { fogScale: number; hazeTint: readonly [number, number, number]; fill?: number; exposure?: number };
  views: Record<string, CamPose>;
  /** Views whose eye stands on the ground (built once the terrain is in). */
  groundViews?: (groundAt: (x: number, z: number) => number) => Record<string, CamPose>;
}

/** A camera pose `pitch` degrees down from `eye`, toward the horizontal direction of `toward`. */
function lookDown(eye: readonly number[], toward: readonly number[], pitch: number): CamPose {
  const dx = toward[0]! - eye[0]!;
  const dz = toward[1]! - eye[2]!;
  const len = Math.hypot(dx, dz) || 1;
  const reach = 1000;
  return [
    eye,
    [
      eye[0]! + (dx / len) * reach,
      eye[1]! - reach * Math.tan((pitch * Math.PI) / 180),
      eye[2]! + (dz / len) * reach,
    ],
  ];
}

/** A camera pose in Keelhaven's frame: eye at (u, v, y), looking at (u, v, y). */
function keelhavenPose(eye: readonly number[], target: readonly number[]): CamPose {
  const e = toWorld(eye[0]!, eye[1]!);
  const t = toWorld(target[0]!, target[1]!);
  return [
    [e.x, eye[2]!, e.z],
    [t.x, target[2]!, t.z],
  ];
}

const PACKS: Record<string, PackPreset> = {
  testcove: {
    sky: ISLANDS.anchorage.sky,
    views: {
      harbor: [
        [-210, 72, -184],
        [-108, 4, -78],
      ],
      headland: [
        [292, 54, -48],
        [174, 21, 0],
      ],
      lagoon: [
        [-54, 34, 238],
        [16, 0, 104],
      ],
      stack: [
        [356, 58, 286],
        [270, 23, 210],
      ],
    },
  },
  meridian: {
    sky: ISLANDS.meridian.sky,
    views: {
      harbor: [
        [570, 24, -610],
        [700, 10, -735],
      ],
      ridge: [
        [1180, 60, -500],
        [930, 70, -820],
      ],
      aerial: [
        [420, 320, -360],
        [880, 20, -880],
      ],
    },
  },
  'thousand-bough': {
    sky: ISLANDS['thousand-bough'].sky,
    mood: THOUSAND_BOUGH.mood,
    views: {
      cove: [
        [1880, 18, -1180],
        [2010, 40, -1560],
      ],
      sea: [
        [1500, 8, -1300],
        [2040, 60, -1500],
      ],
      aerial: [
        [2600, 320, -1100],
        [2050, 20, -1500],
      ],
    },
  },
  keelhaven: {
    sky: KEELHAVEN.sky,
    mood: KEELHAVEN.mood,
    views: {
      // The progress set (fixed views; tools in the session folder render them).
      // From the arrival bearing (the west), 1.5 km out.
      'sea-1500': [
        [2115, 7, -1600],
        [3700, 90, -1620],
      ],
      'sea-400-cove-mouth': keelhavenPose([-630, 0, 7], [0, 0, 45]),
      // 300 m up, 600 m off the north-west, 35° down toward the island's middle.
      'heli-300': lookDown([3276, 300, -2624], [4000, -1650], 35),
      // From high above, about 67° down from the south-west: the whole island's shape.
      'aerial-top': [
        [3540, 1520, -1310],
        [4000, 0, -1650],
      ],
      // From the south-east, 600 m out.
      'sail-past': [
        [4724, 7, -726],
        [4000, 100, -1650],
      ],
      // On the course in from Thousand-Bough, 700 m off the middle of the west coast: the whole front
      // wall, the cove's mouth on the left, the back ranges behind.
      'sea-700': [
        [2915, 7, -1600],
        [3650, 85, -1640],
      ],
      // The front wall at a slant from about 400 m off.
      'sea-400': [
        [3230, 7, -1440],
        [3640, 80, -1700],
      ],
      // 400 m off the cove's mouth, on its axis: the beach, the valley and the amphitheatre head.
      'cove-mouth': keelhavenPose([-630, 0, 7], [0, 0, 45]),
      // The front wall face on, from 700 m and 300 m.
      'wall-700': [
        [2930, 7, -1500],
        [3640, 95, -1500],
      ],
      wall: [
        [3330, 6, -1480],
        [3640, 110, -1480],
      ],
      // On the beach, up the valley to the amphitheatre head.
      cove: keelhavenPose([-6, 0, 2], [420, 0, 120]),
      // 350 m up, about 600 m out, 35° down at the cove.
      aerial: keelhavenPose([-720, 60, 350], [-220, 30, 0]),
    },
    groundViews: (groundAt) => {
      const onGround = (u: number, v: number, above: number) => {
        const p = toWorld(u, v);
        return [p.x, groundAt(p.x, p.z) + above, p.z];
      };
      const at = (u: number, v: number, y: number) => {
        const p = toWorld(u, v);
        return [p.x, y, p.z];
      };
      return {
        // On the beach, eye 1.7 m: up the valley, and back out to sea along the cove.
        beach: [onGround(12, 0, 1.7), at(400, 0, 110)],
        'beach-back': [onGround(22, 0, 1.7), at(-700, 0, 4)],
        // In the valley near the head wall, looking up at the amphitheatre.
        'valley-head': [onGround(200, 0, 1.7), at(360, 0, 110)],
        // On a spur's crest (184 m) on the west coast, looking south along the coast (a clear line).
        'ridge-top': [
          [3692, groundAt(3692, -1504) + 4, -1504],
          [3612, 120, -804],
        ],
      };
    },
  },
};

const h = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = h;
const { scene, camera, clock } = engine;
const packName = q.get('pack') ?? 'testcove';
const preset = PACKS[packName] ?? PACKS.testcove!;
clock.set(Number(q.get('time') ?? preset.sky.hours), Number(q.get('az') ?? preset.sky.azimuth));

const sky = createSky(renderer, scene, tier, backend);
if (preset.mood) {
  sky.mood.fogScale = Number(q.get('fog') ?? preset.mood.fogScale);
  sky.mood.hazeTint = [...preset.mood.hazeTint];
  sky.mood.fill = preset.mood.fill ?? 1;
  sky.mood.exposure = preset.mood.exposure ?? 1;
}
const ocean = createOcean({ tier, env: sky.env, terrainDepth: true });
scene.add(ocean.mesh);

const data = await loadTerrainPack(`/packs/${packName}/terrain`);
const terrain = createTerrain({
  tier,
  data,
  cloudShadowNode: sky.cloudShadowNode?.(positionWorld.xz),
  // Keelhaven's tall fluted walls: prefiltered coarse levels, and the whole island one block from the sea.
  ...(packName === 'keelhaven'
    ? {
        prefilter: KEELHAVEN.terrain.prefilter,
        maxMergedTriangles: KEELHAVEN.terrain.maxMergedTriangles,
        morphFrames: KEELHAVEN.terrain.morphFrames,
      }
    : {}),
});
scene.add(terrain.group);
// The streamed islands lend the ocean their floor (Anchorage's and Meridian's are in its home tile).
if (packName === 'thousand-bough' || packName === 'keelhaven') {
  const build = waterDepthTileFromTerrain(data, packName);
  let r = build.next();
  while (!r.done) r = build.next();
  addWaterDepthTile(r.value);
}
scene.add(
  createCoastFoam(data, terrain.heightField, {
    exposure: packName === 'keelhaven' ? 1 : 0,
    maxDistance: packName === 'keelhaven' ? 1100 : 620,
  }),
);

const post = q.has('nopost')
  ? null
  : await createPost(renderer, scene, camera, tier, { temporal: !q.has('notaa') });
if (post) engine.renderFn = post.render;

Object.assign(
  preset.views,
  preset.groundViews?.((x, z) => terrain.heightField.heightAt(x, z)),
);
const controls = seaOrbitControls(camera, canvas);
const fallback = Object.keys(preset.views)[0]!;
const { setCam, setView } = orbitViews(camera, controls, preset.views, fallback);
setView(q.get('view') ?? fallback);
const viewsEl = document.getElementById('views')!;
for (const name of Object.keys(preset.views)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.onclick = () => setView(name);
  viewsEl.append(button);
}

const focus = new Vector3();
const stats = document.getElementById('stats')!;
let n = 0;
engine.add({
  frame(dt, t) {
    controls.update();
    ocean.update(camera, t);
    terrain.update(camera);
    focus.set(camera.position.x, 0, camera.position.z);
    sky.update(clock, focus, dt, camera);
    if (++n % 20 === 0) stats.textContent = `${packName}\n${engineStats(h).join('\n')}`;
  },
});

const compileMs = await compileAndStart(renderer, engine, scene, camera);

const frustum = new Frustum();
const viewProjection = new Matrix4();
/** The terrain's draws and triangles in the camera's view (its levels of detail as now picked). */
function terrainStats() {
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  let draws = 0;
  let triangles = 0;
  terrain.group.traverseVisible((o) => {
    if (!(o instanceof Mesh) || !frustum.intersectsObject(o)) return;
    const index = o.geometry.index;
    const count = index ? index.count : o.geometry.attributes.position!.count;
    const range = o.geometry.drawRange.count;
    draws++;
    triangles += Math.min(count, range) / 3;
  });
  return { draws, triangles };
}

const frozenAt = new Vector3();
(window as unknown as { __dev: object }).__dev = {
  ready: true,
  pack: packName,
  setView,
  setCam,
  /** Freeze-frame mode (as on the cove page): clock held at `sim` s, loop stopped, render scale 1. */
  freeze: (on = true, sim?: number) => {
    clock.paused = on;
    if (on && sim !== undefined) clock.sim = sim;
    controls.enableDamping = !on;
    engine.setRenderScale(on ? 1 : null);
    if (on) {
      engine.stop();
      frozenAt.copy(camera.position);
    } else engine.start();
  },
  still: () => engine.renderStill(),
  restartJitter: () => post?.restartJitter(),
  terrainStats,
  /** The names of the terrain meshes drawn now (level and block swaps, for the pop tests). */
  terrainShown: () => terrain.group.children.filter((o) => o.visible).map((o) => o.name),
  stats: () => ({
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    backend,
    tier: tier.tier,
    compileMs,
    camera: camera.position.toArray(),
  }),
};
