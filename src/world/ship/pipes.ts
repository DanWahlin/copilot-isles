import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three/webgpu';
import { createSparkleMaterial, shaftGeometry, starGeometry } from '../sites/sparkle';
import { deckHeightAt } from './lines';
import { basisFromAxis, MeshBuilder, type P3 } from './mesh-builder';

type PipeKind = 'tube' | 'hatch';

type SolidPartKind = 'tubeCap' | 'hatchDoor';

interface DynamicPart {
  indices: number[];
  pivot: P3;
  kind: SolidPartKind;
}

function add(a: P3, b: P3, k = 1): P3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

export interface ShipPipes {
  /** Ship-local point just outboard of the speaking tube, where the interaction prompt sits. */
  readonly tube: { x: number; y: number; z: number };
  /** Ship-local point just outboard of the terminal hatch, where the interaction prompt sits. */
  readonly hatch: { x: number; y: number; z: number };
  setHint(which: PipeKind | null): void;
  play(which: PipeKind): void;
}

interface ShipPipesSystem extends ShipPipes {
  readonly group: Group;
  update(dt: number, t: number): void;
  dispose(): void;
}

const TUBE_Z = -8.55;
const HATCH_Z = -7.45;
const TUBE = { x: 2.58, y: deckHeightAt(TUBE_Z) + 0.14, z: TUBE_Z };
const HATCH = { x: 2.65, y: deckHeightAt(HATCH_Z) + 0.04, z: HATCH_Z };
const TUBE_PROMPT = { x: 2.78, y: TUBE.y + 0.02, z: TUBE_Z };
const HATCH_PROMPT = { x: 2.83, y: HATCH.y, z: HATCH_Z };
const TUBE_AXIS = { x: Math.cos(0.39), y: -Math.sin(0.39), z: 0 };
const TUBE_MOUTH = { x: TUBE.x + 0.78, y: TUBE.y + 0.16, z: TUBE.z };
const TUBE_THROAT = add(TUBE_MOUTH, TUBE_AXIS, -0.54);
const HATCH_GAP = { x: HATCH.x + 0.18, y: HATCH.y - 0.02, z: HATCH.z };

type SparkKind = 'tubeHint' | 'hatchHint' | 'hatchWisp' | 'hatchFlash' | 'tubeRing';

interface SparkPart {
  kind: SparkKind;
  start: number;
  count: number;
  colorStart: number;
  colorCount: number;
  pivot: P3;
  phase: number;
}

function appendTemplate(
  positions: number[],
  colors: number[],
  indices: number[],
  parts: SparkPart[],
  geometry: BufferGeometry,
  kind: SparkKind,
  pivot: P3,
  phase = 0,
): void {
  const srcPos = geometry.getAttribute('position') as BufferAttribute;
  const srcCol = geometry.getAttribute('color') as BufferAttribute;
  const start = positions.length / 3;
  const colorStart = colors.length / 3;
  for (let i = 0; i < srcPos.count; i++) {
    positions.push(srcPos.getX(i) + pivot.x, srcPos.getY(i) + pivot.y, srcPos.getZ(i) + pivot.z);
    colors.push(srcCol.getX(i), srcCol.getY(i), srcCol.getZ(i));
  }
  const srcIndex = geometry.getIndex();
  if (srcIndex) for (let i = 0; i < srcIndex.count; i++) indices.push(start + srcIndex.getX(i));
  parts.push({ kind, start, count: srcPos.count, colorStart, colorCount: srcCol.count, pivot, phase });
  geometry.dispose();
}

function appendRing(
  positions: number[],
  colors: number[],
  indices: number[],
  parts: SparkPart[],
  phase: number,
): void {
  const segments = 28;
  const start = positions.length / 3;
  const colorStart = colors.length / 3;
  for (let i = 0; i < segments * 2; i++) {
    positions.push(0, 0, 0);
    colors.push(0, 0, 0);
  }
  for (let i = 0; i < segments; i++) {
    const n = (i + 1) % segments;
    indices.push(
      start + i * 2,
      start + n * 2,
      start + n * 2 + 1,
      start + i * 2,
      start + n * 2 + 1,
      start + i * 2 + 1,
    );
  }
  parts.push({
    kind: 'tubeRing',
    start,
    count: segments * 2,
    colorStart,
    colorCount: segments * 2,
    pivot: TUBE_MOUTH,
    phase,
  });
}

function createSparkles(): {
  mesh: Mesh;
  geometry: BufferGeometry;
  position: BufferAttribute;
  color: BufferAttribute;
  basePositions: Float32Array;
  baseColors: Float32Array;
  parts: SparkPart[];
  dispose(): void;
} {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const parts: SparkPart[] = [];
  appendTemplate(
    positions,
    colors,
    indices,
    parts,
    starGeometry(0.27, { rgb: [1, 0.86, 0.34], strength: 1.6 }),
    'tubeHint',
    add(TUBE_MOUTH, TUBE_AXIS, 0.12),
  );
  appendTemplate(
    positions,
    colors,
    indices,
    parts,
    starGeometry(0.24, { rgb: [1, 0.58, 0.18], strength: 1.4 }),
    'hatchHint',
    HATCH_GAP,
  );
  appendTemplate(
    positions,
    colors,
    indices,
    parts,
    shaftGeometry(0.72, 0.18, { rgb: [1, 0.86, 0.62], strength: 0.8 }),
    'hatchWisp',
    HATCH_GAP,
  );
  appendTemplate(
    positions,
    colors,
    indices,
    parts,
    starGeometry(0.34, { rgb: [1, 0.25, 0.05], strength: 1.8 }),
    'hatchFlash',
    HATCH_GAP,
  );
  appendRing(positions, colors, indices, parts, 0.0);
  appendRing(positions, colors, indices, parts, 0.22);
  appendRing(positions, colors, indices, parts, 0.44);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = createSparkleMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'pipe hint and response sparkles';
  mesh.frustumCulled = false;
  const position = geometry.getAttribute('position') as BufferAttribute;
  const color = geometry.getAttribute('color') as BufferAttribute;
  return {
    mesh,
    geometry,
    position,
    color,
    basePositions: new Float32Array(position.array as Float32Array),
    baseColors: new Float32Array(color.array as Float32Array),
    parts,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createShipPipes(material: Material): ShipPipesSystem {
  const builder = new MeshBuilder<Omit<DynamicPart, 'indices'>>({ defaultRegion: 3, cylinderCaps: false });
  builder.setRegion(3);
  builder.setColor(0xd4a34d);
  builder.addCylinderBetween({ x: TUBE.x, y: 2.18, z: TUBE.z }, { x: TUBE.x, y: 3.03, z: TUBE.z }, 0.054, 14);
  builder.addCylinderBetween({ x: TUBE.x, y: 2.17, z: TUBE.z }, { x: TUBE.x, y: 2.27, z: TUBE.z }, 0.12, 16);
  builder.addCylinderBetween({ x: TUBE.x, y: 3.03, z: TUBE.z }, TUBE_THROAT, 0.054, 14);
  builder.setColor(0xf1c160);
  builder.addCylinderBetween(
    { x: TUBE.x + 0.19, y: 3.04, z: TUBE.z },
    { x: TUBE.x + 0.3, y: 3.045, z: TUBE.z },
    0.068,
    14,
  );
  builder.setColor(0xd4a34d);
  builder.addLathe(
    [
      { center: TUBE_THROAT, radius: 0.055 },
      { center: add(TUBE_THROAT, TUBE_AXIS, 0.18), radius: 0.078 },
      { center: add(TUBE_THROAT, TUBE_AXIS, 0.36), radius: 0.135 },
      { center: add(TUBE_MOUTH, TUBE_AXIS, -0.035), radius: 0.205 },
      { center: add(TUBE_MOUTH, TUBE_AXIS, 0.015), radius: 0.245 },
      { center: add(TUBE_MOUTH, TUBE_AXIS, 0.055), radius: 0.22 },
    ],
    TUBE_AXIS,
    18,
  );
  builder.setRegion(4);
  builder.setColor(0x070604);
  builder.addDisc(add(TUBE_MOUTH, TUBE_AXIS, -0.01), TUBE_AXIS, 0.16, 18);
  builder.setRegion(3);
  builder.setColor(0xd4a34d);
  const capPivot = add(TUBE_MOUTH, { x: -0.02, y: 0.19, z: 0 });
  const capCenter = add(TUBE_MOUTH, { x: -0.06, y: 0.3, z: 0 });
  builder.addDisc(capCenter, TUBE_AXIS, 0.17, 18, { kind: 'tubeCap', pivot: capPivot });
  builder.addLathe(
    [
      { center: add(capCenter, TUBE_AXIS, -0.018), radius: 0.175 },
      { center: add(capCenter, TUBE_AXIS, 0.018), radius: 0.175 },
    ],
    TUBE_AXIS,
    18,
    { kind: 'tubeCap', pivot: capPivot },
  );
  builder.addCylinderBetween(capPivot, add(capPivot, { x: 0, y: 0.03, z: 0.18 }), 0.018, 8);
  builder.addCylinderBetween(capPivot, add(capPivot, { x: 0, y: 0.03, z: -0.18 }), 0.018, 8);

  builder.setRegion(3);
  builder.setColor(0xd4a34d);
  builder.addBox(TUBE.x + 0.1, 2.22, TUBE.z - 0.56, 0.05, 0.36, 1.02);
  builder.setRegion(4);
  builder.setColor(0x151515);
  builder.addBox(TUBE.x + 0.105, 2.2, TUBE.z - 0.56, 0.035, 0.24, 0.84);
  builder.setRegion(7);
  builder.setColor(0xffffff);
  builder.addQuadUv(
    { x: TUBE.x + 0.132, y: 2.07, z: TUBE.z - 0.98 },
    { x: TUBE.x + 0.132, y: 2.34, z: TUBE.z - 0.98 },
    { x: TUBE.x + 0.132, y: 2.34, z: TUBE.z - 0.14 },
    { x: TUBE.x + 0.132, y: 2.07, z: TUBE.z - 0.14 },
    { u0: 0.485, v0: 0.53, u1: 0.015, v1: 0.97 },
    'vertical',
  );

  builder.setRegion(4);
  builder.setColor(0x20201e);
  builder.addBox(HATCH.x + 0.04, HATCH.y, HATCH.z, 0.08, 0.58, 0.62);
  builder.addBox(HATCH.x + 0.1, HATCH.y, HATCH.z, 0.07, 0.5, 0.54, {
    kind: 'hatchDoor',
    pivot: { x: HATCH.x + 0.07, y: HATCH.y + 0.28, z: HATCH.z },
  });
  builder.setRegion(6);
  builder.setColor(0xff8a36);
  builder.addBox(HATCH.x + 0.18, HATCH.y, HATCH.z - 0.28, 0.018, 0.45, 0.018);
  builder.addBox(HATCH.x + 0.18, HATCH.y, HATCH.z + 0.28, 0.018, 0.45, 0.018);
  builder.addBox(HATCH.x + 0.18, HATCH.y - 0.25, HATCH.z, 0.018, 0.018, 0.5);
  builder.setRegion(3);
  builder.setColor(0xb68742);
  const ringPts: P3[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI * 2;
    ringPts.push({ x: HATCH.x + 0.18, y: HATCH.y + Math.sin(a) * 0.1, z: HATCH.z + Math.cos(a) * 0.1 });
  }
  for (let i = 0; i < ringPts.length - 1; i++)
    builder.addCylinderBetween(ringPts[i]!, ringPts[i + 1]!, 0.012, 5);
  for (const sy of [-1, 1])
    for (const sz of [-1, 1])
      builder.addBox(HATCH.x + 0.19, HATCH.y + sy * 0.22, HATCH.z + sz * 0.24, 0.035, 0.045, 0.045);
  builder.addBox(HATCH.x + 0.12, HATCH.y - 0.34, HATCH.z, 0.04, 0.29, 1.02);
  builder.setRegion(4);
  builder.setColor(0x151515);
  builder.addBox(HATCH.x + 0.15, HATCH.y - 0.34, HATCH.z, 0.035, 0.22, 0.86);
  builder.setRegion(7);
  builder.setColor(0xffffff);
  builder.addQuadUv(
    { x: HATCH.x + 0.182, y: HATCH.y - 0.45, z: HATCH.z - 0.44 },
    { x: HATCH.x + 0.182, y: HATCH.y - 0.23, z: HATCH.z - 0.44 },
    { x: HATCH.x + 0.182, y: HATCH.y - 0.23, z: HATCH.z + 0.44 },
    { x: HATCH.x + 0.182, y: HATCH.y - 0.45, z: HATCH.z + 0.44 },
    { u0: 0.985, v0: 0.53, u1: 0.515, v1: 0.97 },
    'vertical',
  );

  const geometry = builder.build();
  const position = geometry.getAttribute('position') as BufferAttribute;
  const base = new Float32Array(position.array as Float32Array);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'first words prompt and terminal pipes';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const sparkles = createSparkles();
  const sparkPosition = sparkles.position;
  const sparkColor = sparkles.color;
  const group = new Group();
  group.name = 'ship first words pipes';
  group.add(mesh, sparkles.mesh);

  let hint: PipeKind | null = null;
  let tubePlay = -1;
  let hatchPlay = -1;
  const setIndex = (index: number, x: number, y: number, z: number) => position.setXYZ(index, x, y, z);
  const transformSolid = (
    part: DynamicPart,
    scale: number,
    angle = 0,
    offsetX = 0,
    offsetY = 0,
    offsetZ = 0,
  ) => {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    for (const index of part.indices) {
      const i = index * 3;
      const bx = (base[i]! - part.pivot.x) * scale;
      const by = (base[i + 1]! - part.pivot.y) * scale;
      const bz = (base[i + 2]! - part.pivot.z) * scale;
      setIndex(
        index,
        part.pivot.x + bx * ca - by * sa + offsetX,
        part.pivot.y + bx * sa + by * ca + offsetY,
        part.pivot.z + bz + offsetZ,
      );
    }
  };
  const setSparkColorScale = (part: SparkPart, scale: number) => {
    for (let i = 0; i < part.colorCount; i++) {
      const ci = (part.colorStart + i) * 3;
      sparkColor.setXYZ(
        part.colorStart + i,
        sparkles.baseColors[ci]! * scale,
        sparkles.baseColors[ci + 1]! * scale,
        sparkles.baseColors[ci + 2]! * scale,
      );
    }
  };
  const transformSpark = (part: SparkPart, scale: number, ox = 0, oy = 0, oz = 0) => {
    for (let i = 0; i < part.count; i++) {
      const vi = part.start + i;
      const bi = vi * 3;
      sparkPosition.setXYZ(
        vi,
        part.pivot.x + (sparkles.basePositions[bi]! - part.pivot.x) * scale + ox,
        part.pivot.y + (sparkles.basePositions[bi + 1]! - part.pivot.y) * scale + oy,
        part.pivot.z + (sparkles.basePositions[bi + 2]! - part.pivot.z) * scale + oz,
      );
    }
  };
  const updateTubeRing = (part: SparkPart, u: number) => {
    const segments = part.count / 2;
    const { vx, vy, vz, wx, wy, wz } = basisFromAxis(TUBE_AXIS);
    const radius = 0.24 - u * 0.15;
    const thickness = 0.012;
    const dist = 0.62 * (1 - u) - 0.03 * u;
    const center = add(TUBE_MOUTH, TUBE_AXIS, dist);
    const bright = Math.sin(u * Math.PI) * 1.35;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      for (let r = 0; r < 2; r++) {
        const rr = radius + (r === 0 ? -thickness : thickness);
        const vi = part.start + i * 2 + r;
        sparkPosition.setXYZ(
          vi,
          center.x + (vx * ct + wx * st) * rr,
          center.y + (vy * ct + wy * st) * rr,
          center.z + (vz * ct + wz * st) * rr,
        );
        sparkColor.setXYZ(vi, bright, bright * 0.78, bright * 0.34);
      }
    }
  };

  const api: ShipPipesSystem = {
    group,
    tube: TUBE_PROMPT,
    hatch: HATCH_PROMPT,
    setHint(which) {
      hint = which;
    },
    play(which) {
      if (which === 'tube') tubePlay = 0;
      else hatchPlay = 0;
    },
    update(dt, t) {
      if (tubePlay >= 0) tubePlay += dt;
      if (hatchPlay >= 0) hatchPlay += dt;
      if (tubePlay > 1.2) tubePlay = -1;
      if (hatchPlay > 1.2) hatchPlay = -1;
      for (const part of builder.dynamics) {
        if (part.kind === 'tubeCap') {
          const u = tubePlay < 0 ? 0 : Math.sin(Math.min(1, tubePlay / 1.2) * Math.PI);
          transformSolid(part, 1, -u * 0.75);
        } else {
          const u = hatchPlay < 0 ? 0 : Math.sin(Math.min(1, hatchPlay / 1.2) * Math.PI);
          transformSolid(part, 1, -u * 0.52);
        }
      }
      const pulse = 0.65 + Math.sin(t * 5.5) * 0.35;
      for (const part of sparkles.parts) {
        if (part.kind === 'tubeRing') {
          const u = tubePlay < 0 ? -1 : Math.min(1, tubePlay / 1.0 - part.phase);
          if (u >= 0 && u <= 1) updateTubeRing(part, u);
          else setSparkColorScale(part, 0);
        } else if (part.kind === 'tubeHint') {
          const k = hint === 'tube' ? pulse * 1.25 : 0;
          transformSpark(part, 0.85 + pulse * 0.25);
          setSparkColorScale(part, k);
        } else if (part.kind === 'hatchHint') {
          const k = hint === 'hatch' ? pulse * 1.15 : 0;
          transformSpark(part, 0.9 + pulse * 0.18);
          setSparkColorScale(part, k);
        } else if (part.kind === 'hatchWisp') {
          const u = hatchPlay < 0 ? -1 : Math.min(1, hatchPlay / 1.2);
          const k = u < 0 ? 0 : Math.sin(u * Math.PI) * 1.05;
          transformSpark(part, 0.65 + Math.max(0, u) * 0.7, Math.max(0, u) * 0.14, Math.max(0, u) * 0.38, 0);
          setSparkColorScale(part, k);
        } else {
          const u = hatchPlay < 0 ? -1 : Math.min(1, hatchPlay / 0.45);
          const k = u < 0 ? 0 : Math.max(0, 1 - u) * 1.35;
          transformSpark(part, 0.85 + Math.max(0, u) * 0.35);
          setSparkColorScale(part, k);
        }
      }
      position.needsUpdate = true;
      sparkPosition.needsUpdate = true;
      sparkColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      sparkles.dispose();
    },
  };
  api.update(0, 0);
  return api;
}
