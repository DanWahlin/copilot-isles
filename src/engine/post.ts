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
  toneMappingExposure,
  uniform,
  vec2,
  vec4,
  vibrance,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
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
 * Post pipeline (Phase 0 T12, PLAN §6/§15): scene pass → bloom (tiered) → tone mapping + sRGB →
 * display-space grade (vibrance, saturation, S-curve contrast, vignette) → AA (SMAA on High/Ultra,
 * FXAA below) → 1-LSB interleaved-gradient dither against sky/sea banding.
 * Lite renders directly with the renderer's tone mapping (returns null).
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
  const hdr = scenePass.getTextureNode('output');

  // Bloom works on exposure-scaled colour, so the threshold means "brighter than display white"
  // rather than "brighter than 1 in raw HDR" (which caught the whole daytime sky and washed out
  // anything near the sun). The clamp stops the sun disc from blooming into a huge halo.
  const exposure = toneMappingExposure as unknown as Node<'float'>;
  const exposed = hdr.rgb.mul(exposure).min(4);
  const bloomNode = tier.bloom ? bloom(vec4(exposed, 1), 0.14, 0.4, 1.05) : null;
  const lit = bloomNode ? hdr.add(vec4(bloomNode.rgb.div(exposure), 0)) : hdr;
  const ldr = renderOutput(lit);

  const uVibrance = uniform(0.22);
  const uSaturation = uniform(1.04);
  const uContrast = uniform(0.2);
  const uVignette = uniform(0.22);
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

  const aa = (tier.tier === 'high' || tier.tier === 'ultra'
    ? smaa(graded)
    : fxaa(graded)) as unknown as Node<'vec4'>;
  const dither = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).div(255);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = vec4(aa.rgb.add(dither), 1);

  return {
    render: () => pipeline.render(),
    grade: { vibrance: uVibrance, saturation: uSaturation, contrast: uContrast, vignette: uVignette },
    dispose() {
      bloomNode?.dispose();
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}
