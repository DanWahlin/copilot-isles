import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, color, float, positionLocal, sin, vec3 } from 'three/tsl';
import { world } from '../uniforms';

// three's TSL fluent node typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

interface FlagVertex {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  wave: number;
}

function pushVertex(
  vertices: FlagVertex[],
  x: number,
  y: number,
  z: number,
  colorHex: number,
  wave: number,
): number {
  const r = ((colorHex >> 16) & 255) / 255;
  const g = ((colorHex >> 8) & 255) / 255;
  const b = (colorHex & 255) / 255;
  vertices.push({ x, y, z, r, g, b, wave });
  return vertices.length - 1;
}

function addQuad(
  vertices: FlagVertex[],
  indices: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  colorHex: number,
  hoistX: number,
  flyX: number,
): void {
  const waveAt = (x: number) => Math.max(0, Math.min(1, (x - hoistX) / Math.max(0.001, flyX - hoistX)));
  const i = pushVertex(vertices, a[0], a[1], a[2], colorHex, waveAt(a[0]));
  pushVertex(vertices, b[0], b[1], b[2], colorHex, waveAt(b[0]));
  pushVertex(vertices, c[0], c[1], c[2], colorHex, waveAt(c[0]));
  pushVertex(vertices, d[0], d[1], d[2], colorHex, waveAt(d[0]));
  indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

function addRibbon(
  vertices: FlagVertex[],
  indices: number[],
  z: number,
  y: number,
  length: number,
  height: number,
  colorHex: number,
): void {
  const x0 = 0.12;
  const x1 = length;
  const notch = length - height * 1.25;
  addQuad(
    vertices,
    indices,
    [x0, y - height, z],
    [notch, y - height * 0.82, z],
    [notch, y + height * 0.82, z],
    [x0, y + height, z],
    colorHex,
    x0,
    x1,
  );
  const i = pushVertex(vertices, notch, y - height * 0.82, z, colorHex, (notch - x0) / (x1 - x0));
  pushVertex(vertices, x1, y, z, colorHex, 1);
  pushVertex(vertices, notch, y + height * 0.82, z, colorHex, (notch - x0) / (x1 - x0));
  indices.push(i, i + 1, i + 2);
}

function addFlagPanel(
  vertices: FlagVertex[],
  indices: number[],
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  ragged = false,
): void {
  const cols = 10;
  const rows = 7;
  const base = vertices.length;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const bite = ragged
      ? Math.max(0, Math.sin(v * Math.PI * 3.1) * 0.11 + Math.sin(v * Math.PI * 8.0) * 0.045)
      : 0;
    const fly = x1 - bite;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      pushVertex(vertices, x0 + (fly - x0) * u, y0 + (y1 - y0) * v, z, 0x070707, u);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = base + r * (cols + 1) + c;
      indices.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
    }
  }
}

function addRotatedRect(
  vertices: FlagVertex[],
  indices: number[],
  cx: number,
  cy: number,
  z: number,
  length: number,
  width: number,
  angle: number,
  colorHex: number,
  hoistX: number,
  flyX: number,
): void {
  const ux = Math.cos(angle) * length * 0.5;
  const uy = Math.sin(angle) * length * 0.5;
  const vx = -Math.sin(angle) * width * 0.5;
  const vy = Math.cos(angle) * width * 0.5;
  addQuad(
    vertices,
    indices,
    [cx - ux - vx, cy - uy - vy, z],
    [cx + ux - vx, cy + uy - vy, z],
    [cx + ux + vx, cy + uy + vy, z],
    [cx - ux + vx, cy - uy + vy, z],
    colorHex,
    hoistX,
    flyX,
  );
}

function addEllipse(
  vertices: FlagVertex[],
  indices: number[],
  cx: number,
  cy: number,
  z: number,
  rx: number,
  ry: number,
  colorHex: number,
  hoistX: number,
  flyX: number,
  segments = 18,
): void {
  const waveAt = (x: number) => Math.max(0, Math.min(1, (x - hoistX) / Math.max(0.001, flyX - hoistX)));
  const start = vertices.length;
  pushVertex(vertices, cx, cy, z, colorHex, waveAt(cx));
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    pushVertex(vertices, x, cy + Math.sin(a) * ry, z, colorHex, waveAt(x));
  }
  for (let i = 0; i < segments; i++) indices.push(start, start + 1 + i, start + 1 + ((i + 1) % segments));
}

function addJollyRoger(vertices: FlagVertex[], indices: number[]): void {
  const z = -1.69;
  const x0 = 0.18;
  const x1 = 2.28;
  const y0 = 20.88;
  const y1 = 22.35;
  addFlagPanel(vertices, indices, z, x0, x1, y0, y1, true);
  addRotatedRect(vertices, indices, 1.24, 21.55, z - 0.012, 1.42, 0.13, 0.62, 0xf2eee4, x0, x1);
  addRotatedRect(vertices, indices, 1.24, 21.55, z - 0.014, 1.42, 0.13, -0.62, 0xf2eee4, x0, x1);
  addEllipse(vertices, indices, 1.24, 21.88, z - 0.02, 0.28, 0.31, 0xf7f2e8, x0, x1, 24);
  addQuad(
    vertices,
    indices,
    [1.02, 21.43, z - 0.021],
    [1.46, 21.43, z - 0.021],
    [1.42, 21.74, z - 0.021],
    [1.06, 21.74, z - 0.021],
    0xf7f2e8,
    x0,
    x1,
  );
  addEllipse(vertices, indices, 1.13, 21.94, z - 0.03, 0.062, 0.078, 0x050505, x0, x1, 12);
  addEllipse(vertices, indices, 1.36, 21.94, z - 0.03, 0.062, 0.078, 0x050505, x0, x1, 12);
  addRotatedRect(vertices, indices, 1.24, 21.8, z - 0.031, 0.09, 0.052, Math.PI / 2, 0x050505, x0, x1);
  for (let i = 0; i < 5; i++) {
    addRotatedRect(vertices, indices, 1.08 + i * 0.08, 21.49, z - 0.031, 0.045, 0.13, 0, 0x050505, x0, x1);
  }
}

export function createFlagGeometry(): BufferGeometry {
  const vertices: FlagVertex[] = [];
  const indices: number[] = [];
  addJollyRoger(vertices, indices);
  addRibbon(vertices, indices, FORE_Z, 20.36, 2.05, 0.16, 0x8f1712);
  addRibbon(vertices, indices, MIZZEN_Z, 17.88, 1.75, 0.14, 0xa01c14);
  const positions: number[] = [];
  const colors: number[] = [];
  const wave: number[] = [];
  for (const v of vertices) {
    positions.push(v.x, v.y, v.z);
    colors.push(v.r, v.g, v.b);
    wave.push(v.wave);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('flagWave', new BufferAttribute(new Float32Array(wave), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const FORE_Z = 5.25;
const MIZZEN_Z = -7.8;

export function makeFlagMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.82, metalness: 0 });
  const wave = attribute('flagWave', 'float') as AnyNode;
  const flutter = sin(world.time.mul(4.4).add(positionLocal.y.mul(1.7)).add(wave.mul(5.8)))
    .mul(wave)
    .mul(float(0.16))
    .mul(float(1).sub(world.reducedMotion.mul(0.85)));
  material.positionNode = (positionLocal as AnyNode).add((vec3 as AnyNode)(0, flutter.mul(0.1), flutter));
  material.colorNode = (color(0xffffff) as AnyNode).mul(attribute('color', 'vec3'));
  return material;
}
