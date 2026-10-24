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
import { expect, test, vi } from 'vitest';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ROOT = join(import.meta.dirname, '..', '..');

/**
 * World signs' lettering (COURSE-PACKS.md §9, step 2): a stand-in SignSet records every board a site
 * adds or repaints, so the dump holds what the signs say without a canvas.
 */
const SIGNS = vi.hoisted(() => [] as { set: string; lines: readonly string[]; redraw?: true }[]);
vi.mock('../../src/world/sites/sign', async (importOriginal) => {
  const real = await importOriginal<Any>();
  const { Mesh, Object3D } = await import('three/webgpu');
  class SignSet {
    constructor(private readonly name: string) {}
    get mesh() {
      return null;
    }
    get count() {
      return 0;
    }
    add(lines: readonly string[]) {
      SIGNS.push({ set: this.name, lines: [...lines] });
      return {
        object: new Object3D(),
        redraw: (l: readonly string[]) => SIGNS.push({ set: this.name, lines: [...l], redraw: true }),
      };
    }
    finalize() {
      return new Mesh();
    }
    async finalizeAsync() {
      return new Mesh();
    }
    update() {}
    dispose() {}
  }
  return { ...real, SignSet };
});

const MODULES = import.meta.glob([
  '../../src/**/*.ts',
  '../../src/**/*.tsx',
  '!../../src/**/*.test.ts',
  '../../tools/voice/*.ts',
  '../../tools/course-pack/*.ts',
  '!../../tools/**/*.test.ts',
]);

async function tryImport(path: string): Promise<Any | null> {
  // Tools' keys come relative to this folder (`../voice/lines.ts`).
  const tool = path.startsWith('tools/') ? path.slice('tools/'.length) : null;
  const load = tool
    ? Object.entries(MODULES).find(
        ([k]) => k.endsWith(`/${tool.split('/').pop()}.ts`) && k.includes(tool.split('/')[0]!),
      )?.[1]
    : (MODULES[`../../src/${path}.ts`] ?? MODULES[`../../src/${path}.tsx`]);
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
    'Q2.7': ['start', 'app', 'done'],
    'Q2.8': ['start', 'app', 'done'],
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
  // Step 4 moved the quest skeleton's conditions and old-save rules into the pack (game/story).
  const story = await tryImport('game/story');
  const boardingOpen = (q: Any): boolean =>
    cove.boardingOpen ? cove.boardingOpen(q) : story!.storyHolds('anchorage', 'gangwayDown', q);
  const migrateQuests = cove.migrateQuests ?? story!.migrateQuests;
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
      boarding: island === 'anchorage' ? boardingOpen(q) : null,
      npcs: Object.fromEntries(NPCS[island]!.map((n) => [n, keep(f.npc(n, q))])),
    }));
    dump.quests[`${island}.sha256`] = sha(JSON.stringify(canon(rows)));
    dump.quests[`${island}.first`] = rows.slice(0, 40);
  }
  dump.questExports = {
    NEW_VIEW_CAPTION:
      cove.NEW_VIEW_CAPTION ??
      (await tryImport('course/puzzles'))!.puzzleContent('palette').scripts.newViewLate[0].caption,
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

  // The quest skeleton (COURSE-PACKS.md, step 4), through APIs both layouts have: old saves brought
  // in line (with and without the mill's gate), old progress ids renamed or taught, and the sea
  // battle waiting after each island's Seal.
  dump.questMigrations = [undefined, false, true].map((workflowsOn) => {
    const rows = questStates('anchorage').map((q) => {
      const set: Record<string, string> = {};
      migrateQuests(q, (id: string, step: string) => (set[id] = step), { workflowsOn });
      return set;
    });
    return {
      workflowsOn: workflowsOn ?? null,
      sha256: sha(JSON.stringify(canon(rows))),
      first: rows.slice(0, 40),
    };
  });
  const progress = (await tryImport('learn/progress'))!;
  const oldIds = ['local-repository', 'my-work', 'pg1.my-work', 'pg1.issues', 'pg0.setup'];
  dump.progressMigrations = [undefined, 'start', 'done'].flatMap((a) =>
    [undefined, 'start', 'done'].flatMap((b) =>
      [undefined, 'start', 'done'].map((c) => {
        const quests = Object.fromEntries(
          Object.entries({ 'Q1.5': a, 'Q1.6': b, 'Q1.7': c }).filter(([, s]) => s),
        );
        const p = progress.parseProgress(JSON.stringify({ v: 1, pages: oldIds, glossary: oldIds, quests }));
        return { quests, pages: p.pages, glossary: p.glossary };
      }),
    ),
  );
  // New in step 4: each island's story conditions over its quest states, and each puzzle's quest.
  if (story) {
    dump.story = Object.fromEntries(
      Object.entries(story.STORY_CONDITIONS as Record<string, string[]>).map(([island, names]) => {
        const rows = questStates(island).map((q) =>
          Object.fromEntries(names.map((n) => [n, story.storyHolds(island, n, q)])),
        );
        return [island, { sha256: sha(JSON.stringify(canon(rows))), first: rows.slice(0, 40) }];
      }),
    );
    const puzzles = (await tryImport('course/puzzles'))!;
    dump.puzzleQuests = Object.fromEntries(
      Object.keys(puzzles.GAME_PUZZLES).map((n) => [
        n,
        {
          quest: puzzles.puzzleQuest(n),
          steps:
            puzzles.puzzleSteps && n in puzzles.PUZZLE_STEPS
              ? puzzles.puzzleSteps(n)
              : (puzzles.PUZZLE_STEPS[n] ?? null),
        },
      ]),
    );
  }
  const battles = (await tryImport('game/battles'))!;
  const berths = Object.fromEntries(
    ['anchorage', 'meridian', 'thousand-bough'].map((id) => [
      id,
      { id, name: id, mooring: { x: 0, z: 0 }, contains: () => false },
    ]),
  );
  dump.pendingBattles = Object.fromEntries(
    ['anchorage', 'meridian'].map((from) => {
      const rows = questStates(from).map(
        (q) => battles.pendingBattle(from, q, new Set(), berths)?.id ?? null,
      );
      return [from, { sha256: sha(JSON.stringify(rows)), first: rows.slice(0, 40) }];
    }),
  );

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
  const rawLines = json('courses/copilot-app/voice/lines.json');
  dump.voiceSet = rawLines.set;
  dump.modelsFile = json('courses/copilot-app/models.json', 'content/models.json');
  dump.voiceFiles = filesUnder(firstDir('courses/copilot-app/public/voice', 'public/voice/testcove'));
  dump.snapshotFiles = filesUnder(firstDir('courses/copilot-app/public/course', 'public/course'));

  // Puzzle content (COURSE-PACKS.md §4): each puzzle's data, through the game's own exports, and
  // what its pure functions say for a spread of inputs.
  const gear = (await tryImport('world/sites/gear-logic'))!;
  const gearLines = [gear.gearReadout(), gear.gearReadout('octo', 'octo.ghe.com')];
  dump.puzzleGear = {
    ids: gear.GEAR_IDS,
    defs: gear.GEAR_IDS.map((id: string) => gear.gearDef(id)),
    handle: gear.YOUR_HANDLE,
    readouts: gearLines,
    tones: [...gearLines[0], ...gearLines[1]].map((l: string) => [
      gear.gearTone(l),
      gear.gearTone(l, 'octo'),
    ]),
  };
  const practice = (await tryImport('game/puzzles/practice-session'))!;
  dump.puzzlePractice = [
    { os: null, issue: null, branch: null, model: null },
    { os: 'mac', issue: 7, branch: 'my-branch', model: null },
    { os: null, issue: 0, branch: null, model: null },
  ].map((x) => practice.practiceSessionReadout(x));

  const crane = (await tryImport('world/sites/crane-logic'))!;
  const yoursList = [
    crane.YOUR_REPOSITORY,
    'me/copilot-app-for-beginners',
    'm-reyes/my-fork',
    'harbour-guild/x',
  ];
  const craneRuns: Any[] = [];
  for (const yours of yoursList)
    for (const actionsOn of [true, false]) {
      let st = crane.initialCrane();
      const rec = (event?: Any) => {
        const term = crane.terminalLines(st, event, yours, actionsOn);
        craneRuns.push({
          yours,
          actionsOn,
          st,
          // Step 5 named the event for the game's gate (the course's Actions step).
          event: event?.kind === 'gate-shut' ? { ...event, kind: 'actions-off' } : event,
          sign: crane.signLines(st, event, yours),
          term,
          tones: term.map((l: string) => crane.lineTone(l, yours)),
          hint: crane.craneHintTarget(st),
          save: crane.saveCrane(st),
        });
      };
      rec();
      for (let i = 0; i < 4; i++) {
        let step = crane.confirmYes(st, yours, actionsOn);
        rec(step.event);
        step = crane.dryRun(st, yours);
        st = step.state;
        rec(step.event);
        step = crane.confirmYes(st, yours, actionsOn);
        st = step.state;
        rec(step.event);
        step = crane.turnCapstan(st);
        st = step.state;
        rec(step.event);
      }
    }
  dump.puzzleCrane = {
    yours: crane.YOUR_REPOSITORY,
    facings: crane.CRANE_FACINGS,
    byYours: yoursList.map((y) => crane.craneFacings(y)),
    start: crane.CRANE_START,
    yourFacing: crane.YOUR_FACING,
    cargo: crane.CRANE_CARGO,
    command: crane.SETUP_COMMAND,
    actions: [crane.actionsUrl('me/r'), crane.actionsWarning('me/r'), crane.actionsFailure('me/r')],
    restored: [
      crane.restoreCrane([2, 2], false),
      crane.restoreCrane(undefined, true),
      crane.restoreCrane([9, 1], false),
    ],
    runs: sha(JSON.stringify(canon(craneRuns))),
    firstRuns: craneRuns.slice(0, 30),
  };
  const craneSite = await tryImport('world/sites/crane');
  dump.puzzleCraneSite = craneSite?.BRIGANTINE_CARGO ?? null;

  dump.puzzleYard = (await tryImport('world/sites/crate-yard-logic'))!.MERIDIAN_YARD;
  dump.puzzleSluice = (await tryImport('world/sites/sluice-logic'))!.ANCHORAGE_SLUICE;
  const helms = (await tryImport('world/sites/helms-logic'))!;
  dump.puzzleHelms = {
    order: helms.HELM_ORDER,
    modes: helms.MODE_INFO,
    orders: helms.HELM_ORDERS,
    runs: helms.MERIDIAN_HELMS,
    review: (await tryImport('game/puzzles/three-helms'))!.REVIEW_OPTIONS,
  };
  const letters = (await tryImport('game/puzzles/hall-letters'))!;
  dump.puzzleLetters = {
    cite: letters.CITE,
    alcoves: letters.ALCOVES,
    tray: letters.TRAY,
    destinations: letters.DESTINATIONS,
    letters: letters.LETTERS,
    names: letters.DESTINATIONS.map((d: string) => letters.destinationName(d)),
    whyNot: letters.LETTERS.map((l: Any) => letters.DESTINATIONS.map((d: string) => letters.whyNot(l, d))),
  };
  const flags = (await tryImport('game/puzzles/flag-hoist'))!;
  dump.puzzleFlags = {
    flags: flags.FLAGS,
    orders: flags.HOIST_ORDERS,
    right: flags.HOIST_ORDERS.map((o: Any) => flags.rightPick(o)),
    picks: flags.HOIST_ORDERS.map((o: Any) =>
      flags.orderPicks(o).map((p: string) => [p, flags.pickFlag(o, p)]),
    ),
  };
  const boardsCr = (await tryImport('game/puzzles/channel-routing/boards'))!;
  const ws = (await tryImport('game/puzzles/channel-routing/workspaces'))!;
  const crModel = (await tryImport('game/puzzles/channel-routing/model'))!;
  const crPuzzle = (await tryImport('game/puzzles/channel-routing/puzzle'))!;
  const crews: string[] = [...boardsCr.CREWS];
  const wsIds: string[] = ws.WORKSPACES.map((w: Any) => w.id);
  const verdicts: Any[] = [];
  for (const a of wsIds)
    for (const b of wsIds)
      for (const c of wsIds) {
        const picks: Any = { [crews[0]!]: a, [crews[1]!]: b, [crews[2]!]: c };
        const v = Object.fromEntries(
          crews.map((cr) => [cr, { pick: picks[cr], right: ws.fits(cr, picks[cr]) }]),
        );
        verdicts.push(crPuzzle.workspaceVerdicts({ flows: [], solved: false, verdicts: v, problem: null }));
      }
  const described: string[] = [];
  for (const round of [1, 2, 3])
    described.push(crPuzzle.describeRun({ flows: [], solved: true, problem: null }, round));
  for (const crew of crews)
    for (const end of ['mixed', 'mainHall', 'wrongWheel', 'deadEnd'])
      for (const at of [null, [1, 2]])
        for (const wheel of [null, crews.find((c) => c !== crew)])
          described.push(
            crPuzzle.describeRun(
              { flows: wheel ? [{ crew, wheel, end }] : [], solved: false, problem: { crew, end, at } },
              2,
            ),
          );
  dump.puzzleChannels = {
    crews,
    look: boardsCr.CREW_LOOK,
    workspaces: ws.WORKSPACES,
    orders: ws.CREW_ORDERS,
    best: ws.BEST_LINE,
    names: wsIds.map((w) => ws.workspaceName(w)),
    fits: crews.map((cr) => wsIds.map((w) => ws.fits(cr, w))),
    end: crModel.END_LINE,
    twist: crModel.TWIST_CHOICES,
    verdicts,
    described,
  };
  const everyHire: Any[] = [{ auto: true }];
  for (const category of catalogMod.CATEGORIES)
    for (const effort of jobs.EFFORTS)
      everyHire.push({ auto: false, category, model: `${category} model`, effort });
  dump.puzzleMarket = {
    feedback: jobs.JOBS.map((j: Any) => everyHire.map((h) => jobs.feedback(j, h))),
    names: everyHire.map((h) => jobs.hireName(h)),
    retry: everyHire.flatMap((h) =>
      (['model', 'effort'] as const).map((k) =>
        jobs.retryPlan ? jobs.retryPlan(h, k) : jobs.retryHire(h, k, (c: string) => `first ${c}`),
      ),
    ),
  };

  // World signs with course words: the sites as the game builds them, through the stand-in SignSet.
  {
    const three = await import('three/webgpu');
    const kit = { materials: new Proxy({}, { get: () => new three.MeshStandardMaterial() }) } as Any;
    const tier = (await tryImport('engine/quality'))!.tierSettings('high');
    const origin = { x: 0, y: 0, z: 0, heading: 0 };
    const sitesMod = (p: string) => tryImport(`world/sites/${p}`);
    // Sites paint a few canvases (the sloops' flags): a stand-in 2D context that draws nothing.
    const noop: Any = new Proxy(() => noop, {
      get: (_t, k) => (k === 'measureText' ? () => ({ width: 1 }) : noop),
    });
    const element = () => ({
      width: 1,
      height: 1,
      style: {},
      getContext: () => noop,
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
    });
    const hadDocument = 'document' in globalThis;
    if (!hadDocument) (globalThis as Any).document = { createElement: element, createElementNS: element };
    SIGNS.length = 0;
    const craneSite = (await sitesMod('crane'))!.createCrane({ tier, kit });
    craneSite.setBoard(2);
    craneSite.setSign(['Repository: me/r', 'Will create 4 labels'], 'me/r');
    (await sitesMod('mill'))!.createMill({
      tier,
      kit,
      heightField: { heightAt: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }) },
      kinds: dump.puzzleSluice.tiles.map((t: Any) => t.kind),
    });
    const lettersContent = letters.lettersContent as (() => Any) | undefined;
    (await sitesMod('records-alcoves'))!.createRecordsAlcoves({
      kit,
      origin,
      alcoves: letters.ALCOVES,
      letters: letters.LETTERS.map((l: Any) => l.answer),
      crest: lettersContent?.().text.crest,
    });
    const market = (await sitesMod('model-market'))!.createModelMarketSigns({
      origin,
      layout: (await tryImport('world/meridian-town/model-market'))?.MARKET_LAYOUT,
      keeper: 'Gilda',
      boards: models.BOARDS.map((b: Any) => ({
        category: b.category,
        price: jobs.CATEGORY_PRICE[b.category],
        names: b.shown.map((m: Any) => m.name),
        more: b.more.length,
      })),
      jobs: jobs.JOBS.map((j: Any) => ({ id: j.id, note: j.note, size: j.size })),
      done: [],
    });
    market.setDone([jobs.JOBS[0].id]);
    dump.signs = SIGNS.map((x) => ({ ...x }));
    if (!hadDocument) delete (globalThis as Any).document;
  }

  // Hooks (COURSE-PACKS.md §5): the lines and questions the game asks for by id.
  const briefing = (await tryImport('opening/briefing'))!;
  dump.hooks = {
    briefing: briefing.BRIEFING,
    chest: briefing.CHEST_LINE,
    briefingLines: briefing.BRIEFING_LINES,
    battles: (await tryImport('world/battle/battle'))!.BATTLE_PLANS,
  };

  // The voice cast (COURSE-PACKS.md §5): every line as the generator reads it, with its cache hash.
  const voiceLines = await tryImport('tools/voice/lines');
  const resolved: Any[] = voiceLines?.resolvedLines
    ? voiceLines.resolvedLines('copilot-app')
    : rawLines.lines;
  dump.castResolved = resolved;
  // The generator's cache key (tools/voice/generate.ts), with the voice the manifest says it used:
  // the same key means the same audio, so the cast changes no file.
  const manifest = JSON.parse(
    readFileSync(firstFile('courses/copilot-app/public/voice/manifest.json'), 'utf8'),
  ) as { lines: { id: string; voice: string; hash: string }[] };
  const used = new Map(manifest.lines.map((l) => [l.id, l]));
  const hashLine = (l: Any, voice: string) =>
    sha(
      JSON.stringify({
        text: l.text,
        voice,
        prosody: l.prosody ?? {},
        fx: l.fx ?? '',
        ...(l.sub ? { sub: l.sub } : {}),
        ...(l.tts === 'elevenlabs' ? { tts: l.tts, model: l.model ?? 'eleven_v3' } : {}),
      }),
    ).slice(0, 16);
  dump.castHashes = resolved.map((l: Any) => {
    const m = used.get(l.id);
    return [l.id, m ? hashLine(l, m.voice) : null, m ? m.hash : null];
  });

  // The title and the credits as they render.
  const bridge = new Proxy({}, { get: () => () => undefined });
  const title = (await tryImport('ui/screens/TitleScreen'))!;
  const credits = (await tryImport('ui/screens/CreditsScreen'))!;
  dump.title = renderToStaticMarkup(createElement(title.TitleScreen, { state: { hasSave: false }, bridge }));
  dump.credits = renderToStaticMarkup(createElement(credits.CreditsScreen, { bridge }));

  // The "Your setup" forms as they render, for each kind, asked first and changed from the Logbook.
  const setupForm = (await tryImport('ui/learn/SetupForm'))!;
  const setupMod = (await tryImport('learn/setup'))!;
  const store = new Proxy({}, { get: () => () => undefined });
  const blank = { os: null, issue: null, branch: null, model: null };
  const given = { os: 'mac', issue: 7, branch: 'my-branch', model: { pick: 'other', name: 'Some Model' } };
  dump.setupForms = ['os', 'issue', 'branch', 'model'].flatMap((kind) =>
    (['script', 'logbook'] as const).flatMap((from) =>
      [blank, given].map((setup) =>
        renderToStaticMarkup(
          createElement(setupForm.SetupForm, { kind, store, from, setup, detected: 'windows' }),
        ).replace(/«[^»]*»|:r[0-9a-z]+:|_R_[0-9a-zA-Z_]+_/g, '#'),
      ),
    ),
  );
  dump.modelLabels = [
    null,
    { pick: 'auto' },
    { pick: 'current' },
    { pick: 'other' },
    { pick: 'other', name: 'X' },
  ].map((m) => setupMod.modelLabel(m));

  // Where the Copilot app course's voyage is saved (COURSE-PACKS.md §6, step 3): the one diff step 3
  // allows. Before course packs, the keys had no course in them.
  const saveKeys = await tryImport('game/save-keys');
  dump.saveKeys = saveKeys
    ? {
        save: saveKeys.courseKey('copilot-app', 'save'),
        progress: saveKeys.courseKey('copilot-app', 'progress'),
      }
    : { save: 'copilot-isles.save.v1', progress: 'copilot-isles.progress.v1' };

  // Step 5 (COURSE-PACKS.md, "Step 5 as built"): the game acts on its own mechanic ids, and a pack
  // binds its ids to them (`acts`). Written back in the pack's ids, the derived data is the same as
  // before; the bindings themselves (`acts`, the letters' `apart`) are the only new fields.
  if (helms.HELM_MODES) {
    const back = (v: unknown, ids: Readonly<Record<string, string>>): unknown => {
      if (typeof v === 'string') return ids[v] ?? v;
      if (Array.isArray(v)) return v.map((x) => back(x, ids));
      if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [ids[k] ?? k, back(x, ids)]));
      return v;
    };
    const drop = (v: unknown, key: string): unknown =>
      Array.isArray(v)
        ? v.map((x) => drop(x, key))
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (k === key ? [] : [[k, drop(x, key)]])))
          : v;
    const autoName = helms.MODE_INFO.auto.name as string;
    const helmIds = {
      steer: 'interactive',
      review: 'plan',
      auto: 'autopilot',
      accept: 'approve',
      takeOver: 'exit',
      amend: 'suggest',
    };
    dump.puzzleHelms = Object.fromEntries(
      Object.entries(dump.puzzleHelms as Any).map(([k, v]) => [
        k,
        back(JSON.parse(JSON.stringify(v).replaceAll('{auto}', autoName)), helmIds),
      ]),
    );
    dump.puzzleChannels = drop(
      back(dump.puzzleChannels, {
        blue: 'feature',
        green: 'bugfix',
        teal: 'docs',
        channel: 'worktree',
        hall: 'checkout',
        gondola: 'cloud',
      }),
      'acts',
    );
    dump.puzzleYard = back(dump.puzzleYard, {
      tavernPlates: 'chatPlates',
      slipwayPlates: 'projectPlates',
      tavern: 'chat',
      slipway: 'project',
    });
    dump.puzzleLetters = drop(dump.puzzleLetters, 'apart');
    dump.market.data = drop(back(dump.market.data, { autoAside: 'autopilot' }), 'acts');
    dump.jobs.QUOTES = back(dump.jobs.QUOTES, { autoAside: 'autopilot' });
    delete dump.jobs.TIER_OF;
    delete dump.jobs.CATEGORY_OF;
    delete dump.questExports.COVE_ISLAND.nextSail;
  }

  const text = `${JSON.stringify(canon(dump), null, 1)}\n`;
  writeFileSync(out, text);
  console.log(`dump: ${out} ${text.length} bytes, sha256 ${sha(text)}`);
  expect(text.length).toBeGreaterThan(1000);
}, 120_000);
