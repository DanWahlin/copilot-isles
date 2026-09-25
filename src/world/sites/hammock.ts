import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village';
import { createVegetationMaterial } from '../vegetation/materials';
import { createPlantGeometry } from '../vegetation/plant-geometry';
import {
  MeshBuilder,
  box,
  cylinder,
  linearHex,
  merge,
  paint,
  plank,
  TRIM,
  tubeBetween,
  worldUv,
} from './geo';

export interface HammockSite {
  readonly group: Group;
  /** Lyra's anchor: she sits on the near hammock edge, facing the player's approach. */
  readonly seat: { x: number; y: number; z: number; heading: number };
  /** Where the player stands to talk, on walkable sand. */
  readonly spot: { x: number; y: number; z: number; heading: number };
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  readonly anchors: Record<string, VillageAnchor>;
  excludes(x: number, z: number): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

export function createHammock(o: {
  tier: TierSettings;
  kit: VillageKit;
  ground: (x: number, z: number) => number;
}): HammockSite {
  const detail = o.tier.tier === 'lite' ? 8 : o.tier.tier === 'low' ? 10 : 12;
  const group = new Group();
  group.name = 'bard hammock camp (Q0.9)';

  const y = (x: number, z: number) => o.ground(x, z);
  const seat = {
    x: CAMP.x,
    y: y(CAMP.x, CAMP.z + 0.42) + 0.58,
    z: CAMP.z + 0.42,
    heading: CAMP.heading,
  };
  const spot = {
    x: CAMP.x + Math.sin(CAMP.heading) * 2.05,
    y: y(CAMP.x + Math.sin(CAMP.heading) * 2.05, CAMP.z + 0.42 + Math.cos(CAMP.heading) * 2.05),
    z: CAMP.z + 0.42 + Math.cos(CAMP.heading) * 2.05,
    heading: CAMP.heading + Math.PI,
  };
  const travel = {
    x: seat.x + Math.sin(seat.heading) * 3.5,
    z: seat.z + Math.cos(seat.heading) * 3.5,
  };

  const woodMesh = new Mesh(buildWood(y, detail), o.kit.materials.wood);
  woodMesh.name = 'bard hammock wood props';
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;

  const palmMaterial = createVegetationMaterial({
    map: null,
    color: new Color(0xffffff),
    alphaTest: 0.05,
    name: 'bard-hammock-coconut-palms',
  });
  const palmL = createPalmPost(
    'bard hammock left coconut palm',
    y,
    POST_L.x - 0.85,
    POST_L.z - 0.05,
    0.42,
    0.43,
    palmMaterial,
  );
  const palmR = createPalmPost(
    'bard hammock right coconut palm',
    y,
    POST_R.x + 0.85,
    POST_R.z - 0.05,
    -0.42,
    0.44,
    palmMaterial,
  );

  const cloth = buildCloth(y);
  const clothMesh = new Mesh(cloth.geometry, o.kit.materials.cloth);
  clothMesh.name = 'bard hammock animated cloth';
  clothMesh.castShadow = true;
  clothMesh.receiveShadow = true;

  const stoneMesh = new Mesh(buildStone(y, detail), o.kit.materials.stone);
  stoneMesh.name = 'bard hammock cold firepit';
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;

  group.add(palmL, palmR, woodMesh, clothMesh, stoneMesh);

  const colliders = {
    circles: [
      { x: POST_L.x, z: POST_L.z, r: 0.35 },
      { x: POST_R.x, z: POST_R.z, r: 0.35 },
      { x: STOOL.x, z: STOOL.z, r: 0.45 },
      { x: FIRE.x, z: FIRE.z, r: 0.75 },
    ],
    boxes: [{ x: CAMP.x, z: CAMP.z + 0.45, hx: 3.25, hz: 0.75, rot: 0, height: 2.25 }],
  };
  const anchors = {
    bardHammock: {
      x: travel.x,
      y: y(travel.x, travel.z),
      z: travel.z,
      heading: seat.heading + Math.PI,
    },
  } satisfies Record<string, VillageAnchor>;

  return {
    group,
    seat,
    spot,
    colliders,
    anchors,
    excludes(x, z) {
      return Math.hypot(x - CAMP.x, z - CAMP.z) < 10.5 || Math.hypot(x - FIRE.x, z - FIRE.z) < 1.2;
    },
    update(_dt, t) {
      swayHammock(cloth, t);
    },
    dispose() {
      palmL.geometry.dispose();
      palmR.geometry.dispose();
      palmMaterial.dispose();
      woodMesh.geometry.dispose();
      clothMesh.geometry.dispose();
      stoneMesh.geometry.dispose();
      group.removeFromParent();
    },
  };
}

interface ClothBuild {
  geometry: BufferGeometry;
  hammockStart: number;
  hammockCount: number;
  hammockBase: Float32Array;
}

const CAMP = { x: -18, z: 86.2, heading: Math.PI } as const;
const POST_L = { x: -21.0, z: CAMP.z + 0.28 } as const;
const POST_R = { x: -15.0, z: CAMP.z + 0.28 } as const;
const STOOL = { x: -15.55, z: 84.6 } as const;
const FIRE = { x: -20.05, z: 84.2 } as const;

function createPalmPost(
  name: string,
  ground: (x: number, z: number) => number,
  x: number,
  z: number,
  yaw: number,
  scale: number,
  material: ReturnType<typeof createVegetationMaterial>,
): Mesh {
  const mesh = new Mesh(createPlantGeometry('palmTall'), material);
  mesh.name = name;
  mesh.position.set(x, ground(x, z) - 0.05, z);
  mesh.rotation.y = yaw;
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWood(ground: (x: number, z: number) => number, detail: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const postLTop = { x: POST_L.x + 0.52, y: ground(POST_L.x, POST_L.z) + 2.25, z: POST_L.z + 0.18 };
  const postRTop = { x: POST_R.x - 0.52, y: ground(POST_R.x, POST_R.z) + 2.25, z: POST_R.z + 0.18 };
  parts.push(tubeBetween(0.035, postLTop, postRTop, 0xd8c2a0, 6));
  parts.push(
    tubeBetween(
      0.018,
      { x: postLTop.x - 0.28, y: postLTop.y - 0.03, z: postLTop.z + 0.04 },
      { x: postLTop.x + 0.22, y: postLTop.y + 0.02, z: postLTop.z - 0.02 },
      0xd8c2a0,
      6,
    ),
  );
  parts.push(
    tubeBetween(
      0.018,
      { x: postRTop.x - 0.22, y: postRTop.y + 0.02, z: postRTop.z - 0.02 },
      { x: postRTop.x + 0.28, y: postRTop.y - 0.03, z: postRTop.z + 0.04 },
      0xd8c2a0,
      6,
    ),
  );
  parts.push(
    tubeBetween(
      0.022,
      { x: POST_L.x + 0.48, y: ground(POST_L.x, POST_L.z) + 1.65, z: CAMP.z + 0.45 },
      { x: POST_L.x + 0.9, y: ground(POST_L.x, POST_L.z) + 1.53, z: CAMP.z + 0.45 },
      0xd8c2a0,
      6,
    ),
  );
  parts.push(
    tubeBetween(
      0.022,
      { x: POST_R.x - 0.48, y: ground(POST_R.x, POST_R.z) + 1.65, z: CAMP.z + 0.45 },
      { x: POST_R.x - 0.9, y: ground(POST_R.x, POST_R.z) + 1.53, z: CAMP.z + 0.45 },
      0xd8c2a0,
      6,
    ),
  );

  const stoolY = ground(STOOL.x, STOOL.z);
  parts.push(
    plank(0.78, 0.1, 0.52, { x: STOOL.x, y: stoolY + 0.42, z: STOOL.z, ry: -0.15 }, 0xb38a63, TRIM.light),
  );
  for (const [dx, dz] of [
    [-0.26, -0.16],
    [0.26, -0.16],
    [-0.26, 0.16],
    [0.26, 0.16],
  ] as const) {
    parts.push(
      tubeBetween(
        0.035,
        { x: STOOL.x + dx * 1.06, y: stoolY + 0.04, z: STOOL.z + dz * 1.06 },
        { x: STOOL.x + dx, y: stoolY + 0.46, z: STOOL.z + dz },
        0x9b7149,
        6,
      ),
    );
  }
  parts.push(
    plank(
      0.64,
      0.045,
      0.46,
      { x: STOOL.x - 0.02, y: stoolY + 0.54, z: STOOL.z, ry: -0.2 },
      0x6f4b34,
      TRIM.dark,
    ),
  );

  addLute(parts, ground, detail);
  addColdLogs(parts, ground);
  return merge(parts);
}

function addLute(parts: BufferGeometry[], ground: (x: number, z: number) => number, detail: number): void {
  const base = { x: POST_L.x + 0.46, z: POST_L.z - 0.46 };
  const gy = ground(base.x, base.z);
  const body = new SphereGeometry(0.32, Math.max(12, detail + 4), 8, 0, Math.PI * 2, 0.08, Math.PI * 0.92);
  body.scale(0.78, 1.12, 0.32);
  body.rotateZ(-0.13);
  body.translate(base.x, gy + 0.31, base.z + 0.035);
  worldUv(body, 1.2);
  parts.push(paint(body, 0x9e6336));
  parts.push(pearFace(base.x, gy + 0.32, base.z - 0.055, 0.44, 0.5, 0xd59a55, detail + 8));
  const rose = new CylinderGeometry(0.055, 0.055, 0.018, Math.max(10, detail), 1);
  rose.rotateX(Math.PI / 2);
  rose.translate(base.x - 0.02, gy + 0.38, base.z - 0.072);
  parts.push(paint(rose, 0x2d1c15));
  parts.push(
    tubeBetween(
      0.026,
      { x: base.x + 0.06, y: gy + 0.58, z: base.z - 0.04 },
      { x: base.x + 0.28, y: gy + 0.92, z: base.z - 0.09 },
      0x8b5a33,
      6,
    ),
  );
  parts.push(
    tubeBetween(
      0.032,
      { x: base.x + 0.28, y: gy + 0.92, z: base.z - 0.09 },
      { x: base.x + 0.18, y: gy + 1.08, z: base.z - 0.22 },
      0x70401f,
      5,
    ),
  );
  parts.push(
    plank(0.22, 0.045, 0.08, { x: base.x + 0.16, y: gy + 1.06, z: base.z - 0.23, ry: 0.15 }, 0x6f3c1d),
  );
}

function addColdLogs(parts: BufferGeometry[], ground: (x: number, z: number) => number): void {
  const fy = ground(FIRE.x, FIRE.z) + 0.03;
  parts.push(
    tubeBetween(
      0.04,
      { x: FIRE.x - 0.35, y: fy, z: FIRE.z - 0.1 },
      { x: FIRE.x + 0.35, y: fy, z: FIRE.z + 0.12 },
      0x5b3d2b,
      7,
    ),
  );
  parts.push(
    tubeBetween(
      0.035,
      { x: FIRE.x - 0.16, y: fy + 0.03, z: FIRE.z + 0.32 },
      { x: FIRE.x + 0.18, y: fy + 0.03, z: FIRE.z - 0.32 },
      0x4d3325,
      7,
    ),
  );
}

function buildCloth(ground: (x: number, z: number) => number): ClothBuild {
  const builder = new MeshBuilder('xz', 0.35);
  const hammockStart = builder.vertexCount;
  addHammock(builder, ground);
  const hammockCount = builder.vertexCount - hammockStart;
  addBunting(builder, ground);
  addSongbook(builder, ground);
  addMat(builder, ground);
  const geometry = builder.geometry();
  const hammockBase = (geometry.getAttribute('position') as BufferAttribute).array.slice(
    hammockStart * 3,
    (hammockStart + hammockCount) * 3,
  ) as Float32Array;
  return { geometry, hammockStart, hammockCount, hammockBase };
}

function addHammock(builder: MeshBuilder, ground: (x: number, z: number) => number): void {
  const cols = 18;
  const rows = 6;
  const leftY = ground(POST_L.x, POST_L.z) + 1.08;
  const rightY = ground(POST_R.x, POST_R.z) + 1.08;
  const start = builder.vertexCount;
  for (let i = 0; i <= cols; i += 1) {
    const u = i / cols;
    const x = POST_L.x + 0.9 + (POST_R.x - POST_L.x - 1.8) * u;
    const y = leftY + (rightY - leftY) * u - Math.sin(u * Math.PI) * 0.54;
    const stripe = i % 4 < 2;
    const width = 0.16 + Math.pow(Math.sin(u * Math.PI), 0.55) * 1.0;
    for (let j = 0; j <= rows; j += 1) {
      const v = j / rows - 0.5;
      const edge = Math.abs(v) * 2;
      const sideLift = edge * edge * 0.18;
      const curl = Math.sign(v) * edge * edge * 0.035;
      builder.vertex(
        { x, y: y + sideLift, z: CAMP.z + 0.45 + v * width + curl },
        linearHex(stripe ? 0xd45f4a : 0xf1d9aa),
      );
    }
  }
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const a = start + i * (rows + 1) + j;
      builder.indices.push(a, a + rows + 1, a + 1, a + 1, a + rows + 1, a + rows + 2);
    }
  }
}

function addBunting(builder: MeshBuilder, ground: (x: number, z: number) => number): void {
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1);
    const x = POST_L.x + 0.8 + (POST_R.x - POST_L.x - 1.6) * u;
    const y = ground(x, CAMP.z) + 1.96 - Math.sin(u * Math.PI) * 0.18;
    const z = CAMP.z - 0.32;
    const w = 0.22;
    const h = 0.28;
    builder.color(linearHex(i % 3 === 0 ? 0xefd69d : i % 3 === 1 ? 0x78a7a7 : 0xd67f63));
    builder.tri({ x: x - w, y, z }, { x: x + w, y, z }, { x, y: y - h, z: z + 0.03 });
  }
}

function addSongbook(builder: MeshBuilder, ground: (x: number, z: number) => number): void {
  const y = ground(STOOL.x, STOOL.z) + 0.595;
  const cx = STOOL.x - 0.02;
  const cz = STOOL.z - 0.01;
  builder.color(linearHex(0xeadcbd));
  builder.quad(
    { x: cx - 0.29, y, z: cz - 0.18 },
    { x: cx - 0.02, y: y + 0.015, z: cz - 0.18 },
    { x: cx - 0.02, y: y + 0.015, z: cz + 0.18 },
    { x: cx - 0.29, y, z: cz + 0.18 },
  );
  builder.quad(
    { x: cx + 0.02, y: y + 0.015, z: cz - 0.18 },
    { x: cx + 0.29, y, z: cz - 0.18 },
    { x: cx + 0.29, y, z: cz + 0.18 },
    { x: cx + 0.02, y: y + 0.015, z: cz + 0.18 },
  );
}

function addMat(builder: MeshBuilder, ground: (x: number, z: number) => number): void {
  const y = ground(STOOL.x - 0.15, STOOL.z + 0.75) + 0.025;
  const x0 = STOOL.x - 0.65;
  const z0 = STOOL.z + 0.42;
  const w = 1.25;
  const d = 0.7;
  const stripes = 5;
  for (let i = 0; i < stripes; i += 1) {
    const a = i / stripes;
    const b = (i + 1) / stripes;
    builder.color(linearHex(i % 2 ? 0xc79a69 : 0x79513a));
    builder.quad(
      { x: x0, y, z: z0 + d * a },
      { x: x0 + w, y, z: z0 + d * a },
      { x: x0 + w, y, z: z0 + d * b },
      { x: x0, y, z: z0 + d * b },
    );
  }
}

function pearFace(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  tint: number,
  segments: number,
): BufferGeometry {
  const pos = [x, y, z];
  const col: number[] = [];
  const idx: number[] = [];
  const c = linearHex(tint);
  const pushColor = () => {
    col.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  };
  pushColor();
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const sy = Math.sin(a);
    const top = Math.max(0, sy);
    const bottom = Math.max(0, -sy);
    const rx = w * 0.5 * (0.72 + bottom * 0.34 - top * 0.28);
    const ry = h * 0.5 * (0.92 + bottom * 0.1);
    pos.push(x + Math.cos(a) * rx, y + sy * ry, z);
    pushColor();
  }
  for (let i = 0; i < segments; i += 1) idx.push(0, 1 + i, 1 + ((i + 1) % segments));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  worldUv(g, 1.2);
  return g;
}

function buildStone(ground: (x: number, z: number) => number, detail: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const fy = ground(FIRE.x, FIRE.z);
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.52 + (i % 2) * 0.04;
    parts.push(
      cylinder(
        0.11,
        0.14,
        0.13,
        { x: FIRE.x + Math.cos(a) * r, y: fy - 0.02, z: FIRE.z + Math.sin(a) * r, ry: a },
        i % 2 ? 0x9a907e : 0x7c7468,
        Math.max(7, detail - 2),
      ),
    );
  }
  parts.push(box(0.72, 0.02, 0.5, { x: FIRE.x, y: fy - 0.015, z: FIRE.z, ry: 0.15 }, 0x4b4742, 1.0));
  return merge(parts);
}

function swayHammock(build: ClothBuild, t: number): void {
  const pos = build.geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < build.hammockCount; i += 1) {
    const base = i * 3;
    const x = build.hammockBase[base]!;
    const y = build.hammockBase[base + 1]!;
    const z = build.hammockBase[base + 2]!;
    const u = i / Math.max(1, build.hammockCount - 1);
    const sway = Math.sin(t * 1.15 + x * 0.45) * 0.035;
    pos.setXYZ(build.hammockStart + i, x, y + sway * (0.4 + Math.sin(u * Math.PI) * 0.6), z + sway * 0.45);
  }
  pos.needsUpdate = true;
}
