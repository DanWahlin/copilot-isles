import {
  Color,
  Frustum,
  Matrix4,
  PerspectiveCamera,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type UniformNode,
  type WebGPURenderer,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import { COVE } from '../layout';

export interface HarborMirrorStats {
  enabled: boolean;
  skippedReason: 'off' | 'distance' | 'frustum' | 'facing' | 'rendered';
  renderMs: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
  ratioToMainDraws: number;
  ratioToMainTriangles: number;
}

export interface HarborMirrorInput {
  texture: WebGLRenderTarget['texture'];
  active: UniformNode<'float', number>;
  matrix: UniformNode<'mat4', Matrix4>;
}

export interface HarborMirrorOptions {
  renderer: WebGPURenderer;
  tier: TierSettings;
  disabled?: boolean;
}

const HARBOR_CENTER = new Vector3(COVE.harbor.center.x, 0, COVE.harbor.center.z);
const HARBOR_RADIUS = COVE.harbor.radius;
const MIRROR_MAX_DISTANCE = HARBOR_RADIUS + 155;

export class HarborMirror {
  readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  readonly active = uniform(0);
  readonly matrix = uniform(new Matrix4());
  readonly input: HarborMirrorInput = {
    texture: this.target.texture,
    active: this.active,
    matrix: this.matrix,
  };
  readonly camera = new PerspectiveCamera();
  readonly stats: HarborMirrorStats = {
    enabled: false,
    skippedReason: 'off',
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    width: 1,
    height: 1,
    ratioToMainDraws: 0,
    ratioToMainTriangles: 0,
  };

  private readonly enabled: boolean;
  private readonly size = new Vector2();
  private readonly dir = new Vector3();
  private readonly toHarbor = new Vector3();
  private readonly up = new Vector3();
  private readonly center = HARBOR_CENTER.clone();
  private readonly sphere = new Sphere(HARBOR_CENTER.clone(), HARBOR_RADIUS * 1.15);
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private readonly prevViewport = new Vector4();
  private readonly prevScissor = new Vector4();
  private readonly prevClear = new Color();
  private readonly bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  constructor({ tier, disabled = false }: HarborMirrorOptions) {
    this.enabled = (tier.tier === 'high' || tier.tier === 'ultra') && tier.mirror && !disabled;
    this.target.texture.name = 'harbor-planar-mirror';
  }

  /**
   * Builds `object`'s pipelines for the mirror's render target asynchronously (nothing drawn), so
   * the mirror's first frame doesn't stall. The renderer's state is restored before it returns.
   */
  compileObject(renderer: WebGPURenderer, scene: Scene, object: Object3D): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    const target = renderer.getRenderTarget();
    const mrt = renderer.getMRT();
    renderer.setRenderTarget(this.target);
    renderer.setMRT(null);
    const done = renderer.compileAsync(object, this.camera, scene);
    renderer.setRenderTarget(target);
    renderer.setMRT(mrt);
    return done.then(() => undefined);
  }

  update(
    renderer: WebGPURenderer,
    scene: Scene,
    sourceCamera: Camera,
    hiddenObjects: readonly (Object3D | null | undefined)[],
  ): void {
    this.stats.enabled = false;
    this.stats.renderMs = 0;
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.active.value = 0;
    if (!this.enabled) {
      this.stats.skippedReason = 'off';
      return;
    }

    const dist = Math.hypot(
      sourceCamera.position.x - HARBOR_CENTER.x,
      sourceCamera.position.z - HARBOR_CENTER.z,
    );
    if (dist > MIRROR_MAX_DISTANCE) {
      this.stats.skippedReason = 'distance';
      return;
    }

    sourceCamera.updateMatrixWorld();
    this.projection.multiplyMatrices(sourceCamera.projectionMatrix, sourceCamera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    if (!this.frustum.intersectsSphere(this.sphere)) {
      this.stats.skippedReason = 'frustum';
      return;
    }

    sourceCamera.getWorldDirection(this.dir);
    this.toHarbor.set(
      HARBOR_CENTER.x - sourceCamera.position.x,
      0,
      HARBOR_CENTER.z - sourceCamera.position.z,
    );
    const l = this.toHarbor.length();
    if (l > 0.001) this.toHarbor.divideScalar(l);
    if (dist > HARBOR_RADIUS * 0.5 && this.dir.x * this.toHarbor.x + this.dir.z * this.toHarbor.z < -0.25) {
      this.stats.skippedReason = 'facing';
      return;
    }

    this.configureCamera(sourceCamera);
    this.matrix.value
      .copy(this.bias)
      .multiply(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse);
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(64, Math.floor(this.size.x * 0.5));
    const h = Math.max(64, Math.floor(this.size.y * 0.5));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.stats.width = w;
    this.stats.height = h;

    const prevTarget = renderer.getRenderTarget();
    const prevScissorTest = renderer.getScissorTest();
    renderer.getViewport(this.prevViewport);
    renderer.getScissor(this.prevScissor);
    renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    const hiddenStates = hiddenObjects.map((object) => ({ object, visible: object?.visible ?? false }));
    for (const hState of hiddenStates) if (hState.object) hState.object.visible = false;

    const info = renderer.info;
    const beforeDraws = info.render.drawCalls;
    const beforeTris = info.render.triangles;
    const started = performance.now();
    renderer.setRenderTarget(this.target);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x8fb6d5, 1);
    renderer.clear();
    renderer.render(scene, this.camera);
    this.stats.renderMs = performance.now() - started;
    this.stats.drawCalls = info.render.drawCalls - beforeDraws;
    this.stats.triangles = info.render.triangles - beforeTris;

    for (const hState of hiddenStates) if (hState.object) hState.object.visible = hState.visible;
    renderer.setRenderTarget(prevTarget);
    renderer.setViewport(this.prevViewport);
    renderer.setScissor(this.prevScissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.setClearColor(this.prevClear, prevAlpha);

    this.stats.enabled = true;
    this.stats.skippedReason = 'rendered';
    this.active.value = 1;
  }

  finalizeFrame(totalDraws: number, totalTriangles: number): void {
    const mainDraws = Math.max(1, totalDraws - this.stats.drawCalls);
    const mainTriangles = Math.max(1, totalTriangles - this.stats.triangles);
    this.stats.ratioToMainDraws = this.stats.enabled ? this.stats.drawCalls / mainDraws : 0;
    this.stats.ratioToMainTriangles = this.stats.enabled ? this.stats.triangles / mainTriangles : 0;
  }

  dispose(): void {
    this.target.dispose();
  }

  private configureCamera(sourceCamera: Camera): void {
    const camera = this.camera;
    if (sourceCamera instanceof PerspectiveCamera) {
      camera.fov = sourceCamera.fov;
      camera.aspect = sourceCamera.aspect;
      camera.near = sourceCamera.near;
      camera.far = sourceCamera.far;
      camera.zoom = sourceCamera.zoom;
      camera.updateProjectionMatrix();
    } else {
      camera.projectionMatrix.copy(sourceCamera.projectionMatrix);
      camera.projectionMatrixInverse.copy(sourceCamera.projectionMatrixInverse);
    }
    camera.position.copy(sourceCamera.position);
    camera.position.y = -sourceCamera.position.y;
    sourceCamera.getWorldDirection(this.dir);
    this.dir.y *= -1;
    this.up.set(0, 1, 0).applyQuaternion(sourceCamera.quaternion);
    this.up.y *= -1;
    camera.up.copy(this.up.normalize());
    this.center.copy(camera.position).add(this.dir);
    camera.lookAt(this.center);
    camera.updateMatrixWorld();
  }
}
