# Course packs: one game, many courses

**Status:** steps 1, 2 and 3 built. Step 1: the Copilot app course is `courses/copilot-app/`. Step 2:
puzzles, beats, hooks, cast and signs are pack data. Step 3: a second pack (`courses/copilot-cli/`), the
course picker and per-course saves. Each step's dump of derived data is byte-identical before and after,
except the diffs §9 documents. Decisions D1-D5 (§10) are approved as recommended.

Dan's ask: put everything course-related in data, so the same game can teach other courses, and players
can (eventually) pick a topic. The game stays neutral; a **course pack** supplies every course word, the
course's audio, and its snapshot.

| Step | What | Result |
| --- | --- | --- |
| **1 (this spec)** | Extract today's course into `courses/copilot-app/` | Same game, same behaviour; course data lives in one pack folder |
| 2 | Puzzles become **mechanics** that read content from the pack (§4); hooks for game-asked lines; Copilot words swept out of game code | Any pack can fill the puzzles |
| 3 | A tiny second course and a course picker; saves keyed by course (§6, §8) | Players choose a course |

## 1. The goal and the boundary

| The neutral game owns | A course pack owns |
| --- | --- |
| Engine, renderer, post, budgets, quality tiers | Course metadata: id, title, tagline, description, language, version |
| Islands: geometry, terrain, vegetation, towns, art, music, sky | Chapter ↔ island mapping, chapter labels, seals, topics, minutes, arrival-card lines |
| Characters: models, rigs, outfits, props, paths, names (see decision D3) | NPC dialogue: voiced lines, captions, unvoiced lines, barks |
| Puzzle **mechanics**: rules, state machines, physics, sites, UI | Puzzle **content**: items, bins, answers, feedback, citations, labels |
| Quest *runtime*: tracker, log, script runner, gating rules | Quests: order, titles, tasks, step text, links, scripts, rewards |
| Quiz, Logbook, glossary, Trial and hotspot *UI* | Quizzes, Logbook pages, chests' pages, glossary, Trials, hotspot rects and masks |
| UI chrome, controls, settings, accessibility, saves' format | Chart labels (lower thirds), notice-board text, Model Market data, model list |
| Where things stand (board poses, chest offsets, buoys) | Course snapshot, lock, live-course source, license and attribution |
| Voice *player*, lip sync runtime, caption UI | Voice lines (text, speaker, voice), their audio, timings, manifest, voice cast |
| The player's setup tokens (`{issue}`, `{branch}`…) as a mechanism | The tokens' defaults (practice issue #3, branch, fork repo name, links) |

Rule of thumb: if a second course would want a different word, number, image or sound, it's the pack's.
If it would want the same thing, it's the game's.

## 2. The pack layout

```text
courses/
  schemas/                       one JSON Schema per file kind (was content/schemas/)
  copilot-app/
    course.json                  metadata, source, islands ↔ chapters, practice defaults, links
    chapters/00-setup.json       images, quizzes, pages, chests, glossary, trials, voiced, cited
    chapters/01-tour-the-app.json
    chapters/02-sessions-worktrees-context.json
    quests/anchorage.json        quest defs, named scripts, barks, step targets
    quests/meridian.json
    quests/thousand-bough.json
    puzzles/<name>.json          one puzzle's content, by mechanic (step 2: 15 files)
    labels.json                  chart labels                        (was content/labels.json)
    boards.json                  notice-board text, skip lists       (was content/course-boards.json, minus poses)
    market.json                  the Model Market                    (was content/market.json)
    models.json                  Copilot models from GitHub Docs     (was content/models.json)
    lock.json                    snapshot commit, section and image hashes (was content/course.lock.json)
    voice/lines.json             every voice line: id, speaker, text (was tools/voice/lines.testcove.json)
    voice/cast.json              speaker → service, voice, model, prosody, fx (step 2)
    public/                      served as <base>courses/copilot-app/
      course/                    the snapshot: READMEs, GLOSSARY, LICENSE, images (was public/course/)
      voice/                     <id>.webm/.m4a/.json, manifest.json, lipsync.json (was public/voice/testcove/)
    README.md                    what the pack is, its license, how to regenerate its data
```

`course.json` (abridged):

```json
{
  "$schema": "../schemas/course.schema.json",
  "id": "copilot-app",
  "version": 1,
  "title": "GitHub Copilot app for Beginners",
  "tagline": "Learn the GitHub Copilot app, one island at a time",
  "language": "en",
  "source": {
    "kind": "github",
    "repo": "github/copilot-app-for-beginners",
    "ref": "main",
    "license": "MIT",
    "attribution": "GitHub Copilot app for Beginners, © GitHub, MIT",
    "chapters": [{ "id": "00-setup", "short": "ch00", "title": "Setup" }, "… 8 chapters in all"]
  },
  "islands": [
    {
      "island": "anchorage",
      "chapter": "00-setup",
      "seal": "Seal of Anchorage",
      "minutes": 20,
      "topics": ["Install the app and sign in", "…"],
      "arrival": { "eyebrow": "Chapter 00 · Setup", "line": "Set up the GitHub Copilot app and earn your first Seal" }
    }
  ],
  "practice": { "issue": 3, "issueTitle": "Improve the empty state copy", "branch": "practice-empty-state-copy", "repoName": "copilot-app-for-beginners" },
  "links": { "install": "https://github.com/features/ai/github-app", "fork": "https://github.com/github/copilot-app-for-beginners/fork" }
}
```

File names are by convention (no file list to keep in sync); the content check fails on an unknown file.
A pack with `"source": null` is authored-only: no live excerpts, no drift report.

### Why split, and why this split

One big file would be ~300 KB of JSON, every PR would touch it, and conflicts would be common. The split
follows who edits what: chapters change with the course (weekly refresh), quests and scripts with the
islands, puzzles with step 2, generated files (`lock.json`, `models.json`, voice manifest) only by tools.

### Build-time, not runtime (decision D1)

**Recommendation: pack JSON is compiled into the build as one lazy chunk per course; audio and the
snapshot are static files fetched by URL.**

- `src/course/catalog.ts` imports every pack's `course.json` (one line per course, so Node tools can
  read it too; ≈ 2 KB gz each). That's all the title screen loads: title, tagline, language, islands.
- `src/course/load.ts`: `loadCourse(id)` pulls the rest with a lazy `import.meta.glob`;
  `manualChunks` puts `courses/<id>/**/*.json` in one chunk, `course-<id>` (built: 49 KB gz for
  `copilot-app`). Budget: ≤ 80 KB gz per pack in `tools/budgets.json`, and `check:budgets` fails if the
  entry imports a pack chunk statically.
- The flow loads and activates the pack at New Voyage / Continue, in parallel with `islandCode`
  (`flow.ts`), behind the cabin. The title never fetches it (no idle prefetch).
- Game modules read pack data through `src/course/active.ts` (`coursePack()`, `courseScript()`,
  `barksFor()`) or rebuild what they derive in an `onCourse` hook (live `export let` bindings), never at
  module top level. Node tools read a pack with `tools/course-pack/read.ts`; Vitest activates the default
  pack before every test file (`src/course/test-setup.ts`).
- Vite hashes the chunk, so the service worker's cache-first `/assets/` rule covers it, and Pages'
  sub-path works through `BASE_URL` as today.
- Types: `src/learn/types.ts` stays the contract; loaders cast validated JSON to it. `ChapterId` stops
  being a compile-time union (it's a string checked by the content check and tests).
- The pack's `public/` folder is served by a small Vite plugin (`coursePackAssets`): dev middleware maps
  `/courses/<id>/*` to `courses/<id>/public/*`, and the build copies it to `dist/courses/<id>/`. URLs
  keep their in-pack paths (`course/ch02/x.webp`, `voice/<id>.webm`) behind a per-pack base.

Why not runtime fetch of JSON: every pack still ships through a PR and a deploy, so runtime fetching buys
nothing today, and it costs a fetch path, failure handling, versioned cache keys and untrusted-input
review. Third-party packs loaded from a URL can come later on top of the same loader and schemas.

## 3. Schemas and checks

One schema per file kind in `courses/schemas/`: `course`, `chapter`, `quests`, `puzzle-<mechanic>` (step
2), `labels`, `boards`, `market`, `models`, `lock`, `voice-lines`, `voice-manifest`. Hand-edited files
name theirs in `"$schema"`; `.vscode/settings.json` maps the generated ones.

`npm run content:check` (and `src/content/content.test.ts`) grows to run per pack (`--course <id>`, default
all):

- every file is valid against its schema, and no unknown file is in the pack;
- every quote and `cited` text: quotes word for word in the section of **this pack's** snapshot;
  every `{chapter, anchor, hash}` in **this pack's** `lock.json`; every pinned image's hash matches its file;
- every voice id used anywhere (`say`, `line`, `voiced` keys, Gilda's lines, barks, tips) is in
  `voice/lines.json`, has `webm`, `m4a` and timings in `public/voice/`, and its manifest text matches;
- every image id (`show`, page `image`, hotspot `image`) is in a chapter's `images`, and its file exists;
- every script step resolves: `quiz`, `page`, `file`, `term`, `trial`, `{quest, step}` (step in that
  quest's `steps`), `cue` (a cue the island's session knows), `askSetup` kinds;
- every island and NPC id is the game's (the game exports its island and cast ids for the check);
- every chapter in `islands[]` is in `source.chapters` and the lock;
- today's rules stay: market economy, board topics, models listed once, labels' sources.

`src/learn/course/refs.test.ts` and `tools/course/drift.ts` read packs instead of TS modules.

## 4. Puzzle mechanics vs. content

Step 1 left puzzle content where it was; this table was the plan for step 2. What step 2 built is in
§9, "Step 2 as built".

| Puzzle (id) | Island · NPC | Generic mechanic | Content fields | Content today | Step 2 |
| --- | --- | --- | --- | --- | --- |
| Palette stand (`Q0.2.palette`) | Anchorage · Nell | Pick one of N (cosmetic) + scripted follow-up | `colors[]`, `scripts.finished`, `scripts.late` | `paint-sails.ts` `PALETTE_FINISHED`, `NEW_VIEW_LATE` | Data-only |
| Gear rack (`Q0.4`, cue `gear-checks`) | Anchorage · Bo | Checklist / terminal readout | `checks[{id, label, command, output}]` | `world/sites/gear-logic.ts` `GEAR` | Data-only |
| Sluice (`P0.1`, `Q0.6`) | Anchorage · Suri | Routing (rotate tiles to outlets) | `outlets[{id, label, meaning}]`, `layout`, feedback | `sluice-logic.ts` `ANCHORAGE_SLUICE` | Data-only (layout is game geometry; meanings are content) |
| Dry-Run Crane (`P0.2`, `Q0.7`) | Anchorage · Pim & Pol | Procedure with a dry run and guards | `targets[{id, owner, label}]`, `cargo[]`, `command`, guard messages | `crane-logic.ts` `CRANE_FACINGS`, `CRANE_CARGO`, `SETUP_COMMAND` | **Refactor first**: guards encode the course's setup script rules (fork ownership, Actions on) |
| First words (`Q0.8.pipes`, quiz `S0.2`) | Anchorage · Juno | Choose the right tool, then send | `choices[{id, label, correct, feedback}]`, `prompt`, `reply[]` | `first-words.ts` `SHORT_PROMPT`, `HATCH_LINES`, `REPLY_LINES`, `JUNO_REPLY` | Data-only |
| Bard (`Q0.9.bard`) | Anchorage · Lyra | Proximity / timing, no course content | none | `bard.ts` (tuning only) | Already neutral |
| Christening (`Q0.11.christen`) | Anchorage · Nell | Scripted ceremony (cue) | script names, line ids | `christening.ts` + quests | Data-only |
| Crate Yard (`P1.1`, `Q1.4`) | Meridian · Anders | Classification into bins (Sokoban moves) | `bins[{id, label}]`, `items[{id, label, bin, why, source}]`, `layout` | `crate-yard-logic.ts` `MERIDIAN_YARD`, copied into `CH01.cited` | **Refactor first**: labels, bins and grid layout are one object |
| Three Helms (`P1.2`, `Q1.5`) | Meridian · Rhea | Choose the right tool, then a run per choice | `modes[{id, name, says}]`, `orders[{id, text, answer, why, source}]`, `review[]` | `helms-logic.ts` `MODE_INFO`, `HELM_ORDERS`; `three-helms.ts` `REVIEW_OPTIONS` | **Too Copilot-tied for now**: each run *acts out* its mode (Interactive, Plan, Autopilot); keep as a Copilot-only mechanic |
| Settings letters (`P1.3`, `Q1.7`) | Meridian · Pell | Classification into bins | `bins[{id, name}]`, `items[{id, text, answer, wrong{bin: text}, source}]` | `hall-letters.ts` `CITE`, `ALCOVES`, `LETTERS`, `whyNot`; `lost-letters.ts` | Data-only (already data + a state machine) |
| Model Market (`market`, `Q1.A`) | Meridian · Gilda | Cost/power trade-off within a budget | `categories`, `efforts`, `jobs`, `quotes`, prices | `market.json`, `models.json` (moved in step 1); grading in `jobs.ts`, `catalog.ts` | **Copilot-only** (models and effort); generic "hire within budget" later |
| Channel Routing (`P2.1`) | Thousand-Bough · Fen | Isolation/routing (each crew to its own wheel) | `crews[{id, label}]`, boards, feedback | `channel-routing/boards.ts` `CREWS` | Data-only |
| Workspaces twist (`P2.2`) | Thousand-Bough · Fen | Matching + one multiple-choice | `workspaces[]`, `crews[{order, answer, why, source}]`, `twist{question, choices}` | `channel-routing/workspaces.ts`, `model.ts` `TWIST_CHOICES`, `END_LINE`, `BEST_LINE` | **Refactor first**: logic knows current checkout / worktree / cloud behaviour |
| Flag Hoist (`P2.3`, quiz `K2.3`) | Thousand-Bough · Ines | Classification / pick a symbol | `flags[{symbol, label, meaning}]`, `orders[{text, answer, wrong, source}]` | `flag-hoist.ts` `FLAGS`, `HOIST_ORDERS`, mirrored in `CH02.cited` | Data-only |
| Practice session terminal | Thousand-Bough · Rook | Static readout | `lines[]` with setup tokens | `practice-session.ts` | Data-only (uses `practice` defaults) |

Mechanics that emerge: **classify** (crates, letters, flags), **choose the tool** (first words, helms),
**route** (sluice, channels), **match** (workspaces), **procedure with dry run** (crane), **checklist**
(gear, practice terminal), **budget trade-off** (market), **ceremony** (christening, palette). A puzzle's
JSON names its mechanic, so a second course can reuse the site with other content.

## 5. Voice per course

- **Namespace = the pack.** Line ids stay as they are (`nell.papers.01`); the folder is the namespace.
  At runtime the voice player's cache key is `<course>:<id>`, and its base URL is the active pack's
  `voice/` (`audio/index.ts` today hardcodes `voice/testcove/`).
- **Tools per pack:** `tools/voice/generate.ts --course <id>` reads `courses/<id>/voice/lines.json` and
  writes `courses/<id>/public/voice/`; `tools/voice/lipsync.ts --course <id>` the same. `--only` still works.
- **Cast:** step 1 kept `tts` and `voice` on each line (moved verbatim). Step 2 added `voice/cast.json`
  (speaker → engine, voice id, fx); a line's own fields override. Another course (or language) can recast.
- **Captions come from the pack** (`lines.json` text via the manifest), as today.
- **Text-only packs** (step 3): `"voice": false` in `course.json`; the dialogue shows captions and advances
  on a press or a reading-time timer. Cheap first versions of new courses need this.
- Every line is the pack's, Wingman's banter included (most of it mentions the course). The lines the
  *game* asks for by id (island tips, welcomes, the cabin briefing, starfish counts, hints) become named
  hooks in step 2 (`course.json` → `hooks`).
- The pack-level voice manifest replaces `voice/testcove/manifest.json` in `tools/packs/build-manifest.mjs`.

## 6. Saves (step 3: done, see "Step 3 as built")

- Settings, benchmark and battle-briefing stay global.
- Per course: `copilot-isles.save.v1` → `copilot-isles.<course>.save.v1`, and the same for
  `progress.v1`. `copilot-isles.course` remembers the last course for Continue.
- **Migration:** at boot, if the old keys exist and `copilot-app`'s don't, copy them to `copilot-app`
  and keep the old keys one release (a rollback still finds them), then delete. Export codes gain
  `c: <course>`; a code without it is `copilot-app`.
- Ids in saves (quests, pages, chests, quizzes, puzzles, labels, market jobs) never get renamed by a
  move: step 1 keeps every id.

Step 1 changes no save key.

## 7. Workflows

- **`weekly-refresh.yml`:** a job per pack whose `source.kind` is `github` (a matrix from
  `courses/*/course.json`). Each runs `course:sync`, `course:drift`, `content:check` and the voice step
  with `--course <id>`, stages only `courses/<id>/`, and opens "Weekly refresh: <title> @ <sha>". The
  service worker's live-course allow-list comes from the packs' `source.repo` (step 3).
- **`models-refresh.yml`:** runs only for packs that have `models.json` (today `copilot-app`):
  `models:sync -- --course copilot-app`.
- Step 1: same two workflows, one pack, new paths and `--course copilot-app`.

## 8. Course selection (step 3: done, see "Step 3 as built")

- The title's **New Voyage** opens a course list when there's more than one (from the eager catalog:
  title, tagline, language, chapters, minutes, license). **Continue** resumes the last course.
- Chart, Logbook, credits and boards read the active pack. Islands with no chapter in the pack stay as
  silhouettes (not visitable) or show as uncharted.
- **A minimal second course needs:** `course.json` (with `source` or `null`); one chapter file with at
  least a page, a quiz, a glossary term and a Trial (for the seal); `quests/anchorage.json` with a script
  for each quest-giving NPC and barks; `labels.json`; voice lines or `"voice": false`; content for each
  Anchorage puzzle it keeps, or `"disabled": true` (the site stays scenery); `hooks` for the opening and
  welcome lines.

## 9. Migration plan for step 1

### Moves

| From | To | How |
| --- | --- | --- |
| `src/learn/content/ch00.ts`, `ch01.ts`, `ch02.ts` | `chapters/<chapter>.json` | A one-shot exporter (run once, then deleted) imported the TS and wrote JSON: `courseRefs` become literal `{chapter, anchor, hash, image?}`; `cited` entries derived from `JOBS`, `QUOTES`, `MERIDIAN_YARD` become literal (checked equal to their TS source). The TS modules are deleted; `content/index.ts` builds the same indices from the active pack |
| `src/learn/course/chapters.ts` (`COURSE_CHAPTERS`, `COURSE_REPO`, URLs) | `course.json` `source` | `sync.mjs` reads it instead of its own copy |
| `content/course.lock.json`, `labels.json`, `market.json`, `models.json` | `lock.json`, `labels.json`, `market.json`, `models.json` | `git mv`; loaders read the active pack |
| `content/course-boards.json` | `boards.json` (header, pins, skip, island → chapter) | Poses (`x, y, z, rot`) go to `src/world/islands/course-boards.ts` (game) |
| `content/schemas/*` | `courses/schemas/*` | plus the new `course`, `chapter`, `quests`, `voice-lines` schemas |
| Data in `cove-quests.ts`, `meridian-quests.ts`, `thousand-bough-quests.ts` | `quests/<island>.json` | Quest defs, every script array (named, including those written inline in the `npcScript` switches), targets' labels, `NEW_VIEW_CAPTION`, `ASSIGNMENT_URL`, `THOUSAND_BOUGH_LINES` |
| Barks in `npcs.ts`, `meridian-npcs.ts`, `thousand-bough-npcs.ts` | `quests/<island>.json` `barks[npc]` | Poses and looks stay |
| `arrivals.ts` card text; `archipelago.ts` chapter, minutes, seal, topics | `course.json` `islands[]` | Flights, names, blurbs, map positions stay |
| `setup.ts` `COURSE_ISSUE*`, `COURSE_BRANCH`; `fork.ts` `COURSE_REPO`; install/fork URLs | `course.json` `practice`, `links` | |
| `TitleScreen` subtitle, `CreditsScreen` course attribution | `course.json` `tagline`, `source.attribution` | |
| `tools/voice/lines.testcove.json` | `voice/lines.json` | `git mv`, unchanged |
| `public/voice/testcove/**` (24 MB) | `courses/copilot-app/public/voice/**` | `git mv` |
| `public/course/**` (2.4 MB) | `courses/copilot-app/public/course/**` | `git mv`; in-pack paths (`course/ch02/x.webp`) unchanged |

### Stayed in TS until step 2 (done: see "Step 2 as built")

- Puzzle content (every "Content today" cell in §4).
- NPC script *selection* (`npcScript`, `meridianNpcScript`, `thousandBoughNpcScript`: switches on quest
  state; they pick scripts from the pack by name), quest trackers, `migrateQuests`, `boardingOpen`, island
  gating (`meridianOpen`, `thousandBoughOpen`). Step 2 replaces the switches with a declarative `beats`
  table (`[{ npc, when: { done: 'Q1.3', q: 'Q1.4', eq: 'crates' }, script }]`, first match wins).
- Game-asked line ids: `island-tips.ts`, `MERIDIAN_WELCOME`, `THOUSAND_BOUGH_WELCOME`,
  `opening/briefing.ts`, and battle wave quizzes in `world/battle/battle.ts` (step 2 hooks).
- World signs and props with course words (market signboards, the Settings alcoves, the crane's sign,
  the channel wheels' names).
- `index.html` meta text, `boot/fallback.ts` link (they run before any pack); the game's name and the
  chart's "The Copilot Isles" (decision D4).

### Step 1 as built

- Barks moved by NPC id (`quests/<island>.json` → `barks`); the session reads them with `barksFor`.
- Board poses moved to `src/world/islands/course-boards.ts` (game); a board's chapter is its island's in
  `course.json`, so `boards.json` has no `islands`.
- Scripts written inline in the NPC switches got names (`nell.papers`, `ezra.fork`, `bo.deck`,
  `suri.brief`); a `{ "script": "<name>" }` step splices one script into another (the assembly expands
  it). The christening's last sail line is the course's (`wingman.sail.03`); while Port Meridian is open
  the game swaps in `wingman.sail.meridian` (gating, in `cove-quests.ts`).
- Kept as they were: the voice lines' `"set": "testcove"` (the manifest's field), the snapshot's paths
  (`course/ch02/x.webp`), every id saved in progress, and the save keys.
- The content check knows README.md in a pack; every other file must be a pack file with a schema.

### Step 2 as built

**Puzzles.** One file per puzzle the game plays (`GAME_PUZZLES`, `src/course/puzzles.ts`), each naming
its `mechanic` and validated by `courses/schemas/puzzle-<mechanic>.schema.json`. Every file may have
`text` (its words by key; the game fills `{name}` with `textOf`), `lines` (voice line ids by purpose,
`lineOf`) and `"disabled": true`. Modules keep their exported names (`HELM_ORDERS`, `LETTERS`, `FLAGS`,
`CREW_LOOK`, `WORKSPACES`, `CRANE_CARGO`, `MERIDIAN_YARD`…) as live bindings set in `onCourse`.

| File | Mechanic | What moved | What stayed in code |
| --- | --- | --- | --- |
| `gear-rack.json` | checklist | the checks (tool, command, output), the terminal's sign-in and title, the prompt | the rack, its order of play |
| `practice-session.json` | checklist | the terminal's title and readout (setup tokens) | — |
| `palette.json` | ceremony | the finished and late scripts, prompts, hints | the colours (game art) |
| `bard.json`, `christening.json` | ceremony | Wingman's hints (and the bard's announcement) | timing, the ship name board |
| `sluice.json` | route | the mill's signs, prompts and messages, the `workflowsOn` line | the tile grid and rules |
| `crane.json` | procedure | berth owners and repositories, spare names, cargo, the command, Actions URL, readout tones, signs, lever plates, Pim and Pol's refusals | berth geometry (`BERTHS`), the guards' rules (fork ownership, Actions on), the slew |
| `first-words.json` | choose-tool | the quiz, both tools, the prompt, the hatch and reply panels and script | the pipe and hatch |
| `crate-yard.json` | classify | the bins' signs and the items in slot order (label, kind, why, source) | the grid (`SLOTS`), moves, the atlas painter |
| `three-helms.json` | choose-tool (Copilot-only) | modes, orders, review options, hints, every readout and line | the courses, buoys and headings; each run acts out `interactive`/`plan`/`autopilot` |
| `lost-letters.json` | classify | Settings areas (bins), the tray, letters, reasons, cites, plates and crest, overlay words | the cabinets, keys 1-9, 0, N |
| `market.json` (puzzle) | budget (Copilot-only) | the overlay's words, hire names, outcome summaries, the stall's signs, hints | grading (`jobs.ts`), the economy stays in the pack's `market.json` |
| `channel-routing.json` | route | crews' names, floats and icons, the demo's cards, the twist (question, answers, lines), results, hints, overlay words | the board, tiles, colours, the twist's ids (`port5174`, `closeOne`, `share` drive the Spire) |
| `workspaces.json` | match | places (names, icons, pictures), the crews' orders (accept, best, right, why), Fen's lines | what each place does to the water (`runWorkspaces`) |
| `flag-hoist.json` | classify | the flags (bins), the six orders and choices with their reasons and sections | the mast and its flags' art (by `symbol`) |

The "refactor first" rows split as the table says: the crane's berths are geometry and the guards are
rules (both code), and its targets and words are the pack's; the crate yard's grid is code and its
items come in slot order; the workspaces' places and orders are the pack's, and their effect on the
water is the model's. `"disabled": true` keeps the site as scenery: `session.ts` and
`thousand-bough-session.ts` create a puzzle only when `puzzleOn(name)`, and its cue does nothing. Every
file must exist (the sites read their words); a pack that disables a puzzle changes the quests that
wait on it.

**Beats.** `quests/<island>.json` → `beats`: rows `{ npc, when, script | say | none }`, the first that
holds wins (`src/game/beats.ts`); `when` maps quest → step (a step, `null`, a list, or `{ "not": … }`),
and `$flag` keys are the island's flags (`$lettersFiled`). `npcScript`, `meridianNpcScript` and
`thousandBoughNpcScript` read them. Quest trackers, `migrateQuests` and gating stay in code.

**Hooks.** `course.json` → `hooks`: `briefing` (lines, chest), `islands.<id>` (`landing`, `welcome` with
`@nav`/`@starfish`, `welcomeBack`, `tips`), `sail`, `npcVoiced`, `setPieces`, `battles.<plan>` (chapter,
`won`, waves' quiz and raiders). The game's battle plans keep their raider kinds and titles.

**Cast.** `voice/cast.json` holds what's common to a speaker's lines (`tts`, `model`, `voice`,
`voiceEnv`, `fallbackVoice`, `prosody`, `fx`); `tools/voice/lines.ts` resolves a line over its speaker.
Every resolved line has the cache hash in the manifest, so no audio changes. `generate.ts --check`
proves it without calling a service; `--check --list-stale` feeds the weekly refresh.

**Signs and setup copy.** World signs with course words read the pack: the Settings plates and crest,
the market's boards, plaque, name and notes, the crane's plates, board, sign and banner, the mill's
signs, the crews' gate boards, the helm buoys' order names. The setup forms, the Logbook's setup notes
and the Settings screen's shortcut line read `course.json` → `setup` (eager: the Settings screen opens
from the title); `Rich` (`src/ui/components/Rich.tsx`) renders their `**bold**` and `` `code` ``.

**Checks.** The content check validates `voice/cast.json` and each puzzle by its mechanic; requires a
file for each game puzzle with its mechanic; resolves puzzles' voice lines, quizzes, scripts, items'
sources, cites and section anchors; beats' NPCs, quests, steps, scripts and lines; hooks' lines,
islands, NPCs and battle quizzes; and gives every line a voice.

### Still course-specific in code after step 2

- Quest wiring in puzzle modules: quest ids and steps (`Q0.7`, `Q1.7: 'letters'`), puzzle save keys
  (`P1.3`, `market`), label ids, cue names. They're saved, so they stay (step 3 keys saves by course).
- Ids the mechanics' rules know: crate kinds `chat`/`project`, letters' `tray`, flag symbols
  `@ # / &`, helm modes, workspaces `worktree`/`checkout`/`cloud`, the twist's answer ids, the crane's
  guards (a fork you own, Actions on), the market's categories and efforts (`Lightweight`… `high`).
- English grammar helpers: the crews' possessive (`whose`), lower-casing a flag's meaning.
- Island dressing that shows course words: Thousand-Bough's house signs (`feature`, `bug-fix`,
  `docs`, `Base branch: main`, `main`, the Lookouts `5173`/`5174`, `Chronicle Loft`), the battle plans'
  titles, the helm buoys' `ORDER n` and `SHOAL`.
- Game chrome around puzzles: key help (`Press 1–9…`), generic buttons (`Undo`, `Reset`, `Leave`,
  `Hint`), the setup forms' buttons and privacy line, tile labels.
- `modelLabel`'s fallbacks and the setup parsers' error messages (`src/learn/setup.ts`).
- `index.html` meta text, `boot/fallback.ts`, the service worker's single course repo (step 3: from the packs), and the game's
  name (decision D4).

### Step 3 as built

**The second pack.** `courses/copilot-cli/` teaches [GitHub Copilot CLI for
Beginners](https://github.com/github/copilot-cli-for-beginners) (MIT © GitHub) on Anchorage Cay only,
as Chapter 00 · Quick Start. Chapter 00 is enough for a page set, a quiz set, a glossary and a Trial: it
has the prerequisites, Codespaces or a local clone, the four ways to install, trusting a folder,
`/login` with the device code, the first prompt, `@` file references, `/exit` and troubleshooting
(Chapter 01 only adds modes the island's puzzles can't show yet). The snapshot and lock come from
`node tools/course/sync.mjs --course=copilot-cli --chapters=00` (commit `802c19e`). Every quiz, page,
caption and Trial question cites its Chapter 00 section; the drift report finds every cited section and
bolded UI name. The pack is text-only (`"voice": false`), has no `market.json`, `models.json` or
`voice/cast.json`, and keeps the copilot-app quest skeleton's ids (`Q0.2`…`Q0.11`, `C0.1`, `B0.1`–`B0.4`,
`T0.1`…) because game code still waits on them. Puzzles: `first-words` (choose-tool: the prompt or the
shell) and the christening's hints are on; the gear rack, palette, bard, sluice and crane are
`"disabled": true` (the course doesn't teach what they act out), so they stay scenery with blank boards.
The other islands aren't in the pack: the chart shows them uncharted, Port Meridian and Thousand-Bough
never open or stream (`meridian-open.ts`, `thousand-bough-open.ts`, the session's `inCourse`, the
stream's `nearLoads`), and no battle starts.

**The live course.** `src/course/catalog.ts` holds every pack's `course.json` (eager, the title's only
course data) and the active one (`COURSE`, a live binding). `selectCourse(id)` switches it and runs the
`onCourseSelected` listeners (archipelago, briefing, setup copy, the fork and chapter URLs, battle plans,
boards, island tips and welcomes), then `setActiveCourse` runs the pack's `onCourse` hooks. Hooks that
read optional content tolerate its absence (no Meridian quests, no market, a disabled puzzle's words are
`''`). Each pack is its own lazy chunk (`course-copilot-app`, `course-copilot-cli`).

**Text-only voice.** With `"voice": false`, `tools/voice/generate.ts --course <id>` writes captions
instead of audio: a manifest marked `textOnly`, one `<id>.json` per line with its reading time
(`src/audio/voice/reading.ts`), an empty `lipsync.json`; `--check` proves them current. In the game
`voice()` returns nothing, the caption holds for its reading time, and a 44 px **Next** button (a click or tap),
the interact key or the gamepad's A moves on sooner. Reduced motion turns the caption's fade off. The
cabin briefing shows each line's whole text.

**Course picker.** **New Voyage** opens **Choose a course** (`src/ui/screens/CourseSelect.tsx`) when
the catalog has more than one course: title, tagline, chapters charted of the course's chapters,
minutes, voiced or captions, description, license and source link; arrow keys, the gamepad and taps
choose. **Continue** resumes the last course played (`copilot-isles.course`). The chart, Logbook,
credits (every course, its license and link) and boards read the active pack.

**Saves (§6).** `src/game/save-keys.ts`: `copilot-isles.<course>.save.v1` and
`copilot-isles.<course>.progress.v1`. At boot, if the old keys exist and copilot-app's don't, they're
copied (never moved); this release also mirrors copilot-app's writes to the old keys, so a rollback
finds current progress. Settings, benchmark and battle-briefing stay global. Export codes gain `c`; a
code without it is copilot-app's. Tests: `src/game/save-keys.test.ts` (migration, mirror, rollback and
roll-forward, import of old and new codes).

**Workflows and service worker.** `tools/course-pack/list.mjs` lists packs (`--github`, `--models`).
`weekly-refresh.yml` runs a matrix over packs with a GitHub source (sync, drift, content check, voices or
captions), one branch and PR per course; `models-refresh.yml` runs only for packs with `models.json`.
`public/sw.js` allows the live course from every pack's `source.repo`; the build writes that list from
the packs, and a test checks it.

**Proof.** The step-2 dump runs on `92c6a04` and on this tree for copilot-app. Two sections differ, both
on purpose: `credits` (both courses are attributed) and `saveKeys` (new; the old commit records the
legacy keys). Every other section is byte-identical. `src/course/copilot-cli.test.ts`, the content check
(`--course=copilot-cli`), `tests/e2e/courses.spec.ts` (each course from the picker to Anchorage) and
`tools/clitest.mjs` (the CLI quests end to end) cover the new pack.

### Still course-specific in code after step 3

- The quest skeleton: ids and steps the game waits on (`Q0.2` starts on landing, `Q0.8`'s `pipes` and
  `done` in First Words, `Q0.10`'s lighthouse and battle, `Q0.11` sailing, chest `C0.1`, bottles
  `B0.1`–`B0.4`, the Trial's seal). A course with another shape needs these as hooks.
- `migrateQuests` (copilot-app's renamed quests) and the legacy save keys are copilot-app's.
- Everything in "after step 2" that isn't listed above: mechanics' rule ids, island dressing, battle
  titles, puzzle chrome, `index.html`, `boot/fallback.ts` and the game's name.
- Defaults before a course is active: the title ship's rail plates and berth flags use copilot-app's words.

### What a third course still needs

- `courses/<id>/` with the files of §8 (copy `copilot-cli` for a text-only start) and one line in
  `COURSES` (`src/course/catalog.ts`) and `tools/budgets.json` (`course-<id>` ≤ 80 KB gz).
- To use islands past Anchorage: their quests, beats, puzzles and battle hooks, in the same shapes.
- A voiced course: `voice/cast.json` and the generate/lipsync run (secrets; not in CI by default).
- With a third course the picker still fits; past about five it needs scrolling or pages.

### Proving behaviour is identical

As the last data move did: `tools/course-pack/dump.test.ts` (`DUMP_OUT=<file> npx vitest run --config
tools/course-pack/vitest.config.mjs`) runs on the commit before and after and writes
canonical JSON (sorted keys). The diff must be empty except the documented URL prefix. Step 2 runs the
same script on both commits (byte-identical) and adds:

- every puzzle's content through its module's exports, and its pure functions over their inputs (the
  crane's runs, the letters' reasons for every filing, the channels' verdicts and results, the market's
  feedback for every hire, the gear and practice readouts);
- hooks (the briefing, the battle plans), and each voice line resolved against the cast with its cache
  hash beside the manifest's;
- the world signs, recorded through a stand-in `SignSet` while the crane, the mill, the Hall of Records'
  alcoves and the market's stall are built; the setup forms rendered for each kind, asked and changed.

A literal census (each string in the 3036b2a version of every changed file is still in code or in the
pack) covers words that only show at play time (overlays, hints).

- every index: images, quizzes, pages, chests, glossary, Trials, `voiced`, `cited`; `imageUrl()` per image;
- quests: defs, tracker, log and target for each state of a full playthrough;
- NPC scripts: every NPC × (each playthrough state + 2,000 seeded random quest states), with
  `voicedLines()` of each;
- barks, arrival cards, archipelago entries, labels, boards with their topics, market (derived jobs,
  quotes, catalog, Gilda), models, setup defaults and `format()` of every token;
- voice lines, manifest, lipsync; SHA-256 of every voice and snapshot file (paths relative to their root).

Then: `npm run typecheck && npm run lint && npm test`, `npm run content:check`, `npm run build &&
npm run check:budgets && npm run check:secrets`, `npm run check:audio` (voice served like Pages, new
path), `npm run test:e2e`, `tools/flowtest.mjs`, and `npm run check:memory` (heap ceiling).

### Risks

| Risk | Mitigation |
| --- | --- |
| Content read before the pack loads (module top-level `QUIZZES.get(…)`, dev pages, the opening's voice preload) | Top-level reads became `onCourse` hooks; the voyage awaits the pack before the session; dev pages that show course content activate it first; Vitest setup loads the pack |
| Bundle and boot | Boot gets only `course.json` (≈ 2 KB gz); `course-copilot-app` ≤ 80 KB gz; check `INEFFECTIVE_DYNAMIC_IMPORT` warnings; the JSON parse (~300 KB) runs under the loading screen |
| Lost compile-time checks (`ChapterId` union, ids in TS) | Schemas plus the content check's resolution rules (§3) |
| Hardcoded paths: `voice/testcove` in 27 files (tests, `audio/index.ts`, `audiotest.mjs`, `build-manifest.mjs`, workflows), course/lock/content paths in 33 (tests, tools, video reels, `copilot-instructions.md`, `.vscode`) | One `coursePaths(id)` helper for tools and tests; grep for the old paths must return nothing |
| Pages sub-path and the service worker | URLs through `BASE_URL`; the plugin copies into `dist/courses/`; voice and snapshot aren't SW-cached today, so no SW change; the live-course allow-list stays one repo until step 3 |
| `testcove` means two things | The Anchorage world packs keep `packs/testcove/*`; only the voice set is renamed |
| A weekly-refresh PR open during the move | Merge or close it first; the move is one PR |
| Docs drift | Rewrite `docs/content-data.md`, update `docs/course-content-authoring.md`, `docs/voices.md`, PLAN §8 and §13.1, `.github/copilot-instructions.md` |

## 10. Decisions for Dan

- **D1. Build-time packs** (lazy chunk per course) rather than JSON fetched at runtime. Recommended.
- **D2. One folder per pack, audio and snapshot included** (`courses/<id>/public/`, served by a small Vite
  plugin) rather than binaries under `public/courses/<id>/`. Recommended.
- **D3. Characters belong to the game** (look and name; Nell is Nell in every course); voices, lines and
  barks belong to the pack. Recommended. The alternative is per-course names.
- **D4. The game's name** ("Copilot Isles", the chart's cartouche, `index.html`): keep as the game's brand,
  or make the archipelago's name per course later. Keep for now.
- **D5. Saves keyed by course in step 3**, not step 1 (step 1 changes no save key). Recommended.
