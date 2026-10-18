import { Group, Mesh, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import type { VillageKit } from '../village/kit';
import { cylinder, merge } from './geo';
import { unreflected } from '../reflection';
import { createSparkleMaterial, shaftGeometry, starGeometry } from './sparkle';

/**
 * Anchorage Cay's message bottles (POC §4.4, B0.1-B0.4): sea-green bottles washed up on the beaches,
 * each with a rolled note inside and a soft glint so they're findable. They're optional, and each
 * holds one troubleshooting page. All the bottles merge into one mesh per material (4 draws; 2 on
 * Lite, where the note and the cork draw with the glass), rebuilt only when one's picked up.
 */
export interface BottleSpot {
  id: string;
  x: number;
  z: number;
  /** Which way the neck points (radians, like a heading). */
  yaw: number;
}

export const COVE_BOTTLES: readonly BottleSpot[] = [
  // West strand, just past the end of the quay: the first one most players find.
  { id: 'B0.1', x: -156, z: -48, yaw: 2.2 },
  // South-west cove below the hill.
  { id: 'B0.2', x: -116, z: 36, yaw: -0.6 },
  // The long lagoon beach on the south shore.
  { id: 'B0.3', x: 8, z: 88, yaw: 0.9 },
  // The far east end of the south shore, past the lagoon: a reward for walking the whole beach.
  { id: 'B0.4', x: 112, z: 98, yaw: 2.6 },
];

export interface BottleSite {
  readonly group: Group;
  /** Where each bottle's pickup prompt sits (world). */
  spots(): Record<string, Vector3>;
  /** Hides a bottle once it's been read (or shows it again). */
  setCollected(id: string, collected: boolean): void;
  excludes(x: number, z: number): boolean;
  dispose(): void;
}

const S = 1.65;
const GLASS = 0x3f8f80;
const GLASS_LIP = 0x5aa596;
const NOTE = 0xd9d6ae;
const CORK = 0xa77c4c;

export function createBottles(o: {
  kit: VillageKit;
  ground: (x: number, z: number) => number;
  spots?: readonly BottleSpot[];
  /** Lite: the note and the cork (a few pixels there) draw with the glass, two draws fewer. */
  lite?: boolean;
}): BottleSite {
  const list = o.spots ?? COVE_BOTTLES;
  const group = new Group();
  group.name = 'message bottles';
  // Not in the harbour mirror: small things on the sand, and each reflected look costs its own
  // mirror shaders (8 for the bottles; PLAN §15.4).
  unreflected.add(group);
  const collected = new Set<string>();
  const sparkle = createSparkleMaterial();
  const materials: Record<'glass' | 'note' | 'cork' | 'glint', Material> = {
    glass: o.kit.materials.metal,
    note: o.kit.materials.cloth,
    cork: o.kit.materials.wood,
    glint: sparkle,
  };
  const meshes: Mesh[] = [];
  const lying = list.map((b) => {
    const r = 0.075 * S;
    return { ...b, y: o.ground(b.x, b.z) + r * 0.55 };
  });

  const rebuild = () => {
    for (const m of meshes.splice(0)) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    const parts: Record<keyof typeof materials, BufferGeometry[]> = {
      glass: [],
      note: [],
      cork: [],
      glint: [],
    };
    for (const b of lying) {
      if (collected.has(b.id)) continue;
      addBottle(parts, b);
    }
    if (o.lite) parts.glass.push(...parts.note.splice(0), ...parts.cork.splice(0));
    for (const key of Object.keys(parts) as (keyof typeof materials)[]) {
      if (parts[key].length === 0) continue;
      const mesh = new Mesh(merge(parts[key]), materials[key]);
      mesh.name = `message bottles ${key}`;
      mesh.castShadow = key !== 'glint';
      mesh.receiveShadow = key !== 'glint';
      if (key === 'glint') mesh.renderOrder = 2;
      group.add(mesh);
      meshes.push(mesh);
    }
  };
  rebuild();

  return {
    group,
    spots() {
      return Object.fromEntries(lying.map((b) => [b.id, new Vector3(b.x, b.y + 0.25, b.z)]));
    },
    setCollected(id, isCollected) {
      if (isCollected === collected.has(id)) return;
      if (isCollected) collected.add(id);
      else collected.delete(id);
      rebuild();
    },
    excludes(x, z) {
      return lying.some((b) => Math.hypot(x - b.x, z - b.z) < 1.1);
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      sparkle.dispose();
      unreflected.delete(group);
      group.removeFromParent();
    },
  };
}

/**
 * One bottle lying on its side, neck toward `yaw`, tipped a little so the neck rides up out of the sand.
 * Built along +y (base at 0), then laid down: `rz = π/2` swings +y to −x, and the yaw turns it about y.
 */
function addBottle(
  parts: Record<'glass' | 'note' | 'cork' | 'glint', BufferGeometry[]>,
  b: BottleSpot & { y: number },
): void {
  const r = 0.075 * S;
  const len = 0.36 * S;
  const tilt = 0.16;
  // Neck direction in world xz: +y rotated by rz = π/2 (to −x), then by the yaw.
  const dx = -Math.cos(b.yaw);
  const dz = Math.sin(b.yaw);
  const base = { x: b.x - dx * len * 0.45, y: b.y - Math.sin(tilt) * len * 0.45, z: b.z - dz * len * 0.45 };
  const along = (d: number, lift = 0) => ({
    x: base.x + dx * d * Math.cos(tilt),
    y: base.y + d * Math.sin(tilt) + lift,
    z: base.z + dz * d * Math.cos(tilt),
    ry: b.yaw,
    rz: Math.PI / 2 - tilt,
  });
  const seg = 14;
  parts.glass.push(cylinder(r, r * 0.94, 0.02 * S, along(0), GLASS, seg));
  parts.glass.push(cylinder(r, r, 0.07 * S, along(0.02 * S), GLASS, seg));
  // The rolled note shows through the middle of the glass as a pale band.
  parts.note.push(cylinder(r * 1.004, r * 1.004, 0.1 * S, along(0.09 * S), NOTE, seg));
  parts.glass.push(cylinder(r, r, 0.04 * S, along(0.19 * S), GLASS, seg));
  parts.glass.push(cylinder(r * 0.36, r, 0.06 * S, along(0.23 * S), GLASS, seg));
  parts.glass.push(cylinder(r * 0.34, r * 0.36, 0.06 * S, along(0.29 * S), GLASS, seg));
  parts.glass.push(cylinder(r * 0.44, r * 0.44, 0.012 * S, along(0.345 * S), GLASS_LIP, seg));
  parts.cork.push(cylinder(r * 0.3, r * 0.3, 0.05 * S, along(0.35 * S), CORK, 8));

  // The glint: a star on the shoulder and a faint shaft, so it catches the eye along the beach.
  const shoulder = along(0.25 * S);
  const star = starGeometry(0.26);
  star.translate(shoulder.x, shoulder.y + r * 1.3, shoulder.z);
  parts.glint.push(star);
  const shaft = shaftGeometry(1.5, 0.2, { strength: 0.32 });
  shaft.translate(b.x, b.y - r * 0.4, b.z);
  parts.glint.push(shaft);
}
