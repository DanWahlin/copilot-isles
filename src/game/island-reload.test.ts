import { describe, expect, it, vi } from 'vitest';
import type { RecordsAlcovesSite } from '../world/sites/records-alcoves';
import { createChannelRouting, type ChannelRoutingHost } from './puzzles/channel-routing/puzzle';
import { createLostLetters, type LettersHost } from './puzzles/lost-letters';
import { createModelMarket, type MarketHost } from './puzzles/model-market';
import { marketStall } from './market/stalls';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import type { ModelMarketSite } from '../world/sites/model-market';
import { LETTERS } from './puzzles/hall-letters';
import { recordingThousandBough } from './thousand-bough-contract.stub';
import { FEN_SOLVED } from './thousand-bough-quests';

vi.mock('../ui/puzzles/LostLetters', () => ({ mountLostLetters: () => () => undefined }));
vi.mock('../ui/puzzles/ModelMarket', () => ({ mountModelMarket: () => () => undefined }));

/**
 * An island that was freed and streamed in again gets new sites and new puzzles (session.ts's
 * island scope, `ThousandBoughContent.teardown`): whatever the player did there must come back from
 * the save, not from the old objects. These build a puzzle, play it, throw it away as an unload
 * does, and build it again from the same save.
 */

/** The save as the learn store keeps it (quests, and each puzzle's solved flag and state). */
function save() {
  const puzzles: Record<string, { solved: boolean; state?: number[] }> = {};
  const quests: Record<string, string> = {};
  return {
    quests,
    learn: {
      busy: false,
      progress: {
        data: { puzzles },
        setPuzzle: (id: string, p: { solved: boolean; state?: number[] }) => void (puzzles[id] = p),
      },
    },
  };
}

function lettersHost(s: ReturnType<typeof save>) {
  return {
    learn: s.learn,
    hud: { toast: vi.fn() },
    dialogue: { say: vi.fn(async () => undefined), play: vi.fn(async () => undefined) },
    audio: null,
    interactions: { add: vi.fn(), remove: vi.fn() },
    player: { x: 0, y: 0, z: 0, heading: 0 },
    quests: () => s.quests,
    setQuest: (id: string, step: string) => void (s.quests[id] = step),
    canAct: () => true,
    beat: vi.fn(async () => true),
    frame: vi.fn(),
    cut: vi.fn(),
    setModal: vi.fn(),
    reducedMotion: () => true,
    place: vi.fn(),
  } as unknown as LettersHost;
}

function alcoves() {
  return {
    desk: { x: 0, y: 0, z: 0, heading: 0 },
    deskTop: { x: 0, z: 0 },
    shot: {},
    setFiled: vi.fn(),
  } as unknown as RecordsAlcovesSite;
}

describe('an island rebuilt after an unload reads the save', () => {
  it('The Lost Letters (P1.3): the letters filed before the unload are still filed', async () => {
    const s = save();
    s.quests['Q1.7'] = 'letters';
    const first = createLostLetters(lettersHost(s), alcoves());
    const d = first.debug as {
      state(): { index: number };
      open(): Promise<void>;
      file(dest: string): Promise<void>;
    };
    await d.open();
    for (const l of LETTERS.slice(0, 2)) await d.file(l.answer);
    expect(d.state().index).toBe(2);
    // The island is freed: its puzzle goes with it.
    first.dispose();
    const again = createLostLetters(lettersHost(s), alcoves());
    expect((again.debug as { state(): { index: number; solved: boolean } }).state()).toMatchObject({
      index: 2,
      solved: false,
    });
    again.dispose();
  });

  it('The Lost Letters: a solved hall comes back with every letter filed', () => {
    const s = save();
    s.quests['Q1.7'] = 'done';
    s.learn.progress.setPuzzle('P1.3', { solved: true, state: [LETTERS.length] });
    const rebuilt = createLostLetters(lettersHost(s), alcoves());
    expect((rebuilt.debug as { state(): { index: number; solved: boolean } }).state()).toMatchObject({
      index: LETTERS.length,
      solved: true,
    });
    rebuilt.dispose();
  });

  it('Channel Routing (P2.1): a rebuilt flume starts at the round you had reached', () => {
    const s = save();
    s.quests['Q2.4'] = 'done';
    s.quests['Q2.5'] = 'channels';
    const host = {
      ...lettersHost(s),
      say: async () => undefined,
      wingman: () => undefined,
      project: () => null,
      label: () => undefined,
      fade: async () => undefined,
      closing: FEN_SOLVED,
      mountUi: () => () => undefined,
    } as unknown as ChannelRoutingHost;
    const round = (p: ReturnType<typeof createChannelRouting>) =>
      ((p.debug as { state(): { round: number } }).state() as { round: number }).round;
    const first = createChannelRouting(host, recordingThousandBough().sys);
    expect(round(first)).toBe(1);
    first.dispose();
    // The checkpoint the puzzle saves with the quests when a round is won.
    s.quests['P2.1'] = 'r3';
    const rebuilt = createChannelRouting(host, recordingThousandBough().sys);
    expect(round(rebuilt)).toBe(3);
    rebuilt.dispose();
  });

  it('The Model Market: jobs done, the purse and the notes come back from the save', async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const learn = new LearnStore(new Progress(storage));
    learn.refundStarfish(5);
    const quests: Record<string, string> = {};
    const host = {
      learn,
      hud: { toast: vi.fn() },
      dialogue: { say: vi.fn(async () => undefined), play: vi.fn(async () => undefined) },
      audio: null,
      interactions: { add: vi.fn(), remove: vi.fn() },
      player: { x: 0, y: 0, z: 0, heading: 0 },
      quests: () => quests,
      setQuest: (id: string, step: string) => void (quests[id] = step),
      canAct: () => true,
      beat: vi.fn(async () => true),
      frame: vi.fn(),
      cut: vi.fn(),
      setModal: vi.fn(),
      reducedMotion: () => true,
      place: vi.fn(),
      filePage: vi.fn(),
      spotlight: vi.fn(),
    } as unknown as MarketHost;
    const site = () =>
      ({
        stand: { x: 0, y: 0, z: 1, heading: 0 },
        counter: { x: 0, y: 0, z: 0 },
        shot: {},
        setDone: vi.fn(),
      }) as unknown as ModelMarketSite;
    type Debug = {
      open(): Promise<void>;
      pickJob(id: string): void;
      pick(p: string): void;
      pay(): void;
      state(): { done: string[]; purse: number };
    };
    const firstSite = site();
    const first = createModelMarket(host, firstSite, marketStall('meridian'));
    const d = first.debug as unknown as Debug;
    await d.open();
    d.pickJob('tour');
    d.pick('auto');
    d.pay();
    // Auto's right-sized for a tour, at the fair price: a starfish spent, none back.
    expect(d.state()).toMatchObject({ done: ['tour'], purse: 4 });
    expect(quests['Q1.A']).toBe('start');
    first.dispose();
    // A new store from the same storage, as the next session's would be.
    const again = new LearnStore(new Progress(storage));
    const rebuiltSite = site();
    const rebuilt = createModelMarket(
      { ...host, learn: again } as MarketHost,
      rebuiltSite,
      marketStall('meridian'),
    );
    expect((rebuilt.debug as unknown as Debug).state()).toMatchObject({ done: ['tour'], purse: 4 });
    expect(rebuiltSite.setDone).toHaveBeenCalledWith(['tour']);
    expect(again.progress.data.market.greeted).toBe(true);
    rebuilt.dispose();
  });
});
