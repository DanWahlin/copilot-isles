import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardNodeMaterial,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  clamp,
  cos,
  float,
  mix,
  normalLocal,
  normalize,
  positionLocal,
  sign,
  sin,
  smoothstep,
  texture,
  uv,
  varying,
  vec3,
} from 'three/tsl';
import type { UniformNode } from 'three/webgpu';
import { world } from '../uniforms';
import { plainShadowColor } from '../../engine/shadow-color';

// three's TSL fluent node typings do not cover this mixed scalar/vector graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/**
 * Every flag is one finely divided sheet of cloth in the ship-local x-y plane at its mast's z,
 * streaming along +x from the hoist. The jolly roger's skull and bones are painted into a texture
 * so they ripple with the cloth instead of floating in front of it.
 */
interface FlagBuilder {
  positions: number[];
  uvs: number[];
  colors: number[];
  painted: number[];
  pivots: number[];
  indices: number[];
}

interface FlagRect {
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface PennantSpec {
  z: number;
  y: number;
  length: number;
  height: number;
  color: number;
}

/** Where a ship's colours and pennants fly (ship-local), and how far the colours come down when struck. */
export interface FlagLayout {
  flag: FlagRect;
  /** A swallowtail fly (the raiders') instead of a frayed straight one. */
  swallowtail: boolean;
  pennants: readonly PennantSpec[];
  /** From the masthead to just above the deck. */
  haulDown: number;
}

const JOLLY: FlagRect = { z: -1.69, x0: 0.18, x1: 2.28, y0: 20.88, y1: 22.35 };
const FORE_Z = 5.25;
const MIZZEN_Z = -7.8;

/** Your brigantine: the jolly roger at the main truck and red pennants fore and aft. */
export const BRIGANTINE_FLAGS: FlagLayout = {
  flag: JOLLY,
  swallowtail: false,
  pennants: [
    { z: FORE_Z, y: 20.36, length: 2.05, height: 0.16, color: 0x8f1712 },
    { z: MIZZEN_Z, y: 17.88, length: 1.75, height: 0.14, color: 0xa01c14 },
  ],
  haulDown: 17.9,
};

/** A raider's brigantine rig: the same places, the raiders' swallowtail and fog-grey pennants. */
export const RAIDER_BRIGANTINE_FLAGS: FlagLayout = {
  flag: JOLLY,
  swallowtail: true,
  pennants: [
    { z: FORE_Z, y: 20.36, length: 2.3, height: 0.16, color: 0x6f2a24 },
    { z: MIZZEN_Z, y: 17.88, length: 2.0, height: 0.14, color: 0x9aa0a6 },
  ],
  haulDown: 17.9,
};

/**
 * A raider cutter's colours at the masthead (`top` is the truck's ship-local y, `z` the mast) and a long
 * pennant at the gaff peak.
 */
export function raiderCutterFlags(
  z: number,
  y0: number,
  y1: number,
  peak: { y: number; z: number },
): FlagLayout {
  return {
    flag: { z, x0: 0.18, x1: 2.0, y0, y1 },
    swallowtail: true,
    pennants: [{ z: peak.z, y: peak.y + 0.05, length: 2.6, height: 0.15, color: 0x4a1814 }],
    haulDown: y0 - 3.0,
  };
}
/** The ripple phase wraps here; every wave term's frequency is a multiple of 1/2 so it stays seamless. */
export const FLAG_PHASE_PERIOD = Math.PI * 4;

function hexRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function addSheet(
  b: FlagBuilder,
  cols: number,
  rows: number,
  pivot: number,
  colorHex: number,
  painted: boolean,
  at: (u: number, v: number) => [number, number],
  texU: (x: number) => number,
): void {
  const base = b.positions.length / 3;
  const [r, g, bl] = hexRgb(colorHex);
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const [x, y] = at(col / cols, row / rows);
      b.positions.push(x, y, pivot);
      b.uvs.push(texU(x), row / rows);
      b.colors.push(r, g, bl);
      b.painted.push(painted ? 1 : 0);
      b.pivots.push(pivot);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = base + row * (cols + 1) + col;
      b.indices.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
    }
  }
}

function addColours(b: FlagBuilder, rect: FlagRect, swallowtail: boolean): void {
  const { x0, x1, y0, y1, z } = rect;
  if (swallowtail) {
    // A notch cut deep into the fly, so the raiders' colours read by their shape alone.
    addSheet(
      b,
      24,
      14,
      z,
      0xffffff,
      true,
      (u, v) => [x0 + (x1 - x0 - 0.62 * (1 - Math.abs(v * 2 - 1))) * u, y0 + (y1 - y0) * v],
      (x) => (x - x0) / (x1 - x0),
    );
    return;
  }
  addSheet(
    b,
    24,
    14,
    z,
    0xffffff,
    true,
    (u, v) => {
      // A frayed fly edge: the last column is bitten back by an uneven amount down the flag.
      const bite = Math.max(0, Math.sin(v * Math.PI * 3.1) * 0.11 + Math.sin(v * Math.PI * 8.0) * 0.045);
      return [x0 + (x1 - bite - x0) * u, y0 + (y1 - y0) * v];
    },
    (x) => (x - x0) / (x1 - x0),
  );
}

function addPennant(
  b: FlagBuilder,
  z: number,
  y: number,
  length: number,
  height: number,
  colorHex: number,
): void {
  const x0 = 0.12;
  addSheet(
    b,
    18,
    2,
    z,
    colorHex,
    false,
    (u, v) => {
      const half = height * (1 - 0.9 * u);
      return [x0 + (length - x0) * u, y + (v * 2 - 1) * half];
    },
    () => 0,
  );
}

export function createFlagGeometry(layout: FlagLayout = BRIGANTINE_FLAGS): BufferGeometry {
  const b: FlagBuilder = { positions: [], uvs: [], colors: [], painted: [], pivots: [], indices: [] };
  addColours(b, layout.flag, layout.swallowtail);
  for (const p of layout.pennants) addPennant(b, p.z, p.y, p.length, p.height, p.color);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(b.positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(b.uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(b.colors), 3));
  geometry.setAttribute('flagPainted', new BufferAttribute(new Float32Array(b.painted), 1));
  geometry.setAttribute('flagPivot', new BufferAttribute(new Float32Array(b.pivots), 1));
  geometry.setIndex(b.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawBone(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  fill: string,
): void {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = (-(by - ay) / len) * width * 0.52;
  const ny = ((bx - ax) / len) * width * 0.52;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ] as const) {
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.arc(x + nx * side, y + ny * side, width * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSkull(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  grow: number,
  fill: string | CanvasGradient,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 10, 62 + grow, 58 + grow, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - 32 - grow, cy + 18 - grow, 64 + grow * 2, 52 + grow * 2, 14 + grow);
  ctx.fill();
}

/** Canvas artwork for the jolly roger (512 × 360, the flag's 2.1 × 1.47 m aspect). */
function paintJollyRoger(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(1715);

  ctx.fillStyle = '#0f0f11';
  ctx.fillRect(0, 0, 512, 360);
  // Sun-bleached toward the fly, where the cloth takes the weather.
  const fade = ctx.createLinearGradient(0, 0, 512, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(92,84,74,0.22)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 512, 360);
  // Weave: faint threads both ways plus a speckle of lint.
  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  for (let y = 0; y < 360; y += 3) ctx.fillRect(0, y, 512, 1);
  for (let x = 0; x < 512; x += 3) ctx.fillRect(x, 0, 1, 360);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * 512, rand() * 360, 1 + rand() * 2, 1);
  }
  // Canvas sleeve at the hoist, where the halyard runs.
  ctx.fillStyle = '#2b2620';
  ctx.fillRect(0, 0, 12, 360);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(12, 0, 2, 360);

  const bone = '#ece5d3';
  const edge = '#8f877a';
  const bones: [number, number, number, number][] = [
    [118, 98, 394, 290],
    [118, 290, 394, 98],
  ];
  for (const [ax, ay, bx, by] of bones) drawBone(ctx, ax, ay, bx, by, 34, edge);
  for (const [ax, ay, bx, by] of bones) drawBone(ctx, ax, ay, bx, by, 28, bone);

  const sx = 256;
  const sy = 118;
  drawSkull(ctx, sx, sy, 3, edge);
  drawSkull(ctx, sx, sy, 0, bone);
  const shade = ctx.createRadialGradient(sx - 22, sy - 38, 8, sx, sy, 96);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(1, 'rgba(60,50,40,0.22)');
  drawSkull(ctx, sx, sy, 0, shade);

  ctx.fillStyle = '#0f0f11';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx + side * 24, sy + 2, 17, 20, side * -0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(sx, sy + 26);
  ctx.lineTo(sx - 10, sy + 46);
  ctx.lineTo(sx + 10, sy + 46);
  ctx.closePath();
  ctx.fill();
  for (let i = -2; i <= 2; i++) ctx.fillRect(sx + i * 11 - 1.5, sy + 56, 3, 16);
  ctx.fillRect(sx - 27, sy + 63, 54, 2);
  return canvas;
}

/**
 * The fog raiders' colours (512 × 360): our own design, no skull and no logo. A slate field, three pale
 * wisps of fog blowing across it, and a ship's lantern burning amber through them. At range it reads
 * as a grey swallowtail with a gold spark.
 */
function paintRaiderColours(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;
  const rand = rng(2404);
  const field = ctx.createLinearGradient(0, 0, 512, 360);
  field.addColorStop(0, '#34414c');
  field.addColorStop(1, '#4a5864');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 512, 360);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < 360; y += 3) ctx.fillRect(0, y, 512, 1);
  for (let x = 0; x < 512; x += 3) ctx.fillRect(x, 0, 1, 360);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.06})`;
    ctx.fillRect(rand() * 512, rand() * 360, 1 + rand() * 2, 1);
  }
  // The lantern: a warm glow, its body and cap, then the flame.
  const lx = 150;
  const ly = 150;
  const glow = ctx.createRadialGradient(lx, ly, 6, lx, ly, 110);
  glow.addColorStop(0, 'rgba(255,196,92,0.55)');
  glow.addColorStop(1, 'rgba(255,196,92,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 360);
  ctx.fillStyle = '#1d2329';
  ctx.beginPath();
  ctx.roundRect(lx - 34, ly - 52, 68, 104, 12);
  ctx.fill();
  ctx.fillRect(lx - 44, ly - 62, 88, 14);
  ctx.fillRect(lx - 40, ly + 50, 80, 12);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d2329';
  ctx.beginPath();
  ctx.arc(lx, ly - 70, 18, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#f2b84b';
  ctx.beginPath();
  ctx.roundRect(lx - 24, ly - 40, 48, 82, 8);
  ctx.fill();
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath();
  ctx.ellipse(lx, ly + 2, 10, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  // Three wisps of fog, the lowest across the lantern's foot.
  ctx.lineCap = 'round';
  const wisps: [number, number, number][] = [
    [96, 30, 0.75],
    [214, 22, 0.85],
    [292, 26, 0.7],
  ];
  for (const [y, w, a] of wisps) {
    ctx.strokeStyle = `rgba(222,228,232,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let x = 30; x <= 500; x += 6) {
      const yy = y + Math.sin(x * 0.022 + y) * 12;
      if (x === 30) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2620';
  ctx.fillRect(0, 0, 12, 360);
  return canvas;
}

function makeColoursTexture(design: 'jolly' | 'raider'): Texture {
  let tex: Texture;
  if (typeof document === 'undefined') {
    tex = new DataTexture(new Uint8Array([15, 15, 17, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  } else {
    tex = new CanvasTexture(design === 'raider' ? paintRaiderColours() : paintJollyRoger());
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = 8;
  }
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface FlagUniforms {
  /** Swings each flag about its mast so it streams downwind (see `flagYaw`). */
  yaw: UniformNode<'float', number>;
  /** Ripple phase, advanced on the CPU so the wave speeds up smoothly with the wind. */
  phase: UniformNode<'float', number>;
  /** 0 (a breath of air: the flag droops and lolls) to 1 (a stiff breeze: it streams and snaps). */
  strength: UniformNode<'float', number>;
  /** 0 flying … 1 hauled down to the deck: the jolly roger slides down its halyard (a struck ship). */
  lower?: UniformNode<'float', number>;
  /** How far (m) the colours come down at `lower` 1 (FlagLayout.haulDown); one ship may switch rigs. */
  haul?: UniformNode<'float', number>;
}

/**
 * Waves run from hoist to fly, growing toward the free end; the cloth's shading follows them, so
 * the wind reads even in a still frame. Flags are built streaming along ship-local +x, then swung
 * about their own mast by `yaw`.
 */
export function makeFlagMaterial(
  u: FlagUniforms,
  design: 'jolly' | 'raider' = 'jolly',
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.74, metalness: 0 });
  const jolly = makeColoursTexture(design);
  material.addEventListener('dispose', () => jolly.dispose());
  const pivot = attribute('flagPivot', 'float') as AnyNode;
  const phase = u.phase as AnyNode;
  const strength = u.strength as AnyNode;
  const amp = float(0.09)
    .add(strength.mul(0.12))
    .mul(float(1).sub(world.reducedMotion.mul(0.85))) as AnyNode;
  const reach = (x: AnyNode) => {
    const e = clamp(x.sub(0.12).div(2.0), 0, 1) as AnyNode;
    return e.mul(e.mul(0.6).add(0.4));
  };
  /** Cloth offset across the flag in units of `amp`: zero at the hoist, about ±1.9 at the fly. */
  const wave = (x: AnyNode, y: AnyNode) => {
    const main = sin(x.mul(4.2).sub(phase).add(y.mul(0.9)));
    const chop = sin(x.mul(8.6).sub(phase.mul(2)).add(y.mul(2.4)).add(1.3)).mul(0.32);
    const billow = sin(x.mul(1.9).sub(phase.mul(0.5)).add(0.7)).mul(0.55);
    return reach(x).mul(main.add(chop).add(billow)) as AnyNode;
  };
  const ripple = (x: AnyNode, y: AnyNode) => wave(x, y).mul(amp) as AnyNode;
  const rest = attribute('position', 'vec3') as AnyNode;
  // Crests catch a little more light and troughs a little less, so the folds read on black cloth too.
  const fold = varying(clamp(wave(rest.x, rest.y).mul(0.11), -0.2, 0.2).add(1), 'vFlagFold') as AnyNode;
  material.positionNode = (Fn as AnyNode)(() => {
    const p = positionLocal as AnyNode;
    const n = normalLocal as AnyNode;
    const eps = 0.025;
    const f = ripple(p.x, p.y);
    const dfdx = ripple(p.x.add(eps), p.y).sub(f).div(eps);
    const dfdy = ripple(p.x, p.y.add(eps)).sub(f).div(eps);
    const bent = normalize((vec3 as AnyNode)(dfdx.negate(), dfdy.negate(), 1)).mul(sign(n.z)) as AnyNode;
    const reachX = reach(p.x);
    // Light air lets the fly sag; the cloth also tugs in a little as each wave passes.
    const sag = float(1).sub(strength).mul(reachX.mul(reachX)).mul(0.24);
    const dx = p.x.sub(reachX.mul(0.035).mul(sin(phase.mul(1.5).add(p.y)).add(1)));
    const dy = p.y.sub(sag).add(f.mul(0.12));
    const dz = f;
    const c = cos(u.yaw) as AnyNode;
    const s = sin(u.yaw) as AnyNode;
    n.assign((vec3 as AnyNode)(bent.x.mul(c).add(bent.z.mul(s)), bent.y, bent.z.mul(c).sub(bent.x.mul(s))));
    // Struck colours: the painted flag slides down to the deck and is gathered in at the hoist.
    const lower = (u.lower ?? float(0)) as AnyNode;
    const painted = attribute('flagPainted', 'float') as AnyNode;
    const down = lower.mul(painted).mul((u.haul ?? float(BRIGANTINE_FLAGS.haulDown)) as AnyNode);
    const gather = float(1).sub(smoothstep(float(0.88), float(1), lower).mul(painted).mul(0.92));
    const gx = dx.sub(JOLLY.x0).mul(gather).add(JOLLY.x0);
    const gz = dz.mul(gather);
    return (vec3 as AnyNode)(gx.mul(c).add(gz.mul(s)), dy.sub(down), pivot.add(gz.mul(c)).sub(gx.mul(s)));
  })();
  const painted = attribute('flagPainted', 'float') as AnyNode;
  const cloth = attribute('color', 'vec3') as AnyNode;
  material.colorNode = mix(cloth, (texture(jolly, uv()) as AnyNode).rgb, painted).mul(fold);
  return plainShadowColor(material);
}

/**
 * The flag yaw (see `makeFlagMaterial`) that streams ship-local +x toward `(downX, downZ)`, a
 * world-space downwind direction, on a ship with the given heading (three's rotation.y).
 */
export function flagYaw(heading: number, downX: number, downZ: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const localX = downX * c - downZ * s;
  const localZ = downX * s + downZ * c;
  return Math.atan2(-localZ, localX);
}
