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
  uv,
} from 'three/tsl';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { world } from '../uniforms';
import type { TerrainBakeData } from './bake';

export interface CoastFoamOptions {
  width?: number;
  maxDistance?: number;
}

function createFoamMaterial(maxDistance: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
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
  const distanceFade = float(1).sub(
    smoothstep(maxDistance * 0.45, maxDistance, cameraPosition.sub(positionWorld).length()),
  );
  material.colorNode = mix(color(0xbfe9ef), color(0xffffff), pow(lace, 2.5));
  material.opacityNode = band
    .mul(distanceFade)
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
    const segments = 72;
    const radius = COVE.seaStack.radius + 8.2;
    let previousBase = -1;
    let previousOuter = -1;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const sx = Math.cos(a);
      const sz = Math.sin(a);
      const x = COVE.seaStack.x + sx * radius;
      const z = COVE.seaStack.z + sz * radius;
      const base = pushRibbonPair(x, z, sx, sz, i * ((Math.PI * 2 * radius) / segments), -0.25, 2.2);
      if (previousBase >= 0) indices.push(previousBase, previousOuter, base, base, previousOuter, base + 1);
      previousBase = base;
      previousOuter = base + 1;
    }
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
