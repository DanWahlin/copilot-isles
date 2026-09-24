import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import { DEFAULT_SAIL_PALETTE, SAIL_PALETTES, sailPalette, type SailPalette } from '../ship/sail-palettes';
import { world } from '../uniforms';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village';
import { cylinder, merge, paint, plank, TRIM, worldUv } from './geo';
import { createSparkleMaterial, shaftGeometry, starGeometry } from './sparkle';

export interface PaletteStandSite {
  group: Group;
  /** Where the player stands to use it (in front of the board), world space, y = ground. */
  readonly spot: { x: number; y: number; z: number; heading: number };
  setPalette(id: string): void;
  setHint(on: boolean): void;
  update(dt: number, t: number): void;
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  anchors: Record<string, VillageAnchor>;
  excludes(x: number, z: number): boolean;
  dispose(): void;
}

export function createPaletteStand(o: {
  tier: TierSettings;
  kit: VillageKit;
  ground: (x: number, z: number) => number;
}): PaletteStandSite {
  const group = new Group();
  group.name = 'palette stand (Q0.2)';
  const groundY = o.ground(STAND.x, STAND.z);
  const spotPos = localToWorld(STAND, 0, 1.75);
  const spot = {
    x: spotPos.x,
    y: o.ground(spotPos.x, spotPos.z),
    z: spotPos.z,
    heading: STAND.rot + Math.PI,
  };
  const atlas = createPaletteAtlas();

  const woodMesh = new Mesh(buildWood(groundY), o.kit.materials.wood);
  woodMesh.name = 'palette stand timber';
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  const atlasMesh = new Mesh(buildAtlasGeometry(atlas.rects, groundY), atlas.material);
  atlasMesh.name = 'palette stand labels';
  atlasMesh.castShadow = true;
  atlasMesh.receiveShadow = true;

  let selected = sailPalette(DEFAULT_SAIL_PALETTE);
  let cloth = buildCloth(groundY, selected.id);
  const clothMesh = new Mesh(cloth.geometry, o.kit.materials.cloth);
  clothMesh.name = 'palette stand swatches and sample sail';
  clothMesh.castShadow = true;
  clothMesh.receiveShadow = true;

  const sparkle = createSparkleMaterial();
  const hintGeometry = merge([
    shaftGeometry(1.45, 0.34, { rgb: [1, 0.93, 0.72], strength: 0.95 }),
    starGeometry(0.28, { rgb: [1, 0.97, 0.82], strength: 1.35 }).translate(0, 0.22, 0),
  ]);
  const hint = new Mesh(hintGeometry, sparkle);
  hint.name = 'palette stand hint sparkle';
  hint.position.set(STAND.x, groundY + 0.65, STAND.z - 0.05);
  hint.visible = false;

  group.add(woodMesh, clothMesh, atlasMesh, hint);

  return {
    group,
    spot,
    colliders: {
      circles: [
        { x: STAND.x, z: STAND.z, r: 1.1 },
        { x: MAST.x, z: MAST.z, r: 0.3 },
      ],
      boxes: [{ x: STAND.x, z: STAND.z, hx: 1.3, hz: 0.5, rot: STAND.rot, height: 2.45 }],
    },
    anchors: {
      paletteStand: spot,
    },
    setPalette(id) {
      selected = sailPalette(id);
      const next = buildCloth(groundY, selected.id);
      clothMesh.geometry.dispose();
      clothMesh.geometry = next.geometry;
      cloth = next;
    },
    setHint(on) {
      hint.visible = on;
    },
    update(_dt, t) {
      updateSampleSail(cloth, t);
      const pulse = 0.9 + Math.sin(t * 4.2) * 0.08;
      hint.scale.setScalar(pulse);
    },
    excludes(x, z) {
      return Math.hypot(x - STAND.x, z - STAND.z) < 1.55 || Math.hypot(x - MAST.x, z - MAST.z) < 0.75;
    },
    dispose() {
      woodMesh.geometry.dispose();
      clothMesh.geometry.dispose();
      atlasMesh.geometry.dispose();
      atlas.dispose();
      hintGeometry.dispose();
      sparkle.dispose();
      group.removeFromParent();
    },
  };
}

interface StandPose {
  x: number;
  z: number;
  rot: number;
}

interface Atlas {
  material: MeshStandardNodeMaterial;
  rects: Record<string, Rect>;
  dispose(): void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ClothBuild {
  geometry: BufferGeometry;
  sampleStart: number;
  sampleCount: number;
  sampleBase: Float32Array;
  sampleColorStart: number;
}

const STAND: StandPose = { x: -100.0, z: -70.75, rot: 1.1 };
// Beside the board's left post (clear of the top plank), not tucked behind it.
const MAST: StandPose = { ...localToWorld(STAND, -1.75, 0.05), rot: STAND.rot };
const BOARD_Y = 0.38;
const CARD_W = 0.56;
const CARD_H = 0.48;
const CARD_X0 = -0.58;
const CARD_STEP_X = 0.58;
const SAMPLE_W = 0.9;
const SAMPLE_H = 0.9;
const BLUE = 0x0969da;
const tmpQ = new Quaternion();
const tmpC = new Color();
const tmpM = new Matrix4();

function buildWood(y: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const lx of [-0.98, 0.98]) {
    const foot = localToWorld(STAND, lx, 0);
    parts.push(plank(0.14, 1.94, 0.14, { x: foot.x, y, z: foot.z, ry: STAND.rot }, 0xeedbc0, TRIM.dark));
  }
  for (const lx of [-0.78, 0.78]) {
    const top = localToWorld(STAND, lx, 0.02);
    const foot = localToWorld(STAND, lx * 1.05, -0.72);
    parts.push(
      tubeBetween(
        0.055,
        { x: foot.x, y: y + 0.05, z: foot.z },
        { x: top.x, y: y + 1.78, z: top.z },
        0xd8b996,
        7,
      ),
    );
  }
  for (const ly of [0.42, 1.12, 1.88]) {
    const p = localToWorld(STAND, 0, 0);
    parts.push(plank(2.22, 0.12, 0.16, { x: p.x, y: y + ly, z: p.z, ry: STAND.rot }, 0xf2dfc5, TRIM.light));
  }
  const header = localToWorld(STAND, 0, -0.03);
  parts.push(
    plank(2.26, 0.18, 0.22, { x: header.x, y: y + 2.1, z: header.z, ry: STAND.rot }, 0xd1a474, TRIM.light),
  );
  const shelf = localToWorld(STAND, 0, 0.36);
  parts.push(
    plank(2.3, 0.12, 0.36, { x: shelf.x, y: y + 0.26, z: shelf.z, ry: STAND.rot }, 0xd6b58d, TRIM.dark),
  );
  const footBrace = localToWorld(STAND, 0, -0.7);
  parts.push(
    plank(
      1.95,
      0.1,
      0.1,
      { x: footBrace.x, y: y + 0.08, z: footBrace.z, ry: STAND.rot },
      0xc79a72,
      TRIM.dark,
    ),
  );
  const mastBase = localToWorld(MAST, 0, 0);
  parts.push(worldUv(cylinder(0.06, 0.08, 2.35, { x: mastBase.x, y, z: mastBase.z }, 0xb98a5e, 8), 0.8));
  parts.push(
    plank(1.05, 0.06, 0.06, { x: mastBase.x, y: y + 1.85, z: mastBase.z, ry: MAST.rot }, 0xd8b996, TRIM.dark),
  );
  for (const [lx, color] of [
    [-0.86, 0xc85a34],
    [-0.63, 0x2f7f86],
    [0.72, 0xd1b03b],
  ] as const) {
    const p = localToWorld(STAND, lx, 0.55);
    parts.push(cylinder(0.1, 0.11, 0.24, { x: p.x, y: y + 0.28, z: p.z }, color, 10));
  }
  for (const lx of [-0.2, 0.1]) {
    const a = localToWorld(STAND, lx, 0.5);
    const b = localToWorld(STAND, lx + 0.34, 0.68);
    parts.push(
      tubeBetween(0.014, { x: a.x, y: y + 0.46, z: a.z }, { x: b.x, y: y + 0.55, z: b.z }, 0xc9aa7a, 5),
    );
  }
  return merge(parts);
}

function buildCloth(y: number, selectedId: string): ClothBuild {
  const builder = new MeshBuild();
  const positionsBeforeSample = () => builder.positions.length / 3;
  for (let i = 0; i < SAIL_PALETTES.length; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const lx = CARD_X0 + col * CARD_STEP_X;
    const ly = 1.52 - row * 0.66;
    const center = boardPoint(lx, ly, 0.18, y);
    addMiniSail(builder, center, SAIL_PALETTES[i]!, 0.42, 0.36);
    if (SAIL_PALETTES[i]!.id === selectedId)
      addFrame(builder, center, CARD_W * 0.92, CARD_H * 0.78, linearHex(BLUE));
  }
  const sampleStart = positionsBeforeSample();
  addSampleSail(builder, y, sailPalette(selectedId));
  const sampleCount = builder.positions.length / 3 - sampleStart;
  const geometry = builder.geometry();
  const sampleBase = (geometry.getAttribute('position') as BufferAttribute).array.slice(
    sampleStart * 3,
    (sampleStart + sampleCount) * 3,
  ) as Float32Array;
  return { geometry, sampleStart, sampleCount, sampleBase, sampleColorStart: sampleStart };
}

function addMiniSail(builder: MeshBuild, center: Vector3, p: SailPalette, w: number, h: number): void {
  const right = localRight(STAND.rot, w * 0.5);
  const up = new Vector3(0, h * 0.5, 0);
  builder.color(0x8a5b33);
  const yard = center
    .clone()
    .add(up)
    .add(new Vector3(0, 0.035, 0));
  builder.quad(
    yard
      .clone()
      .sub(localRight(STAND.rot, w * 0.58))
      .sub(new Vector3(0, 0.012, 0)),
    yard
      .clone()
      .add(localRight(STAND.rot, w * 0.58))
      .sub(new Vector3(0, 0.012, 0)),
    yard
      .clone()
      .add(localRight(STAND.rot, w * 0.58))
      .add(new Vector3(0, 0.012, 0)),
    yard
      .clone()
      .sub(localRight(STAND.rot, w * 0.58))
      .add(new Vector3(0, 0.012, 0)),
  );
  builder.color(linearHex(p.cloth));
  builder.quad(
    center.clone().sub(right).sub(up),
    center.clone().add(right).sub(up),
    center.clone().add(right).add(up),
    center.clone().sub(right).add(up),
  );
  const bandHalf = new Vector3(0, h * 0.06, 0);
  // Nudged toward the viewer so the band doesn't z-fight the cloth.
  const band = center
    .clone()
    .sub(up)
    .add(new Vector3(0, h * 0.23, 0))
    .add(localForward(STAND.rot, 0.004));
  builder.color(linearHex(p.stripe));
  builder.quad(
    band.clone().sub(right).sub(bandHalf),
    band.clone().add(right).sub(bandHalf),
    band.clone().add(right).add(bandHalf),
    band.clone().sub(right).add(bandHalf),
  );
}

function addFrame(builder: MeshBuild, center: Vector3, w: number, h: number, color: number): void {
  const rw = 0.03;
  const right = localRight(STAND.rot, w * 0.5);
  const up = new Vector3(0, h * 0.5, 0);
  builder.color(color);
  for (const y of [-1, 1] as const) {
    const c = center.clone().add(up.clone().multiplyScalar(y));
    builder.quad(
      c.clone().sub(right),
      c.clone().add(right),
      c
        .clone()
        .add(right)
        .add(new Vector3(0, rw * y, 0)),
      c
        .clone()
        .sub(right)
        .add(new Vector3(0, rw * y, 0)),
    );
  }
  for (const x of [-1, 1] as const) {
    const r = right.clone().multiplyScalar(x);
    builder.quad(
      center.clone().add(r).sub(up),
      center.clone().add(r).add(up),
      center
        .clone()
        .add(r)
        .add(up)
        .add(localRight(STAND.rot, rw * x)),
      center
        .clone()
        .add(r)
        .sub(up)
        .add(localRight(STAND.rot, rw * x)),
    );
  }
}

// Rows of the sample sail, foot to head. The band edges are doubled so the stripe has crisp edges.
const SAMPLE_V = [0, 0.17, 0.17, 0.29, 0.29, 0.62, 1] as const;
const SAMPLE_COLS = 5;
const sampleRowIsBand = (row: number) => row === 2 || row === 3;

function addSampleSail(builder: MeshBuild, y: number, p: SailPalette): void {
  const cols = SAMPLE_COLS;
  const rows = SAMPLE_V.length - 1;
  const base = localToWorld(MAST, 0, 0.12);
  const origin = new Vector3(base.x, y + 0.9, base.z);
  const right = localRight(MAST.rot, SAMPLE_W);
  const up = new Vector3(0, SAMPLE_H, 0);
  const start = builder.positions.length / 3;
  for (let row = 0; row <= rows; row += 1) {
    const v = SAMPLE_V[row]!;
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      const p0 = origin
        .clone()
        .add(right.clone().multiplyScalar(u - 0.5))
        .add(up.clone().multiplyScalar(v));
      builder.vertex(p0, linearHex(sampleRowIsBand(row) ? p.stripe : p.cloth));
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = start + row * (cols + 1) + col;
      builder.indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
    }
  }
}

// Colours are baked by buildCloth (rebuilt on setPalette); only the billow moves per frame.
function updateSampleSail(build: ClothBuild, t: number): void {
  const pos = build.geometry.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < build.sampleCount; i += 1) {
    const base = i * 3;
    const x = build.sampleBase[base]!;
    const y = build.sampleBase[base + 1]!;
    const z = build.sampleBase[base + 2]!;
    const row = Math.floor(i / (SAMPLE_COLS + 1));
    const u = (i % (SAMPLE_COLS + 1)) / SAMPLE_COLS;
    const v = SAMPLE_V[row]!;
    const wave = Math.sin(t * 2.1 + u * 4 + world.windSpeed.value * 0.11) * 0.055 * u;
    pos.setXYZ(build.sampleStart + i, x, y + Math.sin(t * 1.2 + v * 2.7) * 0.012, z + wave);
  }
  pos.needsUpdate = true;
}

function createPaletteAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const rects: Record<string, Rect> = { header: { x: 0, y: 0, w: 1024, h: 150 } };
  ctx.fillStyle = '#9a6b43';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = '#f5e7c6';
  ctx.font = '800 54px ui-serif, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PICK YOUR SAILS', 512, 78);
  for (let i = 0; i < SAIL_PALETTES.length; i += 1) {
    const p = SAIL_PALETTES[i]!;
    const x = (i % 3) * 341;
    const y = 180 + Math.floor(i / 3) * 360;
    const rect = { x, y, w: 330, h: 300 };
    rects[p.id] = rect;
    ctx.fillStyle = '#d5a878';
    roundRect(ctx, x + 14, y + 10, 302, 238, 22);
    ctx.fill();
    ctx.strokeStyle = '#76502f';
    ctx.lineWidth = 8;
    roundRect(ctx, x + 14, y + 10, 302, 238, 22);
    ctx.stroke();
    ctx.font = '700 36px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#2c1c12';
    ctx.fillText(p.name, x + 165, y + 276);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  // Front-facing like the other painted signs, so it shares their program.
  const material = new MeshStandardNodeMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  return {
    material,
    rects,
    dispose() {
      tex.dispose();
      material.dispose();
    },
  };
}

function buildAtlasGeometry(rects: Record<string, Rect>, y: number): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const add = (p: Vector3, u: number, v: number) => {
    const i = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
    return i;
  };
  const plane = (center: Vector3, w: number, h: number, rect: Rect) => {
    const right = localRight(STAND.rot, w * 0.5);
    const up = new Vector3(0, h * 0.5, 0);
    const u0 = rect.x / 1024;
    const v0 = 1 - (rect.y + rect.h) / 1024;
    const u1 = (rect.x + rect.w) / 1024;
    const v1 = 1 - rect.y / 1024;
    const a = add(center.clone().sub(right).sub(up), u0, v0);
    const b = add(center.clone().add(right).sub(up), u1, v0);
    const c = add(center.clone().add(right).add(up), u1, v1);
    const d = add(center.clone().sub(right).add(up), u0, v1);
    idx.push(a, b, d, b, c, d);
  };
  plane(boardPoint(0, 2.1, 0.2, y), 2.08, 0.27, rects.header!);
  for (let i = 0; i < SAIL_PALETTES.length; i += 1) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    plane(
      boardPoint(CARD_X0 + col * CARD_STEP_X, 1.52 - row * 0.66, 0.16, y),
      0.55,
      0.5,
      rects[SAIL_PALETTES[i]!.id]!,
    );
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class MeshBuild {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  private tint = 0xffffff;
  color(c: number): void {
    this.tint = c;
  }
  vertex(p: Vector3, c = this.tint): number {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.uvs.push(p.x * 0.5, p.y * 0.5);
    this.colors.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
    return i;
  }
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3): void {
    const i = this.vertex(a);
    this.vertex(b);
    this.vertex(c);
    this.vertex(d);
    this.indices.push(i, i + 1, i + 3, i + 1, i + 2, i + 3);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    return g;
  }
}

function boardPoint(lx: number, ly: number, lz: number, y: number): Vector3 {
  const p = localToWorld(STAND, lx, lz);
  return new Vector3(p.x, y + BOARD_Y + ly, p.z);
}

function localToWorld(o: StandPose, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

function localRight(rot: number, amount: number): Vector3 {
  return new Vector3(Math.cos(rot) * amount, 0, -Math.sin(rot) * amount);
}

function localForward(rot: number, amount: number): Vector3 {
  return new Vector3(Math.sin(rot) * amount, 0, Math.cos(rot) * amount);
}

/**
 * Kit vertex colours are raw hex/255, but the ship feeds its sail palette through `Color` (sRGB → linear).
 * Palette colours go through the same conversion here so the swatches match the sails you'll get.
 */
function linearHex(hex: number): number {
  tmpC.setHex(hex);
  const b = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return (b(tmpC.r) << 16) | (b(tmpC.g) << 8) | b(tmpC.b);
}

function tubeBetween(
  radius: number,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  tint: number,
  segments: number,
): BufferGeometry {
  const va = new Vector3(a.x, a.y, a.z);
  const vb = new Vector3(b.x, b.y, b.z);
  const dir = vb.clone().sub(va);
  const len = Math.max(0.03, dir.length());
  const g = new CylinderGeometry(radius, radius, len, segments, 1);
  tmpQ.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  tmpM.compose(va.add(vb).multiplyScalar(0.5), tmpQ, new Vector3(1, 1, 1));
  g.applyMatrix4(tmpM);
  worldUv(g, 0.8);
  return paint(g, tint);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
