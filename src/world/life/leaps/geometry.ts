import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { FlatTriangles } from '../flat-triangles';

class Builder extends FlatTriangles {
  quad(a: number[], b: number[], c: number[], d: number[], part: number): void {
    this.tri(a, b, c, part);
    this.tri(a, c, d, part);
  }
}

function finish(b: Builder): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(b.normals, 3));
  geometry.setAttribute('leapPart', new Float32BufferAttribute(b.parts, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createDolphinGeometry(): BufferGeometry {
  const b = new Builder();
  const rings = [
    { z: -0.86, rx: 0.07, ry: 0.055 },
    { z: -0.62, rx: 0.12, ry: 0.085 },
    { z: -0.25, rx: 0.23, ry: 0.18 },
    { z: 0.12, rx: 0.29, ry: 0.22 },
    { z: 0.42, rx: 0.24, ry: 0.19 },
    { z: 0.62, rx: 0.17, ry: 0.16 },
    { z: 0.78, rx: 0.075, ry: 0.07 },
  ];
  const verts = rings.map((r) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [Math.cos(a) * r.rx, Math.sin(a) * r.ry - r.ry * 0.05, r.z];
    }),
  );
  for (let i = 0; i < verts.length - 1; i++) {
    for (let j = 0; j < 8; j++)
      b.quad(verts[i][j], verts[i][(j + 1) % 8], verts[i + 1][(j + 1) % 8], verts[i + 1][j], 0);
  }
  const beakRootTop = [0, 0.045, 0.76];
  const beakRootBottom = [0, -0.045, 0.76];
  const beakTip = [0, -0.005, 1.12];
  b.tri(beakRootTop, [0.07, 0.0, 0.78], beakTip, 0);
  b.tri(beakRootTop, beakTip, [-0.07, 0.0, 0.78], 0);
  b.tri(beakRootBottom, beakTip, [0.07, 0.0, 0.78], 0);
  b.tri(beakRootBottom, [-0.07, 0.0, 0.78], beakTip, 0);
  const tailRoot = [0, 0, -0.86];
  b.tri(tailRoot, [0.34, 0.035, -1.08], [0.08, 0.0, -0.96], 2);
  b.tri(tailRoot, [0.08, 0.0, -0.96], [0.48, -0.015, -1.1], 2);
  b.tri(tailRoot, [-0.34, 0.035, -1.08], [-0.08, 0.0, -0.96], 2);
  b.tri(tailRoot, [-0.48, -0.015, -1.1], [-0.08, 0.0, -0.96], 2);
  b.tri([0, 0.19, -0.02], [0.06, 0.52, -0.22], [-0.06, 0.19, -0.2], 1);
  b.tri([0.18, -0.02, 0.18], [0.58, -0.12, 0.02], [0.2, -0.07, -0.18], 1);
  b.tri([-0.18, -0.02, 0.18], [-0.2, -0.07, -0.18], [-0.58, -0.12, 0.02], 1);
  return finish(b);
}

export function createFlyingFishGeometry(): BufferGeometry {
  const b = new Builder();
  const nose = [0, 0, 0.22];
  const tail = [0, 0, -0.3];
  const top = [0, 0.055, -0.02];
  const bottom = [0, -0.04, -0.03];
  const left = [0.055, 0, -0.01];
  const right = [-0.055, 0, -0.01];
  b.tri(nose, top, left, 0);
  b.tri(nose, right, top, 0);
  b.tri(nose, left, bottom, 0);
  b.tri(nose, bottom, right, 0);
  b.tri(tail, left, top, 0);
  b.tri(tail, top, right, 0);
  b.tri(tail, bottom, left, 0);
  b.tri(tail, right, bottom, 0);
  b.tri([0.02, 0.012, 0.02], [0.58, 0.018, -0.03], [0.08, -0.015, -0.18], 1);
  b.tri([-0.02, 0.012, 0.02], [-0.08, -0.015, -0.18], [-0.58, 0.018, -0.03], 1);
  b.tri(tail, [0.1, 0.0, -0.46], [-0.1, 0.0, -0.46], 2);
  return finish(b);
}

export function createSplashGeometry(): BufferGeometry {
  const b = new Builder();
  b.quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r0 = 0.08 + (i % 4) * 0.035;
    const r1 = 0.25 + (i % 5) * 0.055;
    const w = 0.012 + (i % 3) * 0.006;
    const x0 = Math.cos(a) * r0;
    const z0 = Math.sin(a) * r0;
    const x1 = Math.cos(a) * r1;
    const z1 = Math.sin(a) * r1;
    b.tri(
      [x0 - Math.sin(a) * w, 0.03, z0 + Math.cos(a) * w],
      [x0 + Math.sin(a) * w, 0.03, z0 - Math.cos(a) * w],
      [x1, 0.22 + (i % 4) * 0.06, z1],
      1,
    );
  }
  const geometry = finish(b);
  const uvData: number[] = [];
  for (let i = 0; i < 6; i++)
    uvData.push([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1][i * 2], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1][i * 2 + 1]);
  for (let i = 6; i < b.positions.length / 3; i++) uvData.push(0.5, 0.5);
  geometry.setAttribute('uv', new Float32BufferAttribute(uvData, 2));
  return geometry;
}
