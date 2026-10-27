import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  InstancedBufferAttribute,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
  type BufferGeometry,
  type InstancedMesh,
  type NodeMaterial,
} from 'three/webgpu';
import { positionGeometry, vec3 } from 'three/tsl';
import { shapeBeforeInstancing, sharedInstancedMesh } from '../../../engine/instancing';
import { createDolphinGeometry, createFlyingFishGeometry, createSplashGeometry } from './geometry';
import { createDolphinMaterial, createFlyingFishMaterial, createSplashMaterial } from './material';

/** The WGSL vertex shader three builds for `mesh` (no GPU: only the limit the instancing path reads). */
function vertexShader(mesh: InstancedMesh): string {
  const canvas = { style: {}, width: 1, height: 1, addEventListener() {}, removeEventListener() {} };
  const renderer = new WebGPURenderer({ canvas: canvas as unknown as HTMLCanvasElement });
  const backend = renderer.backend as unknown as {
    device: unknown;
    createNodeBuilder(
      object: unknown,
      renderer: unknown,
    ): {
      scene: Scene;
      camera: PerspectiveCamera;
      build(): void;
      vertexShader: string;
    };
  };
  backend.device = { limits: { maxUniformBufferBindingSize: 65536 }, features: new Set() };
  const builder = backend.createNodeBuilder(mesh, renderer);
  builder.scene = new Scene();
  builder.camera = new PerspectiveCamera();
  builder.build();
  return builder.vertexShader;
}

/** The statements of the vertex shader's `main` that set the vertex's local position, in order. */
function positionSteps(mesh: InstancedMesh): string[] {
  const main = vertexShader(mesh).split('fn main')[1] ?? '';
  return main
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(varyings\.)?positionLocal = /.test(l));
}

function instanced(geometry: BufferGeometry, material: NodeMaterial, attrs: string[] = []): InstancedMesh {
  for (const name of attrs) geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(8), 1));
  return sharedInstancedMesh(geometry, material, 8, { count: 0 });
}

/** The step that moves the vertex by its instance matrix (as attributes or from a uniform buffer). */
const MATRIX = / \* vec4<f32>\( (varyings\.)?positionLocal, 1\.0 \)/;

/** The instance matrix is the last step: nothing after it moves a vertex in the mesh's space. */
function expectShapeThenMatrix(steps: string[]): void {
  expect(steps.length).toBe(3);
  expect(steps[0]).toMatch(/= position;$/);
  // Then the shape, then the matrix, last.
  expect(steps[1]).not.toMatch(/= position;$/);
  expect(steps[1]).not.toMatch(MATRIX);
  expect(steps[2]).toMatch(MATRIX);
}

describe('leap and battle splashes (ghost splashes)', () => {
  it('shapes each splash about its own centre, before its instance matrix', () => {
    // A positionNode runs after three's instancing: its spread then scaled the splash's distance from
    // the mesh's origin, and the battle's splashes flashed up to 60 m from their cause.
    const material = createSplashMaterial();
    const mesh = instanced(createSplashGeometry(), material, ['splashAge', 'splashSeed', 'splashKind']);
    expect(material.positionNode).toBeNull();
    expectShapeThenMatrix(positionSteps(mesh));
  });

  it('bends the dolphins and flaps the fish in their own space too', () => {
    for (const [geometry, material] of [
      [createDolphinGeometry(), createDolphinMaterial()],
      [createFlyingFishGeometry(), createFlyingFishMaterial()],
    ] as const) {
      const mesh = instanced(geometry, material, ['leapPhase', 'leapAmp']);
      expect(material.positionNode).toBeNull();
      expectShapeThenMatrix(positionSteps(mesh));
    }
  });

  it('keeps the shape out of the program cache key, so splash meshes still share a shader', () => {
    const material = shapeBeforeInstancing(new MeshBasicNodeMaterial(), vec3(positionGeometry).mul(2));
    expect(Object.keys(material)).not.toContain('setupPosition');
    // Without the helper, the same scale in a positionNode comes after the matrix (three r186): the
    // fault this guards against.
    const plain = new MeshBasicNodeMaterial();
    plain.positionNode = vec3(positionGeometry).mul(2);
    const steps = positionSteps(sharedInstancedMesh(new BoxGeometry(), plain, 8));
    expect(steps[steps.length - 1]).not.toMatch(MATRIX);
    expectShapeThenMatrix(positionSteps(sharedInstancedMesh(new BoxGeometry(), material, 8)));
  });
});
