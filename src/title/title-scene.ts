import {
  AgXToneMapping,
  BackSide,
  Color,
  FogExp2,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  DirectionalLight,
  HemisphereLight,
  type WebGLRenderer,
} from 'three';

export interface TitleScene {
  scene: Scene;
  camera: PerspectiveCamera;
  update(t: number): void;
  resize(width: number, height: number): void;
}

/**
 * Phase 0 scaffold placeholder for the title (PLAN §13.5 contents). T4/T5 replace the sky and
 * ocean with the real systems; this only proves the chunk split, loop, and counters.
 */
export function createTitleScene(renderer: WebGLRenderer): TitleScene {
  renderer.toneMapping = AgXToneMapping;
  const scene = new Scene();
  scene.fog = new FogExp2(new Color(0x9fb8c8), 0.0009);

  const camera = new PerspectiveCamera(50, 16 / 9, 0.3, 6000);
  camera.position.set(0, 6, 30);
  camera.lookAt(0, 3, -100);

  const sky = new Mesh(
    new SphereGeometry(4000, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader:
        'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 horizon = vec3(1.0, 0.72, 0.48), zenith = vec3(0.16, 0.34, 0.62);
          gl_FragColor = vec4(mix(horizon, zenith, pow(h, 0.45)), 1.0);
        }`,
    }),
  );
  scene.add(sky);

  const sea = new Mesh(
    new PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: 0x0f4a66, roughness: 0.25, metalness: 0 }),
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
