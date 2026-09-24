import { Group } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { loadVillageKit, type VillageAnchor, type VillageBoxCollider } from '../village';
import { createBottles, type BottleSite } from './bottles';
import { createCrane, type CraneSite } from './crane';
import { createGearRack, type GearRackSite } from './gear-rack';
import { createMill, type MillSite } from './mill';
import { ANCHORAGE_SLUICE } from './sluice-logic';

export type { BottleSite } from './bottles';
export type { CraneSite, CrateKind } from './crane';
export { BRIGANTINE_CARGO } from './crane';
export type { GearId, GearRackSite, LooseId } from './gear-rack';
export type { MillCellWater, MillSite } from './mill';

/** Anchorage Cay's puzzle set pieces (POC §4.5), built with the world so vegetation keeps off them. */
export interface CoveSites {
  readonly group: Group;
  readonly mill: MillSite;
  readonly crane: CraneSite;
  readonly gear: GearRackSite;
  /** The message bottles on the beaches (B0.1-B0.3). */
  readonly bottles: BottleSite;
  /** Extra obstacles for the brigantine (the moored sloops). */
  readonly shipObstacles: CircleObstacle[];
  /** Walkable decks and stairs (null elsewhere). */
  heightAt(x: number, z: number): number | null;
  readonly colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
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
  const mill = createMill({
    tier: o.tier,
    heightField: o.heightField,
    kit,
    kinds: ANCHORAGE_SLUICE.tiles.map((t) => t.kind),
  });
  const crane = createCrane({ tier: o.tier, kit });
  const gear = createGearRack({ tier: o.tier, kit, ground: o.ground });
  const bottles = createBottles({ kit, ground: o.ground });
  const group = new Group();
  group.name = 'puzzle sites';
  group.add(mill.group, crane.group, gear.group, bottles.group);
  return {
    group,
    mill,
    crane,
    gear,
    bottles,
    shipObstacles: [...crane.shipObstacles],
    heightAt: (x, z) => mill.heightAt(x, z) ?? crane.heightAt(x, z),
    colliders: {
      circles: [...mill.colliders.circles, ...crane.colliders.circles, ...gear.colliders.circles],
      boxes: [...mill.colliders.boxes, ...crane.colliders.boxes, ...gear.colliders.boxes],
    },
    anchors: { ...mill.anchors, ...crane.anchors, ...gear.anchors },
    excludes: (x, z) =>
      mill.excludes(x, z) || crane.excludes(x, z) || gear.excludes(x, z) || bottles.excludes(x, z),
    update(dt, t) {
      mill.update(dt, t);
      crane.update(dt, t);
      gear.update(dt, t);
    },
    dispose() {
      mill.dispose();
      crane.dispose();
      gear.dispose();
      bottles.dispose();
      group.removeFromParent();
    },
  };
}
