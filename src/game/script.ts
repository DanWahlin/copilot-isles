import type { LearnStore } from '../learn/store';
import type { Dialogue } from './dialogue';

/**
 * A conversation or quest beat as data (POC §3.4): voiced lines, unvoiced lines, spyglass images,
 * quizzes, Logbook pages, glossary terms, and quest steps, run in order.
 */
export type ScriptStep =
  | { say: string }
  | { text: string; speaker?: string }
  | { show: string; caption?: string }
  | { hide: true }
  | { quiz: string }
  | { page: string; doubloons?: number }
  /** Shelves a page in the Logbook without a reveal card (the NPC says it's there). */
  | { file: string; doubloons?: number }
  | { term: string }
  | { quest: string; step: string }
  /** Runs a Trial; failing or leaving it ends the script (the NPC offers it again). */
  | { trial: string }
  /** A world beat the session plays and awaits (the christening's coconut, say). */
  | { cue: string };

export interface ScriptContext {
  dialogue: Dialogue;
  learn: LearnStore | null;
  /** Default speaker for unvoiced lines. */
  speaker: string;
  /** Called for quest steps (the session updates the quest log). */
  onQuest?(quest: string, step: string): void;
  /** Stops the script (e.g. quitting to the title or fast travel). */
  cancelled?(): boolean;
  /** Plays a `cue` step; the script waits for it. */
  onCue?(cue: string): Promise<void> | void;
  /** Fills `{captain}` and `{ship}` in unvoiced lines. */
  format?(text: string): string;
}

/** Runs a script; resolves false if a quiz was abandoned (the NPC will ask again next time). */
export async function runScript(steps: readonly ScriptStep[], ctx: ScriptContext): Promise<boolean> {
  const { dialogue, learn } = ctx;
  try {
    for (const s of steps) {
      // NPCs tell you to press J; if you do, the conversation waits until you close the Logbook.
      if (learn?.getState().logbook.open) await learn.logbookClosed();
      if (ctx.cancelled?.()) return false;
      if ('say' in s) await dialogue.play([s.say]);
      else if ('text' in s) await dialogue.say(s.speaker ?? ctx.speaker, ctx.format?.(s.text) ?? s.text);
      else if ('show' in s) learn?.showImage(s.show, s.caption ?? null);
      else if ('hide' in s) learn?.hideImage();
      else if ('quiz' in s) {
        if (!learn) continue;
        const out = await learn.ask(s.quiz);
        if (!out.completed) return false;
      } else if ('trial' in s) {
        if (!learn) continue;
        const out = await learn.runTrial(s.trial);
        if (!out.passed) return false;
      } else if ('page' in s) await learn?.grantPage(s.page, s.doubloons ?? 0);
      else if ('file' in s) learn?.filePage(s.file, s.doubloons ?? 0);
      else if ('term' in s) learn?.learnTerm(s.term);
      else if ('quest' in s) ctx.onQuest?.(s.quest, s.step);
      else if ('cue' in s) await ctx.onCue?.(s.cue);
    }
    return true;
  } finally {
    learn?.hideImage();
  }
}
