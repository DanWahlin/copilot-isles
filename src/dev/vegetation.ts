import {
  AgXToneMapping,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { tierSettings } from '../engine/quality';
import type { HeightField } from '../world/contracts';
import { COVE } from '../world/layout';
import { world } from '../world/uniforms';
import { createVegetation, type HeightGrid } from '../world/vegetation';
import { clamp01, smoothstep } from '../util/math';

const maybeAppRoot = document.getElementById('app');
const maybeHudElement = document.getElementById('hud');
if (!maybeAppRoot || !maybeHudElement) throw new Error('vegetation dev page root missing');
const appRoot: HTMLElement = maybeAppRoot;
const hudElement: HTMLElement = maybeHudElement;

class DevHeightField implements HeightField {
  heightAt(x: number, z: number): number {
    const islandFalloff = 1 - smoothstep(135, 182, Math.hypot(x * 0.86, z * 1.12));
    const beachRamp = 0.65 + smoothstep(COVE.beach.z0 - 12, COVE.beach.z1 + 2, z) * 2.1;
    const hill =
      COVE.hill.height * Math.exp(-((x - COVE.hill.center.x) ** 2 + (z - COVE.hill.center.z) ** 2) / 9500);
    const headland = x > 106 && z < 62 && z > -76 ? smoothstep(102, 162, x) * 22 : 0;
    const harbor =
      1 -
      smoothstep(
        COVE.harbor.radius - 8,
        COVE.harbor.radius + 6,
        Math.hypot(x - COVE.harbor.center.x, z - COVE.harbor.center.z),
      );
    let y = (beachRamp + hill + headland) * islandFalloff - harbor * 6;
    const villageD = Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z);
    if (villageD < COVE.village.radius)
      y = mix(y, COVE.village.height, 1 - smoothstep(COVE.village.radius - 4, COVE.village.radius, villageD));
    return y;
  }

  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[] {
    const e = 0.75;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const n = new Vector3(-hx, 2 * e, -hz).normalize();
    out[0] = n.x;
    out[1] = n.y;
    out[2] = n.z;
    return out;
  }

  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number } {
    const y = this.heightAt(x, z);
    const normal = new Float32Array(3);
    this.normalAt(x, z, normal);
    const slope = 1 - normal[1];
    const sand = clamp01((1 - smoothstep(3.2, 8, y)) * smoothstep(COVE.beach.z0 - 20, COVE.beach.z1 + 16, z));
    const cliff = clamp01(smoothstep(0.25, 0.55, slope) + (x > 118 && z < 58 ? 0.5 : 0));
    const rock = clamp01(smoothstep(14, 25, y) * 0.55 + cliff * 0.55);
    const grass = clamp01((1 - sand * 0.7) * (1 - cliff * 0.8) * smoothstep(0.8, 4.5, y));
    return { sand, grass, rock, cliff };
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function buildHeightGrid(heightField: HeightField): HeightGrid {
  const cell = 2;
  const minX = -190;
  const minZ = -140;
  const nx = 191;
  const nz = 161;
  const heights = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      heights[z * nx + x] = heightField.heightAt(minX + x * cell, minZ + z * cell);
    }
  }
  return { heights, nx, nz, minX, minZ, cell };
}

function createTerrain(heightField: HeightField): Mesh {
  const nx = 150;
  const nz = 110;
  const sizeX = 380;
  const sizeZ = 300;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  for (let z = 0; z <= nz; z += 1) {
    for (let x = 0; x <= nx; x += 1) {
      const wx = -sizeX / 2 + (x / nx) * sizeX;
      const wz = -sizeZ / 2 + (z / nz) * sizeZ;
      const y = heightField.heightAt(wx, wz);
      const masks = heightField.masksAt(wx, wz);
      color.setHSL(0.1, 0.44, 0.58);
      if (masks.grass > masks.sand) color.setHSL(0.28, 0.32, 0.33 + masks.grass * 0.08);
      if (masks.rock > 0.35) color.setHSL(0.08, 0.12, 0.34 + masks.rock * 0.12);
      positions.push(wx, y, wz);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      const i = z * (nx + 1) + x;
      indices.push(i, i + 1, i + nx + 2, i, i + nx + 2, i + nx + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  return new Mesh(geometry, material);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  appRoot.append(canvas);
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    forceWebGL: params.has('webgl'),
  });
  renderer.toneMapping = AgXToneMapping;
  await renderer.init();
  renderer.info.autoReset = false;

  const scene = new Scene();
  scene.background = new Color(0x7db4d8);
  const camera = new PerspectiveCamera(55, 1, 0.25, 900);
  camera.position.set(-34, 18, 132);
  camera.lookAt(18, 6, 92);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 8, 38);
  controls.maxDistance = 360;
  controls.update();

  const sky = new SkyMesh();
  sky.scale.setScalar(6000);
  sky.turbidity.value = 3;
  sky.rayleigh.value = 1.5;
  sky.mieCoefficient.value = 0.008;
  sky.mieDirectionalG.value = 0.78;
  sky.cloudCoverage.value = 0.22;
  scene.add(sky);
  const sun = new DirectionalLight(0xffd4a0, 3.2);
  sun.position.set(-140, 80, 120);
  sky.sunPosition.value.copy(sun.position).multiplyScalar(1200);
  scene.add(sun, new HemisphereLight(0x9bc7ff, 0x28431c, 0.72));
  world.sunDir.value.copy(sun.position).normalize();
  world.sunColor.value.set(1, 0.78, 0.48);
  world.skyColor.value.set(0.46, 0.66, 0.88);

  const heightField = new DevHeightField();
  const heightGrid = buildHeightGrid(heightField);
  scene.add(createTerrain(heightField));
  const water = new Mesh(
    new PlaneGeometry(1200, 1200, 1, 1).rotateX(-Math.PI / 2),
    new MeshStandardNodeMaterial({
      color: 0x2b9fc0,
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      opacity: 0.58,
    }),
  );
  water.position.y = 0;
  scene.add(water);

  const vegetation = await createVegetation({
    heightField,
    heightGrid,
    tier: tierSettings('high'),
    renderer,
    seed: 42,
  });
  scene.add(vegetation.group);

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const shots = {
    beach() {
      camera.position.set(-26, 7.5, 124);
      controls.target.set(30, 5.5, 96);
      controls.update();
    },
    hill() {
      camera.position.set(54, 34, 48);
      controls.target.set(-18, 12, -22);
      controls.update();
    },
    far() {
      camera.position.set(-142, 72, 188);
      controls.target.set(4, 10, 4);
      controls.update();
    },
  } satisfies Record<string, () => void>;

  (window as unknown as { __vegetationDebug: unknown }).__vegetationDebug = {
    renderer,
    scene,
    vegetation,
    camera,
    controls,
    shots,
  };

  renderer.setAnimationLoop(() => {
    world.time.value = performance.now() * 0.001;
    controls.update();
    vegetation.update(camera);
    renderer.render(scene, camera);
    const stats = vegetation.stats();
    const info = renderer.info as unknown as {
      render: { calls?: number; drawCalls?: number; triangles?: number };
      memory: { programs?: number };
    };
    hudElement.innerHTML = `<strong>Copilot Isles vegetation</strong><br />Backend: <code>${params.has('webgl') ? 'forced WebGL2' : 'WebGPU'}</code><br />Vegetation draws: <code>${stats.drawCalls}</code>, tris: <code>${stats.triangles.toLocaleString()}</code><br />Frame draws: <code>${info.render.drawCalls ?? info.render.calls ?? 0}</code>, tris: <code>${(info.render.triangles ?? 0).toLocaleString()}</code>, pipelines: <code>${info.memory.programs ?? 0}</code><br />Impostor bake: <code>${stats.impostorBakeMs.toFixed(1)} ms</code><br />Shots available: <code>beach()</code>, <code>hill()</code>, <code>far()</code>`;
  });
}

main().catch((error: unknown) => {
  console.error(error);
  hudElement.textContent = error instanceof Error ? error.message : String(error);
});
