// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/wildlife/BirdShapes.js@d32799f
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { FlatTriangles } from '../flat-triangles';

const PART_BODY = 0;
const PART_WING = 1;
const PART_TAIL = 2;
const PART_BILL = 3;

class BirdBuilder extends FlatTriangles {
  readonly wingSides: number[] = [];
  readonly shade: number[] = [];

  override tri(a: number[], b: number[], c: number[], part: number, wingSide = 0, shade = 1): void {
    super.tri(a, b, c, part);
    this.wingSides.push(wingSide, wingSide, wingSide);
    this.shade.push(shade, shade, shade);
  }

  quad(a: number[], b: number[], c: number[], d: number[], part: number, wingSide = 0, shade = 1): void {
    this.tri(a, b, c, part, wingSide, shade);
    this.tri(a, c, d, part, wingSide, shade * 0.94);
  }
}

export function createBirdGeometry(): BufferGeometry {
  const b = new BirdBuilder();
  const nose = [0, 0.015, 0.25];
  const tail = [0, 0.0, -0.22];
  const top = [0, 0.075, 0.02];
  const bottom = [0, -0.055, -0.02];
  const left = [0.07, 0.005, 0.02];
  const right = [-0.07, 0.005, 0.02];
  b.tri(nose, top, left, PART_BODY, 0, 1);
  b.tri(nose, right, top, PART_BODY, 0, 1);
  b.tri(nose, left, bottom, PART_BODY, 0, 0.75);
  b.tri(nose, bottom, right, PART_BODY, 0, 0.75);
  b.tri(tail, left, top, PART_BODY, 0, 0.72);
  b.tri(tail, top, right, PART_BODY, 0, 0.72);
  b.tri(tail, bottom, left, PART_BODY, 0, 0.52);
  b.tri(tail, right, bottom, PART_BODY, 0, 0.52);

  b.tri([0, 0.014, 0.24], [0.018, 0.006, 0.32], [-0.018, 0.006, 0.32], PART_BILL, 0, 0.85);
  b.tri([0, -0.004, 0.245], [-0.018, 0.006, 0.32], [0.018, 0.006, 0.32], PART_BILL, 0, 0.6);

  for (const side of [-1, 1]) {
    const s = side;
    const root = [s * 0.045, 0.025, 0.06];
    const elbow = [s * 0.28, 0.03, 0.0];
    const tip = [s * 0.62, 0.012, -0.12];
    const trail = [s * 0.15, -0.005, -0.18];
    const innerTrail = [s * 0.035, -0.002, -0.08];
    b.quad(root, elbow, trail, innerTrail, PART_WING, side, 0.88);
    b.tri(elbow, tip, trail, PART_WING, side, 0.72);
  }

  b.tri([0, 0.01, -0.19], [0.13, -0.005, -0.36], [0, -0.01, -0.31], PART_TAIL, 0, 0.75);
  b.tri([0, 0.01, -0.19], [0, -0.01, -0.31], [-0.13, -0.005, -0.36], PART_TAIL, 0, 0.75);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(b.normals, 3));
  geometry.setAttribute('birdPart', new Float32BufferAttribute(b.parts, 1));
  geometry.setAttribute('wingSide', new Float32BufferAttribute(b.wingSides, 1));
  geometry.setAttribute('shade', new Float32BufferAttribute(b.shade, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
