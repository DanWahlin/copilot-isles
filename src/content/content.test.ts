import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PACK_FILES,
  PACK_SCHEMAS,
  boardChanges,
  checkBoardSpots,
  checkContent,
  courseBoardIslands,
  type ContentIssue,
} from '../../tools/content/check';
import { validate } from '../../tools/content/json-schema';
import { coursePack } from '../course/active';
import { withoutMeta } from '../course/pack';
import { COURSE, COURSES } from '../course/catalog';
import { readCoursePack } from '../../tools/course-pack/read';
import type { CourseMeta } from '../course/catalog';
import { GILDA, GILDA_TEXT, JOBS, QUOTES, STAMP } from '../game/market/jobs';
import { courseBoard } from '../learn/course-board';
import type { CourseLock } from '../learn/course/lock';
import { COURSE_BOARDS } from '../world/islands/course-boards';
import { COURSE_BOARDS_DATA, type CourseBoardsData } from './course-boards';
import { MARKET, type MarketData } from './market';

const ROOT = join(__dirname, '../..');
const PACK = 'courses/copilot-app';
const json = <T>(p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
const market = () => json<MarketData>(`${PACK}/market.json`);
const boards = () => json<CourseBoardsData & { $schema?: string; $comment?: string }>(`${PACK}/boards.json`);
const meta = () => json<CourseMeta & { $schema?: string }>(`${PACK}/course.json`);
const lock = () => json<CourseLock>(`${PACK}/lock.json`);
const quests = (island: string) =>
  json<{ scripts: Record<string, unknown[]>; barks: Record<string, string[]> }>(
    `${PACK}/quests/${island}.json`,
  );
const show = (issues: ContentIssue[]) => issues.map((i) => `${i.file} ${i.path}: ${i.message}`).join('\n');
/** The issues a broken copy of one file gets (the other files are as on disk). */
const issuesWith = (file: string, value: unknown) => checkContent(ROOT, { [`${PACK}/${file}`]: value });
const paths = (issues: ContentIssue[]) => issues.map((i) => i.path);

describe('course pack files (docs/content-data.md, COURSE-PACKS.md §3)', () => {
  it('pass their schemas and every content check', () => {
    const issues = checkContent(ROOT);
    expect(issues, show(issues)).toEqual([]);
    expect(checkBoardSpots()).toEqual([]);
  });

  it('every course in the catalog passes too', () => {
    for (const c of COURSES) {
      const issues = checkContent(ROOT, {}, c.id);
      expect(issues, `${c.id}\n${show(issues)}`).toEqual([]);
    }
  });

  it('the service worker caches live course files from every pack’s repository, and no other', () => {
    const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
    const listed = /\/\* course-repos \*\/ \[([^\]]*)\]/.exec(sw)![1]!;
    expect([...listed.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(
      COURSES.map((c) => c.source.repo).sort(),
    );
  });

  it('a text-only course has captions, not a cast; a voiced one a cast', () => {
    const cli = 'courses/copilot-cli';
    const meta = json<CourseMeta>(`${cli}/course.json`);
    expect(
      paths(checkContent(ROOT, { [`${cli}/course.json`]: { ...meta, voice: true } }, 'copilot-cli')),
    ).toContain('');
    const lines = json<{ lines: { id: string; text: string }[] }>(`${cli}/voice/lines.json`);
    lines.lines[0]!.text = 'Something else.';
    const issues = checkContent(ROOT, { [`${cli}/voice/lines.json`]: lines }, 'copilot-cli');
    expect(issues.map((i) => i.message).join('\n')).toMatch(/the caption says something else/);
  });

  it('name their schema (the hand-edited ones), and every schema is in courses/schemas/', () => {
    for (const f of ['course.json', 'labels.json', 'boards.json', 'market.json'])
      expect(json<{ $schema: string }>(`${PACK}/${f}`).$schema, f).toBe(
        `../schemas/${PACK_FILES.find((p) => p.file === f)!.schema}`,
      );
    for (const f of ['chapters/00-setup.json', 'quests/anchorage.json'])
      expect(json<{ $schema: string }>(`${PACK}/${f}`).$schema, f).toBe(
        `../../schemas/${PACK_FILES.find((p) => p.file === `${f.split('/')[0]}/*.json`)!.schema}`,
      );
    const schemas = readdirSync(join(ROOT, 'courses/schemas')).sort();
    expect([...new Set(PACK_SCHEMAS)].sort()).toEqual(schemas);
  });

  it('load as the game reads them', () => {
    expect(MARKET).toEqual(withoutMeta(market()));
    expect(COURSE_BOARDS_DATA).toEqual(withoutMeta(boards()));
    expect(COURSE).toEqual(withoutMeta(meta()));
    expect(coursePack()).toEqual(readCoursePack());
    expect(JOBS.map((j) => j.id)).toEqual(market().jobs.map((j) => j.id));
    for (const j of JOBS) expect(j.why).toBe(QUOTES[market().jobs.find((x) => x.id === j.id)!.why]);
    for (const [k, g] of Object.entries(market().gilda)) {
      expect(GILDA[k as keyof typeof GILDA]).toBe(g.voice);
      expect(GILDA_TEXT[g.voice]).toBe(g.text);
    }
    expect(STAMP).toEqual(market().stamps);
    expect(QUOTES.retry.section).toBe('Try Again with a Different Model');
    for (const { island, chapter } of courseBoardIslands(COURSE)) {
      expect(COURSE_BOARDS[island].chapter).toBe(chapter);
      expect(courseBoard(chapter)).not.toBeNull();
    }
  });
});

describe('the content checks report broken edits by entry', () => {
  it('a quote that isn’t the course’s words, or cites a section that’s gone or changed', () => {
    const m = market();
    m.quotes.cost.text = 'Models differ in price.';
    m.quotes.effort.anchor = 'no-such-section';
    m.quotes.hard.hash = '000000000000';
    expect(paths(issuesWith('market.json', m))).toEqual(['quotes.cost.text', 'quotes.effort', 'quotes.hard']);
  });

  it('a caption that isn’t its voice line, or a voice line that doesn’t exist', () => {
    const m = market();
    m.gilda.hello.text = 'Ahoy!';
    m.gilda.open.voice = 'mer.market.nope';
    const issues = issuesWith('market.json', m);
    expect(paths(issues)).toEqual([
      'gilda.hello.text',
      'gilda.hello.text',
      'gilda.open.voice',
      'gilda.open.voice',
    ]);
    expect(issues[1]!.message).toContain(
      'tools/voice/generate.ts --course copilot-app --only=mer.market.hello',
    );
  });

  it('prices and refunds that break the economy', () => {
    const m = market();
    m.sizes.hard.refund = 4;
    (m.categories[1] as { price: number }).price = 1;
    expect(paths(issuesWith('market.json', m))).toEqual(['categories[1].price', 'sizes.hard.refund']);
    const pricey = market();
    (pricey as { maxPrice: number }).maxPrice = 5;
    expect(paths(issuesWith('market.json', pricey))).toEqual(['maxPrice']);
  });

  it('a job that quotes a missing sentence, and fields the schema doesn’t know', () => {
    const m = market() as MarketData & { extra?: boolean };
    (m.jobs[0] as { why: string }).why = 'nope';
    expect(paths(issuesWith('market.json', m))).toEqual(['jobs[0].why']);
    m.extra = true;
    expect(paths(issuesWith('market.json', m))).toEqual(['extra']);
  });

  it('script steps whose ids don’t resolve, and barks for someone the game hasn’t got', () => {
    const q = quests('anchorage');
    q.scripts['nell.papers'] = [
      { say: 'nell.nope' },
      { quiz: 'Q9.9' },
      { show: 'ch00/nope' },
      { quest: 'Q0.2', step: 'nope' },
      { script: 'nope' },
      { say: 'nell.papers.01', extra: true },
    ];
    q.barks.nobody = ['Hello!'];
    expect(paths(issuesWith('quests/anchorage.json', q))).toEqual(['scripts["nell.papers"][5].extra']);
    delete (q.scripts['nell.papers'][5] as { extra?: boolean }).extra;
    expect(paths(issuesWith('quests/anchorage.json', q))).toEqual([
      'scripts["nell.papers"][0]',
      'scripts["nell.papers"][1]',
      'scripts["nell.papers"][2]',
      'scripts["nell.papers"][3]',
      'scripts["nell.papers"][4]',
      'barks.nobody',
    ]);
  });

  it('an island the game hasn’t got, or a chapter the course doesn’t list', () => {
    const c = meta();
    (c.islands[0] as { island: string }).island = 'atlantis';
    (c.islands[1] as { chapter: string }).chapter = '09-none';
    expect(paths(issuesWith('course.json', c))).toEqual(
      expect.arrayContaining(['islands[0].island', 'islands[1].chapter']),
    );
  });

  it('puzzles: a mechanic the game doesn’t run there, a voice line or a citation that doesn’t resolve', () => {
    const helms = json<Record<string, unknown>>(`${PACK}/puzzles/three-helms.json`);
    expect(paths(issuesWith('puzzles/three-helms.json', { ...helms, mechanic: 'route' }))).toEqual(
      expect.arrayContaining(['mechanic']),
    );
    expect(paths(issuesWith('puzzles/three-helms.json', { ...helms, mechanic: 'dance' }))).toEqual([
      'mechanic',
    ]);
    expect(issuesWith('puzzles/three-helms.json', { ...helms, disabled: true })).toEqual([]);
    const lines = { ...(helms.lines as Record<string, string>), check: 'mer.helm.nope' };
    expect(paths(issuesWith('puzzles/three-helms.json', { ...helms, lines }))).toEqual(['lines.check']);
    const letters = json<{ cites: Record<string, { hash: string }> }>(`${PACK}/puzzles/lost-letters.json`);
    letters.cites.settings!.hash = '000000000000';
    expect(paths(issuesWith('puzzles/lost-letters.json', letters))).toEqual(['cites.settings']);
    const flags = json<{ items: { wrong?: Record<string, { section: string }> }[] }>(
      `${PACK}/puzzles/flag-hoist.json`,
    );
    flags.items[0]!.wrong!['#']!.section = 'nope';
    expect(paths(issuesWith('puzzles/flag-hoist.json', flags))).toEqual(['items[0].wrong["#"].section']);
  });

  it('beats and hooks whose NPCs, quest steps, scripts, lines or quizzes don’t resolve', () => {
    const q = json<{ beats: unknown[] }>(`${PACK}/quests/meridian.json`);
    q.beats = [
      { npc: 'nobody', script: 'tobias' },
      { npc: 'tobias', when: { 'Q1.1': 'nope' }, say: 'mer.tobias.done' },
      { npc: 'tobias', when: { 'Q1.1': { not: ['done', 'nope'] } }, script: 'nope' },
      { npc: 'tobias', say: 'mer.nope' },
      { npc: 'tobias', when: { $lettersFiled: true } },
    ];
    expect(paths(issuesWith('quests/meridian.json', q))).toEqual([
      'beats[0].npc',
      'beats[1].when["Q1.1"]',
      'beats[2].when["Q1.1"]',
      'beats[2].script',
      'beats[3].say',
      'beats[4]',
    ]);
    const c = meta();
    c.hooks.briefing.chest = 'juno.nope';
    (c.hooks.battles['passage-anchorage-meridian']!.waves[0] as { quiz: string }).quiz = 'N9.9';
    expect(paths(issuesWith('course.json', c))).toEqual([
      'hooks.briefing.chest',
      'hooks.battles["passage-anchorage-meridian"].waves[0].quiz',
    ]);
  });

  it('a story without a name the game asks for, or whose quests and steps don’t resolve', () => {
    type Story = { conditions: Record<string, unknown>; events: Record<string, unknown> };
    const q = json<{ story?: Story }>(`${PACK}/quests/anchorage.json`);
    const story = q.story!;
    delete story.conditions.sealed;
    story.conditions.gangwayDown = { 'Q9.9': 'done' };
    story.conditions.dancing = { 'Q0.2': 'done' };
    story.events.setSail = [{ when: { 'Q0.11': 'nope' }, set: { 'Q0.11': 'gone' } }];
    expect(paths(issuesWith('quests/anchorage.json', q))).toEqual([
      'story.conditions',
      'story.conditions.dancing',
      'story.conditions.gangwayDown["Q9.9"]',
      'story.events.setSail[0].when["Q0.11"]',
      'story.events.setSail[0].set["Q0.11"]',
    ]);
    delete q.story;
    expect(paths(issuesWith('quests/anchorage.json', q))).toEqual(['story']);
  });

  it('a puzzle without its quest, or whose quest lacks a step its mechanic sets', () => {
    const crane = json<Record<string, unknown>>(`${PACK}/puzzles/crane.json`);
    expect(paths(issuesWith('puzzles/crane.json', { ...crane, quest: 'Q0.4' }))).toEqual([
      'quest',
      'quest',
      'quest',
      'quest',
    ]);
    expect(paths(issuesWith('puzzles/crane.json', { ...crane, quest: 'Q9.9' }))).toEqual(['quest']);
    const noQuest = { ...crane };
    delete noQuest.quest;
    expect(paths(issuesWith('puzzles/crane.json', noQuest))).toEqual(['quest']);
    expect(issuesWith('puzzles/crane.json', { ...noQuest, disabled: true })).toEqual([]);
    // `steps` maps the mechanic's steps to the quest's; `done` is every quest's own and isn't one.
    const steps = (s: Record<string, string>) =>
      paths(issuesWith('puzzles/crane.json', { ...crane, steps: { gate: 'actions', ...s } }));
    expect(steps({ crane: 'lifting' })).toEqual(['quest']);
    expect(steps({ done: 'finished' })).toEqual(['steps.done']);
    expect(steps({ hoist: 'crane' })).toEqual(['steps.hoist']);
    const palette = json<Record<string, unknown>>(`${PACK}/puzzles/palette.json`);
    expect(paths(issuesWith('puzzles/palette.json', { ...palette, latePage: 'pg.nope' }))).toEqual([
      'latePage',
    ]);
  });

  it('migrations that move a save to a quest, step, page or term the course hasn’t got', () => {
    const c = meta();
    c.migrations = {
      // A migration's `when` may name quests the course no longer has (that's what it's for).
      quests: [{ when: { 'Q0.5': 'done' }, set: { 'Q0.4': 'gone', 'Q9.9': 'start' } }],
      renamed: { old: ['pg.nope'] },
      taught: { 'Q9.9': ['nope'] },
    };
    expect(paths(issuesWith('course.json', c))).toEqual([
      'migrations.quests[0].set["Q0.4"]',
      'migrations.quests[0].set["Q9.9"]',
      'migrations.renamed.old[0]',
      'migrations.taught["Q9.9"]',
      'migrations.taught["Q9.9"][0]',
    ]);
  });

  it('a puzzle that binds a game id twice or not at all, or names an id it hasn’t got', () => {
    const helms = json<{ modes: Record<string, { acts: string }> }>(`${PACK}/puzzles/three-helms.json`);
    helms.modes.plan!.acts = 'steer';
    expect(paths(issuesWith('puzzles/three-helms.json', helms))).toEqual(['modes', 'modes']);
    const ws = json<{ orders: Record<string, { best: string }> }>(`${PACK}/puzzles/workspaces.json`);
    ws.orders.feature!.best = 'attic';
    expect(paths(issuesWith('puzzles/workspaces.json', ws))).toEqual(['orders.feature.best']);
    const routing = json<{ twist: { choices: { acts: string; right: boolean }[] } }>(
      `${PACK}/puzzles/channel-routing.json`,
    );
    routing.twist.choices[1]!.acts = 'jam';
    expect(paths(issuesWith('puzzles/channel-routing.json', routing))).toEqual(['twist.choices[1].acts']);
    const yard = json<{ items: { kind: string }[] }>(`${PACK}/puzzles/crate-yard.json`);
    yard.items[0]!.kind = 'barn';
    expect(paths(issuesWith('puzzles/crate-yard.json', yard))).toEqual(['items[0].kind']);
    const flags = json<{ bins: { symbol: string }[] }>(`${PACK}/puzzles/flag-hoist.json`);
    flags.bins.push({ ...flags.bins[0]!, symbol: '!' });
    expect(paths(issuesWith('puzzles/flag-hoist.json', flags))).toEqual(['bins']);
    const m = market();
    (m.categories[0] as { acts: string }).acts = 'large';
    expect(paths(issuesWith('market.json', m))).toContain('categories');
  });

  it('an island sign the game asks for that’s missing, or one it doesn’t ask for', () => {
    const q = json<{ signs?: Record<string, string> }>(`${PACK}/quests/thousand-bough.json`);
    q.signs = { porch: 'Hello' };
    expect(paths(issuesWith('quests/thousand-bough.json', q))).toEqual(['signs', 'signs.porch']);
  });

  it('a chest or bottle the game places that no chapter fills', () => {
    const ch = json<{ chests: { id: string }[] }>(`${PACK}/chapters/00-setup.json`);
    ch.chests = ch.chests.filter((c) => c.id !== 'B0.3');
    expect(paths(issuesWith('chapters/00-setup.json', ch))).toEqual(['islands[0].island']);
  });

  it('a board whose chapter has too few topics', () => {
    const b = boards();
    b.skip.titlePrefixes = [...b.skip.titlePrefixes, 'Learning', 'Key', 'Trouble', 'Tour', 'Why', 'Chats'];
    expect(new Set(paths(issuesWith('boards.json', b)))).toEqual(new Set(['skip']));
  });

  it('a board off its island, or in the water', () => {
    const spots = {
      anchorage: { ...COURSE_BOARDS.anchorage, x: 723, z: -768.6 },
      meridian: { ...COURSE_BOARDS.meridian, y: 9 },
      'thousand-bough': COURSE_BOARDS['thousand-bough'],
    };
    expect(checkBoardSpots(spots).map((s) => s.island)).toEqual(['anchorage', 'anchorage', 'meridian']);
  });
});

describe('the course boards after a course sync', () => {
  it('list each board’s topics, and what the sync added or removed', () => {
    const now = lock();
    const before = lock();
    const ch = before.chapters['01-tour-the-app']!;
    delete ch.sections.settings;
    ch.sections['old-topic'] = { title: 'Old Topic', level: 2, hash: '000000000000' };
    const changes = boardChanges(courseBoardIslands(meta()), boards().skip, now, before);
    const meridian = changes.find((c) => c.island === 'meridian')!;
    expect(meridian.topics.map((t) => t.title)).toEqual(
      courseBoard('01-tour-the-app')!.topics.map((t) => t.title),
    );
    expect(meridian.added).toEqual(['Settings']);
    expect(meridian.removed).toEqual(['Old Topic']);
    expect(changes.find((c) => c.island === 'anchorage')).toMatchObject({ added: [], removed: [] });
  });
});

describe('the schema checker', () => {
  it('reports types, enums, ranges, patterns, missing and unknown fields', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['a', 'b'],
      properties: {
        a: { type: 'integer', minimum: 1, maximum: 4 },
        b: { enum: ['x', 'y'] },
        c: { type: 'array', maxItems: 1, items: { $ref: '#/$defs/s' } },
      },
      $defs: { s: { type: 'string', pattern: '^[a-z]+$' } },
    };
    expect(validate(schema, { a: 2, b: 'x', c: ['ok'] })).toEqual([]);
    expect(validate(schema, { a: 5, c: ['OK', 'no'], d: 1 }).map((i) => i.path)).toEqual([
      '',
      'a',
      'c',
      'c[0]',
      'd',
    ]);
    expect(validate(schema, { a: 1.5, b: 'z' }).map((i) => i.message)).toEqual([
      'should be integer, not number',
      'should be one of "x", "y"',
    ]);
  });

  it('takes the anyOf branch that fits, or reports the closest one', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['say'],
          properties: { say: { type: 'string' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['quiz'],
          properties: { quiz: { type: 'string' }, when: { enum: ['a'] } },
        },
      ],
    };
    expect(validate(schema, { say: 'x' })).toEqual([]);
    expect(validate(schema, { quiz: 'q', when: 'b' }).map((i) => i.path)).toEqual(['when']);
  });

  it('refuses a keyword it doesn’t check', () => {
    expect(() => validate({ oneOf: [] }, 1)).toThrow(/unsupported keyword "oneOf"/);
  });
});
