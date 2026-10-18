import { Vector3 } from 'three/webgpu';
import type { TerminalLine } from '../hud';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './types';
import { sleep } from '../../util/math';
import type { PuzzleFile } from '../../course/pack';
import { fill, lineOf, puzzleContent, puzzleQuest, textOf } from '../../course/puzzles';
import { storyHolds } from '../story';

const FIRST_WORDS_ID = 'first-words';
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

/** A readout: its title and lines (`{prompt}` is the prompt). */
interface Readout {
  title: string;
  lines: readonly TerminalLine[];
}

/** `puzzles/first-words.json`: choose the right tool for the course's first prompt. */
interface FirstWordsFile extends PuzzleFile {
  /** The quiz the choice answers. */
  quiz: string;
  /** The ship's two fittings: their label, the quiz option each one picks, and which is right. */
  tools: Readonly<Record<Pipe, { label: string; option: string; right?: boolean }>>;
  prompt: string;
  /** What the wrong fitting prints, and the crew's reply through the right one. */
  hatch: Readout;
  reply: Readout;
  /** Juno's lines once the crew answers: the expected output, the page, then on. */
  scripts: { reply: readonly ScriptStep[] };
}
const content = () => puzzleContent<FirstWordsFile>('first-words');
const T = (key: string) => textOf(content(), key);
const readout = (r: Readout): readonly TerminalLine[] =>
  r.lines.map((l) => ({ ...l, text: fill(l.text, { prompt: content().prompt }) }));

/**
 * Q0.8 First Words (POC §4.4), choose the tool: two fittings on the ship's rail, the brass speaking
 * tube (to the crew) and the iron hatch (to the engine room). Speaking the course's first prompt into
 * one of them answers the course's quiz. The wrong one prints what the pack says and clanks shut; the
 * right one carries it to the crew, and Juno reads back the expected output (`puzzles/first-words.json`).
 */
export function createFirstWords(host: PuzzleHost, ship: FirstWordsShip, docked: () => boolean): Puzzle {
  const tube = new Vector3();
  const hatch = new Vector3();
  let running = false;
  let hinted: Pipe | null = null;
  let lines: readonly TerminalLine[] | null = null;
  let title = '';
  let wasActive = false;
  /** Seconds the crew's reply has stayed up since the quest finished (it clears after a minute). */
  let replyAge = 0;

  const quest = puzzleQuest('first-words');
  const active = () => host.quests()[quest] === 'pipes';
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
      // From the pier edge to the rail fittings is ~2.2 m (the hull lies off the fender piles).
      radius: 2.6,
      enabled: canUse,
      onInteract: () => void speak(id),
    });
  at(tube, 'tube', content().tools.tube.label);
  at(hatch, 'hatch', content().tools.hatch.label);

  async function speak(which: Pipe): Promise<void> {
    if (running) return;
    running = true;
    const c = content();
    const g = host.learn?.answerInWorld(c.quiz, { type: 'scenario', option: c.tools[which].option });
    ship.pipes.play(which);
    if (!c.tools[which].right) {
      host.audio?.sfx.oneShot('hatch_clank', hatch, 0.9);
      title = c.hatch.title;
      lines = readout(c.hatch);
      await sleep(900);
      await host.beat([{ say: lineOf(c, g && !g.correct ? 'hatchWrong' : 'hatch') }], 'Juno');
      running = false;
      return;
    }
    setHint(null);
    host.audio?.sfx.oneShot('tube_voice', tube, 0.9);
    await sleep(1300);
    title = c.reply.title;
    lines = readout(c.reply);
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.7);
    const ok = await host.beat(c.scripts.reply, 'Juno');
    running = false;
    if (!ok) host.hud.toast(T('finishWithJuno'), 3.5);
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
      if (tier === 1) return T('hint1');
      if (tier === 2) {
        setHint('tube');
        return T('hint2');
      }
      if (running || !docked()) return null;
      void speak('tube');
      return T('hint3');
    },
    update(dt: number) {
      locate();
      const on = active();
      if (on !== wasActive) {
        wasActive = on;
        if (!on) setHint(null);
        if (!on && host.quests()[quest] !== 'done') lines = null;
      }
      // The reply lingers a minute by the tube, but not over the christening once the Trial's passed.
      if (lines && host.quests()[quest] === 'done') {
        replyAge += dt;
        if (replyAge > 60 || storyHolds('anchorage', 'sealed', host.quests())) lines = null;
      }
    },
    terminal(): PuzzleTerminal | null {
      const q = host.quests()[quest];
      if (!lines || (q !== 'pipes' && q !== 'done') || !near(5)) return null;
      return { title, lines };
    },
    debug: {
      state: () => ({
        quest: host.quests()[quest] ?? null,
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
