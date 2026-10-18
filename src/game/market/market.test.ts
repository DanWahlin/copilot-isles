import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  REFUND,
  feedback,
  grade,
  jobById,
  price,
  retryHire,
  TIER_OF,
  type Hire,
} from './jobs';
import { BOARDS, MODELS, MODELS_FILE, savedHireName } from './models';

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

  it('grades each job: quick looks right-sized with Auto or a light model, overspent with more', () => {
    for (const id of ['tour', 'explain'] as const) {
      const job = jobById(id)!;
      expect(grade(job, AUTO).outcome, id).toBe('right');
      expect(grade(job, hire('Lightweight', 'default')).outcome, id).toBe('right');
      expect(grade(job, hire('Lightweight', 'low')).outcome, id).toBe('right');
      expect(grade(job, hire('Lightweight', 'high'))).toEqual({
        outcome: 'over',
        reason: 'quick-over-effort',
      });
      expect(grade(job, hire('Versatile', 'default')).outcome, id).toBe('over');
      expect(grade(job, hire('Powerful', 'high'))).toEqual({ outcome: 'over', reason: 'quick-over-model' });
      for (const c of CATEGORIES)
        for (const e of EFFORTS) expect(grade(job, hire(c, e)).outcome).not.toBe('short');
    }
  });

  it('grades each hard job: a model suited to complex coding and higher effort, or it falls short', () => {
    for (const id of ['bug', 'files'] as const) {
      const job = jobById(id)!;
      expect(grade(job, AUTO), id).toEqual({ outcome: 'short', reason: 'hard-short-auto' });
      for (const e of EFFORTS) expect(grade(job, hire('Lightweight', e)).reason, id).toBe('hard-short-model');
      expect(grade(job, hire('Versatile', 'default')).reason, id).toBe('hard-short-effort');
      expect(grade(job, hire('Versatile', 'high')).outcome, id).toBe('right');
      expect(grade(job, hire('Powerful', 'low')).reason, id).toBe('hard-short-effort');
      expect(grade(job, hire('Powerful', 'default')).outcome, id).toBe('right');
      expect(grade(job, hire('Powerful', 'high')).outcome, id).toBe('right');
      for (const c of CATEGORIES)
        for (const e of EFFORTS) expect(grade(job, hire(c, e)).outcome).not.toBe('over');
    }
  });

  it('never refunds more than a right-sized hire cost', () => {
    for (const job of JOBS)
      for (const h of [AUTO, ...CATEGORIES.flatMap((c) => EFFORTS.map((e) => hire(c, e)))])
        if (grade(job, h).outcome === 'right')
          expect(REFUND[job.size], `${job.id}`).toBeLessThanOrEqual(price(h));
    expect(REFUND.quick).toBe(1);
    expect(REFUND.hard).toBe(2);
  });

  it('offers a Retry that does better: a stronger model, or more effort', () => {
    const first = (c: string) => `${c} first`;
    const bug = jobById('bug')!;
    for (const h of [
      AUTO,
      hire('Lightweight', 'low'),
      hire('Versatile', 'default'),
      hire('Powerful', 'low'),
    ]) {
      // Each Retry costs at least as much (a stronger model or more effort), and two get it done.
      for (const kind of ['model', 'effort'] as const)
        expect(price(retryHire(h, kind, first))).toBeGreaterThanOrEqual(price(h));
      const twice = retryHire(retryHire(h, 'model', first), 'effort', first);
      expect(grade(bug, twice).outcome, JSON.stringify(h)).toBe('right');
    }
    expect(retryHire(hire('Versatile', 'default'), 'effort', first)).toMatchObject({
      category: 'Versatile',
      effort: 'high',
    });
    expect(retryHire(hire('Lightweight', 'high'), 'model', first)).toMatchObject({
      category: 'Powerful',
      effort: 'high',
    });
    // A different model or more effort gets a Lightweight or Versatile hire there in one Retry.
    expect(grade(bug, retryHire(hire('Lightweight', 'default'), 'model', first)).outcome).toBe('right');
    expect(grade(bug, retryHire(hire('Versatile', 'default'), 'effort', first)).outcome).toBe('right');
    expect(grade(bug, retryHire(hire('Powerful', 'low'), 'model', first)).outcome).toBe('right');
    expect(retryHire(AUTO, 'effort', first)).toMatchObject({
      auto: false,
      category: 'Versatile',
      effort: 'high',
    });
  });

  it('gives each outcome a stamp, a voiced line, and the course sentences behind it', () => {
    const tour = jobById('tour')!;
    const over = feedback(tour, hire('Powerful', 'high'));
    expect(over.stamp).toBe('! Overspent');
    expect(over.summary).toBe(
      'Powerful model on High did the job, but it cost 4 starfish for a 1-starfish job.',
    );
    expect(GILDA_TEXT[over.line]).toBe("That's a lot of starfish for a quick look. Auto would've done it.");
    expect(over.quotes).toContain(QUOTES.cost);
    const short = feedback(jobById('bug')!, hire('Lightweight', 'low'));
    expect(short.stamp).toBe('↻ Fell short');
    expect(short.quotes).toContain(QUOTES.retry);
    expect(feedback(tour, AUTO).quotes).toContain(QUOTES.auto);
    expect(feedback(jobById('files')!, hire('Powerful', 'high')).stamp).toBe('✓ Right-sized');
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
