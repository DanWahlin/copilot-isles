import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  color,
  dot,
  float,
  mix,
  positionWorld,
  saturate,
  smoothstep,
  vec3,
} from 'three/tsl';
import { world } from '../uniforms';
import { fbm2, ridged2 } from './cove-height';

interface RangeSpec {
  name: string;
  centerX: number;
  centerZ: number;
  angle: number;
  width: number;
  base: number;
  height: number;
  faint: number;
  seed: number;
}

const RANGES: readonly RangeSpec[] = [
  {
    name: 'north-east',
    centerX: 2700,
    centerZ: -3300,
    angle: -0.52,
    width: 3800,
    base: -28,
    height: 460,
    faint: 0.44,
    seed: 10,
  },
  {
    name: 'north-west',
    centerX: -3100,
    centerZ: -2800,
    angle: 0.42,
    width: 3600,
    base: -36,
    height: 390,
    faint: 0.62,
    seed: 20,
  },
  {
    name: 'south-west',
    centerX: -2600,
    centerZ: 3600,
    angle: -0.26,
    width: 4200,
    base: -42,
    height: 330,
    faint: 0.78,
    seed: 30,
  },
];

function createRangeMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ depthWrite: false });
  const faint = attribute('rangeFaint', 'float');
  const dist = cameraPosition.sub(positionWorld).length();
  const distanceHaze = smoothstep(1400, 5600, dist);
  const sunward = saturate(
    dot(
      vec3(positionWorld.x, float(0), positionWorld.z).normalize(),
      vec3(world.sunDir.x, float(0), world.sunDir.z).normalize(),
    ),
  );
  const base = mix(color(0x5f6e83), color(0xb58c60), sunward.mul(0.42));
  material.colorNode = mix(base, world.hazeColor, saturate(distanceHaze.mul(0.55).add(faint.mul(0.55))));
  material.opacityNode = float(1).sub(faint.mul(0.08));
  return material;
}

function buildRange(spec: RangeSpec, material: MeshBasicNodeMaterial): Mesh {
  const alongSegments = 180;
  const verticalSegments = 10;
  const positions: number[] = [];
  const normals: number[] = [];
  const faint: number[] = [];
  const indices: number[] = [];
  const ca = Math.cos(spec.angle);
  const sa = Math.sin(spec.angle);

  for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const along = (u - 0.5) * spec.width;
    const ridgeNoise = ridged2(u * 4.7 + spec.seed, spec.seed * 0.19, 5, 0x8800 + spec.seed);
    const lowNoise = fbm2(u * 3.1 - spec.seed, spec.seed * 0.13, 4, 0x9900 + spec.seed);
    const top = spec.base + spec.height * (0.46 + ridgeNoise * 0.72 + lowNoise * 0.12);
    const footDepth = 210 + ridgeNoise * 120;
    for (let j = 0; j <= verticalSegments; j++) {
      const v = j / verticalSegments;
      const localZ = v * footDepth;
      const y = spec.base + (top - spec.base) * Math.pow(v, 0.76) - Math.sin(v * Math.PI) * 24;
      const x = spec.centerX + ca * along - sa * localZ;
      const z = spec.centerZ + sa * along + ca * localZ;
      positions.push(x, y, z);
      normals.push(0, 0.55, 0.83);
      faint.push(spec.faint + v * 0.12);
    }
  }

  const stride = verticalSegments + 1;
  for (let i = 0; i < alongSegments; i++) {
    for (let j = 0; j < verticalSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('rangeFaint', new BufferAttribute(new Float32Array(faint), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = `distant-range-${spec.name}`;
  mesh.frustumCulled = true;
  return mesh;
}

export function createDistantRanges(): Group {
  const start = performance.now();
  const material = createRangeMaterial();
  const group = new Group();
  group.name = 'distant-ranges';
  for (const range of RANGES) group.add(buildRange(range, material));
  group.userData.generationMs = performance.now() - start;
  return group;
}
