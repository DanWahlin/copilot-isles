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

/**
 * A splash, y up, about 1 unit across: a ragged foam patch on the water (part 0), a crown of uneven
 * sheets of water leaning outward (part 1) and a central plume of crossed spray cards (part 2, entry
 * splashes only). The shader rises and collapses the sheets and breaks their tops into droplets.
 * Attributes: `uv` (0..1 across and up each card; planar on the foam), `leapPart`, `sheetRand`.
 */
export function createSplashGeometry(): BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const rands: number[] = [];
  let seed = 0x5eed;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const vert = (p: number[], u: number, v: number, part: number, r: number) => {
    pos.push(p[0]!, p[1]!, p[2]!);
    uvs.push(u, v);
    parts.push(part);
    rands.push(r);
  };
  const card = (bl: number[], br: number[], tr: number[], tl: number[], part: number, r: number) => {
    vert(bl, 0, 0, part, r);
    vert(br, 1, 0, part, r);
    vert(tr, 1, 1, part, r);
    vert(bl, 0, 0, part, r);
    vert(tr, 1, 1, part, r);
    vert(tl, 0, 1, part, r);
  };

  // Foam: a flat disc just above the water; the shader gives it a ragged, lacy edge.
  const FOAM_R = 0.85;
  const SEG = 24;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2,
      a1 = ((i + 1) / SEG) * Math.PI * 2;
    const p0 = [Math.cos(a0) * FOAM_R, 0.01, Math.sin(a0) * FOAM_R];
    const p1 = [Math.cos(a1) * FOAM_R, 0.01, Math.sin(a1) * FOAM_R];
    for (const p of [[0, 0.01, 0], p0, p1])
      vert(p, p[0]! / (2 * FOAM_R) + 0.5, p[2]! / (2 * FOAM_R) + 0.5, 0, 0);
  }

  // Crown: uneven sheets around the hole, leaning out, with gaps.
  const SHEETS = 11;
  for (let i = 0; i < SHEETS; i++) {
    const a = ((i + rnd() * 0.6) / SHEETS) * Math.PI * 2;
    const r = 0.3 + rnd() * 0.16;
    const w = 0.16 + rnd() * 0.16;
    const h = 0.32 + rnd() * 0.42;
    const lean = h * (0.35 + rnd() * 0.4);
    const cx = Math.cos(a),
      cz = Math.sin(a),
      tx = -cz,
      tz = cx;
    const rt = r + lean;
    const wt = w * (0.55 + rnd() * 0.35);
    card(
      [cx * r - tx * w * 0.5, 0, cz * r - tz * w * 0.5],
      [cx * r + tx * w * 0.5, 0, cz * r + tz * w * 0.5],
      [cx * rt + tx * wt * 0.5, h, cz * rt + tz * wt * 0.5],
      [cx * rt - tx * wt * 0.5, h, cz * rt - tz * wt * 0.5],
      1,
      rnd(),
    );
  }

  // Plume: three crossed cards, slightly tilted.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + rnd() * 0.3;
    const dx = Math.cos(a) * 0.13,
      dz = Math.sin(a) * 0.13;
    const tilt = (rnd() - 0.5) * 0.12;
    card(
      [-dx, 0, -dz],
      [dx, 0, dz],
      [dx * 0.6 + tilt, 1, dz * 0.6],
      [-dx * 0.6 + tilt, 1, -dz * 0.6],
      2,
      rnd(),
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('leapPart', new Float32BufferAttribute(parts, 1));
  geometry.setAttribute('sheetRand', new Float32BufferAttribute(rands, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
