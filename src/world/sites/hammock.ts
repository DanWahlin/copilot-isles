import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Object3D,
  Vector3,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village/kit';
import { palmMaterial } from '../vegetation/model-loader';
import { palmTrunkRings, type PalmTrunkRing } from '../vegetation/palms';
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
  palms?: { left: Object3D; right: Object3D };
}): HammockSite {
  const detail = o.tier.tier === 'lite' ? 8 : o.tier.tier === 'low' ? 10 : 12;
  const group = new Group();
  group.name = 'bard hammock camp';

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

  const palmL = o.palms?.left ?? new Group();
  const palmR = o.palms?.right ?? new Group();
  const trunkL = placePalmPost(palmL, 'bard hammock left coconut palm', y, PALM_L, 0.34, 1);
  const trunkR = placePalmPost(palmR, 'bard hammock right coconut palm', y, PALM_R, -0.34, 1.02);
  const bunting = buntingLine(trunkL, trunkR);

  const woodMesh = new Mesh(buildWood(y, detail, trunkL, trunkR, bunting), o.kit.materials.wood);
  woodMesh.name = 'bard hammock wood props';
  woodMesh.castShadow = false;
  woodMesh.receiveShadow = true;

  const cloth = buildCloth(y, bunting);
  const clothMesh = new Mesh(cloth.geometry, o.kit.materials.cloth);
  clothMesh.name = 'bard hammock animated cloth';
  clothMesh.castShadow = false;
  clothMesh.receiveShadow = true;

  const stoneMesh = new Mesh(buildStone(y, detail), o.kit.materials.stone);
  stoneMesh.name = 'bard hammock cold firepit';
  stoneMesh.castShadow = false;
  stoneMesh.receiveShadow = true;

  group.add(palmL, palmR, woodMesh, clothMesh, stoneMesh);

  const colliders = {
    circles: [
      { x: PALM_L.x, z: PALM_L.z, r: 0.35 },
      { x: PALM_R.x, z: PALM_R.z, r: 0.35 },
      { x: LUTE.x, z: LUTE.z + 0.15, r: 0.3 },
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
      disposeTree(palmL);
      disposeTree(palmR);
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
/** Where each palm's trunk stands (its foot, not the model's centre). */
const PALM_L = { x: -21.15, z: CAMP.z + 0.22 } as const;
const PALM_R = { x: -14.85, z: CAMP.z + 0.22 } as const;
const HAMMOCK_L = { x: -20.55, z: CAMP.z + 0.45 } as const;
const HAMMOCK_R = { x: -15.45, z: CAMP.z + 0.45 } as const;
/** The cloth's gathered ends, above the ground. */
const HAMMOCK_END = 1.18;
/** Heights above each palm's foot where the hammock's ropes and the bunting tie round the trunks. */
const ROPE_TIE = 1.5;
const BUNTING_TIE = 2.45;
/** The bunting's sag at its middle (it clears Lyra's head). */
const BUNTING_SAG = 0.16;
/**
 * Lyra's lute, propped on the sand at her side, its face to the path and leaning back toward the
 * hammock (its head stays clear of the cloth's near edge). `size` scales the 0.76 m instrument up a
 * little so it reads beside her (the cast's heads are big).
 */
const LUTE = { x: CAMP.x + 0.85, z: CAMP.z - 0.66, yaw: Math.PI + 0.3, lean: 0.3, size: 1.12 } as const;
const STOOL = { x: -15.55, z: 84.6 } as const;
const FIRE = { x: -20.05, z: 84.2 } as const;
const ROPE = 0xd8c2a0;

/** A palm's trunk in world space: the ground at its foot and its rings, bottom up. */
interface Trunk {
  readonly foot: number;
  readonly rings: readonly PalmTrunkRing[];
}

/**
 * Stands a palm with its trunk's foot on `at`, and returns where its trunk runs. The palm models are
 * centred on their whole bounds, crown and all, so a trunk's foot sits up to a metre off the model's
 * origin; ties are measured on the trunk itself (its lean and curve), never assumed at the origin.
 */
function placePalmPost(
  palm: Object3D,
  name: string,
  ground: (x: number, z: number) => number,
  at: { x: number; z: number },
  yaw: number,
  scale: number,
): Trunk {
  const foot = ground(at.x, at.z);
  palm.name = name;
  palm.position.set(at.x, foot - 0.05, at.z);
  palm.rotation.y = yaw;
  palm.scale.setScalar(scale);
  palm.updateMatrixWorld(true);
  const rings: PalmTrunkRing[] = [];
  const p = new Vector3();
  palm.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const s = mesh.matrixWorld.getMaxScaleOnAxis();
    for (const ring of palmTrunkRings(mesh.geometry)) {
      p.set(ring.x, ring.y, ring.z).applyMatrix4(mesh.matrixWorld);
      rings.push({ x: p.x, y: p.y, z: p.z, r: ring.r * s });
    }
  });
  if (rings.length < 2) {
    return {
      foot,
      rings: [
        { x: at.x, y: foot - 0.05, z: at.z, r: 0.14 },
        { x: at.x, y: foot + 4, z: at.z, r: 0.12 },
      ],
    };
  }
  rings.sort((a, b) => a.y - b.y);
  const base = ringAt(rings, foot + 0.3);
  const dx = at.x - base.x;
  const dz = at.z - base.z;
  palm.position.x += dx;
  palm.position.z += dz;
  palm.updateMatrixWorld(true);
  return { foot, rings: rings.map((r) => ({ x: r.x + dx, y: r.y, z: r.z + dz, r: r.r })) };
}

/** The trunk's centre and girth at world height `y` (between its rings). */
function ringAt(rings: readonly PalmTrunkRing[], y: number): PalmTrunkRing {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1]!.y < y) i += 1;
  const a = rings[i]!;
  const b = rings[i + 1]!;
  const t = Math.min(1, Math.max(0, (y - a.y) / Math.max(1e-6, b.y - a.y)));
  return {
    x: a.x + (b.x - a.x) * t,
    y,
    z: a.z + (b.z - a.z) * t,
    r: a.r + (b.r - a.r) * t,
  };
}

function trunkAt(trunk: Trunk, height: number): PalmTrunkRing {
  return ringAt(trunk.rings, trunk.foot + height);
}

/** The point on a trunk ring's bark facing `toward` (in plan). */
function barkToward(ring: PalmTrunkRing, toward: { x: number; z: number }): Point {
  const dx = toward.x - ring.x;
  const dz = toward.z - ring.z;
  const d = Math.max(1e-6, Math.hypot(dx, dz));
  return { x: ring.x + (dx / d) * ring.r, y: ring.y, z: ring.z + (dz / d) * ring.r };
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/** The bunting's line, tied round both trunks: its ends on the bark and its sag. */
interface BuntingLine {
  readonly a: Point;
  readonly b: Point;
}

function buntingLine(trunkL: Trunk, trunkR: Trunk): BuntingLine {
  const l = trunkAt(trunkL, BUNTING_TIE);
  const r = trunkAt(trunkR, BUNTING_TIE);
  return { a: barkToward(l, r), b: barkToward(r, l) };
}

/** A point along the bunting's line (0 at the left trunk), sagging as a parabola. */
function buntingAt(line: BuntingLine, u: number): Point {
  const { a, b } = line;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u - 4 * BUNTING_SAG * u * (1 - u),
    z: a.z + (b.z - a.z) * u,
  };
}

function disposeTree(root: Object3D): void {
  const sharedPalmMaterial = palmMaterial();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material as { dispose?: () => void } | Array<{ dispose?: () => void }>;
    if (Array.isArray(material)) {
      for (const m of material) if (m !== sharedPalmMaterial) m.dispose?.();
    } else if (material !== sharedPalmMaterial) material.dispose?.();
  });
}

function buildWood(
  ground: (x: number, z: number) => number,
  detail: number,
  trunkL: Trunk,
  trunkR: Trunk,
  bunting: BuntingLine,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  addHammockRope(parts, ground, HAMMOCK_L, trunkL);
  addHammockRope(parts, ground, HAMMOCK_R, trunkR);
  const steps = 8;
  for (let i = 0; i < steps; i += 1) {
    parts.push(
      tubeBetween(0.01, buntingAt(bunting, i / steps), buntingAt(bunting, (i + 1) / steps), ROPE, 5),
    );
  }
  for (const [trunk, end] of [
    [trunkL, bunting.a],
    [trunkR, bunting.b],
  ] as const) {
    parts.push(lashing(ringAt(trunk.rings, end.y), 0.012, ROPE, detail));
  }

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

  parts.push(buildLute(ground, detail));
  addColdLogs(parts, ground);
  return merge(parts);
}

/**
 * One end of the hammock: the cloth's gathered end fans into cords that meet at a knot, and one rope
 * runs from there to the trunk, wrapped twice round it.
 */
function addHammockRope(
  parts: BufferGeometry[],
  ground: (x: number, z: number) => number,
  end: { x: number; z: number },
  trunk: Trunk,
): void {
  const ey = ground(end.x, end.z) + HAMMOCK_END;
  const ring = trunkAt(trunk, ROPE_TIE);
  const tie = barkToward(ring, end);
  const knot = {
    x: end.x + (tie.x - end.x) * 0.3,
    y: ey + (tie.y - ey) * 0.3,
    z: end.z + (tie.z - end.z) * 0.3,
  };
  // The cloth's end (addHammock at u = 0 or 1): its middle, and its edges lifted and curled.
  for (const [dy, dz] of [
    [0, 0],
    [0.18, -0.115],
    [0.18, 0.115],
  ] as const) {
    parts.push(tubeBetween(0.008, { x: end.x, y: ey + dy, z: end.z + dz }, knot, ROPE, 5));
  }
  parts.push(tubeBetween(0.016, knot, tie, ROPE, 6));
  parts.push(lashing(ring, 0.017, ROPE, 12));
  parts.push(lashing(trunkAt(trunk, ROPE_TIE - 0.045), 0.017, ROPE, 12));
}

/** A turn of rope round a trunk ring, pressed into the bark (a torus, built by hand: no TorusGeometry). */
function lashing(ring: PalmTrunkRing, tube: number, hex: number, segments: number): BufferGeometry {
  const sides = 5;
  const major = ring.r + tube * 0.5;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let j = 0; j <= sides; j += 1) {
      const b = (j / sides) * Math.PI * 2;
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      pos.push(ring.x + ca * (major + cb * tube), ring.y + sb * tube, ring.z + sa * (major + cb * tube));
      nrm.push(ca * cb, sb, sa * cb);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(idx);
  worldUv(g, 0.8);
  return paint(g, hex);
}

/** The lute's body outline: a pear, wide at the tail (dx, dy from its centre, `a` round it). */
function pearOutline(a: number, w: number, h: number): [number, number] {
  const sy = Math.sin(a);
  const top = Math.max(0, sy);
  const bottom = Math.max(0, -sy);
  const rx = w * 0.5 * (0.72 + bottom * 0.34 - top * 0.28);
  const ry = h * 0.5 * (0.92 + bottom * 0.1);
  return [Math.cos(a) * rx, sy * ry];
}

/**
 * Lyra's lute (about 0.76 m, like a real one): a ribbed bowl behind a pale soundboard with a dark
 * rose, a neck and fingerboard, and the pegbox bent back. Built standing (soundboard facing +z,
 * tail at y = 0), then propped at `LUTE`, resting on the sand.
 */
function buildLute(ground: (x: number, z: number) => number, detail: number): BufferGeometry {
  const w = 0.36;
  const h = 0.46;
  const cy = h * 0.5 * 1.02;
  const depth = 0.15;
  const segments = Math.max(16, detail + 8);
  const parts: BufferGeometry[] = [];

  // The bowl: the outline shrinks toward the back as a dome.
  const rings = 5;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= rings; k += 1) {
    const t = (k / rings) * Math.PI * 0.5;
    for (let i = 0; i < segments; i += 1) {
      const [dx, dy] = pearOutline((i / segments) * Math.PI * 2, w, h);
      pos.push(dx * Math.cos(t), cy + dy * Math.cos(t), -depth * Math.sin(t));
    }
  }
  for (let k = 0; k < rings; k += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = k * segments + i;
      const b = k * segments + ((i + 1) % segments);
      idx.push(a, a + segments, b, b, a + segments, b + segments);
    }
  }
  const bowl = new BufferGeometry();
  bowl.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  bowl.setIndex(idx);
  bowl.computeVertexNormals();
  worldUv(bowl, 1.2);
  parts.push(paint(bowl, 0x8a5230));

  const face = pearFace(0, cy, 0.003, w, h, 0xd59a55, segments);
  parts.push(face);
  const rose = new CylinderGeometry(0.045, 0.045, 0.006, Math.max(10, detail), 1);
  rose.rotateX(Math.PI / 2);
  rose.translate(0, cy + 0.07, 0.006);
  parts.push(paint(rose, 0x2d1c15));
  parts.push(plank(0.13, 0.02, 0.022, { x: 0, y: cy - 0.14, z: 0.014 }, 0x4a2a17, TRIM.dark));

  const neckFrom = cy + h * 0.5 * 0.92 - 0.03;
  const neckTo = 0.7;
  parts.push(plank(0.055, neckTo - neckFrom, 0.038, { x: 0, y: neckFrom, z: -0.002 }, 0x8b5a33, TRIM.light));
  parts.push(
    plank(0.05, neckTo - neckFrom + 0.02, 0.006, { x: 0, y: neckFrom - 0.02, z: 0.021 }, 0x2d1c15, TRIM.dark),
  );
  // The pegbox, bent back from the neck, and its pegs.
  const bend = -1.15;
  parts.push(plank(0.045, 0.15, 0.03, { x: 0, y: neckTo - 0.01, z: 0, rx: bend }, 0x70401f, TRIM.dark));
  for (let i = 0; i < 3; i += 1) {
    const s = 0.035 + i * 0.04;
    const py = neckTo - 0.01 + Math.cos(-bend) * s;
    const pz = -Math.sin(-bend) * s;
    parts.push(tubeBetween(0.007, { x: -0.05, y: py, z: pz }, { x: 0.05, y: py, z: pz }, 0x2d1c15, 5));
  }

  const lute = merge(parts);
  lute.scale(LUTE.size, LUTE.size, LUTE.size);
  lute.rotateX(-LUTE.lean);
  lute.rotateY(LUTE.yaw);
  lute.computeBoundingBox();
  // Rest its lowest point (the bowl's tail) on the sand, just pressed in.
  lute.translate(LUTE.x, ground(LUTE.x, LUTE.z) - 0.01 - lute.boundingBox!.min.y, LUTE.z);
  return lute;
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

function buildCloth(ground: (x: number, z: number) => number, bunting: BuntingLine): ClothBuild {
  const builder = new MeshBuilder('xz', 0.35);
  const hammockStart = builder.vertexCount;
  addHammock(builder, ground);
  const hammockCount = builder.vertexCount - hammockStart;
  addBunting(builder, bunting);
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
  const leftY = ground(HAMMOCK_L.x, HAMMOCK_L.z) + HAMMOCK_END;
  const rightY = ground(HAMMOCK_R.x, HAMMOCK_R.z) + HAMMOCK_END;
  const start = builder.vertexCount;
  for (let i = 0; i <= cols; i += 1) {
    const u = i / cols;
    const x = HAMMOCK_L.x + (HAMMOCK_R.x - HAMMOCK_L.x) * u;
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

function addBunting(builder: MeshBuilder, line: BuntingLine): void {
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    // Hung along the line, clear of the knots at the trunks.
    const p = buntingAt(line, 0.08 + (0.84 * i) / (count - 1));
    const y = p.y - 0.01;
    const w = 0.22;
    const h = 0.28;
    builder.color(linearHex(i % 3 === 0 ? 0xefd69d : i % 3 === 1 ? 0x78a7a7 : 0xd67f63));
    builder.tri({ x: p.x - w, y, z: p.z }, { x: p.x + w, y, z: p.z }, { x: p.x, y: y - h, z: p.z + 0.03 });
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
    const [dx, dy] = pearOutline((i / segments) * Math.PI * 2, w, h);
    pos.push(x + dx, y + dy, z);
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
