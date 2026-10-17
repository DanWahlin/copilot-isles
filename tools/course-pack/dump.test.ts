/**
 * A canonical dump of every piece of course data the game derives (docs/specs/COURSE-PACKS.md §9),
 * so a data move can prove it changed nothing: run it before and after, and the two files must be
 * byte-identical. It reads the game's public APIs only, through dynamic imports, so the same file
 * runs against both layouts (a module that doesn't exist yet, or anymore, is skipped).
 *
 *   DUMP_OUT=<file> npx vitest run --config tools/course-pack/vitest.config.mjs
 *
 * URLs of the course's own files (snapshot pictures) are written relative to the course's asset
 * root, and files are listed by path relative to their folder with a SHA-256 each.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ROOT = join(import.meta.dirname, '..', '..');

const MODULES = import.meta.glob(['../../src/**/*.ts', '../../src/**/*.tsx', '!../../src/**/*.test.ts']);

async function tryImport(path: string): Promise<Any | null> {
  const load = MODULES[`../../src/${path}.ts`] ?? MODULES[`../../src/${path}.tsx`];
  return load ? ((await load()) as Any) : null;
}

/** Sorted keys, so object order never shows as a difference. */
function canon(v: unknown): unknown {
  if (v instanceof Map) return canon(Object.fromEntries(v));
  if (v instanceof Set) return [...v].map(canon);
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Any = {};
    for (const k of Object.keys(v).sort()) out[k] = canon((v as Any)[k]);
    return out;
  }
  if (typeof v === 'function') return '[function]';
  return v;
}

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

function filesUnder(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = sha(readFileSync(p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const firstDir = (...dirs: string[]) => dirs.map((d) => join(ROOT, d)).find((d) => existsSync(d))!;
const firstFile = (...files: string[]) => files.map((f) => join(ROOT, f)).find((f) => existsSync(f))!;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUEST_STEPS: Record<string, Record<string, string[]>> = {
  anchorage: {
    'Q0.2': ['start', 'chest', 'palette', 'done'],
    'Q0.3': ['start', 'done'],
    'Q0.4': ['start', 'done'],
    'Q0.5': ['start', 'done'],
    'Q0.7': ['start', 'actions', 'crane', 'solved', 'done'],
    'Q0.8': ['start', 'pipes', 'done'],
    'Q0.6': ['start', 'sluice', 'solved', 'done'],
    'Q0.9': ['start', 'done'],
    'Q0.10': ['start', 'done'],
    'Q0.11': ['start', 'sail', 'done'],
  },
  meridian: {
    'Q1.1': ['start', 'done'],
    'Q1.2': ['start', 'done'],
    'Q1.3': ['start', 'done'],
    'Q1.4': ['start', 'crates', 'solved', 'done'],
    'Q1.5': ['start', 'helms', 'solved', 'done'],
    'Q1.6': ['start', 'done'],
    'Q1.7': ['start', 'letters', 'solved', 'done'],
    'Q1.8': ['start', 'exam', 'done'],
    'Q1.A': ['start', 'done'],
  },
  'thousand-bough': {
    'Q2.1': ['start', 'done'],
    'Q2.2': ['start', 'done'],
    'Q2.3': ['start', 'done'],
    'Q2.4': ['start', 'done'],
    'Q2.5': ['start', 'channels', 'twist', 'solved', 'done'],
    'Q2.6': ['start', 'done'],
    'Q2.7': ['start', 'done'],
    'Q2.8': ['start', 'done'],
    'Q2.9': ['start', 'exam', 'done'],
    'Q2.A': ['start', 'try', 'done'],
  },
};

const NPCS: Record<string, string[]> = {
  anchorage: [
    'nell',
    'merchant',
    'dockhand_b',
    'dockhand_a',
    'fisherman',
    'old_sailor',
    'child',
    'suri',
    'pim',
    'pol',
    'juno',
    'lyra',
    'lookout',
  ],
  meridian: ['tobias', 'mina', 'lyra_meridian', 'anders', 'rhea', 'oren', 'pell', 'admiral', 'gilda'],
  'thousand-bough': ['tamsin', 'lyra_bough', 'saffi', 'oak', 'fen', 'ines', 'rook', 'pip', 'elder'],
};

/** A playthrough (each quest through each step, in order, the earlier ones done), then seeded random states. */
function questStates(island: string): Record<string, string>[] {
  const steps = QUEST_STEPS[island]!;
  const states: Record<string, string>[] = [{}];
  const q: Record<string, string> = {};
  for (const [id, list] of Object.entries(steps)) {
    for (const s of list) {
      q[id] = s;
      states.push({ ...q });
    }
  }
  const rnd = mulberry32(island.length * 7919);
  for (let i = 0; i < 2000; i++) {
    const r: Record<string, string> = {};
    for (const [id, list] of Object.entries(steps)) {
      const k = Math.floor(rnd() * (list.length + 1));
      if (k < list.length) r[id] = list[k]!;
    }
    states.push(r);
  }
  return states;
}

test('dump the course data', async () => {
  const out = process.env.DUMP_OUT;
  if (!out) return;

  // After the move: make sure the course pack is active (the Vitest setup normally has done it).
  const active = await tryImport('course/active');
  if (active && !active.hasActiveCourse())
    await (await tryImport('course/load'))!.activateCourse('copilot-app');
  const catalog = await tryImport('course/catalog');
  const assetBase: string = catalog?.courseAssetBase?.() ?? (import.meta.env.BASE_URL || '/');
  const rel = (url: string) => (url.startsWith(assetBase) ? `<course>/${url.slice(assetBase.length)}` : url);

  const dump: Any = {};
  const scripts: Any = {};
  const keep = (steps: unknown) => {
    const c = canon(steps);
    const id = sha(JSON.stringify(c)).slice(0, 16);
    scripts[id] = c;
    return id;
  };

  // Chapters and their indices.
  const content = (await tryImport('learn/content/index'))!;
  dump.chapters = content.CHAPTERS;
  dump.indexKeys = Object.fromEntries(
    ['IMAGES', 'QUIZZES', 'PAGES', 'CHESTS', 'GLOSSARY', 'TRIALS'].map((k) => [k, [...content[k].keys()]]),
  );
  dump.imageUrls = Object.fromEntries(
    [...content.IMAGES.keys()].map((id: string) => [id, rel(content.imageUrl(id))]),
  );
  const sources: Any[] = [];
  for (const c of content.CHAPTERS) {
    for (const x of [...c.quizzes, ...c.pages]) sources.push(x.source);
    for (const s of Object.values(c.voiced ?? {})) sources.push(s as Any);
    for (const s of Object.values(c.cited ?? {})) sources.push((s as Any).source);
  }
  dump.courseUrls = sources.map((s) => content.courseUrl(s));

  // The course's chapter list, setup and fork defaults.
  const chapters = (await tryImport('learn/course/chapters'))!;
  dump.courseChapters = {
    list: chapters.COURSE_CHAPTERS,
    repo: chapters.COURSE_REPO,
    raw: chapters.COURSE_RAW,
    blob: chapters.COURSE_BLOB,
    urls: chapters.COURSE_CHAPTERS.map((c: Any) => [
      chapters.chapterShort(c.id),
      chapters.chapterUrl(c.id),
      chapters.chapterUrl(c.id, 'x'),
    ]),
    snapshot: [
      '00-setup/assets/a.webp',
      'assets/b.webp',
      '05-mcp-plugins/assets/c.webp',
      '09-x/assets/d.webp',
    ].map(chapters.snapshotPath),
  };
  const setup = (await tryImport('learn/setup'))!;
  dump.setup = {
    issue: setup.COURSE_ISSUE,
    issueTitle: setup.COURSE_ISSUE_TITLE,
    branch: setup.COURSE_BRANCH,
    filled: setup.fillSetup('{issue} {branch} {model} {os} {key:mod+R}', setup.EMPTY_SETUP, 'mac'),
  };
  const fork = (await tryImport('learn/fork'))!;
  dump.fork = { repo: fork.COURSE_REPO, placeholder: fork.FORK_PLACEHOLDER };

  // Quests: trackers, logs, targets and every NPC's script over many quest states.
  const cove = (await tryImport('game/cove-quests'))!;
  const mer = (await tryImport('game/meridian-quests'))!;
  const tb = (await tryImport('game/thousand-bough-quests'))!;
  const islands: Any = {
    anchorage: {
      tracker: cove.questTracker,
      log: cove.questLog,
      target: cove.questTarget,
      current: cove.currentQuest,
      npc: (n: string, q: Any) => cove.npcScript(n, q),
    },
    meridian: {
      tracker: mer.meridianTracker,
      log: mer.meridianLog,
      target: mer.meridianTarget,
      current: mer.meridianCurrent,
      npc: (n: string, q: Any) => [
        mer.meridianNpcScript(n, q),
        mer.meridianNpcScript(n, q, { lettersFiled: false }),
        mer.meridianNpcScript(n, q, { lettersFiled: true }),
      ],
    },
    'thousand-bough': {
      tracker: tb.thousandBoughTracker,
      log: tb.thousandBoughLog,
      target: tb.thousandBoughTarget,
      current: tb.thousandBoughCurrent,
      npc: (n: string, q: Any) => tb.thousandBoughNpcScript(n, q),
    },
  };
  dump.quests = {};
  for (const [island, f] of Object.entries(islands) as [string, Any][]) {
    const rows = questStates(island).map((q) => ({
      q,
      tracker: keep(f.tracker(q)),
      log: keep(f.log(q)),
      target: f.target(q),
      current: f.current(q),
      boarding: island === 'anchorage' ? cove.boardingOpen(q) : null,
      npcs: Object.fromEntries(NPCS[island]!.map((n) => [n, keep(f.npc(n, q))])),
    }));
    dump.quests[`${island}.sha256`] = sha(JSON.stringify(canon(rows)));
    dump.quests[`${island}.first`] = rows.slice(0, 40);
  }
  dump.questExports = {
    NEW_VIEW_CAPTION: cove.NEW_VIEW_CAPTION,
    SURI_SOLVED: cove.SURI_SOLVED,
    POL_SOLVED: cove.POL_SOLVED,
    COVE_ISLAND: cove.COVE_ISLAND,
    COVE_CHESTS: cove.COVE_CHESTS,
    MERIDIAN_CHESTS: cove.MERIDIAN_CHESTS,
    MERIDIAN_ISLAND: mer.MERIDIAN_ISLAND,
    MERIDIAN_QUESTS: mer.MERIDIAN_QUESTS,
    MERIDIAN_TARGETS: mer.MERIDIAN_TARGETS,
    MERIDIAN_WELCOME: mer.MERIDIAN_WELCOME,
    ANDERS_SOLVED: mer.ANDERS_SOLVED,
    PELL_LETTERS_DEBRIEF: mer.PELL_LETTERS_DEBRIEF,
    PELL_SOLVED: mer.PELL_SOLVED,
    THOUSAND_BOUGH_ISLAND: tb.THOUSAND_BOUGH_ISLAND,
    THOUSAND_BOUGH_QUESTS: tb.THOUSAND_BOUGH_QUESTS,
    THOUSAND_BOUGH_TARGETS: tb.THOUSAND_BOUGH_TARGETS,
    THOUSAND_BOUGH_WELCOME: tb.THOUSAND_BOUGH_WELCOME,
    THOUSAND_BOUGH_LINES: tb.THOUSAND_BOUGH_LINES,
    FEN_SOLVED: tb.FEN_SOLVED,
  };
  dump.scripts = scripts;

  // The cast's barks (the NPCs' specs stay in the game; their barks may come from the course).
  const npcs = (await tryImport('game/npcs'))!;
  const merNpcs = (await tryImport('game/meridian-npcs'))!;
  const tbNpcs = (await tryImport('game/thousand-bough-npcs'))!;
  const anyAnchor = new Proxy({}, { get: () => ({ x: 0, z: 0 }), has: () => true });
  const barksFor = (await tryImport('course/active'))?.barksFor as
    ((id: string) => readonly string[] | undefined) | undefined;
  const cast = [
    ...npcs.COVE_NPCS,
    ...merNpcs.MERIDIAN_NPCS,
    ...merNpcs.meridianExtras(anyAnchor),
    ...tbNpcs.THOUSAND_BOUGH_NPCS,
    ...tbNpcs.thousandBoughExtras(anyAnchor, false),
    ...tbNpcs.thousandBoughExtras(anyAnchor, true),
  ];
  dump.cast = cast.map((n: Any) => {
    const { barks, ...spec } = n;
    return { ...spec, barks: barks ?? barksFor?.(n.id) ?? null };
  });

  // Arrivals, the chart, island tips.
  dump.arrivals = (await tryImport('game/arrivals'))!.ARRIVALS;
  const arch = (await tryImport('ui/chart/archipelago'))!;
  dump.archipelago = arch.ARCHIPELAGO.map((i: Any) => ({ ...i, parts: arch.chapterParts(i.chapter) }));
  const tips = (await tryImport('game/island-tips'))!;
  dump.tips = { ISLAND_TIPS: tips.ISLAND_TIPS, TIP_SPOTS: tips.TIP_SPOTS };

  // Chart labels.
  const labels = (await tryImport('learn/content/labels'))!;
  dump.labels = Object.fromEntries(
    Object.entries(labels.CHART_LABELS).map(([id, l]) => [
      id,
      { l, line: labels.chapterLine(l), spoken: labels.spokenLabel(l), same: labels.chartLabel(id) === l },
    ]),
  );

  // Course boards.
  const board = (await tryImport('learn/course-board'))!;
  const boardsData = (await tryImport('content/course-boards'))!;
  const poses = (await tryImport('world/islands/course-boards'))!;
  dump.boards = {
    skipAnchors: board.COURSE_BOARD_SKIP_ANCHORS,
    skipTitles: board.COURSE_BOARD_SKIP_TITLES,
    home: board.COURSE_HOME_URL,
    header: boardsData.COURSE_BOARDS_DATA.header,
    pins: boardsData.COURSE_BOARDS_DATA.pins,
    text: boardsData.boardText('{num} {title} x', { num: '01', title: 'T' }),
    poses: poses.COURSE_BOARDS,
    islands: ['anchorage', 'meridian', 'thousand-bough', 'keelhaven'].map((i) => [
      board.islandChapter(i),
      board.islandCourseBoard(i),
    ]),
    chapters: chapters.COURSE_CHAPTERS.map((c: Any) => board.courseBoard(c.id)),
    topicOf: ['01-tour-the-app', '02-sessions-worktrees-context'].map((c) => board.topicOf(c, 'settings')),
  };

  // The Model Market.
  const market = (await tryImport('content/market'))!;
  const jobs = (await tryImport('game/market/jobs'))!;
  const catalogMod = (await tryImport('game/market/catalog'))!;
  const models = (await tryImport('game/market/models'))!;
  // The file's own `$schema` and `$comment` aren't data.
  const marketData = Object.fromEntries(Object.entries(market.MARKET).filter(([k]) => !k.startsWith('$')));
  dump.market = {
    data: marketData,
    titles: Object.values(market.MARKET.quotes).map((q) => market.sectionTitle(q)),
    sources: Object.values(market.MARKET.quotes).map((q) => market.sourceOf(q)),
  };
  dump.jobs = Object.fromEntries(
    Object.entries(jobs).filter(([k, v]) => /^[A-Z_]+$/.test(k) && typeof v !== 'function'),
  );
  dump.catalog = {
    CATEGORIES: catalogMod.CATEGORIES,
    BOARD_SIZE: catalogMod.BOARD_SIZE,
    PER_FAMILY: catalogMod.PER_FAMILY,
  };
  dump.models = { MODELS: models.MODELS, BOARDS: models.BOARDS };

  // The course lock and voice lines (as data), and every course file by hash.
  const json = (...files: string[]) => JSON.parse(readFileSync(firstFile(...files), 'utf8'));
  dump.lock = json('courses/copilot-app/lock.json', 'content/course.lock.json');
  dump.voiceLines = json('courses/copilot-app/voice/lines.json', 'tools/voice/lines.testcove.json');
  dump.modelsFile = json('courses/copilot-app/models.json', 'content/models.json');
  dump.voiceFiles = filesUnder(firstDir('courses/copilot-app/public/voice', 'public/voice/testcove'));
  dump.snapshotFiles = filesUnder(firstDir('courses/copilot-app/public/course', 'public/course'));

  // The title and the credits as they render.
  const bridge = new Proxy({}, { get: () => () => undefined });
  const title = (await tryImport('ui/screens/TitleScreen'))!;
  const credits = (await tryImport('ui/screens/CreditsScreen'))!;
  dump.title = renderToStaticMarkup(createElement(title.TitleScreen, { state: { hasSave: false }, bridge }));
  dump.credits = renderToStaticMarkup(createElement(credits.CreditsScreen, { bridge }));

  const text = `${JSON.stringify(canon(dump), null, 1)}\n`;
  writeFileSync(out, text);
  console.log(`dump: ${out} ${text.length} bytes, sha256 ${sha(text)}`);
  expect(text.length).toBeGreaterThan(1000);
}, 120_000);
