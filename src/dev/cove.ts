import { NoToneMapping, Raycaster, Vector2 } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPost } from '../engine/post';
import { createCove } from '../world/cove-scene';
import { MERIDIAN } from '../world/islands/meridian';
import { ANCHORAGE_SLUICE, flow, openings, solutionPath } from '../world/sites/sluice-logic';
import {
  bindSkyPanel,
  compileAndStart,
  createDevHarness,
  engineStats,
  orbitViews,
  showSkyReadouts,
} from './harness';

/** Test Cove dev page: every world module together under the shared sky (?webgl, ?tier=, ?tm=). */
const h = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = h;
const { scene, camera, clock } = engine;
const t0 = performance.now();
const cove = await createCove(engine, { vegetation: !q.has('noveg') });
const buildMs = performance.now() - t0;
if (q.has('env')) scene.environmentIntensity = Number(q.get('env'));
const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// [camera, target]
const VIEWS: Record<string, [number[], number[]]> = {
  harbor: [
    [-40, 14, -150],
    [-112, 3, -80],
  ],
  village: [
    [-150, 9, -10],
    [-112, 5, -50],
  ],
  lagoon: [
    [-40, 7, 215],
    [30, 1, 120],
  ],
  headland: [
    [300, 30, -30],
    [160, 25, -5],
  ],
  stack: [
    [330, 12, 290],
    [270, 18, 210],
  ],
  approach: [
    [-330, 10, -330],
    [-100, 8, -80],
  ],
  aerial: [
    [-420, 260, 380],
    [0, 0, 0],
  ],
  'anchorage-quay-to-meridian': [
    [-112, 6, -69],
    [MERIDIAN.pads.citadel.x, MERIDIAN.pads.citadel.height + 22, MERIDIAN.pads.citadel.z],
  ],
  'meridian-harbor': [
    [570, 24, -610],
    [700, 10, -735],
  ],
  'meridian-town': [
    [610, 82, -610],
    [855, 32, -875],
  ],
  'meridian-citadel': [
    [890, 105, -855],
    [1028, 64, -1002],
  ],
  'meridian-ridge': [
    [910, 118, -780],
    [1110, 92, -1078],
  ],
};
const { setCam, setView } = orbitViews(camera, controls, VIEWS, 'harbor');

const SHOTS: Record<string, { view?: string; time: number; camera?: [number[], number[]] }> = {
  F1: {
    view: 'harbor',
    time: 16.5,
    camera: [
      [-96, 5.2, -69],
      [-118, 3, -92],
    ],
  },
  F2: {
    time: 16.5,
    camera: [
      [-96, 8, -132],
      [-96, 3, -108],
    ],
  },
  B1: {
    view: 'lagoon',
    time: 16.5,
    camera: [
      [-46, 6.5, 205],
      [30, 1.2, 116],
    ],
  },
  B2: {
    view: 'headland',
    time: 16.5,
    camera: [
      [292, 20, -18],
      [158, 24, 0],
    ],
  },
  // The Walt gate for the quality slice (docs/research/2026-10-02-quality-v2.md §6), at Anchorage's 16:20.
  // W1 down the pier to the pier head and your ship.
  W1: {
    time: 16.33,
    camera: [
      [-110, 3.6, -92],
      [-108, 2.6, -124],
    ],
  },
  // W2 the quay from the pier foot: Nell's door, Ezra's chart table and Bo's gear rack.
  W2: {
    time: 16.33,
    camera: [
      [-104, 4.5, -82],
      [-117, 3, -62],
    ],
  },
  // W3 the south beach at standing height, looking east along the shore.
  W3: {
    time: 16.33,
    camera: [
      [-10, 2.4, 92],
      [40, 1.2, 100],
    ],
  },
  // W4 the harbour, village and hills from the water: sky, haze and depth.
  W4: {
    time: 16.33,
    camera: [
      [-20, 22, -175],
      [-115, 6, -70],
    ],
  },
};
function shot(id: string) {
  const s = SHOTS[id];
  if (!s) return false;
  setTime(s.time);
  if (s.camera) setCam(s.camera[0], s.camera[1]);
  else if (s.view) setView(s.view);
  return true;
}

setView(q.get('view') ?? 'harbor');

const setTime = bindSkyPanel({ q, clock, invalidate: () => cove.sky.invalidate(), setView });

const stats = document.getElementById('stats')!;
let n = 0;
/** Sky-bake mode (skyBake): the bake steers the camera, so the orbit controls stay out of it. */
let baking = false;
engine.add({
  frame() {
    if (!baking) controls.update();
    if (++n % 20 === 0) {
      const c = engine.counters.last;
      cove.mirror?.finalizeFrame(c.drawCalls, c.triangles);
      stats.textContent =
        `${engineStats(h).join('\n')}\n` +
        `scale ${engine.adaptive.scale.toFixed(2)} · ${clock.hours.toFixed(2)}h · build ${buildMs.toFixed(0)} ms`;
      showSkyReadouts(clock);
    }
  },
});

const compileMs = await compileAndStart(
  renderer,
  engine,
  scene,
  camera,
  post ? () => post.compile() : undefined,
);

/**
 * Sky-bake mode for tools/sky/bake-sky.mjs (run with `nopost`): hides everything but the sky dome and
 * turns tone mapping and haze off, so the frame holds the sky's own colours, then locks the render
 * scale to 1 for full-resolution faces.
 */
function skyBake(fovDeg = 90) {
  for (const o of scene.children) o.visible = o.renderOrder === -10;
  engine.adaptive.lock(1);
  renderer.toneMapping = NoToneMapping;
  scene.fogNode = null;
  camera.fov = fovDeg;
  camera.updateProjectionMatrix();
  controls.enabled = false;
  baking = true;
  return { hours: clock.hours };
}
/** Points the bake camera from `eye` along a direction (cube faces). */
function skyLook(eye: number[], dir: number[], up: number[] = [0, 1, 0]) {
  camera.position.set(eye[0]!, eye[1]!, eye[2]!);
  camera.up.set(up[0]!, up[1]!, up[2]!);
  camera.lookAt(eye[0]! + dir[0]!, eye[1]! + dir[1]!, eye[2]! + dir[2]!);
  camera.updateMatrixWorld();
}

(window as unknown as { __dev: object }).__dev = {
  ready: true,
  setTime,
  setView,
  shot,
  setCam,
  skyBake,
  skyLook,
  /** Poses the P0.1 mill race: 'dry' (start tiles, gate shut), 'gate' (start tiles, gate open), or 'solved'. */
  mill: (mode: 'dry' | 'gate' | 'solved' = 'solved') => {
    const L = ANCHORAGE_SLUICE;
    const rots = L.tiles.map((t) => (mode === 'solved' ? t.solution : t.start));
    const gate = mode !== 'dry';
    const m = cove.sites.mill;
    rots.forEach((r, i) => m.setRotation(i, r, true));
    m.setLever(gate, true);
    const f = flow(L, rots, gate, 2.4);
    m.setWater(
      f.cells.map((c, i) => ({ ...c, mask: openings(L.tiles[i]!.kind, rots[i]!) })),
      gate,
      f.solved,
    );
    return { solved: f.solved, path: solutionPath(L) };
  },
  gear: () => cove.sites.gear.spots(),
  gearVisible: (visible: boolean) => {
    cove.sites.gear.group.visible = visible;
  },
  palette: (id = 'github', hint = false) => {
    const palette = cove.sites.palette;
    palette.setPalette(id);
    palette.setHint(hint);
    camera.position.set(-94.6, 4.6, -67.8);
    controls.target.set(-100.0, 2.95, -70.75);
    controls.update();
    return palette.spot;
  },
  paletteVisible: (visible: boolean) => {
    cove.sites.palette.group.visible = visible;
  },
  hammock: () => {
    const hammock = cove.sites.hammock;
    camera.position.set(-18.2, 4.05, 80.8);
    controls.target.set(hammock.seat.x, hammock.seat.y + 0.55, hammock.seat.z + 0.6);
    controls.update();
    return { seat: hammock.seat, spot: hammock.spot };
  },
  hammockVisible: (visible: boolean) => {
    cove.sites.hammock.group.visible = visible;
  },
  paletteClearance: () => {
    const box = cove.sites.palette.colliders.boxes[0]!;
    const c = Math.cos(box.rot);
    const s = Math.sin(box.rot);
    const corners = [
      [-box.hx, -box.hz],
      [box.hx, -box.hz],
      [box.hx, box.hz],
      [-box.hx, box.hz],
    ].map(([lx, lz]) => ({ x: box.x + lx * c + lz * s, z: box.z - lx * s + lz * c }));
    const boxDistance = (
      p: { x: number; z: number },
      b: { x: number; z: number; hx: number; hz: number; rot: number },
    ) => {
      const bc = Math.cos(-b.rot);
      const bs = Math.sin(-b.rot);
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const lx = dx * bc + dz * bs;
      const lz = -dx * bs + dz * bc;
      const ox = Math.abs(lx) - b.hx;
      const oz = Math.abs(lz) - b.hz;
      return ox <= 0 && oz <= 0 ? Math.max(ox, oz) : Math.hypot(Math.max(0, ox), Math.max(0, oz));
    };
    const circleDistance = (p: { x: number; z: number }, q: { x: number; z: number; r: number }) =>
      Math.hypot(p.x - q.x, p.z - q.z) - q.r;
    const samples = corners.map((p, i) => {
      const villageBox = Math.min(...cove.village.colliders.boxes.map((b) => boxDistance(p, b)));
      const villageCircle = Math.min(...cove.village.colliders.circles.map((q) => circleDistance(p, q)));
      return {
        corner: i,
        x: p.x,
        z: p.z,
        villageBox,
        villageCircle,
        clearance: Math.min(villageBox, villageCircle),
      };
    });
    const nellDoor = cove.village.anchors.harbourmasterDoor!;
    const nellOut = 1.9;
    const nell = {
      x: nellDoor.x + Math.sin(nellDoor.heading) * nellOut,
      z: nellDoor.z + Math.cos(nellDoor.heading) * nellOut,
      heading: nellDoor.heading,
    };
    const chest = {
      x: nell.x - Math.cos(nell.heading) * 2.1 - Math.sin(nell.heading) * 1.2,
      z: nell.z + Math.sin(nell.heading) * 2.1 - Math.cos(nell.heading) * 1.2,
    };
    return {
      box,
      spot: cove.sites.palette.spot,
      corners: samples,
      minClearance: Math.min(...samples.map((p) => p.clearance)),
      nellDistance: Math.hypot(cove.sites.palette.spot.x - nell.x, cove.sites.palette.spot.z - nell.z),
      chestDistance: Math.hypot(cove.sites.palette.spot.x - chest.x, cove.sites.palette.spot.z - chest.z),
    };
  },
  pipe: (which: 'tube' | 'hatch' | null, hint = false) => {
    if (hint) cove.ship.pipes.setHint(which);
    else if (which) cove.ship.pipes.play(which);
    else cove.ship.pipes.setHint(null);
  },
  christen: (name = 'Anne’s Brigantine') => {
    cove.ship.setName(name);
    const bow = cove.ship.bowStemWorld(new Float32Array(3));
    camera.position.set(bow[0]! - 4.0, 3.55, bow[2]! - 4.6);
    controls.target.set(bow[0]!, bow[1]! + 0.15, bow[2]!);
    controls.update();
    return cove.ship.christen({ x: bow[0]! - 4.2, y: bow[1]! + 1.05, z: bow[2]! + 1.35 });
  },
  /** Names the objects under a screen point (NDC -1..1), nearest first. */
  pick: (nx: number, ny: number) => {
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(nx, ny), camera);
    return ray
      .intersectObjects(scene.children, true)
      .slice(0, 6)
      .map((h) => {
        const path: string[] = [];
        for (let o: typeof h.object | null = h.object; o; o = o.parent) path.push(o.name || o.type);
        return `${h.distance.toFixed(1)} ${path.join('<')}`;
      });
  },
  stats: () => {
    cove.mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    return {
      ...engine.counters.last,
      fps: engine.fps,
      gpuMs: engine.gpuMs,
      cpuMs: engine.cpuMs,
      backend,
      tier: tier.tier,
      buildMs,
      compileMs,
      mirror: cove.mirror?.stats ?? null,
    };
  },
};
