import { Vector3 } from 'three/webgpu';
import type { TerminalLine } from '../hud';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './types';
import { sleep } from '../../util/math';

const FIRST_WORDS_ID = 'Q0.8.pipes';
const QUEST = 'Q0.8';
const QUIZ = 'S0.2';

const SHORT_PROMPT = 'Give me an overview of the copilot-app-for-beginners course repository…';

type Pipe = 'tube' | 'hatch';

/** What the puzzle needs from the brigantine: its group and the two rail fittings. */
export interface FirstWordsShip {
  readonly group: { localToWorld(v: Vector3): Vector3; updateMatrixWorld(force?: boolean): void };
  readonly pipes: {
    readonly tube: { x: number; y: number; z: number };
    readonly hatch: { x: number; y: number; z: number };
    setHint(which: Pipe | null): void;
    play(which: Pipe): void;
  };
}

/** The Terminal hatch's answer: it tries to run your request as a command. */
const HATCH_LINES: readonly TerminalLine[] = [
  { text: `$ ${SHORT_PROMPT}`, tone: 'cmd' },
  { text: 'zsh: command not found: Give', tone: 'other' },
];

/** The agent's answer to the first prompt (the course's expected output). */
const REPLY_LINES: readonly TerminalLine[] = [
  { text: `> ${SHORT_PROMPT}`, tone: 'cmd' },
  { text: 'This course has eight chapters, from 00 Setup to 07 Automations.' },
  {
    text: 'Learning path: Setup → Tour the App → Sessions, Worktrees, and Context → Development and GitHub Workflows → Skills and Custom Agents → MCP Servers and Plugins → Canvases → Automations.',
  },
  { text: 'samples/book-app-web is the web sample you’ll use in later exercises.', tone: 'ok' },
];

/** Juno's lines once the crew answers: the expected output, the page, then on to the Trial. */
const JUNO_REPLY: readonly ScriptStep[] = [
  { say: 'juno.reply.01' },
  { say: 'juno.reply.02' },
  { page: 'pg.first-prompt', doubloons: 10 },
  { say: 'juno.reply.03' },
  { quest: QUEST, step: 'done' },
  { quest: 'Q0.10', step: 'start' },
  { quest: 'Q0.9', step: 'start' },
];

/**
 * Q0.8 First Words (POC §4.4): two fittings on the ship's rail, the brass Prompt Box speaking tube
 * (to the crew) and the iron Terminal hatch (to the engine room). Speaking the course's first
 * prompt into one of them is S0.2. The hatch tries to run it as a command and clanks shut; the
 * tube carries it to the crew, and Juno reads back the expected output.
 */
export function createFirstWords(host: PuzzleHost, ship: FirstWordsShip, docked: () => boolean): Puzzle {
  const tube = new Vector3();
  const hatch = new Vector3();
  let running = false;
  let hinted: Pipe | null = null;
  let lines: readonly TerminalLine[] | null = null;
  let title = 'Terminal · engine room';
  let wasActive = false;
  /** Seconds the crew's reply has stayed up since the quest finished (it clears after a minute). */
  let replyAge = 0;

  const active = () => host.quests()[QUEST] === 'pipes';
  const locate = () => {
    ship.group.updateMatrixWorld();
    ship.group.localToWorld(tube.set(ship.pipes.tube.x, ship.pipes.tube.y, ship.pipes.tube.z));
    ship.group.localToWorld(hatch.set(ship.pipes.hatch.x, ship.pipes.hatch.y, ship.pipes.hatch.z));
  };
  locate();

  const setHint = (which: Pipe | null) => {
    hinted = which;
    ship.pipes.setHint(which);
  };
  const canUse = () => host.canAct() && active() && docked() && !running;

  const at = (v: Vector3, id: Pipe, label: string) =>
    host.interactions.add({
      id: `pipe:${id}`,
      label: () => label,
      get x() {
        return v.x;
      },
      // The fittings sit at chest height; the prompt checks feet height within 3 m.
      get y() {
        return v.y - 1;
      },
      get z() {
        return v.z;
      },
      radius: 1.7,
      enabled: canUse,
      onInteract: () => void speak(id),
    });
  at(tube, 'tube', 'Speak into the Prompt Box');
  at(hatch, 'hatch', 'Call down the Terminal hatch');

  async function speak(which: Pipe): Promise<void> {
    if (running) return;
    running = true;
    const g = host.learn?.answerInWorld(QUIZ, {
      type: 'scenario',
      option: which === 'tube' ? 'prompt' : 'terminal',
    });
    ship.pipes.play(which);
    if (which === 'hatch') {
      host.audio?.sfx.oneShot('hatch_clank', hatch, 0.9);
      title = 'Terminal · engine room';
      lines = HATCH_LINES;
      await sleep(900);
      await host.beat([{ say: g && !g.correct ? 'juno.hatch.feedback.01' : 'juno.hatch.01' }], 'Juno');
      running = false;
      return;
    }
    setHint(null);
    host.audio?.sfx.oneShot('tube_voice', tube, 0.9);
    await sleep(1300);
    title = 'Copilot app · project session';
    lines = REPLY_LINES;
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.7);
    const ok = await host.beat(JUNO_REPLY, 'Juno');
    running = false;
    if (!ok) host.hud.toast('Talk to Juno to finish up at the ship.', 3.5);
  }

  const near = (r = 6) => {
    const p = host.player;
    return Math.hypot(p.x - tube.x, p.z - tube.z) < r;
  };

  return {
    id: FIRST_WORDS_ID,
    engaged: () => active() && near(),
    hintKey: () => `${hinted ?? '-'}`,
    hint(tier: HintTier) {
      if (!active()) return null;
      if (tier === 1) return 'Is this a command to run, or a request for the agent?';
      if (tier === 2) {
        setHint('tube');
        return 'Requests to the agent go in the prompt box. That’s the brass speaking tube.';
      }
      if (running || !docked()) return null;
      void speak('tube');
      return 'I’ve spoken it into the Prompt Box for you. Listen.';
    },
    update(dt: number) {
      locate();
      const on = active();
      if (on !== wasActive) {
        wasActive = on;
        if (!on) setHint(null);
        if (!on && host.quests()[QUEST] !== 'done') lines = null;
      }
      // The reply lingers a minute by the tube, but not over the christening once the Trial's passed.
      if (lines && host.quests()[QUEST] === 'done') {
        replyAge += dt;
        if (replyAge > 60 || host.quests()['Q0.10'] === 'done') lines = null;
      }
    },
    terminal(): PuzzleTerminal | null {
      const q = host.quests()[QUEST];
      if (!lines || (q !== 'pipes' && q !== 'done') || !near(5)) return null;
      return { title, lines };
    },
    debug: {
      state: () => ({
        quest: host.quests()[QUEST] ?? null,
        running,
        hinted,
        title,
        lines: lines?.length ?? 0,
      }),
      speak: (which: Pipe) => speak(which),
      /** Where to stand on the pier to face each fitting, so tests can press E like a player. */
      spots: () => {
        locate();
        return {
          tube: { x: tube.x, y: tube.y, z: tube.z },
          hatch: { x: hatch.x, y: hatch.y, z: hatch.z },
        };
      },
    },
    dispose() {
      host.interactions.remove('pipe:tube');
      host.interactions.remove('pipe:hatch');
    },
  };
}

/** Strips the markdown the quiz card uses (`code`, **bold**) for a subtitle line. */
