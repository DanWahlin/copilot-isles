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
 * - every voice line a script, a chapter or the market plays is in `voice/lines.json`, and its audio
 *   (`public/voice/manifest.json`) says the same words, so a changed line is regenerated;
 * - the economy stays sane (prices 1 to 4, bigger models cost more, a refund is never more than the
 *   hire, every job can be done with the starfish you can find before the market);
 * - each board's chapter is in the snapshot with at least 5 topics, and each board stands on its island.
 *
 * `src/content/content.test.ts` fails on any issue; `npm run content:check` (tools/content/report.ts)
 * writes them as a report for the weekly refresh PRs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CourseMeta } from '../../src/course/catalog';
import {
  PUZZLE_MECHANICS,
  type IslandQuestsFile,
  type PackScriptStep,
  type PuzzleFile,
  type QuestDef,
} from '../../src/course/pack';
import { GAME_PUZZLES } from '../../src/course/puzzles';
import type { Beat, QuestCond } from '../../src/game/beats';
import { resolveLine, type CastEntry, type VoiceLineDefinition } from '../voice/lines';
import type { CourseBoardsData } from '../../src/content/course-boards';
import type { MarketData } from '../../src/content/market';
import { islandAt, type IslandId } from '../../src/game/islands';
import { MERIDIAN_NPCS, meridianExtras } from '../../src/game/meridian-npcs';
import { EFFORTS, grade, priceIn, type Hire, type MarketJob } from '../../src/game/market/jobs';
import { COVE_NPCS } from '../../src/game/npcs';
import { THOUSAND_BOUGH_NPCS, thousandBoughExtras } from '../../src/game/thousand-bough-npcs';
import { boardTopics, type CourseBoardTopic } from '../../src/learn/course-board';
import type { CourseLock } from '../../src/learn/course/lock';
import { normalizeForCompare, parseSections } from '../../src/learn/course/sections';
import type { ChapterContent, SourceRef } from '../../src/learn/types';
import { ARCHIPELAGO } from '../../src/ui/chart/archipelago';
import { COURSE_BOARDS, type CourseBoardPlacement } from '../../src/world/islands/course-boards';
import { meridianHeight } from '../../src/world/islands/meridian';
import { thousandBoughHeight } from '../../src/world/islands/thousand-bough/height';
import { starfishOn } from '../../src/world/starfish/spots';
import { coveHeight } from '../../src/world/terrain/cove-height';
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
  // One schema per mechanic: the file's own `mechanic` picks it.
  { file: 'puzzles/*.json', schema: 'puzzle-<mechanic>.schema.json' },
];

/** Every schema in `courses/schemas/`, with the puzzles' one per mechanic. */
export const PACK_SCHEMAS: readonly string[] = PACK_FILES.flatMap((f) =>
  f.schema.includes('<mechanic>')
    ? PUZZLE_MECHANICS.map((m) => f.schema.replace('<mechanic>', m))
    : [f.schema],
);

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

/** The game's cast (every NPC a pack can give barks to), with every extra that can appear. */
function castIds(): Set<string> {
  const anyAnchor = new Proxy({}, { get: () => ({ x: 0, z: 0 }), has: () => true }) as Record<
    string,
    { x: number; z: number }
  >;
  return new Set(
    [
      ...COVE_NPCS,
      ...MERIDIAN_NPCS,
      ...meridianExtras(anyAnchor),
      ...THOUSAND_BOUGH_NPCS,
      ...thousandBoughExtras(anyAnchor, true),
    ].map((n) => n.id),
  );
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
  for (const req of PACK_FILES.filter((f) => !f.file.includes('*')))
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
  const sectionOf = (chapter: string, anchor: string) => {
    const short = lock.chapters[chapter]?.short;
    if (!short) return null;
    if (!readmes.has(short)) {
      const path = `${dir}/public/course/${short}/README.md`;
      readmes.set(short, existsSync(join(root, path)) ? parseSections(read(path)) : []);
    }
    return readmes.get(short)!.find((s) => s.anchor === anchor) ?? null;
  };
  /** An anchor and hash against the lock. */
  const cite = (rel: string, path: string, c: Cite) => {
    const ch = lock.chapters[c.chapter];
    const s = ch?.sections[c.anchor];
    if (!ch) issue(rel, path, `chapter ${c.chapter} isn't in the course snapshot`);
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
  /** A voice line a script or a chapter plays: in the lines file, with audio that says the same. */
  const voiced = (rel: string, path: string, id: string) => {
    if (!voice) return;
    const l = lines.get(id);
    if (!l) return issue(rel, path, `"${id}" isn't in ${dir}/voice/lines.json`);
    const a = audio.get(id);
    if (!a)
      issue(
        rel,
        path,
        `"${id}" has no audio (${manifestPath}): npx tsx tools/voice/generate.ts --course ${course} --only=${id}`,
      );
    else if (a.text !== l.text)
      issue(
        rel,
        path,
        `"${id}": the audio says something else: regenerate it (npx tsx tools/voice/generate.ts --course ${course} --only=${id}; docs/content-data.md)`,
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
      voiced(rel, at('voiced', id), id);
    }
    for (const [id, x] of Object.entries(c.cited ?? {})) src(`${at('cited', id)}.source`, x.source);
  }

  /** A script's steps: every id they name is in this course. */
  const steps = (
    rel: string,
    base: string,
    list: readonly PackScriptStep[],
    isScript: (name: string) => boolean,
    island: string,
  ) =>
    list.forEach((s, i) => {
      const path = `${base}[${i}]`;
      const has = (kind: keyof typeof ids, id: string, what: string) => {
        if (!ids[kind].has(id)) issue(rel, path, `"${id}" isn't ${what} in this course`);
      };
      if ('say' in s) voiced(rel, path, s.say);
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
      } else if ('script' in s) {
        if (!isScript(s.script)) issue(rel, path, `"${s.script}" isn't a script of ${island}`);
      }
      if (('askFork' in s || 'askSetup' in s) && s.line) voiced(rel, path, s.line);
    });

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
  for (const [rel, q] of quests) {
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
      steps(rel, at('scripts', name), list, (n) => Object.hasOwn(q.scripts, n), q.island);
    q.beats?.forEach((b: Beat, i) => {
      const path = `beats[${i}]`;
      for (const npc of typeof b.npc === 'string' ? [b.npc] : b.npc)
        if (!cast.has(npc)) issue(rel, `${path}.npc`, `"${npc}" isn't one of the game's NPCs`);
      for (const [key, c] of Object.entries(b.when ?? {})) {
        if (key.startsWith('$')) {
          if (typeof c !== 'boolean') issue(rel, at(`${path}.when`, key), 'a flag is true or false');
          continue;
        }
        const d = questDefs.get(key);
        if (!d) {
          issue(rel, at(`${path}.when`, key), `"${key}" isn't a quest`);
          continue;
        }
        const cond = c as QuestCond;
        const want =
          cond !== null && typeof cond === 'object' && !Array.isArray(cond)
            ? (cond as { not: unknown }).not
            : cond;
        for (const step of Array.isArray(want) ? want : [want])
          if (step !== null && !Object.hasOwn(d.steps, step as string))
            issue(rel, at(`${path}.when`, key), `"${step as string}" isn't a step of ${key}`);
      }
      const what = [b.script, b.say, b.none].filter((x) => x !== undefined).length;
      if (what !== 1) issue(rel, path, 'needs one of "script", "say" or "none"');
      if (b.script && !Object.hasOwn(q.scripts, b.script))
        issue(rel, `${path}.script`, `"${b.script}" isn't a script of ${q.island}`);
      if (b.say) voiced(rel, `${path}.say`, b.say);
    });
    for (const npc of Object.keys(q.barks))
      if (!cast.has(npc)) issue(rel, at('barks', npc), `"${npc}" isn't one of the game's NPCs`);
  }

  // Puzzles (COURSE-PACKS.md §4): one file per puzzle the game plays, with the mechanic it runs.
  const questsOk = quests.length === files.filter((f) => f.startsWith('quests/')).length;
  for (const [name, mechanic] of Object.entries(GAME_PUZZLES)) {
    const rel = `puzzles/${name}.json`;
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
  const checkPuzzle = (rel: string, p: PuzzleFile & Record<string, unknown>): void => {
    // Every voice line it plays: its `lines`, and any `line` (or a letter's `ok`) in its content.
    const walk = (v: unknown, path: string, key: string) => {
      if (typeof v === 'string') {
        if (
          key === 'line' ||
          (key === 'ok' && path.startsWith('items')) ||
          path.startsWith('lines') ||
          /^orders\.\w+\.wrong/.test(path)
        )
          voiced(rel, path, v);
      } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, at(path, i), key));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v))
          if (k !== 'text' && k !== 'scripts' && !k.startsWith('$')) walk(x, path ? at(path, k) : k, k);
    };
    walk(p, '', '');
    if (typeof p.quiz === 'string' && !ids.quiz.has(p.quiz))
      issue(rel, 'quiz', `"${p.quiz}" isn't a quiz in this course`);
    // Its scripts name quest steps: checked once every quests file is (a broken one hides its quests).
    if (questsOk)
      for (const [name, list] of Object.entries((p.scripts ?? {}) as Record<string, PackScriptStep[]>))
        steps(rel, at('scripts', name), list, () => false, rel);
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
    if (!Object.hasOwn(GAME_PUZZLES, name))
      issue(rel, '', `isn't a puzzle the game plays (${Object.keys(GAME_PUZZLES).join(', ')})`);
    const p = get<PuzzleFile & Record<string, unknown>>(rel);
    if (p) checkPuzzle(rel, p);
  }

  // Hooks (COURSE-PACKS.md §5): the lines and quizzes the game asks for by id.
  const h = meta.hooks;
  const hook = (path: string, id: string) => voiced('course.json', `hooks.${path}`, id);
  h.briefing.lines.forEach((id, i) => hook(`briefing.lines[${i}]`, id));
  hook('briefing.chest', h.briefing.chest);
  for (const [island, x] of Object.entries(h.islands)) {
    const path = at('islands', island);
    if (!meta.islands.some((i) => i.island === island))
      issue('course.json', `hooks.${path}`, `"${island}" isn't one of the course's islands`);
    x.landing?.forEach((id, i) => hook(`${path}.landing[${i}]`, id));
    x.welcome.forEach((id, i) => {
      if (id !== '@nav' && id !== '@starfish') hook(`${path}.welcome[${i}]`, id);
    });
    x.welcomeBack?.forEach((id, i) => hook(`${path}.welcomeBack[${i}]`, id));
    hook(`${path}.tips.nav`, x.tips.nav);
    hook(`${path}.tips.starfish`, x.tips.starfish);
  }
  hook('sail.line', h.sail.line);
  if (h.sail.meridianOpen) hook('sail.meridianOpen', h.sail.meridianOpen);
  for (const [npc, list] of Object.entries(h.npcVoiced)) {
    if (!cast.has(npc))
      issue('course.json', `hooks.${at('npcVoiced', npc)}`, `"${npc}" isn't one of the game's NPCs`);
    list.forEach((id, i) => hook(`${at('npcVoiced', npc)}[${i}]`, id));
  }
  for (const [k, id] of Object.entries(h.setPieces)) hook(at('setPieces', k), id);
  for (const [b, x] of Object.entries(h.battles))
    x.waves.forEach((w, i) => {
      if (!ids.quiz.has(w.quiz))
        issue(
          'course.json',
          `hooks.${at('battles', b)}.waves[${i}].quiz`,
          `"${w.quiz}" isn't a quiz in this course`,
        );
    });

  // The cast (COURSE-PACKS.md §5): every line has a voice, through its speaker or its own fields.
  const castFile = get<{ speakers: Record<string, CastEntry> }>('voice/cast.json');
  if (voice && castFile) {
    for (const [i, l] of (voice.lines as VoiceLineDefinition[]).entries()) {
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
    });
    for (const c of market?.categories ?? [])
      if (!models.some((m) => m.category === c.id))
        issue('models.json', 'models', `no ${c.id} model: its signboard would be empty`);
  }
  return issues;
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
