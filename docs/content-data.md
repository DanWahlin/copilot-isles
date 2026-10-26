# Content data: the course packs the game is built from

Everything a course says in the game is data, not code. It lives in a **course pack**, one folder per
course in `courses/` ([COURSE-PACKS.md](specs/COURSE-PACKS.md)), so you can change it without touching
TypeScript, and the weekly refresh workflows can update it and check it. Each pack is part of the
build: a change reaches players with the next deploy.

There are two packs: `courses/copilot-app/` (GitHub Copilot app for Beginners: Anchorage, Port Meridian
and Thousand-Bough, voiced, and Keelhaven's Chapter 03 content, written before its island: see
[Content ahead of its island](#content-ahead-of-its-island)) and `courses/copilot-cli/` (GitHub Copilot CLI for Beginners: Anchorage only,
Chapter 00, captions only). To add one, see [Adding a course](adding-a-course.md).

## The files

| File (in `courses/<id>/`) | What it controls | Who changes it | Loader (typed) |
| --- | --- | --- | --- |
| `course.json` | The course's id, title, tagline, description and language; its source (repository, license, copyright, chapters); the islands it uses (each one's chapter, chart label, minutes, Seal, topics, and arrival-card lines); its practice values (issue, branch, repository name); the "Your setup" forms' words (`setup`); the lines and questions the game asks for by id (`hooks`); and how older saves move to today's ids (`migrations`, `legacySaves`) | You, by hand | `src/course/catalog.ts` |
| `chapters/<chapter>.json` | A chapter's course images, quizzes, Logbook pages, chests, glossary terms, Trials, and the course sections voiced (`voiced`) and unvoiced (`cited`) teaching lines paraphrase ([course-content-authoring.md](course-content-authoring.md)) | You, by hand | `src/learn/content/index.ts` |
| `quests/<island>.json` | An island's quests (title, task, link, what each step says), the tracker's header, where the compass points for each step (an optional quest's steps get the compass's paler marker once it's started; once the island's main quests are done the compass is on your ship), every named script its NPCs and puzzles play, which script or line each NPC offers when (`beats`), what the game's story conditions and events mean in its quests (`story`), and its NPCs' barks | You, by hand | `src/course/active.ts`, `src/game/beats.ts`, `src/game/story.ts`, `src/game/*-quests.ts` |
| `puzzles/<name>.json` | One puzzle's content: what you sort, pick or route, the answers and the reasons a wrong pick gets, the course sections they cite, the site's signs, the overlay's and Wingman's words (`text`) and the voice lines it plays (`lines`). Each names its `mechanic` and the `quest` it plays in, and `"disabled": true` turns the puzzle off | You, by hand | `src/course/puzzles.ts`, the puzzle's module |
| `learning.json` (optional) | The learning systems: the real-app tasks scripts hand off ("Do this in the app" cards and the Logbook's App checklist), each chapter's learning objectives and what covers them (the Course map), the reflection before each Seal, and a finished quest's Logbook line until its app tasks are confirmed (`learned`) | You, by hand | `src/learn/learning.ts` |
| `labels.json` | Chart labels: what you learn at an island, a puzzle or a sea battle (docs/specs/LOWER-THIRDS.md) | You, by hand | `src/learn/content/labels.ts` |
| `boards.json` | The course notice boards' header and pin text, and the `##` sections that aren't topics | You, by hand | `src/content/course-boards.ts` |
| `market.json` (optional) | The Model Market: model categories (order, price, tagline), effort levels (label, price), the house special (its price and its own effort levels), the price cap, refunds and doubloons by job size, the board rule's numbers (`board.size`, `board.perFamily`), the stamps, the course quotes, the jobs on the market's board, Gilda's lines, and the other stalls' keepers' own version of each (and a goodbye) | You, by hand | `src/content/market.ts` |
| `models.json` (optional) | The Model Market's model names, categories and task areas, from GitHub Docs | `npm run models:sync` (`models-refresh.yml`) | `src/game/market/models.ts` |
| `lock.json` | The bundled course snapshot: its commit and a hash for each section and image. The boards' topics come from it | `npm run course:sync` (`weekly-refresh.yml`) | `src/learn/course/lock.ts` |
| `voice/lines.json` | Every voice line: id, speaker and text (the caption), and anything that's the line's own (a prosody, a `sub`); `"pending": true` on a line written before its voice is chosen | You, by hand ([voices.md](voices.md)) | `tools/voice/lines.ts` |
| `voice/cast.json` (voiced packs) | Who voices each speaker: the speech service, voice, fallback, prosody and effect (a line's own fields override its speaker's) | You, by hand ([voices.md](voices.md)) | `tools/voice/lines.ts` |
| `public/course/**` | The course snapshot: READMEs, `GLOSSARY.md`, `LICENSE`, and the images the chapters show | `npm run course:sync` | `src/learn/course/source.ts` |
| `public/voice/**` | Each line's audio (`.webm`, `.m4a`), word timings (`.json`), `manifest.json` and `lipsync.json`; in a text-only pack, each line's caption and reading time (`.json`) | `tools/voice/generate.ts`, `npm run voice:lipsync` | `src/audio`, `src/game/dialogue.ts` |

Don't edit `models.json`, `lock.json`, the snapshot or the voice files by hand: their tools write them.

What the game owns stays in code on purpose: the islands and their art, the characters (names,
looks, where they stand), where each notice board stands (`src/world/islands/course-boards.ts`), the
grading rules (`src/game/market/jobs.ts`), the board rule's order (`src/game/market/catalog.ts`), each
puzzle's mechanic (its rules, grid, geometry and controls, and the quest steps it sets), where chests
and bottles stand, the quests' trackers, saves and island gating, and the names of what the game asks
each island's story. No game code names a quest id. [COURSE-PACKS.md](specs/COURSE-PACKS.md) ("Still
course-specific in code after step 5") lists what's left: only the game's own.

### How the game loads a pack

- **The title** reads only each pack's `course.json` (`src/course/catalog.ts`): the course list, the
  tagline, the credits, the chart's chapters and topics, the arrival cards, the practice values.
  `COURSE` is the active course, a live binding: `selectCourse(id)` switches it when you choose a course
  (or Continue), and modules that derive from it listen with `onCourseSelected`.
- **A voyage** (New Voyage or Continue) loads the rest (`src/course/load.ts`) in parts
  ([COURSE-PACKS.md](specs/COURSE-PACKS.md) §2, `src/course/split.ts`). The build splits every JSON
  file of a pack, but `course.json` and `voice/`, into:
  - **the core**, one lazy chunk, `course-<id>` (≤ 48 KB gz): the shared files, and each chapter's
    index, images, chests, glossary and Trials, each island's tracker, quest list, `story` and
    `signs`, and each puzzle's `mechanic`, `quest`, `steps` and `disabled`;
  - **a part per chapter**, a JSON file (≤ 28 KB gz each): the chapter's quizzes, pages, `voiced` and
    `cited`, and its island's compass targets, beats, scripts and barks, and its puzzles' content.

  The core and Anchorage's part load behind the cabin, beside the island's code, and the pack is
  active before the session reads any of it. Another island's part loads when the island streams
  in, or when something asks for it (a recap's quiz, a Logbook page, a battle's question).
  `npm run content:check` lists each part's size against its budget in `tools/budgets.json`: when a
  chapter grows past its budget, move content to another chapter, or raise the budget and say why.
- **The snapshot and the voice** are static files, served as `<base>courses/<id>/` (`course/…`,
  `voice/…`) from the pack's `public/` folder: `vite.config.ts` serves it in dev and copies it into
  `dist/courses/<id>/` for the build, so a sub-path deploy (GitHub Pages) works.
- **In code**, read pack data through `src/course/active.ts` (`coursePack()`, `courseScript()`,
  `barksFor()`) and `src/course/puzzles.ts` (`puzzleContent()`, `textOf()`, `lineOf()`, `puzzleOn()`),
  or keep what you derive from it in an `onCourse` hook, never at module top level: a module may load
  before the pack does. A hook that reads an island's scripts or a puzzle's content before its chapter
  part is in gets the core only (no scripts, `puzzleMaybe` null), and runs again when the part
  arrives. Outside a hook, read a chapter's part only where it's sure to be in (on its island), or
  load it first (`loadIslandPart`, `loadQuizParts`, `loadPageParts` in `src/course/load.ts`): a read
  too early logs an error. For a quiz's or page's title or kind anywhere, use the index
  (`QUIZ_INDEX`, `PAGE_INDEX`, `CHAPTER_INDEX` in `src/learn/content/index.ts`). `course.json` (`COURSE`, `src/course/catalog.ts`) is there from the start. Node tools read a pack with `tools/course-pack/read.ts`
  (`activateCourseFromDisk`), and Vitest activates the default pack before every test file
  (`src/course/test-setup.ts`).

Each file has a JSON Schema in `courses/schemas/`. The hand-edited files name theirs in `"$schema"`,
so VS Code and other editors check your edit as you type and show each field's description
(`.vscode/settings.json` maps the generated ones to theirs).

### `course.json`

- **`islands`**: one entry per island the course uses, in voyage order. `island` is the game's island id
  (`src/ui/chart/archipelago.ts`), `chapter` a chapter in `source.chapters`, and `label` the chart's
  chapter label (it starts with the chapter's number). An island with an `arrival` shows those lines
  over its name when you arrive.
- **`voice`**: `false` for a text-only pack: captions hold for a reading time, or move on with **Next**
  (a click or tap), the interact key or the gamepad's A. Leave it out for a voiced pack.
- **`practice`**: the course's own example values, shown until the player gives theirs (Your setup).
  Without it, the Logbook's Your setup card has no fork, issue or branch row.
- **`setup`**: the "Your setup" forms' words (kicker, titles, intro, what each value is used for, the
  model choices), the Logbook's notes and its Your setup card's labels, and the Settings screen's
  shortcut line. Without it, the Logbook has no Your setup card. The branch form asks for the practice
  session's **working** branch: it starts empty (`branch.example` is its placeholder), refuses
  `practice.branch` (the session's base branch) with `branch.base`, and `branch.skip` labels its Skip
  when a script asks. `**bold**` and `` `code` ``
  render as such; `{issue}`, `{issueTitle}`, `{branch}`, `{os}` and `{keys}` are filled in.
- **`hooks`**: the voice lines and questions the game asks for by id, so it never names one itself:
  the cabin `briefing`; each island's `welcome` (`@nav` and `@starfish` mark where its `tips` go; they're
  left out when the tips are off), `welcomeBack` and `landing`; the `sail` line; `npcVoiced` (what an
  NPC with no script says instead of a bark); `setPieces` (the gondola's line); and the sea `battles`
  (each wave's quiz and its raiders' names, and the line when it's won). A battle starts once its home
  island's story says `sealed`.
- **`migrations`**: how an older save moves to today's ids when it loads. `quests` are rules in the
  story's format (below), run in order when a session starts: `{ "when": { "Q0.3": "done", "Q0.4": null },
  "set": { "Q0.4": "start" } }`. A rule's `when` may name quests the course no longer has; what it sets
  must exist. `$workflowsOn` is whether the mill's gate lever was pulled (left out without a save).
  `renamed` maps an old Logbook id (a page or glossary term) to today's; `taught` gives saves that finished
  a quest the glossary terms it teaches now. Write each rule so running it twice changes nothing.
- **`recap`** (optional): Wingman's spaced, interleaved recap. `questions` (1-3) from quizzes the
  player has met, of the kinds in `types` (`mc`, `scenario`, `multi`; all three by default), never the
  ones in `exclude`, at most once every `minGapMinutes` (20), when they land on an island (from the
  other chapters) and on Continue; `reward.doubloons` for each answer right first time,
  `reward.starfish` for a recap with every answer right. Leave it out for no recap.
- **`legacySaves`**: `true` on the one course that saves from before course packs belong to (today
  copilot-app).

### `chapters/<chapter>.json` and `quests/<island>.json`

- A chapter file is named after its `chapter`; a quests file after its `island`.
- **Scripts** are the steps `src/game/script.ts` runs: `say` (a voice line), `text`, `show`/`hide` (a
  course image in the spyglass), `quiz`, `page`, `file`, `term`, `quest`, `trial`, `cue`, `askFork`,
  `askSetup`, `appTask` (a "Do this in the app" card from `learning.json`, skipped once confirmed;
  Later goes straight on; `"quiet": true` hands it off with no card, for an NPC who sends you off and
  asks when you're back; `"orStop": true` ends the script on Later, for an optional app-only quest's
  return beat). A `quiz` or `askSetup` with `when` runs only for players whose setup fits
  (`model:auto`, `model:picked`, `branch:given`, `issue:given`) or who confirmed an app task
  (`app:A2.2`). A `{ "script": "<name>" }` step
  splices in another script of the same island. `notes`
  says what each script is for; the game ignores it.
- **Ids are saved in players' progress** (quests and their steps, pages, chests, quizzes, glossary
  terms, Trials, labels, market jobs): don't rename them.
- **Beats** (`beats`) say which script or line each NPC offers for the quest state. The first row for
  the NPC whose `when` holds wins: `{ "npc": "mina", "when": { "Q1.1": { "not": "done" } }, "say":
  "mer.mina.wait" }`. A `when` names quests and the step each must be at (a step, `null` for not
  started, a list of either, or `{ "not": … }`); a key starting with `$` is a flag the island passes in
  (`$lettersFiled`). A row has one of `script` (a script of the island), `say` (one line) or `none`
  (nothing: the NPC barks). No row also means a bark.
- **Signs** (`signs`): the island's signs with course words, by the names the game asks for
  (`ISLAND_SIGNS` in `src/course/pack.ts`): Thousand-Bough's `loft`, the board over the top deck's house
  (`"signs": { "loft": "Chronicle Loft" }`). Every name the game asks for is required, and no others.
- **The story** (`story`) is the island's quest skeleton: what each condition and event the game asks
  for means in this course's quests (`src/game/story.ts`, `STORY_CONDITIONS` and `STORY_EVENTS`). A
  condition is a `when`: `"sealed": { "Q0.10": "done" }`. An event is a list of rules, each `{ "when"?,
  "set": { quest: step } }`, applied in order (each sees what the ones before it set): `"setSail":
  [{ "when": { "Q0.11": "sail" }, "set": { "Q0.11": "done" } }]`. Anchorage needs `firstVisit` (the
  first welcome), `trialStarted` (Nell waits at the pier head), `sealed`, `gangwayDown`, and the events
  `landed` (a session starts) and `setSail` (you take the helm); Port Meridian `firstVisit` and `sealed`;
  Thousand-Bough `firstVisit`, `gondolaOpen`, `secondBridge`, `practiceStarted`, `basketOpen`,
  `skipCrownView` and `sealed`. Keelhaven (in build) will ask for `firstVisit`, `dockKitted`,
  `searchHullDown`, `prHullsDown` and `sealed` (docs/specs/ISLAND-03-keelhaven.md, § Wiring contract).
  Your quest ids are yours: the game never names one.
- **What's next** (`tracker.next`): the tracker's line once every task's done. `tracker.nextSail`
  (Anchorage and Thousand-Bough) replaces it once the next island is open: the island whose registry
  entry opens after this island's Seal.

### `puzzles/<name>.json`

- The game plays a fixed set of puzzles (`GAME_PUZZLES` in `src/course/puzzles.ts`), each with its
  mechanic: **classify** (`crate-yard`, `lost-letters`, `flag-hoist`), **choose-tool** (`first-words`,
  and the Copilot-only `three-helms`), **route** (`sluice`, `channel-routing`), **match**
  (`workspaces`), **procedure** (`crane`), **checklist** (`gear-rack`, `practice-session`), **budget**
  (the Copilot-only `market`; its economy is `market.json`) and **ceremony** (`palette`, `bard`,
  `christening`). A pack has a file for each; the schema is `courses/schemas/puzzle-<mechanic>.schema.json`.
  Keelhaven's puzzles come with its island: **circuit** (`drydock-ring`, `lock-flight`) and
  **ceremony** (`retake`).
- **A circuit** (`drydock-ring.json`, `lock-flight.json`) is a loop the player walks station by
  station. `places` binds your place ids to the game's (`acts`: the ring's `post`, `stack`, `slate`,
  `caisson`, `lookout`; the flight's `ledger`, `bell`, `slate`, `gate1`, `petition`, `lamps`, `note`,
  `redLamp`, `barge`, `gate2`, `seaGate`; src/game/puzzles/circuit/places.ts), each once. `laps` (one
  or two) each run while their `quest` is at `step`; the lap's end sets `solved` and plays the
  island's `close` script. A station has a `kind` (`choose`, `watch`, `sound`, `seal`, `tiles`,
  `gate`), the place it's `at`, and the section it teaches (`cite`, a key of `cites`). Every station
  with options has a right one, and every wrong option has its `reason`, the place it goes back to
  (`backTo`) and its `cite`; a claim that doesn't stick (`tiles`) has its `reason` and `cite` too.
- **`text`**: the puzzle's words by key (labels, readouts, signs, the overlay, Wingman's hints).
  `{name}` is a value the game fills in (`Mark {from} → mark {to}`); keep each key's `{names}`. A key the
  game asks for and the file hasn't got stops the puzzle with an error, so don't remove keys.
- **`lines`**: the voice lines it plays, by what they're for (`"round1": "tb.fen.round1"`); a `line` in
  its content (an order, a twist's answer) is a voice line too.
- **Cited reasons**: the crate yard's items have a `source`; the Lost Letters' `cites` and the Flag
  Hoist's `section` anchors are in the file's `chapter`. The content check holds them to the lock.
- **The gear rack** (`gear-rack.json`, a checklist) runs one check per press while its quest is at
  `checks`: `scripts.intro` plays at the first press, a check's `stale` prints an out-of-date
  `output` first and plays the script it names (the next run prints the right one), a check's `notes`
  show on one kind of computer (`windows`, `mac`, `linux`), and `scripts.checked` plays once every
  check has passed (it must move the quest on). Keep a `stale` version's `output` in step with the
  real world (the Copilot app course's `node -v` tracks the version nodejs.org marks LTS).
- **`"disabled": true`** turns a puzzle off: its site stays as scenery, and the cue that would start it
  does nothing. Change the quests that wait on it too (their step won't finish by itself).
- **`quest`**: the quest the puzzle plays in. It must have the steps the puzzle's mechanic sets and
  waits on (`PUZZLE_STEPS` in `src/course/puzzles.ts`: the crane's `gate`, `brief`, `crane` and
  `solved`, the gear rack's `checks`, the crate yard's `crates` and `solved`…). If the quest calls one of them something else, map it in
  **`steps`** (game step → the quest's step: the Copilot app course's crane has
  `"steps": { "gate": "actions" }`); the game reads every mechanic step through it
  (`puzzleSteps(name)`, resolved once per course). Every quest also ends at `done`, the game's step
  for a finished quest: a puzzle reads it as it is, and it can't be mapped. The palette's `latePage` and the market's `page` are pages in the
  course.
- **Your ids, bound to the game's (`acts`)**: where a puzzle acts a concept out, name it with your own
  id and bind it to what the game does, each game id once: the helms' `modes` (`steer`, `review`,
  `auto`) and `review` options (`accept`, `takeOver`, `amend`); Channel Routing's `crews` (`blue`,
  `green`, `teal`, with each one's treehouse `sign`) and twist answers (`reroute`, `close`, `jam`,
  `none`; a right one reroutes or closes); the workspaces' `places` (`channel`, `hall`, `gondola`);
  the crate yard's `bins` (`tavern`, `slipway`); the crane's `cargo` (`pennants`, `notices`, `hulls`,
  `seals`). Your other entries (orders, wrong picks, hints, items' bins) name your ids:
  `"modes": { "interactive": { "acts": "steer", "name": "Interactive", "says": "…" } }`.
- The Lost Letters' bins and tray and the Flag Hoist's flags are just your ids: one bin may be
  `"apart": true` (its plate is brown and its button stands apart), letters' answers name a bin or your
  tray's `id`, and the flags hang on the mast in order (four halyards at most), painted with your
  symbols. Thousand-Bough's signs with course words are Channel Routing's (`text.hallSign`,
  `scaffoldSign`, `lookout1`, `lookout2`); the top deck's house board is the island's (below).

### `learning.json`

- **`labels`**: the real tool's names, in the course's words: the card's kicker (`"Do this in the
  Copilot app"`), the Logbook tab and checklist (`"App checklist"`), and the tool in a sentence
  (`"the Copilot app"`).
- **`appTasks`**: what the player does in the real tool, one to four short `steps` (`**bold**` UI
  names, `` `code` `` commands, setup tokens like `{issue}`), `why` in a sentence, the course `source`
  (its chapter's section: the card's "Open in the course ↗"), an optional `link` (where to download or
  fork), the `quest` it belongs to, an optional `seen` ("What did you see?": a prompt, two to four
  options, the `answer` and an `explain` that says what the course says you'll see; any answer is
  fine), an optional `check` (an opt-in GitHub check: `repoExists` for the fork, `branchExists` with a
  `branch`, `prOpened`; `{practiceBranch}` is `course.json`'s `practice.branch`). A script hands
  each one off with `{ "appTask": "<id>" }` right where the NPC teaches it; every task needs one.
  Where an NPC sends you off to do it and asks when you're back (Thousand-Bough's exercises and
  assignment), hand it off `quiet` at the brief and show the card at the return beat, with the
  NPC's own "what did you see?" gated on `app:<id>`: one prompt for one app moment. Task ids are
  saved in players' progress: don't rename them.
- **`learned`** (optional): quest → its Logbook line once it's done but its app tasks aren't all
  confirmed, for a quest whose `done` step says what you did in the app ("Your fork is added under
  Sessions."). Better: write the `done` step as what you learned ("You know how to fork the course…"),
  as the Copilot app course does, and leave `learned` empty; the Logbook marks whether the app work is
  confirmed either way. Only for quests with app tasks.
- **`objectives`**: each chapter's learning objectives, word for word from its Learning Objectives
  section (the check holds them to the snapshot), with what in the game `covers` each: `quests` (done
  means practised), `puzzles` (by file name; their quest's done), `quizzes` (passed means quizzed) and
  `appTasks` (confirmed). An objective with no `covers` shows as "In the course only".
- **`reflections`**: one per chapter, asked once after its Trial's last answer and before the Seal:
  a `prompt` and two to six `choices` (the chapter's Key Takeaways, in short), with the section it
  comes from. Skippable, never graded; the Course map shows the pick.

### `market.json`

- **Categories** are your model categories (models.json names them), smallest first, each bound to a
  size the grading reads (`"acts"`: `small`, `medium`, `large`, in that order): a quick look is
  right-sized with the house special at its base level or any size on its default (or low) effort (a
  higher house level or high effort overspends); a hard job wants the house special above its base, a
  large one, or a medium one on high effort.
- **`house`** is the house special, the app's own pick (Copilot Fusion in this course): its `price` and
  its own effort `levels`, lowest first (`standard`, `high`, `max`). The first level is its base. A level's
  `id` is saved in players' progress, so don't rename it.
- **Prices** are starfish. `categories[].price` must go up from the smallest to the largest. A hire costs
  its category's price plus its effort's price, up to `maxPrice` (at most 4). The house special costs `house.price` plus its level's price.
- **Refunds** (`sizes.quick.refund`, `sizes.hard.refund`) are paid for a right-sized hire. A refund must be
  less than the cheapest right-sized model hire for that size, so a right-sized job always costs at least 1
  starfish (today: quick 0, hard 2). The game also never pays back a hire's whole price (the house special's 1 at
  its base gets none back). `sizes.*.quotes` (optional) are keys of `quotes` every work order of that size shows after
  its job's `why` (today the hard jobs': `noSpecific`, `vary`).
- **Doubloons** (`sizes.*.doubloons`) are paid the first time a job is done right-sized.
- **`board`**: how many model names each signboard shows, and how many of one family it takes before
  it fills up (docs/specs/MODEL-MARKET.md §4.2).
- **Quotes** are course sentences, word for word (`**bold**` included), with the section they're from:
  `chapter`, `anchor` and `hash`. Get the anchor and hash from `npm run course:refs -- 01`. The overlay
  shows the section's title from the course lock. The keys the grading and the work order use (`cost`,
  `effort`, `hard`, `noGuarantee`, `auto`, `autoAside`, `autoLevels`, `autoMore`, `retry`, `noSpecific`, `vary`)
  must stay.
- **Jobs** (at most four: the cork board has four spots) name a quote key in `why`. A job's `id` is
  saved in players' progress, so don't rename it.
- **Gilda's lines** (`gilda.*`) have a `voice` (the line's id in the pack's `voice/lines.json`), the
  `text` shown as her caption, and, for a teaching line, the course `source` it paraphrases (the drift
  report checks it). `right` is for a right-sized hire with starfish back, `fair` for one with none,
  `keep` for a quick look right-sized with a bigger model on its default effort, `overAuto` for a quick look with the house special above its base,
  `hardAuto` for a hard job right-sized with the house special above its base, and `early` for the counter before the course's model lesson. `practiced` (Gilda's
  alone, optional) is said when the lesson's practice is done at her stall.
- **The other keepers** (`keepers.<island>`): each stall but Gilda's (the game's
  `src/game/market/stalls.ts`: Desmond on `anchorage`, Lani on `thousand-bough`) has its keeper's own
  version of every one of Gilda's lines (the same keys, the same teaching and `source`, in their own words
  and never naming her or her stall) and a goodbye (`bye`), in the same form as Gilda's lines; the line's
  `speaker` in `voice/lines.json` is the keeper's name. A course needs one for every such stall on its
  islands, with every key: a stall never plays Gilda's voice.
- **Whose task it is:** jobs at every stall count on the one board, but the market's quest (`puzzles/market.json`
  → `quest`) is done, and its `page` given, only at the stall on the island whose `quests/<island>.json` holds
  that quest (Gilda's).
- **The lesson** (`puzzles/market.json` → `lesson`, optional): `taught` is a `when` (as in a beat) that says
  the course has taught models and effort: until it holds, every stall's keeper says their `early` line and
  the work order stays shut. `practice` is a `when` during which Gilda's stall runs the lesson's practice (a
  quick look right-sized, then a hard job and a Retry of it, staking the starfish), and `practiced` the steps
  it sets when that's done (`{ "Q1.6": "practiced" }`). The content check holds the quests and steps to the
  course's.

### `boards.json`

- **Which chapter** each island's board shows is the island's `chapter` in `course.json`; **where** it
  stands is the game's (`src/world/islands/course-boards.ts`).
- **Topics** aren't in this file: a board lists its chapter's `##` sections from the course lock, in the
  course's order, less `skip.anchors` and the headings that start with one of `skip.titlePrefixes`.
- **Text**: in `header` and `pins`, `{num}` is the chapter's number ("01") and `{title}` its title in the
  course. There are exactly two pins: the chapter's README (`"link": "chapter"`) and the course's home
  (`"link": "home"`).

## Content ahead of its island

A course can write an island's content before the game has the island (it isn't in the registry
yet: its world is in build, docs/adding-an-island.md). Keelhaven's Chapter 03 content is written so.

- **The game leaves it out** until the island is in the registry (`withoutIslandsAhead`,
  src/course/split.ts, when a voyage loads the pack): the island's chapter (its core and its part),
  its quests, the puzzles that play in them, and their app tasks, objectives and reflection. Nothing a
  player sees or counts changes: the Logbook, the Course map, the certificate and the recap stay as
  they were. The build still makes the chapter's part, so `check:budgets` measures it, and a puzzle
  that plays in one of its quests goes in that part.
- **The content check holds it to everything but the game's side of the contract**: its NPCs (beats
  and barks), the names its story answers and the signs it gives, its puzzles' names and steps, a market
  stall for its keeper. Those come with the island's wiring step. What the content means is
  still checked: quests and steps, scripts, pages, quizzes, images, citations, app tasks, objectives,
  and every circuit's bindings.
- **Its voice lines can be `"pending": true`**: written, with a speaker, but not voiced yet. A pending
  line needs no voice in `voice/cast.json` and no audio, `tools/voice/generate.ts` leaves it out (the
  weekly refresh too), and only content ahead of its island may play one. When the voices are chosen,
  give each speaker their cast entry, drop `pending`, and generate the audio: from then on the line's
  audio is checked as any other's. Keelhaven's lines are voiced (2026-10-25).

## Voiced lines: change the audio too

In a text-only pack (`"voice": false`), change the line's `text` in `voice/lines.json` and run
`npx tsx tools/voice/generate.ts --course <id>`: it writes the captions without calling a service.

A caption and its voice line must say the same words. If you change a voiced line's text (in a
script's line, or Gilda's or a keeper's `text` in `market.json`):

1. Change the same line's `text` in the pack's `voice/lines.json` (and, for a puzzle's or a hook's
   line, nothing else: they name the line by id).
2. Make the audio again: `npx tsx tools/voice/generate.ts --course copilot-app --only=<ids>` (for
   example `--only=mer.market.hello`). This updates the pack's `public/voice/` and its `manifest.json`.
3. Commit the JSON, the lines file and the audio together.

ElevenLabs lines need the ElevenLabs CLI sign-in (`elevenlabs auth login`), so you must run step 2 on
your computer. The weekly course refresh makes Azure voice lines again by itself when the Azure Speech
secrets exist, but it skips ElevenLabs lines. Until the audio matches, the content check fails with
"the audio says something else" ([voices.md](voices.md) has every voice).

## Checks

```bash
npm run content:check                       # the copilot-app pack; a report
npm run content:check -- --course=<id>      # another pack
npx vitest run src/content
```

`src/content/content.test.ts` (part of `npm test`, so CI runs it) fails on any issue, and
`npm run content:check` (tools/content/report.ts) prints them by file and JSON entry, with what to
change. The checks (tools/content/check.ts):

- every file of the pack (less `public/`) is valid against its schema, and nothing else is in the pack
  (a small dev-only checker, `tools/content/json-schema.ts`; nothing is added to the game's bundle);
- every cited anchor and hash is in the pack's `lock.json` (chapters' quizzes, pages, `voiced` and
  `cited`; chart labels; market quotes and Gilda's sources), every market quote is word for word in its
  cited section of the pack's snapshot, and every image matches the file it was written against;
- ids resolve: chapters' images, pages, quizzes and Trials; every script step (quizzes, pages, terms,
  Trials, images, quest steps, other scripts), in quests and in puzzles; the compass's quest steps; the
  islands and chapters `course.json` names; the NPCs given barks or beats (the game's cast); each
  beat's quests, steps and script; the hooks' islands, NPCs and battle quizzes;
- the quest skeleton: each island's `story` has every condition and event the game asks for (and no
  other), and its quests and steps resolve; each enabled puzzle names a `quest` with its mechanic's
  steps; the migrations set quests and steps, and rename to pages and terms, that exist; every chest
  and bottle the game places on the course's islands is a chest in its chapters;
- the bindings: each game id a puzzle acts out is bound once (`acts`: helm modes and review options,
  crews, places, crate bins, cargo props, market sizes smallest first), and the pack's own ids resolve
  (orders, wrong picks, hints, letters' and flags' answers, items' bins, models' categories, `steps`);
- there's a puzzle file for each puzzle the game plays on the course's islands, with its mechanic (and no other), valid against
  that mechanic's schema; its cited sections are in the lock;
- every voice line a script, a chapter, a beat, a hook, a puzzle or the market plays is in
  `voice/lines.json`, and its audio (or, in a text-only pack, its caption) in
  `public/voice/manifest.json` says the same words; Gilda's lines
  are hers and each keeper's their own, and every other stall on the course's islands has a keeper's lines; every line has a voice (its own, or its speaker's in `voice/cast.json`), and every speaker
  in the cast has a line;
- the economy: every hire costs 1 to `maxPrice` (≤ 4), bigger models cost more, a refund is always less
  than the cheapest right-sized hire, and every job can be done right-sized with the starfish on the
  course's first island (spending what comes back, in the best order);
- every board's chapter is in the snapshot with at least 5 topics, and every board stands on its island
  (in its waters, on the ground or a deck up to 1 m above it);
- every category has a model in `models.json`, and no model is listed twice;
- `learning.json`: every app task is handed off by a script, cites its own chapter's section, and its
  quest, "seen" answer and check resolve; a step's `when: "app:<id>"` names a task; after an `orStop`
  hand-off, a script sets only optional quests' steps; every objective is word for
  word in its section and covers quests, puzzles, quizzes and app tasks that exist; one reflection per
  chapter, with unique choices; `learned` lines only for quests with app tasks; `course.json`'s
  `recap.exclude` names quizzes.

`src/learn/course/refs.test.ts` checks the snapshot against the lock section by section, and every
`SourceRef` and course image against them.

## How the workflows update and check the data

Both workflows run once per pack (a matrix from `node tools/course-pack/list.mjs`): the weekly refresh
for each pack with a GitHub `source`, the models refresh only for packs with a `models.json` (today
`copilot-app`).

- **`weekly-refresh.yml`** (Mondays, when the course changes): syncs the pack's snapshot and
  `lock.json` (`tools/course/sync.mjs --course`), writes the drift report, then runs
  `npm run content:check` against the new snapshot, and makes changed voice lines again (or, for a
text-only pack, its captions). The PR, "Weekly refresh: <course title> @ <sha>", one per course, shows each
  board's topics and what the sync added or removed, and lists each JSON entry that needs an edit (a
  quote that's no longer word for word, an anchor that's gone, a section whose hash changed). A broken
  entry labels the PR `needs-content-review`. Fix the entry on the PR's branch, and the checks pass
  again.
- **`models-refresh.yml`** (Mondays): runs `npm run models:sync -- --course=<id>`, then the same content
  check and the other checks, and opens "Weekly refresh: Copilot models" with the report.
- Nothing merges by itself: a person reviews and merges each PR.

## Saves

Each course keeps its own save and progress (`kraken-isles.<course>.save.v1`,
`kraken-isles.<course>.progress.v1`, `src/game/save-keys.ts`), and `kraken-isles.course` names the
last one for Continue. On start, the game moves old keys (COURSE-PACKS.md §6): keys from when the
game was Copilot Isles (`copilot-isles.*`) go to `kraken-isles.*`, and saves from before course packs
(`copilot-isles.save.v1`, `copilot-isles.progress.v1`) go to the keys of the course marked
`"legacySaves": true` (copilot-app). A move never overwrites a key that has a value, and it removes
the old key. Export codes name their course (`c`); a code without it is that course's. Never
rename an id that a save holds (quests, pages, chests, quizzes, puzzles, labels, market jobs).

## How a change reaches players

1. Edit the JSON on a branch (or let a weekly refresh PR do it) and open a PR.
2. CI (`ci.yml`) runs the checks, the content checks included.
3. Merge the PR. The merge is a push to `main`, so CI runs again.
4. When CI passes on `main`, **Deploy to GitHub Pages** (`pages.yml`) builds that commit and deploys it.
   You can still run it by hand ("Run workflow").

PRs that a workflow opens with `GITHUB_TOKEN` don't start CI themselves (each refresh workflow runs
the checks itself), but a person merging one makes a push that does, so it deploys like any other merge.
