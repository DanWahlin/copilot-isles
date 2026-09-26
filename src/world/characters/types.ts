import type { Group, Object3D, Vector3 } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';

/** Character bodies, clips, and the public character API (shared by the library and the runtime). */

export const PLAYER_BODIES = ['man', 'woman'] as const;
const NPC_IDS = [
  'nell',
  'dockhand_a',
  'dockhand_b',
  'fisherman',
  'merchant',
  'lookout',
  'child',
  'old_sailor',
  'suri',
  'pim',
  'pol',
  'juno',
  'lyra',
] as const;
export const CHARACTER_BODIES = [...PLAYER_BODIES, ...NPC_IDS] as const;
export const CHARACTER_CLIPS = [
  'idle',
  'walk',
  'jog',
  'run',
  'jumpStart',
  'jumpLoop',
  'jumpLand',
  'talk',
  'wave',
  'sit',
  'helm',
  'wade',
] as const;

export type PlayerBody = (typeof PLAYER_BODIES)[number];
export type NpcId = (typeof NPC_IDS)[number];
export type CharacterBody = (typeof CHARACTER_BODIES)[number];
export type CharacterClip = (typeof CHARACTER_CLIPS)[number];
export type LookTarget = Vector3 | Object3D | null;
export type CharacterGroundMode = 'ground' | 'wade' | 'air';

export interface CharacterGrounding {
  mode: CharacterGroundMode;
  verticalSpeed?: number;
  landed?: boolean;
  groundAt?: (x: number, z: number) => number;
}

export interface CharacterCreateOptions {
  body: CharacterBody;
  /** Player palette 0-3; NPCs use role defaults plus this optional tint offset. */
  variant?: number;
  /** Pass the runtime tier so NPC mixers can be throttled on Low/Lite. */
  tier?: Pick<TierSettings, 'npcAnimRate' | 'tier'>;
  /** Optional camera/player object for distance-based NPC mixer throttling. */
  updateTarget?: Object3D;
}

export interface Character {
  readonly group: Group;
  play(clip: CharacterClip, fade?: number): void;
  setSpeed(mps: number): void;
  setGrounding(state: CharacterGrounding): void;
  lookAt(target: LookTarget): void;
  /** Layers conversational upper-body gestures over the active clip, so seated rigs stay seated. */
  setTalking(on: boolean): void;
  update(dt: number): void;
  readonly capsule: { readonly radius: number; readonly height: number };
  dispose(): void;
}

export interface CharacterLibrary {
  readonly clips: readonly CharacterClip[];
  readonly bodies: readonly CharacterBody[];
  create(options: CharacterCreateOptions): Character;
  dispose(): void;
}

/** Which source model a body uses, and how it's scaled and tinted. */
export type SourceKey = 'captain' | 'anne' | 'henry' | 'captain_npc' | 'anne_npc' | 'henry_npc';

export interface BodyConfig {
  readonly source: SourceKey;
  readonly scale: number;
  readonly radius: number;
  readonly height: number;
  readonly tint: number;
}
