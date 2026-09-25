import { BufferAttribute, BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu';
import { createSparkleMaterial, starGeometry } from '../sites/sparkle';

interface P3 {
  x: number;
  y: number;
  z: number;
}

type PartKind = 'whole' | 'shellLeft' | 'shellRight' | 'droplet';

interface Part {
  kind: PartKind;
  start: number;
  count: number;
  pivot: P3;
  seed: number;
}

interface BuilderState {
  positions: number[];
  uvs: number[];
  colors: number[];
  regions: number[];
  indices: number[];
  parts: Part[];
  color: [number, number, number];
  region: number;
}

const BOW_LOCAL = { x: 0.28, y: 2.05, z: 12.1 };
const GRAVITY = 5.6;

function setColor(state: BuilderState, hex: number): void {
  state.color = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function setRegion(state: BuilderState, region: number): void {
  state.region = region;
}

function addVertex(state: BuilderState, x: number, y: number, z: number, u = 0, v = 0): number {
  const i = state.positions.length / 3;
  state.positions.push(x, y, z);
  state.uvs.push(u, v);
  state.colors.push(state.color[0], state.color[1], state.color[2]);
  state.regions.push(state.region);
  return i;
}

function addBox(
  state: BuilderState,
  sx: number,
  sy: number,
  sz: number,
  kind: PartKind,
  pivot: P3,
  seed = 0,
): void {
  const start = state.positions.length / 3;
  const x0 = -sx * 0.5;
  const x1 = sx * 0.5;
  const y0 = -sy * 0.5;
  const y1 = sy * 0.5;
  const z0 = -sz * 0.5;
  const z1 = sz * 0.5;
  const faces = [
    [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0],
    [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0],
    [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1],
    [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0],
    [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1],
  ];
  for (const f of faces) {
    const i = state.positions.length / 3;
    for (let n = 0; n < 4; n++)
      addVertex(state, pivot.x + f[n * 3]!, pivot.y + f[n * 3 + 1]!, pivot.z + f[n * 3 + 2]!);
    state.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  state.parts.push({ kind, start, count: 24, pivot, seed });
}

function addLowSphere(
  state: BuilderState,
  radius: number,
  kind: PartKind,
  pivot: P3,
  seed = 0,
  squashY = 0.92,
): void {
  const start = state.positions.length / 3;
  const rings = 6;
  const segs = 10;
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const y = Math.cos(phi) * radius * squashY;
    const rr = Math.sin(phi) * radius;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      addVertex(state, pivot.x + Math.cos(a) * rr, pivot.y + y, pivot.z + Math.sin(a) * rr, i / segs, v);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      const a = start + r * segs + i;
      const b = start + r * segs + n;
      const c = start + (r + 1) * segs + n;
      const d = start + (r + 1) * segs + i;
      state.indices.push(a, b, c, a, c, d);
    }
  }
  state.parts.push({ kind, start, count: (rings + 1) * segs, pivot, seed });
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  ax: number,
  ay: number,
  az: number,
): [number, number, number] {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  let yy = y * cx - z * sx;
  let zz = y * sx + z * cx;
  let xx = x * cy + zz * sy;
  zz = -x * sy + zz * cy;
  const ox = xx * cz - yy * sz;
  yy = xx * sz + yy * cz;
  xx = ox;
  return [xx, yy, zz];
}

function buildDebrisGeometry(): { geometry: BufferGeometry; parts: Part[] } {
  const state: BuilderState = {
    positions: [],
    uvs: [],
    colors: [],
    regions: [],
    indices: [],
    parts: [],
    color: [1, 1, 1],
    region: 0,
  };
  setRegion(state, 0);
  setColor(state, 0x8a4a24);
  addLowSphere(state, 0.25, 'whole', { x: 0, y: 0, z: 0 }, 0, 0.9);
  setColor(state, 0x73401f);
  addLowSphere(state, 0.22, 'shellLeft', { x: 0, y: 0, z: 0 }, 0.15, 0.42);
  addLowSphere(state, 0.22, 'shellRight', { x: 0, y: 0, z: 0 }, 0.85, 0.42);
  setRegion(state, 5);
  setColor(state, 0xf5ead3);
  for (let i = 0; i < 24; i++) addBox(state, 0.065, 0.065, 0.065, 'droplet', { x: 0, y: 0, z: 0 }, i / 23);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(state.positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(state.uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(state.colors), 3));
  geometry.setAttribute('shipRegion', new BufferAttribute(new Float32Array(state.regions), 1));
  geometry.setIndex(state.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, parts: state.parts };
}

function copyPart(
  position: BufferAttribute,
  base: Float32Array,
  part: Part,
  pivot: P3,
  scale: number,
  rot: P3,
  offset: P3,
): void {
  for (let j = 0; j < part.count; j++) {
    const vi = part.start + j;
    const bi = vi * 3;
    const lx = (base[bi]! - part.pivot.x) * scale;
    const ly = (base[bi + 1]! - part.pivot.y) * scale;
    const lz = (base[bi + 2]! - part.pivot.z) * scale;
    const [rx, ry, rz] = rotatePoint(lx, ly, lz, rot.x, rot.y, rot.z);
    position.setXYZ(vi, pivot.x + offset.x + rx, pivot.y + offset.y + ry, pivot.z + offset.z + rz);
  }
}

interface ChristeningSystem {
  readonly group: Group;
  play(fromWorld: P3, shipGroup: Group): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}

export function createChristeningSystem(shipMaterial: Material): ChristeningSystem {
  const group = new Group();
  group.name = 'ship christening coconut burst';
  group.visible = false;

  const { geometry, parts } = buildDebrisGeometry();
  const debris = new Mesh(geometry, shipMaterial);
  debris.name = 'christening coconut shells and droplets';
  debris.castShadow = false;
  debris.receiveShadow = false;
  debris.visible = false;
  const position = geometry.getAttribute('position') as BufferAttribute;
  const base = new Float32Array(position.array as Float32Array);
  group.add(debris);

  const sparkleGeometry = starGeometry(0.82, { rgb: [1, 0.95, 0.75], strength: 3.0 });
  const sparkleBaseColor = new Float32Array(
    (sparkleGeometry.getAttribute('color') as BufferAttribute).array as Float32Array,
  );
  const sparkle = new Mesh(sparkleGeometry, createSparkleMaterial());
  sparkle.name = 'christening crack sparkle';
  sparkle.visible = false;
  group.add(sparkle);

  let start: P3 = { x: 0, y: 0, z: 0 };
  let target: P3 = BOW_LOCAL;
  let elapsed = -1;
  let resolver: (() => void) | null = null;

  const resetHidden = () => {
    for (const part of parts)
      copyPart(position, base, part, target, 0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    position.needsUpdate = true;
    sparkle.visible = false;
  };
  resetHidden();

  return {
    group,
    play(fromWorld, shipGroup) {
      shipGroup.updateMatrixWorld(true);
      const from = shipGroup.worldToLocal(new Vector3(fromWorld.x, fromWorld.y, fromWorld.z));
      start = { x: from.x, y: from.y, z: from.z };
      target = { ...BOW_LOCAL };
      elapsed = 0;
      group.visible = true;
      debris.visible = true;
      resetHidden();
      return new Promise((resolve) => {
        resolver = resolve;
      });
    },
    update(dt) {
      if (elapsed < 0) return;
      elapsed += Math.max(0, dt);
      const t = elapsed;
      const flight = Math.min(1, t / 0.6);
      const arc = Math.sin(flight * Math.PI) * 1.15;
      const coconut = {
        x: start.x + (target.x - start.x) * flight,
        y: start.y + (target.y - start.y) * flight + arc,
        z: start.z + (target.z - start.z) * flight,
      };
      for (const part of parts) {
        if (part.kind === 'whole') {
          const s = t < 0.6 ? 1 : 0;
          copyPart(
            position,
            base,
            part,
            coconut,
            s,
            { x: t * 7.0, y: t * 2.4, z: t * 4.1 },
            { x: 0, y: 0, z: 0 },
          );
        } else if (part.kind === 'shellLeft' || part.kind === 'shellRight') {
          const u = Math.max(0, t - 0.58);
          const dir = part.kind === 'shellLeft' ? -1 : 1;
          copyPart(
            position,
            base,
            part,
            target,
            t < 0.55 ? 0 : 1,
            { x: u * (4.2 + part.seed), y: dir * u * 3.1, z: u * 2.2 },
            { x: dir * (0.18 + u * 0.85), y: 0.08 + u * 0.36 - GRAVITY * u * u * 0.42, z: 0.08 + u * 0.62 },
          );
        } else {
          const u = Math.max(0, t - 0.56);
          const a = part.seed * Math.PI * 2 * 4.7;
          const speed = 0.42 + part.seed * 0.55;
          copyPart(
            position,
            base,
            part,
            target,
            t < 0.55 || u > 1.15 ? 0 : Math.max(0.45, 1.2 - u * 0.35),
            { x: u * 6 * part.seed, y: u * 8.0, z: u * 3.0 },
            {
              x: Math.cos(a) * speed * u,
              y: 0.16 + (0.55 + part.seed * 0.6) * u - GRAVITY * u * u * 0.5,
              z: Math.sin(a) * speed * u * 0.65 + 0.2 * u,
            },
          );
        }
      }
      position.needsUpdate = true;
      geometry.computeBoundingSphere();

      const flash = Math.max(0, 1 - Math.abs(t - 0.62) / 0.22);
      sparkle.visible = flash > 0.01;
      sparkle.position.set(target.x, target.y + 0.04, target.z + 0.05);
      sparkle.scale.setScalar(0.75 + flash * 0.85);
      sparkle.rotation.set(0, t * 5.0, t * 3.0);
      const color = sparkleGeometry.getAttribute('color') as BufferAttribute;
      for (let i = 0; i < color.count; i++) {
        const ci = i * 3;
        color.setXYZ(
          i,
          sparkleBaseColor[ci]! * flash,
          sparkleBaseColor[ci + 1]! * flash,
          sparkleBaseColor[ci + 2]! * flash,
        );
      }
      color.needsUpdate = true;

      if (t >= 1.8) {
        elapsed = -1;
        group.visible = false;
        debris.visible = false;
        sparkle.visible = false;
        resolver?.();
        resolver = null;
      }
    },
    dispose() {
      geometry.dispose();
      sparkleGeometry.dispose();
      const mat = sparkle.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    },
  };
}
