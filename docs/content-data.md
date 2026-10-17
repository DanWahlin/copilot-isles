# Content data: the course packs the game is built from

Everything a course says in the game is data, not code. It lives in a **course pack**, one folder per
course in `courses/` ([COURSE-PACKS.md](specs/COURSE-PACKS.md)), so you can change it without touching
TypeScript, and the weekly refresh workflows can update it and check it. Each pack is part of the
build: a change reaches players with the next deploy.

Today there's one pack, `courses/copilot-app/` (the GitHub Copilot app for Beginners course).

## The files

| File (in `courses/<id>/`) | What it controls | Who changes it | Loader (typed) |
| --- | --- | --- | --- |
| `course.json` | The course's id, title, tagline, description and language; its source (repository, license, copyright, chapters); the islands it uses (each one's chapter, chart label, minutes, Seal, topics, and arrival-card lines); its practice values (issue, branch, repository name) | You, by hand | `src/course/catalog.ts` |
| `chapters/<chapter>.json` | A chapter's course images, quizzes, Logbook pages, chests, glossary terms, Trials, and the course sections voiced (`voiced`) and unvoiced (`cited`) teaching lines paraphrase ([course-content-authoring.md](course-content-authoring.md)) | You, by hand | `src/learn/content/index.ts` |
| `quests/<island>.json` | An island's quests (title, task, link, what each step says), the tracker's header, where the compass points for each step, every named script its NPCs and puzzles play, and its NPCs' barks | You, by hand | `src/course/active.ts`, `src/game/*-quests.ts` |
| `labels.json` | Chart labels: what you learn at an island, a puzzle or a sea battle (docs/specs/LOWER-THIRDS.md) | You, by hand | `src/learn/content/labels.ts` |
| `boards.json` | The course notice boards' header and pin text, and the `##` sections that aren't topics | You, by hand | `src/content/course-boards.ts` |
| `market.json` | The Model Market: model categories (order, price, tagline), effort levels (label, price), the Auto price and the price cap, refunds and doubloons by job size, the board rule's numbers (`board.size`, `board.perFamily`), the stamps, the course quotes, the jobs on Gilda's board, and Gilda's lines | You, by hand | `src/content/market.ts` |
| `models.json` | The Model Market's model names, categories and task areas, from GitHub Docs | `npm run models:sync` (`models-refresh.yml`) | `src/game/market/models.ts` |
| `lock.json` | The bundled course snapshot: its commit and a hash for each section and image. The boards' topics come from it | `npm run course:sync` (`weekly-refresh.yml`) | `src/learn/course/lock.ts` |
| `voice/lines.json` | Every voice line: id, speaker, engine, voice and text (the caption) | You, by hand ([voices.md](voices.md)) | `tools/voice/generate.ts` |
| `public/course/**` | The course snapshot: READMEs, `GLOSSARY.md`, `LICENSE`, and the images the chapters show | `npm run course:sync` | `src/learn/course/source.ts` |
| `public/voice/**` | Each line's audio (`.webm`, `.m4a`), word timings (`.json`), `manifest.json` and `lipsync.json` | `tools/voice/generate.ts`, `npm run voice:lipsync` | `src/audio`, `src/game/dialogue.ts` |

Don't edit `models.json`, `lock.json`, the snapshot or the voice files by hand: their tools write them.

What the game owns stays in code on purpose: the islands and their art, the characters (names,
looks, where they stand), where each notice board stands (`src/world/islands/course-boards.ts`), the
grading rules (`src/game/market/jobs.ts`), the board rule's order (`src/game/market/catalog.ts`), and
all geometry and puzzle logic. Which script an NPC offers when, island gating, the lines the game
itself asks for (island tips, welcomes, the cabin briefing, battle questions), and puzzle content are
still TypeScript until step 2 of [COURSE-PACKS.md](specs/COURSE-PACKS.md) (they're marked there).

### How the game loads a pack

- **The title** reads only each pack's `course.json` (`src/course/catalog.ts`): the tagline, the
  credits, the chart's chapters and topics, the arrival cards, the practice values.
- **A voyage** (New Voyage or Continue) loads the rest (`src/course/load.ts`): Vite builds every JSON
  file of a pack, but `course.json` and `voice/`, into one lazy chunk, `course-<id>` (≤ 80 KB gz,
  `tools/budgets.json`). It loads behind the cabin, beside the island's code, and the pack is active
  before the session reads any of it.
- **The snapshot and the voice** are static files, served as `<base>courses/<id>/` (`course/…`,
  `voice/…`) from the pack's `public/` folder: `vite.config.ts` serves it in dev and copies it into
  `dist/courses/<id>/` for the build, so a sub-path deploy (GitHub Pages) works.
- **In code**, read pack data through `src/course/active.ts` (`coursePack()`, `courseScript()`,
  `barksFor()`) or keep what you derive from it in an `onCourse` hook, never at module top level: a
  module may load before the pack does. Node tools read a pack with `tools/course-pack/read.ts`
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
- **`practice`**: the course's own example values, shown until the player gives theirs (Your setup).

### `chapters/<chapter>.json` and `quests/<island>.json`

- A chapter file is named after its `chapter`; a quests file after its `island`.
- **Scripts** are the steps `src/game/script.ts` runs: `say` (a voice line), `text`, `show`/`hide` (a
  course image in the spyglass), `quiz`, `page`, `file`, `term`, `quest`, `trial`, `cue`, `askFork`,
  `askSetup`. A `{ "script": "<name>" }` step splices in another script of the same island. `notes`
  says what each script is for; the game ignores it.
- **Ids are saved in players' progress** (quests and their steps, pages, chests, quizzes, glossary
  terms, Trials, labels, market jobs): don't rename them.

### `market.json`

- **Prices** are starfish. `categories[].price` must go up from Lightweight to Powerful. A hire costs
  its category's price plus its effort's price, up to `maxPrice` (at most 4). Auto costs `autoPrice`.
- **Refunds** (`sizes.quick.refund`, `sizes.hard.refund`) are paid for a right-sized hire. A refund
  can't be more than the cheapest right-sized hire for that size, so a hire never makes starfish.
- **Doubloons** (`sizes.*.doubloons`) are paid the first time a job is done right-sized.
- **`board`**: how many model names each signboard shows, and how many of one family it takes before
  it fills up (docs/specs/MODEL-MARKET.md §4.2).
- **Quotes** are course sentences, word for word (`**bold**` included), with the section they're from:
  `chapter`, `anchor` and `hash`. Get the anchor and hash from `npm run course:refs -- 01`. The overlay
  shows the section's title from the course lock. The keys the grading uses (`cost`, `effort`,
  `hard`, `noGuarantee`, `auto`, `autopilot`, `autoHidden`, `retry`) must stay.
- **Jobs** (at most four: the cork board has four spots) name a quote key in `why`. A job's `id` is
  saved in players' progress, so don't rename it.
- **Gilda's lines** (`gilda.*`) have a `voice` (the line's id in the pack's `voice/lines.json`), the
  `text` shown as her caption, and, for a teaching line, the course `source` it paraphrases (the drift
  report checks it).

### `boards.json`

- **Which chapter** each island's board shows is the island's `chapter` in `course.json`; **where** it
  stands is the game's (`src/world/islands/course-boards.ts`).
- **Topics** aren't in this file: a board lists its chapter's `##` sections from the course lock, in the
  course's order, less `skip.anchors` and the headings that start with one of `skip.titlePrefixes`.
- **Text**: in `header` and `pins`, `{num}` is the chapter's number ("01") and `{title}` its title in the
  course. There are exactly two pins: the chapter's README (`"link": "chapter"`) and the course's home
  (`"link": "home"`).

## Voiced lines: change the audio too

A caption and its voice line must say the same words. If you change a voiced line's text (in a
script's line, or Gilda's `text` in `market.json`):

1. Change the same line's `text` in the pack's `voice/lines.json`.
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
  Trials, images, quest steps, other scripts); the compass's quest steps; the islands and chapters
  `course.json` names; the NPCs given barks (the game's cast);
- every voice line a script, a chapter or the market plays is in `voice/lines.json`, and its audio in
  `public/voice/manifest.json` says the same words; Gilda's lines are hers;
- the economy: every hire costs 1 to `maxPrice` (≤ 4), bigger models cost more, a refund is never more
  than the hire, and every job can be done right-sized with the starfish on Anchorage and Meridian;
- every board's chapter is in the snapshot with at least 5 topics, and every board stands on its island
  (in its waters, on the ground or a deck up to 1 m above it);
- every category has a model in `models.json`, and no model is listed twice.

`src/learn/course/refs.test.ts` checks the snapshot against the lock section by section, and every
`SourceRef` and course image against them.

## How the workflows update and check the data

Both workflows follow one pack, `COURSE` at the top of the workflow (today `copilot-app`).

- **`weekly-refresh.yml`** (Mondays, when the course changes): syncs the pack's snapshot and
  `lock.json` (`tools/course/sync.mjs --course`), writes the drift report, then runs
  `npm run content:check` against the new snapshot. The PR, "Weekly refresh: course @ <sha>", shows each
  board's topics and what the sync added or removed, and lists each JSON entry that needs an edit (a
  quote that's no longer word for word, an anchor that's gone, a section whose hash changed). A broken
  entry labels the PR `needs-content-review`. Fix the entry on the PR's branch, and the checks pass
  again.
- **`models-refresh.yml`** (Mondays): runs `npm run models:sync -- --course=<id>`, then the same content
  check and the other checks, and opens "Weekly refresh: Copilot models" with the report.
- Nothing merges by itself: a person reviews and merges each PR.

## How a change reaches players

1. Edit the JSON on a branch (or let a weekly refresh PR do it) and open a PR.
2. CI (`ci.yml`) runs the checks, the content checks included.
3. Merge the PR. The merge is a push to `main`, so CI runs again.
4. When CI passes on `main`, **Deploy to GitHub Pages** (`pages.yml`) builds that commit and deploys it.
   You can still run it by hand ("Run workflow").

PRs that a workflow opens with `GITHUB_TOKEN` don't start CI themselves (each refresh workflow runs
the checks itself), but a person merging one makes a push that does, so it deploys like any other merge.
