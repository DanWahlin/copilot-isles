# Adding a course

The game is the same for every course. A **course pack** (`courses/<id>/`) holds everything a course
says: its chapters, quests, NPC lines, quizzes, puzzle content, signs and voice lines
([COURSE-PACKS.md](specs/COURSE-PACKS.md), [content-data.md](content-data.md)). This page is the
shortest path to a new one. `courses/copilot-cli/` is the small example to copy: one island
(Anchorage Cay), one chapter, captions only.

## 1. Check the license

Only use a course whose license lets you copy and adapt it (both courses today are MIT © GitHub). Add its
notice to `THIRD_PARTY_NOTICES.md` and a row for its snapshot to `ASSETS.md`.

## 2. Make the pack

```bash
cp -R courses/copilot-cli courses/<id>
rm -rf courses/<id>/public courses/<id>/lock.json
```

Then edit, in `courses/<id>/`:

- **`course.json`**: `id` (the folder's name), `title`, `tagline`, `description`, `language`;
  `source` (`kind: "github"`, `repo`, `ref`, `license`, `copyright`, and every chapter folder with its
  `short` name and title); `islands` (each island you use, its chapter, chart label, minutes, topics and
  arrival lines); `"voice": false` for captions only; `hooks` (the cabin briefing, each island's welcome
  and tips, the sailing line).
- **`chapters/<chapter>.json`**: at least a page, a quiz, a glossary term and a Trial (the Seal), and
  a chest for each chest and bottle the game places on your islands (Anchorage: `C0.1` beside Nell,
  bottles `B0.1`–`B0.4`; those ids are the game's spots, what's in them is yours).
- **`quests/anchorage.json`**: the quests (any ids you like), a script for each quest-giving NPC,
  `beats` (who says what, when), barks and the `story`: which of your quests each condition and event
  the game asks for means (`firstVisit`, `trialStarted`, `sealed`, `gangwayDown`; `landed`, `setSail`).
  The CLI pack shows the shape.
- **`puzzles/<name>.json`**: content for each Anchorage puzzle the course can teach honestly, with the
  `quest` it plays in (that quest needs the steps the puzzle sets and waits on, `PUZZLE_STEPS` in
  `src/course/puzzles.ts`, under the same names or the ones you map them to in `steps`, and every
  quest ends at `done`, which can't be renamed), or `"disabled": true` (the site stays scenery).
  Name things with your own ids; where a puzzle acts a concept out, bind each of yours to the game's
  with `"acts"` (the crane's cargo, the helms' modes…: [content-data.md](content-data.md)).
- **`labels.json`**, **`boards.json`**, **`voice/lines.json`** (every line's id, speaker and text).
- Leave out `market.json` and `models.json` unless the course teaches models, and `voice/cast.json` for a
  text-only pack.
- **Optional, for the learning systems** ([content-data.md](content-data.md), COURSE-PACKS.md §11):
  `learning.json` (the steps a learner takes in the real tool, handed off from your scripts with
  `{ "appTask": "<id>" }` on a card with **I did it** and **Later**; each chapter's learning objectives,
  quoted, with what covers them, for the Logbook's Course map; a reflection before each Seal; the
  Logbook's line for a quest whose app part isn't confirmed yet), and `course.json` → `recap` for
  Wingman's spaced recap of the quizzes a player has met. Without them the game has no app cards,
  checklist, map or recap for the course, and nothing breaks. Where a task leaves public evidence on
  GitHub (a fork, a branch, a pull request), give it a `check`: players who opt in can confirm it
  without a token.

**Teaching accuracy:** every teaching line cites its course chapter and section. Don't invent commands,
flags or UI names: use only what the course says. Player copy uses friendly contractions.

## 3. Snapshot, captions and checks

```bash
node tools/course/sync.mjs --course=<id> --chapters=00     # snapshot + lock.json
npm run course:refs -- 00 --course=<id>                    # anchors and hashes to cite
npx tsx tools/voice/generate.ts --course <id>              # captions (text-only) or audio (voiced)
npm run content:check -- --course=<id>
npx tsx tools/course/drift.ts --course=<id> --previous=courses/<id>/lock.json --report=<dir> --out=<dir>/drift.md
```

The drift report lists bolded UI names you used that the chapter doesn't mention: fix each one.

## 4. Wire it in

- Add one line to `COURSES` in `src/course/catalog.ts` (import its `course.json`).
- Add `course-<id>` (≤ 80 KB gz) to `tools/budgets.json`.
- `npm run build` writes the service worker's allow-list from every pack's `source.repo`; the weekly
  refresh picks the pack up by itself (`tools/course-pack/list.mjs`).

## 5. Test it

```bash
npm run typecheck && npm run lint && npm test
npm run build && npm run check:budgets && npm run check:secrets
npm run test:e2e                                           # tests/e2e/courses.spec.ts plays each course
```

In the dev server, `play.html?pack=<id>` opens the pack on Anchorage. Keep `"listed": false` in its
`course.json` until it's ready: players won't see it, and `?courses=all` on the title lists it for you.
Remove the flag (and add the course to `tests/e2e/courses.spec.ts`'s listed run) to ship it. Each course has its own save (`copilot-isles.<id>.save.v1`).

## What a course can't change yet

The islands, characters and puzzle mechanics are the game's, and so are the story's names (what the
game asks each island), the steps each puzzle sets and the ids its mechanic acts out. Your quest ids,
their order and steps, and every id you bind to the game's, are yours. A course that needs something the game doesn't ask for (a new story condition, a puzzle with a
new mechanic) needs code first: see "Still course-specific in code after step 5" in
[COURSE-PACKS.md](specs/COURSE-PACKS.md).
