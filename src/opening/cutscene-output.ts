import {
  ColorManagement,
  LinearFilter,
  NodeMaterial,
  NoToneMapping,
  QuadMesh,
  RGBAFormat,
  RenderTarget,
  Vector2,
  type Camera,
  type ColorSpace,
  type Object3D,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { screenUV, texture } from 'three/tsl';

/**
 * The opening's own way to the canvas: the cabin draws into a target of its own, and one quad tone
 * maps it onto the canvas. It's what the renderer does for a direct canvas draw (its canvas-sized
 * frame buffer and output pass, with the same settings), but owned here, so `dispose` frees its
 * shaders and its two canvas-sized textures when the opening ends (the renderer's own stay for the
 * page's lifetime; PLAN §15.4).
 */
export interface CutsceneOutput {
  /** Draws `scene` into the target, then onto the canvas. */
  render(scene: Scene, camera: Camera): void;
  /** Draws `scene` into the target only (a warm draw that shows nothing). */
  renderOffscreen(scene: Scene, camera: Camera): void;
  /** Precompiles `object` for the target the draws use. */
  compile(object: Object3D, camera: Camera, scene: Scene): Promise<void>;
  dispose(): void;
}

export function createCutsceneOutput(renderer: WebGPURenderer): CutsceneOutput {
  const target = new RenderTarget(1, 1, {
    depthBuffer: true,
    type: renderer.getOutputBufferType(),
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    samples: renderer.samples,
  });
  target.texture.name = 'cutscene';
  const material = new NodeMaterial();
  material.name = 'cutsceneOutput';
  material.fragmentNode = texture(target.texture, screenUV).renderOutput(
    renderer.toneMapping,
    renderer.outputColorSpace,
  );
  const quad = new QuadMesh(material);
  const size = new Vector2();
  const fit = () => {
    renderer.getDrawingBufferSize(size);
    if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
  };
  const intoTarget = (scene: Scene, camera: Camera) => {
    fit();
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
  };
  return {
    render(scene, camera) {
      intoTarget(scene, camera);
      // As the post pipeline does: the quad applies the tone mapping and colour space itself.
      const toneMapping = renderer.toneMapping;
      const colorSpace = renderer.outputColorSpace;
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = ColorManagement.workingColorSpace;
      quad.render(renderer);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = colorSpace;
    },
    renderOffscreen: intoTarget,
    compile(object, camera, scene) {
      fit();
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      // compileAsync takes the render target before its first await, so it can go back at once.
      const done = renderer.compileAsync(object, camera, scene);
      renderer.setRenderTarget(previous);
      return done.then(() => undefined);
    },
    dispose() {
      material.dispose();
      target.dispose();
    },
  };
}
