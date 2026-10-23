import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  color,
  float,
  mix,
  positionWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
} from 'three/tsl';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { foamLight, world } from '../uniforms';
import { seaUniforms } from '../ocean/sea-uniforms';
import type { TerrainBakeData } from './bake';
import { seaStackWaterlineRadius } from './sea-stack-shape';

export interface CoastFoamOptions {
  width?: number;
  maxDistance?: number;
  /**
   * Closed waterlines of things standing in the sea that the terrain doesn't know about (an island's
   * wreck): each gets a wash ribbon round it in the same mesh, so it costs no draw.
   */
  rings?: readonly (readonly { x: number; z: number }[])[];
}

function createFoamMaterial(maxDistance: number): MeshBasicNodeMaterial {
  // One pass for both faces: a flat ribbon gains nothing from three's back-then-front passes, which
  // need a shader each (PLAN §15.4).
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
  });
  const coord = uv();
  const along = attribute('foamAlong', 'float');
  const wash = sin(along.mul(0.035).sub(world.time.mul(0.7)))
    .mul(0.5)
    .add(0.5);
  const band = smoothstep(0.0, 0.11, coord.y).mul(float(1).sub(smoothstep(0.42, 0.86, coord.y)));
  const lace = sin(along.mul(0.17).add(coord.y.mul(11.0)).add(world.time.mul(0.55)))
    .mul(sin(along.mul(0.37).sub(world.time.mul(0.9))))
    .mul(0.5)
    .add(0.5);
  const surge = sin(along.mul(0.055).sub(world.time.mul(1.25)))
    .mul(0.5)
    .add(0.5);
  // Uniforms, not constants: each island's ribbon fades at its own distance with the same shader.
  const distanceFade = float(1).sub(
    smoothstep(uniform(maxDistance * 0.45), uniform(maxDistance), cameraPosition.sub(positionWorld).length()),
  );
  material.colorNode = mix(color(0xbfe9ef), color(0xffffff), pow(lace, 2.5)).mul(foamLight);
  // The sea state's surf (Breeze 1): a Calm's wash is faint, a Gale's heavy.
  material.opacityNode = band
    .mul(distanceFade)
    .mul(seaUniforms.surf)
    .mul(float(0.075).add(surge.mul(0.22)).add(wash.mul(0.08)))
    .mul(float(0.45).add(lace.mul(0.55)));
  return material;
}

export function createCoastFoam(
  data: TerrainBakeData,
  heightField: HeightField,
  options: CoastFoamOptions = {},
): Mesh {
  const width = options.width ?? 3.8;
  const material = createFoamMaterial(options.maxDistance ?? 620);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const alongAttr: number[] = [];
  const indices: number[] = [];
  const normal = new Float32Array(3);
  const pushRibbonPair = (
    x: number,
    z: number,
    sx: number,
    sz: number,
    along: number,
    inner: number,
    outer: number,
  ) => {
    const base = positions.length / 3;
    positions.push(x + sx * inner, 0.058, z + sz * inner, x + sx * outer, 0.066, z + sz * outer);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(along * 0.025, 0, along * 0.025, 1);
    alongAttr.push(along, along);
    return base;
  };

  for (const chain of data.shoreline) {
    if (chain.length < 10 || chain.points.length < 4) continue;
    let along = 0;
    let previousBase = -1;
    let previousOuter = -1;
    for (let i = 0; i < chain.points.length; i++) {
      const p = chain.points[i];
      if (i > 0) {
        const q = chain.points[i - 1];
        along += Math.hypot(p.x - q.x, p.z - q.z);
      }
      heightField.normalAt(p.x, p.z, normal);
      let sx = normal[0];
      let sz = normal[2];
      const len = Math.hypot(sx, sz) || 1;
      sx /= len;
      sz /= len;
      const base = pushRibbonPair(p.x, p.z, sx, sz, along, 0.18, width);
      if (previousBase >= 0) indices.push(previousBase, previousOuter, base, base, previousOuter, base + 1);
      previousBase = base;
      previousOuter = base + 1;
    }
  }

  if (
    COVE.seaStack.x >= data.minX &&
    COVE.seaStack.x <= data.maxX &&
    COVE.seaStack.z >= data.minZ &&
    COVE.seaStack.z <= data.maxZ
  ) {
    // Hug the stack's real waterline (the notch), not a circle: the same shape the mesh is built from.
    const segments = 96;
    let along = 0;
    let previousBase = -1;
    let previousOuter = -1;
    let px = 0;
    let pz = 0;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const sx = Math.cos(a);
      const sz = Math.sin(a);
      const r = seaStackWaterlineRadius(a);
      const x = COVE.seaStack.x + sx * r;
      const z = COVE.seaStack.z + sz * r;
      if (i > 0) along += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      const base = pushRibbonPair(x, z, sx, sz, along, -0.4, 2.6);
      if (previousBase >= 0) indices.push(previousBase, previousOuter, base, base, previousOuter, base + 1);
      previousBase = base;
      previousOuter = base + 1;
    }
  }

  for (const ring of options.rings ?? []) {
    const n = ring.length;
    if (n < 3) continue;
    let cx = 0,
      cz = 0;
    for (const p of ring) {
      cx += p.x / n;
      cz += p.z / n;
    }
    let along = 0;
    let previousBase = -1;
    let previousOuter = -1;
    let firstBase = -1;
    for (let i = 0; i < n; i++) {
      const p = ring[i]!;
      const a = ring[(i + n - 1) % n]!;
      const b = ring[(i + 1) % n]!;
      // Outward: across the loop's tangent, on the side away from its centre.
      let sx = b.z - a.z;
      let sz = -(b.x - a.x);
      const len = Math.hypot(sx, sz) || 1;
      sx /= len;
      sz /= len;
      if (sx * (p.x - cx) + sz * (p.z - cz) < 0) {
        sx = -sx;
        sz = -sz;
      }
      if (i > 0) along += Math.hypot(p.x - a.x, p.z - a.z);
      const base = pushRibbonPair(p.x, p.z, sx, sz, along, -0.3, width * 0.62);
      if (previousBase >= 0) indices.push(previousBase, previousOuter, base, base, previousOuter, base + 1);
      else firstBase = base;
      previousBase = base;
      previousOuter = base + 1;
    }
    indices.push(previousBase, previousOuter, firstBase, firstBase, previousOuter, firstBase + 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('foamAlong', new BufferAttribute(new Float32Array(alongAttr), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'coast-foam-ribbon';
  mesh.renderOrder = 20;
  return mesh;
}
