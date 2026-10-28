import type { SetupKind } from '../learn/setup';
import type { StepWhen } from '../learn/store';
import type { ForkFrom, LearnStore } from '../learn/store';
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
  /** A quiz; with `when`, only for players whose setup fits (a model quiz for those who kept Auto). */
  | { quiz: string; when?: StepWhen }
  | { page: string; doubloons?: number }
  /** Shelves a page in the Logbook without a reveal card (the NPC says it's there). */
  | { file: string; doubloons?: number }
  | { term: string }
  | { quest: string; step: string }
  /** Runs a Trial; failing or leaving it ends the script (the NPC offers it again). */
  | { trial: string }
  /** A world beat the session plays and awaits (the christening's coconut, say). */
  | { cue: string }
  /**
   * Asks for the player's fork (the form always offers Skip for now), only if they haven't given it
   * yet. `line` is a voiced line played first, only when the form opens.
   */
  | { askFork: Exclude<ForkFrom, 'logbook'>; line?: string }
  /**
   * Asks for one of the player's setup values (src/learn/setup.ts), with Skip for now, only if they
   * haven't given it yet (and, with `when`, only if their setup fits). `line` is a voiced line played
   * first, only when the form opens.
   */
  | { askSetup: SetupKind; line?: string; when?: StepWhen }
  /**
   * "Do this in the app": hands a real-app task (the course's `learning.json`) to the player on a card
   * with I did it and Later. Skipped once they've confirmed it; Later never holds the story up.
   * `quiet` hands it off with no card (it joins the App checklist as Later: the NPC sends you off to
   * do it, and asks when you're back). `orStop` ends the script on Later (an app-only quest's return
   * beat: the NPC asks again next time).
   */
  | { appTask: string; quiet?: boolean; orStop?: boolean };

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
  /** Fills `{captain}`, `{ship}`, and the player's setup (`{key:mod+R}`, `{issue}`…) in unvoiced lines. */
  format?(text: string): string;
}

/** The voiced lines a script may play, in order. */
export function voicedLines(steps: readonly ScriptStep[]): string[] {
  const ids: string[] = [];
  for (const s of steps) {
    if ('say' in s) ids.push(s.say);
    else if (('askFork' in s || 'askSetup' in s) && s.line) ids.push(s.line);
  }
  return ids;
}

/**
 * Whether a step opens a card over the conversation (a quiz, a Trial, a fork or setup form, an app
 * card): the line before it plays to its last word, even if it's skipped (it asks the card's question).
 */
export function opensCard(s: ScriptStep | undefined): boolean {
  if (!s) return false;
  if ('appTask' in s) return !s.quiet;
  return 'quiz' in s || 'trial' in s || 'askFork' in s || 'askSetup' in s;
}

/** Runs a script; resolves false if a quiz was abandoned (the NPC will ask again next time). */
export async function runScript(steps: readonly ScriptStep[], ctx: ScriptContext): Promise<boolean> {
  const { dialogue, learn } = ctx;
  // The whole conversation's voice loads as it starts, so no line waits for a download.
  dialogue.preload(voicedLines(steps));
  try {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      // NPCs tell you to press J; if you do, the conversation waits until you close the Logbook.
      if (learn?.getState().logbook.open) await learn.logbookClosed();
      if (ctx.cancelled?.()) return false;
      if ('say' in s) await dialogue.play([s.say], undefined, opensCard(steps[i + 1]));
      else if ('text' in s) await dialogue.say(s.speaker ?? ctx.speaker, ctx.format?.(s.text) ?? s.text);
      else if ('show' in s) learn?.showImage(s.show, s.caption ?? null);
      else if ('hide' in s) learn?.hideImage();
      else if ('quiz' in s) {
        if (!learn || (s.when && !learn.setupIs(s.when))) continue;
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
      else if ('askFork' in s) {
        if (!learn || learn.getState().fork) continue;
        if (s.line) await dialogue.play([s.line]);
        if (ctx.cancelled?.()) return false;
        await learn.askFork(s.askFork);
      } else if ('askSetup' in s) {
        if (!learn || learn.getState().setup[s.askSetup] !== null) continue;
        if (s.when && !learn.setupIs(s.when)) continue;
        if (s.line) await dialogue.play([s.line]);
        if (ctx.cancelled?.()) return false;
        await learn.askSetup(s.askSetup, 'script');
      } else if ('appTask' in s) {
        if (!learn) continue;
        if (s.quiet) learn.noteAppTask(s.appTask);
        else if ((await learn.askAppTask(s.appTask, 'script')) !== 'done' && s.orStop) return false;
      }
    }
    return true;
  } finally {
    learn?.hideImage();
  }
}
