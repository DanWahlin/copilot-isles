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

interface RangeBuffers {
  positions: number[];
  normals: number[];
  faint: number[];
  shade: number[];
  baseFade: number[];
  indices: number[];
}

const RANGES: readonly RangeSpec[] = [
  {
    name: 'north-east',
    centerX: 3000,
    centerZ: -3600,
    angle: -0.52,
    width: 3000,
    base: -28,
    height: 340,
    faint: 0.62,
    seed: 10,
  },
  {
    name: 'north-west',
    centerX: -3600,
    centerZ: -3000,
    angle: 0.42,
    width: 3600,
    base: -36,
    height: 300,
    faint: 0.72,
    seed: 20,
  },
  {
    name: 'south-west',
    centerX: -4300,
    centerZ: 3600,
    angle: -0.26,
    width: 4200,
    base: -42,
    height: 260,
    faint: 0.84,
    seed: 30,
  },
  {
    name: 'east-blue',
    centerX: 5200,
    centerZ: 800,
    angle: -1.28,
    width: 2600,
    base: -54,
    height: 210,
    faint: 0.9,
    seed: 40,
  },
  {
    name: 'south-haze',
    centerX: 900,
    centerZ: 6500,
    angle: 0.18,
    width: 3400,
    base: -62,
    height: 240,
    faint: 0.94,
    seed: 50,
  },
];

function createRangeMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ depthWrite: false });
  const faint = attribute('rangeFaint', 'float');
  const shade = attribute('rangeShade', 'float');
  const baseFade = attribute('rangeBaseFade', 'float');
  const dist = cameraPosition.sub(positionWorld).length();
  const distanceHaze = smoothstep(1200, 6000, dist);
  const sunward = saturate(
    dot(
      vec3(positionWorld.x, float(0), positionWorld.z).normalize(),
      vec3(world.sunDir.x, float(0), world.sunDir.z).normalize(),
    ),
  );
  const shadowBlue = color(0x536982);
  const sunGold = color(0xc39a62);
  const relief = mix(shadowBlue, sunGold, sunward.mul(0.45).add(shade.mul(0.35)));
  const ridgeColor = relief.mul(float(0.74).add(shade.mul(0.32)));
  const hazed = mix(
    ridgeColor,
    world.hazeColor,
    saturate(distanceHaze.mul(0.62).add(faint.mul(0.48)).add(baseFade.mul(0.35))),
  );
  material.colorNode = mix(hazed, color(0xd3e3e5), baseFade.mul(0.24));
  return material;
}

function appendRange(spec: RangeSpec, buffers: RangeBuffers): void {
  const alongSegments = 180;
  const verticalSegments = 10;
  const ca = Math.cos(spec.angle);
  const sa = Math.sin(spec.angle);
  const tops: number[] = [];

  for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const ridgeNoise = ridged2(u * 3.8 + spec.seed, spec.seed * 0.19, 5, 0x8800 + spec.seed);
    const lowNoise = fbm2(u * 2.3 - spec.seed, spec.seed * 0.13, 4, 0x9900 + spec.seed);
    const dome = Math.sin(Math.PI * u) * (0.12 + 0.12 * fbm2(spec.seed, u * 2.0, 2, 0x6600 + spec.seed));
    tops.push(spec.base + spec.height * (0.25 + ridgeNoise * 0.55 + lowNoise * 0.12 + dome));
  }

  const vertexOffset = buffers.positions.length / 3;
  for (let i = 0; i <= alongSegments; i++) {
    const u = i / alongSegments;
    const along = (u - 0.5) * spec.width;
    const top = tops[i];
    const prev = tops[Math.max(0, i - 1)];
    const next = tops[Math.min(alongSegments, i + 1)];
    const localShade = Math.max(0.16, Math.min(1, 0.56 + ((next - prev) / spec.height) * 1.8));
    const ridgeNoise = ridged2(u * 5.7 + spec.seed, spec.seed * 0.21, 4, 0x7700 + spec.seed);
    const footDepth = 260 + ridgeNoise * 190;
    for (let j = 0; j <= verticalSegments; j++) {
      const v = j / verticalSegments;
      const localZ = v * footDepth;
      const y = spec.base + (top - spec.base) * Math.pow(v, 0.72) - Math.sin(v * Math.PI) * 32;
      const x = spec.centerX + ca * along - sa * localZ;
      const z = spec.centerZ + sa * along + ca * localZ;
      buffers.positions.push(x, y, z);
      buffers.normals.push(0, 0.55, 0.83);
      buffers.faint.push(spec.faint + v * 0.12);
      buffers.shade.push(localShade * (0.75 + v * 0.25));
      buffers.baseFade.push(1 - Math.min(1, v * 2.8));
    }
  }

  const stride = verticalSegments + 1;
  for (let i = 0; i < alongSegments; i++) {
    for (let j = 0; j < verticalSegments; j++) {
      const a = vertexOffset + i * stride + j;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      buffers.indices.push(a, b, c, c, b, d);
    }
  }
}

export function createDistantRanges(): Group {
  const start = performance.now();
  const material = createRangeMaterial();
  const buffers: RangeBuffers = {
    positions: [],
    normals: [],
    faint: [],
    shade: [],
    baseFade: [],
    indices: [],
  };
  const group = new Group();
  group.name = 'distant-ranges';
  for (const range of RANGES) appendRange(range, buffers);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(buffers.normals), 3));
  geometry.setAttribute('rangeFaint', new BufferAttribute(new Float32Array(buffers.faint), 1));
  geometry.setAttribute('rangeShade', new BufferAttribute(new Float32Array(buffers.shade), 1));
  geometry.setAttribute('rangeBaseFade', new BufferAttribute(new Float32Array(buffers.baseFade), 1));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'distant-ranges-merged';
  mesh.frustumCulled = true;
  group.add(mesh);
  group.userData.generationMs = performance.now() - start;
  return group;
}
