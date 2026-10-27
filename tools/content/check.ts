/**
 * The course packs' checks (docs/content-data.md, docs/specs/COURSE-PACKS.md §3): every file of a pack
 * (`courses/<id>/`, less its served `public/` folder) against its JSON Schema in `courses/schemas/`,
 * then what a schema can't say:
 *
 * - every cited anchor and hash is in the pack's `lock.json` (chapters' quizzes, pages, voiced and
 *   cited lines; chart labels; the market's quotes and Gilda's sources), and market quotes are word
 *   for word in the cited section of the pack's own snapshot (`public/course/**`);
 * - ids resolve: chapters' images, pages, quizzes and Trials; every script step (quizzes, pages, terms,
 *   Trials, images, quest steps, other scripts); the compass's quest steps; the islands, chapters
 *   and NPCs the pack names (the game's islands and cast);
 * - the quest skeleton: each island's story has every name the game asks for, each enabled puzzle's
 *   quest has its mechanic's steps, migrations move saves to ids that exist, and a chest fills every
 *   spot the game places on the course's islands;
 * - the bindings: each game id a puzzle acts out is bound once (`acts`), and the pack's ids resolve;
 * - every voice line a script, a chapter or the market plays is in `voice/lines.json`, and its audio
 *   (`public/voice/manifest.json`) says the same words, so a changed line is regenerated;
 * - the economy stays sane (prices 1 to 4, bigger models cost more, a refund is never more than the
 *   hire, every job can be done with the starfish you can find before the market);
 * - each board's chapter is in the snapshot with at least 5 topics, and each board stands on its island.
 *
 * A course may write an island's content before the game has the island (it isn't in the registry yet:
 * its world is in build). That content is held to all of the above but the game's side of the
 * contract, which comes with the island's wiring step: its NPCs, the names its story answers, its
 * puzzles' names and steps, and a market stall. Its voice lines can be `"pending": true` (written, not
 * voiced yet, so no audio), and only such content may play a pending line; a voiced line needs its audio. The game leaves the island's content
 * out until then (src/course/split.ts `withoutIslandsAhead`).
 *
 * `src/content/content.test.ts` fails on any issue; `npm run content:check` (tools/content/report.ts)
 * writes them as a report for the weekly refresh PRs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CourseMeta } from '../../src/course/catalog';
import {
  ISLAND_SIGNS,
  PUZZLE_MECHANICS,
  type IslandQuestsFile,
  type PackScriptStep,
  type PuzzleFile,
  type QuestDef,
} from '../../src/course/pack';
import { GAME_PUZZLES, PUZZLE_ISLANDS, PUZZLE_STEPS } from '../../src/course/puzzles';
import type { Beat } from '../../src/game/beats';
import {
  STORY_CONDITIONS,
  STORY_EVENTS,
  type QuestCond,
  type StoryIsland,
  type StoryRule,
  type When,
} from '../../src/game/story';
import { resolveLine, type CastEntry, type VoiceLineDefinition } from '../voice/lines';
import type { CourseBoardsData } from '../../src/content/course-boards';
import { MODEL_TIERS, type MarketData } from '../../src/content/market';
import { CREWS } from '../../src/game/puzzles/channel-routing/boards';
import { WORKSPACE_IDS } from '../../src/game/puzzles/channel-routing/workspaces';
import { HELM_MODES, REVIEW_ACTS } from '../../src/world/sites/helms-logic';
import { CRATE_KINDS } from '../../src/world/sites/crate-yard-logic';
import { HALYARDS } from '../../src/world/islands/thousand-bough/set-pieces';
import { CIRCUIT_PLACES, type CircuitKind } from '../../src/game/puzzles/circuit/places';
import { islandAt, type IslandId } from '../../src/game/islands';
import { ISLAND_LIST } from '../../src/islands/registry';
import { EFFORTS, grade, priceIn, refundIn, type Hire, type MarketJob } from '../../src/game/market/jobs';
import { MARKET_STALLS } from '../../src/game/market/stalls';
import { boardTopics, type CourseBoardTopic } from '../../src/learn/course-board';
import { appendixName, appendixPath, lockDoc, type CourseLock } from '../../src/learn/course/lock';
import { normalizeForCompare, parseSections } from '../../src/learn/course/sections';
import type { ChapterContent, SourceRef } from '../../src/learn/types';
import type { LearningFile } from '../../src/learn/learning';
import { ARCHIPELAGO } from '../../src/ui/chart/archipelago';
import { COURSE_BOARDS, type CourseBoardPlacement } from '../../src/world/islands/course-boards';
import { loadChartIslands } from '../../src/opening/chart-map';
import { starfishOn } from '../../src/world/starfish/spots';
import { DEFAULT_COURSE } from '../course-pack/read';
import { at, validate, type JsonSchema } from './json-schema';

export interface ContentIssue {
  /** The pack's file, like `courses/copilot-app/market.json`. */
  file: string;
  /** Where in it, like `quotes.cost` (empty for the whole file). */
  path: string;
  message: string;
}

/** A pack's files by kind (paths in the pack) and their schemas in `courses/schemas/`. */
export const PACK_FILES: readonly { file: string; schema: string }[] = [
  { file: 'course.json', schema: 'course.schema.json' },
  { file: 'chapters/*.json', schema: 'chapter.schema.json' },
  { file: 'quests/*.json', schema: 'quests.schema.json' },
  { file: 'labels.json', schema: 'labels.schema.json' },
  { file: 'boards.json', schema: 'boards.schema.json' },
  { file: 'market.json', schema: 'market.schema.json' },
  { file: 'models.json', schema: 'models.schema.json' },
  { file: 'lock.json', schema: 'lock.schema.json' },
  { file: 'voice/lines.json', schema: 'voice-lines.schema.json' },
  { file: 'voice/cast.json', schema: 'voice-cast.schema.json' },
  { file: 'learning.json', schema: 'learning.schema.json' },
  // One schema per mechanic: the file's own `mechanic` picks it.
  { file: 'puzzles/*.json', schema: 'puzzle-<mechanic>.schema.json' },
];

/**
 * Files a pack may leave out: the Model Market's two (a course without Port Meridian's market) and the
 * cast (a text-only course). The checks below say when one's needed.
 */
const OPTIONAL_FILES = new Set(['market.json', 'models.json', 'voice/cast.json', 'learning.json']);

/** Every schema in `courses/schemas/`, with the puzzles' one per mechanic. */
export const PACK_SCHEMAS: readonly string[] = PACK_FILES.flatMap((f) =>
  f.schema.includes('<mechanic>')
    ? PUZZLE_MECHANICS.map((m) => f.schema.replace('<mechanic>', m))
    : [f.schema],
);

/** A board needs at least this many topics to read as a board (docs/specs/COURSE-BOARDS.md). */
const MIN_BOARD_TOPICS = 5;

/**
 * The fewest starfish that clear every job right-sized at the market, each at its fair hire (`pay`,
 * and `back` refunded), spending what comes back: the best order of the jobs (there are at most four).
 */
export function marketPurseNeeded(jobs: readonly { pay: number; back: number }[]): number {
  const orders = (xs: readonly number[]): number[][] =>
    xs.length <= 1
      ? [[...xs]]
      : xs.flatMap((x, i) => orders(xs.filter((_, k) => k !== i)).map((o) => [x, ...o]));
  let best = Infinity;
  for (const order of orders(jobs.map((_, i) => i))) {
    let spent = 0;
    let need = 0;
    for (const i of order) {
      need = Math.max(need, spent + jobs[i]!.pay);
      spent += jobs[i]!.pay - jobs[i]!.back;
    }
    best = Math.min(best, need);
  }
  return jobs.length ? best : 0;
}

/** Every island's code (src/islands/registry.ts): its chests, bottles and cast. */
const CODES = await Promise.all(ISLAND_LIST.map((e) => e.code()));

/** The chests and message bottles each island places (the game's spots; what's in them is the course's). */
const CHEST_SPOTS = Object.fromEntries(ISLAND_LIST.map((e, i) => [e.id, CODES[i]!.chests])) as Readonly<
  Record<IslandId, readonly string[]>
>;

/** The ground under a board: each island's own height function (the 3D chart's, the board may stand on a deck). */
const GROUND = Object.fromEntries((await loadChartIslands()).map((c) => [c.id, c.height])) as Readonly<
  Record<IslandId, (x: number, z: number) => number>
>;

/** The islands the game has (the registry): a course island that isn't one is ahead of the game. */
const BUILT: ReadonlySet<string> = new Set(ISLAND_LIST.map((e) => e.id));

/** The game's cast (every NPC a pack can give barks to), with every extra that can appear. */
function castIds(): Set<string> {
  const anyAnchor = new Proxy({}, { get: () => ({ x: 0, z: 0 }), has: () => true }) as Record<
    string,
    { x: number; z: number }
  >;
  return new Set(CODES.flatMap((c) => c.cast(anyAnchor)).map((n) => n.id));
}

interface Cite {
  chapter: string;
  anchor: string;
  hash: string;
}

interface VoiceLine {
  id: string;
  speaker: string;
  text: string;
  /** Written, not voiced yet: only content for an island the game hasn't got may play it. */
  pending?: boolean;
}

/** A pack's files on disk (paths in the pack), less `public/`, sorted. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const rel = relative(dir, p).split('\\').join('/');
      if (statSync(p).isDirectory()) {
        if (rel !== 'public') walk(p);
      } else out.push(rel);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const schemaFor = (rel: string) =>
  PACK_FILES.find((f) =>
    f.file.includes('*') ? rel.startsWith(f.file.split('*')[0]!) && rel.endsWith('.json') : f.file === rel,
  )?.schema ?? null;

/**
 * Every issue in a course pack under `root` (default: the Copilot app course). `instead` replaces a
 * file's parsed contents (by path from `root`, like `courses/copilot-app/market.json`), so the tests
 * can check what a broken edit reports.
 */
export function checkContent(
  root: string,
  instead: Readonly<Record<string, unknown>> = {},
  course: string = DEFAULT_COURSE,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const dir = `courses/${course}`;
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  const parsed = new Map<string, unknown>();
  const fileOf = (rel: string) => `${dir}/${rel}`;
  const issue = (rel: string, path: string, message: string) =>
    issues.push({ file: fileOf(rel), path, message });

  const files = filesOf(join(root, dir));
  for (const req of PACK_FILES.filter((f) => !f.file.includes('*') && !OPTIONAL_FILES.has(f.file)))
    if (!files.includes(req.file)) issue(req.file, '', 'is missing: every course pack has one');
  for (const rel of files) {
    if (rel === 'README.md') continue;
    const schema = schemaFor(rel);
    if (!schema) {
      issue(
        rel,
        '',
        `isn't a course pack file (${PACK_FILES.map((f) => f.file).join(', ')}, README.md, or public/)`,
      );
      continue;
    }
    let value: unknown;
    try {
      value = Object.hasOwn(instead, fileOf(rel)) ? instead[fileOf(rel)] : JSON.parse(read(fileOf(rel)));
    } catch (e) {
      issue(rel, '', `isn't valid JSON: ${(e as Error).message}`);
      continue;
    }
    parsed.set(rel, value);
    let file = schema;
    if (schema.includes('<mechanic>')) {
      const m = (value as { mechanic?: unknown } | null)?.mechanic;
      if (!PUZZLE_MECHANICS.includes(m as PuzzleFile['mechanic'])) {
        issue(rel, 'mechanic', `should be one of ${PUZZLE_MECHANICS.join(', ')}`);
        continue;
      }
      file = schema.replace('<mechanic>', m as string);
    }
    for (const i of validate(JSON.parse(read(`courses/schemas/${file}`)) as JsonSchema, value))
      issue(rel, i.path, `${i.message} (courses/schemas/${file})`);
  }
  // Semantic checks need files that passed their schema.
  const ok = (rel: string) => parsed.has(rel) && !issues.some((i) => i.file === fileOf(rel));
  const get = <T>(rel: string) => (ok(rel) ? (parsed.get(rel) as T) : null);
  const lock = get<CourseLock>('lock.json');
  const meta = get<CourseMeta>('course.json');
  if (!lock || !meta) return issues;

  const readmes = new Map<string, ReturnType<typeof parseSections>>();
  /** A chapter's (or `appendix:<name>`'s) section, from the snapshot's file. */
  const sectionOf = (chapter: string, anchor: string) => {
    const name = appendixName(chapter);
    const file =
      name !== null
        ? lock.appendices?.[name] && `course/${appendixPath(name)}`
        : lock.chapters[chapter] && `course/${lock.chapters[chapter].short}/README.md`;
    if (!file) return null;
    if (!readmes.has(file)) {
      const path = `${dir}/public/${file}`;
      readmes.set(file, existsSync(join(root, path)) ? parseSections(read(path)) : []);
    }
    return readmes.get(file)!.find((s) => s.anchor === anchor) ?? null;
  };
  /** An anchor and hash against the lock. */
  const cite = (rel: string, path: string, c: Cite) => {
    const ch = lockDoc(lock, c.chapter);
    const s = ch?.sections[c.anchor];
    if (!ch)
      issue(
        rel,
        path,
        appendixName(c.chapter) !== null
          ? `${c.chapter} isn't in the course snapshot: add "${appendixName(c.chapter)}" to course.json source.appendices and sync`
          : `chapter ${c.chapter} isn't in the course snapshot`,
      );
    else if (!s)
      issue(
        rel,
        path,
        `section #${c.anchor} isn't in ${c.chapter} any more (renamed or removed): pick the section that says it now`,
      );
    else if (s.hash !== c.hash)
      issue(
        rel,
        path,
        `section #${c.anchor} changed (hash ${c.hash} → ${s.hash}): re-read it, update the text if it no longer fits, then set "hash": "${s.hash}"`,
      );
  };

  // Voice: the lines file, and the audio the generator made from it.
  const voice = get<{ lines: VoiceLine[] }>('voice/lines.json');
  const manifestPath = `${dir}/public/voice/manifest.json`;
  const manifest = existsSync(join(root, manifestPath))
    ? (JSON.parse(read(manifestPath)) as { lines: VoiceLine[] })
    : { lines: [] };
  const lines = new Map((voice?.lines ?? []).map((l) => [l.id, l]));
  const audio = new Map(manifest.lines.map((l) => [l.id, l]));
  // A text-only course's "audio" is its captions (generate.ts writes them without a speech service).
  const spoken = meta.voice !== false;
  const made = spoken ? 'audio' : 'caption';
  /**
   * A voice line a script or a chapter plays: in the lines file, with audio that says the same. Content
   * for an island the game hasn't got yet (`ahead`) may play a pending line, which has no audio yet.
   */
  const voiced = (rel: string, path: string, id: string, ahead = false) => {
    if (!voice) return;
    const l = lines.get(id);
    if (!l) return issue(rel, path, `"${id}" isn't in ${dir}/voice/lines.json`);
    if (l.pending) {
      if (!ahead)
        issue(
          rel,
          path,
          `"${id}" is pending (written, not voiced yet): voice it and drop "pending" first (docs/content-data.md)`,
        );
      return;
    }
    const a = audio.get(id);
    if (!a)
      issue(
        rel,
        path,
        `"${id}" has no ${made} (${manifestPath}): npx tsx tools/voice/generate.ts --course ${course}${spoken ? ` --only=${id}` : ''}`,
      );
    else if (a.text !== l.text)
      issue(
        rel,
        path,
        `"${id}": the ${made} says something else: regenerate it (npx tsx tools/voice/generate.ts --course ${course}${spoken ? ` --only=${id}` : ''}; docs/content-data.md)`,
      );
  };

  // course.json: the game's islands, the course's chapters.
  const chapterIds = new Set(meta.source.chapters.map((c) => c.id));
  const places = new Set(ARCHIPELAGO.map((i) => i.id));
  if (meta.id !== course) issue('course.json', 'id', `should be "${course}" (the pack's folder)`);
  meta.source.chapters.forEach((c, i) => {
    const l = lock.chapters[c.id];
    if (l && l.short !== c.short)
      issue('course.json', `source.chapters[${i}].short`, `the snapshot keeps it in "${l.short}"`);
  });
  for (const ch of Object.keys(lock.chapters))
    if (!chapterIds.has(ch))
      issue('course.json', 'source.chapters', `the snapshot has ${ch}, which isn't listed`);
  // Appendices: each one the pack names is in the lock and the snapshot, and the lock has no other.
  const named = new Set(meta.source.appendices ?? []);
  (meta.source.appendices ?? []).forEach((name, i) => {
    if (!lock.appendices?.[name])
      issue('course.json', `source.appendices[${i}]`, `"${name}" isn't in the lock: run npm run course:sync`);
    else if (!existsSync(join(root, dir, 'public', 'course', appendixPath(name))))
      issue('course.json', `source.appendices[${i}]`, `course/${appendixPath(name)} isn't in the snapshot`);
  });
  for (const name of Object.keys(lock.appendices ?? {}))
    if (!named.has(name))
      issue('course.json', 'source.appendices', `the snapshot has appendix "${name}", which isn't listed`);
  // The "Your setup" forms: each `cites` key is a field of its form, and its section is in the lock.
  for (const [form, copy] of Object.entries(meta.setup ?? {}) as [string, Record<string, unknown>][]) {
    if (!copy || typeof copy !== 'object') continue;
    for (const [field, ref] of Object.entries((copy.cites ?? {}) as Record<string, Cite>)) {
      const path = `setup.${form}.cites.${field}`;
      if (field === 'cites' || typeof copy[field] !== 'string')
        issue('course.json', path, `"${field}" isn't one of the form's words`);
      cite('course.json', path, ref);
    }
  }
  /** A course island the game hasn't got yet (its content is written ahead of its wiring). */
  const aheadIsland = (island: string) => meta.islands.some((i) => i.island === island) && !BUILT.has(island);
  /** The chapter of such an island. */
  const aheadChapter = (chapter: string) =>
    meta.islands.some((i) => i.chapter === chapter && aheadIsland(i.island));
  const islandsSeen = new Set<string>();
  meta.islands.forEach((isl, i) => {
    const path = `islands[${i}]`;
    if (!places.has(isl.island))
      issue('course.json', `${path}.island`, `"${isl.island}" isn't one of the game's islands`);
    if (islandsSeen.has(isl.island))
      issue('course.json', `${path}.island`, `"${isl.island}" is listed twice`);
    islandsSeen.add(isl.island);
    if (!chapterIds.has(isl.chapter))
      issue('course.json', `${path}.chapter`, `${isl.chapter} isn't in source.chapters`);
    if (isl.label.slice(0, 2) !== isl.chapter.slice(0, 2))
      issue('course.json', `${path}.label`, `should start with "${isl.chapter.slice(0, 2)}" (its chapter)`);
  });

  // Chapters: ids, references, sources.
  const chapters = files
    .filter((f) => f.startsWith('chapters/'))
    .map((rel) => [rel, get<ChapterContent>(rel)] as const)
    .filter((c): c is readonly [string, ChapterContent] => c[1] !== null);
  const ids = {
    image: new Set<string>(),
    quiz: new Set<string>(),
    page: new Set<string>(),
    chest: new Set<string>(),
    term: new Set<string>(),
    trial: new Set<string>(),
    appTask: new Set<string>(),
  };
  const unique = (rel: string, path: string, kind: keyof typeof ids, id: string) => {
    if (ids[kind].has(id)) issue(rel, path, `${kind} "${id}" is used twice in the course`);
    ids[kind].add(id);
  };
  for (const [rel, c] of chapters) {
    if (rel !== `chapters/${c.chapter}.json`) issue(rel, 'chapter', `should be the file's name (${rel})`);
    if (!lock.chapters[c.chapter])
      issue(rel, 'chapter', `${c.chapter} isn't in the course snapshot (sync it first)`);
    c.images.forEach((img, i) => unique(rel, `images[${i}].id`, 'image', img.id));
    c.quizzes.forEach((q, i) => unique(rel, `quizzes[${i}].id`, 'quiz', q.id));
    c.pages.forEach((p, i) => unique(rel, `pages[${i}].id`, 'page', p.id));
    c.chests.forEach((x, i) => unique(rel, `chests[${i}].id`, 'chest', x.id));
    c.glossary.forEach((g, i) => unique(rel, `glossary[${i}].id`, 'term', g.id));
    c.trials.forEach((t, i) => unique(rel, `trials[${i}].id`, 'trial', t.id));
  }
  const learning = get<LearningFile>('learning.json');
  learning?.appTasks.forEach((t, i) => unique('learning.json', `appTasks[${i}].id`, 'appTask', t.id));
  /** App tasks a script hands off (one no script names is never shown). */
  const handedOff = new Set<string>();
  const sha12 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
  for (const [rel, c] of chapters) {
    const src = (path: string, s: SourceRef) => {
      cite(rel, path, s);
      if (s.image && !existsSync(join(root, dir, 'public', s.image.src)))
        issue(rel, `${path}.image.src`, `${s.image.src} isn't in the snapshot`);
    };
    c.images.forEach((img, i) => {
      const file = join(root, dir, 'public', img.src);
      if (!existsSync(file)) issue(rel, `images[${i}].src`, `${img.src} isn't in the snapshot`);
      else if (sha12(file) !== img.hash)
        issue(
          rel,
          `images[${i}].hash`,
          `${img.src} isn't the file this was written against (it's ${sha12(file)})`,
        );
    });
    c.quizzes.forEach((q, i) => {
      src(`quizzes[${i}].source`, q.source);
      if (q.type === 'hotspot' && !ids.image.has(q.image))
        issue(rel, `quizzes[${i}].image`, `"${q.image}" isn't a course image of this pack`);
    });
    c.pages.forEach((p, i) => {
      src(`pages[${i}].source`, p.source);
      if (p.image && !ids.image.has(p.image))
        issue(rel, `pages[${i}].image`, `"${p.image}" isn't a course image`);
    });
    c.chests.forEach((x, i) => {
      if (!ids.page.has(x.page)) issue(rel, `chests[${i}].page`, `"${x.page}" isn't a page`);
    });
    c.trials.forEach((t, i) =>
      t.items.forEach((q, j) => {
        if (!ids.quiz.has(q)) issue(rel, `trials[${i}].items[${j}]`, `"${q}" isn't a quiz`);
      }),
    );
    for (const [id, s] of Object.entries(c.voiced ?? {})) {
      src(at('voiced', id), s);
      voiced(rel, at('voiced', id), id, aheadChapter(c.chapter));
    }
    for (const [id, x] of Object.entries(c.cited ?? {})) src(`${at('cited', id)}.source`, x.source);
  }

  // Every chest and bottle the game places on the course's islands holds one of its chests.
  meta.islands.forEach((isl, i) => {
    for (const id of CHEST_SPOTS[isl.island as IslandId] ?? [])
      if (!ids.chest.has(id))
        issue(
          'course.json',
          `islands[${i}].island`,
          `the game places chest "${id}" on ${isl.island}: a chapter's "chests" needs it`,
        );
  });

  /** A script's steps: every id they name is in this course. */
  const steps = (
    rel: string,
    base: string,
    list: readonly PackScriptStep[],
    isScript: (name: string) => boolean,
    island: string,
    ahead = false,
  ) => {
    /** After an `orStop` hand-off, Later ends the script: what follows mustn't move the main story. */
    let stopAt: string | null = null;
    list.forEach((s, i) => {
      const path = `${base}[${i}]`;
      const has = (kind: keyof typeof ids, id: string, what: string) => {
        if (!ids[kind].has(id)) issue(rel, path, `"${id}" isn't ${what} in this course`);
      };
      if ('say' in s) voiced(rel, path, s.say, ahead);
      else if ('show' in s) has('image', s.show, 'a course image');
      else if ('quiz' in s) has('quiz', s.quiz, 'a quiz');
      else if ('page' in s) has('page', s.page, 'a page');
      else if ('file' in s) has('page', s.file, 'a page');
      else if ('term' in s) has('term', s.term, 'a glossary term');
      else if ('trial' in s) has('trial', s.trial, 'a Trial');
      else if ('quest' in s) {
        const d = questDefs.get(s.quest);
        if (!d) issue(rel, path, `"${s.quest}" isn't a quest`);
        else if (!Object.hasOwn(d.steps, s.step)) issue(rel, path, `"${s.step}" isn't a step of ${s.quest}`);
        else if (stopAt && !d.optional)
          issue(
            rel,
            path,
            `${s.quest} isn't optional, but Later at ${stopAt} ends the script first: the app can't hold up the story`,
          );
      } else if ('script' in s) {
        if (!isScript(s.script)) issue(rel, path, `"${s.script}" isn't a script of ${island}`);
      }
      if (('askFork' in s || 'askSetup' in s) && s.line) voiced(rel, path, s.line, ahead);
      if ('appTask' in s) {
        has('appTask', s.appTask, 'an app task (learning.json)');
        handedOff.add(s.appTask);
        if (s.orStop) stopAt ??= path;
        if (s.orStop && s.quiet)
          issue(rel, path, 'a quiet hand-off shows no card, so it has no Later to stop on');
      }
      // A step for players who confirmed an app task: that task is this course's.
      const when = 'quiz' in s || 'askSetup' in s ? s.when : undefined;
      if (when?.startsWith('app:')) has('appTask', when.slice(4), 'an app task (learning.json)');
    });
  };

  // Quests: islands, quest steps, every script step, barks, beats.
  const quests = files
    .filter((f) => f.startsWith('quests/'))
    .map((rel) => [rel, get<IslandQuestsFile>(rel)] as const)
    .filter((q): q is readonly [string, IslandQuestsFile] => q[1] !== null);
  const questDefs = new Map<string, QuestDef>();
  for (const [rel, q] of quests)
    q.quests.forEach((d, i) => {
      if (questDefs.has(d.id)) issue(rel, `quests[${i}].id`, `quest "${d.id}" is used twice in the course`);
      questDefs.set(d.id, d);
    });
  const cast = castIds();
  /** A quest and its step: both this course's. */
  const questStep = (rel: string, path: string, quest: string, step: string | null) => {
    const d = questDefs.get(quest);
    if (!d) issue(rel, path, `"${quest}" isn't a quest`);
    else if (step !== null && !Object.hasOwn(d.steps, step))
      issue(rel, path, `"${step}" isn't a step of ${quest}`);
  };
  /** A `when`: flags are true or false, and every quest and step it names is this course's. */
  const checkWhen = (rel: string, path: string, when: When) => {
    for (const [key, c] of Object.entries(when)) {
      if (key.startsWith('$')) {
        if (typeof c !== 'boolean') issue(rel, at(path, key), 'a flag is true or false');
        continue;
      }
      const cond = c as QuestCond;
      const want =
        cond !== null && typeof cond === 'object' && !Array.isArray(cond)
          ? (cond as { not: unknown }).not
          : cond;
      if (!questDefs.has(key)) questStep(rel, at(path, key), key, null);
      else
        for (const step of Array.isArray(want) ? want : [want])
          questStep(rel, at(path, key), key, step as string | null);
    }
  };
  /** Rules: what they set is this course's (a migration's `when` may name quests it no longer has). */
  const checkRules = (rel: string, path: string, rules: readonly StoryRule[], when: boolean) =>
    rules.forEach((r, i) => {
      if (when && r.when) checkWhen(rel, `${path}[${i}].when`, r.when);
      for (const [id, step] of Object.entries(r.set)) questStep(rel, at(`${path}[${i}].set`, id), id, step);
    });
  for (const [rel, q] of quests) {
    // An island the game hasn't got yet: its cast and its story's names come with its wiring.
    const ahead = aheadIsland(q.island);
    if (rel !== `quests/${q.island}.json`) issue(rel, 'island', `should be the file's name (${rel})`);
    const isl = meta.islands.find((i) => i.island === q.island);
    if (!isl) issue(rel, 'island', `"${q.island}" isn't one of the course's islands (course.json)`);
    else if (!lock.chapters[isl.chapter])
      issue(rel, 'island', `its chapter ${isl.chapter} isn't in the course snapshot (sync it first)`);
    q.quests.forEach((d, i) => {
      if (!Object.hasOwn(d.steps, 'done')) issue(rel, `quests[${i}].steps`, 'needs a "done" step');
    });
    for (const key of Object.keys(q.targets)) {
      const [quest, step] = key.split(':') as [string, string];
      const d = questDefs.get(quest);
      if (!d) issue(rel, at('targets', key), `"${quest}" isn't a quest`);
      else if (!Object.hasOwn(d.steps, step))
        issue(rel, at('targets', key), `"${step}" isn't a step of ${quest}`);
    }
    for (const [name, list] of Object.entries(q.scripts))
      steps(rel, at('scripts', name), list, (n) => Object.hasOwn(q.scripts, n), q.island, ahead);
    q.beats?.forEach((b: Beat, i) => {
      const path = `beats[${i}]`;
      for (const npc of typeof b.npc === 'string' ? [b.npc] : b.npc)
        if (!ahead && !cast.has(npc)) issue(rel, `${path}.npc`, `"${npc}" isn't one of the game's NPCs`);
      if (b.when) checkWhen(rel, `${path}.when`, b.when);
      const what = [b.script, b.say, b.none].filter((x) => x !== undefined).length;
      if (what !== 1) issue(rel, path, 'needs one of "script", "say" or "none"');
      if (b.script && !Object.hasOwn(q.scripts, b.script))
        issue(rel, `${path}.script`, `"${b.script}" isn't a script of ${q.island}`);
      if (b.say) voiced(rel, `${path}.say`, b.say, ahead);
    });
    for (const npc of Object.keys(q.barks))
      if (!ahead && !cast.has(npc)) issue(rel, at('barks', npc), `"${npc}" isn't one of the game's NPCs`);
    // The signs with course words the island's dressing asks for (ISLAND_SIGNS), and no others.
    const signs = ISLAND_SIGNS[q.island] ?? [];
    for (const n of signs)
      if (!q.signs?.[n]) issue(rel, 'signs', `needs "${n}": the game asks ${q.island} for that sign`);
    for (const n of Object.keys(q.signs ?? {}))
      if (!ahead && !signs.includes(n))
        issue(rel, at('signs', n), `the game doesn't ask ${q.island} for a "${n}" sign`);
    // The story (src/game/story.ts): every condition and event the game asks the island for.
    const asks = Object.hasOwn(STORY_CONDITIONS, q.island) ? (q.island as StoryIsland) : null;
    if (ahead && !asks) {
      // The names are the wiring step's to add to STORY_CONDITIONS and STORY_EVENTS; what they mean
      // is checked now.
      for (const [n, when] of Object.entries(q.story?.conditions ?? {}))
        checkWhen(rel, at('story.conditions', n), when);
      for (const [n, rules] of Object.entries(q.story?.events ?? {}))
        checkRules(rel, at('story.events', n), rules, true);
    } else if (!asks) {
      if (q.story) issue(rel, 'story', `the game asks ${q.island} for no story`);
    } else if (!q.story)
      issue(rel, 'story', `is missing: the game asks ${q.island} for ${STORY_CONDITIONS[asks].join(', ')}`);
    else {
      const { conditions, events } = q.story;
      const names = (kind: string, asked: readonly string[], given: object) => {
        for (const n of asked)
          if (!Object.hasOwn(given, n))
            issue(rel, `story.${kind}`, `needs "${n}": the game asks ${q.island} for it`);
        for (const n of Object.keys(given))
          if (!asked.includes(n))
            issue(rel, at(`story.${kind}`, n), `the game doesn't ask ${q.island} for "${n}"`);
      };
      names('conditions', STORY_CONDITIONS[asks], conditions);
      names('events', STORY_EVENTS[asks], events);
      for (const [n, when] of Object.entries(conditions)) checkWhen(rel, at('story.conditions', n), when);
      for (const [n, rules] of Object.entries(events)) checkRules(rel, at('story.events', n), rules, true);
    }
  }
  // Every island the course uses that the game asks a story of has its quests (and story).
  for (const isl of meta.islands)
    if (Object.hasOwn(STORY_CONDITIONS, isl.island) && !files.includes(`quests/${isl.island}.json`))
      issue(
        'course.json',
        'islands',
        `uses ${isl.island}, so it needs quests/${isl.island}.json and its story`,
      );

  // Puzzles (COURSE-PACKS.md §4): one file per puzzle the game plays, with the mechanic it runs.
  const questsOk = quests.length === files.filter((f) => f.startsWith('quests/')).length;
  for (const [name, mechanic] of Object.entries(GAME_PUZZLES)) {
    const rel = `puzzles/${name}.json`;
    // Only the puzzles on the course's islands (the others' islands aren't open in it).
    if (!meta.islands.some((i) => i.island === PUZZLE_ISLANDS[name]) && !files.includes(rel)) continue;
    if (!files.includes(rel))
      issue(
        rel,
        '',
        `is missing: the game plays "${name}" (${mechanic}); set "disabled": true to turn it off`,
      );
    else {
      const m = (parsed.get(rel) as { mechanic?: string } | undefined)?.mechanic;
      // (An unknown mechanic is the schema step's issue.)
      if (m !== mechanic && PUZZLE_MECHANICS.includes(m as PuzzleFile['mechanic']))
        issue(rel, 'mechanic', `should be "${mechanic}": the game's ${name} runs that mechanic`);
    }
  }
  /** The quests of the islands the game hasn't got yet: a puzzle that plays in one is ahead too. */
  const aheadQuests = new Set(
    quests.flatMap(([, q]) => (aheadIsland(q.island) ? q.quests.map((d) => d.id) : [])),
  );
  /** Puzzles that play in those quests (the game plays them once their island is wired in). */
  const aheadPuzzles = new Set<string>();
  const checkPuzzle = (rel: string, p: PuzzleFile & Record<string, unknown>, ahead: boolean): void => {
    // Every voice line it plays: its `lines`, and any `line` (or a letter's `ok`) in its content.
    const walk = (v: unknown, path: string, key: string) => {
      if (typeof v === 'string') {
        if (
          key === 'line' ||
          (key === 'ok' && path.startsWith('items')) ||
          path.startsWith('lines') ||
          /^orders\.\w+\.wrong/.test(path)
        )
          voiced(rel, path, v, ahead);
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, at(path, i), key));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v))
          if (k !== 'text' && k !== 'scripts' && !k.startsWith('$')) walk(x, path ? at(path, k) : k, k);
    };
    walk(p, '', '');
    // The quest it plays in has the steps its mechanic sets and waits on (once every quests file is ok).
    const name = rel.slice('puzzles/'.length, -'.json'.length);
    const want = p.disabled ? undefined : PUZZLE_STEPS[name];
    const def = p.quest ? questDefs.get(p.quest) : undefined;
    if (questsOk) {
      if (p.quest && !def) issue(rel, 'quest', `"${p.quest}" isn't a quest in this course`);
      else if (want && !def)
        issue(
          rel,
          'quest',
          `is missing: the game's ${name} sets or waits on ${want.join(', ')} in a quest of the course`,
        );
      else if (want)
        for (const game of want) {
          const step = (p.steps as Record<string, string> | undefined)?.[game] ?? game;
          if (!Object.hasOwn(def!.steps, step))
            issue(rel, 'quest', `${p.quest} needs a "${step}" step: the game's ${name} sets or waits on it`);
        }
    }
    for (const game of Object.keys((p.steps ?? {}) as object))
      if (game === 'done') issue(rel, at('steps', game), 'every quest ends at "done": it can\'t be mapped');
      else if (!PUZZLE_STEPS[name]?.includes(game))
        issue(rel, at('steps', game), `the game's ${name} has no step "${game}"`);
    // The market's lesson: the quests and steps it reads and sets are this course's.
    const lesson = p.lesson as
      { taught?: When; practice?: When; practiced?: Record<string, string> } | undefined;
    if (lesson && questsOk) {
      if (lesson.taught) checkWhen(rel, 'lesson.taught', lesson.taught);
      if (lesson.practice) checkWhen(rel, 'lesson.practice', lesson.practice);
      if (lesson.practiced) checkRules(rel, 'lesson.practiced', [{ set: lesson.practiced }], false);
      if (!!lesson.practice !== !!lesson.practiced)
        issue(rel, 'lesson', 'needs both "practice" and "practiced", or neither');
    }
    for (const key of ['latePage', 'page'] as const)
      if (typeof p[key] === 'string' && !ids.page.has(p[key] as string))
        issue(rel, key, `"${p[key] as string}" isn't a page in this course`);
    if (typeof p.quiz === 'string' && !ids.quiz.has(p.quiz))
      issue(rel, 'quiz', `"${p.quiz}" isn't a quiz in this course`);
    // Its scripts name quest steps: checked once every quests file is (a broken one hides its quests).
    if (questsOk)
      for (const [name, list] of Object.entries((p.scripts ?? {}) as Record<string, PackScriptStep[]>))
        steps(rel, at('scripts', name), list, () => false, rel, ahead);
    // The gear rack's checks: a stale one names a script of the file, and its closing script moves the
    // quest on (without one, the rack's quest would wait at its checks for good).
    if (p.mechanic === 'checklist' && Array.isArray(p.checks)) {
      const own = (p.scripts ?? {}) as Record<string, unknown>;
      (p.checks as { stale?: { script?: string } }[]).forEach((c, i) => {
        if (c.stale?.script && !Object.hasOwn(own, c.stale.script))
          issue(rel, at(at('checks', i), 'stale.script'), `"${c.stale.script}" isn't one of its scripts`);
      });
      if (want?.length && !Object.hasOwn(own, 'checked'))
        issue(rel, 'scripts', 'needs a "checked" script: it plays once every check has passed');
    }
    // Cited sections: the items' own sources, and the `cites` (or `section` anchors) of its chapter.
    const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
    items.forEach((it, i) => {
      if (it.source) cite(rel, `items[${i}].source`, it.source as Cite);
    });
    const ch = p.chapter;
    if (ch && !lock.chapters[ch]) issue(rel, 'chapter', `${ch} isn't in the course snapshot`);
    for (const [k, c] of Object.entries((p.cites ?? {}) as Record<string, { anchor: string; hash: string }>))
      if (ch) cite(rel, at('cites', k), { chapter: ch, anchor: c.anchor, hash: c.hash });
    const section = (v: unknown, path: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => section(x, at(path, i)));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          const here = at(path, k);
          if (k === 'section' && typeof x === 'string' && ch && !p.cites && !lock.chapters[ch]?.sections[x])
            issue(rel, here, `#${x} isn't a section of ${ch}`);
          else section(x, here);
        }
    };
    section(items, 'items');
    for (const [k, c] of Object.entries((p.cites ?? {}) as Record<string, unknown>))
      if (typeof c !== 'object') issue(rel, at('cites', k), 'should be a section');
  };
  for (const rel of files.filter((f) => f.startsWith('puzzles/'))) {
    const name = rel.slice('puzzles/'.length, -'.json'.length);
    // A puzzle the game doesn't play yet may play in a quest of an island it hasn't got yet.
    const quest = (parsed.get(rel) as { quest?: unknown } | undefined)?.quest;
    const ahead = !Object.hasOwn(GAME_PUZZLES, name) && typeof quest === 'string' && aheadQuests.has(quest);
    if (ahead) aheadPuzzles.add(name);
    else if (!Object.hasOwn(GAME_PUZZLES, name))
      issue(rel, '', `isn't a puzzle the game plays (${Object.keys(GAME_PUZZLES).join(', ')})`);
    const p = get<PuzzleFile & Record<string, unknown>>(rel);
    if (p) {
      checkPuzzle(rel, p, ahead);
      if (p.mechanic === 'circuit' && questsOk)
        (
          (p.laps ?? []) as {
            quest: string;
            step: string;
            solved: string;
            close: string;
            stations: { image?: string; line?: string }[];
          }[]
        ).forEach((lap, i) => {
          questStep(rel, `laps[${i}].step`, lap.quest, lap.step);
          questStep(rel, `laps[${i}].solved`, lap.quest, lap.solved);
          // The close script is the lap's quest's island's (the lap's end plays it).
          const home = quests.find(([, q]) => q.quests.some((d) => d.id === lap.quest))?.[1];
          if (home && !Object.hasOwn(home.scripts, lap.close))
            issue(rel, `laps[${i}].close`, `"${lap.close}" isn't a script of ${home.island}`);
          lap.stations.forEach((st, j) => {
            if (st.image && !ids.image.has(st.image))
              issue(rel, `laps[${i}].stations[${j}].image`, `"${st.image}" isn't a course image`);
          });
        });
      checkBindings(name, rel, p, issue, (n) =>
        get<PuzzleFile & Record<string, unknown>>(`puzzles/${n}.json`),
      );
    }
  }

  // Learning systems (learning.json): app tasks, objectives, reflections; and course.json's recap.
  if (learning && questsOk) checkLearning(learning);
  function checkLearning(l: LearningFile): void {
    const rel = 'learning.json';
    const islandChapters = new Set(meta!.islands.map((i) => i.chapter));
    const inCourse = (path: string, chapter: string) => {
      if (!islandChapters.has(chapter))
        issue(rel, path, `${chapter} isn't the chapter of one of the course's islands (course.json)`);
    };
    const source = (path: string, chapter: string, s: Cite) => {
      cite(rel, path, s);
      if (s.chapter !== chapter) issue(rel, `${path}.chapter`, `should be ${chapter}, the item's chapter`);
    };
    const optionIds = (path: string, options: readonly { id: string }[]) => {
      const seen = new Set<string>();
      options.forEach((o, i) => {
        if (seen.has(o.id)) issue(rel, `${path}[${i}].id`, `"${o.id}" is used twice`);
        seen.add(o.id);
      });
      return seen;
    };
    l.appTasks.forEach((t, i) => {
      const path = `appTasks[${i}]`;
      inCourse(`${path}.chapter`, t.chapter);
      source(`${path}.source`, t.chapter, t.source);
      if (t.quest) questStep(rel, `${path}.quest`, t.quest, null);
      if (t.seen && !optionIds(`${path}.seen.options`, t.seen.options).has(t.seen.answer))
        issue(rel, `${path}.seen.answer`, `"${t.seen.answer}" isn't one of its options`);
      if (t.check?.kind === 'branchExists' && !t.check.branch)
        issue(rel, `${path}.check.branch`, 'branchExists needs the branch to look for');
      if (t.check?.branch?.includes('{practiceBranch}') && !meta!.practice)
        issue(rel, `${path}.check.branch`, '{practiceBranch} needs course.json\'s "practice"');
      if (!handedOff.has(t.id))
        issue(
          rel,
          `${path}.id`,
          `no script hands "${t.id}" off: add { "appTask": "${t.id}" } where it's taught`,
        );
    });
    const objectiveIds = new Set<string>();
    l.objectives.forEach((o, i) => {
      const path = `objectives[${i}]`;
      if (objectiveIds.has(o.id)) issue(rel, `${path}.id`, `"${o.id}" is used twice`);
      objectiveIds.add(o.id);
      inCourse(`${path}.chapter`, o.chapter);
      source(`${path}.source`, o.chapter, o.source);
      const s = sectionOf(o.source.chapter, o.source.anchor);
      if (s && !normalizeForCompare(s.markdown).includes(normalizeForCompare(o.text)))
        issue(
          rel,
          `${path}.text`,
          `isn't word for word in ${o.source.chapter}#${o.source.anchor} any more: copy the course's objective again`,
        );
      o.covers.quests?.forEach((q, j) => questStep(rel, `${path}.covers.quests[${j}]`, q, null));
      o.covers.quizzes?.forEach((q, j) => {
        if (!ids.quiz.has(q))
          issue(rel, `${path}.covers.quizzes[${j}]`, `"${q}" isn't a quiz in this course`);
      });
      o.covers.appTasks?.forEach((t, j) => {
        if (!ids.appTask.has(t)) issue(rel, `${path}.covers.appTasks[${j}]`, `"${t}" isn't an app task`);
      });
      // A disabled puzzle just doesn't count on the map (the puzzle file's own issues are reported there).
      o.covers.puzzles?.forEach((n, j) => {
        if (!Object.hasOwn(GAME_PUZZLES, n) && !aheadPuzzles.has(n))
          issue(rel, `${path}.covers.puzzles[${j}]`, `"${n}" isn't a puzzle the game plays`);
      });
    });
    const reflected = new Set<string>();
    l.reflections.forEach((r, i) => {
      const path = `reflections[${i}]`;
      if (reflected.has(r.chapter)) issue(rel, `${path}.chapter`, `${r.chapter} has a reflection already`);
      reflected.add(r.chapter);
      inCourse(`${path}.chapter`, r.chapter);
      source(`${path}.source`, r.chapter, r.source);
      optionIds(`${path}.choices`, r.choices);
    });
    for (const q of Object.keys(l.learned)) {
      questStep(rel, at('learned', q), q, null);
      if (!l.appTasks.some((t) => t.quest === q))
        issue(rel, at('learned', q), `${q} has no app tasks: its done line is the one the Logbook shows`);
    }
  }
  if (!files.includes('learning.json'))
    for (const [rel, q] of quests)
      for (const [name, list] of Object.entries(q.scripts))
        list.forEach((st, i) => {
          if ('appTask' in st)
            issue(
              rel,
              `${at('scripts', name)}[${i}]`,
              'hands off an app task, but the course has no learning.json',
            );
        });
  meta.recap?.exclude?.forEach((q, i) => {
    if (!ids.quiz.has(q)) issue('course.json', `recap.exclude[${i}]`, `"${q}" isn't a quiz in this course`);
  });

  // Migrations: what they move a save to is this course's.
  const mig = meta.migrations;
  if (mig && questsOk) {
    if (mig.quests) checkRules('course.json', 'migrations.quests', mig.quests, false);
    for (const [old, to] of Object.entries(mig.renamed ?? {}))
      to.forEach((id, i) => {
        if (!ids.page.has(id) && !ids.term.has(id))
          issue(
            'course.json',
            `${at('migrations.renamed', old)}[${i}]`,
            `"${id}" isn't a page or a glossary term`,
          );
      });
    for (const [quest, terms] of Object.entries(mig.taught ?? {})) {
      questStep('course.json', at('migrations.taught', quest), quest, null);
      terms.forEach((t, i) => {
        if (!ids.term.has(t))
          issue('course.json', `${at('migrations.taught', quest)}[${i}]`, `"${t}" isn't a glossary term`);
      });
    }
  }

  // Hooks (COURSE-PACKS.md §5): the lines and quizzes the game asks for by id.
  const h = meta.hooks;
  const hook = (path: string, id: string, ahead = false) => voiced('course.json', `hooks.${path}`, id, ahead);
  h.briefing.lines.forEach((id, i) => hook(`briefing.lines[${i}]`, id));
  hook('briefing.chest', h.briefing.chest);
  for (const [island, x] of Object.entries(h.islands)) {
    const path = at('islands', island);
    if (!meta.islands.some((i) => i.island === island))
      issue('course.json', `hooks.${path}`, `"${island}" isn't one of the course's islands`);
    const ahead = aheadIsland(island);
    x.landing?.forEach((id, i) => hook(`${path}.landing[${i}]`, id, ahead));
    x.welcome.forEach((id, i) => {
      if (id !== '@nav' && id !== '@starfish') hook(`${path}.welcome[${i}]`, id, ahead);
    });
    x.welcomeBack?.forEach((id, i) => hook(`${path}.welcomeBack[${i}]`, id, ahead));
    hook(`${path}.tips.nav`, x.tips.nav, ahead);
    hook(`${path}.tips.starfish`, x.tips.starfish, ahead);
  }
  hook('sail.line', h.sail.line);
  if (h.sail.meridianOpen) hook('sail.meridianOpen', h.sail.meridianOpen);
  for (const [npc, list] of Object.entries(h.npcVoiced)) {
    if (!cast.has(npc))
      issue('course.json', `hooks.${at('npcVoiced', npc)}`, `"${npc}" isn't one of the game's NPCs`);
    list.forEach((id, i) => hook(`${at('npcVoiced', npc)}[${i}]`, id));
  }
  for (const [k, id] of Object.entries(h.setPieces)) hook(at('setPieces', k), id);
  for (const [b, x] of Object.entries(h.battles)) {
    for (const [k, id] of Object.entries(x.kraken?.lines ?? {}))
      hook(`${at('battles', b)}.kraken.lines.${k}`, id);
    x.waves.forEach((w, i) => {
      if (!ids.quiz.has(w.quiz))
        issue(
          'course.json',
          `hooks.${at('battles', b)}.waves[${i}].quiz`,
          `"${w.quiz}" isn't a quiz in this course`,
        );
    });
  }

  // The Model Market's files come with its puzzle (a course without the market has neither).
  const marketOn =
    !!get<PuzzleFile>('puzzles/market.json') && !get<PuzzleFile>('puzzles/market.json')!.disabled;
  for (const f of ['market.json', 'models.json'])
    if (marketOn && !files.includes(f))
      issue(f, '', 'is missing: the course runs the Model Market (puzzles/market.json)');
  // The cast (COURSE-PACKS.md §5): every line has a voice, through its speaker or its own fields. A
  // text-only course has captions instead, and no cast.
  if (spoken && !files.includes('voice/cast.json'))
    issue(
      'voice/cast.json',
      '',
      'is missing: a voiced course says who voices each speaker (or set "voice": false)',
    );
  if (!spoken && files.includes('voice/cast.json'))
    issue('voice/cast.json', '', 'a text-only course ("voice": false) has no voices to cast');
  const castFile = get<{ speakers: Record<string, CastEntry> }>('voice/cast.json');
  if (voice && castFile) {
    for (const [i, l] of (voice.lines as VoiceLineDefinition[]).entries()) {
      // A pending line gets its voice when it's voiced.
      if (l.pending) continue;
      const r = resolveLine(l, castFile.speakers);
      if (!r.voice && !r.voiceEnv)
        issue(
          'voice/lines.json',
          `lines[${i}]`,
          `"${l.id}" has no voice: give ${l.speaker} one in voice/cast.json`,
        );
    }
    for (const speaker of Object.keys(castFile.speakers))
      if (!voice.lines.some((l) => l.speaker === speaker))
        issue('voice/cast.json', at('speakers', speaker), `no line in voice/lines.json is ${speaker}'s`);
  }

  const market = get<MarketData>('market.json');
  if (market)
    checkMarket(market, {
      issue,
      cite,
      sectionOf,
      lines,
      audio,
      course,
      linesFile: `${dir}/voice/lines.json`,
      manifestPath,
      islands: meta.islands.map((i) => i.island),
      ahead: aheadIsland,
    });
  const boards = get<CourseBoardsData>('boards.json');
  if (boards) checkBoards(boards, meta, lock, issue);
  const labels = get<{ labels: Record<string, { ch: string; source: Cite }> }>('labels.json')?.labels;
  for (const [id, l] of Object.entries(labels ?? {})) {
    const path = at('labels', id);
    cite('labels.json', `${path}.source`, l.source);
    if (l.source.chapter.slice(0, 2) !== l.ch)
      issue(
        'labels.json',
        `${path}.ch`,
        `should be "${l.source.chapter.slice(0, 2)}" (its source's chapter)`,
      );
  }
  const models = get<{ models: { name: string; category: string }[] }>('models.json')?.models;
  if (models) {
    const names = new Set<string>();
    models.forEach((m, i) => {
      if (names.has(m.name)) issue('models.json', `models[${i}]`, `${m.name} is listed twice`);
      names.add(m.name);
      if (market && !market.categories.some((c) => c.id === m.category))
        issue(
          'models.json',
          `models[${i}].category`,
          `"${m.category}" isn't one of market.json's categories`,
        );
    });
    for (const c of market?.categories ?? [])
      if (!models.some((m) => m.category === c.id))
        issue('models.json', 'models', `no ${c.id} model: its signboard would be empty`);
  }
  return issues;
}

type Issue = (rel: string, path: string, message: string) => void;
type Entries = Readonly<Record<string, Record<string, unknown>>>;

/** Each game id bound exactly once (`given`, in the pack's order). */
function bindsEach(
  issue: Issue,
  rel: string,
  path: string,
  given: readonly unknown[],
  want: readonly string[],
): void {
  for (const w of want) {
    const n = given.filter((g) => g === w).length;
    if (n !== 1) issue(rel, path, `binds "${w}" ${n} times: bind each of ${want.join(', ')} once`);
  }
}

/** Keys that must be one of `known`. */
function knownKeys(
  issue: Issue,
  rel: string,
  path: string,
  keys: readonly string[],
  known: readonly string[],
  what: string,
): void {
  for (const k of keys) if (!known.includes(k)) issue(rel, at(path, k), `"${k}" isn't ${what}`);
}

/** A value that must be one of `known`. */
function known(
  issue: Issue,
  rel: string,
  path: string,
  v: string,
  ids: readonly string[],
  what: string,
): void {
  if (!ids.includes(v)) issue(rel, path, `"${v}" isn't ${what}`);
}

/**
 * The game's mechanic ids a puzzle binds its own ids to (COURSE-PACKS.md, "Step 5 as built"): every
 * one the mechanic acts out is bound once, and the file's other entries name its own ids.
 */
function checkBindings(
  name: string,
  rel: string,
  p: PuzzleFile & Record<string, unknown>,
  issue: Issue,
  other: (name: string) => (PuzzleFile & Record<string, unknown>) | null,
): void {
  const acts = (r: unknown) => Object.values((r ?? {}) as Entries).map((v) => v.acts);
  if (name === 'three-helms' && p.modes) {
    const modes = Object.keys(p.modes as Entries);
    bindsEach(issue, rel, 'modes', acts(p.modes), HELM_MODES);
    bindsEach(
      issue,
      rel,
      'review',
      ((p.review ?? []) as { acts: string }[]).map((r) => r.acts),
      REVIEW_ACTS,
    );
    const orders = (p.orders ?? {}) as Entries;
    knownKeys(issue, rel, 'orders', Object.keys(orders), modes, 'a mode');
    for (const m of modes) if (!orders[m]) issue(rel, 'orders', `needs an order for "${m}"`);
    for (const [k, o] of Object.entries(orders))
      knownKeys(
        issue,
        rel,
        `${at('orders', k)}.wrong`,
        Object.keys((o.wrong ?? {}) as object),
        modes,
        'a mode',
      );
    knownKeys(issue, rel, 'orderHints', Object.keys((p.orderHints ?? {}) as object), modes, 'a mode');
  }
  if (name === 'channel-routing' && p.crews) {
    bindsEach(issue, rel, 'crews', acts(p.crews), CREWS);
    const twist = (p.twist as { choices?: { acts: string; right: boolean }[] } | undefined)?.choices ?? [];
    twist.forEach((c, i) => {
      if (c.right && c.acts !== 'reroute' && c.acts !== 'close')
        issue(rel, `twist.choices[${i}].acts`, 'a right answer reroutes or closes (the Spire acts it out)');
    });
  }
  if (name === 'workspaces' && p.places) {
    const places = p.places as { id: string; acts: string }[];
    bindsEach(
      issue,
      rel,
      'places',
      places.map((x) => x.acts),
      WORKSPACE_IDS,
    );
    const ids = places.map((x) => x.id);
    const crews = Object.keys((other('channel-routing')?.crews ?? {}) as Entries);
    const orders = (p.orders ?? {}) as Entries;
    if (crews.length) {
      knownKeys(issue, rel, 'orders', Object.keys(orders), crews, 'a crew of puzzles/channel-routing.json');
      for (const c of crews) if (!orders[c]) issue(rel, 'orders', `needs an order for "${c}"`);
    }
    for (const [k, o] of Object.entries(orders)) {
      const path = at('orders', k);
      known(issue, rel, `${path}.best`, o.best as string, ids, 'a place');
      ((o.accept ?? []) as string[]).forEach((a, j) =>
        known(issue, rel, `${path}.accept[${j}]`, a, ids, 'a place'),
      );
      for (const f of ['right', 'why'])
        knownKeys(issue, rel, `${path}.${f}`, Object.keys((o[f] ?? {}) as object), ids, 'a place');
    }
  }
  if (name === 'crane' && Array.isArray(p.cargo)) {
    const props = (p.cargo as { acts: string }[]).map((c) => c.acts);
    if (new Set(props).size !== props.length) issue(rel, 'cargo', 'binds a prop twice: one kind per prop');
  }
  if (name === 'crate-yard' && p.bins && !Array.isArray(p.bins)) {
    bindsEach(issue, rel, 'bins', acts(p.bins), CRATE_KINDS);
    const bins = Object.keys(p.bins as Entries);
    ((p.items ?? []) as { kind: string }[]).forEach((it, i) => {
      if (!bins.includes(it.kind)) issue(rel, `items[${i}].kind`, `"${it.kind}" isn't a bin`);
    });
  }
  if (name === 'lost-letters' && Array.isArray(p.bins)) {
    const ids = [...(p.bins as { id: string }[]).map((b) => b.id), (p.tray as { id: string }).id];
    ((p.items ?? []) as { answer: string; wrong?: object }[]).forEach((it, i) => {
      known(issue, rel, `items[${i}].answer`, it.answer, ids, 'a bin or the tray');
      knownKeys(issue, rel, `items[${i}].wrong`, Object.keys(it.wrong ?? {}), ids, 'a bin or the tray');
    });
  }
  if (name === 'flag-hoist' && Array.isArray(p.bins)) {
    const symbols = (p.bins as { symbol: string }[]).map((b) => b.symbol);
    if (symbols.length > HALYARDS)
      issue(rel, 'bins', `the mast has ${HALYARDS} halyards, not ${symbols.length}`);
    (
      (p.items ?? []) as {
        kind: string;
        answer?: string;
        wrong?: object;
        choices?: { flag: string | null }[];
      }[]
    ).forEach((it, i) => {
      if (it.kind === 'flag') {
        known(issue, rel, `items[${i}].answer`, it.answer!, symbols, 'a flag');
        knownKeys(issue, rel, `items[${i}].wrong`, Object.keys(it.wrong ?? {}), symbols, 'a flag');
      } else
        it.choices?.forEach((c, j) => {
          if (c.flag !== null) known(issue, rel, `items[${i}].choices[${j}].flag`, c.flag, symbols, 'a flag');
        });
    });
  }
  if (p.mechanic === 'circuit' && p.places) checkCircuit(rel, p, issue);
}

interface CircuitOption {
  id: string;
  right?: true;
  backTo?: string;
  reason?: string;
  cite?: string;
}

/**
 * A circuit's bindings (src/game/puzzles/circuit/places.ts): each of the game's places on its circuit
 * bound once; every station at a place; every station with options has a right one, and every wrong
 * one goes back to a place with its reason and the section it comes from; every claim that doesn't
 * stick says why; every `cite` is a key of `cites`.
 */
function checkCircuit(rel: string, p: PuzzleFile & Record<string, unknown>, issue: Issue): void {
  const circuit = p.circuit as CircuitKind;
  const places = Object.keys(p.places as Entries);
  const acts = Object.values(p.places as Entries).map((v) => v.acts);
  bindsEach(issue, rel, 'places', acts, CIRCUIT_PLACES[circuit] ?? []);
  const cites = Object.keys((p.cites ?? {}) as object);
  const cited = (path: string, key: string | undefined) => {
    if (key === undefined) issue(rel, path, 'needs a "cite": the section its reason comes from');
    else known(issue, rel, path, key, cites, 'a key of "cites"');
  };
  type Station = {
    at: string;
    kind: string;
    cite: string;
    options?: CircuitOption[];
    tiles?: { sticks: boolean; reason?: string; cite?: string }[];
    lamps?: unknown[];
    planks?: number;
  };
  ((p.laps ?? []) as { stations: Station[] }[]).forEach((lap, i) =>
    lap.stations.forEach((st, j) => {
      const path = `laps[${i}].stations[${j}]`;
      known(issue, rel, `${path}.at`, st.at, places, 'a key of "places"');
      cited(`${path}.cite`, st.cite);
      const needs = { choose: 'options', seal: 'options', tiles: 'tiles', gate: 'lamps', sound: 'planks' }[
        st.kind
      ] as keyof Station | undefined;
      if (needs && st[needs] === undefined) issue(rel, path, `a "${st.kind}" station needs "${needs}"`);
      if (st.options) {
        if (!st.options.some((o) => o.right)) issue(rel, `${path}.options`, 'needs a right option');
        st.options.forEach((o, k) => {
          if (o.right) return;
          const at = `${path}.options[${k}]`;
          if (!o.reason) issue(rel, at, 'a wrong option needs its "reason"');
          if (o.backTo === undefined) issue(rel, at, 'a wrong option needs "backTo": where the hull goes');
          else known(issue, rel, `${at}.backTo`, o.backTo, places, 'a key of "places"');
          cited(`${at}.cite`, o.cite);
        });
      }
      st.tiles?.forEach((t, k) => {
        if (t.sticks) return;
        if (!t.reason) issue(rel, `${path}.tiles[${k}]`, 'a claim that doesn’t stick needs its "reason"');
        cited(`${path}.tiles[${k}].cite`, t.cite);
      });
      if (st.tiles && !st.tiles.some((t) => t.sticks))
        issue(rel, `${path}.tiles`, 'needs a claim that sticks');
    }),
  );
}

function checkMarket(
  m: MarketData,
  ctx: {
    issue: (rel: string, path: string, message: string) => void;
    cite: (rel: string, path: string, c: Cite) => void;
    sectionOf: (chapter: string, anchor: string) => { markdown: string } | null;
    lines: ReadonlyMap<string, VoiceLine>;
    audio: ReadonlyMap<string, VoiceLine>;
    course: string;
    linesFile: string;
    manifestPath: string;
    /** The islands the course uses (each has a stall). */
    islands: readonly string[];
    /** A course island the game hasn't got yet: its stall comes with its wiring. */
    ahead: (island: string) => boolean;
  },
): void {
  const rel = 'market.json';
  const fail = (path: string, message: string) => ctx.issue(rel, path, message);

  for (const [k, q] of Object.entries(m.quotes)) {
    const path = `quotes.${k}`;
    ctx.cite(rel, path, q);
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
  const tiers = Object.fromEntries(m.categories.map((c) => [c.id, c.acts]));
  if (m.categories.map((c) => c.acts).join(',') !== MODEL_TIERS.join(','))
    fail('categories', `bind ${MODEL_TIERS.join(', ')} once each, smallest first`);
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

  // The economy: every hire costs 1 to maxPrice (≤ 4); a right-sized hire's refund is always less
  // than it cost, so a right-sized job costs at least a starfish and a hire never adds starfish (the
  // purse only grows by finding them, and spending can't take it below 0); and every job can be done
  // right-sized with the starfish you find before the market.
  m.house.levels.forEach((l, i) => {
    const prev = m.house.levels[i - 1];
    if (prev && l.price < prev.price)
      fail(`house.levels[${i}].price`, `a higher level can't cost less than ${prev.label}`);
  });
  const hires: Hire[] = m.house.levels.map((l) => ({ auto: true, level: l.id }));
  for (const c of cats)
    for (const e of EFFORTS) hires.push({ auto: false, category: c, model: c, effort: e });
  const name = (h: Hire) => (h.auto ? `the house special at ${h.level}` : `${h.category} on ${h.effort}`);
  for (const h of hires) {
    const p = priceIn(m, h);
    if (p < 1 || p > m.maxPrice)
      fail('categories', `${name(h)} costs ${p}: every hire should cost 1 to ${m.maxPrice}`);
  }
  const cheapest = new Map<string, number>();
  /** Each job's cheapest right-sized hire: what it costs, and what comes back. */
  const fairHires: { pay: number; back: number }[] = [];
  m.jobs.forEach((j, i) => {
    const job = { size: j.size } as MarketJob;
    const right = hires.filter((h) => grade(job, h, tiers, m).outcome === 'right');
    if (!right.length) return fail(`jobs[${i}]`, 'no hire is right-sized for it');
    const least = Math.min(...right.map((h) => priceIn(m, h)));
    // The house special's refund is capped at its price less one: the size's refund is a right-sized model hire's.
    const models = right.filter((h) => !h.auto).map((h) => priceIn(m, h));
    if (models.length) cheapest.set(j.size, Math.min(...models));
    const refunds = { quick: m.sizes.quick.refund, hard: m.sizes.hard.refund };
    fairHires.push({
      pay: least,
      back: refundIn(
        refunds,
        job,
        right.find((h) => priceIn(m, h) === least)!,
        (h) => priceIn(m, h),
      ),
    });
  });
  for (const [size, least] of cheapest) {
    const refund = m.sizes[size as keyof MarketData['sizes']].refund;
    if (refund >= least)
      fail(
        `sizes.${size}.refund`,
        `${refund} back for a ${least}-starfish model hire: a refund must be less than the hire, so a right-sized job costs at least 1 starfish`,
      );
  }
  // Every island has a stall, so the first market is on the course's first island: its starfish
  // must clear every job right-sized, spending the starfish that come back (in the best order).
  const first = ctx.islands[0];
  const found = first ? starfishOn(first as IslandId).length : 0;
  const need = marketPurseNeeded(fairHires);
  if (need > found)
    fail(
      'jobs',
      `the jobs need ${need} starfish to start with, right-sized, but there are only ${found} on ${first ?? 'the first island'}`,
    );

  const seen = new Set<string>();
  for (const [k, g] of Object.entries(m.gilda)) {
    const path = `gilda.${k}`;
    if (seen.has(g.voice)) fail(`${path}.voice`, `"${g.voice}" is used twice`);
    seen.add(g.voice);
    const l = ctx.lines.get(g.voice);
    if (!l) fail(`${path}.voice`, `"${g.voice}" isn't in ${ctx.linesFile}`);
    else {
      if (l.speaker !== 'Gilda') fail(`${path}.voice`, `"${g.voice}" is ${l.speaker}'s line, not Gilda's`);
      if (l.text !== g.text)
        fail(`${path}.text`, `differs from "${g.voice}" in ${ctx.linesFile}: change both to the same words`);
    }
    const a = ctx.audio.get(g.voice);
    if (!a) fail(`${path}.voice`, `"${g.voice}" has no audio (${ctx.manifestPath})`);
    else if (a.text !== g.text)
      fail(
        `${path}.text`,
        `the audio says something else: regenerate it (npx tsx tools/voice/generate.ts --course ${ctx.course} --only=${g.voice}; docs/content-data.md)`,
      );
    if (g.source) ctx.cite(rel, `${path}.source`, g.source);
  }

  // The other stalls' keepers: each stall on the course's islands (the game's) has its keeper's own
  // version of every line Gilda says, and a goodbye, in the keeper's voice (their name is the lines'
  // speaker), so a stall never plays Gilda's voice.
  const keepers = m.keepers ?? {};
  for (const stall of MARKET_STALLS) {
    if (stall.lines === 'gilda' || !ctx.islands.includes(stall.island)) continue;
    if (!keepers[stall.island])
      fail(
        'keepers',
        `has no "${stall.island}": ${stall.keeper.name} keeps a stall there and needs their own lines`,
      );
  }
  for (const [island, k] of Object.entries(keepers)) {
    const stall = MARKET_STALLS.find((s) => s.island === island && s.lines === 'keepers');
    // An island the game hasn't got yet: its keeper's lines are written (voiced or pending), and its
    // stall (the keeper's name) comes with its wiring.
    const ahead = !stall && ctx.ahead(island);
    if (!stall && !ahead) {
      fail(`keepers.${island}`, `"${island}" has no stall but Gilda's (src/game/market/stalls.ts)`);
      continue;
    }
    for (const [key, g] of Object.entries(k)) {
      const path = `keepers.${island}.${key}`;
      if (seen.has(g.voice)) fail(`${path}.voice`, `"${g.voice}" is used twice`);
      seen.add(g.voice);
      const l = ctx.lines.get(g.voice);
      if (!l) fail(`${path}.voice`, `"${g.voice}" isn't in ${ctx.linesFile}`);
      else if (ahead) {
        if (l.text !== g.text)
          fail(
            `${path}.text`,
            `differs from "${g.voice}" in ${ctx.linesFile}: change both to the same words`,
          );
        // Its stall isn't in the game yet: a pending line needs no audio; a voiced one is checked below.
        if (l.pending) {
          if (g.source) ctx.cite(rel, `${path}.source`, g.source);
          continue;
        }
      } else {
        if (l.pending) fail(`${path}.voice`, `"${g.voice}" is pending: voice it and drop "pending" first`);
        if (l.speaker !== stall!.keeper.name)
          fail(`${path}.voice`, `"${g.voice}" is ${l.speaker}'s line, not ${stall!.keeper.name}'s`);
        if (l.text !== g.text)
          fail(
            `${path}.text`,
            `differs from "${g.voice}" in ${ctx.linesFile}: change both to the same words`,
          );
      }
      const a = ctx.audio.get(g.voice);
      if (!a) fail(`${path}.voice`, `"${g.voice}" has no audio (${ctx.manifestPath})`);
      else if (a.text !== g.text)
        fail(
          `${path}.text`,
          `the audio says something else: regenerate it (npx tsx tools/voice/generate.ts --course ${ctx.course} --only=${g.voice}; docs/content-data.md)`,
        );
      if (g.source) ctx.cite(rel, `${path}.source`, g.source);
    }
  }
}

/** The islands with a notice board (the game's) and the chapter each shows (the course's). */
export function courseBoardIslands(meta: CourseMeta): { island: IslandId; chapter: string }[] {
  return (Object.keys(COURSE_BOARDS) as IslandId[]).flatMap((island) => {
    const chapter = meta.islands.find((i) => i.island === island)?.chapter;
    return chapter ? [{ island, chapter }] : [];
  });
}

function checkBoards(
  b: CourseBoardsData,
  meta: CourseMeta,
  lock: CourseLock,
  issue: (rel: string, path: string, message: string) => void,
): void {
  const fail = (path: string, message: string) => issue('boards.json', path, message);
  const links = b.pins.map((p) => p.link).sort();
  if (links.join(',') !== 'chapter,home') fail('pins', 'should be one "chapter" pin and one "home" pin');
  const tokens = [...b.header.sign, b.header.kicker, ...b.pins.flatMap((p) => [p.sign, p.text, p.aria])];
  for (const t of tokens)
    for (const m of t.matchAll(/\{(\w+)\}/g))
      if (m[1] !== 'num' && m[1] !== 'title')
        fail('header', `"{${m[1]}}" isn't a field: use {num} or {title}`);

  for (const { island, chapter } of courseBoardIslands(meta)) {
    const path = `islands[${meta.islands.findIndex((i) => i.island === island)}].chapter`;
    const ch = lock.chapters[chapter];
    if (!ch) issue('course.json', path, `${chapter} isn't in the course snapshot (sync it first)`);
    else {
      const n = boardTopics(chapter, ch, b.skip).length;
      if (n < MIN_BOARD_TOPICS)
        fail(
          'skip',
          `${chapter}'s board (${island}) has ${n} topics (at least ${MIN_BOARD_TOPICS}): check "skip"`,
        );
    }
  }
}

/**
 * Where the game's boards stand (src/world/islands/course-boards.ts): each on its island, on the
 * ground or a deck up to 1 m above it. `spots` replaces the game's (the tests break one).
 */
export function checkBoardSpots(
  spots: Readonly<Record<string, Pick<CourseBoardPlacement, 'x' | 'y' | 'z'>>> = COURSE_BOARDS,
): { island: string; message: string }[] {
  const out: { island: string; message: string }[] = [];
  for (const [island, p] of Object.entries(spots) as [
    IslandId,
    Pick<CourseBoardPlacement, 'x' | 'y' | 'z'>,
  ][]) {
    if (islandAt(p.x, p.z) !== island)
      out.push({ island, message: `(${p.x}, ${p.z}) isn't in ${island}'s waters` });
    const ground = GROUND[island](p.x, p.z);
    if (ground < 0.5)
      out.push({ island, message: `(${p.x}, ${p.z}) is in the water (ground ${ground.toFixed(2)} m)` });
    else if (p.y < ground - 0.3 || p.y > ground + 1)
      out.push({
        island,
        message: `y should be the ground under it (${ground.toFixed(2)} m, or a deck up to 1 m above)`,
      });
  }
  return out;
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
  islands: readonly { island: string; chapter: string }[],
  skip: CourseBoardsData['skip'],
  lock: CourseLock,
  previous: CourseLock | null,
): BoardChange[] {
  return islands.map(({ island, chapter }) => {
    const now = lock.chapters[chapter];
    const was = previous?.chapters[chapter];
    const topics = now ? boardTopics(chapter, now, skip) : [];
    const before = was ? boardTopics(chapter, was, skip) : topics;
    const titles = (t: readonly CourseBoardTopic[]) => new Set(t.map((x) => x.title));
    const a = titles(topics),
      r = titles(before);
    return {
      island,
      chapter,
      topics,
      added: [...a].filter((t) => !r.has(t)),
      removed: [...r].filter((t) => !a.has(t)),
    };
  });
}
