import { Color } from 'three/webgpu';
import { NPC_PALETTES } from './npc-palettes';
import type { CharacterBody, NpcId, SourceKey } from './types';

/**
 * Where the painted face sits on each Pirate Kit head, in Head-bone metres with the character's own
 * scale divided out (+x is the character's left, +y up, +z forward). Measured from the rigs' eye
 * vertices and face depth (issue #186): each eye sheet sits just in front of the model's eyeball and
 * follows the head's curve, so the face is depth-tested and never shows through hair, hats or people.
 */
export interface FaceFit {
  /** Eye centres at ±x. */
  readonly eyeX: number;
  readonly eyeY: number;
  /** Sheet depth at x = 0 and how fast it falls away sideways (z = z0 − k·x²). */
  readonly eyeZ0: number;
  readonly eyeK: number;
  /** Sclera half-width and half-height. */
  readonly eyeRx: number;
  readonly eyeRy: number;
  readonly irisR: number;
  readonly mouthY: number;
  readonly mouthZ0: number;
  readonly mouthK: number;
  /** Half-width of the mouth at rest. */
  readonly mouthW: number;
  /** Lash weight (0.6–1.6): the Anne rig's heavier lashes and outer flick, lighter on the men. */
  readonly lash: number;
  /** Leans the mouth sheet back at the top to follow the chin (radians). */
  readonly mouthPitch: number;
}

type Family = 'anne' | 'henry' | 'captain';

export const FACE_FITS: Record<Family, FaceFit> = {
  // Eyes at (±0.120, 0.061), front 0.248, about 0.10 across; the face is flat and wide.
  anne: {
    eyeX: 0.12,
    eyeY: 0.061,
    eyeZ0: 0.27,
    eyeK: 1.2,
    eyeRx: 0.056,
    eyeRy: 0.06,
    irisR: 0.035,
    mouthY: -0.046,
    mouthZ0: 0.272,
    mouthK: 3.2,
    mouthW: 0.038,
    mouthPitch: 0.22,
    lash: 1.35,
  },
  // Eyes at (±0.136, 0.091), front 0.236, about 0.085 across, either side of a big nose.
  henry: {
    eyeX: 0.136,
    eyeY: 0.091,
    eyeZ0: 0.247,
    eyeK: 0.3,
    eyeRx: 0.049,
    eyeRy: 0.052,
    irisR: 0.03,
    mouthY: -0.038,
    mouthZ0: 0.273,
    mouthK: 3.8,
    mouthW: 0.04,
    mouthPitch: 0.22,
    lash: 0.85,
  },
  // Eyes at (±0.149, 0.093), front 0.236; the mouth sits in the gap between moustache and beard.
  captain: {
    eyeX: 0.149,
    eyeY: 0.093,
    eyeZ0: 0.247,
    eyeK: 0.3,
    eyeRx: 0.049,
    eyeRy: 0.052,
    irisR: 0.03,
    mouthY: -0.062,
    mouthZ0: 0.262,
    mouthK: 2.4,
    mouthW: 0.034,
    mouthPitch: 0.1,
    lash: 0.8,
  },
};

const FAMILY: Record<SourceKey, Family> = {
  anne: 'anne',
  anne_npc: 'anne',
  henry: 'henry',
  henry_npc: 'henry',
  captain: 'captain',
  captain_npc: 'captain',
};

export function faceFamily(source: SourceKey): Family {
  return FAMILY[source];
}

/** Lids are the palette's skin; irises are the palette's eye colour lifted so it reads as an iris. */
export interface FaceColors {
  readonly skin: number;
  readonly iris: number;
}

const TMP = new Color();
const HSL = { h: 0, s: 0, l: 0 };

export function faceColors(body: CharacterBody): FaceColors | null {
  const palette = NPC_PALETTES[body as NpcId];
  if (!palette) return null;
  TMP.setHex(palette.eyes).getHSL(HSL);
  TMP.setHSL(HSL.h, Math.min(0.5, HSL.s), Math.max(0.2, HSL.l * 1.7));
  return { skin: palette.skin, iris: TMP.getHex() };
}
