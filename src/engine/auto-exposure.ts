import { StorageInstancedBufferAttribute, type Node, type Texture, type WebGPURenderer } from 'three/webgpu';
import { world } from '../world/uniforms';
import {
  Fn,
  If,
  Loop,
  clamp,
  exp,
  exp2,
  float,
  invocationLocalIndex,
  log2,
  luminance,
  max,
  mix,
  select,
  storage,
  texture,
  uniform,
  vec2,
  vec4,
  workgroupArray,
  workgroupBarrier,
} from 'three/tsl';

/**
 * Metered exposure on top of the keyed one (PLAN §15.2, issues #180). One compute kernel, one
 * workgroup of 256 threads, meters a centre-weighted log-average luminance of the HDR scene (16 × 16
 * tiles, 4 × 4 samples each) and reduces it in workgroup memory; its first thread adapts the reading
 * over time and turns it into a gentle scale on the keyed exposure. The scale stays on the GPU: post
 * reads it in its fragment shader, so nothing waits on a readback. WebGPU only: on WebGL2 (no compute)
 * the keyed exposure stands alone.
 */
export interface AutoExposure {
  /** The scale on the keyed exposure, for fragment shaders (1 until the first metering). */
  readonly scale: Node<'float'>;
  /** Meters the frame just rendered (call after it). */
  update(dt: number, keyedExposure: number): void;
  /** The adapted log2 luminance (exposed by the keyed exposure) and the scale, for probes. */
  read(): Promise<{ logLum: number; scale: number }>;
  dispose(): void;
}

/**
 * The mean exposed log2 luminance the keyed exposure gives the Walt-gate views W1-W4 at 16:20 (−3.35,
 * −3.93, −2.10, −2.41, measured with `__dev.exposure()`). Night aims lower, as the keyed exposure does
 * (the harbour at 22:00 meters about −4.9 to −5.8), so nights stay dark.
 */
const TARGET_LOG = -2.95;
const NIGHT_LOG = -2.2;
/**
 * Views within this many stops of the target keep the keyed look (the approved views all do); beyond
 * it, the scale closes STRENGTH of the rest of the gap.
 */
const DEAD_ZONE = 0.75;
const STRENGTH = 0.5;
/** The scale's range: a correction, not a new look. */
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.25;
/** Adaptation time constant (s): a slow, eye-like settle. */
const TAU = 1.2;

type SharedFloats = { element(index: Node<'uint'> | Node<'int'>): Node<'float'> };

const TILES = 16;
const SAMPLES = 4;

export function createAutoExposure(renderer: WebGPURenderer, source: Texture): AutoExposure {
  // x: adapted log2 luminance (pre-exposure), y: scale, z: 1 once metered
  const attr = new StorageInstancedBufferAttribute(new Float32Array([0, 1, 0, 0]), 4);
  const state = storage(attr, 'vec4', 1);
  const readState = storage(attr, 'vec4', 1).toReadOnly();
  const dtU = uniform(1 / 60);
  const keyedLog = uniform(0);
  // workgroupArray's element() isn't in three's published types yet.
  const sums = workgroupArray('float', TILES * TILES) as unknown as SharedFloats;
  const weights = workgroupArray('float', TILES * TILES) as unknown as SharedFloats;

  const kernel = Fn(() => {
    const i = invocationLocalIndex;
    const tile = vec2(float(i.mod(TILES)), float(i.div(TILES)));
    const sum = float(0).toVar();
    const wsum = float(0).toVar();
    Loop(SAMPLES * SAMPLES, ({ i: s }) => {
      const sub = vec2(float(s.mod(SAMPLES)), float(s.div(SAMPLES)))
        .add(0.5)
        .div(SAMPLES);
      const uv = tile.add(sub).div(TILES);
      const c = texture(source, uv).level(float(0)).rgb;
      const l = clamp(log2(max(luminance(c), float(1e-4))), -12, 8);
      // centre-weighted: what the player looks at counts most
      const d = uv.sub(0.5).mul(vec2(1, 1.3));
      const w = exp(d.dot(d).mul(-6));
      sum.addAssign(l.mul(w));
      wsum.addAssign(w);
    });
    sums.element(i).assign(sum);
    weights.element(i).assign(wsum);
    workgroupBarrier();
    If(i.equal(0), () => {
      const total = float(0).toVar();
      const totalW = float(0).toVar();
      Loop(TILES * TILES, ({ i: t }) => {
        total.addAssign(sums.element(t));
        totalW.addAssign(weights.element(t));
      });
      const measured = total.div(max(totalW, 1e-5));
      const prev = state.element(0);
      const k = select(prev.z.greaterThan(0.5), float(1).sub(exp(dtU.negate().div(TAU))), float(1));
      const adapted = mix(prev.x, measured, k);
      const gap = float(TARGET_LOG).add(world.night.mul(NIGHT_LOG)).sub(adapted.add(keyedLog));
      const beyond = max(gap.abs().sub(DEAD_ZONE), 0).mul(gap.sign());
      const scale = clamp(exp2(beyond.mul(STRENGTH)), MIN_SCALE, MAX_SCALE);
      state.element(0).assign(vec4(adapted, scale, 1, 0));
    });
  })()
    .compute(TILES * TILES, [TILES * TILES])
    .setName('Auto Exposure');

  return {
    scale: readState.element(0).y,
    update(dt, keyedExposure) {
      dtU.value = Math.min(Math.max(dt, 0), 0.25);
      keyedLog.value = Math.log2(Math.max(keyedExposure, 1e-4));
      renderer.compute(kernel);
    },
    async read() {
      const buf = new Float32Array(await renderer.getArrayBufferAsync(attr));
      return { logLum: buf[0]! + keyedLog.value, scale: buf[1]! };
    },
    dispose() {
      kernel.dispose();
    },
  };
}
