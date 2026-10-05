import { describe, expect, it } from 'vitest';
import { FACE_FITS, faceColors } from './face-fit';
import { faceGeometry } from './face-material';
import { CHARACTER_BODIES, PLAYER_BODIES, type CharacterBody } from './types';

const NPCS = CHARACTER_BODIES.filter((b) => !(PLAYER_BODIES as readonly CharacterBody[]).includes(b));

describe('face fit', () => {
  it('gives every islander lids in their own skin and a readable iris', () => {
    for (const body of NPCS) {
      const colors = faceColors(body);
      expect(colors, body).not.toBeNull();
      expect(colors!.iris).not.toBe(colors!.skin);
    }
  });

  it('keeps each rig’s eyes apart, in front of the eyeball, and the mouth below them', () => {
    for (const [family, fit] of Object.entries(FACE_FITS)) {
      expect(fit.eyeX - fit.eyeRx * 1.13, family).toBeGreaterThan(0.04);
      expect(fit.eyeZ0 - fit.eyeK * fit.eyeX ** 2, family).toBeGreaterThan(0.235);
      expect(fit.mouthY, family).toBeLessThan(fit.eyeY - fit.eyeRy - 0.04);
    }
  });

  it('builds one geometry per rig with two eye sheets and a mouth', () => {
    const g = faceGeometry(FACE_FITS.anne);
    expect(faceGeometry(FACE_FITS.anne)).toBe(g);
    const sides = new Set(Array.from(g.getAttribute('faceSide').array as Float32Array, Math.sign));
    expect([...sides].sort()).toEqual([-1, 0, 1]);
    expect(g.index!.count).toBe((2 * 4 + 1) * 6 * 6);
  });
});
