# Spec: The Model Market (Port Meridian prototype)

> Status: **prototype on Port Meridian** (2026-10-16), for Dan's review before it rolls out to the other islands.
> Concepts: world B ("tavern-menu arcade") and UI 2 ("parchment work order").

## 1. Purpose

Starfish get a use, and Chapter 01's model and effort lesson gets practice. At Gilda's stall on Port Meridian's
plaza you pick a job from her board, hire a model (or **Auto**) and set the effort dial, and pay in starfish.
Bigger models cost more. The work order comes back stamped:

- **✓ Right-sized**: the hire fits the job. You get 1 starfish back (2 for a hard job) and, the first time for
  that job, 5 doubloons (10 for a hard job).
- **! Overspent**: the job got done, but you paid for more than it needed. No refund.
- **↻ Fell short**: the hire wasn't enough for a hard job. No refund. **Retry** it with a different model or more
  effort, without writing the job again (the course's Retry).

The market is **optional**: it never blocks the Seal of Meridian.

## 2. The stall in the world (concept B)

| What | Where (src) | Notes |
| --- | --- | --- |
| The stall | `src/world/meridian-town/model-market.ts` (`addModelMarketStall`), shapes in `market-shapes.ts`, built into the town's buckets | A warm sandstone loggia against the corner house on the plaza's east side, at the top of the stair street from the quay. Three round arches for the stall and a fourth as an open passage over the harbour-front lane; square piers in courses with plinths and capitals, voussoir rings with a keystone and a moulded archivolt, a cornice, an upper storey with four shuttered windows and window boxes, and a tiled gable roof (the plaza's `addTiledRoof`). The counter stands back under the arches behind a walkway with a timber ceiling. |
| Signboards | `src/world/sites/model-market.ts` (`createModelMarketSigns`), one `SignSet` | Three boards hang on chains from carved beams inside the arches, each a step higher: **Lightweight** (sage, 1.32 × 0.74 m, scalloped top), **Versatile** (blue, 1.86 × 1.0 m, scalloped top), **Powerful** (red, 2.6 × 1.42 m, a crest and a gilded frame). The shaped backings and carved frames are geometry; the faces are the sign atlas. Each says its category and price, the board rule's four names, and "+N more". Also: a small carved name plaque on the left pier, the chalk plaque **House special: Auto · 1 ★** on the counter's front, and four job notes on the cork board (✓ Done once a job's done right-sized). |
| Dressing | the stall | A red-and-white awning with a scalloped valance over the counter, a big glass jar of starfish (the collectible's own shape and colours) at the counter's front edge, a brass bell, a cork jobs board on posts, two iron lanterns (their glass is the glow material, warm by day too), shelves of turned bottles, jars and pots, a blue curtain, a blue-and-white cloth over the counter's end, two potted palms, a barrel, and a cypress in a stone planter. |
| Gilda | `src/game/meridian-npcs.ts` (`gilda`, body `mer_market`, 1.2× scale) | Behind the counter on a step. Headscarf, apron, money pouch. She has no bark: the counter's E opens the market, and the camera holds a square-on view of the stall (`site.shot`, like concept B's close-up). |

**Cost:** no new shader or material. The stall's parts are merged into the town's existing material chunks
(plaster, wood, cloth, metal, glow, roof tile, stone). The lettering is one sign atlas and one draw (the painted-sign
material the other sites use). About 14k triangles on High and 7.7k on Lite (Lite drops shelf pottery, chain links,
shutter slats and flowers, and uses fewer segments).

**Colliders:** the walls, piers, counter, barrel, pots and planter stop the walker; the wall over the arches, the
upper storey, the passage's lintel, the counter, the shelves and the cypress are camera blockers (not the boards or
the awning, so the follow camera never folds in at the counter). All come off with Meridian when it unloads (the town's colliders and the
island scope in `session.ts`).

**Reload:** the stall is part of the town, so it comes back with it. The signs and the counter are rebuilt in
`setupMeridian`. The jobs board's notes, the purse and the quest come from the save (`progress.market`,
`progress.starfishPurse`, `quests['Q1.A']`), never from scene objects.

## 3. Economy

| Hire | Starfish |
| --- | --- |
| **Auto** (house special) | 1 |
| Lightweight model | 1 |
| Versatile model | 2 |
| Powerful model | 3 |
| Effort Low / Default | +0 |
| Effort High | +1 (the price is capped at 4) |

- **Spendable starfish:** `progress.starfishPurse`. Each starfish you pick up adds 1 (and still pays its
  doubloons). The market takes from it. It never goes below 0: a hire you can't afford doesn't pay, and the
  button says "You need N starfish" with a hint to pick Auto or Lightweight (1 each).
- **Found counts don't change:** "found N of M" still counts the ids in `progress.starfish`.
- **Old saves:** a save from before the market gets one to spend for each starfish it had found.
- **The purse** shows the balance beside the island's found count: a jar with a starfish and "N to spend".
- Meridian has 5 starfish and Anchorage 7, so there's enough for every job, a few mistakes and Retries.

## 4. The model list (the weekly sync)

### 4.1 Source

`tools/models/sync.mjs` (`npm run models:sync`) reads two tables in [github/docs](https://github.com/github/docs)
at the head of `main`, over plain HTTPS from raw.githubusercontent.com (the commit comes from `git ls-remote`; no
token, no REST API):

- `data/tables/copilot/models-and-pricing.yml`: `model`, `provider`, `release_status`, `category`
  (Lightweight, Versatile or Powerful).
- `data/tables/copilot/model-comparison.yml`: `task_area`, `excels_at`.

It keeps **Claude, GPT and MAI** models only (`anthropic` + "Claude…", `openai` + "GPT…", `microsoft` +
"MAI-…"), one row per model (the pricing table has a row per price tier), and writes `courses/copilot-app/models.json`:

```json
{ "source": { "repo": "github/docs", "path": "data/tables/copilot", "commit": "<sha>", "fetchedAt": "<iso>" },
  "models": [{ "name", "provider", "family", "category", "taskArea", "excelsAt", "ga" }] }
```

Sorted by category (small to large), then name. **No prices:** the game's prices are starfish by category.
`ga` is false for a release status other than GA or "(preview)" in the name (kept, shown as "(preview)").
The file only changes when the models do: a new docs commit with the same models leaves it alone.
`--check` exits 1 if the file would change (no writes). `--from=<dir>` reads the two files from a folder.

The game imports `courses/copilot-app/models.json` at build time (`src/game/market/models.ts`), so a merged sync PR ships the
new names with the next deploy.

### 4.2 The board rule

Each signboard shows **4** models of its category (`boardFor` in `src/game/market/catalog.ts`):

1. Order the category's models: **GA first**, then **newest first** by the version number in the name (compared
   part by part: 6.1 > 6 > 5.6 > 5.5), then **alphabetically**.
2. Take GA models in that order, **at most 2 per family** (Claude, GPT, MAI), so a board mixes families where it
   can.
3. If there's still room, take the remaining GA models in order, then previews.
4. The board lists them in the step-1 order. The overlay shows every other model in the category behind
   **"+N more"**.

Today (github/docs `dae83f7`): Lightweight GPT-6 Luna, GPT-5.6 Luna, Claude Haiku 5.5, MAI-Code-1.1-Flash (+3);
Versatile GPT-5.6 Terra, Claude Sonnet 5.5, GPT-5.4, Claude Sonnet 5 (+3); Powerful GPT-6.1 Sol, GPT-6 Astra,
Claude Opus 5.5, Claude Fable 5.1 (+8).

### 4.3 A model that leaves the list

A hire is saved as its category and name (`MarketHire`). If the name isn't in `courses/copilot-app/models.json` any more, the
save still loads and the game calls it "a Powerful model" (`savedHireName`).

### 4.4 The workflow

`.github/workflows/models-refresh.yml` runs `npm run models:sync` every Monday (the course refresh's schedule) and
on demand. If `courses/copilot-app/models.json` changed, it runs the checks (the content check, typecheck, lint, format, unit
tests, build, budgets, secrets) and opens or updates **one PR**, "Weekly refresh: Copilot models". Nothing auto-merges. It uses
only `GITHUB_TOKEN` (the repository setting "Allow GitHub Actions to create and approve pull requests" is already
needed by the course refresh). It's a separate workflow because the course refresh only runs when the course
changes.

**Deploying:** merging the PR deploys it. The merge's push to `main` runs CI, and when CI passes, `pages.yml`
builds that commit and deploys it (it can still be run by hand).

## 5. Jobs and grading (Chapter 01 · Models and Reasoning Effort)

| Job (key) | Size | The course sentence on the work order |
| --- | --- | --- |
| 1 · Give the new deckhand a tour of the repo | Quick look | "For a repository tour or a short explanation, keep **Auto** or the current model and its default reasoning effort." (Models and Reasoning Effort) |
| 2 · Explain how filterBooks searches | Quick look | "Keep the default for this simple question." (Try the Controls) |
| 3 · Track down a difficult bug in the book app | Hard job | "For a difficult bug or a change across several files, consider a model suited to complex coding and a higher effort level." (Models and Reasoning Effort) |
| 4 · Change the book app across several files | Hard job | The same sentence. |

**Grading** (`grade` in `src/game/market/jobs.ts`):

| Job | Right-sized | Overspent | Fell short |
| --- | --- | --- | --- |
| Quick look | Auto; Lightweight on Low or Default | Versatile or Powerful (any effort); Lightweight on High | never |
| Hard job | Powerful on Default or High; Versatile on High | never | Auto (its effort is hidden); Lightweight (any); Versatile on Low or Default; Powerful on Low |

Each outcome quotes the course word for word (a unit test finds every quote in `courses/copilot-app/public/course/ch01/README.md`):

- Overspent: "Models differ in capabilities, speed, and usage cost." or "Higher effort can help with complex
  problems, but can take longer.", and the job's sentence.
- Fell short: the hard-job sentence and "If the agent's response doesn't work for you, you can retry it with a
  different model or reasoning effort without re-typing your prompt." (Try Again with a Different Model). After
  Auto: "If the **Auto** switch is on, these settings are hidden. Turn it off to see them."
- Right-sized: the job's sentence (and, after Auto, the course's description of Auto); a hard job also gets
  "Higher effort does not guarantee a correct answer."

**Auto** is explained with the course's words: the app chooses a model and shows which one it picked and why, and
it's different from **Autopilot**.

**Retry** (only after Fell short) starts a new work order for the same job, which you can still change: "a
different model" moves to a Powerful model (a model suited to complex coding; Low becomes Default), "more effort"
keeps the model on High. After Auto: Powerful on Default, or Versatile on High. A Retry is a new hire (it costs
starfish), but you don't pick the job again.

All the quotes are in `CH01.cited` (`market.job.*`, `market.quote.*`) and Gilda's teaching lines in `CH01.voiced`
(from their `source` in `courses/copilot-app/market.json`), so the drift report flags them if the course moves on.

**The data is JSON:** the jobs, the prices, refunds and doubloons, the effort levels, the board rule's numbers, the
stamps, the course quotes and Gilda's lines are in `courses/copilot-app/market.json` ([content-data.md](../content-data.md)),
checked against `courses/schemas/market.schema.json`. The grading above stays in code (`src/game/market/jobs.ts`).

## 6. The overlay (UI 2, `src/ui/puzzles/ModelMarket.tsx`)

A parchment work order (the chart label's `paper.webp`, 9-sliced) with three screens:

1. **The board:** the three categories with their size marks (■□□ ■■□ ■■■), prices, the board's names and
   "+N more"; the House special; the jobs board (1-4).
2. **The hire:** the work order and what the course says; **1 · Pick a model** (Auto, Lightweight, Versatile,
   Powerful, then a name with its task area from GitHub Docs); **2 · Set the effort dial** (a gauge, and Low,
   Default, High; hidden with Auto, as in the app); the tally and your purse; **Sign & pay**.
3. **The result:** the stamp, what happened, what Gilda says, the course's sentences, the refund, and **Got it**
   or **Retry: a different model** / **Retry: more effort**.

**Input:** keyboard (1-4, arrows or WASD, E/Enter/Space, R for a Retry, Esc back or away), gamepad (D-pad, A,
B, X for Retry, LB/RB for the model pick), touch and mouse (every target ≥ 44 px). The press that opens it doesn't
act in it (`PadEdges.arm`). While a learning overlay (the Logbook, the fork form) is up, the market leaves the
keys and the pad alone; J waits until you step away. Learning overlays stack above it.

**Accessibility:** text ≥ 16 px at 1080p; colour is never the only cue (names, size marks, prices, stamp words and
symbols); an `aria-live` region reads each screen and each outcome; reduced motion (the setting or the system)
drops the stamp and the needle's movement and cuts the camera instead of flying it. Gilda's line is written on
the work order while she says it (the HUD's caption steps aside for it). Phones: a bottom sheet in one column
(portrait) or a short sheet with three board columns (landscape).

## 7. Quest flow

- Gilda calls out the first time you come within 9 m of her counter (once per save) and the optional task
  **The Model Market: Hire a model that fits the job** joins the Meridian task list (`Q1.A`, optional).
- The chart label `puzzle:market` shows the first time you stand at the counter.
- The first right-sized job files the Logbook page **The Model Market** (`pg1.market`).
- Every job done right-sized finishes `Q1.A`. The Seal never waits for it.

## 8. Voice

Gilda: ElevenLabs Voice Library "Harriet – British Actress" (`aAsWcN5jdLdiYG7Hq0YL`), British English, an
older woman with a refined, brisk shopkeeper's manner. Lines `mer.market.*` in `courses/copilot-app/voice/lines.json`.

## 9. Tests

- `src/game/market/market.test.ts`: the sync's parsing and filtering (fixture in `tools/models/fixtures/`), the
  board rule, `courses/copilot-app/models.json`, prices, every job's grades, refunds, Retry, the purse (earn, spend, never
  below 0, old-save migration), saved hires (a model that left the list), and that every quote is the course's.
- `src/content/content.test.ts`: `courses/copilot-app/market.json` against its schema; every quote word for word in its
  cited section of the snapshot, every anchor and hash in the lock; Gilda's captions the same as her voice lines
  and their audio; the economy (prices 1-4, bigger models cost more, a refund never more than the hire, enough
  starfish on Anchorage and Meridian for every job); and that broken edits are reported by entry.
- `src/learn/content/labels.test.ts`, `src/learn/course/refs.test.ts`: the label and every citation.
- `src/game/meridian-quests.test.ts`: the optional task.
- `tools/meridiantest.mjs`: plays the market with real keys (a quick job right-sized, one overspent, a hard job
  that falls short then a Retry), reloads Meridian and checks the save and the notes.
- `tools/video/scenarios/model-market.mjs`: a video scenario (setup and play).

## 10. Open questions for Dan

- Roll out to the other islands: one stall per island with the same boards (the economy and the sync are shared),
  or one market only?
- ~~Deploy on merge~~: done. `pages.yml` deploys when CI passes on a push to `main` (docs/content-data.md).
