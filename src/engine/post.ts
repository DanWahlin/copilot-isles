import { RenderPipeline, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  float,
  interleavedGradientNoise,
  luminance,
  pass,
  renderOutput,
  saturation,
  screenCoordinate,
  screenUV,
  smoothstep,
  toneMappingExposure,
  uniform,
  vec2,
  vec3,
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

export interface PostOptions {
  /** Title TTI path: no rich highlight lift, so §7a title programs stay ≤ 40. */
  lean?: boolean;
}

/** Scene pass → tone mapping/grade → local highlight lift → FXAA → dither. */
export function createPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  tier: TierSettings,
  options: PostOptions = {},
): Post | null {
  const rich = !options.lean && (tier.tier === 'high' || tier.tier === 'ultra');
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const hdr = scenePass.getTextureNode('output');
  const ldr = renderOutput(hdr);

  const exposure = toneMappingExposure as unknown as Node<'float'>;
  const uVibrance = uniform(0.16);
  const uSaturation = uniform(1.1);
  const uContrast = uniform(1.06);
  const uVignette = uniform(0.24);
  const graded = Fn(() => {
    let c = ldr.rgb;
    c = c.mul(vec3(1.02, 1.0, 0.985));
    c = vibrance(c, uVibrance);
    c = saturation(c, uSaturation);
    if (rich) {
      // Cheap selective bloom approximation: only over-bright emissive/glint pixels lift locally.
      // The high threshold avoids the daytime sky, sea, pale stone, and canvas.
      const exposed = hdr.rgb.mul(exposure);
      const high = smoothstep(2.35, 3.6, luminance(exposed));
      c = c.add(exposed.mul(high).mul(0.045));
    }
    c = c.sub(0.18).mul(uContrast).add(0.18);
    const d = screenUV.sub(0.5).mul(vec2(1.0, 0.8)).length();
    c = c.mul(float(1).sub(smoothstep(0.4, 0.95, d).mul(uVignette)));
    return vec4(c, 1);
  })();

  // SMAA was tested but exceeded the High-tier post budget; FXAA keeps thin-rigging quality acceptable.
  const aa = fxaa(graded) as unknown as Node<'vec4'>;
  const grain = interleavedGradientNoise(screenCoordinate.xy).sub(0.5);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = vec4(aa.rgb.add(grain.mul(0.012).add(grain.div(255))), 1);

  return {
    render: () => pipeline.render(),
    grade: { vibrance: uVibrance, saturation: uSaturation, contrast: uContrast, vignette: uVignette },
    dispose() {
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}
