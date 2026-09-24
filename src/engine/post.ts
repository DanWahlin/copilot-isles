import { RenderPipeline, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  float,
  interleavedGradientNoise,
  mix,
  pass,
  renderOutput,
  saturation,
  screenCoordinate,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec4,
  vibrance,
} from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type { TierSettings } from './quality';

export interface Post {
  render(): void;
  /** Live grade controls (per-island looks can tween these). */
  grade: {
    vibrance: { value: number };
    saturation: { value: number };
    contrast: { value: number };
    vignette: { value: number };
  };
  dispose(): void;
}

/**
 * Lean title-safe post pipeline: scene pass → tone mapping → display grade → FXAA → dither.
 * Bloom/SMAA were cut from Phase 0a because they dominated title pipeline count (§7a issue #29).
 */
export function createPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  tier: TierSettings,
): Post | null {
  if (tier.tier === 'lite') return null;
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const ldr = renderOutput(scenePass.getTextureNode('output'));

  const uVibrance = uniform(0.18);
  const uSaturation = uniform(1.03);
  const uContrast = uniform(0.16);
  const uVignette = uniform(0.18);
  const graded = Fn(() => {
    let c = ldr.rgb;
    c = vibrance(c, uVibrance);
    c = saturation(c, uSaturation);
    const s = c.clamp(0, 1);
    c = mix(c, s.mul(s).mul(float(3).sub(s.mul(2))), uContrast);
    const d = screenUV.sub(0.5).mul(vec2(1.0, 0.8)).length();
    c = c.mul(float(1).sub(smoothstep(0.4, 0.95, d).mul(uVignette)));
    return vec4(c, 1);
  })();

  const aa = fxaa(graded) as unknown as Node<'vec4'>;
  const dither = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).div(255);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = vec4(aa.rgb.add(dither), 1);

  return {
    render: () => pipeline.render(),
    grade: { vibrance: uVibrance, saturation: uSaturation, contrast: uContrast, vignette: uVignette },
    dispose() {
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}
