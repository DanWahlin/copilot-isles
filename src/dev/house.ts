import {
  BufferAttribute,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { world } from '../world/uniforms';
import { loadVillageKit, type VillageKit } from '../world/village';
import { buildHouse, type HouseSpec } from '../world/village/house-builder';
import { createDevHarness } from './harness';

const { q, backend, tier, canvas, renderer, engine } = await createDevHarness();
const { scene, camera } = engine;

scene.background = new Color(0x8dccf6);
world.night.value = q.has('night') ? 1 : 0;

const hemi = new HemisphereLight(0xddecff, 0x6f5a42, 1.45);
const sun = new DirectionalLight(0xffdfae, 4.2);
sun.position.set(-6, 10, -5);
scene.add(hemi, sun);

const ground = new Mesh(
  new PlaneGeometry(26, 26, 1, 1),
  new MeshStandardNodeMaterial({ color: 0x8da46a, roughness: 0.92, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const HOUSE_SPECS: readonly HouseSpec[] = [
  {
    footprint: { w: 6, d: 8 },
    storeys: 3,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'busy',
    roof: 'gable',
    dormers: 2,
    chimney: true,
    balcony: true,
    overhang: true,
    stairs: true,
    vines: 2,
    seed: 17,
    tint: 0xd2c1a1,
  },
  {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    balcony: true,
    overhang: true,
    stairs: true,
    vines: 1,
    seed: 11,
    tint: 0x9fb7bc,
  },
  {
    footprint: { w: 4, d: 6 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 0,
    windows: 'regular',
    roof: 'gable',
    chimney: true,
    seed: 53,
    tint: 0xdccfaf,
  },
  {
    footprint: { w: 4, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'front',
    windows: 'sparse',
    roof: 'gable',
    vines: 1,
    seed: 59,
    tint: 0x9fb493,
  },
  {
    footprint: { w: 8, d: 8 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'right',
    doorSegment: 2,
    windows: 'regular',
    roof: 'gable',
    dormers: 2,
    chimney: true,
    balcony: true,
    stairs: true,
    vines: 2,
    seed: 71,
    tint: 0xd4c8ab,
  },
  {
    footprint: { w: 6, d: 6 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'sparse',
    roof: 'gable',
    seed: 37,
    tint: 0xcfc6aa,
  },
  {
    footprint: { w: 6, d: 4 },
    storeys: 1,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'sparse',
    roof: 'gable',
    vines: 1,
    seed: 31,
    tint: 0xd8cdb4,
  },
  {
    footprint: { w: 4, d: 4 },
    storeys: 1,
    ground: 'plaster',
    upper: 'plaster',
    doorSide: 'front',
    windows: 'regular',
    roof: 'tower',
    seed: 83,
    tint: 0xd8d0bb,
  },
  {
    footprint: { w: 4, d: 8 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'left',
    doorSegment: 1,
    windows: 'busy',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    vines: 1,
    seed: 89,
    tint: 0xb7c3b1,
  },
  {
    footprint: { w: 6, d: 8 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'back',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    balcony: true,
    vines: 2,
    seed: 97,
    tint: 0xd3bea0,
  },
];

const kit = await loadVillageKit();
const index = clampInt(Number(q.get('h') ?? 0), 0, HOUSE_SPECS.length - 1);
const spec = HOUSE_SPECS[index]!;
const placements = buildHouse(spec);
const house = houseGroup(kit, placements);
scene.add(house);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, Math.max(2.0, spec.storeys * 1.35), 0);
controls.maxPolarAngle = Math.PI * 0.49;

function setShot(angle: number | string = 'iso') {
  const value =
    typeof angle === 'number'
      ? angle
      : ({ front: Math.PI, back: 0, left: -Math.PI / 2, right: Math.PI / 2, iso: Math.PI * 0.76 }[angle] ??
        Math.PI * 0.76);
  const radius = Math.max(11, Math.max(spec.footprint.w, spec.footprint.d) * 1.8 + 6);
  const y = Math.max(4.2, spec.storeys * 2.0);
  camera.position.set(Math.sin(value) * radius, y, Math.cos(value) * radius);
  controls.target.set(0, Math.max(2.0, spec.storeys * 1.35), 0);
  controls.update();
}
setShot(q.get('angle') ?? 'iso');

const statsEl = document.getElementById('stats');
let frame = 0;
engine.add({
  frame(_dt, t) {
    world.time.value = t;
    controls.update();
    if (statsEl && ++frame % 20 === 0) {
      const counters = engine.counters.last;
      statsEl.textContent =
        `${backend} · house ${index} · ${engine.fps.toFixed(0)} fps\n` +
        `draws ${counters.drawCalls} · tris ${(counters.triangles / 1000).toFixed(1)}k\n` +
        `pieces ${placements.length} · meshes ${house.children.length}`;
    }
  },
});

await renderer.compileAsync(scene, camera);
engine.start();

type HouseDev = {
  ready: boolean;
  shot(angle?: number | string): unknown;
  stats(): unknown;
};

(window as unknown as { __dev?: HouseDev }).__dev = {
  ready: true,
  shot: (angle: number | string = 'iso') => {
    setShot(angle);
    return (window as unknown as { __dev?: HouseDev }).__dev?.stats();
  },
  stats: () => ({
    backend,
    tier: tier.tier,
    house: index,
    pieces: placements.length,
    meshes: house.children.length,
    triangles: house.userData.triangles,
    counters: engine.counters.last,
  }),
};

function houseGroup(kit: VillageKit, housePlacements: ReturnType<typeof buildHouse>): Group {
  const group = new Group();
  let triangles = 0;
  for (const placement of housePlacements) {
    const parts = kit.pieces.get(placement.piece);
    if (!parts) continue;
    for (const part of parts) {
      const geometry = part.geometry.clone();
      geometry.applyMatrix4(placement.matrix);
      colorGeometry(geometry, part.materialKey === 'plaster' ? (placement.tint ?? 0xffffff) : 0xffffff);
      triangles += triangleCount(geometry);
      const mesh = new Mesh(geometry, kit.materials[part.materialKey]);
      mesh.name = `house-${placement.role}-${placement.piece}`;
      mesh.castShadow = part.materialKey !== 'glow';
      mesh.receiveShadow = part.materialKey !== 'glow';
      group.add(mesh);
    }
  }
  group.userData.triangles = triangles;
  return group;
}

function colorGeometry(geometry: BufferGeometry, colour: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const c = new Color(colour);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

function triangleCount(geometry: BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : min));
}
