import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_FILES, boardChanges, checkContent, type ContentIssue } from '../../tools/content/check';
import { validate } from '../../tools/content/json-schema';
import { GILDA, GILDA_TEXT, JOBS, QUOTES, STAMP } from '../game/market/jobs';
import { courseBoard } from '../learn/course-board';
import type { CourseLock } from '../learn/course/lock';
import { COURSE_BOARDS } from '../world/islands/course-boards';
import { COURSE_BOARDS_DATA } from './course-boards';
import { MARKET, type MarketData } from './market';

const ROOT = join(__dirname, '../..');
const json = <T>(p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
const market = () => json<MarketData>('content/market.json');
const boards = () => json<typeof COURSE_BOARDS_DATA>('content/course-boards.json');
const lock = () => json<CourseLock>('content/course.lock.json');
const show = (issues: ContentIssue[]) => issues.map((i) => `${i.file} ${i.path}: ${i.message}`).join('\n');
/** The issues a broken copy of one file gets (the other files are as on disk). */
const issuesWith = (file: string, value: unknown) => checkContent(ROOT, { [file]: value });
const paths = (issues: ContentIssue[]) => issues.map((i) => i.path);

describe('content files (docs/content-data.md)', () => {
  it('pass their schemas and every content check', () => {
    const issues = checkContent(ROOT);
    expect(issues, show(issues)).toEqual([]);
  });

  it('have a schema each', () => {
    const files = readdirSync(join(ROOT, 'content'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => `content/${f}`);
    expect(CONTENT_FILES.map((c) => c.file).sort()).toEqual(files.sort());
    for (const f of ['content/market.json', 'content/course-boards.json', 'content/labels.json'])
      expect(json<{ $schema: string }>(f).$schema, f).toBe(
        `./schemas/${CONTENT_FILES.find((c) => c.file === f)!
          .schema.split('/')
          .pop()}`,
      );
  });

  it('load as the game reads them', () => {
    expect(MARKET).toEqual(market());
    expect(COURSE_BOARDS_DATA).toEqual(boards());
    expect(JOBS.map((j) => j.id)).toEqual(market().jobs.map((j) => j.id));
    for (const j of JOBS) expect(j.why).toBe(QUOTES[market().jobs.find((x) => x.id === j.id)!.why]);
    for (const [k, g] of Object.entries(market().gilda)) {
      expect(GILDA[k as keyof typeof GILDA]).toBe(g.voice);
      expect(GILDA_TEXT[g.voice]).toBe(g.text);
    }
    expect(STAMP).toEqual(market().stamps);
    expect(QUOTES.retry.section).toBe('Try Again with a Different Model');
    for (const [island, p] of Object.entries(boards().islands)) {
      expect(COURSE_BOARDS[island as keyof typeof COURSE_BOARDS]).toMatchObject({ x: p.x, z: p.z });
      expect(courseBoard(p.chapter as Parameters<typeof courseBoard>[0])).not.toBeNull();
    }
  });
});

describe('the content checks report broken edits by entry', () => {
  it('a quote that isn’t the course’s words, or cites a section that’s gone or changed', () => {
    const m = market();
    m.quotes.cost.text = 'Models differ in price.';
    m.quotes.effort.anchor = 'no-such-section';
    m.quotes.hard.hash = '000000000000';
    expect(paths(issuesWith('content/market.json', m))).toEqual([
      'quotes.cost.text',
      'quotes.effort',
      'quotes.hard',
    ]);
  });

  it('a caption that isn’t its voice line, or a voice line that doesn’t exist', () => {
    const m = market();
    m.gilda.hello.text = 'Ahoy!';
    m.gilda.open.voice = 'mer.market.nope';
    const issues = issuesWith('content/market.json', m);
    expect(paths(issues)).toEqual([
      'gilda.hello.text',
      'gilda.hello.text',
      'gilda.open.voice',
      'gilda.open.voice',
    ]);
    expect(issues[1]!.message).toContain('tools/voice/generate.ts --only=mer.market.hello');
  });

  it('prices and refunds that break the economy', () => {
    const m = market();
    m.sizes.hard.refund = 4;
    (m.categories[1] as { price: number }).price = 1;
    expect(paths(issuesWith('content/market.json', m))).toEqual(['categories[1].price', 'sizes.hard.refund']);
    const pricey = market();
    (pricey as { maxPrice: number }).maxPrice = 5;
    expect(paths(issuesWith('content/market.json', pricey))).toEqual(['maxPrice']);
  });

  it('a job that quotes a missing sentence, and fields the schema doesn’t know', () => {
    const m = market() as MarketData & { extra?: boolean };
    (m.jobs[0] as { why: string }).why = 'nope';
    expect(paths(issuesWith('content/market.json', m))).toEqual(['jobs[0].why']);
    m.extra = true;
    expect(paths(issuesWith('content/market.json', m))).toEqual(['extra']);
  });

  it('a board off its island, in the water, or on a chapter the snapshot hasn’t got', () => {
    const b = boards();
    b.islands.anchorage.x = 723;
    b.islands.anchorage.z = -768.6;
    b.islands.meridian.y = 9;
    (b.islands['thousand-bough'] as { chapter: string }).chapter = '09-none';
    const issues = issuesWith('content/course-boards.json', b);
    expect(paths(issues)).toEqual([
      'islands.anchorage',
      'islands.anchorage',
      'islands.meridian.y',
      'islands["thousand-bough"].chapter',
      'islands["thousand-bough"].chapter',
    ]);
  });
});

describe('the course boards after a course sync', () => {
  it('list each board’s topics, and what the sync added or removed', () => {
    const now = lock();
    const before = lock();
    const ch = before.chapters['01-tour-the-app']!;
    delete ch.sections.settings;
    ch.sections['old-topic'] = { title: 'Old Topic', level: 2, hash: '000000000000' };
    const changes = boardChanges(boards(), now, before);
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

  it('refuses a keyword it doesn’t check', () => {
    expect(() => validate({ oneOf: [] }, 1)).toThrow(/unsupported keyword "oneOf"/);
  });
});
