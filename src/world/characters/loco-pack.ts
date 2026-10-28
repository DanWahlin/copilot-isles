import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three/webgpu';
import { packs } from '../../engine/packs';
import { CHARACTER_CLIPS, type CharacterClip } from './types';

/**
 * Baked locomotion clip packs (`.loco`, written by tools/characters/retarget-ual.mjs): a small JSON
 * manifest followed by 16-bit quaternion and float32 vector tracks, plus each clip's foot-contact
 * windows so the runtime knows when a foot is planted.
 */

export type FootContactMap = Record<'L' | 'R', [number, number][]>;
type LocoClip = AnimationClip & { userData?: { contacts?: FootContactMap } };

const LOCO_MAGIC = 0x434f4c49;

/** Fetches and parses a clip pack; a missing or unreadable pack is an empty map (fallback clips play). */
export async function loadClipPack(url: string): Promise<Map<CharacterClip, AnimationClip>> {
  try {
    const res = await fetch(packs.url(url));
    if (!res.ok) return new Map();
    return parseLocoPack(await res.arrayBuffer());
  } catch {
    return new Map();
  }
}

/** Parses a clip pack's bytes (the prop and swim audits read the packs from disk). */
export function parseLocoPack(buffer: ArrayBuffer): Map<CharacterClip, AnimationClip> {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== LOCO_MAGIC) throw new Error('Bad locomotion pack');
  const jsonLength = view.getUint32(4, true);
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, jsonLength))) as {
    clips: Partial<
      Record<
        CharacterClip,
        {
          name: string;
          duration: number;
          fps: number;
          frames: number;
          contacts?: FootContactMap;
          tracks: {
            name: string;
            type: 'quat16' | 'vec3f32';
            offset: number;
            count: number;
          }[];
        }
      >
    >;
  };
  const clips = new Map<CharacterClip, AnimationClip>();
  const dataStart = 8 + jsonLength + ((4 - (jsonLength % 4)) % 4);
  for (const clipName of CHARACTER_CLIPS) {
    const src = manifest.clips[clipName];
    if (!src) continue;
    const tracks = src.tracks.map((track) => {
      const times = new Float32Array(src.frames);
      for (let i = 0; i < times.length; i += 1) times[i] = Math.min(src.duration, i / src.fps);
      const itemSize = track.type === 'quat16' ? 4 : 3;
      if (track.count !== src.frames * itemSize) {
        throw new Error(
          `Bad locomotion track ${track.name}: expected ${src.frames * itemSize}, got ${track.count}`,
        );
      }
      if (track.type === 'quat16') {
        const ints = new Int16Array(buffer, dataStart + track.offset, track.count);
        const values = new Float32Array(track.count);
        for (let i = 0; i < values.length; i += 1) values[i] = ints[i]! / 32767;
        return new QuaternionKeyframeTrack(track.name, times, values);
      }
      const values = new Float32Array(buffer, dataStart + track.offset, track.count);
      return new VectorKeyframeTrack(track.name, times, new Float32Array(values));
    });
    const clip = new AnimationClip(src.name, src.duration, tracks) as LocoClip;
    clip.userData = { contacts: src.contacts ?? { L: [], R: [] } };
    clips.set(clipName, clip);
  }
  return clips;
}

/** Clones a clip and keeps its baked foot contacts. */
export function cloneClipWithUserData(clip: AnimationClip | undefined): AnimationClip | undefined {
  if (!clip) return undefined;
  const clone = clip.clone() as LocoClip;
  clone.userData = (clip as LocoClip).userData;
  return clone;
}

/** The foot contact windows baked into a locomotion clip (empty for other clips). */
export function contactsOf(clip: AnimationClip): FootContactMap {
  return (clip as LocoClip).userData?.contacts ?? { L: [], R: [] };
}

/** Whether a 0-1 clip phase falls in any contact window (windows may wrap past 0). */
export function inContact(phase: number, intervals: [number, number][]): boolean {
  for (const [a, b] of intervals) {
    if (a < 0) {
      if (phase >= a + 1 || phase <= b) return true;
    } else if (phase >= a && phase <= b) return true;
  }
  return false;
}
