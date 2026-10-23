import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Color, Matrix4, MeshStandardMaterial } from 'three/webgpu';
import { houseFaces, readKitTexels } from './facade-colours';
import type { PiecePlacement } from './house-builder';
import type { MaterialKey, VillageKit } from './kit';

/** A quad facing +z at depth z over [x0, x1] × [y0, y1]. */
function quad(x0: number, x1: number, y0: number, y1: number, z: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]), 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const material = (hex: number) => new MeshStandardMaterial({ color: hex });
const kit = {
  pieces: new Map([
    [
      'Wall_Plaster_Straight',
      [{ geometry: quad(-1, 1, 0, 3.123, 0.092), materialKey: 'plaster' as MaterialKey }],
    ],
    [
      'Window_Wide_Round1',
      [{ geometry: quad(-0.6, 0.6, 1.1, 2.5, 0.12), materialKey: 'wood' as MaterialKey }],
    ],
  ]),
  materials: { plaster: material(0xffffff), wood: material(0x101010) },
  dispose() {},
} as unknown as VillageKit;

const placement = (piece: string, role: PiecePlacement['role']): PiecePlacement => ({
  piece,
  matrix: new Matrix4().makeTranslation(0, 0, 5),
  position: { x: 0, y: 0, z: 5 },
  rotY: 0,
  scale: 1,
  role,
  side: 'front',
  storey: 0,
  segment: 0,
  local: { x: 0, y: 0, z: 0 },
});

describe('houseFaces (the harbour mirror’s houses, #31)', () => {
  const faces = houseFaces(
    kit,
    readKitTexels(kit),
    [placement('Wall_Plaster_Straight', 'wall'), placement('Window_Wide_Round1', 'window')],
    { x: 0, y: 0, z: 0 },
    (key, tint) => (key === 'plaster' ? (tint ?? 0xe0d4b0) : 0xffffff),
  );
  const lum = (hex: number) => {
    const c = new Color(hex);
    return c.r + c.g + c.b;
  };

  it('splits a wall into 3 × 3 cells on its outer face, facing out', () => {
    expect(faces).toHaveLength(9);
    for (const f of faces) {
      for (const p of f.pts) expect(p[2]).toBeCloseTo(5.122, 3);
      // Behind the face (toward the house).
      expect(f.inside[2]).toBeLessThan(5.122);
    }
  });

  it('paints the window cell darker than the plaster round it, in the plaster’s paint', () => {
    const middle = faces[4]!;
    const corner = faces[0]!;
    expect(lum(middle.color)).toBeLessThan(lum(corner.color) * 0.75);
    const c = new Color(corner.color);
    // Cream plaster: more red than blue.
    expect(c.r).toBeGreaterThan(c.b);
  });
});
