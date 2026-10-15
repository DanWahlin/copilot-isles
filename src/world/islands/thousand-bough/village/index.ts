import { Group, Mesh, type BufferGeometry, type Material } from 'three/webgpu';
import type { TierSettings } from '../../../../engine/quality';
import { SignSet, type PaintedSign } from '../../../sites/sign';
import { eachChunk, chunkOptions } from '../../../village/chunks';
import type { MaterialKey, VillageKit } from '../../../village/kit';
import { makeBuckets, PAINT, box, cone, lanternPaint, rod, type Buckets } from './pieces';
import { buildHouses } from './houses';
import { buildStructureSteps, type StructureOut } from './structure';
import type { WalkClearance } from './clearance';
import { createFlumeTerrace, type FlumeTerrace } from '../flume';
import { createSetPieces, type SetPieces } from '../set-pieces';

export interface TreeVillage {
  group: Group;
  /** R3's planks and ropes, shown when it unrolls (marked to prewarm). */
  r3: Group;
  out: StructureOut;
  signs: SignSet;
  wheels: ReturnType<typeof buildHouses>['wheels'];
  /** The Practice Bough house's sign (the practice session's branch). */
  practiceSign: PaintedSign;
  flume: FlumeTerrace;
  pieces: SetPieces;
  dispose(): void;
}

/** One hanging or standing lantern: an iron cap and frame round a glowing glass. */
function lantern(buckets: Buckets, l: { x: number; y: number; z: number; hang: boolean }): void {
  const g = box(buckets, 'glow', l.x, l.y, l.z, 0.2, 0.28, 0.2, 0.4, 0xffffff);
  lanternPaint(g);
  cone(buckets, 'metal', l.x, l.y + 0.14, l.z, 0.19, 0.16, 6, PAINT.iron);
  box(buckets, 'metal', l.x, l.y - 0.16, l.z, 0.22, 0.04, 0.22, 0.4, PAINT.iron);
  if (l.hang)
    rod(
      buckets,
      'metal',
      { x: l.x, y: l.y + 0.28, z: l.z },
      { x: l.x, y: l.y + 0.44, z: l.z },
      0.012,
      3,
      PAINT.iron,
    );
}

/**
 * Merges each bucket into chunks of its kit material (one draw a chunk, no new shader), breathing
 * between chunks.
 */
async function meshesFromBuckets(
  buckets: Buckets,
  kit: VillageKit,
  tier: TierSettings,
  name: string,
  into: Group,
  breathe: () => Promise<void>,
  shadows = true,
): Promise<Mesh[]> {
  const meshes: Mesh[] = [];
  // Lite draws the small metal, cloth and rope parts with the timber (three draws fewer; they're tiny there).
  if (tier.tier === 'lite')
    for (const k of ['metal', 'cloth', 'rope'] as MaterialKey[])
      if (k in buckets && buckets[k].length) buckets.wood.push(...buckets[k].splice(0));
  for (const key of Object.keys(buckets) as MaterialKey[]) {
    const parts: BufferGeometry[] = buckets[key];
    if (parts.length === 0) continue;
    const flat = parts.map((g) => {
      if (!g.index) return g;
      const f = g.toNonIndexed();
      g.dispose();
      return f;
    });
    await breathe();
    for (const chunk of eachChunk(flat, chunkOptions(tier))) {
      const mesh = new Mesh(chunk.geometry, kit.materials[key] as Material);
      mesh.name = `${name}-${key}`;
      // Only the timber, thatch and stone cast (rope, iron, cloth and glass are too fine to show).
      mesh.castShadow = shadows && (key === 'wood' || key === 'thatch' || key === 'stone');
      mesh.receiveShadow = key !== 'glow' && key !== 'halo';
      into.add(mesh);
      meshes.push(mesh);
      await breathe();
    }
  }
  return meshes;
}

/**
 * The tree village (spec §3.6): the Root Hall, the Great Stair, the decks, the Crown Deck, the
 * gallery and boardwalk, the bridges and lookouts, the houses and set pieces, every lantern, and the
 * signs. Built a slice at a time.
 */
export async function createTreeVillage(
  o: { tier: TierSettings; kit: VillageKit; clearance: WalkClearance },
  breathe: () => Promise<void>,
): Promise<TreeVillage> {
  const group = new Group();
  group.name = 'thousand-bough-village';
  const buckets = makeBuckets();
  const late = makeBuckets();
  // The Root Wharf casts no sun shadow where the tier has one: at the island's low evening sun its
  // piles and rail threw long rungs of shadow across the cove's shallows and shore (a "ladder").
  const shadowed = o.tier.tier !== 'lite' && o.tier.shadowCascades > 0;
  const wharf = shadowed ? makeBuckets() : buckets;
  // Stilts stand only where nobody walks.
  const clear = (x: number, z: number) =>
    !o.clearance.conflict(x, 0, z, 0.3, { beside: 1.2, above: 200, below: 200, ignore: (s) => s.y > 22 });
  const steps = buildStructureSteps(buckets, late, clear, wharf);
  let r = steps.next();
  for (; !r.done; r = steps.next()) await breathe();
  const out = r.value;
  await breathe();
  const signs = new SignSet('thousand-bough-signs');
  const { wheels, practiceSign } = buildHouses(buckets, signs, out);
  await breathe();
  const flume = createFlumeTerrace(o.kit, buckets, wheels, signs);
  await breathe();
  const pieces = createSetPieces(o.kit, buckets, signs);
  group.add(pieces.group);
  out.colliders.push(...flume.colliders);
  group.add(flume.group);
  await breathe();
  for (const l of out.lanterns) {
    lantern(buckets, l);
    // The camera keeps out of it too (they hang at head height beside the walks and on the rails).
    out.cameraBoxes.push({
      x: l.x,
      z: l.z,
      hx: 0.19,
      hz: 0.19,
      rot: 0.4,
      y0: l.y - 0.2,
      y1: l.y + (l.hang ? 0.46 : 0.32),
    });
  }
  await meshesFromBuckets(buckets, o.kit, o.tier, 'tb-village', group, breathe);
  if (wharf !== buckets) await meshesFromBuckets(wharf, o.kit, o.tier, 'tb-wharf', group, breathe, false);
  await breathe();
  const r3 = new Group();
  r3.name = 'thousand-bough-r3';
  r3.visible = false;
  r3.userData.prewarm = true;
  await meshesFromBuckets(late, o.kit, o.tier, 'tb-r3', r3, breathe);
  group.add(r3);
  await breathe();
  const signMesh = await signs.finalizeAsync(breathe);
  group.add(signMesh);
  // The signs' objects are placed in world space: they hang off the group (at the origin).
  for (const child of [] as never[]) void child;
  return {
    group,
    r3,
    out,
    signs,
    wheels,
    practiceSign,
    flume,
    pieces,
    dispose() {
      flume.dispose();
      pieces.dispose();
      group.traverse((obj) => {
        const m = obj as Mesh;
        if (
          m.isMesh &&
          m !== signMesh &&
          !m.name.startsWith('thousand-bough-flume') &&
          !m.name.startsWith('thousand-bough-moving')
        )
          m.geometry.dispose();
      });
      signs.dispose();
    },
  };
}
