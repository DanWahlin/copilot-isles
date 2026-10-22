# Spec: The Model Market

> Status: **a stall on every island** (2026-10-22): Gilda's on Port Meridian (the prototype of 2026-10-16),
> Desmond's on Anchorage Cay and Lani's on Thousand-Bough Isle, sharing one board, one purse and one save.
> Concepts: world B ("tavern-menu arcade") and UI 2 ("parchment work order").

## 1. Purpose

Starfish get a use, and Chapter 01's model and effort lesson gets practice. At any island's market stall
(Gilda's on Port Meridian's plaza, Desmond's on Anchorage Cay's quay, Lani's on Thousand-Bough's landing) you
pick a job from the board, hire a model (or **Auto**) and set the effort dial, and pay in starfish. Bigger models
cost more. The work order comes back stamped:

- **✓ Right-sized**: the hire fits the job. A hard job gives 2 starfish back (a quick look none: its fair
  hire is 1), and the first time for that job, 5 doubloons (10 for a hard job). A refund is always less than
  the hire, so a right-sized job always costs at least 1 starfish.
- **! Overspent**: the job got done, but you paid for more than it needed. No refund.
- **↻ Fell short**: the hire wasn't enough for a hard job. No refund. **Retry** it: the same job, without writing
  it again (the course's Retry), and you choose the different model or the higher effort yourself.

Every stall sells the same jobs from the same purse, and saves to the same place (`progress.market`): a job done
at one stall is done at all of them, and the starfish you have are the same wherever you are. The market is
**optional**: it never blocks an island's Seal.

## 2. The stalls in the world (concept B)

The stalls are island data (each island's package) built from shared, data-driven parts:

| What | Where (src) | Notes |
| --- | --- | --- |
| The stalls and their keepers | `src/game/market/stalls.ts` (`MARKET_STALLS`) | One per island: its island, its puzzle id (`market` for the story's, `market@<island>` for the others), its keeper (their cast id and name) and whether it's the story's (Gilda's, which runs `Q1.A`). |
| Shared parts | `src/world/market-stall/` | `layout.ts` (a stall's frame and `MarketStallLayout`: boards, plaques, cork board and notes, keeper's spot, your spot, the counter camera), `parts.ts` (the hanging boards and chains, the plank counter and plaque frame, the starfish jar and bell, the striped awning, the shelves and curtain, the cork jobs board, the lanterns, `placeStall`), `shapes.ts` (arches, board outlines and frames, turned pots), and `booth.ts` (an open timber booth round those parts, `BOOTH_LAYOUT`, for an island without an arcade: the island gives its colours, roof and dressing). |
| Gilda's stall | `src/world/meridian-town/model-market.ts` | Port Meridian's loggia (below), on the shared parts. |
| Desmond's stall | `src/world/islands/anchorage/model-market.ts` (`ANCHORAGE_MARKET`) | A booth at the east end of Anchorage's quay, between the harbourmaster's and the storehouse, its front to the pier: the village's dark timber under a blue-and-canvas striped canopy like the square's stall, a coral-and-cream awning over the counter, crates of fruit and a cask on its right (its left is the quay's edge). No lanterns of its own: the quay's lamp posts light it, and the village's ironwork stays one draw. Built into the village's buckets (`createVillage`). |
| Lani's stall | `src/world/islands/thousand-bough/village/model-market.ts` (anchor `modelMarket`) | A booth in Bough Landing's south-east corner, its back to the rail and its front to the deck, beside you as you step off the Root Wharf and clear of the sister tree's limbs: the tree village's weathered teak, a thatched hip roof like the boathouse's, a leaf-green and cream awning, two lanterns and a potted palm. Built into the tree village's buckets. The course notice board moved north along the east rail for it (`course-boards.ts`). |
| Keepers | `src/game/npcs.ts` (`desmond`, body `an_market`), `src/game/thousand-bough-npcs.ts` (`lani`, body `tb_market`), `src/game/meridian-npcs.ts` (`gilda`, `mer_market`) | Each from the NPC kit, distinct from their island's cast, in the keepers' apron and money pouch: Desmond (Henry's rig, a teal flat cap and a cream and teal apron), Lani (Anne's rig, a sun hat with a teal ribbon and a cream and green apron). Behind the counter on a step; no bark (the counter's E is the way to talk shop). A course without the market leaves them out. |
| Signs | `src/world/sites/model-market.ts` (`createModelMarketSigns`) | Every stall's lettering from its layout: the boards, the name plaque ("Desmond's Model Market"), the House special plaque and the job notes. |

Gilda's stall:

| What | Where (src) | Notes |
| --- | --- | --- |
| The stall | `src/world/meridian-town/model-market.ts` (`addModelMarketStall`), shapes in `market-shapes.ts`, built into the town's buckets | A warm sandstone loggia against the corner house on the plaza's east side, at the top of the stair street from the quay. Three round arches for the stall and a fourth as an open passage over the harbour-front lane; square piers in courses with plinths and capitals, voussoir rings with a keystone and a moulded archivolt, a cornice, an upper storey with four shuttered windows and window boxes, and a tiled gable roof (the plaza's `addTiledRoof`). The counter stands back under the arches behind a walkway with a timber ceiling. |
| Signboards | `src/world/sites/model-market.ts` (`createModelMarketSigns`), one `SignSet` | Three boards hang on chains from carved beams inside the arches, each a step higher: **Lightweight** (sage, 1.32 × 0.74 m, scalloped top), **Versatile** (blue, 1.86 × 1.0 m, scalloped top), **Powerful** (red, 2.6 × 1.42 m, a crest and a gilded frame). The shaped backings and carved frames are geometry; the faces are the sign atlas. Each says its category and price, the board rule's four names, and "+N more". Also: a small carved name plaque on the left pier, the chalk plaque **House special: Auto · 1 ★** on the counter's front, and four job notes on the cork board (✓ Done once a job's done right-sized). |
| Dressing | the stall | A red-and-white awning with a scalloped valance over the counter, a big glass jar of starfish (the collectible's own shape and colours) at the counter's front edge, a brass bell, a cork jobs board on posts, two iron lanterns (their glass is the glow material, warm by day too), shelves of turned bottles, jars and pots, a blue curtain, a blue-and-white cloth over the counter's end, a barrel, and the plaza's planting kit in Meridian's colours: a fan palm in a big terracotta pot at each end of the counter with a pot of geraniums before it, and a fan palm in a mound of geraniums in the stone planter by the passage. |
| Gilda | `src/game/meridian-npcs.ts` (`gilda`, body `mer_market`, 1.2× scale) | Behind the counter on a step. Headscarf, apron, money pouch. She has no bark: the counter's E opens the market, and the camera holds a square-on view of the stall (`site.shot`, like concept B's close-up). |
| Keeper's light | the market (`MarketHost.spotlight`) | While you're at the counter (within 6 m, or with the work order open), the keeper gets the talk shot's light (`setSpotlight`: a soft key from the camera's side and a rim, at full detail), as anyone you talk to does: in the walkway's shade Gilda's face read flat, lit by the sky alone. |
| Paving | `src/world/village/materials.ts` (`withSunBounce`) | Paving in shade takes a share of the sun's colour (the light sunlit walls and ground bounce into a street), so the plaza's floor stays warm under the sandstone at golden hour: lit by the sky dome alone it read a cool blue. Every island's paving (the kit's one material), no new shader. |

**Cost:** no new shader or material. The stall's parts are merged into the town's existing material chunks
(plaster, wood, cloth, metal, glow, roof tile, stone). The lettering is one sign atlas and one draw (the painted-sign
material the other sites use). About 14k triangles on High and 7.7k on Lite (Lite drops shelf pottery, chain links,
shutter slats and flowers, and uses fewer segments).

**Colliders:** the walls, piers, counter, barrel, pots and planter stop the walker; the wall over the arches, the
upper storey, the passage's lintel, the counter, the shelves and the cypress are camera blockers (not the boards or
the awning, so the follow camera never folds in at the counter). All come off with Meridian when it unloads (the town's colliders and the
island scope in `session.ts`).

**Reload:** a stall is part of its island's town, so it comes back with it. The signs and the counter are rebuilt
with the island's setup (`setupMeridian`; Anchorage's with the session, sleeping with its cast while the island's
dormant; Thousand-Bough's after `tb.setup`, taken down with it). The jobs board's notes, the purse and the quest
come from the save (`progress.market`, `progress.starfishPurse`, `quests['Q1.A']`), never from scene objects.

**The other stalls' cost:** the booths add no material or shader either (wood, cloth, plaster, metal, glow and
thatch, each island's existing chunks). Desmond's adds ~6k triangles on High (no lanterns, rods for the chains,
so Anchorage's ironwork stays in one 24k chunk) and Lani's ~5.7k (3.9k on Low and Lite); each stall's lettering is one more sign atlas
and draw, and each keeper one more character (a palette, no new shader).

## 3. Economy

| Hire | Starfish |
| --- | --- |
| **Auto** (house special) | 1 |
| Lightweight model | 1 |
| Versatile model | 2 |
| Powerful model | 3 |
| Effort Low / Default | +0 |
| Effort High | +1 (the price is capped at 4) |

- **Refunds:** `refundFor` (`src/game/market/jobs.ts`) pays a right-sized hire its size's refund
  (`sizes.*.refund` in `market.json`: quick 0, hard 2), but never more than the hire less one: a right-sized job
  always costs at least 1 starfish. The content check fails a refund that isn't less than the cheapest
  right-sized hire for its size.
- **Spendable starfish:** `progress.starfishPurse`. Each starfish you pick up adds 1 (and still pays its
  doubloons). The market takes from it. It never goes below 0: a hire you can't afford doesn't pay, and the
  button says "You need N starfish" with a hint to pick Auto or Lightweight (1 each).
- **Found counts don't change:** "found N of M" still counts the ids in `progress.starfish`.
- **Old saves:** a save from before the market gets one to spend for each starfish it had found.
- **The purse** shows the balance beside the island's found count: a jar with a starfish and "N to spend".
- Anchorage has 7 starfish, Meridian 5 and Thousand-Bough 5. Every job at its fair hire costs 8 starfish and gets
  4 back (net 4); spent in the best order you need 4 to start, so the first island's stall (Anchorage's) can
  clear the board with its own starfish, and a few mistakes and Retries besides. The content check runs those
  sums on the course's first island (`marketPurseNeeded`).

| The economy | Before (2026-10-16) | Now |
| --- | --- | --- |
| Refunds (quick, hard) | 1, 2 | 0, 2 (and never the whole hire) |
| A right-sized quick job (Auto or Lightweight) | 1 paid, 1 back: free | 1 paid, none back: 1 |
| A right-sized hard job (Powerful on Default; Versatile on High) | 3 paid, 2 back: 1 | the same: 1 |
| Every job at its fair hire | 8 paid, 6 back: net 2 | 8 paid, 4 back: net 4 |
| Starfish to start with (best order) | 4 | 4 |
| The economy check | 8 ≤ 12 (Anchorage and Meridian) | 4 ≤ 7 (the course's first island) |
| Broke (0 starfish) | the keeper's "No starfish?" line; nothing to hire | the same; with 1 starfish a quick job is still right-sized (and leaves 0) |

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

**Retry** (only after Fell short) opens the work order for the same job (you don't write it again), with the picker
it's about live and **nothing chosen in it**, so you choose the different model or the effort yourself (`retryPlan`,
`usedLastTime`, `effortLastTime`, `retryChanges` in `jobs.ts`):

- **Retry: a different model** (R, X on a pad): no model picked; the model that fell short is marked "Last
  time" and can't be picked again (its category's other models can, and Auto can). The effort stays as it was.
- **Retry: more effort** (E, A on a pad): the same model, the effort dial live with nothing chosen, last time's
  effort marked "Last time" (and not taken again on that model). The model picker stays open too.
- **After Auto**, either Retry turns Auto off, and the model picker is live (Auto's marked "Last time").

Until you've chosen, the work order shows "Choose a model" (or "Choose an effort") in the tally, the button says
**Choose a different model** (or **Choose an effort**) and signing does nothing but say so; the live picker has
the keyboard's focus (and a dashed frame), and a screen reader hears "Retry: choose a different model". A Retry is
a new hire (it costs starfish). Wingman's hint on a Retry says how to choose, never what (no glow).

All the quotes are in `CH01.cited` (`market.job.*`, `market.quote.*`) and Gilda's (and the keepers') teaching lines
in `CH01.voiced` (from their `source` in `courses/copilot-app/market.json`), so the drift report flags them if the
course moves on.

**The data is JSON:** the jobs, the prices, refunds and doubloons, the effort levels, the board rule's numbers, the
stamps, the course quotes, Gilda's lines and the other keepers' hello and goodbye (`keepers`, by island) are in `courses/copilot-app/market.json` ([content-data.md](../content-data.md)),
checked against `courses/schemas/market.schema.json`. The grading above stays in code (`src/game/market/jobs.ts`).

## 6. The overlay (UI 2, `src/ui/puzzles/ModelMarket.tsx`)

A parchment work order (the chart label's `paper.webp`, 9-sliced) with three screens:

1. **The board:** the three categories with their size marks (■□□ ■■□ ■■■), prices, the board's names and
   "+N more"; the House special; the jobs board (1-4).
2. **The hire:** the work order and what the course says; **1 · Pick a model** (Auto, Lightweight, Versatile,
   Powerful, then a name with its task area from GitHub Docs); **2 · Set the effort dial** (a gauge, and Low,
   Default, High; hidden with Auto, as in the app); the tally and your purse; **Sign & pay**.
3. **The result:** the stamp, what happened, what the keeper says, the course's sentences, the refund (or "you
   paid a fair price"), and **Got it** or **Retry: a different model** / **Retry: more effort** (§5: the work
   order opens again with that picker live and nothing chosen).

Every stall's work order is the same, under its keeper's name ("Desmond's Model Market", "Desmond says").

**Input:** keyboard (1-4, arrows or WASD, E/Enter/Space, R for a Retry, Esc back or away), gamepad (D-pad, A,
B, X for Retry, LB/RB for the model pick), touch and mouse (every target ≥ 44 px). The press that opens it doesn't
act in it (`PadEdges.arm`). While a learning overlay (the Logbook, the fork form) is up, the market leaves the
keys and the pad alone; J waits until you step away. Learning overlays stack above it.

**Accessibility:** text ≥ 16 px at 1080p; colour is never the only cue (names, size marks, prices, stamp words and
symbols); an `aria-live` region reads each screen and each outcome; reduced motion (the setting or the system)
drops the stamp and the needle's movement and cuts the camera instead of flying it. The keeper's line is written on
the work order while they say it (the HUD's caption steps aside for it). On a Retry, the pick you can't take
again is labelled for screen readers ("GPT-6 Luna: hired last time, pick another"), struck through and marked
"Last time", not by colour alone. Phones: a bottom sheet in one column
(portrait) or a short sheet with three board columns (landscape).

## 7. Quest flow

- Gilda calls out the first time you come within 9 m of her counter (once per save) and the optional task
  **The Model Market: Hire a model that fits the job** joins the Meridian task list (`Q1.A`, optional). Only her
  stall touches `Q1.A`: the other stalls are shops (no quest of their own).
- Desmond and Lani say hello when you come up to their counter (4.5 m, once a session: their stalls stand by
  the islands' first conversations, and a hello from further off talked over Tamsin's) and goodbye when you step
  away from the work order.
- The chart label `puzzle:market` shows the first time you stand at any stall's counter (the stalls share it).
- The first right-sized job, at any stall, files the Logbook page **The Model Market** (`pg1.market`).
- Every job done right-sized finishes `Q1.A` (at Gilda's stall, or as soon as Port Meridian's market is built if
  you finished the board elsewhere). The Seal never waits for it.
- A course without the market (no `puzzles/market.json`, like `copilot-cli`) builds the stalls as scenery: no
  lettering, no keeper, no counter.

## 8. Voice

Gilda: ElevenLabs Voice Library "Harriet – British Actress" (`aAsWcN5jdLdiYG7Hq0YL`), British English, an
older woman with a refined, brisk shopkeeper's manner. Lines `mer.market.*` in `courses/copilot-app/voice/lines.json`
(`mer.market.fair`, "Right-sized! That's a fair price for this job.", is for a right-sized hire with nothing back).

Desmond (Anchorage): ElevenLabs Voice Library "Donovan Wilson" (`GLpuYaUYNnusyOVvP3PM`), Jamaican English, a warm,
calm, mature man (its description: "unmistakably Jamaican without sounding exaggerated or forced"); lines
`desmond.market.hello` and `desmond.market.bye`. Lani (Thousand-Bough): "Kalala – Calm & Friendly Pacific"
(`sxEoZ67pB0EMoWOZZ37G`), a warm, calm Pacific woman's voice; lines `tb.lani.market.hello` and
`tb.lani.market.bye`. Each says only their own hello and goodbye: the market's other lines are Gilda's, and at
their stalls they're captions on the work order (written, not voiced), so no keeper speaks in Gilda's voice.

## 9. Tests

- `src/game/market/market.test.ts`: the sync's parsing and filtering (fixture in `tools/models/fixtures/`), the
  board rule, `courses/copilot-app/models.json`, prices, every job's grades, refunds (always less than the hire),
  the Retry plan (nothing chosen; last time's model or effort can't be taken again; Auto off after Auto), the
  purse (earn, spend, never below 0, old-save migration), saved hires (a model that left the list), every quote is
  the course's, and the market at every stall (a stall per island, only Gilda's runs the story; a Retry with real
  picks; one board and one purse across stalls; another keeper says only their own lines).
- `src/content/content.test.ts`: `courses/copilot-app/market.json` against its schema; every quote word for word in its
  cited section of the snapshot, every anchor and hash in the lock; Gilda's and each keeper's captions the same as
  their voice lines (spoken by them) and their audio; a keeper for every other stall on the course's islands; the
  economy (prices 1-4, bigger models cost more, a refund always less than the cheapest right-sized hire, the first
  island's starfish clear every job); and that broken edits are reported by entry.
- `src/learn/content/labels.test.ts`, `src/learn/course/refs.test.ts`: the label and every citation.
- `src/game/meridian-quests.test.ts`: the optional task.
- `src/world/islands/thousand-bough/layout.test.ts`, `src/world/islands/anchorage/village.test.ts`: Lani's spot is
  her booth's, every anchor on its ground; Anchorage's village stays within its draws.
- `tools/meridiantest.mjs`: plays the market with real keys (a quick job right-sized, one overspent, two hard jobs
  that fall short then a Retry each: a different model, picked by hand, and more effort), reloads Meridian and
  checks the save and the notes.
- `tools/video/scenarios/model-market.mjs` (Gilda's) and `model-market-stalls.mjs` (Desmond's Retry, then the
  same purse at Lani's): video scenarios.

## 10. Open questions for Dan

- ~~Roll out to the other islands~~: done (2026-10-22). One stall on each island, sharing the same boards,
  starfish and save (§2).
- ~~Deploy on merge~~: done. `pages.yml` deploys when CI passes on a push to `main` (docs/content-data.md).
- The other keepers' teaching lines are captions (Gilda's words, unvoiced). Voicing them would be 9 lines per
  keeper in their own voices.
