import { Group } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { loadVillageKit, type VillageAnchor, type VillageBoxCollider } from '../village';
import { createMill, type MillSite } from './mill';
import { ANCHORAGE_SLUICE } from './sluice-logic';

export type { MillCellWater, MillSite } from './mill';

/** Anchorage Cay's puzzle set pieces (POC §4.5), built with the world so vegetation keeps off them. */
export interface CoveSites {
  readonly group: Group;
  readonly mill: MillSite;
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
}): Promise<CoveSites> {
  const kit = await loadVillageKit();
  const mill = createMill({
    tier: o.tier,
    heightField: o.heightField,
    kit,
    kinds: ANCHORAGE_SLUICE.tiles.map((t) => t.kind),
  });
  const group = new Group();
  group.name = 'puzzle sites';
  group.add(mill.group);
  return {
    group,
    mill,
    heightAt: (x, z) => mill.heightAt(x, z),
    colliders: {
      circles: [...mill.colliders.circles],
      boxes: [...mill.colliders.boxes],
    },
    anchors: { ...mill.anchors },
    excludes: (x, z) => mill.excludes(x, z),
    update(dt, t) {
      mill.update(dt, t);
    },
    dispose() {
      mill.dispose();
      group.removeFromParent();
    },
  };
}
