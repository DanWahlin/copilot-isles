import type { IslesAudio } from '../../audio';
import type { LearnStore } from '../../learn/store';
import type { Dialogue } from '../dialogue';
import type { Hud } from '../hud';
import type { Interactions } from '../interaction';
import type { ScriptStep } from '../script';

/** What a puzzle needs from the play session (POC §3.7 toolkit). */
export interface PuzzleHost {
  readonly learn: LearnStore | null;
  readonly hud: Hud;
  readonly dialogue: Dialogue;
  readonly audio: IslesAudio | null;
  readonly interactions: Interactions;
  /** The walker (feet position and facing). */
  readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly heading: number };
  quests(): Readonly<Record<string, string>>;
  setQuest(id: string, step: string): void;
  /** True while you're walking with no dialogue, script, or menu in the way. */
  canAct(): boolean;
  /** Runs a quest beat with input locked (the NPC line, pages, and quiz steps). */
  beat(steps: readonly ScriptStep[], speaker: string): Promise<boolean>;
}

export type HintTier = 1 | 2 | 3;

export interface Puzzle {
  readonly id: string;
  /** True when you're at this puzzle and it's in progress, so Wingman's hint key talks about it. */
  engaged(): boolean;
  /**
   * Wingman's hint (POC §4.5): tier 1 nudges, tier 2 highlights, tier 3 does one step for you
   * (never in a Trial). Returns the line to say, or null if there's nothing to hint.
   */
  hint(tier: HintTier): string | null;
  /** Changes whenever the player makes progress, so the next hint starts again at tier 1. */
  hintKey(): string;
  update(dt: number, t: number): void;
  readonly debug: Record<string, (...args: never[]) => unknown>;
  dispose(): void;
}
