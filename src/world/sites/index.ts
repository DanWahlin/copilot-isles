import { Group } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { buildSlice } from '../../engine/build-slice';
import { loadVillageKit, type VillageAnchor, type VillageBoxCollider } from '../village/kit';
import { loadPalmObject } from '../vegetation/model-loader';
import { createBottles, type BottleSite } from './bottles';
import { createCrane, type CraneSite } from './crane';
import { createGearRack, type GearRackSite } from './gear-rack';
import { createHammock, type HammockSite } from './hammock';
import { createMill, type MillSite } from './mill';
import { createPaletteStand, type PaletteStandSite } from './palette-stand';
import { SignSet } from './sign';
import { ANCHORAGE_SLUICE } from './sluice-logic';
import { islandCourseBoard } from '../../learn/course-board';
import { COVE } from '../layout';
import { addCourseBoardNotices, courseBoardExcludes } from './course-board';

export type { CraneSite } from './crane';
export { BRIGANTINE_CARGO } from './crane';
export type { GearRackSite } from './gear-rack';
export type { MillCellWater, MillSite } from './mill';

/** Anchorage Cay's puzzle set pieces (POC §4.5), built with the world so vegetation keeps off them. */
export interface CoveSites {
  readonly group: Group;
  readonly mill: MillSite;
  readonly crane: CraneSite;
  readonly gear: GearRackSite;
  readonly palette: PaletteStandSite;
  readonly hammock: HammockSite;
  /** The message bottles on the beaches (B0.1-B0.4). */
  readonly bottles: BottleSite;
  /** Extra obstacles for the brigantine (the moored sloops). */
  readonly shipObstacles: CircleObstacle[];
  /** Walkable decks and stairs (null elsewhere). */
  heightAt(x: number, z: number): number | null;
  /** `camera`: camera-only blockers (CollisionWorld.addCameraBox). */
  readonly colliders: {
    circles: CircleObstacle[];
    boxes: VillageBoxCollider[];
    camera: VillageBoxCollider[];
  };
  readonly anchors: Record<string, VillageAnchor>;
  excludes(x: number, z: number): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

export async function createCoveSites(o: {
  tier: TierSettings;
  heightField: HeightField;
  ground: (x: number, z: number) => number;
}): Promise<CoveSites> {
  const kit = await loadVillageKit();
  // Every painted board on the island shares one atlas, one material, and one draw.
  const signs = new SignSet('anchorage painted signs');
  const mill = createMill({
    tier: o.tier,
    heightField: o.heightField,
    kit,
    kinds: ANCHORAGE_SLUICE.tiles.map((t) => t.kind),
    signs,
  });
  // A slice between set pieces, so the cabin keeps moving while the island builds (built at once,
  // they held a frame for ~60 ms).
  await buildSlice();
  const crane = createCrane({ tier: o.tier, kit, signs });
  await buildSlice();
  const gear = createGearRack({ tier: o.tier, kit, ground: o.ground });
  await buildSlice();
  const palette = createPaletteStand({ tier: o.tier, kit, ground: o.ground });
  const [hammockPalmA, hammockPalmB] = await Promise.all([
    loadPalmObject('a', 8.2),
    loadPalmObject('b', 8.2),
  ]);
  const hammock = createHammock({
    tier: o.tier,
    kit,
    ground: o.ground,
    palms: { left: hammockPalmA, right: hammockPalmB },
  });
  await buildSlice();
  const bottles = createBottles({ kit, ground: o.ground, lite: o.tier.tier === 'lite' });
  // The course notice board's header and notes (its timber is the village's).
  const courseBoard = islandCourseBoard('anchorage');
  if (courseBoard) addCourseBoardNotices(signs, COVE.courseBoard, courseBoard);
  const group = new Group();
  group.name = 'puzzle sites';
  group.add(mill.group, crane.group, gear.group, palette.group, hammock.group, bottles.group);
  group.add(await signs.finalizeAsync(buildSlice));
  return {
    group,
    mill,
    crane,
    gear,
    palette,
    hammock,
    bottles,
    shipObstacles: [...crane.shipObstacles],
    heightAt: (x, z) => mill.heightAt(x, z) ?? crane.heightAt(x, z),
    colliders: {
      circles: [
        ...mill.colliders.circles,
        ...crane.colliders.circles,
        ...gear.colliders.circles,
        ...palette.colliders.circles,
        ...hammock.colliders.circles,
      ],
      boxes: [
        ...mill.colliders.boxes,
        ...crane.colliders.boxes,
        ...gear.colliders.boxes,
        ...palette.colliders.boxes,
        ...hammock.colliders.boxes,
      ],
      camera: [...mill.colliders.camera, ...crane.colliders.camera],
    },
    anchors: { ...mill.anchors, ...crane.anchors, ...gear.anchors, ...palette.anchors, ...hammock.anchors },
    excludes: (x, z) =>
      mill.excludes(x, z) ||
      crane.excludes(x, z) ||
      gear.excludes(x, z) ||
      palette.excludes(x, z) ||
      hammock.excludes(x, z) ||
      bottles.excludes(x, z) ||
      courseBoardExcludes(COVE.courseBoard, x, z),
    update(dt, t) {
      mill.update(dt, t);
      crane.update(dt, t);
      gear.update(dt, t);
      palette.update(dt, t);
      hammock.update(dt, t);
      signs.update();
    },
    dispose() {
      mill.dispose();
      crane.dispose();
      gear.dispose();
      palette.dispose();
      hammock.dispose();
      bottles.dispose();
      signs.dispose();
      group.removeFromParent();
    },
  };
}
