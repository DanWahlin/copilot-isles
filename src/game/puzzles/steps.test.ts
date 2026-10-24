import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readCoursePack } from '../../../tools/course-pack/read';
import { setActiveCourse } from '../../course/active';
import { activateCourse } from '../../course/load';
import type { CoursePack, PuzzleFile } from '../../course/pack';
import {
  PUZZLE_STEPS,
  puzzleContent as puzzleContentOf,
  puzzleQuest,
  puzzleSteps,
} from '../../course/puzzles';
import { createBard } from './bard';
import { createChristening } from './christening';
import { createPaintSails } from './paint-sails';
import { createFirstWords } from './first-words';
import { createSluice } from './sluice';
import { createCrane } from './crane';
import { createGearRack } from './gear-rack';
import { createCrateYard } from './crate-yard';
import { createThreeHelms } from './three-helms';
import { createLostLetters } from './lost-letters';
import { createModelMarket } from './model-market';
import { marketStall } from '../market/stalls';
import { createChannelRouting } from './channel-routing/puzzle';
import { TWIST_CHOICES } from './channel-routing/model';

vi.mock('../../ui/puzzles/LostLetters', () => ({ mountLostLetters: () => () => undefined }));
vi.mock('../../ui/puzzles/ModelMarket', () => ({ mountModelMarket: () => () => undefined }));
vi.mock('../../ui/puzzles/SeaChoice', () => ({ mountSeaChoice: () => () => undefined }));

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * A stand-in for a site or a system: any property is another stand-in, any call returns one, and it
 * reads as 0 in arithmetic. `over` gives the properties a test cares about.
 */
function stub(over: Any = {}): Any {
  const proxy: Any = new Proxy(() => proxy, {
    get: (_, k) =>
      k in over
        ? over[k as string]
        : k === Symbol.toPrimitive
          ? () => 0
          : k === 'then' || k === Symbol.iterator
            ? undefined
            : proxy,
    apply: () => proxy,
  });
  return proxy;
}

/** A puzzle host over a quest map; `set` lists every step it wrote. */
function host(quests: Record<string, string>, puzzles: Any = {}, extra: Any = {}) {
  const set: [string, string][] = [];
  const interactions = new Map<string, Any>();
  const h = stub({
    learn: stub({
      busy: false,
      progress: stub({
        data: { puzzles, quests, fork: null, market: { jobs: {}, greeted: false } },
        setPuzzle: () => undefined,
        markMarketGreeted: () => undefined,
      }),
      getState: () => ({ sails: null, pages: [], starfishPurse: 0 }),
      subscribe: () => () => undefined,
    }),
    audio: null,
    player: { x: 0, y: 0, z: 0, heading: 0 },
    quests: () => quests,
    setQuest: (id: string, step: string) => {
      quests[id] = step;
      set.push([id, step]);
    },
    canAct: () => true,
    beat: async () => true,
    say: async () => undefined,
    interactions: {
      add: (i: Any) => interactions.set(i.id as string, i),
      remove: () => undefined,
    },
    reducedMotion: () => true,
    ...extra,
  });
  return { h, set, interactions };
}

/** Every mechanic step renamed in a puzzle's `"steps"`: `crane` → `crane~crane`. */
const renamed = (name: string, step: string) => `${name}~${step}`;

/**
 * A pack may call a puzzle's mechanic steps anything (`"steps"` in its file, docs/adding-a-course.md):
 * the Copilot app pack with every one renamed plays the same, reading and writing the course's names.
 */
describe('a course that renames every mechanic step', () => {
  const S = (name: string, step: string) => renamed(name, step);
  const Q = (name: string) => puzzleQuest(name);

  beforeAll(() => {
    const app = readCoursePack('copilot-app');
    const puzzles = JSON.parse(JSON.stringify(app.puzzles)) as Record<string, PuzzleFile & Any>;
    for (const [name, steps] of Object.entries(PUZZLE_STEPS))
      puzzles[name]!.steps = Object.fromEntries(steps.map((s) => [s, renamed(name, s)]));
    setActiveCourse({ ...app, puzzles } as CoursePack);
  });
  afterAll(async () => {
    await activateCourse('copilot-app');
  });

  /** No write uses a game name the course renamed. */
  const written = (set: readonly [string, string][]) => {
    for (const [, step] of set) expect(step === 'done' || step.includes('~'), step).toBe(true);
    return set;
  };

  it('resolves every puzzle’s steps through the pack', () => {
    for (const [name, steps] of Object.entries(PUZZLE_STEPS))
      for (const s of steps) expect((puzzleSteps(name as never) as Any)[s]).toBe(renamed(name, s));
  });

  it('the bard, the christening, the palette and first words wait on their renamed steps', () => {
    const bardSite = { seat: { x: 0, y: 0, z: 0, heading: 0 }, spot: { x: 0, y: 0, z: 0, heading: 0 } };
    expect(createBard(host({ [Q('bard')]: 'start' }).h as never, bardSite, () => false).engaged()).toBe(
      false,
    );
    expect(
      createBard(host({ [Q('bard')]: S('bard', 'start') }).h as never, bardSite, () => false).engaged(),
    ).toBe(true);

    const names: (string | null)[] = [];
    const christening = (step: string) =>
      createChristening(host({ [Q('christening')]: step }).h as never, {
        ship: { setName: (n) => names.push(n), christen: async () => undefined },
        nell: { x: 0, y: 0, z: 0, face: () => undefined, moveTo: () => undefined },
        spot: { x: 0, y: 0, z: 0, heading: 0 } as never,
        bow: () => ({ x: 0, z: 0 }),
        shipName: () => 'Kestrel',
      });
    expect(christening(S('christening', 'start')).engaged()).toBe(true);
    christening(S('christening', 'sail'));
    expect(names).toEqual(['Kestrel']);

    const stand = {
      spot: { x: 0, y: 0, z: 0, heading: 0 },
      setPalette: () => undefined,
      setHint: () => undefined,
    };
    const paint = (step: string) =>
      createPaintSails(host({ [Q('palette')]: step }).h as never, stand, { setSails: () => undefined });
    expect(paint('palette').engaged()).toBe(false);
    expect(paint(S('palette', 'palette')).engaged()).toBe(true);

    const ship = {
      group: { localToWorld: <V>(v: V) => v, updateMatrixWorld: () => undefined },
      pipes: {
        tube: { x: 0, y: 0, z: 0 },
        hatch: { x: 1, y: 0, z: 0 },
        setHint: () => undefined,
        play: () => undefined,
      },
    };
    const words = (step: string) =>
      createFirstWords(host({ [Q('first-words')]: step }).h as never, ship as never, () => true);
    expect(words('pipes').engaged()).toBe(false);
    expect(words(S('first-words', 'pipes')).engaged()).toBe(true);
  });

  it('the mill race and the crane read and write their renamed steps', () => {
    // The lever's pulled and the race solved, but the closing beats never ran (a quit mid-way).
    const mill = host(
      { [Q('sluice')]: S('sluice', 'sluice'), [Q('crane')]: S('crane', 'gate') },
      { 'P0.1': { solved: true, flags: ['gate'] } },
    );
    createSluice(mill.h as never, stub() as never);
    expect(written(mill.set)).toEqual([
      [Q('crane'), S('crane', 'brief')],
      [Q('sluice'), S('sluice', 'solved')],
    ]);

    const site = stub({ busy: false });
    const crane = (step: string) => createCrane(host({ [Q('crane')]: step }).h as never, site as never);
    expect(crane('actions').engaged()).toBe(false);
    expect(crane(S('crane', 'gate')).engaged()).toBe(true);
    expect(crane(S('crane', 'brief')).engaged()).toBe(true);
    const stocked = host({ [Q('crane')]: S('crane', 'crane') }, { 'P0.2': { solved: true } });
    createCrane(stocked.h as never, site as never);
    expect(written(stocked.set)).toEqual([[Q('crane'), S('crane', 'solved')]]);
  });

  it('the gear rack waits on its renamed checks, then runs one check per press', async () => {
    const site = stub({ spots: () => ({ rack: { x: 0, y: 1, z: 0 } }), anchors: {} });
    expect(createGearRack(host({ [Q('gear-rack')]: 'checks' }).h as never, site as never).engaged()).toBe(
      false,
    );
    const beats: Any[][] = [];
    const g = host(
      { [Q('gear-rack')]: S('gear-rack', 'checks') },
      {},
      {
        beat: async (steps: Any[]) => {
          beats.push(steps);
          return true;
        },
      },
    );
    const rack = createGearRack(g.h as never, site as never);
    expect(rack.engaged()).toBe(true);
    expect(g.interactions.get('gear:rack')!.enabled()).toBe(true);
    // The intro, four checks (the lantern twice: out of date, then the LTS), and the closing.
    for (let press = 0; press < 6; press++) await (rack.debug.run as () => Promise<void>)();
    const scripts = (puzzleContentOf('gear-rack') as Any).scripts as Record<string, Any[]>;
    expect(beats).toEqual([scripts.intro, scripts.lts, scripts.checked]);
    expect((rack.debug.state as () => Any)()).toMatchObject({ next: 4, signedIn: true });
    expect(rack.terminal!()!.lines.map((l) => l.text)).toContain('$ gh auth status');
  });

  it('the crate yard, the helms, the letters and the market read and write their renamed steps', () => {
    const yard = host({ [Q('crate-yard')]: S('crate-yard', 'crates') }, { 'P1.1': { solved: true } });
    createCrateYard(yard.h as never, stub() as never);
    expect(written(yard.set)).toEqual([[Q('crate-yard'), S('crate-yard', 'solved')]]);
    const crates = (step: string) =>
      createCrateYard(host({ [Q('crate-yard')]: step }).h as never, stub() as never);
    expect(crates('crates').engaged()).toBe(false);
    expect(crates(S('crate-yard', 'crates')).engaged()).toBe(true);

    const helms = host({ [Q('three-helms')]: S('three-helms', 'helms') }, {}, { afloat: () => true });
    const h = createThreeHelms(helms.h as never, stub() as never);
    expect(h.engaged()).toBe(true);
    (h.debug.solve as () => void)();
    expect(written(helms.set)).toEqual([[Q('three-helms'), S('three-helms', 'solved')]]);
    expect(h.engaged()).toBe(false);

    const letters = host({ [Q('lost-letters')]: S('lost-letters', 'letters') }, { 'P1.3': { solved: true } });
    createLostLetters(letters.h as never, stub() as never);
    expect(written(letters.set)).toEqual([[Q('lost-letters'), S('lost-letters', 'solved')]]);
    const sorting = (step: string) =>
      createLostLetters(host({ [Q('lost-letters')]: step }).h as never, stub() as never);
    expect(sorting('letters').engaged()).toBe(false);
    expect(sorting(S('lost-letters', 'letters')).engaged()).toBe(true);

    // After the course's model lesson (the market's `lesson.taught`), Gilda says hello and starts her task.
    const market = host({ 'Q1.6': 'done' });
    const m = createModelMarket(market.h as never, stub() as never, marketStall('meridian'));
    m.update(1 / 60, 0);
    expect(written(market.set)).toEqual([[Q('market'), S('market', 'start')]]);
  });

  it('channel routing reads its renamed steps and sets its renamed `solved`', async () => {
    const shared: boolean[] = [];
    const sys = stub({ flume: stub({ showSharedTrough: (on: boolean) => shared.push(on) }) });
    const extra = { mountUi: () => () => undefined, closing: [] };
    createChannelRouting(
      host({ [Q('channel-routing')]: S('channel-routing', 'start') }, {}, extra).h as never,
      sys as never,
    );
    expect(shared).toEqual([true]);

    const at = host({ [Q('channel-routing')]: S('channel-routing', 'channels') }, {}, extra);
    createChannelRouting(at.h as never, sys as never);
    expect(at.interactions.get('flume:board')!.enabled()).toBe(true);

    const twist = host({ [Q('channel-routing')]: S('channel-routing', 'twist') }, {}, extra);
    const p = createChannelRouting(twist.h as never, sys as never);
    await p.open();
    await (p.debug.choose as (id: string) => Promise<void>)(TWIST_CHOICES.find((c) => c.right)!.id);
    expect(written(twist.set)).toEqual([[Q('channel-routing'), S('channel-routing', 'solved')]]);
  });
});
