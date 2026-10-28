import type { Group, Object3D, Vector3 } from 'three/webgpu';
import type { FacialLine } from './facial-animation';
import type { TierSettings } from '../../engine/quality';
import type { GestureHand, GestureStyle } from './gestures';

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
  // The Model Market's keepers on Anchorage Cay and Thousand-Bough Isle (Gilda is mer_market).
  'an_market',
  'tb_market',
  'tobias',
  'mina',
  'anders',
  'rhea',
  'oren',
  'pell',
  'admiral',
  'mer_fisher',
  'mer_matron',
  'mer_vendor',
  'mer_kid_a',
  'mer_kid_b',
  'mer_guard',
  'mer_market',
  // Thousand-Bough Isle (Chapter 02).
  'tamsin',
  'saffi',
  'oak',
  'fen',
  'ines',
  'rook',
  'pip',
  'elder',
  'tb_kid_a',
  'tb_kid_b',
  'tb_weaver',
  'tb_operator',
  'tb_fisher',
  'tb_lookout',
  // Keelhaven (Chapter 03): the cast, Bram's market body, and the islanders.
  'hester',
  'dory',
  'cass',
  'barty',
  'stroud',
  'arlo',
  'ottoline',
  'kh_market',
  'kh_nip',
  'kh_tuck',
  'kh_moll',
  'kh_salter',
  'kh_kit',
  'kh_skipper',
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
  'nod',
  'shake',
  'sit',
  'helm',
  'wade',
  'swim',
  'tread',
] as const;

export type PlayerBody = (typeof PLAYER_BODIES)[number];
export type NpcId = (typeof NPC_IDS)[number];
export type CharacterBody = (typeof CHARACTER_BODIES)[number];
export type CharacterClip = (typeof CHARACTER_CLIPS)[number];
export type LookTarget = Vector3 | Object3D | null;
export type CharacterGroundMode = 'ground' | 'wade' | 'swim' | 'air';

export interface CharacterGrounding {
  mode: CharacterGroundMode;
  /**
   * How far the body floats (0 standing or wading, 1 swimming): the swim stroke and treading water
   * blend in over the walk and wade as the bed falls away, so there's no pop between them.
   */
  afloat?: number;
  /** How much of floating is the swim stroke (0 treading water); from the pace when not given. */
  stroke?: number;
  verticalSpeed?: number;
  landed?: boolean;
  groundAt?: (x: number, z: number) => number;
}

export interface CharacterCreateOptions {
  body: CharacterBody;
  /** Player palette 0-3; NPCs use role defaults plus this optional tint offset. */
  variant?: number;
  /** Pass the runtime tier so NPC mixers can be throttled on Low/Lite. */
  tier?: Pick<TierSettings, 'npcAnimRate' | 'tier'> & Partial<Pick<TierSettings, 'shadowMoverMap'>>;
  /** Optional camera/player object for distance-based NPC mixer throttling. */
  updateTarget?: Object3D;
  /** Scales the body's size for one staging (e.g. the opening's cabin); 1 keeps its normal size. */
  scale?: number;
}

/**
 * Where both hands hold something (a ship's wheel), in the character's own frame: feet at the
 * origin, +z forward, metres. The hands go `spread` either side of centre.
 */
export interface HandGrip {
  readonly y: number;
  readonly z: number;
  readonly spread: number;
}

export interface Character {
  readonly group: Group;
  play(clip: CharacterClip, fade?: number): void;
  /** Reaches both hands to a grip over the 'helm' clip (null lets go). */
  setGrip(grip: HandGrip | null): void;
  setSpeed(mps: number): void;
  setGrounding(state: CharacterGrounding): void;
  lookAt(target: LookTarget): void;
  /** Layers conversational upper-body gestures over the active clip, so seated rigs stay seated. */
  setTalking(on: boolean): void;
  /** Starts or clears the facial performance for a voiced line. */
  speak(line: FacialLine | null): void;
  /** Lights them as the speaker in a talk shot: a soft key from the camera side and a stronger rim. */
  setSpotlight(on: boolean): void;
  /** A one-off wave hello (standing NPCs, not mid-conversation); a nod when a hand carries a prop. */
  greet(): void;
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
  /**
   * The hand an NPC talks with; default either. A hand that carries a prop (npc-accessories `holds`)
   * never gestures, whatever this says: the other hand talks.
   */
  readonly hand?: GestureHand;
  /** Glances down at what they're carrying now and then while idle (a ledger, a chart). */
  readonly reads?: boolean;
  /** How they talk with their hands (default: `ledger` for readers, else `open`). */
  readonly gestures?: GestureStyle;
}
