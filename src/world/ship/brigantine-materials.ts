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
  Vector4,
  type Color,
  type Texture,
  type UniformArrayNode,
  type UniformNode,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  attribute,
  color,
  float,
  floor,
  fract,
  int,
  max,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  uniformArray,
  vec2,
  vec3,
} from 'three/tsl';
import { packs } from '../../engine/packs';
import { plainShadowColor } from '../../engine/shadow-color';
import { world } from '../uniforms';
import { gustNode } from '../wind-nodes';

// TSL fluent typings do not cover this graph.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** Owns the shared ship materials and the canvas texture used for labels/name boards. */
export interface BrigantineUniforms {
  trim: UniformNode<'float', number>;
  luff: UniformNode<'float', number>;
  /** Sail cloth and the band across each sail (Paint Your Sails). */
  sailCloth: UniformNode<'color', Color>;
  sailStripe: UniformNode<'color', Color>;
  /** 0 clean canvas … 1 the raiders' patched, weathered cloth. */
  sailPatch: UniformNode<'float', number>;
  /** 0 your ship's paint (black, red and gold) … 1 the raiders' (weathered slate, oxblood and pewter). */
  livery: UniformNode<'float', number>;
  /** 0 whole sails … about 0.35 shot through: how many holes the canvas shows. */
  sailHoles: UniformNode<'float', number>;
  /** Swings the jolly roger and pennants downwind (see ship-flags `flagYaw`). */
  flagYaw: UniformNode<'float', number>;
  /** Flag ripple phase and apparent-wind strength (see ship-flags `FlagUniforms`). */
  flagPhase: UniformNode<'float', number>;
  flagStrength: UniformNode<'float', number>;
  /** 0 the colours flying … 1 hauled down to the deck (a struck ship; see ship-flags). */
  flagLower: UniformNode<'float', number>;
}

/** How many shot marks a hull keeps (a ring: the oldest is painted over). */
export const SCORCH_SLOTS = 8;
/** Deck guns per ship (port 0…5, starboard 6…11). */
export const GUN_SLOTS = 12;
/** Ships alive at once that keep their own shot marks (yours plus raiders, with room). */
export const SHIP_SLOTS = 6;

/**
 * Shot marks for every ship live in one shared array, each ship reading its own block by its `slot`
 * uniform. A uniform array per ship gave every ship its own shader program (+7 in a three-ship
 * battle); a uniform value doesn't.
 */
export const shipScorch = uniformArray(
  Array.from({ length: SHIP_SLOTS * SCORCH_SLOTS }, () => new Vector4(0, -100, 0, 0)),
  'vec4',
) as UniformArrayNode<'vec4'>;

let shipWoodTexture: Texture | null = null;

/** One ship's name boards and gallery plaques: its own canvas, so every hull can carry its own name. */
export interface ShipLabel {
  texture: Texture;
  canvas: HTMLCanvasElement | null;
  name: string;
}

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

export function createShipLabel(): ShipLabel {
  let texture: Texture;
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document === 'undefined') {
    texture = new DataTexture(
      new Uint8Array([205, 151, 64, 255, 24, 23, 22, 255]),
      2,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    texture.needsUpdate = true;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    texture = new CanvasTexture(canvas);
  }
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  const label: ShipLabel = { texture, canvas, name: '' };
  repaintShipLabelCanvas(label);
  return label;
}

function repaintShipLabelCanvas(label: ShipLabel): void {
  const shipLabelCanvas = label.canvas;
  const shipName = label.name;
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
  label.texture.needsUpdate = true;
}

export function paintShipName(label: ShipLabel, name: string | null): void {
  label.name = (name ?? '').trim();
  repaintShipLabelCanvas(label);
  label.texture.needsUpdate = true;
}

export function makeShipMaterial(
  label: ShipLabel,
  livery: UniformNode<'float', number>,
  slot: UniformNode<'float', number>,
  marks: UniformNode<'float', number>,
): MeshStandardNodeMaterial {
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
  const red = paintGrain.mul(mix(color(0x9c2418), color(0x4f1c18), livery));
  const gold = paintGrain.mul(mix(color(0xd7a554), color(0x8d8f8c), livery));
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
  const labelColor = texture(label.texture, attribute('uv', 'vec2')).rgb;

  // The raiders' hulls: the black paint weathered to a salt-streaked slate.
  const slate = hullWood
    .mul(mix(color(0x1c2328), color(0x56626a), plankNoise.mul(0.3).add(0.2)))
    .sub(color(0x0d1114).mul(hullSeam.add(hullButts)))
    .add(color(0x7b8080).mul(hullWeather.mul(1.6)));
  let outColor = mix(hull, slate, livery);
  outColor = mix(outColor, deck, r1);
  outColor = mix(outColor, red, r2);
  outColor = mix(outColor, gold, r3);
  outColor = mix(outColor, iron, r4);
  outColor = mix(outColor, canvas, r5);
  outColor = mix(outColor, glow, r6);
  outColor = mix(outColor, labelColor, r7);
  const submerged = positionLocal.y.negate().smoothstep(0.05, 0.85).mul(r0).mul(0.92);
  outColor = mix(outColor, color(0x06242b), submerged);
  // Shot marks (ship-local xyz and strength per slot): a dark hole ringed with torn, pale raw wood and a
  // faint soot halo, on the outside of the hull and its paint only. Pale wood reads on any paint. The
  // loop runs once per mark this ship carries (`marks`), so a ship with none pays nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shot: any = (Fn as any)(() => {
    const acc = vec3(0, 0, 0).toVar();
    const jag = sin(positionLocal.z.mul(29).add(positionLocal.y.mul(21)))
      .mul(sin(positionLocal.y.mul(37)))
      .mul(0.07);
    Loop({ start: int(0), end: marks.toInt(), type: 'int', condition: '<' }, ({ i }: { i: AnyNode }) => {
      const e = shipScorch.element(slot.toInt().mul(SCORCH_SLOTS).add(i));
      const dj = positionLocal.sub(e.xyz).length().add(jag);
      acc.assign(
        max(
          acc,
          vec3(smoothstep(0.9, 0.3, dj), smoothstep(0.42, 0.3, dj), smoothstep(0.2, 0.15, dj)).mul(e.w),
        ),
      );
    });
    return acc;
  })();
  const soot = shot.x;
  const raw = shot.y;
  const hole = shot.z;
  const outside = r0.add(r2).add(r3).min(1);
  outColor = mix(outColor, color(0x15100c), soot.mul(0.5).mul(outside));
  outColor = mix(outColor, hullWood.mul(color(0xd9ad78)), raw.mul(outside));
  outColor = mix(outColor, color(0x030202), hole.mul(outside));
  m.colorNode = outColor.mul(vc.mul(0.52).add(0.52));
  m.emissiveNode = glow.mul(r6).mul(world.night.smoothstep(0.08, 0.9));
  m.roughnessNode = mix(mix(float(0.62), float(0.88), r5), float(0.34), r3)
    .add(r4.mul(0.1))
    .add(r7.mul(0.04));
  m.metalnessNode = mix(float(0.02), mix(float(0.46), float(0.3), livery), r3);
  return plainShadowColor(m);
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
  // Patches: a few cloths in each sail sewn in a shade darker or lighter, with a stitched edge.
  const cells = sailUv.mul(vec2(5, 4));
  const cell = floor(cells);
  const local = fract(cells);
  // Seeds come from the cell and the sail's facing only: sailAnchor varies across a sail, which turned
  // the hash into per-pixel noise.
  const sailId = sailNormal.x.mul(1.7).add(sailNormal.z.mul(0.9));
  const seed = fract(sin(cell.x.mul(12.9898).add(cell.y.mul(78.233)).add(sailId)).mul(43758.5453));
  const inX = smoothstep(0.1, 0.13, local.x).mul(float(1).sub(smoothstep(0.82, 0.85, local.x)));
  const inY = smoothstep(0.14, 0.17, local.y).mul(float(1).sub(smoothstep(0.78, 0.81, local.y)));
  const patch = inX
    .mul(inY)
    .mul(smoothstep(0.6, 0.62, seed))
    .mul(uniforms.sailPatch);
  const edgeX = smoothstep(0.08, 0.1, local.x).mul(float(1).sub(smoothstep(0.86, 0.88, local.x)));
  const edgeY = smoothstep(0.12, 0.14, local.y).mul(float(1).sub(smoothstep(0.81, 0.83, local.y)));
  const stitch = edgeX
    .mul(edgeY)
    .sub(inX.mul(inY))
    .max(0)
    .mul(smoothstep(0.6, 0.62, seed))
    .mul(uniforms.sailPatch);
  const patchTone = mix(float(0.74), float(1.16), smoothstep(0.8, 0.82, seed));
  const cloth = mix(uniforms.sailCloth, uniforms.sailStripe, band)
    .mul(mix(float(1), patchTone, patch))
    .mul(float(1).sub(stitch.mul(0.35)));
  const reefBands = abs(sin(sailUv.y.mul(Math.PI * 7)))
    .smoothstep(0.965, 1.0)
    .mul(0.08);
  const wear = float(1).sub(
    panelU.mul(0.18).add(reefBands).add(dirt).add(yardShadow).add(bellyOcclusion).mul(0.85),
  );
  // Shot holes: a few ragged holes, scattered cell by cell, each with a scorched rim; more as the hull
  // takes damage. They're shaded dark, not cut out: an alpha test added a shadow and depth variant of
  // every sail (13 pipelines), and at battle range a dark hole reads the same.
  // Only ships that have taken damage work them out (a uniform branch).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holes: any = (Fn as any)(() => {
    const out = vec2(0, 0).toVar();
    If(uniforms.sailHoles.greaterThan(0), () => {
      const holeCells = sailUv.mul(vec2(7, 6));
      const holeCell = floor(holeCells);
      const holeLocal = fract(holeCells);
      const holeSeed = fract(
        sin(holeCell.x.mul(41.31).add(holeCell.y.mul(17.17)).add(sailId)).mul(24634.6345),
      );
      const holeAt = vec2(fract(holeSeed.mul(7.3)), fract(holeSeed.mul(13.7)))
        .mul(0.5)
        .add(0.25);
      const holeD = holeLocal
        .sub(holeAt)
        .length()
        .add(sin(holeLocal.x.mul(40).add(holeLocal.y.mul(31))).mul(0.03));
      const holeR = mix(float(0.09), float(0.16), fract(holeSeed.mul(3.1)));
      const on = holeSeed.lessThan(uniforms.sailHoles).select(float(1), float(0));
      out.assign(
        vec2(
          smoothstep(holeR.add(0.01), holeR.sub(0.01), holeD),
          smoothstep(holeR.add(0.12), holeR, holeD),
        ).mul(on),
      );
    });
    return out;
  })();
  const torn = holes.x;
  const charred = holes.y;
  m.colorNode = cloth
    .mul(color(0xffe0a8))
    .mul(belly.mul(0.06).add(0.9))
    .mul(wear)
    .mul(float(1).sub(charred.mul(0.6)))
    .mul(float(1).sub(torn.mul(0.92)));
  m.emissiveNode = cloth
    .mul(color(0xffe2b0))
    .mul(backlit.mul(world.sunDir.y.smoothstep(0.02, 0.45)).mul(0.09))
    .mul(float(1).sub(torn));
  return plainShadowColor(m);
}
