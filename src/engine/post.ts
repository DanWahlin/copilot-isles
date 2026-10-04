import { RenderPipeline, type Camera, type Node, type Scene, type WebGPURenderer } from 'three/webgpu';
import {
  Fn,
  cameraFar,
  convertToTexture,
  cameraNear,
  float,
  interleavedGradientNoise,
  luminance,
  mix,
  mrt,
  output,
  pass,
  perspectiveDepthToViewZ,
  renderOutput,
  saturation,
  screenCoordinate,
  screenUV,
  smoothstep,
  toneMappingExposure,
  uniform,
  velocity,
  vec2,
  vec3,
  vec4,
  vibrance,
} from 'three/tsl';
import type { TierSettings } from './quality';
import { createAutoExposure } from './auto-exposure';

export interface Post {
  render(): void;
  /** Warm the scene pass and full-screen post shaders without compiling default-framebuffer scene variants. */
  compile(): Promise<void>;
  /** The metered exposure (WebGPU, not the lean title post): log2 luminance and scale, for probes. */
  readExposure?(): Promise<{ logLum: number; scale: number }>;
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
  /** Allows visual probes to compare the title with temporal AA disabled. */
  temporal?: boolean;
}

/** Scene pass → tone mapping/grade → local highlight lift → FXAA → dither. */
export async function createPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  tier: TierSettings,
  options: PostOptions = {},
): Promise<Post | null> {
  const rich = !options.lean && (tier.tier === 'high' || tier.tier === 'ultra');
  const backendName =
    (renderer.backend as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? '';
  const actualWebGL =
    (renderer.backend as { isWebGLBackend?: boolean } | undefined)?.isWebGLBackend === true ||
    /webgl/i.test(backendName);
  const canUseTemporal = options.temporal !== false && !actualWebGL;
  const temporalPost =
    canUseTemporal &&
    ((!options.lean && ['medium', 'high', 'ultra'].includes(tier.tier)) ||
      (options.lean && (tier.tier === 'high' || tier.tier === 'ultra')));
  const dbg = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const qualityPost =
    !dbg.has('noao') && !options.lean && !actualWebGL && ['medium', 'high', 'ultra'].includes(tier.tier);
  const fxaaMod = await import('three/addons/tsl/display/FXAANode.js');
  const gtaoMod = qualityPost ? await import('three/addons/tsl/display/GTAONode.js') : null;
  const temporalMod = temporalPost ? await import('three/addons/tsl/display/TRAANode.js') : null;
  const sharpenMod =
    temporalPost && !dbg.has('nosharp') ? await import('three/addons/tsl/display/SharpenNode.js') : null;

  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera, { type: renderer.getOutputBufferType() });
  if (temporalPost) {
    scenePass.setMRT(mrt({ output, velocity }));
  }
  const hdr = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  // Metered exposure on top of the keyed one (WebGPU compute; WebGL2 and the lean title keep the key).
  const meter =
    !actualWebGL && !options.lean && !dbg.has('noautoexposure')
      ? createAutoExposure(renderer, scenePass.getTexture('output'))
      : null;
  const keyed = toneMappingExposure as unknown as Node<'float'>;
  const exposure = meter ? keyed.mul(meter.scale) : keyed;
  const gtaoNode = gtaoMod?.ao(sceneDepth, null as unknown as Node<'vec3'>, camera) as
    | (Node<'float'> & {
        resolutionScale: number;
        useTemporalFiltering: boolean;
        radius: { value: number };
        thickness: { value: number };
        samples: { value: number };
        dispose(): void;
      })
    | undefined;
  if (gtaoNode) {
    gtaoNode.resolutionScale = tier.tier === 'medium' ? 0.25 : 0.5;
    gtaoNode.radius.value = tier.tier === 'medium' ? 0.42 : 0.55;
    gtaoNode.thickness.value = 1.4;
    gtaoNode.samples.value = tier.tier === 'medium' ? 8 : 12;
    // AO goes in before TRAA with per-frame noise, so TRAA averages its grain away. Applied after
    // TRAA, its fixed noise stayed on screen as a dirty stipple on skin, stone and sails.
    gtaoNode.useTemporalFiltering = Boolean(temporalPost);
  }
  const aoHdr = gtaoNode
    ? Fn(() => {
        const c = hdr.rgb;
        const sunlit = smoothstep(0.65, 1.65, luminance(c.mul(exposure)));
        // AO grounds nearby props and characters. Far away it only finds the sea's wave relief, which it
        // turned into a field of dark half-resolution speckles, so it fades out by 25-60 m.
        const viewDist = perspectiveDepthToViewZ(
          sceneDepth.sample(screenUV).r,
          cameraNear,
          cameraFar,
        ).negate();
        const near = float(1).sub(smoothstep(25, 60, viewDist));
        const strength = float(tier.tier === 'medium' ? 0.26 : 0.34)
          .mul(float(1).sub(sunlit.mul(0.65)))
          .mul(near);
        return vec4(c.mul(mix(float(1), gtaoNode, strength)), hdr.a);
      })()
    : hdr;
  const beauty = gtaoNode && temporalPost ? convertToTexture(aoHdr) : hdr;
  const temporalNode = temporalMod?.traa(beauty, sceneDepth, scenePass.getTextureNode('velocity'), camera) as
    (Node<'vec4'> & { getTextureNode(): Node<'vec4'>; dispose(): void }) | undefined;
  const sharpenNode =
    temporalNode && sharpenMod
      ? (sharpenMod!.sharpen(temporalNode.getTextureNode(), float(0.45)) as {
          getTextureNode(): Node<'vec4'>;
          dispose(): void;
        })
      : undefined;
  const temporalResult = sharpenNode
    ? (sharpenNode.getTextureNode() as Node<'vec4'>)
    : temporalNode
      ? (temporalNode.getTextureNode() as Node<'vec4'>)
      : null;
  const temporalHdr = temporalResult ?? aoHdr;
  const ldr = renderOutput(meter ? vec4(temporalHdr.rgb.mul(meter.scale), temporalHdr.a) : temporalHdr);

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

  const fxaaNode = temporalPost ? graded : (fxaaMod.fxaa(graded) as unknown as Node<'vec4'>);
  const aa = fxaaNode;
  const grain = interleavedGradientNoise(screenCoordinate.xy)
    .sub(0.5)
    .mul(dbg.has('nograin') ? 0 : 1);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = vec4(aa.rgb.add(grain.mul(0.012).add(grain.div(255))), 1);

  let last = 0;
  const render = () => {
    pipeline.render();
    if (!meter) return;
    const now = performance.now();
    meter.update(last ? (now - last) / 1000 : 1 / 60, renderer.toneMappingExposure);
    last = now;
  };
  return {
    render,
    async compile() {
      render();
    },
    readExposure: meter ? () => meter.read() : undefined,
    grade: { vibrance: uVibrance, saturation: uSaturation, contrast: uContrast, vignette: uVignette },
    dispose() {
      scenePass.dispose();
      gtaoNode?.dispose();
      if (beauty !== hdr) (beauty as unknown as { dispose(): void }).dispose();
      temporalNode?.dispose();
      sharpenNode?.dispose();
      pipeline.dispose();
      meter?.dispose();
    },
  };
}
