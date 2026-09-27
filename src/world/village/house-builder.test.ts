import { Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_STOREY_HEIGHT,
  buildHouse,
  houseDoorAnchor,
  houseStairsSpan,
  placementWorldMinY,
  stairsHeightAt,
  type HouseSide,
  type HouseSpec,
} from './house-builder';

const SPEC: HouseSpec = {
  footprint: { w: 6, d: 8 },
  storeys: 2,
  ground: 'unevenbrick',
  upper: 'mixed',
  doorSide: 'front',
  doorSegment: 1,
  windows: 'regular',
  roof: 'gable',
  seed: 5,
};

const SIDES: readonly HouseSide[] = ['front', 'back', 'left', 'right'];

describe('buildHouse', () => {
  it('places one native wall module per two metres on every side and storey', () => {
    const placements = buildHouse(SPEC);

    for (let storey = 0; storey < SPEC.storeys; storey += 1) {
      for (const side of SIDES) {
        const expected = (side === 'front' || side === 'back' ? SPEC.footprint.w : SPEC.footprint.d) / 2;
        expect(
          placements.filter((p) => p.role === 'wall' && p.storey === storey && p.side === side),
        ).toHaveLength(expected);
      }
    }
  });

  it('puts wood exterior corners on all four footprint corners for every storey', () => {
    const placements = buildHouse(SPEC);
    const expected = new Set(['-3,-4', '3,-4', '3,4', '-3,4']);

    for (let storey = 0; storey < SPEC.storeys; storey += 1) {
      const corners = placements.filter((p) => p.role === 'corner' && p.storey === storey);
      expect(corners).toHaveLength(4);
      expect(new Set(corners.map((p) => `${p.local.x},${p.local.z}`))).toEqual(expected);
      expect(corners.every((p) => p.contactY === storey * HOUSE_STOREY_HEIGHT)).toBe(true);
    }
  });

  it('uses the roof piece that matches the snapped native footprint', () => {
    expect(buildHouse(SPEC).find((p) => p.role === 'roof')?.piece).toBe('Roof_RoundTiles_6x8');
    expect(
      buildHouse({ ...SPEC, footprint: { w: 4, d: 6 }, storeys: 1 }).find((p) => p.role === 'roof')?.piece,
    ).toBe('Roof_RoundTiles_4x6');
    expect(
      buildHouse({ ...SPEC, footprint: { w: 8, d: 8 }, storeys: 3 }).find((p) => p.role === 'roof')?.piece,
    ).toBe('Roof_RoundTiles_8x8');
  });

  it('keeps wall centres closed on a two metre grid with no gaps', () => {
    const placements = buildHouse(SPEC);

    for (let storey = 0; storey < SPEC.storeys; storey += 1) {
      for (const side of SIDES) {
        const walls = placements.filter((p) => p.role === 'wall' && p.storey === storey && p.side === side);
        const axis = side === 'front' || side === 'back' ? 'x' : 'z';
        const sorted = walls.map((p) => p.local[axis]).sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i += 1) expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(2, 5);
        if (side === 'front') expect(walls.every((p) => p.local.z === -SPEC.footprint.d * 0.5)).toBe(true);
        if (side === 'back') expect(walls.every((p) => p.local.z === SPEC.footprint.d * 0.5)).toBe(true);
        if (side === 'left') expect(walls.every((p) => p.local.x === -SPEC.footprint.w * 0.5)).toBe(true);
        if (side === 'right') expect(walls.every((p) => p.local.x === SPEC.footprint.w * 0.5)).toBe(true);
      }
    }
  });

  it('keeps bottom-anchored pieces on ground or storey plates and never scales modules', () => {
    const placements = buildHouse(SPEC);
    const allowedContacts = new Set([0, HOUSE_STOREY_HEIGHT, SPEC.storeys * HOUSE_STOREY_HEIGHT]);
    const scale = new Vector3();
    const position = new Vector3();
    const rotation = new Quaternion();

    for (const placement of placements) {
      placement.matrix.decompose(position, rotation, scale);
      expect(scale.x).toBeCloseTo(1, 6);
      expect(scale.y).toBeCloseTo(1, 6);
      expect(scale.z).toBeCloseTo(1, 6);
      expect(placementWorldMinY(placement)).toBeGreaterThanOrEqual(-0.001);
      if (placement.contactY !== undefined) {
        expect(placementWorldMinY(placement)).toBeCloseTo(placement.contactY, 5);
        expect(allowedContacts.has(Number(placement.contactY.toFixed(5)))).toBe(true);
      }
    }
  });

  it('places the door and interaction anchor on the requested side', () => {
    const sideSpec: HouseSpec = { ...SPEC, doorSide: 'right', doorSegment: 2 };
    const placements = buildHouse(sideSpec);
    const door = placements.find((p) => p.role === 'door');
    const anchor = houseDoorAnchor(sideSpec);

    expect(door?.side).toBe('right');
    expect(door?.segment).toBe(2);
    expect(anchor.x).toBeGreaterThan(SPEC.footprint.w * 0.5);
    expect(anchor.heading).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('houseStairsSpan', () => {
  const spec: HouseSpec = { ...SPEC, stairs: true, rotY: 0.7, origin: { x: 12, y: 1.5, z: -4 } };

  it('is null for a house without stairs', () => {
    expect(houseStairsSpan(SPEC)).toBeNull();
  });

  it('climbs from the bottom tread out front to the top one at the wall', () => {
    const span = houseStairsSpan(spec)!;
    const door = houseDoorAnchor(spec);
    const fx = Math.sin(door.heading);
    const fz = Math.cos(door.heading);
    const heightOut = (out: number, across = 0) =>
      stairsHeightAt(span, door.x + fx * (out - 0.9) + fz * across, door.z + fz * (out - 0.9) - fx * across);
    // Distances are from the wall; the door anchor stands 0.9 m out.
    expect(heightOut(0.4)).toBeCloseTo(1.5 + 1.02, 5);
    expect(heightOut(2.0)).toBeCloseTo(1.5 + 0.2, 5);
    expect(heightOut(2.0, 0.8)).toBeCloseTo(1.5 + 0.2, 5);
    expect(heightOut(2.4)).toBeNull();
    expect(heightOut(1.2, 1.3)).toBeNull();
    const profile = [0.4, 0.8, 1.2, 1.6, 2.0].map((out) => heightOut(out)!);
    for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeLessThan(profile[i - 1]!);
  });
});
