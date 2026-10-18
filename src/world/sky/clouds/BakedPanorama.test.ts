import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BasicNodeLibrary,
  BoxGeometry,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  Scene,
  WGSLNodeBuilder,
} from 'three/webgpu';
import { context, normalize, positionWorld } from 'three/tsl';
import { ISLANDS } from '../../../game/islands';
import { sunState } from '../sun';
import { SKY_KEYS, bakeAzimuthDeg, createBakedClouds, keyBlend } from './BakedPanorama';

const elevation = (hours: number, az = 0) => sunState(hours, az).sun[1];

describe('baked sky keys', () => {
  it('are in order of sun height', () => {
    for (let i = 1; i < SKY_KEYS.length; i++)
      expect(elevation(SKY_KEYS[i]!.hours)).toBeGreaterThan(elevation(SKY_KEYS[i - 1]!.hours));
  });

  it('show each island at one key, with nothing to blend', () => {
    for (const island of [ISLANDS.anchorage, ISLANDS.meridian]) {
      const k = keyBlend(elevation(island.sky.hours));
      expect(Math.min(k.t, 1 - k.t)).toBeLessThan(1e-9);
    }
  });

  it('blend the two keys either side of the sun', () => {
    const lo = elevation(SKY_KEYS[1]!.hours);
    const hi = elevation(SKY_KEYS[2]!.hours);
    expect(keyBlend((lo + hi) / 2)).toEqual({ lo: 1, hi: 2, t: 0.5 });
    expect(keyBlend(-1)).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(keyBlend(1)).toEqual({ lo: SKY_KEYS.length - 1, hi: SKY_KEYS.length - 1, t: 0 });
  });

  it('are baked with the sun at one azimuth, so their clouds line up', () => {
    const azimuths = SKY_KEYS.map((k) => {
      const s = sunState(k.hours, bakeAzimuthDeg(k.hours)).sun;
      return Math.atan2(s[2], s[0]);
    });
    for (const a of azimuths) expect(Math.cos(a - azimuths[0]!)).toBeCloseTo(1, 9);
  });
});

/** The baked layer's fragment WGSL, built by three's node builder with a stand-in renderer (no GPU). */
function layerWgsl(): string {
  const clouds = createBakedClouds({} as never);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = clouds.sampleView(normalize(positionWorld)).rgb;
  const mesh = new Mesh(new BoxGeometry(), material);
  const renderer = {
    backend: {
      isWebGPUBackend: true,
      compatibilityMode: false,
      parameters: {},
      utils: { getTextureSampleData: () => ({ primarySamples: 1 }) },
    },
    getRenderTarget: () => null,
    getOutputRenderTarget: () => null,
    getMRT: () => null,
    hasFeature: () => false,
    library: new BasicNodeLibrary(),
    contextNode: context(),
    debug: { checkShaderErrors: false, diagnostics: { keywords: false } },
    lighting: { enabled: false },
    highPrecision: false,
  };
  const builder = new WGSLNodeBuilder(mesh, renderer as never) as unknown as {
    build(): void;
    material: unknown;
    camera: unknown;
    scene: unknown;
    fragmentShader: string;
  };
  builder.material = material;
  builder.camera = new PerspectiveCamera();
  builder.scene = new Scene();
  builder.build();
  clouds.dispose();
  return builder.fragmentShader;
}

describe('baked cloud layer', () => {
  // Its u wraps 1 → 0 at one azimuth. An implicit-derivative sample (or a textureLoad, which three
  // writes for the unfilterable placeholder) can't tell that from a jump: it took the coarsest mip
  // there and drew a line down the sky.
  it('samples both keys with gradients that ignore the wrap, through a sampler', () => {
    const wgsl = layerWgsl();
    const grads = [...wgsl.matchAll(/textureSampleGrad\(\s*(\w+),\s*(\w+)_sampler/g)];
    expect(grads).toHaveLength(2);
    for (const [, tex, s] of grads) {
      expect(s).toBe(tex);
      expect(wgsl).toMatch(new RegExp(`var ${tex}_sampler\\s*:\\s*sampler;`));
    }
    expect(wgsl).not.toMatch(/textureLoad|textureSample\(/);
  });

  it('keys tile across the azimuth wrap', async () => {
    for (const k of SKY_KEYS) {
      const { data, info } = await sharp(`public/sky/clouds-${k.name}.webp`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;
      const at = (x: number, y: number, c: number) => data[(y * width + x) * channels + c]!;
      // Mean step between neighbouring columns: across the wrap (last → first) and inside the image.
      const step = (a: number, b: number) => {
        let sum = 0;
        for (let y = 0; y < height; y++)
          for (let c = 0; c < channels; c++) sum += Math.abs(at(a, y, c) - at(b, y, c));
        return sum / (height * channels);
      };
      let inside = 0;
      for (let x = 0; x < width - 1; x += 64) inside += step(x, x + 1);
      inside /= Math.ceil((width - 1) / 64);
      expect(step(width - 1, 0)).toBeLessThan(Math.max(1, inside * 3));
    }
  });
});
