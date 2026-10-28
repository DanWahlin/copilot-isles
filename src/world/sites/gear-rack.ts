import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village/kit';
import { UvQuadBuilder, box, cylinder, merge, paint, plank, poseFrame, TRIM, tubeBetween } from './geo';
import { COVE } from '../layout';
import { GEAR_IDS, gearDef, type GearId } from './gear-logic';
import { palettedMaterial } from '../characters/stage-light';

export interface GearRackSite {
  readonly group: Group;
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  /** `gearRack` (stand here, facing the rack) and `boRack` (Bo, beside it, facing the pier foot). */
  readonly anchors: Record<string, VillageAnchor>;
  /** The rack's centre, for its interaction prompt. */
  spots(): { rack: Vector3 };
  excludes(x: number, z: number): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * Bo's gear rack, as scenery beside him on the quay: one piece of gear per tool the course's
 * checklist checks, each over a plaque with the tool's name and its version command, under a header
 * saying where the checks run.
 */
export function createGearRack(o: {
  tier: TierSettings;
  kit: VillageKit;
  ground: (x: number, z: number) => number;
}): GearRackSite {
  const detail = detailForTier(o.tier);
  const group = new Group();
  group.name = 'gear rack';

  const atlas = createTextAtlas();
  const signMesh = new Mesh(createTextGeometry(atlas.rects, groundAt), atlas.material);
  signMesh.name = 'gear rack plaques';
  signMesh.castShadow = true;
  signMesh.receiveShadow = true;
  group.add(signMesh);

  const materials: Record<BucketKey, Material> = {
    wood: o.kit.materials.wood,
    metal: o.kit.materials.metal,
    rope: o.kit.materials.rope,
    glow: o.kit.materials.glow,
    cloth: o.kit.materials.cloth,
  };
  const meshes: Mesh[] = [];
  const buckets = makeBuckets();
  addStaticRack(buckets, detail);
  for (const id of GEAR_IDS) addGear(buckets, id, hungPose(id), true, detail);
  for (const key of BUCKET_KEYS) {
    const parts = buckets[key];
    if (parts.length === 0) continue;
    const mesh = new Mesh(merge(parts), materials[key]);
    mesh.name = `gear rack ${key}`;
    mesh.castShadow = key !== 'glow';
    mesh.receiveShadow = key !== 'glow';
    group.add(mesh);
    meshes.push(mesh);
  }

  const colliders = {
    circles: [{ x: RACK.x, z: RACK.z, r: 1.2 }],
    boxes: [{ x: RACK.x, z: RACK.z, hx: 1.05, hz: 0.28, rot: RACK.rot, height: 2.1 }],
  };
  const rackAnchor = anchorFromLocal(RACK, 0, -1.55);
  rackAnchor.y = groundAt(rackAnchor.x, rackAnchor.z);
  // Off the rack's left end, so he doesn't hide the plaques, facing out (its front is local −z).
  const bo = anchorFromLocal(RACK, -1.55, -0.95);
  const anchors = {
    gearRack: rackAnchor,
    boRack: { x: bo.x, y: groundAt(bo.x, bo.z), z: bo.z, heading: RACK.rot + Math.PI - 0.25 },
  } satisfies Record<string, VillageAnchor>;

  return {
    group,
    colliders,
    anchors,
    spots() {
      return { rack: vectorAt(RACK.x, groundAt(RACK.x, RACK.z) + 1.05, RACK.z) };
    },
    excludes(x, z) {
      return Math.hypot(x - RACK.x, z - RACK.z) < 1.6;
    },
    update() {},
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      signMesh.geometry.dispose();
      atlas.dispose();
      group.removeFromParent();
    },
  };

  function groundAt(x: number, z: number): number {
    return o.ground(x, z);
  }

  function hungPose(id: GearId): Pose {
    const p = poseFrame(RACK).toWorld(gearHookX(id), -0.25);
    return { x: p.x, y: groundAt(RACK.x, RACK.z) + 1.04, z: p.z, rot: RACK.rot, hung: true };
  }

  function addStaticRack(buckets: Buckets, detail: Detail): void {
    const y = groundAt(RACK.x, RACK.z);
    for (const sx of [-1, 1] as const) {
      const foot = poseFrame(RACK).toWorld(sx * 1.0, 0.08);
      buckets.wood.push(plank(0.13, 1.95, 0.13, { x: foot.x, y, z: foot.z, ry: RACK.rot }, WOOD, TRIM.dark));
    }
    for (const ly of [0.62, 1.42, 1.84]) {
      const p = poseFrame(RACK).toWorld(0, 0);
      buckets.wood.push(
        plank(2.15, 0.12, 0.16, { x: p.x, y: y + ly, z: p.z, ry: RACK.rot }, WOOD, TRIM.light),
      );
    }
    const roof = poseFrame(RACK).toWorld(0, 0.08);
    buckets.wood.push(
      plank(
        2.36,
        0.16,
        0.76,
        { x: roof.x, y: y + 2.0, z: roof.z, ry: RACK.rot, rx: 0.16 },
        0xe7d1b5,
        TRIM.light,
      ),
    );
    for (let i = 0; i < GEAR_IDS.length; i += 1) {
      const p = poseFrame(RACK).toWorld(gearHookX(GEAR_IDS[i]!), -0.18);
      buckets.metal.push(
        tubeBetween(
          0.018,
          { x: p.x, y: y + 1.47, z: p.z },
          { x: p.x, y: y + 1.26, z: p.z - 0.12 },
          IRON,
          detail.cyl,
        ),
      );
      buckets.metal.push(
        torus(0.055, 0.012, { x: p.x, y: y + 1.25, z: p.z - 0.14, rx: Math.PI / 2 }, IRON, 10),
      );
    }
  }
}

type BucketKey = 'wood' | 'metal' | 'rope' | 'glow' | 'cloth';
type Buckets = Record<BucketKey, BufferGeometry[]>;
type Pose = { x: number; y: number; z: number; rot: number; hung: boolean };
type Detail = { cyl: number };

const BUCKET_KEYS = ['wood', 'metal', 'rope', 'glow', 'cloth'] as const satisfies readonly BucketKey[];
const WOOD = 0xf0ddc4;
const WOOD_DARK = 0xd1b592;
const BRASS = 0xd9b65a;
const IRON = 0x6f6962;
const ROPE = 0xd6bc8e;
const GLASS = 0x9fd2dc;
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpE = new Euler();

const RACK = COVE.gearRack;

function detailForTier(tier: TierSettings): Detail {
  return { cyl: tier.tier === 'lite' ? 8 : tier.tier === 'low' ? 10 : 12 };
}

function gearHookX(id: GearId): number {
  return -0.78 + GEAR_IDS.indexOf(id) * 0.52;
}

function makeBuckets(): Buckets {
  return { wood: [], metal: [], rope: [], glow: [], cloth: [] };
}

function vectorAt(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function anchorFromLocal(o: { x: number; z: number; rot: number }, lx: number, lz: number): VillageAnchor {
  const p = poseFrame(o).toWorld(lx, lz);
  return { x: p.x, y: 0, z: p.z, heading: o.rot };
}

function addGear(b: Buckets, id: GearId, p: Pose, vertical: boolean, detail: Detail): void {
  if (id === 'compass') addCompass(b, p, vertical, detail);
  else if (id === 'lantern') addLantern(b, p, vertical, detail);
  else if (id === 'rope') addRope(b, p);
  else addSpyglass(b, p, vertical, detail);
}

function addCompass(b: Buckets, p: Pose, vertical: boolean, detail: Detail): void {
  const y = p.y + (vertical ? 0 : 0.03);
  b.metal.push(
    cylinder(
      0.21,
      0.24,
      0.08,
      { x: p.x, y, z: p.z, ry: p.rot, rx: vertical ? Math.PI / 2 : 0 },
      BRASS,
      detail.cyl,
    ),
  );
  b.metal.push(
    torus(
      0.22,
      0.025,
      { x: p.x, y: y + 0.06, z: p.z, rx: vertical ? 0 : Math.PI / 2, ry: p.rot },
      0xf2d47a,
      16,
    ),
  );
  b.glow.push(
    cylinder(
      0.18,
      0.18,
      0.018,
      { x: p.x, y: y + 0.075, z: p.z, ry: p.rot, rx: vertical ? Math.PI / 2 : 0 },
      GLASS,
      detail.cyl,
    ),
  );
  b.metal.push(box(0.03, 0.014, 0.28, { x: p.x, y: y + 0.09, z: p.z, ry: p.rot + 0.7 }, 0xa03024, 1, true));
  b.metal.push(
    box(0.03, 0.014, 0.18, { x: p.x, y: y + 0.095, z: p.z, ry: p.rot + Math.PI / 2 }, 0xf3e0a0, 1, true),
  );
}

/** The rack's lantern (the gear you set on its shelf): a standing lantern with a carrying ring. */
export function addLantern(b: Buckets, p: Pose, _vertical: boolean, detail: Detail): void {
  const y = p.y + 0.04;
  const w = 0.28;
  // Offsets in the lantern's frame, turned with it (each part used to turn on its own middle).
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const at = (lx: number, lz: number, py: number) => ({
    x: p.x + lx * c + lz * s,
    y: py,
    z: p.z - lx * s + lz * c,
    ry: p.rot,
  });
  b.metal.push(box(w, 0.035, w, at(0, 0, y), IRON, 1, true));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.metal.push(box(0.028, 0.42, 0.028, at(sx * 0.12, sz * 0.12, y + 0.02), IRON, 1, true));
  // The panes' edges are let into the corner posts, and the candle stands on the base (both floated).
  for (const side of [-1, 1]) {
    b.glow.push(box(0.22, 0.31, 0.018, at(0, side * 0.12, y + 0.08), 0xffc987, 1, true));
    b.glow.push(box(0.018, 0.31, 0.22, at(side * 0.12, 0, y + 0.08), 0xffc987, 1, true));
  }
  b.glow.push(box(0.05, 0.13, 0.05, at(0, 0, y + 0.03), 0xff9c45, 1, true));
  b.metal.push(coneCap(p.x, y + 0.43, p.z, p.rot, 0.2, 0.12, IRON));
  // The carrying ring stands on the cap's tip (it lay flat round the tip, touching nothing).
  b.metal.push(torus(0.09, 0.012, { x: p.x, y: y + 0.55 + 0.098, z: p.z, ry: p.rot }, 0x74695f, detail.cyl));
}

function addRope(b: Buckets, p: Pose): void {
  if (p.hung) {
    for (let i = 0; i < 3; i += 1) {
      b.rope.push(
        torus(
          0.16 - i * 0.026,
          0.024,
          { x: p.x, y: p.y + 0.2 - i * 0.055, z: p.z + 0.015 * i, ry: p.rot },
          ROPE,
          16,
        ),
      );
    }
    b.rope.push(
      tubeBetween(0.018, { x: p.x, y: p.y + 0.42, z: p.z }, { x: p.x, y: p.y + 0.28, z: p.z }, ROPE, 6),
    );
    return;
  }
  for (let i = 0; i < 4; i += 1) {
    const r = 0.24 - i * 0.038;
    b.rope.push(
      torus(r, 0.032, { x: p.x, y: p.y + 0.055 + i * 0.012, z: p.z, rx: Math.PI / 2, ry: p.rot }, ROPE, 18),
    );
  }
  b.rope.push(
    tubeBetween(
      0.025,
      { x: p.x + 0.15, y: p.y + 0.08, z: p.z - 0.2 },
      { x: p.x + 0.52, y: p.y + 0.08, z: p.z - 0.34 },
      ROPE,
      6,
    ),
  );
}

function addSpyglass(b: Buckets, p: Pose, vertical: boolean, detail: Detail): void {
  if (!vertical) {
    b.wood.push(
      plank(0.42, 0.32, 0.36, { x: p.x - 0.1, y: p.y, z: p.z + 0.12, ry: p.rot }, WOOD_DARK, TRIM.dark),
    );
  }
  const y = p.y + (vertical ? 0.02 : 0.34);
  const baseRot = p.rot + (vertical ? Math.PI / 2 : 0.2);
  const half = vertical ? 0.36 : 0.46;
  const a = { x: p.x - Math.cos(baseRot) * half, y, z: p.z + Math.sin(baseRot) * half };
  const c = {
    x: p.x + Math.cos(baseRot) * half,
    y: y + (vertical ? 0.04 : 0.24),
    z: p.z - Math.sin(baseRot) * half,
  };
  b.metal.push(tubeBetween(vertical ? 0.07 : 0.09, a, c, 0xf0c768, detail.cyl));
  b.metal.push(
    tubeBetween(
      vertical ? 0.05 : 0.07,
      { x: p.x - Math.cos(baseRot) * (half + 0.22), y, z: p.z + Math.sin(baseRot) * (half + 0.22) },
      a,
      0xf7d47a,
      detail.cyl,
    ),
  );
  b.metal.push(
    tubeBetween(
      vertical ? 0.09 : 0.12,
      c,
      { x: p.x + Math.cos(baseRot) * (half + 0.2), y: c.y + 0.04, z: p.z - Math.sin(baseRot) * (half + 0.2) },
      0xf0c768,
      detail.cyl,
    ),
  );
  for (const t of [-0.22, 0.18]) {
    const bx = p.x + Math.cos(baseRot) * t;
    const bz = p.z - Math.sin(baseRot) * t;
    b.metal.push(
      torus(0.08, 0.016, { x: bx, y: y + 0.025, z: bz, ry: baseRot, rz: Math.PI / 2 }, 0x6f4128, detail.cyl),
    );
  }
  b.glow.push(
    cylinder(
      0.075,
      0.075,
      0.018,
      { x: c.x, y: c.y, z: c.z, ry: baseRot, rx: Math.PI / 2 },
      0xc8f1ff,
      detail.cyl,
    ),
  );
}

function torus(
  r: number,
  tube: number,
  p: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number },
  tint: number,
  seg = 14,
): BufferGeometry {
  const g = new TorusGeometry(r, tube, 6, seg);
  transformGeometry(g, p.x, p.y, p.z, p.ry ?? 0, p.rx ?? 0, p.rz ?? 0);
  return paint(g, tint);
}

function coneCap(
  x: number,
  y: number,
  z: number,
  rot: number,
  r: number,
  h: number,
  tint: number,
): BufferGeometry {
  const g = new ConeGeometry(r, h, 4, 1);
  transformGeometry(g, x, y + h * 0.5, z, rot + Math.PI / 4, 0, 0);
  return paint(g, tint);
}

function transformGeometry(
  g: BufferGeometry,
  x: number,
  y: number,
  z: number,
  ry: number,
  rx: number,
  rz: number,
): void {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'XYZ'));
  tmpM.compose(new Vector3(x, y, z), tmpQ, new Vector3(1, 1, 1));
  g.applyMatrix4(tmpM);
}

interface TextAtlas {
  readonly material: MeshStandardNodeMaterial;
  readonly rects: Record<GearId | 'header', Rect>;
  dispose(): void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INK = '#2c1c12';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * One 1024² canvas: a plaque per tool (its name, and the version command beneath) and the header
 * board, sized so they read from a few metres away.
 */
function createTextAtlas(): TextAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const rects = {
    compass: { x: 0, y: 0, w: 512, h: 272 },
    lantern: { x: 512, y: 0, w: 512, h: 272 },
    rope: { x: 0, y: 272, w: 512, h: 272 },
    spyglass: { x: 512, y: 272, w: 512, h: 272 },
    header: { x: 0, y: 544, w: 1024, h: 160 },
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  // The atlas as a palette, like the other painted signs: their shadows share one plain shader.
  const material = palettedMaterial(
    new MeshStandardNodeMaterial({
      map: texture,
      roughness: 0.86,
      metalness: 0,
      side: DoubleSide,
    }),
  );
  for (const id of GEAR_IDS) drawPlaque(ctx, rects[id], gearDef(id).tool, gearDef(id).command);
  drawHeader(ctx, rects.header);
  texture.needsUpdate = true;
  return {
    material,
    rects,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

function board(ctx: CanvasRenderingContext2D, r: Rect, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#5b3216';
  ctx.lineWidth = 12;
  ctx.strokeRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20);
}

/** Fits `text` in `max` pixels, shrinking from `size`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  size: number,
  family: string,
  max: number,
): void {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 20 && ctx.measureText(text).width > max) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

function drawPlaque(ctx: CanvasRenderingContext2D, r: Rect, tool: string, command: string): void {
  board(ctx, r, '#d9b06a');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  fitFont(ctx, tool, '700', 96, 'Georgia, serif', r.w - 60);
  ctx.fillText(tool, r.x + r.w / 2, r.y + r.h * 0.37);
  ctx.fillStyle = '#4a2a14';
  fitFont(ctx, command, '700', 58, MONO, r.w - 60);
  ctx.fillText(command, r.x + r.w / 2, r.y + r.h * 0.72);
}

function drawHeader(ctx: CanvasRenderingContext2D, r: Rect): void {
  board(ctx, r, '#e6c98f');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  fitFont(ctx, 'GEAR CHECK', '700', 84, 'Georgia, serif', r.w - 80);
  ctx.fillText('GEAR CHECK', r.x + r.w / 2, r.y + r.h * 0.4);
  ctx.fillStyle = '#4a2a14';
  const sub = 'Run each check in the app’s Terminal tab';
  fitFont(ctx, sub, 'italic 600', 42, 'Georgia, serif', r.w - 80);
  ctx.fillText(sub, r.x + r.w / 2, r.y + r.h * 0.76);
}

function createTextGeometry(
  rects: TextAtlas['rects'],
  ground: (x: number, z: number) => number,
): BufferGeometry {
  const quads = new UvQuadBuilder();
  const rackY = ground(RACK.x, RACK.z);
  const frame = poseFrame(RACK);
  // The rack's front is local −z, so `right` runs toward local −x for the text to read from there.
  for (const id of GEAR_IDS) {
    const p = frame.toWorld(gearHookX(id), -0.27);
    quads.plane(new Vector3(p.x, rackY + 0.64, p.z), frame.right(-0.245), new Vector3(0, 0.13, 0), rects[id]);
  }
  const h = frame.toWorld(0, -0.1);
  quads.plane(
    new Vector3(h.x, rackY + 1.66, h.z),
    frame.right(-0.95),
    new Vector3(0, 0.148, 0),
    rects.header,
  );
  return quads.geometry();
}
