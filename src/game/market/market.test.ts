import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseProgress, Progress, type ProgressStorage } from '../../learn/progress';
import { LearnStore } from '../../learn/store';
import { starfishOn } from '../../world/starfish/spots';
import {
  BOARD_SIZE,
  CATEGORIES,
  boardFor,
  formatModelsFile,
  sameModels,
  versionOf,
  type ModelEntry,
} from './catalog';
import { catalogFromTables, parseYamlList } from '../../../tools/models/catalog';
import {
  AUTO_PRICE,
  EFFORTS,
  GILDA_TEXT,
  JOBS,
  MAX_PRICE,
  QUOTES,
  GILDA,
  REFUND,
  effortLastTime,
  feedback,
  grade,
  jobById,
  price,
  refundFor,
  retryChanges,
  retryPlan,
  usedLastTime,
  TIER_OF,
  type Hire,
} from './jobs';
import { createModelMarket, type MarketHost } from '../puzzles/model-market';
import type { ModelMarketSite } from '../../world/sites/model-market';
import { MARKET_STALLS, marketStall, questStall } from './stalls';
import { MARKET } from '../../content/market';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, puzzleQuest, puzzleSteps } from '../../course/puzzles';
import { modelsIn } from './models';
import { BOARDS, MODELS, MODELS_FILE, savedHireName } from './models';

vi.mock('../../ui/puzzles/ModelMarket', () => ({ mountModelMarket: () => () => undefined }));

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const fixture = () =>
  catalogFromTables(
    read('tools/models/fixtures/models-and-pricing.yml'),
    read('tools/models/fixtures/model-comparison.yml'),
  );

class MemStorage implements ProgressStorage {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

describe('model sync (tools/models/sync.mjs, docs/specs/MODEL-MARKET.md §4)', () => {
  it('reads the docs’ list format: quotes, comments, and a row per item', () => {
    const rows = parseYamlList(
      "# a comment\n- model: 'GPT-5 mini'\n  provider: openai\n\n- model: Claude Sonnet 5 # trailing\n  task_area: 'It''s quick'\n",
    );
    expect(rows).toEqual([
      { model: 'GPT-5 mini', provider: 'openai' },
      { model: 'Claude Sonnet 5', task_area: "It's quick" },
    ]);
  });

  it('keeps Claude, GPT and MAI only, one row per model, with the comparison table’s columns', () => {
    const models = fixture();
    const names = models.map((m) => m.name);
    expect(names).not.toContain('Gemini 3.8 Flash');
    expect(names).not.toContain('Grok 4.7');
    expect(names.filter((n) => n === 'GPT-5.4')).toHaveLength(1);
    expect(new Set(models.map((m) => m.family))).toEqual(new Set(['Claude', 'GPT', 'MAI']));
    const mai = models.find((m) => m.name === 'MAI-Code-1.1-Flash')!;
    expect(mai).toMatchObject({ provider: 'microsoft', family: 'MAI', category: 'Lightweight', ga: true });
    expect(mai.taskArea).toBe('General-purpose coding and writing, image understanding');
    expect(models.find((m) => m.name === 'GPT-5.4')!.taskArea).toBe('');
    // No prices anywhere in the game's file.
    expect(JSON.stringify(models)).not.toMatch(/\$|input|output|threshold/);
  });

  it('marks previews (a status other than GA, or "(preview)" in the name)', () => {
    const models = fixture();
    expect(models.find((m) => m.name === 'Claude Fable 5.1')!.ga).toBe(false);
    expect(models.find((m) => m.name === 'Claude Opus 4.8 (fast mode) (preview)')!.ga).toBe(false);
    expect(models.find((m) => m.name === 'Claude Opus 5.5')!.ga).toBe(true);
  });

  it('sorts by category, then name, so a re-run writes the same bytes', () => {
    const models = fixture();
    expect(models.map((m) => m.category)).toEqual(
      [...models].map((m) => m.category).sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b)),
    );
    const file = { source: { repo: 'r', path: 'p', commit: 'c', fetchedAt: 't' }, models };
    expect(formatModelsFile(file)).toBe(formatModelsFile(JSON.parse(formatModelsFile(file))));
    expect(sameModels(models, [...models].reverse())).toBe(true);
    expect(sameModels(models, models.slice(1))).toBe(false);
  });

  it('reads version numbers from names', () => {
    expect(versionOf('GPT-6.1 Sol')).toEqual([6, 1]);
    expect(versionOf('GPT-5 mini')).toEqual([5]);
    expect(versionOf('MAI-Code-1.1-Flash')).toEqual([1, 1]);
    expect(versionOf('GPT-5.3-Codex')).toEqual([5, 3]);
  });
});

describe('the board rule (MODEL-MARKET.md §4.2)', () => {
  const m = (name: string, family: ModelEntry['family'], ga = true): ModelEntry => ({
    name,
    family,
    provider: family === 'Claude' ? 'anthropic' : family === 'GPT' ? 'openai' : 'microsoft',
    category: 'Powerful',
    taskArea: '',
    excelsAt: '',
    ga,
  });

  it('takes GA first, newest first, at most two a family, then fills; ties go alphabetically', () => {
    const models = [
      m('GPT-6.1 Sol', 'GPT'),
      m('GPT-6 Sol', 'GPT'),
      m('GPT-6 Astra', 'GPT'),
      m('Claude Opus 5.5', 'Claude'),
      m('Claude Opus 5', 'Claude'),
      m('Claude Fable 5.1', 'Claude', false),
    ];
    const b = boardFor(models, 'Powerful');
    expect(b.shown.map((x) => x.name)).toEqual([
      'GPT-6.1 Sol',
      'GPT-6 Astra',
      'Claude Opus 5.5',
      'Claude Opus 5',
    ]);
    expect(b.more.map((x) => x.name)).toEqual(['GPT-6 Sol', 'Claude Fable 5.1']);
  });

  it('fills past two a family when the others run out, and previews only fill', () => {
    const b = boardFor(
      [m('GPT-6 Sol', 'GPT'), m('GPT-5 Sol', 'GPT'), m('GPT-4 Sol', 'GPT'), m('Claude 9', 'Claude', false)],
      'Powerful',
    );
    expect(b.shown.map((x) => x.name)).toEqual(['GPT-6 Sol', 'GPT-5 Sol', 'GPT-4 Sol', 'Claude 9']);
  });

  it('mixes the families on the fixture’s boards', () => {
    const models = fixture();
    expect(boardFor(models, 'Lightweight').shown.map((x) => x.name)).toEqual([
      'GPT-6 Luna',
      'GPT-5.6 Luna',
      'Claude Haiku 5.5',
      'MAI-Code-1.1-Flash',
    ]);
    expect(boardFor(models, 'Powerful').shown.map((x) => x.name)).toEqual([
      'GPT-6.1 Sol',
      'GPT-6 Astra',
      'GPT-6 Sol',
      'Claude Opus 5.5',
    ]);
  });
});

describe('courses/copilot-app/models.json', () => {
  it('is a sync’s output: GitHub Docs as the source, sorted, no prices', () => {
    expect(MODELS_FILE.source.repo).toBe('github/docs');
    expect(MODELS_FILE.source.path).toBe('data/tables/copilot');
    expect(MODELS_FILE.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(formatModelsFile(MODELS_FILE)).toBe(read('courses/copilot-app/models.json'));
    for (const x of MODELS) {
      expect(['Claude', 'GPT', 'MAI'], x.name).toContain(x.family);
      expect(CATEGORIES, x.name).toContain(x.category);
    }
    expect(read('courses/copilot-app/models.json')).not.toMatch(/\$\d/);
  });

  it('fills every board with GA models', () => {
    for (const b of BOARDS) {
      expect(b.shown.length, b.category).toBe(Math.min(BOARD_SIZE, b.shown.length + b.more.length));
      expect(b.shown.length, b.category).toBeGreaterThan(0);
      expect(b.shown[0]!.ga, b.category).toBe(true);
    }
  });
});

describe('prices, grades and refunds (MODEL-MARKET.md §3)', () => {
  const hire = (category: string, effort: 'low' | 'default' | 'high'): Hire => ({
    auto: false,
    category,
    model: `${category} model`,
    effort,
  });
  const AUTO: Hire = { auto: true };

  it('prices 1-4 starfish: bigger models cost more, High effort one more', () => {
    expect(price(AUTO)).toBe(1);
    expect(price(hire('Lightweight', 'default'))).toBe(1);
    expect(price(hire('Versatile', 'default'))).toBe(2);
    expect(price(hire('Powerful', 'default'))).toBe(3);
    expect(price(hire('Lightweight', 'high'))).toBe(2);
    expect(price(hire('Powerful', 'high'))).toBe(MAX_PRICE);
    for (const c of CATEGORIES)
      for (const e of EFFORTS) expect(price(hire(c, e))).toBeLessThanOrEqual(MAX_PRICE);
  });

  it('grades quick looks by the course’s rule: Auto, or any model on its default (or low) effort', () => {
    for (const id of ['tour', 'explain'] as const) {
      const job = jobById(id)!;
      expect(grade(job, AUTO), id).toEqual({ outcome: 'right', reason: 'quick-right' });
      // "keep Auto or the current model and its default reasoning effort", whatever the model's size.
      for (const e of ['low', 'default'] as const) {
        expect(grade(job, hire('Lightweight', e)), id).toEqual({ outcome: 'right', reason: 'quick-right' });
        expect(grade(job, hire('Versatile', e)), id).toEqual({ outcome: 'right', reason: 'quick-keep' });
        expect(grade(job, hire('Powerful', e)), id).toEqual({ outcome: 'right', reason: 'quick-keep' });
      }
      // Only High effort is more than a quick look needs.
      for (const c of CATEGORIES)
        expect(grade(job, hire(c, 'high')), `${id} ${c}`).toEqual({
          outcome: 'over',
          reason: 'quick-over-effort',
        });
      for (const c of CATEGORIES)
        for (const e of EFFORTS) expect(grade(job, hire(c, e)).outcome).not.toBe('short');
    }
  });

  it('grades hard jobs: Auto or a model suited to complex coding with effort; light or low falls short', () => {
    for (const id of ['bug', 'files'] as const) {
      const job = jobById(id)!;
      // Auto chooses a model for your task: never a failure, with a nudge to choose (and a Retry).
      expect(grade(job, AUTO), id).toEqual({ outcome: 'right', reason: 'hard-auto' });
      for (const e of EFFORTS) expect(grade(job, hire('Lightweight', e)).reason, id).toBe('hard-short-model');
      expect(grade(job, hire('Versatile', 'low')).reason, id).toBe('hard-short-effort');
      expect(grade(job, hire('Versatile', 'default')).reason, id).toBe('hard-short-effort');
      expect(grade(job, hire('Versatile', 'high')), id).toEqual({ outcome: 'right', reason: 'hard-right' });
      expect(grade(job, hire('Powerful', 'low')).reason, id).toBe('hard-short-effort');
      expect(grade(job, hire('Powerful', 'default')), id).toEqual({ outcome: 'right', reason: 'hard-right' });
      expect(grade(job, hire('Powerful', 'high')), id).toEqual({ outcome: 'right', reason: 'hard-right' });
      for (const c of CATEGORIES)
        for (const e of EFFORTS) expect(grade(job, hire(c, e)).outcome).not.toBe('over');
    }
  });

  it('refunds less than every right-sized hire: a right-sized job costs at least one starfish', () => {
    for (const job of JOBS)
      for (const h of [AUTO, ...CATEGORIES.flatMap((c) => EFFORTS.map((e) => hire(c, e)))])
        if (grade(job, h).outcome === 'right') {
          expect(refundFor(job, h), `${job.id} ${JSON.stringify(h)}`).toBeLessThan(price(h));
          expect(price(h) - refundFor(job, h)).toBeGreaterThanOrEqual(1);
        }
    expect(REFUND.quick).toBe(0);
    expect(REFUND.hard).toBe(2);
    expect(refundFor(jobById('tour')!, AUTO)).toBe(0);
    // Auto on a hard job is right-sized at its fair price: nothing back.
    expect(refundFor(jobById('bug')!, AUTO)).toBe(0);
    expect(refundFor(jobById('bug')!, hire('Powerful', 'default'))).toBe(2);
    expect(refundFor(jobById('bug')!, hire('Versatile', 'high'))).toBe(2);
    // Whatever a pack's refund, the game never gives back the whole hire.
    expect(refundFor({ size: 'quick' }, AUTO)).toBe(0);
  });

  it('plans a Retry with nothing chosen: you pick the different model, or the effort, yourself', () => {
    const light = hire('Lightweight', 'low') as Extract<Hire, { auto: false }>;
    const byModel = retryPlan(light, 'model');
    expect(byModel).toMatchObject({ kind: 'model', live: 'model' });
    // The model that fell short can't be picked again; another (or Auto) can.
    expect(usedLastTime(byModel, 'Lightweight', light.model)).toBe(true);
    expect(usedLastTime(byModel, 'Lightweight', 'another')).toBe(false);
    expect(usedLastTime(byModel, 'auto')).toBe(false);
    expect(retryChanges(byModel, light)).toBe(false);
    expect(retryChanges(byModel, hire('Powerful', 'low'))).toBe(true);
    const versatile = hire('Versatile', 'default') as Extract<Hire, { auto: false }>;
    const byEffort = retryPlan(versatile, 'effort');
    expect(byEffort.live).toBe('effort');
    expect(effortLastTime(byEffort, versatile.model, 'default')).toBe(true);
    expect(effortLastTime(byEffort, versatile.model, 'high')).toBe(false);
    expect(retryChanges(byEffort, versatile)).toBe(false);
    expect(retryChanges(byEffort, { ...versatile, effort: 'high' })).toBe(true);
    // After Auto either Retry turns it off: the model picker is live, and Auto can't be picked again.
    for (const kind of ['model', 'effort'] as const) {
      const p = retryPlan(AUTO, kind);
      expect(p.live).toBe('model');
      expect(usedLastTime(p, 'auto')).toBe(true);
      expect(retryChanges(p, AUTO)).toBe(false);
      expect(retryChanges(p, hire('Powerful', 'default'))).toBe(true);
    }
  });

  it('gives each outcome a stamp, a voiced line, the course sentences behind it, and its Retry', () => {
    const tour = jobById('tour')!;
    const bug = jobById('bug')!;
    const over = feedback(tour, hire('Powerful', 'high'));
    expect(over).toMatchObject({ stamp: '! Overspent', key: 'overEffort', retry: null });
    expect(over.summary).toBe(
      'Powerful model on High did the job, but High effort cost 4 starfish for a 1-starfish job.',
    );
    expect(over.quotes).toEqual([QUOTES.effort, tour.why]);
    // Your (bigger) model on its default effort: right-sized, and the price is all it costs you.
    const keep = feedback(tour, hire('Powerful', 'default'));
    expect(keep).toMatchObject({ outcome: 'right', stamp: '✓ Right-sized', key: 'keep', retry: null });
    expect(keep.summary).toBe(
      'Powerful model on Default did the job, right-sized: a quick look needs no extra effort. It cost 3 starfish, where 1 would do.',
    );
    expect(keep.quotes).toEqual([tour.why, QUOTES.cost]);
    expect(GILDA_TEXT[GILDA.keep]).toMatch(/default effort is fine for a quick look/);
    // Auto on a hard job: right-sized, the course's "consider", and a Retry to try a model and effort.
    const auto = feedback(bug, AUTO);
    expect(auto).toMatchObject({ outcome: 'right', key: 'hardAuto', retry: 'again' });
    expect(auto.quotes).toEqual([QUOTES.auto, QUOTES.hard, QUOTES.autoHidden]);
    expect(GILDA_TEXT[GILDA.hardAuto]).toMatch(/turn Auto off/);
    const short = feedback(bug, hire('Lightweight', 'low'));
    expect(short).toMatchObject({ stamp: '↻ Fell short', key: 'short', retry: 'short' });
    expect(short.quotes).toContain(QUOTES.retry);
    expect(feedback(bug, hire('Versatile', 'default')).quotes).toEqual([
      QUOTES.hard,
      QUOTES.effort,
      QUOTES.retry,
    ]);
    expect(feedback(tour, AUTO).quotes).toContain(QUOTES.auto);
    // Right-sized at the fair price (nothing back) or with starfish back: each its own line.
    expect(feedback(tour, AUTO)).toMatchObject({ key: 'fair', retry: null });
    expect(feedback(bug, hire('Powerful', 'default'))).toMatchObject({ key: 'right', retry: 'again' });
    expect(feedback(jobById('files')!, hire('Powerful', 'high')).stamp).toBe('✓ Right-sized');
  });

  it('shows every hard job “You do not need a specific model” and that models vary', () => {
    for (const job of JOBS)
      expect(job.also, job.id).toEqual(job.size === 'hard' ? [QUOTES.noSpecific, QUOTES.vary] : []);
    expect(QUOTES.noSpecific.text).toBe('You do not need a specific model for this course.');
  });
});

describe('teaching accuracy (Chapter 01)', () => {
  const readme = read('courses/copilot-app/public/course/ch01/README.md');
  const lines = JSON.parse(read('courses/copilot-app/voice/lines.json')) as {
    lines: { id: string; speaker: string; text: string }[];
  };

  it('quotes the course word for word', () => {
    for (const [k, q] of Object.entries(QUOTES)) expect(readme, k).toContain(q.text);
    for (const j of JOBS) expect(readme, j.id).toContain(j.why.text);
  });

  it('voices Gilda’s lines as written here', () => {
    for (const [id, text] of Object.entries(GILDA_TEXT)) {
      const l = lines.lines.find((x) => x.id === id);
      expect(l, id).toBeDefined();
      expect(l!.speaker).toBe('Gilda');
      expect(l!.text, id).toBe(text);
    }
  });
});

describe('the starfish purse (MODEL-MARKET.md §3)', () => {
  it('earns one a pickup, spends at the market, and never goes below zero', () => {
    const store = new LearnStore(new Progress(new MemStorage()));
    const [a, b] = starfishOn('meridian');
    store.collectStarfish(a!.id, 'meridian');
    store.collectStarfish(b!.id, 'meridian');
    store.collectStarfish(b!.id, 'meridian');
    expect(store.getState().starfishPurse).toBe(2);
    expect(store.spendStarfish(3)).toBe(false);
    expect(store.getState().starfishPurse).toBe(2);
    expect(store.spendStarfish(AUTO_PRICE)).toBe(true);
    expect(store.getState().starfishPurse).toBe(1);
    const coins = store.getState().doubloons;
    store.refundStarfish(1, 5);
    expect(store.getState().starfishPurse).toBe(2);
    expect(store.getState().doubloons).toBe(coins + 5);
    // The found count is the ids, unchanged by spending.
    expect(store.getState().starfish).toHaveLength(2);
  });

  it('gives an old save one to spend for each starfish it found, and keeps a saved balance', () => {
    const old = parseProgress(JSON.stringify({ v: 1, starfish: ['sf.m.plaza', 'sf.m.mole', 'sf.m.mole'] }));
    expect(old.starfishPurse).toBe(2);
    expect(old.market).toEqual({ jobs: {}, greeted: false });
    const spent = parseProgress(JSON.stringify({ v: 1, starfish: ['sf.m.plaza'], starfishPurse: 0 }));
    expect(spent.starfishPurse).toBe(0);
    expect(parseProgress(JSON.stringify({ v: 1, starfishPurse: -4 })).starfishPurse).toBe(0);
    expect(parseProgress(JSON.stringify({ v: 1, starfishPurse: 2.7 })).starfishPurse).toBe(2);
  });

  it('saves hires, keeps a job done, and loads a hire whose model has left the board', () => {
    const storage = new MemStorage();
    const p = new Progress(storage);
    p.recordHire('tour', { outcome: 'right', category: 'Auto', model: null, effort: null, paid: 1 });
    p.recordHire('tour', {
      outcome: 'over',
      category: 'Powerful',
      model: 'Retired 9',
      effort: 'high',
      paid: 4,
    });
    p.markMarketGreeted();
    const again = new Progress(storage).data.market;
    expect(again.greeted).toBe(true);
    expect(again.jobs.tour!.done).toBe(true);
    expect(again.jobs.tour!.last).toMatchObject({ model: 'Retired 9', outcome: 'over' });
    expect(savedHireName(again.jobs.tour!.last!)).toBe('a Powerful model');
    expect(savedHireName({ category: 'Auto', model: null })).toBe('Auto');
    expect(savedHireName({ category: MODELS[0]!.category, model: MODELS[0]!.name })).toBe(MODELS[0]!.name);
    // A save keeps the course's category name; the grading reads it through the course's binding.
    expect(TIER_OF[again.jobs.tour!.last!.category]).toBe('large');
    // Junk in a hand-edited save is dropped, not thrown.
    const junk = parseProgress(
      JSON.stringify({ v: 1, market: { jobs: { bug: { done: 'yes', last: { outcome: 'great' } } } } }),
    );
    expect(junk.market.jobs.bug).toEqual({ done: false, last: null });
  });
});

describe('the market at every stall (MODEL-MARKET.md §2, §5)', () => {
  type Debug = {
    open(): Promise<void>;
    pickJob(id: string): void;
    pick(p: string): void;
    model(m: string): void;
    effort(e: string): void;
    pay(): void;
    retry(kind: 'model' | 'effort'): void;
    back(): void;
    close(): void;
    state(): {
      open: boolean;
      purse: number;
      done: string[];
      taught: boolean;
      practice: { quick: boolean; retry: boolean } | null;
      view: {
        screen: string;
        draft: { auto: boolean; category: string; model: string; effort: string; pending: string | null };
        retry: unknown;
        notice: string | null;
        practice: { quick: boolean; retry: boolean } | null;
        result: { feedback: { outcome: string; retry: string | null } } | null;
      };
    };
  };
  /** The course's model lesson taught (Oren's done): every stall grades. */
  const TAUGHT = { 'Q1.6': 'done' } as const;
  const stocked = () => {
    const s = new LearnStore(new Progress(new MemStorage()));
    s.refundStarfish(20);
    return s;
  };
  const play = (
    island: 'anchorage' | 'meridian' | 'thousand-bough',
    store = stocked(),
    quests: Record<string, string> = { ...TAUGHT },
  ) => {
    const said: string[][] = [];
    const pages: string[] = [];
    const labels: string[] = [];
    const host = {
      learn: store,
      hud: { toast: () => undefined },
      dialogue: {
        say: async () => undefined,
        play: async (ids: string[]) => void said.push(ids),
        cancel: () => undefined,
      },
      audio: null,
      interactions: {
        add: (it: { label: () => string }) => void labels.push(it.label()),
        remove: () => undefined,
      },
      player: { x: 0, y: 0, z: 0, heading: 0 },
      quests: () => quests,
      setQuest: (id: string, step: string) => void (quests[id] = step),
      canAct: () => true,
      beat: async () => true,
      frame: () => undefined,
      cut: () => undefined,
      setModal: () => undefined,
      reducedMotion: () => true,
      place: () => undefined,
      filePage: (id: string) => void pages.push(id),
      spotlight: () => undefined,
    } as unknown as MarketHost;
    const site = {
      stand: { x: 0, y: 0, z: 1, heading: 0 },
      counter: { x: 0, y: 0, z: 0 },
      shot: {},
      setDone: () => undefined,
    } as unknown as ModelMarketSite;
    const p = createModelMarket(host, site, marketStall(island));
    return { p, d: p.debug as unknown as Debug, quests, said, pages, store, labels };
  };

  it('has a stall on every island, and only Gilda’s runs the story', () => {
    expect(MARKET_STALLS.map((s) => s.island).sort()).toEqual(['anchorage', 'meridian', 'thousand-bough']);
    expect(MARKET_STALLS.filter((s) => s.lines === 'gilda').map((s) => s.puzzle)).toEqual(['market']);
    expect(MARKET_STALLS.filter((s) => questStall(s.island)).map((s) => s.puzzle)).toEqual(['market']);
  });

  it('Retry opens the work order with the model picker live and nothing chosen', async () => {
    const { d } = play('meridian');
    d.state();
    await d.open();
    (d as unknown as { pickJob(id: string): void }).pickJob('bug');
    d.pick('Lightweight');
    d.pay();
    expect(d.state().view.screen).toBe('result');
    const lastModel = d.state().view.draft.model;
    d.retry('model');
    let s = d.state();
    expect(s.view.screen).toBe('hire');
    expect(s.view.draft.pending).toBe('model');
    expect(s.view.retry).toMatchObject({ kind: 'model', live: 'model' });
    // Nothing chosen: signing waits (no starfish taken).
    const purse = s.purse;
    d.pay();
    s = d.state();
    expect(s.purse).toBe(purse);
    expect(s.view.screen).toBe('hire');
    expect(s.view.notice).toBeTruthy();
    // The same category picks another of its models, never the one that fell short.
    d.pick('Lightweight');
    s = d.state();
    expect(s.view.draft.pending).toBeNull();
    expect(s.view.draft.model).not.toBe(lastModel);
    d.model(lastModel);
    expect(d.state().view.draft.model).not.toBe(lastModel);
    d.pick('Powerful');
    d.pay();
    s = d.state();
    expect(s.view.screen).toBe('result');
    expect(s.done).toContain('bug');
  });

  it('Retry: more effort keeps the model and waits for the effort; after Auto, Auto is off', async () => {
    const { d } = play('anchorage');
    await d.open();
    d.pickJob('files');
    d.pick('Versatile');
    d.pay();
    d.retry('effort');
    let s = d.state();
    expect(s.view.draft).toMatchObject({ category: 'Versatile', pending: 'effort', effort: 'default' });
    d.effort('default');
    expect(d.state().view.draft.pending).toBe('effort');
    d.effort('high');
    d.pay();
    expect(d.state().done).toContain('files');
    d.back();
    d.pickJob('bug');
    d.pick('auto');
    d.pay();
    d.retry('effort');
    s = d.state();
    expect(s.view.draft).toMatchObject({ auto: false, pending: 'model' });
    d.pick('auto');
    expect(d.state().view.draft.auto).toBe(false);
    d.pick(modelsIn('Powerful').length ? 'Powerful' : 'Versatile');
    d.pay();
    expect(d.state().done).toContain('bug');
  });

  it('shares one board and one purse: a job done at one stall is done at all', async () => {
    const store = new LearnStore(new Progress(new MemStorage()));
    store.refundStarfish(6);
    const tb = play('thousand-bough', store);
    await tb.d.open();
    tb.d.pickJob('tour');
    tb.d.pick('auto');
    tb.d.pay();
    // The fair price: one spent, none back; and only Gilda's stall touches the story's task.
    expect(tb.d.state()).toMatchObject({ purse: 5, done: ['tour'] });
    expect(tb.quests).toEqual(TAUGHT);
    const anc = play('anchorage', store);
    expect(anc.d.state()).toMatchObject({ purse: 5, done: ['tour'] });
    // Another keeper says every line in their own voice, never Gilda's.
    await anc.d.open();
    anc.d.close();
    expect(anc.said.flat().every((id) => !id.startsWith('mer.'))).toBe(true);
    expect(anc.said.flat().length).toBeGreaterThan(0);
    expect(tb.said.flat()).toContain(MARKET.keepers!['thousand-bough']!.fair.voice);
  });

  /** Right-sizes every job on the board at a stall. */
  const clearBoard = async (d: Debug) => {
    await d.open();
    for (const job of JOBS) {
      const hires: Hire[] = [
        { auto: true },
        ...CATEGORIES.flatMap((category) =>
          EFFORTS.map((effort) => ({
            auto: false as const,
            category,
            model: modelsIn(category)[0]!.name,
            effort,
          })),
        ),
      ];
      const h = hires.find((x) => grade(job, x).outcome === 'right')!;
      d.pickJob(job.id);
      d.pick(h.auto ? 'auto' : h.category);
      if (!h.auto) d.effort(h.effort);
      d.pay();
      expect(d.state().view.screen).toBe('result');
      d.back();
    }
  };

  it('every keeper voices every line in their own voice', async () => {
    for (const island of ['anchorage', 'thousand-bough'] as const) {
      const own = MARKET.keepers![island]!;
      const { d, said } = play(island);
      await clearBoard(d);
      d.close();
      const ids = said.flat();
      expect(ids.every((id) => !Object.values(GILDA).includes(id))).toBe(true);
      for (const key of ['hello', 'done', 'bye'] as const) expect(ids).toContain(own[key].voice);
    }
  });

  it('jobs done at another stall count, but only Gilda’s stall finishes her task and gives its page', async () => {
    const store = stocked();
    const quests: Record<string, string> = { ...TAUGHT };
    const anc = play('anchorage', store, quests);
    await clearBoard(anc.d);
    expect(anc.d.state().done).toHaveLength(JOBS.length);
    expect(quests).toEqual(TAUGHT);
    expect(anc.pages).toEqual([]);
    expect(anc.said.flat()).toContain(MARKET.keepers!.anchorage!.done.voice);

    // At Port Meridian: as you come up, Gilda says hello and finishes the task with her line.
    const mer = play('meridian', store, quests);
    expect(quests).toEqual(TAUGHT);
    mer.p.update(1 / 60, 0);
    expect(quests[puzzleQuest('market')]).toBe('done');
    expect(mer.pages).toEqual([puzzleContent<PuzzleFile & { page: string }>('market').page]);
    expect(mer.said).toEqual([[GILDA.hello, GILDA.done]]);
    // Only once: at the counter next, she just points you at the board.
    mer.p.update(1 / 60, 0);
    await mer.d.open();
    expect(mer.said).toEqual([[GILDA.hello, GILDA.done], [GILDA.open]]);
    expect(mer.pages).toHaveLength(1);
  });

  it('a board finished elsewhere is done when you open Gilda’s stall (her hello already said)', async () => {
    const store = stocked();
    const quests: Record<string, string> = { ...TAUGHT };
    const mer = play('meridian', store, quests);
    await mer.d.open();
    mer.d.close();
    expect(quests[puzzleQuest('market')]).toBe(puzzleSteps('market').start);
    expect(mer.pages).toEqual([]);
    await clearBoard(play('thousand-bough', store, quests).d);
    expect(quests[puzzleQuest('market')]).toBe(puzzleSteps('market').start);
    const back = play('meridian', store, quests);
    await back.d.open();
    expect(quests[puzzleQuest('market')]).toBe('done');
    expect(back.pages).toHaveLength(1);
    expect(back.said).toEqual([[GILDA.done]]);
  });

  it('holds off grading at every stall until the course’s model lesson, and the keeper says so', async () => {
    for (const island of ['anchorage', 'meridian', 'thousand-bough'] as const) {
      const quests: Record<string, string> = { 'Q1.5': 'done', 'Q1.6': 'start' };
      const { p, d, said, labels, store } = play(island, stocked(), quests);
      expect(labels[0], island).toMatch(/^Ask .+ about the Model Market$/);
      p.update(1 / 60, 0);
      // No hello (nor Gilda's optional task) as you come up, and the work order stays shut.
      expect(said, island).toEqual([]);
      await d.open();
      const early = island === 'meridian' ? GILDA.early : MARKET.keepers![island]!.early.voice;
      expect(d.state(), island).toMatchObject({ open: false, taught: false });
      expect(said, island).toEqual([[early]]);
      expect(p.engaged(), island).toBe(false);
      expect(p.hint(1), island).toBeNull();
      expect(quests[puzzleQuest('market')], island).toBeUndefined();
      expect(store.getState().starfishPurse).toBe(20);
      // Oren sends you down (Q1.6 at market): every stall grades from then on.
      quests['Q1.6'] = 'market';
      await d.open();
      expect(d.state(), island).toMatchObject({ open: true, taught: true });
    }
  });

  it('runs Oren’s practice at Gilda’s: stakes the starfish, then a quick look and a hard job’s Retry', async () => {
    const store = new LearnStore(new Progress(new MemStorage()));
    const quests: Record<string, string> = { 'Q1.5': 'done', 'Q1.6': 'market' };
    const mer = play('meridian', store, quests);
    await mer.d.open();
    // Broke on the story's path: the keeper stakes you up to the dearest hire.
    let st = mer.d.state();
    expect(st.purse).toBe(MAX_PRICE);
    expect(st.view.notice).toMatch(/staked you 4 starfish/);
    expect(st.view.practice).toEqual({ quick: false, retry: false });
    // A quick look overspent doesn't count; right-sized with your (big) model on Default does.
    mer.d.pickJob('tour');
    mer.d.pick('Powerful');
    mer.d.effort('high');
    mer.d.pay();
    expect(mer.d.state().view.practice).toEqual({ quick: false, retry: false });
    expect(mer.d.state().purse).toBe(MAX_PRICE);
    mer.d.back();
    mer.d.pickJob('tour');
    mer.d.pick('Powerful');
    mer.d.effort('default');
    mer.d.pay();
    expect(mer.d.state().view.practice).toEqual({ quick: true, retry: false });
    // A hard job with Auto: right-sized, and it offers a Retry (a different model, to compare).
    mer.d.back();
    mer.d.pickJob('bug');
    mer.d.pick('auto');
    mer.d.pay();
    st = mer.d.state();
    expect(st.view.result?.feedback).toMatchObject({ outcome: 'right', retry: 'again' });
    expect(quests['Q1.6']).toBe('market');
    mer.d.retry('model');
    expect(mer.d.state().view.draft).toMatchObject({ auto: false, pending: 'model' });
    mer.d.pick('Powerful');
    mer.d.effort('high');
    mer.d.pay();
    // Practised: Q1.6 moves on (tell Oren), Gilda says so after her grade, and the stake stops.
    expect(quests['Q1.6']).toBe('practiced');
    expect(mer.said.at(-1)).toEqual([GILDA.right, GILDA.practiced!]);
    expect(mer.d.state().practice).toBeNull();
    const left = mer.d.state().purse;
    mer.d.back();
    mer.d.pickJob('files');
    mer.d.pick('auto');
    mer.d.pay();
    expect(mer.d.state().purse).toBe(left - AUTO_PRICE);
  });

  it('counts the practice only at Gilda’s stall, and a quick look done before (in the save) counts', async () => {
    const store = stocked();
    const quests: Record<string, string> = { 'Q1.5': 'done', 'Q1.6': 'market' };
    const anc = play('anchorage', store, quests);
    await anc.d.open();
    expect(anc.d.state().view.practice).toBeNull();
    anc.d.pickJob('explain');
    anc.d.pick('auto');
    anc.d.pay();
    anc.d.back();
    anc.d.pickJob('files');
    anc.d.pick('Lightweight');
    anc.d.pay();
    anc.d.retry('model');
    anc.d.pick('Powerful');
    anc.d.pay();
    expect(quests['Q1.6']).toBe('market');
    const mer = play('meridian', store, quests);
    await mer.d.open();
    expect(mer.d.state().view.practice).toEqual({ quick: true, retry: false });
    mer.d.pickJob('files');
    mer.d.pick('Versatile');
    mer.d.pay();
    expect(mer.d.state().view.result?.feedback).toMatchObject({ outcome: 'short', retry: 'short' });
    mer.d.retry('effort');
    mer.d.effort('high');
    mer.d.pay();
    expect(quests['Q1.6']).toBe('practiced');
  });

  it('broke after the lesson: the keeper says so, and nothing is staked', async () => {
    const store = new LearnStore(new Progress(new MemStorage()));
    const mer = play('meridian', store);
    await mer.d.open();
    expect(mer.d.state()).toMatchObject({ open: true, purse: 0 });
    expect(mer.said.flat()).toContain(GILDA.broke);
    mer.d.pickJob('tour');
    mer.d.pay();
    expect(mer.d.state().view.screen).toBe('hire');
  });
});
