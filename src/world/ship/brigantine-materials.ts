import {
  CanvasTexture,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardNodeMaterial,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  type Color,
  type Texture,
  type UniformNode,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  float,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  vec2,
} from 'three/tsl';
import { packs } from '../../engine/packs';
import { world } from '../uniforms';
import { gustNode } from '../wind-nodes';

/** Owns the shared ship materials and the canvas texture used for labels/name boards. */
export interface BrigantineUniforms {
  trim: UniformNode<'float', number>;
  luff: UniformNode<'float', number>;
  /** Sail cloth and the band across each sail (Paint Your Sails). */
  sailCloth: UniformNode<'color', Color>;
  sailStripe: UniformNode<'color', Color>;
}

let shipWoodTexture: Texture | null = null;
let shipLabelTexture: Texture | null = null;
let shipLabelCanvas: HTMLCanvasElement | null = null;
let shipName = '';

export function fitShipNameFontSize(
  name: string,
  maxWidth: number,
  measure: (fontSize: number, text: string) => number,
  maxSize = 86,
  minSize = 20,
): number {
  const text = name.trim() || ' ';
  let size = maxSize;
  while (size > minSize && measure(size, text) > maxWidth) size -= 2;
  return size;
}

function getShipWoodTexture(): Texture {
  if (shipWoodTexture) return shipWoodTexture;
  if (typeof document === 'undefined') {
    shipWoodTexture = new DataTexture(new Uint8Array([132, 92, 54, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    shipWoodTexture.needsUpdate = true;
  } else {
    shipWoodTexture = new TextureLoader().load(packs.url('/packs/testcove/ship/wood-trim.webp'));
  }
  shipWoodTexture.colorSpace = SRGBColorSpace;
  shipWoodTexture.wrapS = RepeatWrapping;
  shipWoodTexture.wrapT = RepeatWrapping;
  shipWoodTexture.generateMipmaps = true;
  shipWoodTexture.minFilter = LinearMipmapLinearFilter;
  shipWoodTexture.magFilter = LinearFilter;
  shipWoodTexture.anisotropy = 8;
  shipWoodTexture.repeat.set(1.35, 1.65);
  return shipWoodTexture;
}

function getShipLabelTexture(): Texture {
  if (shipLabelTexture) return shipLabelTexture;
  if (typeof document === 'undefined') {
    shipLabelTexture = new DataTexture(
      new Uint8Array([205, 151, 64, 255, 24, 23, 22, 255]),
      2,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    shipLabelTexture.needsUpdate = true;
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    shipLabelCanvas = canvas;
    shipLabelTexture = new CanvasTexture(canvas);
    repaintShipLabelCanvas();
  }
  shipLabelTexture.colorSpace = SRGBColorSpace;
  shipLabelTexture.generateMipmaps = true;
  shipLabelTexture.minFilter = LinearMipmapLinearFilter;
  shipLabelTexture.magFilter = LinearFilter;
  shipLabelTexture.anisotropy = 4;
  return shipLabelTexture;
}

function repaintShipLabelCanvas(): void {
  if (!shipLabelCanvas) return;
  const ctx = shipLabelCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, shipLabelCanvas.width, shipLabelCanvas.height);
  const drawPlaque = (
    x: number,
    y: number,
    fill: CanvasGradient | string,
    stroke: string,
    text: string,
    font: string,
    ink: string,
  ) => {
    const plaqueWidth = 464;
    const plaqueHeight = 188;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.roundRect(24, 34, plaqueWidth, plaqueHeight, 26);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 4;
    ctx.strokeRect(52, 62, 408, 132);
    ctx.fillStyle = ink;
    const size = fitShipNameFontSize(
      text,
      plaqueWidth * 0.78,
      (s, t) => {
        ctx.font = font.replace('{size}', String(s));
        return ctx.measureText(t).width;
      },
      76,
      28,
    );
    ctx.font = font.replace('{size}', String(size));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);
    ctx.restore();
  };
  const brass = ctx.createLinearGradient(0, 28, 0, 226);
  brass.addColorStop(0, '#f1cb73');
  brass.addColorStop(0.48, '#b98231');
  brass.addColorStop(1, '#f0c46a');
  drawPlaque(
    0,
    0,
    brass,
    '#7a4a17',
    'PROMPT BOX',
    "700 {size}px Georgia, 'Times New Roman', serif",
    '#2b1707',
  );
  const iron = ctx.createLinearGradient(512, 28, 512, 226);
  iron.addColorStop(0, '#4b4a46');
  iron.addColorStop(0.55, '#171717');
  iron.addColorStop(1, '#302f2b');
  drawPlaque(
    512,
    0,
    iron,
    '#090909',
    'TERMINAL',
    "700 {size}px 'SFMono-Regular', Consolas, monospace",
    '#ffb160',
  );

  const board = ctx.createLinearGradient(0, 280, 0, 480);
  board.addColorStop(0, '#24100c');
  board.addColorStop(0.55, '#080607');
  board.addColorStop(1, '#5a1712');
  ctx.fillStyle = board;
  ctx.strokeStyle = '#c5973f';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.roundRect(58, 302, 908, 142, 24);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 233, 168, 0.38)';
  ctx.lineWidth = 5;
  ctx.strokeRect(88, 331, 848, 84);
  if (shipName) {
    ctx.fillStyle = '#f2c76e';
    ctx.shadowColor = 'rgba(120, 72, 12, 0.9)';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitShipNameFontSize(
      shipName,
      810,
      (s, t) => {
        ctx.font = `800 ${s}px Georgia, 'Times New Roman', serif`;
        return ctx.measureText(t).width;
      },
      82,
      24,
    );
    ctx.font = `800 ${size}px Georgia, 'Times New Roman', serif`;
    ctx.fillText(shipName, 512, 374);
    ctx.shadowBlur = 0;
  }
  shipLabelTexture!.needsUpdate = true;
}

export function paintShipName(name: string | null): void {
  shipName = (name ?? '').trim();
  getShipLabelTexture();
  repaintShipLabelCanvas();
  if (shipLabelTexture) shipLabelTexture.needsUpdate = true;
}

export function makeShipMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.66,
    metalness: 0.02,
    side: DoubleSide,
  });
  const vc = attribute('color', 'vec3');
  const region = attribute('shipRegion', 'float');
  const r1 = smoothstep(0.6, 0.9, region).mul(float(1).sub(smoothstep(1.1, 1.4, region)));
  const r2 = smoothstep(1.6, 1.9, region).mul(float(1).sub(smoothstep(2.1, 2.4, region)));
  const r3 = smoothstep(2.6, 2.9, region).mul(float(1).sub(smoothstep(3.1, 3.4, region)));
  const r4 = smoothstep(3.6, 3.9, region).mul(float(1).sub(smoothstep(4.1, 4.4, region)));
  const r5 = smoothstep(4.6, 4.9, region).mul(float(1).sub(smoothstep(5.1, 5.4, region)));
  const r6 = smoothstep(5.6, 5.9, region).mul(float(1).sub(smoothstep(6.1, 6.4, region)));
  const r7 = smoothstep(6.6, 6.9, region);
  const r0 = float(1).sub(smoothstep(0.25, 0.6, region));

  const hullWood = texture(
    getShipWoodTexture(),
    vec2(positionLocal.z.mul(0.085).add(positionLocal.x.mul(0.02)), positionLocal.y.mul(0.23).add(0.42)),
  ).rgb;
  const deckWood = texture(
    getShipWoodTexture(),
    vec2(positionLocal.x.mul(0.18).add(positionLocal.z.mul(0.015)), positionLocal.z.mul(0.12).add(0.18)),
  ).rgb;
  const plankNoise = sin(positionLocal.z.mul(5.5).add(positionLocal.y.mul(1.7)))
    .mul(0.5)
    .add(0.5);
  const hullSeam = abs(sin(positionLocal.y.mul(7.6)))
    .smoothstep(0.986, 1.0)
    .mul(0.13);
  const hullButts = abs(sin(positionLocal.z.mul(3.6).add(positionLocal.y.mul(0.7))))
    .smoothstep(0.992, 1.0)
    .mul(0.08);
  const hullWeather = abs(sin(positionLocal.z.mul(1.3).add(positionLocal.x.mul(2.7))))
    .mul(0.035)
    .add(positionLocal.y.smoothstep(-0.15, 0.55).oneMinus().mul(0.12));
  const deckSeam = abs(sin(positionLocal.x.mul(8.2)))
    .smoothstep(0.965, 1.0)
    .mul(0.22);
  const hull = hullWood
    .mul(mix(color(0x090706), color(0x352018), plankNoise.mul(0.22).add(0.08)))
    .sub(color(0x1a0905).mul(hullSeam.add(hullButts)))
    .add(color(0x6f6f60).mul(hullWeather));
  const deck = deckWood.mul(mix(color(0xc08c55), color(0xffce87), 0.34)).sub(color(0x2a170c).mul(deckSeam));
  const paintGrain = hullWood.mul(0.28).add(0.72);
  const red = paintGrain.mul(color(0x9c2418));
  const gold = paintGrain.mul(color(0xd7a554));
  const iron = mix(
    color(0x171717),
    color(0x4a4840),
    sin(positionLocal.x.mul(13).add(positionLocal.z.mul(9)))
      .mul(0.18)
      .add(0.24),
  );
  const weave = sin(positionLocal.x.mul(38))
    .mul(sin(positionLocal.z.mul(32)))
    .mul(0.045)
    .add(0.96);
  const canvas = color(0xefe4cc)
    .mul(weave)
    .sub(color(0x5b4328).mul(abs(sin(positionLocal.z.mul(4.5))).mul(0.04)));
  const glow = color(0xffb060).mul(world.night.smoothstep(0.08, 0.9).mul(2.8).add(0.2));
  const label = texture(getShipLabelTexture(), attribute('uv', 'vec2')).rgb;

  let outColor = hull;
  outColor = mix(outColor, deck, r1);
  outColor = mix(outColor, red, r2);
  outColor = mix(outColor, gold, r3);
  outColor = mix(outColor, iron, r4);
  outColor = mix(outColor, canvas, r5);
  outColor = mix(outColor, glow, r6);
  outColor = mix(outColor, label, r7);
  const submerged = positionLocal.y.negate().smoothstep(0.05, 0.85).mul(r0).mul(0.92);
  outColor = mix(outColor, color(0x06242b), submerged);
  m.colorNode = outColor.mul(vc.mul(0.52).add(0.52));
  m.emissiveNode = glow.mul(r6).mul(world.night.smoothstep(0.08, 0.9));
  m.roughnessNode = mix(mix(float(0.62), float(0.88), r5), float(0.34), r3)
    .add(r4.mul(0.1))
    .add(r7.mul(0.04));
  m.metalnessNode = mix(float(0.02), float(0.46), r3);
  return m;
}

export function makeCanvasMaterial(uniforms: BrigantineUniforms): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    roughness: 0.88,
    metalness: 0,
    side: DoubleSide,
  });
  const sailUv = attribute('sailUv', 'vec2');
  const sailNormal = attribute('sailNormal', 'vec3');
  const sailAnchor = attribute('sailAnchor', 'vec3');
  const belly = sin(sailUv.x.mul(Math.PI))
    .mul(sin(sailUv.y.mul(Math.PI)))
    .max(0);
  const gust = gustNode(vec2(positionWorld.x, positionWorld.z));
  const windFacing = abs(world.windDir.x.mul(sailNormal.x).add(world.windDir.y.mul(sailNormal.z)))
    .mul(0.45)
    .add(0.65);
  const flutter = sin(world.time.mul(12.0).add(sailUv.x.mul(31)).add(sailUv.y.mul(17)))
    .mul(uniforms.luff)
    .mul(0.46);
  const billow = belly
    .mul(uniforms.trim)
    .mul(world.windSpeed.mul(0.08).add(0.72))
    .mul(gust.mul(0.28).add(0.86))
    .mul(windFacing)
    .mul(2.05)
    .add(flutter);
  m.positionNode = mix(sailAnchor, positionLocal.add(sailNormal.mul(billow)), uniforms.trim);
  const panelU = abs(sin(sailUv.x.mul(Math.PI * 9))).smoothstep(0.972, 1.0);
  const dirt = sailUv.y
    .oneMinus()
    .mul(0.12)
    .add(abs(sin(positionLocal.x.mul(3.7).add(positionLocal.y))).mul(0.08));
  const yardShadow = smoothstep(0.78, 1.0, sailUv.y).mul(0.2);
  const bellyOcclusion = belly.mul(uniforms.trim).mul(0.16);
  const backlit = world.sunDir.x
    .mul(sailNormal.x)
    .add(world.sunDir.z.mul(sailNormal.z))
    .negate()
    .smoothstep(0.05, 0.8);
  // The palette band sits just above the foot of each sail (v runs foot → head).
  const band = smoothstep(0.17, 0.19, sailUv.y).mul(float(1).sub(smoothstep(0.27, 0.29, sailUv.y)));
  const cloth = mix(uniforms.sailCloth, uniforms.sailStripe, band);
  const reefBands = abs(sin(sailUv.y.mul(Math.PI * 7)))
    .smoothstep(0.965, 1.0)
    .mul(0.08);
  const wear = float(1).sub(
    panelU.mul(0.18).add(reefBands).add(dirt).add(yardShadow).add(bellyOcclusion).mul(0.85),
  );
  m.colorNode = cloth.mul(color(0xffe0a8)).mul(belly.mul(0.06).add(0.9)).mul(wear);
  m.emissiveNode = cloth
    .mul(color(0xffe2b0))
    .mul(backlit.mul(world.sunDir.y.smoothstep(0.02, 0.45)).mul(0.09));
  return m;
}
