import { Group, type Mesh } from 'three/webgpu';
import type { TierSettings } from '../../../../engine/quality';
import { SignSet, type PaintedSign } from '../../../sites/sign';
import type { VillageKit } from '../../../village/kit';
import { makeBuckets, meshesFromBuckets, PAINT, beam, box, cone, lanternPaint, type Buckets } from './pieces';
import { buildHouses } from './houses';
import { buildStructureSteps, type StructureOut, type TreeLantern } from './structure';
import { hangerHeight, lampHanger } from '../../../village/lamp-hanger';
import { seatBlock } from '../../../characters/seat-fit';
import { THOUSAND_BOUGH as TB } from '../layout';
import { thousandBoughHeight } from '../height';
import type { WalkClearance } from './clearance';
import { createFlumeTerrace, type FlumeTerrace } from '../flume';
import { createSetPieces, type SetPieces } from '../set-pieces';
import { islandCourseBoard } from '../../../../learn/course-board';
import { addCourseBoardNotices, addCourseBoardTimber } from '../../../sites/course-board';
import { COURSE_BOARDS } from '../../course-boards';
import { addThousandBoughMarket } from './model-market';

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

/**
 * One hanging or standing lantern: an iron cap and base round a glowing glass. A hung one hangs by
 * the shared hanger from what's over it, or from an iron arm out of its post or wall (their rods once
 * stopped in the air: issue 363).
 */
export function lantern(buckets: Buckets, l: TreeLantern): void {
  const g = box(buckets, 'glow', l.x, l.y, l.z, 0.2, 0.28, 0.2, 0.4, 0xffffff);
  lanternPaint(g);
  cone(buckets, 'metal', l.x, l.y + 0.14, l.z, 0.19, 0.16, 6, PAINT.iron);
  box(buckets, 'metal', l.x, l.y - 0.16, l.z, 0.22, 0.04, 0.22, 0.4, PAINT.iron);
  if (!l.hang) return;
  const top = l.y + 0.3;
  let under = l.under;
  if (l.arm) {
    under ??= top + hangerHeight() + 0.03;
    // The arm runs from `arm` (2 cm into the post or wall) to 4 cm past the ring.
    const dx = l.x - l.arm.x;
    const dz = l.z - l.arm.z;
    const d = Math.hypot(dx, dz) || 1;
    const end = { x: l.x + (dx / d) * 0.04, y: under + 0.02, z: l.z + (dz / d) * 0.04 };
    beam(buckets, 'metal', { x: l.arm.x, y: under + 0.02, z: l.arm.z }, end, 0.04, 0.04, PAINT.iron);
  }
  if (under === undefined) throw new Error(`a hung lantern at (${l.x}, ${l.z}) has nothing to hang from`);
  lampHanger(buckets.metal, l.x, l.z, top, under, PAINT.iron, 1, 0.4);
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
  // The course notice board on Bough Landing (docs/specs/COURSE-BOARDS.md).
  const courseBoard = islandCourseBoard('thousand-bough');
  if (courseBoard) {
    const pose = COURSE_BOARDS['thousand-bough'];
    const parts = addCourseBoardTimber(buckets, pose, courseBoard);
    addCourseBoardNotices(signs, pose, courseBoard);
    out.colliders.push(parts.box);
    out.cameraBoxes.push(parts.camera);
  }
  // Lani's Model Market on Bough Landing (docs/specs/MODEL-MARKET.md §2; scenery without the market).
  addThousandBoughMarket(buckets, out, o.tier.tier === 'lite' || o.tier.tier === 'low');
  out.colliders.push(...flume.colliders);
  out.cameraBoxes.push(...flume.cameraBoxes);
  group.add(flume.group);
  await breathe();
  // The seated islanders' seat blocks, under their anchors (seat-fit.ts): the hall's floor, the shore.
  for (const [a, floor] of [
    [TB.anchors.extraWeaver, 18.5],
    [TB.anchors.extraFisher, thousandBoughHeight(TB.anchors.extraFisher.x, TB.anchors.extraFisher.z)],
  ] as const)
    seatBlock(buckets, a.x, a.z, a.heading, floor, a.y);
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
