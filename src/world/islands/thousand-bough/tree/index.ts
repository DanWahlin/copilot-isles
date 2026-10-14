import {
  Color,
  InstancedBufferAttribute,
  Matrix4,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three/webgpu';
import type { CameraBlockerBox } from '../../../terrain/camera-blockers';
import { markInstancesChanged, sharedInstancedMesh } from '../../../../engine/instancing';
import type { TierSettings } from '../../../../engine/quality';
import { createVegetationMaterial } from '../../../vegetation/materials';
import { THOUSAND_BOUGH as TB, TREE } from '../layout';
import { thousandBoughHeight } from '../height';
import type { WalkClearance } from '../village/clearance';
import { BANYAN_DETAIL, TREE_ORIGIN, buildBanyan, type BanyanDetail } from './banyan';
import {
  BRANCHES,
  TRUNK_BASE,
  canopyClusters,
  carryingSprays,
  groundRoots,
  hangingVines,
  propRoots,
  type Cluster,
  type PropRoot,
} from './shape';

/**
 * Leaf clusters, prop roots and LOD detail per tier (spec §9.4, §9.8). The clusters' count sets their
 * spacing and so their size: fewer tiers' clumps are bigger, and the canopy stays one ceiling.
 */
const TIER_TREE: Record<
  TierSettings['tier'],
  { clusters: number; roots: number; near: BanyanDetail; vines: number; ground: number }
> = {
  lite: { clusters: 340, roots: 12, near: BANYAN_DETAIL.lite, vines: 0, ground: 8 },
  low: { clusters: 480, roots: 24, near: { ...BANYAN_DETAIL.lite, cards: 6 }, vines: 30, ground: 22 },
  medium: {
    clusters: 900,
    roots: 36,
    near: { ...BANYAN_DETAIL.near, lobes: 1, cards: 6 },
    vines: 50,
    ground: 24,
  },
  high: { clusters: 1500, roots: 36, near: BANYAN_DETAIL.near, vines: 80, ground: 32 },
  ultra: { clusters: 1500, roots: 36, near: BANYAN_DETAIL.near, vines: 80, ground: 32 },
};

/** Where the near tree hands over to the far one (m from the camera to the trunk), with hysteresis. */
export const BANYAN_LOD = { near: 120, band: 10 } as const;

/**
 * The follow camera keeps out of the limbs, the boughs, the leaders and the sprays the tier draws (a
 * box round each 3 m of them); leaves aren't blockers (they keep clear of every walk instead).
 */
export function branchCameraBoxes(sprays: ReadonlySet<string> = new Set()): CameraBlockerBox[] {
  const out: CameraBlockerBox[] = [];
  for (const b of BRANCHES) {
    if (b.id.startsWith('pillar')) continue;
    if (b.parent && !sprays.has(b.id)) continue;
    const pts = b.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const c = pts[i + 1]!;
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const n = Math.max(1, Math.ceil(Math.hypot(len, c.y - a.y) / 3));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const x0 = a.x + (c.x - a.x) * t0;
        const x1 = a.x + (c.x - a.x) * t1;
        const z0 = a.z + (c.z - a.z) * t0;
        const z1 = a.z + (c.z - a.z) * t1;
        const y0 = a.y + (c.y - a.y) * t0;
        const y1 = a.y + (c.y - a.y) * t1;
        const r = a.r + (c.r - a.r) * ((t0 + t1) / 2);
        if (r < 0.35) continue;
        out.push({
          x: (x0 + x1) / 2,
          z: (z0 + z1) / 2,
          hx: Math.hypot(x1 - x0, z1 - z0) / 2 + r * 0.6,
          hz: r,
          rot: Math.atan2(-(z1 - z0), x1 - x0),
          y0: Math.min(y0, y1) - r,
          y1: Math.max(y0, y1) + r,
        });
      }
    }
  }
  return out;
}

export interface Banyan {
  near: InstancedMesh;
  far: InstancedMesh;
  /** The little sister tree at Bough Landing. */
  sister: InstancedMesh;
  clusters: readonly Cluster[];
  /** The canopy sprays the near tree draws (the ones carrying its leaves). */
  sprays: ReadonlySet<string>;
  roots: readonly PropRoot[];
  /** Picks the level of detail for a camera at (x, z) (no allocation). */
  lod(x: number, z: number): void;
  dispose(): void;
}

/**
 * The great banyan and its little sister at Bough Landing, as instanced meshes in the vegetation's
 * procedural material (the same shader Meridian's brush and cacti use): a near level and a far level,
 * each one draw for both trees. The sister is the same tree at 0.18 scale.
 */
export function createBanyan(tier: TierSettings, clearance: WalkClearance): Banyan {
  const t = TIER_TREE[tier.tier];
  const clusters = canopyClusters(t.clusters, clearance);
  // The far tree (from the sea): half the clumps, a little bigger, so its crown reads as one full dome.
  const farClusters = canopyClusters(Math.round(t.clusters / 2), clearance, 1.1);
  // The little sister by the landing is seen close but small: a quarter of the clumps, leaf cards
  // and ragged lobes where the tier has the room.
  const sisterClusters = canopyClusters(Math.round(t.clusters / 4), clearance, 1.05);
  const fine = tier.tier === 'high' || tier.tier === 'ultra';
  const roots = propRoots(t.roots);
  const ground = groundRoots(t.ground, roots);
  const vines = hangingVines(t.vines, clearance);
  const material = createVegetationMaterial({
    alphaTest: 0.12,
    color: new Color(0xffffff),
    name: 'vegetation-procedural',
    bark: true,
  });
  const make = (geometry: BufferGeometry, name: string, sister: boolean) => {
    geometry.setAttribute('fade', new InstancedBufferAttribute(new Float32Array([1]), 1));
    geometry.setAttribute(
      'tint',
      new InstancedBufferAttribute(new Float32Array(sister ? [0.6, 0.55, 0.45] : [0.5, 0.5, 0.5]), 3),
    );
    const mesh = sharedInstancedMesh(geometry, material as Material, 1);
    mesh.name = name;
    const m = new Matrix4();
    if (sister) {
      // The same tree scaled about its trunk's base, standing on its own ground:
      // x' = s.x + k·lx, y' = ground + k·(ly + origin.y − base).
      const s = TB.sister;
      const ground = thousandBoughHeight(s.x, s.z) - 0.2;
      const k = s.scale;
      m.makeScale(k, k, k).setPosition(s.x, ground + k * (TREE_ORIGIN.y - TRUNK_BASE), s.z);
    } else m.makeTranslation(TREE_ORIGIN.x, TREE_ORIGIN.y, TREE_ORIGIN.z);
    mesh.setMatrixAt(0, m);
    markInstancesChanged(mesh);
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const near = make(
    buildBanyan(t.near, clusters, roots, { vines, ground, gate: true }),
    'thousand-bough-banyan',
    false,
  );
  const far = make(
    buildBanyan(BANYAN_DETAIL.far, farClusters, roots.slice(0, 12), { ground, gate: true }),
    'thousand-bough-banyan-far',
    false,
  );
  const sister = make(
    buildBanyan(
      { ...BANYAN_DETAIL.far, lobes: 1, cards: fine ? 5 : 3, twigs: true, fine },
      sisterClusters,
      [],
    ),
    'thousand-bough-sister',
    true,
  );
  far.visible = false;
  // Shown for the warm-up, so its first far view doesn't upload it mid-play.
  far.userData.prewarm = true;
  let isNear = true;
  return {
    near,
    far,
    sister,
    clusters,
    sprays: carryingSprays(clusters),
    roots,
    lod(x, z) {
      const d = Math.hypot(x - TREE.x, z - TREE.z);
      const want = isNear ? d < BANYAN_LOD.near + BANYAN_LOD.band : d < BANYAN_LOD.near - BANYAN_LOD.band;
      isNear = want;
      // Set every frame: a warm-up that hides and restores the island's meshes can't leave both off.
      near.visible = want;
      far.visible = !want;
    },
    dispose() {
      for (const m of [near, far, sister]) {
        m.geometry.dispose();
        m.dispose();
      }
      material.dispose();
    },
  };
}
