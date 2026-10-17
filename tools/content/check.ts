/**
 * The content files' checks (docs/content-data.md): every file in `content/` against its JSON Schema
 * in `content/schemas/`, then what a schema can't say:
 *
 * - course quotes are word for word in the cited section of the bundled snapshot (`public/course/**`),
 *   and every cited anchor and hash is in `content/course.lock.json`;
 * - Gilda's captions are her voice lines' text (tools/voice/lines.testcove.json) and the audio's
 *   (public/voice/testcove/manifest.json), so a changed line is regenerated;
 * - the economy stays sane (prices 1 to 4, bigger models cost more, a refund is never more than the
 *   hire, every job can be done with the starfish you can find before the market);
 * - each board's chapter is in the snapshot with at least 5 topics, and each board stands on its island.
 *
 * `src/content/content.test.ts` fails on any issue; `npm run content:check` (tools/content/report.ts)
 * writes them as a report for the weekly refresh PRs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CourseBoardsData } from '../../src/content/course-boards';
import type { MarketData } from '../../src/content/market';
import { islandAt, type IslandId } from '../../src/game/islands';
import { CATEGORIES } from '../../src/game/market/catalog';
import { EFFORTS, grade, priceIn, type Hire, type MarketJob } from '../../src/game/market/jobs';
import { boardTopics, type CourseBoardTopic } from '../../src/learn/course-board';
import type { ChapterId } from '../../src/learn/course/chapters';
import type { CourseLock } from '../../src/learn/course/lock';
import { normalizeForCompare, parseSections } from '../../src/learn/course/sections';
import { ARCHIPELAGO } from '../../src/ui/chart/archipelago';
import { meridianHeight } from '../../src/world/islands/meridian';
import { thousandBoughHeight } from '../../src/world/islands/thousand-bough/height';
import { starfishOn } from '../../src/world/starfish/spots';
import { coveHeight } from '../../src/world/terrain/cove-height';
import { at, validate, type JsonSchema } from './json-schema';

export interface ContentIssue {
  /** The content file, like `content/market.json`. */
  file: string;
  /** Where in it, like `quotes.cost` (empty for the whole file). */
  path: string;
  message: string;
}

/** Each content file and its schema. */
export const CONTENT_FILES = [
  { file: 'content/market.json', schema: 'content/schemas/market.schema.json' },
  { file: 'content/course-boards.json', schema: 'content/schemas/course-boards.schema.json' },
  { file: 'content/labels.json', schema: 'content/schemas/labels.schema.json' },
  { file: 'content/models.json', schema: 'content/schemas/models.schema.json' },
  { file: 'content/course.lock.json', schema: 'content/schemas/course-lock.schema.json' },
] as const;

/** A board needs at least this many topics to read as a board (docs/specs/COURSE-BOARDS.md). */
export const MIN_BOARD_TOPICS = 5;

/** Starfish you can find before the market (Anchorage and Meridian). */
const MARKET_STARFISH = starfishOn('anchorage').length + starfishOn('meridian').length;

/** The ground under a board: each island's own height function (the board may stand on a deck). */
const GROUND: Readonly<Record<IslandId, (x: number, z: number) => number>> = {
  anchorage: coveHeight,
  meridian: meridianHeight,
  'thousand-bough': thousandBoughHeight,
};

interface Cite {
  chapter: string;
  anchor: string;
  hash: string;
}

interface VoiceLine {
  id: string;
  speaker: string;
  text: string;
}

/**
 * Every issue in the content files under `root`. `instead` replaces a file's parsed contents (by
 * path, like `content/market.json`), so the tests can check what a broken edit reports.
 */
export function checkContent(root: string, instead: Readonly<Record<string, unknown>> = {}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const parsed = new Map<string, unknown>();

  for (const { file, schema } of CONTENT_FILES) {
    let value: unknown;
    try {
      value = Object.hasOwn(instead, file) ? instead[file] : JSON.parse(read(file));
    } catch (e) {
      issues.push({ file, path: '', message: `isn't valid JSON: ${(e as Error).message}` });
      continue;
    }
    parsed.set(file, value);
    const found = validate(JSON.parse(read(schema)) as JsonSchema, value);
    for (const i of found) issues.push({ file, path: i.path, message: `${i.message} (${schema})` });
  }
  // Semantic checks need files that passed their schema.
  const ok = (file: string) => parsed.has(file) && !issues.some((i) => i.file === file);
  const lock = ok('content/course.lock.json') ? (parsed.get('content/course.lock.json') as CourseLock) : null;
  if (!lock) return issues;

  const readmes = new Map<string, ReturnType<typeof parseSections>>();
  const sectionOf = (chapter: string, anchor: string) => {
    const short = lock.chapters[chapter as ChapterId]?.short;
    if (!short) return null;
    if (!readmes.has(short)) {
      const path = `public/course/${short}/README.md`;
      readmes.set(short, existsSync(join(root, path)) ? parseSections(read(path)) : []);
    }
    return readmes.get(short)!.find((s) => s.anchor === anchor) ?? null;
  };
  /** An anchor and hash against the lock. */
  const cite = (file: string, path: string, c: Cite) => {
    const ch = lock.chapters[c.chapter as ChapterId];
    const s = ch?.sections[c.anchor];
    if (!ch) issues.push({ file, path, message: `chapter ${c.chapter} isn't in the course snapshot` });
    else if (!s)
      issues.push({
        file,
        path,
        message: `section #${c.anchor} isn't in ${c.chapter} any more (renamed or removed): pick the section that says it now`,
      });
    else if (s.hash !== c.hash)
      issues.push({
        file,
        path,
        message: `section #${c.anchor} changed (hash ${c.hash} → ${s.hash}): re-read it, update the text if it no longer fits, then set "hash": "${s.hash}"`,
      });
  };

  if (ok('content/market.json'))
    checkMarket(parsed.get('content/market.json') as MarketData, {
      issues,
      cite,
      sectionOf,
      voice: JSON.parse(read('tools/voice/lines.testcove.json')) as { lines: VoiceLine[] },
      manifest: JSON.parse(read('public/voice/testcove/manifest.json')) as { lines: VoiceLine[] },
    });
  if (ok('content/course-boards.json'))
    checkBoards(parsed.get('content/course-boards.json') as CourseBoardsData, lock, issues);
  if (ok('content/labels.json')) {
    const labels = (
      parsed.get('content/labels.json') as { labels: Record<string, { ch: string; source: Cite }> }
    ).labels;
    for (const [id, l] of Object.entries(labels)) {
      const path = at('labels', id);
      cite('content/labels.json', `${path}.source`, l.source);
      if (l.source.chapter.slice(0, 2) !== l.ch)
        issues.push({
          file: 'content/labels.json',
          path: `${path}.ch`,
          message: `should be "${l.source.chapter.slice(0, 2)}" (its source's chapter)`,
        });
    }
  }
  if (ok('content/models.json')) {
    const models = (parsed.get('content/models.json') as { models: { name: string; category: string }[] })
      .models;
    const names = new Set<string>();
    models.forEach((m, i) => {
      if (names.has(m.name))
        issues.push({
          file: 'content/models.json',
          path: `models[${i}]`,
          message: `${m.name} is listed twice`,
        });
      names.add(m.name);
    });
    for (const c of CATEGORIES)
      if (!models.some((m) => m.category === c))
        issues.push({
          file: 'content/models.json',
          path: 'models',
          message: `no ${c} model: its signboard would be empty`,
        });
  }
  return issues;
}

function checkMarket(
  m: MarketData,
  ctx: {
    issues: ContentIssue[];
    cite: (file: string, path: string, c: Cite) => void;
    sectionOf: (chapter: string, anchor: string) => { markdown: string } | null;
    voice: { lines: VoiceLine[] };
    manifest: { lines: VoiceLine[] };
  },
): void {
  const file = 'content/market.json';
  const fail = (path: string, message: string) => ctx.issues.push({ file, path, message });

  for (const [k, q] of Object.entries(m.quotes)) {
    const path = `quotes.${k}`;
    ctx.cite(file, path, q);
    const s = ctx.sectionOf(q.chapter, q.anchor);
    if (s && !normalizeForCompare(s.markdown).includes(normalizeForCompare(q.text)))
      fail(
        `${path}.text`,
        `isn't word for word in ${q.chapter}#${q.anchor} any more: copy the course's sentence again (or quote another one)`,
      );
  }

  const jobIds = new Set<string>();
  m.jobs.forEach((j, i) => {
    if (jobIds.has(j.id)) fail(`jobs[${i}].id`, `"${j.id}" is used twice`);
    jobIds.add(j.id);
    if (!Object.hasOwn(m.quotes, j.why)) fail(`jobs[${i}].why`, `"${j.why}" isn't a key of "quotes"`);
  });

  const cats = m.categories.map((c) => c.id);
  if (new Set(cats).size !== cats.length) fail('categories', 'lists a category twice');
  m.categories.forEach((c, i) => {
    const prev = m.categories[i - 1];
    if (prev && c.price <= prev.price)
      fail(`categories[${i}].price`, `bigger models cost more: ${c.id} should cost more than ${prev.id}`);
  });
  const efforts = m.efforts.map((e) => e.id).join(',');
  if (efforts !== EFFORTS.join(',')) fail('efforts', `should be ${EFFORTS.join(', ')}, in that order`);
  m.efforts.forEach((e, i) => {
    const prev = m.efforts[i - 1];
    if (prev && e.price < prev.price)
      fail(`efforts[${i}].price`, `more effort can't cost less than ${prev.label}`);
  });

  // The economy: every hire costs 1 to maxPrice (≤ 4); a right-sized hire's refund is never more
  // than it cost, so a hire never adds starfish (the purse only grows by finding them, and spending
  // can't take it below 0); and every job can be done right-sized with the starfish you find before
  // the market.
  const hires: Hire[] = [{ auto: true }];
  for (const c of cats)
    for (const e of EFFORTS) hires.push({ auto: false, category: c, model: c, effort: e });
  const name = (h: Hire) => (h.auto ? 'Auto' : `${h.category} on ${h.effort}`);
  for (const h of hires) {
    const p = priceIn(m, h);
    if (p < 1 || p > m.maxPrice)
      fail('categories', `${name(h)} costs ${p}: every hire should cost 1 to ${m.maxPrice}`);
  }
  const cheapest = new Map<string, number>();
  let fair = 0;
  m.jobs.forEach((j, i) => {
    const job = { size: j.size } as MarketJob;
    const right = hires.filter((h) => grade(job, h).outcome === 'right');
    if (!right.length) return fail(`jobs[${i}]`, 'no hire is right-sized for it');
    const least = Math.min(...right.map((h) => priceIn(m, h)));
    cheapest.set(j.size, least);
    fair += least;
  });
  for (const [size, least] of cheapest) {
    const refund = m.sizes[size as keyof MarketData['sizes']].refund;
    if (refund > least)
      fail(
        `sizes.${size}.refund`,
        `${refund} back for a ${least}-starfish hire: a refund can't be more than the hire, or hiring makes starfish`,
      );
  }
  if (fair > MARKET_STARFISH)
    fail(
      'jobs',
      `the jobs need ${fair} starfish right-sized, but there are only ${MARKET_STARFISH} on Anchorage and Meridian`,
    );

  const lines = new Map(ctx.voice.lines.map((l) => [l.id, l]));
  const audio = new Map(ctx.manifest.lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const [k, g] of Object.entries(m.gilda)) {
    const path = `gilda.${k}`;
    if (seen.has(g.voice)) fail(`${path}.voice`, `"${g.voice}" is used twice`);
    seen.add(g.voice);
    const l = lines.get(g.voice);
    if (!l) fail(`${path}.voice`, `"${g.voice}" isn't in tools/voice/lines.testcove.json`);
    else {
      if (l.speaker !== 'Gilda') fail(`${path}.voice`, `"${g.voice}" is ${l.speaker}'s line, not Gilda's`);
      if (l.text !== g.text)
        fail(
          `${path}.text`,
          `differs from "${g.voice}" in tools/voice/lines.testcove.json: change both to the same words`,
        );
    }
    const a = audio.get(g.voice);
    if (!a) fail(`${path}.voice`, `"${g.voice}" has no audio (public/voice/testcove/manifest.json)`);
    else if (a.text !== g.text)
      fail(
        `${path}.text`,
        `the audio says something else: regenerate it (npx tsx tools/voice/generate.ts --only=${g.voice}; docs/content-data.md)`,
      );
    if (g.source) ctx.cite(file, `${path}.source`, g.source);
  }
}

function checkBoards(b: CourseBoardsData, lock: CourseLock, issues: ContentIssue[]): void {
  const file = 'content/course-boards.json';
  const fail = (path: string, message: string) => issues.push({ file, path, message });
  const links = b.pins.map((p) => p.link).sort();
  if (links.join(',') !== 'chapter,home') fail('pins', 'should be one "chapter" pin and one "home" pin');
  const tokens = [...b.header.sign, b.header.kicker, ...b.pins.flatMap((p) => [p.sign, p.text, p.aria])];
  for (const t of tokens)
    for (const m of t.matchAll(/\{(\w+)\}/g))
      if (m[1] !== 'num' && m[1] !== 'title')
        fail('header', `"{${m[1]}}" isn't a field: use {num} or {title}`);

  for (const [island, p] of Object.entries(b.islands) as [IslandId, (typeof b.islands)[IslandId]][]) {
    const path = at('islands', island);
    const ch = lock.chapters[p.chapter];
    if (!ch) fail(`${path}.chapter`, `${p.chapter} isn't in the course snapshot (sync it first)`);
    else {
      const n = boardTopics(p.chapter, ch).length;
      if (n < MIN_BOARD_TOPICS)
        fail(
          `${path}.chapter`,
          `${p.chapter}'s board has ${n} topics (at least ${MIN_BOARD_TOPICS}): check "skip"`,
        );
    }
    const chart = ARCHIPELAGO.find((i) => i.id === island)?.chapter.slice(0, 2);
    if (chart !== p.chapter.slice(0, 2))
      fail(`${path}.chapter`, `the chart says ${island} is chapter ${chart ?? '(none)'}`);
    if (islandAt(p.x, p.z) !== island) fail(path, `(${p.x}, ${p.z}) isn't in ${island}'s waters`);
    const ground = GROUND[island](p.x, p.z);
    if (ground < 0.5) fail(path, `(${p.x}, ${p.z}) is in the water (ground ${ground.toFixed(2)} m)`);
    else if (p.y < ground - 0.3 || p.y > ground + 1)
      fail(`${path}.y`, `should be the ground under it (${ground.toFixed(2)} m, or a deck up to 1 m above)`);
  }
}

/** One board's topics before and after a course sync. */
export interface BoardChange {
  island: string;
  chapter: string;
  topics: readonly CourseBoardTopic[];
  added: readonly string[];
  removed: readonly string[];
}

/** Each board's topics from `lock`, and what changed since `previous` (when given). */
export function boardChanges(
  b: CourseBoardsData,
  lock: CourseLock,
  previous: CourseLock | null,
): BoardChange[] {
  return Object.entries(b.islands).map(([island, p]) => {
    const now = lock.chapters[p.chapter];
    const was = previous?.chapters[p.chapter];
    const topics = now ? boardTopics(p.chapter, now) : [];
    const before = was ? boardTopics(p.chapter, was) : topics;
    const titles = (t: readonly CourseBoardTopic[]) => new Set(t.map((x) => x.title));
    const a = titles(topics),
      r = titles(before);
    return {
      island,
      chapter: p.chapter,
      topics,
      added: [...a].filter((t) => !r.has(t)),
      removed: [...r].filter((t) => !a.has(t)),
    };
  });
}
