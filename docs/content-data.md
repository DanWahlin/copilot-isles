# Content data: the JSON files the game is built from

Some of what players read in the game is data, not code. It lives in JSON files in `content/`, so you
can change it without touching TypeScript, and the weekly refresh workflows can update it and check
it. Each file is part of the build: the game imports it, so a change reaches players with the next
deploy.

## The files

| File | What it controls | Who changes it | Loader (typed) |
| --- | --- | --- | --- |
| `content/market.json` | The Model Market: model categories (order, price, tagline), effort levels (label, price), the Auto price and the price cap, refunds and doubloons by job size, the board rule's numbers (`board.size`, `board.perFamily`), the stamps, the course quotes, the jobs on Gilda's board, and Gilda's lines | You, by hand | `src/content/market.ts` |
| `content/course-boards.json` | The course notice boards: which chapter each island's board shows, where it stands (`x`, `y`, `z`, `rot`), the header and pin text, and the `##` sections that aren't topics (`skip`) | You, by hand | `src/content/course-boards.ts` |
| `content/labels.json` | Chart labels: what you learn at an island, a puzzle or a sea battle (docs/specs/LOWER-THIRDS.md) | You, by hand | `src/learn/content/labels.ts` |
| `content/models.json` | The Model Market's model names, categories and task areas, from GitHub Docs | `npm run models:sync` (`models-refresh.yml`) | `src/game/market/models.ts` |
| `content/course.lock.json` | The bundled course snapshot: its commit and a hash for each section and image. The boards' topics come from it | `npm run course:sync` (`weekly-refresh.yml`) | `src/learn/course/lock.ts` |

Don't edit `models.json` or `course.lock.json` by hand: their sync scripts write them.

Each file has a JSON Schema in `content/schemas/`. The three hand-edited files name theirs in
`"$schema"`, so VS Code and other editors check your edit as you type and show each field's
description (`.vscode/settings.json` maps the two generated files to theirs). What isn't in these files stays in code on purpose: the grading rules
(`src/game/market/jobs.ts`), the board rule's order (`src/game/market/catalog.ts`), and all geometry
and puzzle logic.

### `content/market.json`

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
- **Gilda's lines** (`gilda.*`) have a `voice` (the line's id in `tools/voice/lines.testcove.json`), the
  `text` shown as her caption, and, for a teaching line, the course `source` it paraphrases (the drift
  report checks it).

### `content/course-boards.json`

- **`islands`**: one board an island. `chapter` must be in the course snapshot, and match the island's
  chapter on the chart. `y` is the ground (or deck) under the board, `rot` its yaw in radians.
- **Topics** aren't in this file: a board lists its chapter's `##` sections from the course lock, in the
  course's order, less `skip.anchors` and the headings that start with one of `skip.titlePrefixes`.
- **Text**: in `header` and `pins`, `{num}` is the chapter's number ("01") and `{title}` its title in the
  course. There are exactly two pins: the chapter's README (`"link": "chapter"`) and the course's home
  (`"link": "home"`).

## Voiced lines: change the audio too

A caption and its voice line must say the same words. If you change Gilda's `text` in
`content/market.json`:

1. Change the same line's `text` in `tools/voice/lines.testcove.json`.
2. Make the audio again: `npx tsx tools/voice/generate.ts --only=<ids>` (for example
   `--only=mer.market.hello`). This updates `public/voice/testcove/` and its `manifest.json`.
3. Commit the JSON, the lines file and the audio together.

Gilda's voice is ElevenLabs. ElevenLabs lines need the ElevenLabs CLI sign-in (`elevenlabs auth login`),
so you must run step 2 on your computer. The weekly course refresh makes Azure voice lines again by
itself when the Azure Speech secrets exist, but it skips ElevenLabs lines. Until the audio matches, the
content check fails with "the audio says something else" (docs/voices.md has every voice).

## Checks

```bash
npm run content:check   # every file against its schema, then the content checks; a report
npx vitest run src/content
```

`src/content/content.test.ts` (part of `npm test`, so CI runs it) fails on any issue, and
`npm run content:check` (tools/content/report.ts) prints them by file and JSON entry, with what to
change. The checks:

- every file in `content/` is valid against its schema (a small dev-only checker,
  `tools/content/json-schema.ts`; nothing is added to the game's bundle);
- every course quote is word for word in its cited section of the bundled snapshot
  (`public/course/**`), and every cited anchor and hash is in `content/course.lock.json` (quotes,
  Gilda's sources, chart labels);
- every Gilda line's `voice` is hers in `tools/voice/lines.testcove.json` with the same text, and its
  audio in `public/voice/testcove/manifest.json` says the same words;
- the economy: every hire costs 1 to `maxPrice` (≤ 4), bigger models cost more, a refund is never more
  than the hire, and every job can be done right-sized with the starfish on Anchorage and Meridian;
- every board's chapter is in the snapshot with at least 5 topics, and the board stands on its island
  (in its waters, on the ground or a deck up to 1 m above it);
- every category has a model in `content/models.json`, and no model is listed twice.

## How the workflows update and check the data

- **`weekly-refresh.yml`** (Mondays, when the course changes): syncs the course snapshot and
  `content/course.lock.json`, writes the drift report, then runs `npm run content:check` against the
  new snapshot. The PR, "Weekly refresh: course @ <sha>", shows each board's topics and what the sync
  added or removed, and lists each JSON entry that needs an edit (a quote that's no longer word for
  word, an anchor that's gone, a section whose hash changed). A broken entry labels the PR
  `needs-content-review`. Fix the entry on the PR's branch, and the checks pass again.
- **`models-refresh.yml`** (Mondays): runs `npm run models:sync`, then the same content check and the
  other checks, and opens "Weekly refresh: Copilot models" with the report.
- Nothing merges by itself: a person reviews and merges each PR.

## How a change reaches players

1. Edit the JSON on a branch (or let a weekly refresh PR do it) and open a PR.
2. CI (`ci.yml`) runs the checks, the content checks included.
3. Merge the PR. The merge is a push to `main`, so CI runs again.
4. When CI passes on `main`, **Deploy to GitHub Pages** (`pages.yml`) builds that commit and deploys it.
   You can still run it by hand ("Run workflow").

PRs that a workflow opens with `GITHUB_TOKEN` don't start CI themselves (each refresh workflow runs
the checks itself), but a person merging one makes a push that does, so it deploys like any other merge.
