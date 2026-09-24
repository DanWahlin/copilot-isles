import {
  AgXToneMapping,
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type WebGPURenderer,
} from 'three/webgpu';
import { Fn, color, mix, positionLocal, pow, saturate } from 'three/tsl';

export interface TitleScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update(t: number): void;
  resize(width: number, height: number): void;
}

/**
 * Phase 0 scaffold placeholder for the title (PLAN §13.5 contents). T4/T5 replace the sky and
 * ocean with the real systems; this only proves TSL on both backends, the chunk split, and counters.
 */
export function createTitleScene(renderer: WebGPURenderer): TitleScene {
  renderer.toneMapping = AgXToneMapping;
  const scene = new Scene();
  scene.fog = new FogExp2(new Color(0x9fb8c8), 0.0009);

  const camera = new PerspectiveCamera(50, 16 / 9, 0.3, 6000);
  camera.position.set(0, 6, 30);
  camera.lookAt(0, 3, -100);

  // TSL sky gradient: one node graph that compiles to WGSL (WebGPU) or GLSL (WebGL2 backend).
  const skyColor = Fn(() => {
    const h = saturate(positionLocal.normalize().y);
    return mix(color(1.0, 0.72, 0.48), color(0.16, 0.34, 0.62), pow(h, 0.45));
  });
  const skyMat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  skyMat.colorNode = skyColor();
  scene.add(new Mesh(new SphereGeometry(4000, 32, 16), skyMat));

  const sea = new Mesh(
    new PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2),
    new MeshStandardNodeMaterial({ color: 0x0f4a66, roughness: 0.25, metalness: 0 }),
  );
  scene.add(sea);

  const sun = new DirectionalLight(0xffd2a0, 2.2);
  sun.position.set(-300, 120, -600);
  scene.add(sun, new HemisphereLight(0x9cc4ff, 0x0b2230, 0.6));

  return {
    scene,
    camera,
    update(t) {
      camera.position.x = Math.sin(t * 0.05) * 6;
      camera.lookAt(0, 3, -100);
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
  };
}
