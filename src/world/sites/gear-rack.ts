import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
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
import type { VillageAnchor, VillageBoxCollider, VillageKit } from '../village';
import { box, cylinder, merge, paint, plank, TRIM, worldUv } from './geo';
import { createSparkleMaterial, shaftGeometry, starGeometry } from './sparkle';

export type GearId = 'compass' | 'lantern' | 'rope' | 'spyglass';
export type LooseId = GearId | 'lens';

export interface GearRackSite {
  readonly group: Group;
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  /** At least `gearRack` (stand here, facing the rack) and `gearLedger` (facing the lectern). */
  readonly anchors: Record<string, VillageAnchor>;
  /** World points for the interaction prompts: the rack's centre, the ledger, and each loose piece where it lies. */
  spots(): { rack: Vector3; ledger: Vector3; loose: Record<LooseId, Vector3> };
  /** A loose piece lying in the village: shown until it's picked up. */
  setLoose(id: LooseId, visible: boolean): void;
  /** Hang (or clear) a piece on its own hook. `animate` gives it a short settle-and-swing. */
  setHung(id: GearId, hung: boolean, animate?: boolean): void;
  /** The spyglass with an empty dark eyepiece (false) or a glinting fitted lens (true), both loose and hung. */
  setLensFitted(fitted: boolean): void;
  /** The ledger page's signature line: a wrong scrawl "someone-else", or "your-handle" in fresh ink. */
  setLedger(state: 'someone-else' | 'you'): void;
  /** A soft light shaft plus glint over one loose piece, for hints (null clears it). */
  setGlint(id: LooseId | null): void;
  excludes(x: number, z: number): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

interface GlintFx {
  readonly mesh: Mesh;
  readonly material: Material;
  readonly baseOpacity: number;
  dispose(): void;
}

export function createGearRack(o: {
  tier: TierSettings;
  kit: VillageKit;
  ground: (x: number, z: number) => number;
}): GearRackSite {
  const detail = detailForTier(o.tier);
  const group = new Group();
  group.name = 'gear rack (Q0.5)';

  const loose: Record<LooseId, boolean> = {
    compass: true,
    lantern: true,
    rope: true,
    spyglass: true,
    lens: true,
  };
  const hung: Record<GearId, boolean> = {
    compass: false,
    lantern: false,
    rope: false,
    spyglass: false,
  };
  let lensFitted = false;
  let glint: LooseId | null = null;
  const settle: Partial<Record<GearId, number>> = {};

  const atlas = createTextAtlas('someone-else');
  const signMesh = new Mesh(createTextGeometry(atlas.rects, groundAt), atlas.material);
  signMesh.name = 'gear rack plaques and ledger';
  signMesh.castShadow = true;
  signMesh.receiveShadow = true;
  group.add(signMesh);
  const glintFx = createGlintFx();
  group.add(glintFx.mesh);

  const meshes: Mesh[] = [];
  const materials: Record<BucketKey, Material> = {
    wood: o.kit.materials.wood,
    metal: o.kit.materials.metal,
    rope: o.kit.materials.rope,
    glow: o.kit.materials.glow,
    cloth: o.kit.materials.cloth,
  };

  const rebuild = () => {
    for (const mesh of meshes.splice(0)) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    const buckets = makeBuckets();
    addStaticRack(buckets, detail);
    for (const id of GEAR_IDS) {
      if (loose[id]) addGear(buckets, id, loosePose(id), false, lensFitted, detail);
      if (hung[id]) addGear(buckets, id, hungPose(id), true, lensFitted, detail);
    }
    if (loose.lens) addLens(buckets, loosePose('lens'), detail);
    updateGlintFx();
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
  };
  rebuild();

  const colliders = {
    circles: [
      { x: RACK.x, z: RACK.z, r: 1.2 },
      { x: LEDGER.x, z: LEDGER.z, r: 0.55 },
    ],
    boxes: [
      { x: RACK.x, z: RACK.z, hx: 1.05, hz: 0.28, rot: RACK.rot, height: 2.1 },
      { x: LEDGER.x, z: LEDGER.z, hx: 0.55, hz: 0.4, rot: LEDGER.rot, height: 1.2 },
    ],
  };
  const rackAnchor = anchorFromLocal(RACK, 0, -1.55);
  rackAnchor.y = groundAt(rackAnchor.x, rackAnchor.z);
  const anchors = {
    gearRack: rackAnchor,
    gearLedger: {
      x: LEDGER.x - Math.sin(LEDGER.rot) * 0.9,
      y: groundAt(LEDGER.x, LEDGER.z),
      z: LEDGER.z - Math.cos(LEDGER.rot) * 0.9,
      heading: LEDGER.rot,
    },
  } satisfies Record<string, VillageAnchor>;

  return {
    group,
    colliders,
    anchors,
    spots() {
      return {
        rack: vectorAt(RACK.x, groundAt(RACK.x, RACK.z) + 1.05, RACK.z),
        ledger: vectorAt(LEDGER.x, groundAt(LEDGER.x, LEDGER.z) + 0.96, LEDGER.z),
        loose: {
          compass: looseVector('compass'),
          lantern: looseVector('lantern'),
          rope: looseVector('rope'),
          spyglass: looseVector('spyglass'),
          lens: looseVector('lens'),
        },
      };
    },
    setLoose(id, visible) {
      loose[id] = visible;
      rebuild();
      updateGlintFx();
    },
    setHung(id, isHung, animate = false) {
      hung[id] = isHung;
      if (animate && isHung) settle[id] = 0.16;
      rebuild();
      updateGlintFx();
    },
    setLensFitted(fitted) {
      lensFitted = fitted;
      rebuild();
    },
    setLedger(state) {
      atlas.redraw(state);
    },
    setGlint(id) {
      glint = id;
      updateGlintFx();
    },
    excludes(x, z) {
      if (Math.hypot(x - RACK.x, z - RACK.z) < 1.6 || Math.hypot(x - LEDGER.x, z - LEDGER.z) < 0.9)
        return true;
      for (const id of LOOSE_IDS) {
        const p = LOOSE[id];
        if (Math.hypot(x - p.x, z - p.z) < (id === 'lens' ? 0.75 : 0.95)) return true;
      }
      return false;
    },
    update(dt, t) {
      let didSettle = false;
      for (const id of GEAR_IDS) {
        if (!settle[id]) continue;
        settle[id] = Math.max(0, settle[id]! - dt * 0.45);
        if (settle[id] === 0) {
          delete settle[id];
          didSettle = true;
        }
      }
      if (didSettle) rebuild();
      glintFx.mesh.scale.setScalar(
        (glintFx.baseOpacity + Math.sin(t * 4.5) * 0.08) * (glint === 'lens' ? 0.62 : 1),
      );
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      signMesh.geometry.dispose();
      atlas.dispose();
      glintFx.dispose();
      group.removeFromParent();
    },
  };

  function groundAt(x: number, z: number): number {
    return o.ground(x, z);
  }

  function loosePose(id: LooseId): Pose {
    const p = LOOSE[id];
    return { x: p.x, y: groundAt(p.x, p.z) + looseYOffset(id), z: p.z, rot: p.rot, hung: false };
  }

  function looseVector(id: LooseId): Vector3 {
    const p = LOOSE[id];
    return vectorAt(p.x, groundAt(p.x, p.z) + looseYOffset(id) + 0.18, p.z);
  }

  function hookLocalX(id: GearId): number {
    return gearHookX(id);
  }

  function hungPose(id: GearId): Pose {
    const p = localToWorld(RACK, hookLocalX(id), -0.25);
    return {
      x: p.x,
      y: groundAt(RACK.x, RACK.z) + 1.04 + (settle[id] ?? 0),
      z: p.z,
      rot: RACK.rot,
      hung: true,
    };
  }

  function glintPose(id: LooseId): Pose {
    return id === 'lens' ? loosePose(id) : loose[id] ? loosePose(id) : hungPose(id);
  }

  function addStaticRack(buckets: Buckets, detail: Detail): void {
    const y = groundAt(RACK.x, RACK.z);
    for (const sx of [-1, 1] as const) {
      const foot = localToWorld(RACK, sx * 1.0, 0.08);
      buckets.wood.push(plank(0.13, 1.95, 0.13, { x: foot.x, y, z: foot.z, ry: RACK.rot }, WOOD, TRIM.dark));
    }
    for (const ly of [0.62, 1.42, 1.84]) {
      const p = localToWorld(RACK, 0, 0);
      buckets.wood.push(
        plank(2.15, 0.12, 0.16, { x: p.x, y: y + ly, z: p.z, ry: RACK.rot }, WOOD, TRIM.light),
      );
    }
    const roof = localToWorld(RACK, 0, 0.08);
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
      const p = localToWorld(RACK, hookLocalX(GEAR_IDS[i]!), -0.18);
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
    const l = LEDGER;
    const ly = groundAt(l.x, l.z);
    buckets.wood.push(plank(0.18, 0.82, 0.18, { x: l.x, y: ly, z: l.z, ry: l.rot }, WOOD_DARK, TRIM.dark));
    buckets.wood.push(
      plank(1.25, 0.1, 0.88, { x: l.x, y: ly + 0.72, z: l.z, ry: l.rot, rx: -0.28 }, WOOD, TRIM.light),
    );
    const cover = localToWorld(l, 0, 0.02);
    buckets.cloth.push(
      box(
        0.08,
        0.035,
        0.78,
        { x: cover.x, y: ly + 0.765, z: cover.z, ry: l.rot, rx: -0.28 },
        0x7a4c31,
        1,
        true,
      ),
    );
  }

  function updateGlintFx(): void {
    if (!glint || !(loose[glint] || (glint !== 'lens' && hung[glint]))) {
      glintFx.mesh.visible = false;
      return;
    }
    const p = glintPose(glint);
    glintFx.mesh.visible = detail.glint;
    glintFx.mesh.position.set(p.x, p.y + (glint === 'lens' ? 0.18 : 0.28), p.z);
    glintFx.mesh.rotation.y = p.rot;
    const scale = glint === 'lens' ? 0.62 : 1;
    glintFx.mesh.scale.setScalar(scale);
  }
}

type BucketKey = 'wood' | 'metal' | 'rope' | 'glow' | 'cloth';
type Buckets = Record<BucketKey, BufferGeometry[]>;
type Pose = { x: number; y: number; z: number; rot: number; hung: boolean };
type Detail = { cyl: number; glint: boolean };

const GEAR_IDS = ['compass', 'lantern', 'rope', 'spyglass'] as const satisfies readonly GearId[];
const LOOSE_IDS = ['compass', 'lantern', 'rope', 'spyglass', 'lens'] as const satisfies readonly LooseId[];
const BUCKET_KEYS = ['wood', 'metal', 'rope', 'glow', 'cloth'] as const satisfies readonly BucketKey[];
const WOOD = 0xf0ddc4;
const WOOD_DARK = 0xd1b592;
const BRASS = 0xd9b65a;
const IRON = 0x6f6962;
const ROPE = 0xd6bc8e;
const GLASS = 0x9fd2dc;
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpMid = new Vector3();
const tmpDir = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpE = new Euler();

const RACK = { x: -85.6, z: -57.0, rot: (-31 * Math.PI) / 180 };
const LEDGER = { x: -87.7, z: -55.2, rot: (-58 * Math.PI) / 180 };
const LOOSE: Record<LooseId, { x: number; z: number; rot: number }> = {
  compass: { x: -100.4, z: -66.0, rot: 0.4 },
  lantern: { x: -108.8, z: -41.6, rot: -0.25 },
  rope: { x: -111.6, z: -75.5, rot: 0.7 },
  spyglass: { x: -72.8, z: -65.3, rot: -0.9 },
  lens: { x: -136.7, z: -43.8, rot: 0.15 },
};

function detailForTier(tier: TierSettings): Detail {
  return { cyl: tier.tier === 'lite' ? 8 : tier.tier === 'low' ? 10 : 12, glint: tier.tier !== 'lite' };
}

function looseYOffset(id: LooseId): number {
  return id === 'lens' ? 0.86 : 0;
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

function localToWorld(
  o: { x: number; z: number; rot: number },
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

function anchorFromLocal(o: { x: number; z: number; rot: number }, lx: number, lz: number): VillageAnchor {
  const p = localToWorld(o, lx, lz);
  return { x: p.x, y: 0, z: p.z, heading: o.rot };
}

function addGear(
  b: Buckets,
  id: GearId,
  p: Pose,
  vertical: boolean,
  lensFitted: boolean,
  detail: Detail,
): void {
  if (id === 'compass') addCompass(b, p, vertical, detail);
  else if (id === 'lantern') addLantern(b, p, vertical, detail);
  else if (id === 'rope') addRope(b, p);
  else addSpyglass(b, p, vertical, lensFitted, detail);
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

function addLantern(b: Buckets, p: Pose, _vertical: boolean, detail: Detail): void {
  const y = p.y + 0.04;
  const w = 0.28;
  b.metal.push(box(w, 0.035, w, { x: p.x, y, z: p.z, ry: p.rot }, IRON, 1, true));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      b.metal.push(
        box(
          0.028,
          0.42,
          0.028,
          { x: p.x + sx * 0.12, y: y + 0.02, z: p.z + sz * 0.12, ry: p.rot },
          IRON,
          1,
          true,
        ),
      );
  b.glow.push(box(0.18, 0.31, 0.018, { x: p.x, y: y + 0.08, z: p.z + 0.14, ry: p.rot }, 0xffc987, 1, true));
  b.glow.push(box(0.18, 0.31, 0.018, { x: p.x, y: y + 0.08, z: p.z - 0.14, ry: p.rot }, 0xffc987, 1, true));
  b.glow.push(box(0.018, 0.31, 0.18, { x: p.x + 0.14, y: y + 0.08, z: p.z, ry: p.rot }, 0xffc987, 1, true));
  b.glow.push(box(0.018, 0.31, 0.18, { x: p.x - 0.14, y: y + 0.08, z: p.z, ry: p.rot }, 0xffc987, 1, true));
  b.glow.push(box(0.05, 0.13, 0.05, { x: p.x, y: y + 0.08, z: p.z, ry: p.rot }, 0xff9c45, 1, true));
  b.metal.push(coneCap(p.x, y + 0.43, p.z, p.rot, 0.2, 0.12, IRON));
  b.metal.push(torus(0.09, 0.012, { x: p.x, y: y + 0.55, z: p.z, rx: Math.PI / 2 }, 0x74695f, detail.cyl));
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

function addSpyglass(b: Buckets, p: Pose, vertical: boolean, lensFitted: boolean, detail: Detail): void {
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
  if (lensFitted)
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
  else
    b.metal.push(
      cylinder(
        0.075,
        0.075,
        0.012,
        { x: c.x, y: c.y, z: c.z, ry: baseRot, rx: Math.PI / 2 },
        0x1a1713,
        detail.cyl,
      ),
    );
}

function addLens(b: Buckets, p: Pose, detail: Detail): void {
  b.cloth.push(box(0.44, 0.035, 0.36, { x: p.x, y: p.y + 0.01, z: p.z, ry: p.rot }, 0x5f8a79, 1, true));
  b.metal.push(torus(0.16, 0.022, { x: p.x, y: p.y + 0.07, z: p.z, rx: Math.PI / 2 }, BRASS, 16));
  b.glow.push(
    cylinder(0.13, 0.13, 0.018, { x: p.x, y: p.y + 0.075, z: p.z, rx: Math.PI / 2 }, 0xaee8ff, detail.cyl),
  );
}

function createGlintFx(): GlintFx {
  const material = createSparkleMaterial();
  const shaft = shaftGeometry(1.15, 0.28, { rgb: [1, 0.92, 0.65], strength: 0.72 });
  const star = starGeometry(0.18, { rgb: [1, 0.98, 0.82], strength: 1 });
  star.translate(0, 0.08, 0);
  const geometry = merge([shaft, star]);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'gear glint hint';
  mesh.visible = false;
  return {
    mesh,
    material,
    baseOpacity: 1,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
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

function tubeBetween(
  radius: number,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  tint: number,
  segments: number,
): BufferGeometry {
  tmpA.set(a.x, a.y, a.z);
  tmpB.set(b.x, b.y, b.z);
  tmpDir.subVectors(tmpB, tmpA);
  const len = Math.max(0.03, tmpDir.length());
  const g = new CylinderGeometry(radius, radius, len, segments, 1);
  tmpQ.setFromUnitVectors(new Vector3(0, 1, 0), tmpDir.normalize());
  tmpMid.addVectors(tmpA, tmpB).multiplyScalar(0.5);
  tmpM.compose(tmpMid, tmpQ, new Vector3(1, 1, 1));
  g.applyMatrix4(tmpM);
  worldUv(g, 0.8);
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
  readonly rects: Record<string, Rect>;
  redraw(state: 'someone-else' | 'you'): void;
  dispose(): void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function createTextAtlas(initial: 'someone-else' | 'you'): TextAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const rects = {
    git: { x: 0, y: 0, w: 512, h: 128 },
    node: { x: 512, y: 0, w: 512, h: 128 },
    npm: { x: 0, y: 128, w: 512, h: 128 },
    gh: { x: 512, y: 128, w: 512, h: 128 },
    ledger: { x: 0, y: 256, w: 1024, h: 768 },
  };
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardNodeMaterial({
    map: texture,
    roughness: 0.86,
    metalness: 0,
    side: DoubleSide,
  });
  const redraw = (state: 'someone-else' | 'you') => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlaque(ctx, rects.git, 'git --version');
    drawPlaque(ctx, rects.node, 'node -v');
    drawPlaque(ctx, rects.npm, 'npm -v');
    drawPlaque(ctx, rects.gh, 'gh --version');
    drawLedger(ctx, rects.ledger, state);
    texture.needsUpdate = true;
  };
  redraw(initial);
  return {
    material,
    rects,
    redraw,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

function drawPlaque(ctx: CanvasRenderingContext2D, r: Rect, label: string): void {
  ctx.fillStyle = '#c99d55';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#5b3216';
  ctx.lineWidth = 10;
  ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  ctx.font = '700 54px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2c1c12';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 2);
}

function drawLedger(ctx: CanvasRenderingContext2D, r: Rect, state: 'someone-else' | 'you'): void {
  ctx.fillStyle = '#caa77a';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#d8c6a8';
  ctx.fillRect(r.x + 40, r.y + 40, r.w / 2 - 54, r.h - 80);
  ctx.fillRect(r.x + r.w / 2 + 14, r.y + 40, r.w / 2 - 54, r.h - 80);
  ctx.strokeStyle = '#8a765a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w / 2, r.y + 44);
  ctx.lineTo(r.x + r.w / 2, r.y + r.h - 44);
  ctx.stroke();
  ctx.font = '700 86px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3b2616';
  ctx.fillText('Gear Check Ledger', r.x + 76, r.y + 220);
  ctx.font = '700 60px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('gh auth status', r.x + 76, r.y + 325);
  ctx.fillText('Signed in as:', r.x + 76, r.y + 430);
  ctx.font = state === 'you' ? '800 88px ui-monospace, SFMono-Regular, Menlo, monospace' : '700 82px cursive';
  ctx.fillStyle = state === 'you' ? '#173f78' : '#6e2b22';
  ctx.fillText(state === 'you' ? 'your-handle' : 'someone-else', r.x + 76, r.y + 550);
  ctx.font = '700 58px Georgia, serif';
  ctx.fillStyle = '#3b2616';
  ctx.fillText('Gear Check Ledger', r.x + 76, r.y + 650);
  ctx.font = state === 'you' ? '800 86px ui-monospace, SFMono-Regular, Menlo, monospace' : '700 82px cursive';
  ctx.fillStyle = state === 'you' ? '#173f78' : '#6e2b22';
  ctx.fillText(state === 'you' ? 'your-handle' : 'someone-else', r.x + 76, r.y + 740);
  ctx.strokeStyle = 'rgba(80,55,28,0.22)';
  ctx.lineWidth = 2;
  for (let y = r.y + 430; y < r.y + r.h - 80; y += 44) {
    ctx.beginPath();
    ctx.moveTo(r.x + 76, y);
    ctx.lineTo(r.x + r.w - 76, y);
    ctx.stroke();
  }
}

function createTextGeometry(
  rects: Record<string, Rect>,
  ground: (x: number, z: number) => number,
): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const add = (p: Vector3, u: number, v: number) => {
    const i = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
    return i;
  };
  const addPlane = (center: Vector3, right: Vector3, up: Vector3, rect: Rect) => {
    const u0 = rect.x / 1024;
    const v0 = 1 - (rect.y + rect.h) / 1024;
    const u1 = (rect.x + rect.w) / 1024;
    const v1 = 1 - rect.y / 1024;
    const a = add(center.clone().sub(right).sub(up), u0, v0);
    const b = add(center.clone().add(right).sub(up), u1, v0);
    const c = add(center.clone().add(right).add(up), u1, v1);
    const d = add(center.clone().sub(right).add(up), u0, v1);
    indices.push(a, b, d, b, c, d);
  };
  const rackY = ground(RACK.x, RACK.z);
  for (let i = 0; i < GEAR_IDS.length; i += 1) {
    const p = localToWorld(RACK, gearHookX(GEAR_IDS[i]!), -0.26);
    addPlane(
      new Vector3(p.x, rackY + 0.64, p.z),
      localRight(RACK.rot, -0.22),
      new Vector3(0, 0.085, 0),
      rects[
        GEAR_IDS[i] === 'compass'
          ? 'git'
          : GEAR_IDS[i] === 'lantern'
            ? 'node'
            : GEAR_IDS[i] === 'rope'
              ? 'npm'
              : 'gh'
      ]!,
    );
  }
  const ledgerCenter = localToWorld(LEDGER, 0, -0.18);
  addPlane(
    new Vector3(ledgerCenter.x, ground(LEDGER.x, LEDGER.z) + 1.08, ledgerCenter.z),
    localRight(LEDGER.rot, 0.6),
    slopedLedgerUp(LEDGER.rot),
    rects.ledger,
  );
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function localRight(rot: number, amount: number): Vector3 {
  return new Vector3(Math.cos(rot) * amount, 0, -Math.sin(rot) * amount);
}

function slopedLedgerUp(rot: number): Vector3 {
  return new Vector3(-Math.sin(rot) * 0.36, 0.13, -Math.cos(rot) * 0.36);
}
