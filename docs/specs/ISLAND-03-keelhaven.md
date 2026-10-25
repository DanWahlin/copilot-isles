# Spec: Island 03, Keelhaven (Chapter 03 · Development and GitHub Workflows)

> Status: **design spec, decisions made** (2026-10-24). Dan accepted every open item (§0.3) on
> 2026-10-24. Course source: `github/copilot-app-for-beginners` `main` at `64bc3d0`
> (2026-10-24), `03-development-workflows/README.md` (blob `b7ca027`). The pack's snapshot (`lock.json`,
> `a5cdf7d`) has no Chapter 03 yet. Chapter 03 did not change between `a5cdf7d` and `64bc3d0`.
> Written in ASD-STE100 Simplified Technical English. Player-facing lines use friendly contractions.
>
> Diagrams: [top-down layout](island-03/top-down-layout.svg) · [Two Circuits](island-03/two-circuits.svg).
> Both are hand-drawn SVG (no AI art). `docs/specs/island-03/draw.py` makes them from the numbers in this
> spec, and it prints every world position, heading, bound and walking distance in §3.
>
> Read with: [ISLAND-02](ISLAND-02-thousand-bough.md) (the form this spec follows), [BATTLES](BATTLES.md),
> [COURSE-PACKS](COURSE-PACKS.md) §11 (learning systems), [MODEL-MARKET](MODEL-MARKET.md) §2,
> `.plans/PLAN.md` §3–§9, §12–§15, and the skill `isles-threejs-practices`.

---

## 0. Decisions log

### 0.1 Dan's decisions (2026-10-24)

| # | Decision | What this spec does with it |
|---|---|---|
| D1 | **Look:** Na Pali–style (Kauai) fluted green cliffs, knife ridges and valleys round a sheltered cove. A weathered old pirate town and a shipyard (drydocks, canal locks) on the cove's beach. Wrecks on the reef. Match the overall look of `github.com/Leonxlnx/napali` (MIT). Do not copy its code | §2 (art direction), §3.2 (terrain), §10.5 (the `paliWall` look). We use its techniques only, written by us in TS and TSL |
| D2 | **Sky:** bright late morning, high sun, white cumulus banks over the peaks, clear coast | §2.4 and O4: 10:00 by default (sun 59° high), chosen between 9:30 and 10:00 by the terrain prototype; the noon and afternoon cloud keys (no new key), cloud-cap mist cards on the peaks |
| D3 | **Registry first:** a generic island registry lands first (its own PR). Then the course pack is split so that each chapter's data loads with its island (its own PR) | §12 phases 1 and 2, before any Keelhaven code |
| D4 | **Music:** "Salty Sway" (`music_salty_sway`, maritime folk) is Keelhaven's track | §8.1 |
| D5 | **Keep as built:** the opt-in GitHub checks, the recap rewards and the reflection timing | §6.2: no new check kind; §6.5: the recap and the reflection use today's shapes |

### 0.2 Decisions this spec makes

| # | Decision | Why |
|---|---|---|
| K1 | **Site:** island centre `(3800, −1650)`. Island frame: `s` along bearing 143° (mouth → valley head), `t` along bearing 53°. Baked bounds x 3240…4300, z −2280…−1120 (cell 2 m) | The checklist's recommended spot. Every playable point is ≥ 1480 m from Thousand-Bough's centre (its `unload` is 1350). Only the south-west sea cliffs (not playable) come to 1342 m |
| K2 | **Harbour mouth to the north-west**, axis 143°/323° | The wind comes from 233°. Entry (143°) and exit (323°) are both beam reaches (Port Meridian's mouth faces the wind: issue 292). From Thousand-Bough you run downwind (58°) to the lane start |
| K3 | **One weenie: the Gate Light**, a lamp tower on the North Head beside the Sea Gate, top y 32. The lock flight's lamps lead to it | It is the end of the route and the place of the Trial and the Seal. You see it from the sea, the berth, the beach and the locks |
| K4 | **The metaphor:** the cove is your machine (the inner loop); the canal locks through the North Head are GitHub (the outer loop); a drydock is a session's worktree; your seal at a gate is human judgment; the Sea Gate is the merge, and it stays shut for practice hulls | §1.3 and §5.1. PLAN §3's "sea trials" and "test sail" were too close; §1.3 gives each a clear object |
| K5 | **Signature puzzle Two Circuits** (`P3.1`) in two rounds that the player walks: the Drydock Ring (inner loop, two laps) and the Lock Flight (outer loop) | Learn by doing (PLAN §1). Every station is one decision that the course asks the learner to make |
| K6 | **Ten quests at eight stops, in the course's order, one direction, no walk back.** Route 726 m, plus two laps of the ring (140 m each). Longest gap between stops 147 m (82 s) | The Chapter 00 and 02 audits: doubling back (195 m and 220 m) and long talks lost players. §3.10 measures it |
| K7 | **Ten "Do this in the app" cards** (A3.1–A3.10), each with the exact course steps, **I did it** / **Later**, and a "What did you see?" question that tests understanding. **Later never blocks the story** | Chapter 03 is mostly real-app work (75 minutes). The learning-journey review asked for honest hand-offs |
| K8 | **No GitHub check on Chapter 03's cards** (D5) | `prOpened` without a branch passes on the three seeded pull requests. With a branch, it needs the session's generated working branch, which the check cannot fill in. A check that cannot fail tells the player nothing |
| K9 | **Stale screenshots:** six Chapter 03 screenshots show the old sidebar (**Projects**, **More**). No hotspot target goes in the sidebar; no question uses the **Ready to merge** button in `app-pr-failing-check` | §1.4. Upstream issue github/copilot-app-for-beginners#50 lists the Chapter 00–01 images only |
| K10 | **Reuse every shared material.** Expect **0 new shader modules**; at most 2, and only if a census proves the need (Thousand-Bough's budget was 4; PLAN §15.4 goal ≤ 135). The wall look is one new region key (`paliWall`) in the shared terrain material, not a new material | The checklist's census: Thousand-Bough peaks at 133 on Ultra WebGPU |
| K11 | **Stable ids:** island id `keelhaven` everywhere (chart, `IslandId`, saves, music key, packs, story). Quest ids `Q3.1`–`Q3.10`, `Q3.A`, `Q3.B`; app tasks `A3.1`–`A3.10`; Trial `T3` | The chart and `course.json` already use `keelhaven` |
| K12 | **Ladders are scenery.** The player climbs only stairs and ramps. **Every reachable edge has a rail, a wall or a natural barrier** | As Thousand-Bough D12, D13 |
| K13 | **Bram** keeps Keelhaven's Model Market stall on the Old Town quay | MODEL-MARKET §2: a stall on every island |
| K14 | **Lyra Wren** (the Wandering Bard) plays in the tavern, *The Second Take*, and unlocks the music | PLAN §3: the Bard retells each chapter's studio analogy |

### 0.3 Dan's decisions on the former open items (2026-10-24)

The first draft asked Dan eleven questions. On 2026-10-24 Dan accepted each recommendation (O4 with a
change). The ids stay, so the references in this spec stay valid.

| # | Item | Dan's decision (2026-10-24) |
|---|---|---|
| O1 | The site and the harbour mouth | Centre `(3800, −1650)`, mouth to the north-west. Thousand-Bough stays unloaded while you play, and both harbour legs are beam reaches |
| O2 | Where each chapter is recapped | **Battle 3** (Thousand-Bough → Keelhaven): the "Trust the Evidence" frame and gunnery (BATTLES §2.1) with Chapter 02's waves N2.1–N2.3 (BATTLES §2.0c). **Battle 4** (Keelhaven → Guildcrest): the Chapter 03 questions with the raiders *Confident Guess*, *First Take*, *Unchecked* (§9) |
| O3 | The passage sky (Thousand-Bough's dusk, 17.77 h → Keelhaven's morning) | **"Next morning" cut:** the dusk holds until battle 3 ends, then a 3 s fade to Keelhaven's sky as you round the North Head. No sky key is added. Reduced motion uses a plain cross-fade |
| O4 | The time of day | **10:00 by default** (`hours` 10.0, sun 59° high). The terrain prototype (phase 4) measures flute contrast between 9:30 and 10:00 and picks the time. The flutes vanish at about 10:24 (measured), so never later than 10:00 (§2.4) |
| O5 | A shared `paliWall` region key in the shared terrain material | **Yes**, with mask 0 outside Keelhaven; screenshot-diff the other islands |
| O6 | One 512² ocean floor tile per island (a registry) | **Yes.** It gives Keelhaven's reef and cove their turquoise and fixes Thousand-Bough's shallows; one format for every tile, so no new shader |
| O7 | Keelhaven's full terrain pack in the opening | **No.** The opening gets a coarse chart pack (8 m cell, ≈ 40 KB) for each island; the full pack (≈ 1.0 MiB gz) loads only when the island streams |
| O8 | The Lite heap ceiling (103 MB) | It may go up **after the measurement**, to the measured peak + 15 %, with the reason in `budgets.json` |
| O9 | The six stale Chapter 03 screenshots upstream | **Done:** commented on github/copilot-app-for-beginners#50 with the six screenshots ([comment](https://github.com/github/copilot-app-for-beginners/issues/50#issuecomment-6387108574)) |
| O10 | "Human judgment in both loops" in Keelhaven's `course.json` topics | **Yes** (objective 6) |
| O11 | Ten app cards | **Keep all ten.** Every card has **Later**; the outer-loop cards come as one errand; only A3.9 and A3.10 belong to optional quests |

---

## 1. Teaching map (Chapter 03)

Course folder `03-development-workflows`. Anchors are the slugs that `src/learn/course/sections.ts`
makes for this README (the research ran the parser on the upstream file). Images are in `assets/`. The
snapshot step (§12, phase 6) copies them to `courses/copilot-app/public/course/ch03/`; ids below are
`ch03/<file-without-extension>`. Citations in this spec use `[§anchor]` for Chapter 03 and
`[00 §anchor]` for Chapter 00.

### 1.1 Sections, in order

| # | Anchor | Section (summary) | Images | UI names (bold or code in the course) |
|---|---|---|---|---|
| 0 | *(top; cite `learning-objectives`)* | Hook: "What if one supervised workflow carried a change from the first edit to a merge-ready pull request?" Two connected loops; you stay responsible for what ships | `chapter-header.svg` (not used) | — |
| 1 | `learning-objectives` | Six objectives (§6.5); ~75 minutes | — | **Run** |
| 2 | `prerequisites` | Chapters 00–02. Uses the setup script's practice items. Without pull requests, read the outer-loop steps | — | — |
| 3 | `from-the-studio-from-take-to-final-mix` | Record, listen, adjust, record again = inner loop. The producer's brief, feedback, quality checks, approval = outer loop | `record-playback-retake-loop`, `producer-review-desk-github` | — |
| 4 | `core-concept-trust-the-evidence` | "A confident response from Copilot isn't the same as validated software." The evidence table. Human judgment in both loops | `development-loop` | **Changes**, **Terminal**, **Browser**, **Pull requests** |
| 5 | `confirm-the-sample-app-is-ready` | `.github/copilot-instructions.md`; optional context layers; a known-good baseline: four passing tests and a build; `npm install` in each new worktree | `context-layers`, `app-workspace-panel` (stale sidebar) | **+**, **New worktree**, **Interactive**, **View** > **Toggle Review Panel**, **Terminal** |
| 6 | `running-code-snippets-in-the-terminal` | Copy and paste, or the **Run** button when it shows; the shell keeps its state | — | **Run** |
| 7 | `inner-loop-develop-and-validate-on-your-machine` | Understand, make a focused change, inspect the diff, run tests and the build, preview, repeat | — | — |
| 8 | `1-review-and-fix-a-bug` | `practice-unread-count-bug`, `#2`, **Plan**, **Exit plan mode and I will prompt myself**, **Changes**; the discard action | — | **Create from**, **Branches**, **Plan**, **Interactive**, **Changes** |
| 9 | `validate-the-fix` | Tests and build (don't run them twice), `npm run dev`, **Browser** with the **Local** URL; **Fantasy** + **Unread** → only **The Night Circus**, count 1 (bug: 5); **Unread** alone hides the bug; `Ctrl+C` | — | **Browser**, **Local** |
| 10 | `2-add-a-regression-test` | Fails with the bug, passes with the fix; don't weaken an expectation. Optional: refactor `filterBooks` behind the tests | — | — |
| 11 | `3-ask-for-a-second-opinion` | `/rubber-duck`, "a constructive critic", a different model when available, the fallback. Optional: **Pick & Polish** | `app-pick-and-polish` (stale sidebar) | **Pick & Polish** |
| 12 | `outer-loop-move-the-work-through-github` | Six steps; two approval gates; feedback or a failed check goes back to the session | `issue-to-merged-pr` | — |
| 13 | `4-find-work-in-issues-and-pull-requests` | **Issues**, **Assigned to me**, **All repositories**, **Pull requests**, **Authored by me**; each view keeps its own repository selection; the typed query and **Custom** | `app-filter-repo`, `app-issues-filtered` (stale sidebar) | **Issues**, **Pull requests**, **Assigned to me**, **Authored by me**, **All repositories**, **Custom** |
| 14 | `5-start-from-an-issue-and-open-a-pull-request` | Issue 1; the issue's **New session** starts from `main`, so use **Create from**; `hobbit` = `HOBBIT`; an honest summary; **Create PR**; don't merge | `app-issue-new-session` (stale sidebar) | **New session**, **Create PR** |
| 15 | `6-address-review-comments-and-failing-checks` | The two seeded pull requests on **Authored by me** | — | — |
| 16 | `respond-to-a-review-comment` | **Improve empty-state copy**; **New session** from the pull request; answer the complete comment; commit and push | `app-pr-review-comment` (stale sidebar) | **New session** |
| 17 | `fix-a-failing-check` | CI check definition; **Failing stats check practice**; **Book app web**; **Fix failing checks** exists but the course uses its own prompt; don't weaken the test; the check reruns. Optional: **Agent Merge** | `app-pr-failing-check` (stale sidebar), `human-judgment-loop` | **PR**, **Fix failing checks**, **Ready to merge**, **Merge pull request**, **Agent merge** |
| 18 | `troubleshooting` → `browser-preview-doesnt-update`, `tests-fail-only-in-one-session`, `i-cant-see-an-issue-or-pull-request`, `local-results-and-ci-dont-agree`, `a-pull-request-is-still-blocked` | Five problems and their fixes | — | — |
| 19 | `key-takeaways` | Six takeaways; 6: "A change is ready only when the diff, local validation, GitHub checks, and human review agree." | — | — |
| 20 | `assignment` | Both loops on a small UI task; success criteria; no merge | `../assets/assignment.webp` (in the snapshot) | — |
| 21 | `whats-next` | Chapter 04 reuses this workflow with a review skill and a custom agent | — | — |

Do not mix up Chapter 02's issue #3 **Improve the empty state copy** and Chapter 03's seeded pull
request **Improve empty-state copy**. Names seen only in screenshots (**Created by me**, **Overview**,
"All checks have passed", and others) are not course names; no line teaches them.

### 1.2 Concept → island → check

| Concept (anchor) | Where on the island | Check | Logbook page |
|---|---|---|---|
| Two loops; you decide what ships (intro, `learning-objectives`) | Arrival flyover; Juno and Wingman at the landing | — | — |
| Take, play back, re-take; the producer (`from-the-studio-…`) | The Second Take (tavern), Lyra | Bard re-take; **K3.1** | `pg3.studio` |
| Trust the evidence: four surfaces (`core-concept-trust-the-evidence`) | Hester's Evidence Board by the river bridge | **M3.1** Evidence Board | `pg3.evidence` |
| Human judgment in both loops (`core-concept-…`) | Hester; your seal at the caisson, Gate 1 and Gate 2 | **K3.2**; seals in **P3.1** | `pg3.judgment` |
| Known-good baseline; `npm install` per worktree (`confirm-the-sample-app-is-ready`) | Drydock 1, Dory | Sounding and float; **K3.3**; **A3.1** | `pg3.baseline` |
| Context layers (optional block) | The strata cut by the ramp | chest **C3.1** | `pg3.context-layers` |
| Run a snippet (`running-code-snippets-in-the-terminal`) | Dory's bell cord | in A3.1 | `pg3.snippets` |
| The inner loop (`inner-loop-…`, `1-review-…`, `validate-the-fix`) | The Drydock Ring, lap 1, Cass | **P3.1** round 1; **A3.2** | `pg3.inner`, `pg3.fix`, `pg3.validate` |
| Regression test (`2-add-a-regression-test`) | The Drydock Ring, lap 2, Cass | **P3.1** gauge choice; **A3.3** | `pg3.regression`; chest **C3.2** (`pg3.refactor`) |
| Second opinion (`3-ask-for-a-second-opinion`) | The Old Hulk, Barty | **K3.6** remarks; **A3.4** | `pg3.rubber-duck` |
| Pick & Polish (optional block) | Barty, optional quest **Q3.B** | **A3.10** | `pg3.pick-polish` |
| The outer loop; two approval gates (`outer-loop-…`) | Stroud at Lock 1 | **P3.1** round 2 | `pg3.outer` |
| Find work (`4-find-work-…`) | Stroud's two ledgers | **K3.7**; **A3.5** | `pg3.find-work` |
| Issue to pull request (`5-start-…`) | Lock 1: the slipway bell, the slate, Gate 1, the petition, Lockfall | **P3.1** round 2; **A3.6** | `pg3.issue-to-pr` |
| Review comment, failing check (`respond-…`, `fix-a-failing-check`) | Lock 2, Arlo and the repair barge; Gate 2; the Sea Gate | **P3.1** round 2; **A3.7**, **A3.8** | `pg3.review-comment`, `pg3.failing-check` |
| Agent Merge (optional block) | The tug at Lock 3 | chest **C3.3** | `pg3.agent-merge` |
| Troubleshooting (five anchors) | Five bottles | — | `B3.1`–`B3.5` |
| Key takeaways (`key-takeaways`) | The gatehouse, Ottoline | **Trial T3** | `pg3.takeaways` |
| Assignment (`assignment`) | Ottoline, optional quest **Q3.A** (after the Seal) | **A3.9**; **K3.9** | `pg3.assignment` |
| What's next (`whats-next`) | Ottoline's farewell; the Chart | — | — |

### 1.3 Two Circuits against the course (the PLAN's drift, fixed)

PLAN §4 said: "an inner loop on your machine (diff → tests → build → preview), then an outer loop on
GitHub (PR → review → CI). **The last gate is your own review.**" The current chapter says more. This
spec, PLAN §3 and PLAN §4 now use the course's words.

| # | The old PLAN text | The course (`64bc3d0`) | What Keelhaven does |
|---|---|---|---|
| 1 | Inner loop: diff → tests → build → preview | **Understand → Change → Inspect → Test & Build → Preview**, and repeat if the evidence shows a problem (`development-loop`; `[§inner-loop-develop-and-validate-on-your-machine]`; Key Takeaway 1) | Five ring stations; bad evidence sends the hull back to **Change** |
| 2 | Outer loop: PR → review → CI | **Issue → Session → Diff → approval gate → Pull Request → Checks → approval gate → Merge**; feedback or a failed check goes back to the session (`issue-to-merged-pr`; `[§outer-loop-move-the-work-through-github]`) | Eight Lock Flight stations; a chalk note or a red lamp sends the hull to the repair barge (a new session) |
| 3 | "The last gate is your own review" | Human judgment in **both** loops (`[§core-concept-trust-the-evidence]`); the outer loop has **two** approval gates; Key Takeaway 6: ready "only when the diff, local validation, GitHub checks, and human review agree" | Your seal at the caisson (inner loop), Gate 1 (after the diff) and Gate 2 (after the checks) |
| 4 | "The practice PR doesn't launch" | Step 5: "Don't merge this practice pull request." Step 6 and the assignment do not merge either | The Sea Gate stays shut; practice hulls wait in the basin |
| 5 | PLAN §3: tests = "sea trials", preview = "test sail" | — (the two names mean nearly the same thing) | Diff = the shipwright's **slate**; tests = the **sounding hammer**; build = the **float test**; preview = the **trial run** seen from the lookout; CI = the **lock lamps** that Lockfall fills by itself |
| 6 | Chapter 02's What's Next and `GLOSSARY.md`: "review, debug, test, and preview" | Chapter 03: "understand, change, inspect, test, build, and preview" | Use Chapter 03's words |
| 7 | `course.json` topics (four) | Objectives 2 (**Run**) and 6 (human judgment) have no topic | O10 adds "Human judgment in both loops" |

### 1.4 Course images and the stale-screenshot rule

| Image | Use in the game | Rule |
|---|---|---|
| `record-playback-retake-loop`, `producer-review-desk-github` | Lyra's spyglass; `pg3.studio` | No app UI |
| `development-loop` | Hester's spyglass; `pg3.inner`; the Two Circuits intro | No app UI |
| `context-layers` | `pg3.context-layers` (chest C3.1) | No app UI |
| `app-workspace-panel` | Dory's spyglass; `pg3.baseline`; optional hotspot **H3.1** (the test result in **Terminal**) | **Stale sidebar** |
| `app-pick-and-polish` | `pg3.pick-polish` | **Stale sidebar** |
| `issue-to-merged-pr` | Stroud's spyglass; `pg3.outer` | No app UI |
| `app-filter-repo` | Stroud's spyglass; `pg3.find-work` | A crop with no sidebar |
| `app-issues-filtered` | `pg3.find-work` | **Stale sidebar** |
| `app-issue-new-session` | Stroud's spyglass at the slipway bell; `pg3.issue-to-pr` | **Stale sidebar** |
| `app-pr-review-comment` | Arlo's spyglass; `pg3.review-comment` | **Stale sidebar** |
| `app-pr-failing-check` | Arlo's spyglass; `pg3.failing-check`; optional hotspot **H3.2** (the failed check) | **Stale sidebar**. The header shows **Ready to merge** while a check fails |
| `human-judgment-loop` | `pg3.agent-merge` | No app UI; no Octocat, no Copilot logo |
| `shared/assignment` | `pg3.assignment` | In the snapshot |

**The stale-screenshot rule.** Six Chapter 03 screenshots (marked above) show the left sidebar before
app 1.1.30: a **Projects** heading and a **More** row. App 1.1.30 calls the heading **Sessions** and has
no **More** (upstream commit `036c19b`). Upstream issue github/copilot-app-for-beginners#50 listed only
the Chapter 00–01 images; a comment of 2026-10-24 adds the six Chapter 03 ones (O9). Chapter 03's text does not name the sidebar heading, so the text and the
pictures agree. For Keelhaven:

1. Put no hotspot target, mask or caption arrow in the sidebar of these six images.
2. Do not use the **Ready to merge** button in `app-pr-failing-check` for a target or a question.
3. No caption names the sidebar heading over these images. Say "the sidebar" or "your project".
4. Pin each image by its `lock.json` hash. When upstream retakes one, `course:drift` flags it; measure
   the hotspot rectangles again in the Hotspot Editor.
5. `ch03.test.ts` checks rules 1 and 2: every target rectangle starts right of the image's sidebar edge
   (measured once per image), and no target id is `ready-to-merge`.

Hotspot rectangles are measured in phase 6 (§12) with the Hotspot Editor, after the snapshot. This spec
names the targets only:

| Image | Target id | What |
|---|---|---|
| `app-workspace-panel` | `terminal-result` (answer) | the "Tests 4 passed (4)" lines in the **Terminal** tab |
| | three distractors | other areas of the review panel and the prompt box, picked when measured (none in the sidebar) |
| `app-pr-failing-check` | `failed-check` (answer) | the failed **Book app web** row |
| | three distractors | the pull request's title, its conversation and a passing area, picked when measured (never **Ready to merge**) |

---

## 2. Art direction

### 2.1 The story the land tells

Keelhaven is the oldest shipyard in the isles. Its crews build hulls in drydocks on the cove's beach,
and then they take each hull down a flight of canal locks, cut through the North Head, to the sea.
Out on the reef lie the hulls that sailed without proof: *Confident Guess*, *First Take*, *Unchecked*.
The shipwrights pulled their name boards off and nailed them to Hester's Evidence Board, so nobody
forgets. **Ottoline** keeps the Gate Light at the Sea Gate. She lights it only for a captain who can
show that the evidence agrees. The island's line: **bright and busy in the sheltered cove → careful and
measured down the locks → wide open sea and the Gate Light at the end.**

### 2.2 Look in one sentence

A sheltered Na Pali cove: tall fluted green walls, knife ridges and a deep valley with a ribbon
waterfall, round a turquoise cove with a pale beach, where a weathered pirate town and a timber
shipyard with drydocks and a lock flight sit in bright late-morning sun, and wrecks lie on the reef
outside.

### 2.3 Palette (the colour story)

| Role | Colour | Where |
|---|---|---|
| Wall canopy, shade | `#1F3A1C` | gullies of the fluted walls, the valley's far side |
| Wall canopy, mid | `#2F5A26` | most of every wall |
| Rib light | `#58782E` | rib crests in side light |
| Valley floor | `#4C7D38`, palms `#6E9A3C` | the valley forest, the beach back |
| Laterite | `#7A3E22` | crest scars, talus fans at the foot of each gully, the cut by the ramp |
| Sea-cliff basalt | `#2B2620`, wet band `#1E1B17` | **only** the sea-cliff band (15–40 m) and the rock cut |
| Beach sand | `#E8D7A0` | the beach at the cove head |
| Water | cove `#2FA39A`, reef `#3FB3A8`, open sea navy `#1B3A5C` | turquoise only over sand and reef |
| Town timber | weathered `#7D5A3A`, tar black `#2A2420`, red ochre `#9C4A32`, lime-wash `#E6DCC6`, slate roofs `#4A4F55` | Old Town and the tavern |
| Shipyard | oak `#8C6A45`, iron `#3A3A3A`, rope `#C8B48A`, dock stone `#9D927C` | drydocks, basin walls, sheerlegs |
| Lamps | lock lamp red `#D9452B`, green `#3FA34D`, amber `#FFB54A`; the Gate Light `#FFF1C8` | the lock flight, the Gate Light |
| Seal wax | `#B0302A` | the captain's seal at each gate |

Rules: saturated colour only on what matters (lamps, the Gate Light, the seal, flags). Walls stay in
three greens with red-brown and dark rock showing through. Dark basalt shows only in the sea-cliff band
and the rock cut. No pure white except foam, the falls and the Gate Light.

### 2.4 Time, sky, haze, light (`ISLANDS.keelhaven.sky`, `mood`)

- **Sun (D2, O4):** **10:00 by default; the terrain prototype measures flute contrast between 9:30 and
  10:00 and picks the time.** At 10:00 the sun is 59° high, at 9:30 52° (the game's sun path, latitude
  18°). The prototype measured that the flutes vanish at about 10:24, so the time is never later than
  10:00. Phase 4 renders `sea-700` and `sea-400` at 9:30, 9:45 and 10:00 on Lite and High, measures the
  flute stripes' luminance contrast along one row at mid-wall height, and writes the time with the best
  contrast into `islands.ts` (with the readings in the PR). The sky dome blends the baked **noon** (12.0 h)
  and **afternoon** (16.2 h) cloud keys by the sun's height at any of these times: no new key, no
  `sky:bake`. Add the chosen hours to `cove.sky.prefetch([...])` in `flow.ts`.
- **Sun bearing:** target **185°** (from the south). A tunes `azimuth` until the debug sun bearing reads
  185° ± 5°, and writes the value into `islands.ts`. Why this bearing:
  - On the arrival, the south-west outer wall is lit 48° off its face: its flutes read as stripes.
  - The north-west faces of the two heads at the mouth stay in shade: depth at the mouth.
  - In the valley, the north-east wall (it faces south-west) is lit and the south-west wall is in shade:
    one lit side and one shaded side.
  - The shipyard and the lock flight face south-west: they are in sun. The quay and the tavern porch must
    be in sun at the authored time (hero shot H2 checks it).
- **Cumulus banks over the peaks (D2):** 4–6 large **cloud-cap cards** at y 230–300 over Kestrel Peak,
  the Anvil and the head wall, drawn with the shared mist material (moved from
  `thousand-bough/mist.ts` to `src/world/mist/`, §10.3). Cards: Lite 0, Low 4, Medium 6, High and
  Ultra 6. They do not cover the coast: the coast stays clear.
- **Haze (`mood`):** `{ fogScale: 1.6, hazeTint: [0.94, 0.98, 1.0] }`. The ridge behind the valley goes
  blue-grey; the cove stays clear. The haze stays under the 0.42 cap on the near wall. No valley mist
  cards: the coast is clear (D2). The `mood` blend moves to one place (`passageMood`) before Keelhaven
  gets one (checklist item 21).
- **Light on the flutes:** bake `sunGolden` and `sunMorning` for this sun. The steep-light smoothing in
  the bake uses a radius of 4–6 m for Keelhaven (today 14 m), so the flutes keep their own shadows.
- **The passage (O3):** Thousand-Bough is at dusk (17.77 h). The sky holds that dusk until battle 3
  ends. Then it fades for 3 s to Keelhaven's sky (§2.4) as you round the North Head ("Next morning"). Reduced
  motion uses a plain cross-fade. `passageSky` gets a rule for this pair: hours go forward only, by the
  cut, never back through the afternoon.
- **Night:** with Sky & Time at night, the lock lamps, the tavern windows and the Gate Light follow the
  night factor.

### 2.5 The weenie and the wienies along the path

- **The weenie:** the **Gate Light**, a stone lamp tower (top y 32) on a rock bench of the North Head
  beside the Sea Gate. You see it from the sea approach, from the berth across the cove (bearing 18°,
  347 m), from the beach and from every lock. It is where the Trial and the Seal happen.
- **Wienies along the way** (you always see where to go next):
  1. **The tavern sign** at the quay's east end, with Lyra's music coming out of its door.
  2. **Hester's Evidence Board**: a tall board of salvaged name boards by the river bridge.
  3. **The sheerlegs**: a 32 m timber lifting frame over the drydock heads. You see it from the landing
     (bearing 85°).
  4. **The ring lamps** round Drydock 2: one lamp at each station, lit when its evidence is real.
  5. **The Old Hulk** on the basin's north-east quay, with a carved wooden duck on its stern.
  6. **The lock lamps**, red and green, in a line down the flight to the Gate Light.
  7. **The rock cut**: the reef and its wrecks come into view through it, below the Gate Light.

### 2.6 Silhouette and landmark readability

- From the sea (300–2500 m): a tall green wall with **8–12 big flutes** on each outer face; a saw-tooth
  skyline with four clear peaks (South Head 110, Kestrel Peak 262, the Anvil 274, the head wall 240); a
  hazier head wall behind; the **dark sea-cliff band** with a **white surf collar**; one gap (the cove)
  with a pale beach, the town and the shipyard; the **Gate Light** on the North Head; **navy water** to
  the cliffs, **turquoise** only in the cove and on the reef; two white threads (Ribbon Falls up the
  valley, Hanging Fall into the sea on the south-west coast).
- On the chart (opening and `M`): the miniature shows the cove, the two heads and a light on the North
  Head.
- The far silhouette (`createIslandSilhouetteAsync`) uses the island's masks and **no `sheer`** (it would
  paint the green walls as cliff). It has the town and the shipyard as blocks, the sheerlegs and the Gate
  Light as faces, and both falls as strips.

### 2.7 Disney-land rules applied

- **Layered depth** from the berth: the quay and the market stall → the cove with the turquoise shelf →
  the beach and the shipyard → the valley forest → the fluted walls → the hazy head wall → the cloud
  caps → the sky.
- **Forced perspective:** the town's upper houses are at 0.85 scale; flutes widen toward the foot of each
  wall (the facets); the lock chambers get smaller down the flight, so the Gate Light reads farther.
- **Kinetic elements:** Ribbon Falls, Lockfall and Hanging Fall; the river; the crew at the plank stack;
  the sheerlegs' block swinging; lock gates opening and water levels moving; lamps lighting; the tavern
  door swinging with music; washing on lines; crows on the sheerlegs (PLAN §6); the tug's smoke. Rocking
  and swinging stop with reduced motion.
- **Every house is distinct** (roof pitch, colour, a prop that says who lives there: a sailmaker's
  canvas, a ropewalk, a chandler's lanterns, the cooper's barrels). No copy-pasted house.
- **Nothing random:** every prop has a reason (a tool chest at each drydock, the chalk at the slate, the
  ledgers on Stroud's counter). Scatter is only for plants and rocks, inside rules.
- **Signs use the course's exact strings:** `practice-unread-count-bug` (Drydock 2), `practice-card-polish`
  (Drydock 1, after Dory's baseline), `practice-search-case-bug` (Drydock 3), `main` (the main slipway),
  **Book app web** (the lock lamps' plate). Never an Octocat or a Copilot logo.

### 2.8 Hero shots (screenshot-ready; §13.2 lists the captures)

World positions come from `draw.py` (§3). A tunes each within 5 m.

| Id | Shot | Camera → target | Must show | Must not show |
|---|---|---|---|---|
| H1 | **The Approach** (arrival key 1) | (3131, 26, −2273) → (3800, 120, −1650) | the whole island, flutes on the south-west wall, both heads, the cove, the Gate Light, the reef | the terrain edge, the apron, pop-in |
| H2 | **First Look** (the landing, follow camera) | landing pose | the quay and the market stall, the tavern sign, the beach, the sheerlegs, the valley and Ribbon Falls, the Gate Light across the cove | a bare wall filling the frame; the quay in shade |
| H3 | **The Evidence Board** | (3662, 4, −1758) → (3694, 4, −1784) | the name boards, the river bridge, the shipyard behind | — |
| H4 | **The Drydock Ring** | `ringCam` (3813, 24, −1795) → (3800, 7, −1850) | all five ring stations and their lamps, the hull in Drydock 2, the basin | the player's head |
| H5 | **The Lock Flight** | `lockCam` (3794, 22, −1944) → (3704, 4, −1991) | the three locks, their lamps, Lockfall, the repair barge, the Gate Light at the end | — |
| H6 | **Through the Cut** | (3662, 5, −2047) → (3614, 2, −2213) | the rock cut framing the reef and its three wrecks, surf on the reef | the camera inside the cut's rock |
| H7 | **Up the Valley** | (3742, 62, −1744) → (4007, 150, −1393) | the valley forest, both walls (one lit, one shaded), Ribbon Falls, cloud caps | — |
| H8 | **The Gate Light Seal** | (3700, 30, −2060) → (3640, 26, −2118) | the light kindling, the lock lamps turning green down the flight | — |
| H9 | **Horizon** | Thousand-Bough's Crown Deck (2010, 52, −1548) → (3800, 120, −1650) | the island's silhouette and the Gate Light on the horizon | — |
| H10 | **Hanging Fall** | from the sea (3400, 8, −1253) → (3604, 40, −1412) | the hanging valley's lip and the fall into the sea, the dark sea-cliff band | — |

---

## 3. Layout (world space)

Conventions (as in the code): metres; **x east, z south, y up**; sea level y 0. A heading `h` faces
`(sin h, cos h)`. A **bearing** is degrees clockwise from north (−z). Every place is designed in the
**island frame** `(s, t)`: from the centre C = (3800, −1650), `s` along U (bearing 143°, mouth → valley
head) and `t` along V (bearing 53°, toward the north-east ridge). World = C + s·U + t·V, with U = (0.6018,
0.7986) and V = (0.7986, −0.6018) in (x, z). `draw.py` holds the frame values and prints the world
values below. See [top-down-layout.svg](island-03/top-down-layout.svg).

### 3.1 Island data (`KEELHAVEN` in `src/world/islands/keelhaven/layout.ts`)

| Key | Value |
|---|---|
| `center` | (3800, −1650) |
| `frame` | U bearing 143°, V bearing 53° (the code keeps both, so the layout reads in `s`, `t`) |
| `bounds` | minX 3240, maxX 4300, minZ −2280, maxZ −1120, cell 2 (531 × 581 samples). Land box x 3352…4180, z −2161…−1235, plus 110 m of sea floor to the deep floor at every edge |
| `coast` | the outer coast and the cove shore as `(s, t)` polygons (`OUTER`, `COVE` in `draw.py`), with ±8 m noise |
| `contains(x, z)` | inside `bounds` |
| `deepDepth`, `seabedRadius` | 58, 1000 (as Thousand-Bough) |
| Distances | nearest land to Thousand-Bough's centre 1342 m (the south-west sea cliffs, not playable); nearest playable point (the quay's west end) 1484 m; Thousand-Bough's berth to Keelhaven's centre 1889 m |

### 3.2 Terrain shape (`keelhavenHeightDry`, `keelhavenHeight`, `keelhavenMasks`)

Positions in §3.2 and §3.3 are island-frame `(s, t)` (and `y`), as `draw.py` holds them.

One TS function per value. The bake, the ocean floor tile (O6), the silhouette and the chart sample it.
Gameplay reads the baked grid. The method is the look study's (`napali-look.md` §2.2): coast frame,
sea floor, massif, sea-cliff band, valleys, big flutes, crests and peaks, talus fans. No strata in the
height (they read as contour lines).

| Feature | Geometry (island frame) | Height | Notes |
|---|---|---|---|
| **South ridge** (knife edge) | crest along t ≈ −214, s −440 → 300 | South Head 60 → 110 at s −400 → 160 at s −250 → **Kestrel Peak 262** at (−60, −214) → 240 → 230 | low near the mouth so that the quay and the tavern stay in sun (§2.4) |
| **North ridge** | crest along t ≈ 220, s −400 → 300 | North Head 120 at (−380, 222) → 200 → **the Anvil 274** at (110, 222) → 240 | Lockfall leaves its inner face at (−250, 206) |
| **Head wall** (amphitheatre) | arc round (320, 0), radius 220 | crest 240 | Ribbon Falls in a carved gully on its axis |
| **Outer walls** (pali walls) | from each crest to the coast: 80–90 m at 70–75° | crest → sea-cliff top 15–35 m | big flutes: spacing 56–72 m (wider at the foot), depth 10–18 m; ≥ 8 flutes on each outer face; faded out 15–30 m below the crest |
| **Sea-cliff band** | the outer coast, d 0–12 m inland | 15–35 m, near vertical (≤ 78° in the height) | the only dark basalt; tidal notch 1.3–2.2 m; caves as a separate rock mesh where needed (Port Meridian's `headland-cliff.ts`) |
| **Valley** | axis t ≈ 0, from the beach (s −160) to the head wall (s 280); floor 180–220 m wide at the mouth | floor 2 → 48 at the Falls Pool | U-section near the mouth, V near the head; walls rise to the ridges |
| **Hanging valley** | s 10…140, t −235…−290, on the south-west outer face | floor 55, lip 55 at the sea cliff | not carved to the sea; Hanging Fall from its lip |
| **Cove** | the `COVE` polygon; mouth at s −470 between t −62 and 55 (117 m) | floor −6 (shelf at the beach) → −10 in the mouth | calm water; turquoise shelf 3–8 m deep |
| **Beach** | the cove head, s −192 → −158, t −110 → 32 | 0–2 | pale sand, berm, cusps |
| **Old Town slope** | s −345 → −195, t −212 → −138 | 3 → 25, terraced pads | houses on pads; stair lanes |
| **Quay** | face along t −125, s −330 → −215 | deck 2.2 | stone, timber fenders |
| **Shipyard terrace** | s −260 → −112, t 72 → 172 | **7.0** (pad) | basin, docks, sheerlegs, workshops |
| **Towpath** | north-east bank of the canal, t ≈ 140, s −245 → −450 | 7.0 → 5.0 → 3.0 (steps at each lock) | the rock cut through the North Head, s −390 → −440 |
| **Gatehouse bench** | (−462, 146) | 10 | the Gate Light tower at (−470, 154) |
| **Reef** | ellipse centre (−562, 190), half-axes 46 × 82 | crest −0.4 to −0.9, sand channels | outside the North Head; keep the lane clear (§3.4) |
| **Talus fans** | at the foot of each outer gully | cones 6–12 m high, 30–60 m wide, 30–35° | red laterite (masks) |

Masks and regions (`terrain-regions.ts`, existing keys plus O5's `paliWall`): `paliWall` on the land
above the beach (`smoothstep(−1, 25, y)`); `cliff` only in the sea-cliff band and the rock cut; `rock`
in gully floors, crest scars and fans; `forestFloor` on the valley floor; `campSand` on the beach;
`villageGround` and `paths` on the town, terrace, towpath and paths. Fix the masks before the colours
(skill §5).

### 3.3 Water (`src/world/islands/keelhaven/water.ts`, data like `meridian-water.ts`)

All fresh water uses the shared natural water (`fresh-water-natural.ts`: `StreamCourse`, `rideOver`,
`naturalWaterAt`, `joinPool`) and the shared falling-sheet look with broad surges. The lock and basin
water use the same water strips with flat, still surfaces.

| Name | From → to | Size | Notes |
|---|---|---|---|
| **Ribbon Falls** | head-wall lip (330, 8, y 238) → Falls Pool | 3.5 m wide, 190 m drop, in a carved gully 3–6 m deep | `waterfall_large` emitter at the pool |
| **Falls Pool** | (255, 10), radius 14 | level 48 | 2 m wading shelf |
| **Keel River** | Falls Pool → valley → beach at (−160, 4) | half-width 2–4 m, `minFall` 0.02, meanders ±4 m every 50 m | wading depth where the valley loop crosses at the ford (150, 20) |
| **Hanging Fall** | hanging valley lip (72, −298, y 55) → the sea | 5 m wide, 55 m free fall | coast-foam ring at its foot |
| **Lockfall** | North Head ledge (−250, 206, y 92) → Lockfall Pool (−250, 178, y 7.5) | 3 m wide, 85 m drop | a leat runs from the pool along the North Head's foot and fills each lock by sluices: the checks run by themselves |
| **Fitting Basin** | s −245 → −175, t 85 → 150 | level **6.0** (walls to 7.0) | the drydocks open off its south-east side |
| **Drydocks 1–3** | s −175 → −135; centres t 99, 120, 141; 14 m wide, 40 m long | dry floor 1.0; flooded to 6.0 by the caisson's sluice | caissons at s −175 (walkable tops, y 7.0) |
| **Canal and locks** | t 125, 12 m wide, from the basin (s −245) to the sea (s −495) | basin 6.0 → **Lock 1** (s −255…−280) → 4.0 → **Lock 2** (−305…−330) → 2.0 → **Lock 3** (−355…−380) → 0 → **Sea Gate** (s −470) | mitre gates at each end of each chamber; balance beams on the towpath side |

Wading: the river and the pools have a 2 m wading shelf; the deep middle stops you (`inland`). The basin,
the docks and the canal are behind walls and rails: you can't fall in. Far terrain levels keep under the
falls and the river (`TerrainWaterCaps`).

### 3.4 The berth (ship and approach)

| Item | Value |
|---|---|
| **Approach** (from Thousand-Bough) | run downwind on bearing 58° to the lane start (3318, −2289), then a beam reach on 143° through the mouth (3517, −2025) to the berth. Leaving: a beam reach on 323°, then tack toward Thousand-Bough (that leg is close to the wind, as every westward leg here) |
| **Lane** | half-width 30 m: no rock or terrain above −6 m inside it; the mouth is 117 m wide at the waterline and ≥ 8 m deep in its middle; the reef stays ≥ 90 m off the lane |
| **Turning room** | a 45 m circle at (s −330, t −40) = (3569, −1890), ≥ 6 m deep |
| **Quay** | the Old Town quay, face along t −125 from s −330 to −215; deck y 2.2; fenders every 6 m |
| **Berth** | (3538.4, −1797.2), heading **−2.496** (bow toward the mouth, bearing 323°; port side to the quay), 4.65 m off the quay face as at Thousand-Bough |
| **Landing** | (3534.1, 2.2, −1787.7), heading **0.45** (toward the tavern); A may tune ± 0.15 to frame H2 |
| **Ship obstacles** | circles along the quay face; the turning room clear |
| **Fast-travel quay** | the landing pose |
| **Sea lanes** (`KEELHAVEN_WAYS.sea`) | the outer coast and the reef as two closed polygons; lane points at the lane start, the mouth and the turning room. `wayfindtest --only=sea` checks the brigantine's draft (2.7 m) along each lane and 6 m to each side |

### 3.5 Old Town and the quay

- **Old Town** (village kit, built like `src/world/meridian-town/`): 14–18 houses on terraced pads up
  the south-west slope; two stair lanes; washing lines; a well; the cooper, the sailmaker, the
  chandler. Not enterable.
- **The Second Take** (tavern): at the quay's east end; porch at y 2.8; its sign faces the landing.
  Lyra plays on the porch.
- **Bram's Model Market**: a booth on the quay 22 m west of the landing (`BOOTH_LAYOUT`, the shared
  stall parts), its front to the landing: the town's tarred timber, a red-ochre and cream awning, fish
  baskets and a coil of rope. Built into the town's buckets (MODEL-MARKET §2).
- **The course board** (`course-boards.ts` `SPOTS.keelhaven`): on the quay between the landing and the
  tavern, facing the cove.

### 3.6 The shipyard

| Part | Spec |
|---|---|
| **Main slipway** | the cove's north-east beach end, s −200 → −160, t 50 → 66; a half-built hull in its cradle; a sign `main` |
| **Ramp** | the slipway head (−160, 45, y 2.6) → the shipyard gate (−128, 82, y 7.0): 49 m at 9 %, stone, rails both sides |
| **Terrace** | y 7.0; workshops along its south-east edge (sawpit, steam box, forge) |
| **Drydocks** | three, side by side, open to the basin. Each: 14 m wide, 40 m long, stepped stone sides (altars), a caisson gate at the basin end, a tool chest and a branch board at the head. Boards: Drydock 1 `practice-card-polish`, Drydock 2 `practice-unread-count-bug`, Drydock 3 `practice-search-case-bug` |
| **The Drydock Ring** | the walkways round Drydock 2 (the dock head, its north-east wall, the caisson top, its south-west wall), 3.5–7 m wide, rails on the dock side. Five stations (§5.2) |
| **Sheerlegs** | at (−122, 128), 32 m, timber; a block and tackle swings slowly; crows perch on it |
| **The Old Hulk** | an old hull hauled out on the basin's north-east quay at (−222, 172), Barty's lodging; a carved wooden duck on its stern |
| **Strata cut** | the ramp's cut face (s −150, t 70): four rock bands in the laterite; chest C3.1 |

### 3.7 The Lock Flight, the Sea Gate and the Gate Light

| Part | Spec |
|---|---|
| **Harbourmaster's office** | at Lock 1's head on the towpath (−262, 141, y 7); a counter with **two ledgers** under the eaves; the **petition mast** beside it |
| **Lock 1** | chamber s −255 → −280; the **slate** (a board on the chamber wall) and **Gate 1** (the upper gate's balance beam with a seal post) |
| **Lock 2** | chamber s −305 → −330; Arlo's lock-keeper's hut on the towpath; the **repair barge** moored in the pound below (−345, 125) |
| **Lock 3** | chamber s −355 → −380; **Gate 2** (the seal post at its upper gate) |
| **Lock lamps** | on a post at each lock: red, green, or dark; a brass plate reads **Book app web** |
| **Rock cut** | s −390 → −440 through the North Head, walls 20–35 m of dark basalt; towpath 3.5 m wide with a rail |
| **Sea Gate** | at s −470: a pair of tall timber gates in a stone frame, **shut**; practice hulls wait above it |
| **Gatehouse** | on the rock bench (−462, 146, y 10), up 7 m of stairs from the towpath (two flights, a landing); a deck 12 × 10 m |
| **The Gate Light** | a stone tower at (−470, 154), lamp room at y 28–32; the Seal lights it |
| **Tug** | a small steam tug moored below Lock 3 (Agent Merge, chest C3.3) |

### 3.8 The reef and the wrecks

Three wrecks on the reef outside the North Head, built from Anchorage's wreck builder moved to a shared
module with parameters (it draws with the ship's material: no new program). Each has a ship obstacle,
a coast-foam ring and its name board. Their name boards are gone: they hang on Hester's board.

| Wreck | Position (x, z) | Pose |
|---|---|---|
| *Confident Guess* | (3583.6, −2173.1) | on her side, masts down |
| *First Take* | (3608.7, −2229.6) | bow up on the reef crest |
| *Unchecked* | (3664.3, −2238.9) | broken in two, stern awash |

### 3.9 The valley, the falls and the hanging valley

- **Valley loop** (optional): from the shipyard's back gate (−112, 92, y 7) up the north-east bank, a
  ford at (150, 20), the Falls Pool, and down the south-west bank to the river bridge. 824 m (7.6 min).
  One bottle (B3.4) and one starfish. The compass shows it only for its collectibles.
- **Ribbon Falls** at the head wall; **Hanging Fall** on the south-west outer coast (seen from the sea and
  from the arrival); **Lockfall** above the lock flight.
- The hanging valley is not walkable (sea cliffs and the ridge close it). You see it from the sea.

### 3.10 The walking route (one direction)

The route follows the chapter's order and never walks back. Distances are 3D (with height), measured on
the polyline by `draw.py`. Walking speed 1.8 m/s (the review's measured speed).

| # | Point | Position (x, y, z) | Leg (m) | Total (m) |
|---|---|---|---|---|
| — | Landing (Old Town quay) | (3534.1, 2.2, −1787.7) | 0 | 0 |
| — | quay, tavern corner | (3561.8, 2.2, −1748.5) | 48 | 48 |
| Q3.1 | **Lyra**, tavern porch | (3559.8, 2.8, −1734.5) | 14 | 62 |
| — | beach, south-west end | (3611.4, 1.6, −1740.8) | 52 | 114 |
| — | beach, middle | (3662.2, 1.4, −1756.5) | 53 | 167 |
| Q3.2 | **Hester**, Evidence Board | (3689.9, 2.2, −1776.2) | 34 | 201 |
| — | river bridge | (3702.9, 2.2, −1782.2) | 14 | 216 |
| — | slipway head | (3739.6, 2.6, −1804.9) | 43 | 259 |
| — | shipyard gate (ramp top) | (3788.5, 7.0, −1801.6) | 49 | 308 |
| Q3.3 | **Dory**, Drydock 1 head | (3802.0, 7.0, −1811.8) | 17 | 325 |
| Q3.4–Q3.5 | **Cass**, Drydock 2 head (+ two ring laps, 140 m each) | (3815.6, 7.0, −1822.0) | 17 | 342 |
| — | Drydock 3 head | (3847.6, 7.0, −1846.1) | 40 | 382 |
| — | basin, north-east corner | (3820.9, 7.0, −1884.8) | 47 | 429 |
| Q3.6 | **Barty**, the Old Hulk | (3803.2, 7.0, −1921.6) | 41 | 470 |
| Q3.7–Q3.8 | **Stroud**, Lock 1 office | (3754.9, 7.0, −1944.1) | 53 | 523 |
| — | towpath below Lock 1 | (3736.1, 5.0, −1967.5) | 30 | 553 |
| Q3.9 | **Arlo**, Lock 2 | (3720.4, 5.0, −1988.2) | 26 | 579 |
| — | towpath, Lock 3 | (3690.3, 3.0, −2028.2) | 50 | 629 |
| — | rock cut | (3659.0, 3.0, −2069.7) | 52 | 681 |
| — | gatehouse stair foot | (3641.0, 3.0, −2093.6) | 30 | 711 |
| Q3.10 | **Ottoline**, gatehouse deck | (3638.6, 10.0, −2106.8) | 15 | 726 |

**Measured against the learning-journey lessons:**

| Lesson (review, 2026-10-23) | Keelhaven |
|---|---|
| No doubling back (Anchorage's 195 m Actions detour; Thousand-Bough's 220 m back down the tree) | None on the main path. The ring is a loop by design (the inner loop *is* a repeat). The optional quests finish where they start (Q3.A at Ottoline, Q3.B at Barty) |
| Walking 20–28 % of the island's time | 726 m + 280 m (two laps) ≈ **1.0 km ≈ 9.3 min** of a ~40 min clean play (≈ 23 %) |
| Long gaps lose players | Gaps between stops: 62, 139, 124, 17, 128, 53, 56, 147 m. The two longest (Lyra → Hester, Arlo → Ottoline) have a wienie in view all the way (the board; the Gate Light) and something on the way (a bottle and a starfish; the reef reveal) |
| The compass walked players into cliffs and lagoons (issues 288, 289) | `KEELHAVEN_WAYS.walk` has heights for the ramp, the towpath steps and the gatehouse stairs; the compass follows it from day one |
| Talk walls (Bo 64 s, Oren 83 s) | No NPC says more than 5 voiced lines before the player does something (§4.4) |

### 3.11 Stations (NPC anchors and look targets)

Anchor names are part of the contract (§10.4). Each anchor stands on a walk surface with a **4 m clear
radius** and open camera space. Headings face the look target (`draw.py` prints them).

| Anchor | Who / what | Position (x, y, z) | Heading | Look target |
|---|---|---|---|---|
| `landing` | the captain | (3534.1, 2.2, −1787.7) | 0.45 | (3559.8, 3.4, −1734.5) |
| `bram` | Bram (market keeper) | (3517.3, 2.4, −1802.6) | 0.85 | the landing |
| `lyra` | Lyra Wren | (3559.8, 2.8, −1734.5) | 3.00 | (3561.8, 3.4, −1748.5) |
| `hester` | Hester Vane | (3689.9, 2.2, −1776.2) | −0.95 | (3662.2, 3.4, −1756.5) |
| `evidenceBoard` | the Evidence Board (M3.1) | (3693.9, 2.2, −1784.2) | −0.46 | Hester |
| `dory` | Dory Pascoe | (3802.0, 7.0, −1811.8) | −0.93 | (3788.5, 8.2, −1801.6) |
| `cass` | Cass Abara | (3815.6, 7.0, −1822.0) | −0.93 | (3802.0, 8.2, −1811.8) |
| `ringPost`, `ringStack`, `ringSlate`, `ringCaisson`, `ringLookout` | the five ring stations | (3817.0, 7, −1826.8), (3815.2, 7, −1846.7), (3804.9, 7, −1860.3), (3787.5, 7, −1866.0), (3788.2, 11, −1847.7) | — | the hull in Drydock 2 |
| `ringCam` | ring camera | (3813.3, 24, −1795.2) | — | (3799.5, 7, −1850.0) |
| `barty` | Barty Quist | (3803.2, 7.0, −1921.6) | 0.45 | (3820.9, 8.2, −1884.8) |
| `stroud` | Harbourmaster Stroud | (3754.9, 7.0, −1944.1) | 1.13 | (3803.2, 8.2, −1921.6) |
| `ledgers` | the two ledgers (K3.7) | (3757.3, 7.0, −1950.9) | −0.34 | Stroud |
| `lock1Slate`, `gate1`, `petitionMast` | Lock 1 stations | (3745.7, 7, −1944.7), (3738.5, 7, −1954.3), (3764.9, 7, −1944.1) | — | Lock 1 |
| `lockCam` | lock camera | (3794.1, 22, −1943.6) | — | (3703.6, 4, −1990.6) |
| `arlo` | Arlo Fenwick | (3720.4, 5.0, −1988.2) | 0.65 | (3736.1, 6.2, −1967.5) |
| `barge` | the repair barge | (3692.2, 2.0, −2000.8) | 1.15 | Arlo |
| `gate2` | Gate 2's seal post | (3677.1, 3.0, −2035.7) | −0.93 | Lock 3 |
| `ottoline` | Ottoline Gage | (3638.6, 10.0, −2106.8) | 0.18 | (3641.0, 4.2, −2093.6) |
| `extraKids`, `extraCaulker`, `extraFisher`, `extraLamplighter`, `extraTug` | islanders | (3735.6, 1.2, −1821.9) · (3815.9, 7, −1849.8) · (3633.0, 1.4, −1752.0) · (3695.1, 3, −2031.8) · (3676.0, 0.6, −2022.3) | — | — |

### 3.12 Collectibles

Five starfish, three chests, five bottles (the five troubleshooting sections). A moves each spot to the
nearest valid ground (≤ 5 m); `starfishtest` and the layout test prove each one is reachable.

| Id | What | Where (x, z), y |
|---|---|---|
| `sf.k.quay` | starfish "Under the quay steps" | (3548, −1772), 1.2 |
| `sf.k.beach` | "In the beach's tide line" | (3640, −1748), 0.6 |
| `sf.k.dock` | "On Drydock 3's altar steps" | (3843, −1857), 5.5 |
| `sf.k.cut` | "On a ledge in the rock cut" | (3664, −2063), 4.0 |
| `sf.k.falls` | "Behind the Falls Pool" (valley loop) | (3970, −1440), 48.5 |
| `C3.1` | chest: `pg3.context-layers` (10 doubloons) | the strata cut by the ramp (3766, −1812), 5.0 |
| `C3.2` | chest: `pg3.refactor` (15 doubloons) | Drydock 2's head, opens after Q3.5 (3822, −1817), 7.0 |
| `C3.3` | chest: `pg3.agent-merge` (10 doubloons) | on the tug's deck below Lock 3 (3676, −2025), 1.2 |
| `B3.1` | bottle: preview doesn't update | the beach middle (3655, −1752) |
| `B3.2` | bottle: tests fail in one session | Drydock 3's head (3850, −1850) |
| `B3.3` | bottle: can't see an issue or pull request | Stroud's office steps (3760, −1950) |
| `B3.4` | bottle: local results and CI don't agree | the valley ford (3906, −1542) |
| `B3.5` | bottle: a pull request is still blocked | the rock cut (3655, −2075) |

### 3.13 Walkability and camera (hard rules)

As Thousand-Bough §3.9, plus:

- **Stacked surfaces:** the towpath steps, the gatehouse stairs, the ramp and the lookout on the ring use
  `heightAt(x, z, y)`; no gap wider than 0.25 m or taller than the 0.45 m step.
- **Edges:** every dock, basin, lock and quay edge has a rail or a stone kerb ≥ 1 m high, except the
  quay face at the berth (the gangway). The rock cut has a rail on the water side.
- **Colliders and camera boxes** for every post, brace, balance beam, board, awning, the sheerlegs'
  legs and the lamp posts (issue 302).
- **Off-limits:** the walls and ridges, the hanging valley, the North Head above the cut, the docks'
  floors, the canal, the reef, houses.
- **Camera space:** ≥ 12 m of open ground at each stop; nothing lower than 4.5 m overhead on a walk
  surface except doorways (not entered) and the gatehouse's porch (5 m); the rock cut is 14 m wide.
- **No floating, buried or intersecting objects;** coplanar faces ≥ 1 cm apart
  (`flickertest --audit`, views `kh-quay`, `kh-board`, `kh-ring`, `kh-locks`, `kh-gate`).

---

## 4. Chapter beats

Each stop is **what you'll do → where it is in the app → one check or puzzle → the app card → a Logbook
page → who's next**, with the compass on the next stop. Lines are ≤ 22 words and ≤ 2 sentences, with
contractions; spoken lines say "Captain". §8.3 has every voice line with its id and citation.

### 4.0 Arrival

- **Before:** battle 3 on the passage (§9). Its win line says Keelhaven lies ahead. Then the "Next
  morning" sky (O3) as you round the North Head and the Gate Light comes into view.
- **Card** (arrival flyover, §10.6): eyebrow `Chapter 03 · Dev & GitHub Workflows`, title `Keelhaven`,
  line `Trust the evidence, not the first take`.
- **Juno** at the landing: `kh.juno.arrive.01`, `kh.juno.arrive.02`. **Wingman** (the welcome hook):
  `wingman.kh.01`, `wingman.kh.02`, then the `@nav` and `@starfish` tips.

### 4.1 Stops

| # | Quest | NPC · place | What you'll do | Where it is in the app | Check / puzzle | App card | Logbook | Next |
|---|---|---|---|---|---|---|---|---|
| Q3.1 | **The Second Take** | Lyra · tavern porch | Play a take, hear it back, fix one wrong note and record again | — (analogy) | Bard re-take; **K3.1**; music unlocks | — | `pg3.studio` | Hester |
| Q3.2 | **Trust the Evidence** | Hester · Evidence Board | Match each question to the evidence that answers it; learn where your judgment comes in | **Changes**, **Terminal**, **Browser**; a pull request in **Pull requests** | **M3.1**; **K3.2** | — | `pg3.evidence`, `pg3.judgment` | Dory |
| Q3.3 | **A Known-Good Hull** | Dory · Drydock 1 | Sound four planks, float the hull; carry a tool chest into a new dock; pull the bell cord | **+**, **New worktree**, **Interactive**, **View** > **Toggle Review Panel**, **Terminal**, **Run** | sounding; **K3.3** | **A3.1** | `pg3.baseline`, `pg3.snippets` | Cass |
| Q3.4 | **The Drydock Ring** | Cass · Drydock 2 | Walk the inner loop once: pick the plan, check the slate, sound and float, choose the check that shows the fix | **Create from**, **Branches**, **Plan**, **Exit plan mode and I will prompt myself**, **Changes**, **Browser**, **Local** | **P3.1** round 1, lap 1 | **A3.2** | `pg3.inner`, `pg3.fix`, `pg3.validate` | Cass (lap 2) |
| Q3.5 | **The Tide Gauge** | Cass · Drydock 2 | Walk the loop again: bolt on the gauge that would flood with the old leak | the same session; **Changes**; **Terminal** | **P3.1** round 1, lap 2 | **A3.3** | `pg3.regression` (chest C3.2: `pg3.refactor`) | Barty |
| Q3.6 | **A Second Opinion** | Barty · the Old Hulk | Show your log; act on the remark that names a real gap | `/` palette, `/rubber-duck` | **K3.6** | **A3.4** | `pg3.rubber-duck` | Stroud |
| Q3.7 | **Two Ledgers** | Stroud · Lock 1 office | Set the port in each ledger; find the practice work | **Issues**, **Assigned to me**, **All repositories**, **Pull requests**, **Authored by me** | **K3.7** | **A3.5** | `pg3.outer`, `pg3.find-work` | Stroud (the flight) |
| Q3.8 | **The Lock Flight** | Stroud · Lock 1 | Start the hull where the bug is, seal Gate 1, write an honest petition, watch Lockfall run the checks | **Create from** (not the issue's **New session**), **Create PR**, **Pull requests** | **P3.1** round 2, part 1 | **A3.6** | `pg3.issue-to-pr` | Arlo |
| Q3.9 | **Notes and Lamps** | Arlo · Lock 2 | Answer a whole chalk note; fix the hull, not the gauge; see the lamp run again; seal Gate 2; see why the Sea Gate stays shut | **New session** from a pull request; **Book app web** | **P3.1** round 2, part 2 | **A3.7**, **A3.8** | `pg3.review-comment`, `pg3.failing-check` (chest C3.3: `pg3.agent-merge`) | Ottoline |
| Q3.10 | **The Gate Light** | Ottoline · gatehouse | Pass the Trial; light the Gate Light | key takeaways | **Trial T3**, reflection | — | `pg3.takeaways` | Guildcrest (Chapter 04) |
| Q3.A | **Your Turn: Both Loops** (optional, after the Seal) | Ottoline · gatehouse | Run both loops on a small UI task in the app; come back and show what you've got | the assignment | **K3.9** | **A3.9** | `pg3.assignment` | — |
| Q3.B | **Pick & Polish** (optional) | Barty · the Old Hulk | Point the chalk spyglass at one sail; then try **Pick & Polish** in the app | **Pick & Polish** | — | **A3.10** | `pg3.pick-polish` | — |

### 4.2 Quest data (`courses/copilot-app/quests/keelhaven.json`)

`task` is the tracker line. `steps.start` sends you there; `ring` and `flight` are the puzzle's steps;
`done` says what you learned. The required quests have no `app` step: each card opens at its stop and
stays open while you work in the app (as Chapter 00's cards do). **I did it** asks what you saw; **Later**
goes on, and the Logbook's App checklist keeps the task. Only the optional quests use `try` and
`"orStop": true`, because their whole point is the app work.

| Id | `task` | `steps` |
|---|---|---|
| Q3.1 | Hear the Bard's tale | `start`: Lyra's playing on the tavern porch, at the quay's east end. · `done`: Record, listen, adjust, record again: that's the inner loop. The producer's checks are the outer loop. |
| Q3.2 | Learn what counts as evidence | `start`: Hester's Evidence Board stands by the river bridge. · `done`: The diff, tests and build, the running app and GitHub checks each answer their own question. You judge in both loops. |
| Q3.3 | Prove a known-good baseline | `start`: Dory's at Drydock 1, up the ramp. · `done`: Four tests pass and the build works before you change anything. Each new worktree needs its own npm install. |
| Q3.4 | Walk the inner loop | `start`: Cass runs Drydock 2. · `ring`: Walk the Drydock Ring: plan, change, inspect, test and build, preview. · `done`: Plan, change, inspect, test, build and preview. Repeat when the evidence shows a problem. |
| Q3.5 | Add a regression test | `start`: Talk to Cass again at Drydock 2. · `ring`: One more lap: add the gauge. · `done`: A regression test fails with the bug and passes with the fix. Don't weaken an expectation. |
| Q3.6 | Ask for a second opinion | `start`: Barty lodges in the Old Hulk, across the basin. · `done`: The rubber duck agent critiques your evidence before a pull request. You decide what to fix. |
| Q3.7 | Find work in Issues and Pull requests | `start`: Stroud keeps the harbour office at Lock 1. · `done`: Each view keeps its own repository selection. Practice pull requests are on Authored by me. |
| Q3.8 | Go from an issue to a pull request | `start`: Talk to Stroud again at Lock 1. · `flight`: Take the hull through Lock 1. · `done`: Start from the bug's branch, check the diff, claim only what you saw, open the pull request, and don't merge it. |
| Q3.9 | Answer a review comment and a failing check | `start`: Arlo keeps Lock 2. · `flight`: Bring both hulls through Lock 2. · `done`: Answer the whole comment. Fix the code, not the test. Merge only when the evidence agrees. |
| Q3.10 | Pass the Trial to earn the Seal | `start`: Ottoline keeps the Gate Light, through the rock cut. · `exam`: Ottoline's Trial is ready when you are. · `done`: The Seal of Keelhaven is yours. |
| Q3.A | Run both loops on a UI task | `start`: Ottoline has one more job. · `try`: Do the assignment in the app, then show Ottoline. · `done`: One focused UI change, an honest summary, and Book app web passes. |
| Q3.B | Try Pick & Polish | `start`: Barty has a spyglass for you. · `try`: Try Pick & Polish in the app, then tell Barty. · `done`: Pick & Polish attaches the element you pick to your next prompt. |

Each quest with an app card has a `link` ("Do it in the app ↗") to its section. `KEELHAVEN_ISLAND.next`:
"Guildcrest is next. Its guild saves this whole workflow as skills and agents." Thousand-Bough's `next`
changes when Keelhaven opens (it says "still being charted" today).

### 4.3 Cast

No two characters on the island share a voice (PLAN §7a). Bodies and palettes come from the character
library (`npc-palettes.ts`). Voices are chosen later (§8.3): three auditions per speaker, Dan approves.
Never a caricature accent.

| NPC (id) | Role | Look | Voice direction (ElevenLabs, `eleven_v3`) | One line |
|---|---|---|---|---|
| **Lyra Wren** (`lyra_keel`, body `lyra`) | the Wandering Bard | as before, plus a sea-green scarf and a fiddle | **keeps her voice** (Azure `en-GB-LibbyNeural`, rate −5 %) | "A musician doesn't keep the first take just because it's finished." |
| **Hester Vane** (`hester`) | master shipwright | woman, 50s; leather apron over a red-ochre shirt, chalk in her pocket, a mallet | plain-spoken, warm alto; light Cornish | "A confident response from Copilot isn't the same as validated software." |
| **Dory Pascoe** (`dory`) | yard apprentice, keeper of the tool chests | young woman, 20s; rolled sleeves, a tool belt, a sounding hammer | bright, quick; Irish (Dublin) | "Before you change a thing, prove the hull's sound." |
| **Cass Abara** (`cass`) | drydock foreman | woman, 30s; canvas coat, a slate and chalk, goggles on her cap | quick, sure, dry humour; London | "Pick the check that shows the bug, and shows the fix." |
| **Barty Quist** (`barty`) | surveyor from another port | man, 70s; long coat, spectacles, a carved wooden duck | slow, kind, exact; Norwegian English | "A different eye sees different gaps." |
| **Harbourmaster Stroud** (`stroud`) | keeper of the ledgers and Lock 1 | man, 60s; dark coat, brass buttons, a ledger | deep, slow, gravelly; Yorkshire | "Past this gate, work moves through GitHub." |
| **Arlo Fenwick** (`arlo`) | lock-keeper at Lock 2 | young man, 20s; oilskin, a lamp hook, a windlass key | cheerful tenor; Canadian English | "Filing down the gauge turns the lamp green and leaves the hull wrong." |
| **Ottoline Gage** (`ottoline`) | Keeper of the Gate Light and the Seal | woman, 60s; grey braid, a heavy wool cloak, a brass key on a chain | calm, dry contralto; New Zealand English | "A change is ready only when the evidence agrees." |
| **Bram Teller** (`bram`, body `kh_market`) | Model Market keeper | man, 40s; a fisherman's sweater under the keepers' apron and money pouch, a red-ochre cap | jovial baritone; South African English | "Hire a model that fits the job, Captain." |
| Juno, Wingman | first mate, parrot | existing | existing voices | — |

Extras (barks are text toasts; a bark that teaches cites its anchor): **Nip & Tuck** (kids racing model
hulls by the slipway), **Caulker Moll** (the crew at the plank stack; she carries the stray plank),
**Old Salter** (fisher on the beach, sits), **Kit** (lamplighter at Lock 3), the **tug skipper**. Sample
barks: "Every dock has its own tool chest. You can't borrow a hammer through a wall." `[§confirm-the-sample-app-is-ready]`
· "Unread alone? That won't show you a thing." `[§validate-the-fix]` · "The lamps light themselves. Lockfall
does the work." `[§fix-a-failing-check]`.

### 4.4 Scripts (order of steps)

Line ids are in §8.3. "Card" = the "Do this in the app" card (`{ "appTask": … }`); I did it → the "What
did you see?" question; Later → the script goes on. A stop says at most five lines before the player
acts.

| Script | Steps in order |
|---|---|
| `lyra` | `kh.lyra.01` → show `ch03/record-playback-retake-loop` → `kh.lyra.02` → **Bard re-take** (§7) → `kh.lyra.03` → show `ch03/producer-review-desk-github` → `kh.lyra.04` → quiz **K3.1** → page `pg3.studio` → music unlocks → `kh.lyra.05` → quest Q3.1 done |
| `hester` | `kh.hester.01` → `kh.hester.02` → show `ch03/development-loop` → `kh.hester.03` → quiz **M3.1** on the board → `kh.hester.04` → `kh.hester.05` → quiz **K3.2** → pages `pg3.evidence`, `pg3.judgment` → `kh.hester.06` |
| `dory` | `kh.dory.01` → `kh.dory.02` → **sounding** (§7) → `kh.dory.03` → **tool chest** (§7) → `kh.dory.04` → quiz **K3.3** → **bell cord** (§7) → `kh.dory.05` → `kh.dory.06` → page `pg3.baseline` (spyglass `ch03/app-workspace-panel`, optional hotspot **H3.1**) → page `pg3.snippets` → card **A3.1** → `kh.dory.07` |
| `cass` | `kh.cass.01` → `kh.cass.02` → quest Q3.4 `ring` → **P3.1 round 1, lap 1** (§5.2; its station lines `kh.cass.plan.*`, `kh.cass.03`, `kh.cass.stray`, `kh.cass.04`, `kh.cass.05`, `kh.cass.unread`, `kh.cass.06`) → `kh.cass.07` → pages `pg3.inner`, `pg3.fix`, `pg3.validate` → card **A3.2** → Q3.4 done |
| `cass.lap2` | `kh.cass.08` → quest Q3.5 `ring` → **P3.1 round 1, lap 2** (`kh.cass.gauge.*`) → `kh.cass.09` → page `pg3.regression` → card **A3.3** → chest C3.2 opens → `kh.cass.10` → Q3.5 done |
| `barty` | `kh.barty.01` → `kh.barty.02` → `kh.barty.03` → quiz **K3.6** (the remarks) → `kh.barty.04` → `kh.barty.05` → page `pg3.rubber-duck` → card **A3.4** → `kh.barty.06` (Q3.B offered: `kh.barty.polish`) |
| `stroud` | `kh.stroud.01` → show `ch03/issue-to-merged-pr` → `kh.stroud.02` → `kh.stroud.03` → **the ledgers** (§7) → quiz **K3.7** → `kh.stroud.04` → show `ch03/app-filter-repo` → page `pg3.find-work` → card **A3.5** → page `pg3.outer` → Q3.7 done |
| `stroud.flight` | quest Q3.8 `flight` → **P3.1 round 2, part 1** (§5.3; `kh.stroud.05`, `kh.stroud.06` at the slipway bell over `ch03/app-issue-new-session`, `kh.stroud.07` at the petition, `kh.stroud.08` at the lamps) → `kh.stroud.09` → page `pg3.issue-to-pr` → card **A3.6** → `kh.stroud.10` |
| `arlo` | `kh.arlo.01` → quest Q3.9 `flight` → **P3.1 round 2, part 2** (§5.3; `kh.arlo.02`, `kh.arlo.03` over `ch03/app-pr-review-comment`; `kh.arlo.04`, `kh.arlo.05` over `ch03/app-pr-failing-check`; `kh.arlo.weaken`; `kh.arlo.06`; `kh.arlo.actions`; `kh.arlo.07` at Gate 2; `kh.arlo.08` at the Sea Gate) → pages `pg3.review-comment`, `pg3.failing-check` → cards **A3.7**, **A3.8** → `kh.arlo.09` |
| `ottoline` | `kh.otto.01` → Trial **T3** |
| `trial.passed` | `kh.otto.02` → reflection (§6.5) → the Seal (§4.5) → page `pg3.takeaways` → `kh.otto.03` → card button **Continue learning: Chapter 04 ↗** → Q3.A offered: `kh.otto.assign.01` |

### 4.5 The Seal and what lights up

1. Ottoline turns the brass key; the **Gate Light** kindles white-gold (y 30).
2. **The lamps answer:** every lock lamp turns green, from Lock 3 up the flight to the basin (4 s); the
   ring lamps round Drydock 2 light; the tavern rings its bell.
3. The Gate Light's beam sweeps the reef once and settles on the open sea toward Guildcrest.
4. The practice hulls fly a white pennant: done, and still not merged. The Sea Gate stays shut.
5. The Chart: Keelhaven's light turns on (status `complete`); the fog lifts toward Guildcrest ("Coming
   soon" until it's built).
6. Reduced motion: the lamps turn on together over 2 s; no beam sweep; no camera move.

### 4.6 Optional quests (they finish where they start)

- **Q3.A, the assignment** (after the Seal, from Ottoline): `kh.otto.assign.01`, page `pg3.assignment`,
  quest `try`, then the card **A3.9** with `"orStop": true` (Later ends the talk; the quest stays open).
  When you come back, **K3.9** (the success criteria as a checklist), then `kh.otto.assign.back`, done.
- **Q3.B, Pick & Polish** (from Barty, any time after Q3.6): the **chalk spyglass** (§7), page
  `pg3.pick-polish`, quest `try`, card **A3.10** (`"orStop": true`), then `kh.barty.polish.back`, done.

### 4.7 The learning-journey lessons, applied

| Finding (review 2026-10-23) | Keelhaven |
|---|---|
| ~25 real-app actions were spoken mid-dialogue and never checked | Every real-app action is on a card with the course's exact steps (§6.2); the Logbook claims app work only when confirmed |
| The Logbook ticked work that was skipped | Honest ticks: each quest's `done` line says what you learned; app work shows "confirmed" only with I did it |
| Passive demos (Bo ran every tool check, all passed) | Every station is a decision with a wrong answer and a reason (§5). The only demos are the ring's "Change" (8 s) and the outer loop's inner-loop montage (6 s), both after the player has done that step themselves |
| Trial items were screenshot lookups (T2.7, T2.8) | T3 has scenario items only (§6.3). Hotspots H3.1 and H3.2 are optional spyglass moments |
| The assignment never completed; it was 220 m back | Q3.A starts and ends at Ottoline, and completes on the K3.9 checklist |
| No spaced recap for Chapter 02 | Battle 3 (§9) |
| Talk walls | ≤ 5 lines before an action; cards carry the step details, not voice |
| A Market rule the course doesn't teach | Bram's lines are the Chapter 01 rule as re-graded (MODEL-MARKET §5) |

---

## 5. Signature puzzle: Two Circuits (P3.1)

See [two-circuits.svg](island-03/two-circuits.svg). You walk both circuits. At each station you do the
step: you make the decision that the course asks you to make, and the station's lamp lights only when
the evidence is real. A wrong decision is never a dead end: the station says why (with the course's
reason and section) and the hull goes back to the step that fixes it.

### 5.1 How it maps to the course

| In the puzzle | In the course |
|---|---|
| The cove and its drydocks | "The inner loop happens on your machine" `[§learning-objectives]`, Key Takeaway 1 |
| A hull in its own drydock, with its own tool chest | a session in its own worktree; `npm install` in each new worktree `[§confirm-the-sample-app-is-ready]` |
| The ring's five stations and their lamps | Understand → Change → Inspect → Test & Build → Preview (`development-loop`) |
| A dark or red lamp sends the hull back to **Change** | "Repeat if the evidence reveals a problem" `[§inner-loop-develop-and-validate-on-your-machine]` |
| The slate: new timber chalked against old | the diff in **Changes** `[§core-concept-trust-the-evidence]` |
| A stray plank on another hull | a change you didn't ask for; revise it or discard that file `[§1-review-and-fix-a-bug]` |
| The sounding hammer; the float test | tests; the build `[§core-concept-…]` |
| The trial run seen from the lookout | the running app in **Browser** `[§core-concept-…]` |
| Your seal at the caisson | inner-loop judgment: "you decide whether the diff, tests, build, and preview show that the change is ready" `[§core-concept-…]` |
| The lock flight through the North Head | "The outer loop happens on GitHub" `[§learning-objectives]`, Key Takeaway 2 |
| The work-order ledger | the issue; **Issues** `[§4-find-work-…]` |
| The slipway bell vs Drydock 3 | the issue's **New session** starts from `main`; use **Create from** `[§5-start-…]` |
| Gate 1 (your seal after the slate) | the first approval gate (`issue-to-merged-pr`) |
| The petition up the mast | the pull request and its honest summary; **Create PR** `[§5-start-…]` |
| Lockfall fills the lock and lights the lamp | checks run on the pull request by themselves (CI) `[§fix-a-failing-check]` |
| A chalk note; a red lamp | review feedback; a failing check `[§6-address-…]` |
| The repair barge | a new session from the pull request (**New session**) `[§respond-to-a-review-comment]`, `[§fix-a-failing-check]` |
| Gate 2 (your seal when four lamps agree) | the second approval gate; Key Takeaway 6 |
| The Sea Gate stays shut | "Don't merge this practice pull request" `[§5-start-…]` |
| The tug | Agent Merge, "a finishing aid, not a replacement for human review" `[§fix-a-failing-check]` |

### 5.2 Round 1: the Drydock Ring (Q3.4, Q3.5)

The hull in Drydock 2 is the Book App on `practice-unread-count-bug`. In the world: the **tally board**
on its stern counts the unread books; with the bug it ignores the filters. You walk anticlockwise (seen
from above): the work-order **post** at the dock head (Understand) → the **plank stack** (Change) → the
**slate** (Inspect) → the **caisson** (Test & Build) → the **lookout** (Preview) → the post. One lap is
140 m. Each station lights its lamp (amber while it runs, green when the evidence is real, red when it
isn't). A camera (`ringCam`) shows the whole ring at each station's result for 2 s; the follow camera
returns after.

**Lap 1: the fix (Q3.4).**

| Station | What you do | Right | Wrong → result | Source |
|---|---|---|---|---|
| **Post** (Understand) | Attach the work order (`#2`, **Keep unread stats correct when filters are active**) and pick the plan | "Count the unread books from the books the filters show" | "Count every book, then hide the count when a filter is on" → "That hides the number. The plan has to connect the stats to the books you see." · "Change the test so it expects 5" → "That weakens a test. The plan fixes the code." | `[§1-review-and-fix-a-bug]` |
| **Stack** (Change) | Watch: Caulker Moll's crew fits two planks to the tally gear, and carries one plank to Drydock 1's hull (8 s; E skips) | — | — | `[§1-review-…]` |
| **Slate** (Inspect) | Read the chalk marks: two on the tally gear, one on Drydock 1's hull. Choose | "Pry off the stray plank" (a confirmation shows first) **or** "Ask the crew to revise it" | "Approve the slate as it is" → the lamp turns red: "The diff isn't focused. One mark is on another hull." The hull goes back to the stack (repeat) | `[§1-review-…]` |
| **Caisson** (Test & Build) | Tap the four lit planks with the sounding hammer (each rings), then pull the sluice: the dock floods and the hull floats | all four ring; she floats | — (lap 1 has no failure here). A plank tapped twice: "Already sounded. If the crew ran the tests and build, don't run them again." | `[§validate-the-fix]` |
| **Lookout** (Preview) | Choose the sea for the trial run: the filters to test | "**Fantasy** and **Unread**, search empty": only **The Night Circus** sails out, and the tally reads **1** (a ghost board shows the bug's **5**) | "**Unread** alone" → all five unread books sail out, tally 5: "This check can't tell the bug from the fix." · "Search `hobbit`" → "That's a different issue." | `[§validate-the-fix]` |
| **Post** (your seal) | "Is it ready?" Seal it, or send it back | "Seal: the diff is focused, the tests and build pass, the preview shows the fix" | "Seal: Copilot says it's done" → "That's a claim, not evidence." | `[§core-concept-trust-the-evidence]` |

Cass closes lap 1 with `kh.cass.07` ("One inner-loop cycle…") and the card **A3.2**.

**Lap 2: the regression test (Q3.5).** The same ring, with a new order: guard the old leak.

| Station | What you do | Right | Wrong → result | Source |
|---|---|---|---|---|
| **Post** | "What must the gauge prove?" | "It floods with the old leak and stays dry after the patch" | "It stays dry" → "A gauge that's always dry proves nothing." | `[§2-add-a-regression-test]` |
| **Stack** | Choose one of three gauges to bolt on | the **new gauge at the old leak** | the **always-dry gauge** → its lamp at the caisson lights green before *and* after the patch: "It passes with the bug too." · **lower the old high-water mark** → "That weakens an existing expectation." Both send the hull back to the stack | `[§2-add-…]` |
| **Slate** | Check the marks | one new gauge that checks the shown books (only **The Night Circus**, tally 1); no old mark moved | (if a wrong gauge got here, its mark shows red on the slate) | `[§2-add-…]` |
| **Caisson** | Sound five planks now (four old, one new), then float | all ring; she floats | — | `[§2-add-…]` |
| **Lookout** | The trial run again | unchanged: tally 1 | — | `[§validate-the-fix]` |
| **Post** | Seal it | — | — | `[§core-concept-…]` |

After lap 2, chest **C3.2** at the dock head opens: "Re-rig the hull while every gauge stays dry"
(`pg3.refactor`, the optional refactor block; `[§2-add-a-regression-test]`).

### 5.3 Round 2: the Lock Flight (Q3.8, Q3.9)

Three hulls take part. **Search Case** is yours (the issue-1 hull). **Empty-State Copy** and **Stats
Check** are the two seeded pull requests, already in the flight with their branch names on their sterns
(`fix-empty-state-copy`, `practice-failing-stats-check`). The camera `lockCam` shows each result.

**Part 1, at Lock 1 (Q3.8, Stroud).**

| Station | What you do | Right | Wrong → result | Source |
|---|---|---|---|---|
| **Ledger** (Issue) | Open the work order **Make search case-insensitive** (from Q3.7's Issues ledger) | — | — | `[§5-start-…]` |
| **Slipway bell** (Session) | The work order's bell rings at the main slipway. Choose where the hull starts | "Drydock 3, `practice-search-case-bug`, with **Create from**" | "The main slipway (the issue's **New session**)" → the hull there has no leak: "Search already works on `main`. Nothing to fix there." | `[§5-start-…]` |
| (montage) | The crew runs Drydock 3's ring: five lamps light in order; the lookout shows `hobbit` and `HOBBIT` giving the same result (6 s; E skips) | — | — | `[§5-start-…]` |
| **Slate** (Diff) | Read the marks at Lock 1 | "Only the search fix and its test: focused" | — (this slate is clean; the lesson was lap 1) | `[§5-start-…]` |
| **Gate 1** (approval) | Place your seal on the gate's post | seal | — | (`issue-to-merged-pr`) |
| **Petition** (Pull Request) | Build the summary from claim tiles, then hoist it (**Create PR**) | tiles that stick: "Search ignores letter case", "Added a focused regression test", "Tests and build passed in the terminal", "`hobbit` and `HOBBIT` match in the preview" | "CI passed" won't stick: "No check has run yet. Claim only what the terminal or CI output shows." · "Fixed every search bug" won't stick: "Claim what you checked." | `[§5-start-…]` |
| **Lamps** (Checks) | Watch: Lockfall's leat fills Lock 1 by itself; the **Book app web** lamp runs amber, then green | — | — | `[§fix-a-failing-check]` |
| **Basin** (no Merge) | The hull moves down to wait above the Sea Gate. Stroud: `kh.stroud.09` | — | — | `[§5-start-…]` |

**Part 2, at Lock 2 (Q3.9, Arlo).**

| Station | What you do | Right | Wrong → result | Source |
|---|---|---|---|---|
| **Chalk note** (Feedback) | *Empty-State Copy* has a note: more helpful guidance. The repair barge comes alongside (a **New session** from the pull request). Choose the revision | the message that names the **search term, genre and reading status** | "Names the search term only" → "That answers half the note." · "Rewrites the whole page" → "Make the smallest useful change." | `[§respond-to-a-review-comment]` |
| **Push** | Commit and push: the note is wiped; Lockfall runs the lamp again; green | — | — | `[§respond-…]` |
| **Red lamp** (Checks) | *Stats Check*'s **Book app web** lamp is red: the favorites ballast is wrong. The barge comes alongside. Choose | "Re-ballast the hull: count favorites for read **and** unread books; leave the gauge alone" | "File down the gauge (change the test's expected count)" → the lamp turns green and the hull lists: "Don't weaken the failing test." The barge undoes it · "Run the lamp again until it's green" → it stays red: "The code is still wrong." | `[§fix-a-failing-check]` |
| (montage) | The barge's own small ring: tests, build, preview (4 s) | — | — | `[§fix-a-failing-check]` |
| **Push** | Push: the lamp runs again; green | — | — | `[§fix-a-failing-check]` |
| **Gate 2** (approval) | Gate 2's post has four lamps: **diff**, **local**, **checks**, **review**. Three are lit. The fourth is your seal | seal when the first three are lit | sealing earlier is not possible: the post says which lamp is still dark | `[§key-takeaways]` 6 |
| **Sea Gate** (Merge) | The gate stays shut. Arlo: `kh.arlo.08`. The tug offers a tow: `kh.arlo.tug` (chest C3.3) | — | — | `[§5-start-…]`, `[§fix-a-failing-check]` |

Wingman, after part 2: "Two seals, Captain. And not one hull launched. That's the job." (no teaching; no cite).

### 5.4 Rules

- A station's lamp is **green** only when its evidence is real (right choice, or a demo that the player
  has already done once). **Red** sends the hull back to the station that fixes it (lap 1: the stack;
  lap 2: the stack; round 2: the barge). There's no fail state, no move limit and no timer.
- The order is fixed. The next station's lamp blinks; the compass points to it.
- A save at any station resumes at that station's start (POC §3.9 checkpoints).
- **Hints** (Wingman, Q; three tiers, this isn't a Trial): (1) a question ("Which check shows a different
  tally with the bug?"); (2) the right choice's reason, without the choice; (3) the right choice pulses.

### 5.5 Controls and accessibility

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Walk to a station | WASD / arrows | LS | the joystick |
| Use a station | E; click | A | tap the station button |
| Choose an option | 1–4, ↑/↓ then Enter; click | d-pad, A | tap (≥ 48 px) |
| Sound a plank | E on the lit plank; click | A | tap the plank button |
| Skip a demo | E | A | tap **Skip** |
| Hint | Q | Y | parrot button |
| Leave a station | Esc | B | **Leave** |

- Lamps show a symbol and a word (✓ **ready**, ✗ **not ready**, … **running**), never colour alone.
- Every choice and result goes to the live region. The text-only HUD works for the whole puzzle.
- Reduced motion: no camera moves (cuts), no hull rocking, water levels change by fades; the demos still
  play (they are the information) at the same length.
- Touch targets ≥ 44 px (station buttons 64 px).

### 5.6 State API (the `circuit` mechanic)

A new mechanic, `circuit`, with `courses/schemas/puzzle-circuit.schema.json`. The game owns the
places, the lamps and the order; the pack owns every word (prompts, options, reasons, sources) and binds
its ids to the game's with `"acts"`. Game code never names a course word (`neutral.test.ts`).

```ts
// src/game/puzzles/circuit/types.ts
export type RingPlace = 'post' | 'stack' | 'slate' | 'caisson' | 'lookout';
export type FlightPlace = 'ledger' | 'bell' | 'slate' | 'gate1' | 'petition' | 'lamps' | 'note' | 'redLamp' | 'gate2' | 'seaGate';
export type Lamp = 'dark' | 'running' | 'ready' | 'notReady';
export interface StationResult { place: RingPlace | FlightPlace; lamp: Lamp; backTo?: RingPlace | FlightPlace | 'barge'; reason?: string }
export interface CircuitState {
  round: 1 | 2;
  lap: 1 | 2;                      // round 1 only
  part: 1 | 2;                     // round 2 only
  at: RingPlace | FlightPlace;     // the station that waits for the player
  lamps: Readonly<Record<string, Lamp>>;
  picks: Readonly<Record<string, string>>;   // station → the option id picked last
  claims: readonly string[];       // the petition's tiles that stuck
  sealed: readonly ('caisson' | 'gate1' | 'gate2')[];
}
```

The logic is pure (`choose`, `advance`, `sealable`). Tests: every station has exactly one right option
(two at the slate: pry off or revise), every wrong option has a `backTo` and a sourced reason, Gate 2 is
sealable only with three lamps ready, and no allocation in `advance` after warm-up.

---

## 6. Checks, app cards, Trial and Logbook (`chapters/03-development-workflows.json`, `learning.json`)

`const ch = '03-development-workflows'`. Ids: `K` = choice or multi check, `M` = matching, `H` = hotspot,
`T3.x` = Trial items, `C3.x` chests, `B3.x` bottles, `pg3.*` pages. Every item has `source: src(anchor)`,
an `explain` pair and three hint tiers. The UI shuffles the options.

### 6.1 Stop checks

| Id | Type | Prompt | Answer | Distractors (feedback) | Source |
|---|---|---|---|---|---|
| **K3.1** | mc | "Why does Lyra's musician record the take again?" | **The play-back showed something to fix: listen, adjust, record again** | "The first take was finished, so it's done" ("Finished isn't the same as good. The play-back is the evidence.") · "To make the song longer" · "The producer asked for a new song" | `from-the-studio-from-take-to-final-mix` |
| **M3.1** | matching (the Evidence Board) | "Match each question to the evidence that answers it, and where you find it." | Is the change focused and understandable? ↔ the diff, **Changes** tab · Do the relevant tests and build complete? ↔ tests and build, **Terminal** tab · Does it behave as expected? ↔ the running app, **Browser** tab · Does CI agree with your local results? ↔ GitHub checks, the pull request in **Pull requests** | — | `core-concept-trust-the-evidence` |
| **K3.2** | mc | "Where does your own judgment come in?" | **In both loops: you decide if the local evidence shows it's ready, and when the pull request is ready to merge** | "Only at the merge" ("The outer loop has two approval gates, and the inner loop has your call too.") · "Only when a check fails" · "Copilot decides; you watch" | `core-concept-trust-the-evidence` |
| **K3.3** | mc | "Your new worktree session can't run the tests: packages are missing. Why?" | **Each new worktree needs its own `npm install`: dependencies aren't shared** | "The practice branch is broken" · "Copilot deleted them" · "Switch to Current checkout" ("That loses the isolation. Install in the worktree.") | `confirm-the-sample-app-is-ready` |
| **K3.6** | mc (Barty's remarks) | "Barty read your log. Which remark names a real gap to close before a pull request?" | **"Your test checks the count. Does it also check which books show?"** | "Did you run the build after the last change?" ("Your log shows the build passed after the last change. Already covered.") · "Paint the hull blue" ("Not about this change.") | `3-ask-for-a-second-opinion` |
| **K3.7** | mc (after the ledgers) | "You picked your fork in the Issues ledger. The Pull requests ledger still shows every port. Why?" | **Each view keeps its own repository selection: pick the fork there too** | "The pull requests were deleted" · "You need a new worktree" · "Type a query instead; the picker is broken" ("A typed query resets when you change tabs. The picker is easier.") | `4-find-work-in-issues-and-pull-requests` |
| **K3.9** | multi (Q3.A, back from the app) | "Your assignment pull request: what can you show?" | one focused UI change · a summary that lists only the checks you ran · **Book app web** passes · the preview at a wide and a narrow width | "It's merged into `main`" ("The assignment doesn't merge.") · "A summary that says every check passed" ("Only the checks you ran.") | `assignment` |
| **H3.1** | hotspot (optional, Dory's spyglass) | "Where does the baseline show its result?" | `terminal-result` | §1.4 | `confirm-the-sample-app-is-ready` |
| **H3.2** | hotspot (optional, Arlo's spyglass) | "Which check failed?" | `failed-check` | §1.4 (never **Ready to merge**) | `fix-a-failing-check` |

Check ids follow their quest (K3.6 is Q3.6's); K3.9 is the assignment's (Q3.A). The puzzle's own
decisions (§5) are not quizzes: they don't enter the recap.

### 6.2 "Do this in the app" cards (`learning.json` → `appTasks`)

Each card has one to four steps in the course's words (`**bold**` UI names, `` `code` ``), a `why`, its
`source`, and a `seen` question that tests understanding (one `answer`, as built). **No card has a
`check`** (K8). Numbers like `#2` can differ in a fork: each step that types one also gives the title.

| Id | Quest | Title | Steps | Why | Seen: prompt → answer (other options) | Source |
|---|---|---|---|---|---|---|
| **A3.1** | Q3.3 | Check a known-good baseline | 1. Point to the `copilot-app-for-beginners` project in the sidebar and select **+**. Check that the workspace selector shows **New worktree**. 2. Set the mode to **Interactive** and ask Copilot to summarize the `@samples/book-app-web` test framework and build tool. 3. Select **View** > **Toggle Review Panel**, then **Terminal** (no tab? **+**, then **Terminal**). 4. Run `cd samples/book-app-web`, `npm install`, `npm test -- --run`, then `npm run build`. If Copilot's reply shows a **Run** button by a snippet, you can use it. | Tests and a build that pass before you change anything are your known-good baseline. | "How many tests passed?" → **Four** ("None: they failed" → check that you ran `npm install` in this worktree · "I couldn't find **Terminal**" → **View** > **Toggle Review Panel**) | `confirm-the-sample-app-is-ready`, `running-code-snippets-in-the-terminal` |
| **A3.2** | Q3.4 | Fix the unread-count bug | 1. Select **Create from**, then **Branches**, then `practice-unread-count-bug` (a new worktree). 2. Type `#2` and select **Keep unread stats correct when filters are active** (another number? type `#` and pick it by title). 3. In **Plan** mode, ask for a plan from the issue. Review it, select **Exit plan mode and I will prompt myself**, and ask Copilot to implement it. 4. Inspect **Changes**, check the tests and build, run `npm run dev`, and open **Browser** with the **Local** URL. Set **Fantasy** and **Unread**. Stop the server with `Ctrl+C`. | One full inner-loop cycle: plan, change, inspect, test, build and preview. | "With **Fantasy** and **Unread**, what's the unread count now?" → **1, with only The Night Circus** ("5" → the fix isn't in: check **Changes** and reload · "I didn't open the preview") | `1-review-and-fix-a-bug`, `validate-the-fix` |
| **A3.3** | Q3.5 | Add a regression test | 1. In the same **Interactive** session, ask for a focused test: **Fantasy** and **Unread**, empty search, only **The Night Circus**, unread count 1. 2. Ask that it fails with the original bug and passes with the fix. 3. In **Changes**, check that it tests the visible filtered results and doesn't weaken an existing expectation. 4. Run `npm test -- --run` and `npm run build`. | A regression test proves the bug would fail before the fix and pass after. | "What does your new test check?" → **The books the filters show, and the unread count** ("That the build finishes" · "It changed an old expectation" → ask Copilot to revise it) | `2-add-a-regression-test` |
| **A3.4** | Q3.6 | Ask for a second opinion | 1. In the same session, type `/` to open the slash-command palette. 2. Send `/rubber-duck` and ask it to critique the session's diff, tests and browser validation, and what to check before a pull request. 3. Compare the critique with your evidence, and fix the gaps that matter. 4. No `/rubber-duck`? Choose a different model for the session, or send the same request without the slash command. | A constructive critic finds missing evidence or assumptions before a pull request. | "What did you get back?" → **A critique: gaps and assumptions to check** ("A merged pull request" · "New tests that it ran") | `3-ask-for-a-second-opinion` |
| **A3.5** | Q3.7 | Find your work in Issues and Pull requests | 1. Open **Issues**, stay on **Assigned to me**, and in the repository picker choose **All repositories**, then your fork. 2. Open **Pull requests** and choose your fork in its picker too. 3. On **Authored by me**, find the practice pull requests. 4. Open one: it shows its title, repository, number and status. | Each view keeps its own repository selection. | "Which of these is a pull request on **Authored by me**?" → **Failing stats check practice** ("Make search case-insensitive" → that's an issue · "Keep unread stats correct when filters are active" → an issue). The prompt asks for a title, not a count: the count changes as you work | `4-find-work-in-issues-and-pull-requests` |
| **A3.6** | Q3.8 | From an issue to a pull request | 1. Open **Make search case-insensitive** in **Issues**. Don't use its **New session** button: it starts from `main`. Select **Create from** > **Branches** > `practice-search-case-bug`, and type `#1` (or `#` and pick it by title). 2. In **Plan** mode, ask for a plan that names the files and the tests or browser checks. Then **Exit plan mode and I will prompt myself** and ask for the fix with a focused regression test. 3. Inspect **Changes**, run the tests and build, and preview: `hobbit` and `HOBBIT` give the same result. Stop the server with `Ctrl+C`. 4. Ask for a pull request summary that claims only checks you saw, select **Create PR**, and don't merge it. | Main already has the fix, so this pull request is practice: it stays open. | "What does your pull request's summary claim?" → **Only the checks I saw in the terminal or CI output** ("That every check passed" · "Nothing about validation") | `5-start-from-an-issue-and-open-a-pull-request` |
| **A3.7** | Q3.9 | Answer a review comment | 1. In **Pull requests**, on **Authored by me**, open **Improve empty-state copy** and find the comment that asks for more helpful guidance. 2. Select **New session** at the top of the pull request. Ask Copilot to address the comment with the smallest useful change and to show the diff and validation plan first. 3. Check that the new message answers the whole comment. 4. Ask Copilot to commit and push, then confirm the update on the pull request. | A review comment is evidence too: answer all of it. | "What does the new message tell the reader?" → **That they can change the search term, genre or reading status** ("Only to change the search term" → that's half the comment · "Nothing changed"). Already done in an earlier play? The same answer stands | `respond-to-a-review-comment` |
| **A3.8** | Q3.9 | Fix a failing check | 1. Open **Failing stats check practice** and read the failed **Book app web** check. 2. Select **New session**. With your own prompt, ask Copilot to analyze the failing check and propose the smallest fix, without weakening the failing test. 3. Inspect the diff (favorites count for read and unread books; the test is unchanged), then run the tests, build and preview. Stop the server. 4. Commit and push, then check that **Book app web** runs again and passes. | Don't mark a pull request ready until the local and GitHub evidence agree. | "What did **Book app web** show after your push?" → **It ran again and passed** (after my push, or already from an earlier play). Other options: "No check started" → explain: new forks start with workflows off. Turn them on in your fork's **Actions** tab (card **A0.6**), then push again `[00 §add-the-course-practice-items]` · "It still failed" → compare the Node.js version, the installed dependencies, the branch, environment variables and generated files `[§local-results-and-ci-dont-agree]` | `fix-a-failing-check` |
| **A3.9** | Q3.A | Your turn: both loops on a UI task | 1. Pick a small UI task: Issue 4, **Polish book card spacing and responsive layout**, with **Create from** > **Branches** > `practice-card-polish`. Did Pick & Polish already? Start a new session from `main` for the filter-row labels or helper text. 2. Use **Plan** mode to define one small UI improvement, then **Interactive** to build it. Inspect the diff. 3. Run `npm test -- --run` and `npm run build`, and preview at a wide and a narrow width (drag the review panel's left edge). 4. Open a pull request whose summary lists only the validation you did, and check in **Pull requests** that its checks pass. | Both loops, on your own: one focused change with honest evidence. | (K3.9 at the return) | `assignment` |
| **A3.10** | Q3.B | Try Pick & Polish | 1. **Create from** > **Branches** > `practice-card-polish`. Run `npm install`, `npm run build` and `npm run dev`, and open **Browser** with the **Local** URL. 2. Select **Pick & Polish** in the browser toolbar, then a book card's empty background. 3. Ask for a small spacing and hierarchy change, and preview it. 4. Inspect the diff, stop the server, and run the tests and build. | A visual change still needs the same diff, test, build and browser evidence. | "What showed in the prompt box after you picked the card?" → **An `article.book-card` attachment** ("The whole page's code" · "Nothing") | `3-ask-for-a-second-opinion` |

**The risks, handled honestly:**

- **Actions off on new forks.** Without workflows, **Book app web** never runs. A3.8's "No check
  started" option says how to turn them on and points to Chapter 00's card A0.6. Arlo says it too
  (`kh.arlo.actions`), for every player: it's one line, and true.
- **Exercises change the seeded pull requests for good.** After step 6, the failing check is fixed and
  the comment is answered. A second play (or a new course save on the same fork) can't redo them. A3.7
  and A3.8 accept "already done" as the right answer, and the puzzle's hulls don't depend on GitHub.
- **No setup script, or no pull request rights** `[§prerequisites]`. Every card has **Later**; nothing
  on the main path waits for GitHub. The Seal needs the Trial only.
- **`/rubber-duck` may be missing** (no suitable critic model). A3.4's step 4 is the course's fallback.
- **The Run button "may" show.** A3.1 says "if".
- **A dev server left running** from Chapter 02 or an earlier step takes the port. Each card that runs
  `npm run dev` ends with `Ctrl+C`; bottle B3.1 covers a preview that doesn't update.

### 6.3 The Gate Light Trial (T3)

Ten items. Pass with all correct; retries allowed; hint tier 3 off (as T2). Every item is a scenario:
no screenshot lookups. Coverage: Key Takeaways 1–2 (T3.10 and the puzzle), 3 (T3.2, T3.3), 4 (T3.4),
5 (T3.6), 6 (T3.1, T3.8); objectives in §6.5.

| Id | Prompt | Answer | Wrong options (why) | Source |
|---|---|---|---|---|
| T3.1 | "Copilot says the fix is done and every test passes. When is the change ready?" | When the diff, local validation, GitHub checks and human review agree | "When Copilot's summary says so" (a confident response isn't validated software) · "When the build passes" (one surface) · "When CI is green" (no diff, no review) | `key-takeaways`, `core-concept-trust-the-evidence` |
| T3.2 | "The preview works, but **Changes** shows edits to a file you didn't ask for. What next?" | Ask Copilot to revise, or discard that file's changes, before you go on | "Open the pull request: the preview works" · "Weaken a test to match" · "Merge and fix it later" | `1-review-and-fix-a-bug` |
| T3.3 | "Which preview check proves the unread-count fix?" | **Fantasy** and **Unread**, search empty: only **The Night Circus**, unread count 1 | "**Unread** alone" (all five unread books still show) · "Search `hobbit`" (another issue) · "The build passes" (no behaviour) | `validate-the-fix` |
| T3.4 | "What must a regression test do?" | Fail with the original bug and pass with the fix | "Pass before and after" · "Change an existing expectation so it passes" · "Run only the build" | `2-add-a-regression-test` |
| T3.5 | "When does `/rubber-duck` help most in this chapter?" | After you have the diff, tests and browser evidence, before you open a pull request | "To merge the pull request" · "Instead of your own review" · "To run the tests" | `3-ask-for-a-second-opinion` |
| T3.6 | "Issue 1's bug is only on `practice-search-case-bug`. How do you start the session?" | **Create from** → **Branches** → `practice-search-case-bug`, then attach `#1` | "The issue's **New session** button" (it starts from `main`) · "**+** with **Current checkout**" · "A chat" (a chat can't change files) | `5-start-from-an-issue-and-open-a-pull-request` |
| T3.7 | "Your pull request summary says 'CI passed', but no check has run. What do you do?" | Remove the claim: report only what the terminal or CI output shows | "Keep it: CI will pass" · "Wait to open the pull request until CI passes" (CI runs on the pull request) · "Delete the validation section" | `5-start-…`, `assignment` |
| T3.8 | "**Book app web** fails. Copilot suggests changing the test's expected count. What do you do?" | Refuse: ask for the smallest code fix and keep the test | "Accept: the check turns green" · "Run the check again until it passes" · "Merge: the local tests pass" | `fix-a-failing-check` |
| T3.9 | "Tests pass in your session, but CI fails. What do you compare first?" | Node.js version, installed dependencies, branch contents, environment variables and generated files | "Turn off the check" · "Merge: local is enough" · "Reinstall the app" | `local-results-and-ci-dont-agree` |
| T3.10 | "Where does human judgment fit?" | In both loops: on your machine you decide if the evidence shows it's ready; on GitHub you decide when the pull request is ready to merge | "Only at the merge" (two gates) · "Agent Merge does it" (a finishing aid, not a replacement for review) · "Only on GitHub" | `core-concept-trust-the-evidence`, `outer-loop-move-the-work-through-github` |

Spares (for a re-roll or a recap): **T3.11** (each view keeps its own repository selection,
`4-find-work-…`) and **T3.12** (tests fail in one new session → install in that worktree and check its
branch, `tests-fail-only-in-one-session`). Reward: `{ seal: 'Seal of Keelhaven', doubloons: 70 }`.

### 6.4 Logbook pages, chests, bottles, glossary

Captions are 1–3 plain sentences in the game's voice (`**bold**` for UI names). Pages with app steps are
reveal cards, not silent pages (Chapter 02 R4).

| Page | Title | Image | Caption gist | Source |
|---|---|---|---|---|
| `pg3.studio` | From take to final mix | `record-playback-retake-loop` | record, listen, adjust, record again; the producer's checks | `from-the-studio-…` |
| `pg3.evidence` | Trust the evidence | `development-loop` | the four kinds of evidence, where each is, what it checks | `core-concept-trust-the-evidence` |
| `pg3.judgment` | Your judgment, twice | — | the inner-loop call and the outer-loop call | `core-concept-…` |
| `pg3.baseline` | A known-good baseline | `app-workspace-panel` | the steps; four passing tests and a build; `npm install` per worktree | `confirm-the-sample-app-is-ready` |
| `pg3.context-layers` (C3.1) | How Copilot gets context | `context-layers` | prompt, settings, instructions, repo files; keep each layer focused | `confirm-…` (optional block) |
| `pg3.snippets` | Run a snippet | — | copy into **Terminal**, or **Run** when it shows; the shell keeps its state | `running-code-snippets-in-the-terminal` |
| `pg3.inner` | The inner loop | `development-loop` | the six steps | `inner-loop-…` |
| `pg3.fix` | Fix a bug from an issue | — | **Create from**, `#2`, **Plan**, **Exit plan mode and I will prompt myself**, **Changes**, the discard action | `1-review-and-fix-a-bug` |
| `pg3.validate` | Validate the fix | — | don't run twice; **Browser** and the **Local** URL; **Fantasy** + **Unread**; `Ctrl+C` | `validate-the-fix` |
| `pg3.regression` | A regression test | — | fails before, passes after; don't weaken | `2-add-a-regression-test` |
| `pg3.refactor` (C3.2) | Refactor behind the tests | — | small helpers, same behaviour; fix the code, not the expectation | `2-add-…` (optional block) |
| `pg3.rubber-duck` | A second opinion | — | `/rubber-duck`, a different model when available, the fallback | `3-ask-for-a-second-opinion` |
| `pg3.pick-polish` | Pick & Polish | `app-pick-and-polish` | pick an element, an `article.book-card` attachment, the same evidence after | `3-ask-…` (optional block) |
| `pg3.outer` | The outer loop | `issue-to-merged-pr` | six steps; two approval gates; back to the session on feedback | `outer-loop-…` |
| `pg3.find-work` | Issues and Pull requests | `app-filter-repo` | tabs, the repository picker, each view's own pick, **Custom** | `4-find-work-…` |
| `pg3.issue-to-pr` | From an issue to a pull request | `app-issue-new-session` | why not the issue's **New session**; the honest summary; **Create PR**; don't merge | `5-start-…` |
| `pg3.review-comment` | Answer a review comment | `app-pr-review-comment` | **New session** from the pull request; the whole comment; commit and push | `respond-to-a-review-comment` |
| `pg3.failing-check` | Fix a failing check | `app-pr-failing-check` | what a CI check is; read it; don't weaken the test; it runs again | `fix-a-failing-check` |
| `pg3.agent-merge` (C3.3) | Agent Merge | `human-judgment-loop` | when it fits, when not, "a finishing aid" | `fix-a-failing-check` (optional block) |
| `pg3.takeaways` | Key takeaways | — | the six takeaways | `key-takeaways` |
| `pg3.assignment` | Your turn: both loops | `shared/assignment` | the steps and the success criteria | `assignment` |
| `B3.1` | Preview doesn't update? | — | the server in this session's worktree; the **Local** URL | `browser-preview-doesnt-update` |
| `B3.2` | Tests fail in one session? | — | install in that worktree; check its branch | `tests-fail-only-in-one-session` |
| `B3.3` | Can't see an issue or pull request? | — | the tab, the repository picker, access, policy | `i-cant-see-an-issue-or-pull-request` |
| `B3.4` | Local and CI disagree? | — | Node.js, dependencies, branch, environment variables, generated files | `local-results-and-ci-dont-agree` |
| `B3.5` | Pull request still blocked? | — | checks reran, comments resolved, merge rules | `a-pull-request-is-still-blocked` |

Chests: `{ id: 'C3.1', page: 'pg3.context-layers', doubloons: 10 }`, `{ id: 'C3.2', page: 'pg3.refactor',
doubloons: 15 }`, `{ id: 'C3.3', page: 'pg3.agent-merge', doubloons: 10 }`; bottles `B3.1`–`B3.5` (5
each, `kind: 'bottle'`).

Glossary (from `GLOSSARY.md`, each links its anchor): Inner loop · Outer loop · Review panel · Diff ·
CI check · Issues · Pull requests · PR · Create from · Rubber duck · Pick & Polish · Agent Merge.
Plus "Regression test" (defined in `2-add-a-regression-test`).

### 6.5 Learning-system data (`learning.json`, `course.json`)

**Objectives** (verbatim, `learning-objectives`) and what covers them:

| Id | Objective | Quests / puzzle | Quizzes | App tasks |
|---|---|---|---|---|
| O3.1 | Use the review panel, tests, build output, and browser preview to validate a local change | Q3.3, Q3.4, `circuit` | M3.1, T3.2, T3.3 | A3.1, A3.2 |
| O3.2 | Run code snippets directly from Copilot's responses using the Run button or copy and paste them into the terminal | Q3.3 | — (taught in A3.1 and `pg3.snippets`) | A3.1 |
| O3.3 | Add a regression test and ask the rubber duck agent to critique your work | Q3.5, Q3.6 | K3.6, T3.4, T3.5 | A3.3, A3.4 |
| O3.4 | Use the **Issues** and **Pull requests** views to move from an issue to a pull request | Q3.7, Q3.8 | K3.7, T3.6, T3.7 | A3.5, A3.6 |
| O3.5 | Ask GitHub Copilot to address review comments and failing checks | Q3.9 | T3.8, T3.9 | A3.7, A3.8 |
| O3.6 | Explain where human judgment fits in both loops | Q3.2, `circuit` | K3.2, T3.1, T3.10 | — |

**Reflection** (before the Seal, as built): "Before your Seal: which of these will you use first?" with
the six Key Takeaways as choices (`inner`, `outer`, `panel`, `tests`, `views`, `agree`), source
`key-takeaways`.

**Recap** (as built, D5): add K3.9 to `recap.exclude` (it asks about the player's own app work). The other
K3.x, M3.1 and T3.x join the schedule when met.

**`course.json`:** `islands[keelhaven]` gets `seal: "Seal of Keelhaven"`, `arrival` (§4.0), and the fifth
topic "Human judgment in both loops" (O10). `hooks.islands.keelhaven`: `landing: ["kh.juno.arrive.01",
"kh.juno.arrive.02"]`, `welcome: ["wingman.kh.01", "wingman.kh.02", "@nav", "@starfish"]`, `tips: { nav:
"wingman.kh.03", starfish: "wingman.starfish.keelhaven" }`. `hooks.battles` gets battle 3 (§9).

---

## 7. Smaller interactions (the island feels alive)

| Id | Where | What | Controls | Teaches |
|---|---|---|---|---|
| **Bard re-take** (puzzle `retake`, mechanic `ceremony`) | Q3.1, tavern porch | Lyra plays a 6 s take on the fiddle. **Play back**: one note rings wrong (a red ripple on the music line). Choose the bar to fix, then **Record again**: the take plays clean and the island music fades in | E / 1–3 / tap (≥ 48 px) | record, listen, adjust, record again |
| **Evidence Board** (the matching quiz M3.1, shown on the board) | Q3.2 | Four salvaged name boards hold four questions; four instruments hang below (the slate, the hammer and float, the spyglass, the lock lamp), each with its app name. Hang each question over its instrument | drag, or pick then place (keys 1–4) | the evidence table |
| **Sounding** | Q3.3, Drydock 1 | Four planks light in turn; tap each with the sounding hammer (it rings true); pull the sluice: the dock floods and the hull floats | E on the lit plank; E on the lever | four passing tests and a build |
| **Tool chest** | Q3.3 | Dory asks you to carry a chest into Drydock 2. Drydock 2's rack is empty until you set it down (a 3 s carry) | E to lift, E to set down | `npm install` in each new worktree |
| **Bell cord** | Q3.3 | A work-order slip hangs by a bell cord. Pull the cord, and the winch on the slip runs where it stands (the **Run** button); carry the slip to the winch and turn it by hand (copy and paste). The winch keeps its place for the next order | E | the two ways to run a snippet; the shell keeps its state |
| **Strata cut** (C3.1) | the ramp | Tap each of four rock bands in the cut: prompt, settings, instructions, repo files | E per band | context layers; keep each layer focused |
| **The ledgers** | Q3.7, Stroud's counter | Two ledgers, **Issues** and **Pull requests**, each with a port dial. Set the Issues dial to your fork; open the Pull requests ledger: its dial still reads "all ports". Then K3.7 | E, ←/→ on the dial | each view keeps its own repository selection |
| **Chalk spyglass** (Q3.B) | Barty, optional | Point the spyglass at one sail of a model hull; a chalk ring marks it and the mark shows on the order slip | aim with the mouse or LS, E | Pick & Polish attaches what you pick |
| **The tug** (C3.3) | below Lock 3 | The tug skipper offers to tow a hull out "when the harbour allows". The Sea Gate stays shut; the chest opens | E | Agent Merge, and why the course doesn't use it |
| **Life** | everywhere | kids racing model hulls by the slipway; crows on the sheerlegs; a cat on the tavern rail; Old Salter's line twitching; Kit lighting lamps at dusk | — | — |

---

## 8. Audio

### 8.1 Music (D4)

- **Track:** "Salty Sway" (`music_salty_sway`, "Maritime folk, instrumental", LUFS −15.3). Move it from
  `SPARE_TRACKS` to `MUSIC_TRACKS.keelhaven` in `src/audio/music/tracks.ts`; `IslandMusic` gets
  `'keelhaven'`. The files are in `public/audio/`, `tools/music/fetch.sh`, `ASSETS.md` and
  `ART_PROVENANCE.md` already. Add "Salty Sway" to `CreditsScreen.tsx` and `public/audio/CREDITS.md`.
- **Unlock:** Lyra's re-take (Q3.1) unlocks it in the Songbook.
- **Prefetch** it when the ship comes within Keelhaven's `load` range and on travel.
- **Stingers:** `chime_solve` for each lap and part of P3.1; the Seal sound as on the other islands.

### 8.2 Ambience and SFX (≤ 5 MB for the island, PLAN §7)

| File | Use | Status |
|---|---|---|
| `surf_far`, `surf_wash`, `pier_lap`, `boat_lap` | coast, quay, cove | existing |
| `waterfall_large` | Ribbon Falls, Lockfall (positional) | existing (Thousand-Bough) |
| `waterfall_small`, `stream` | Hanging Fall from the sea, the river | existing |
| `wind`, `palms`, `bird_forest` | the ridges, the beach, the valley | existing |
| `step_wood`, `step_rock`, `step_sand`, `step_grass`, `step_water` | footsteps by surface | existing |
| `gate_lift`, `lever`, `crane_ratchet`, `timber_creak_groan`, `splash`, `chime_solve` | lock gates, sluices, the sheerlegs, the barge | existing |
| `tavern_murmur` | inside and near the tavern (bed) | **new**, Freesound CC0 |
| `shipyard_work` | mallets, saws, caulking irons (bed, the terrace) | **new**, Freesound CC0 |
| `crow_call` (3 variants) | crows on the sheerlegs and the ridges (PLAN §6) | **new**, Freesound CC0 |
| `reef_surf` | waves breaking on the reef (positional, outside the cut) | **new**, Freesound CC0 |
| `sounding_hammer`, `lock_bell`, `seal_stamp` | the planks, the lamps changing, your seal | **new**, ElevenLabs Sound Effects or Kenney CC0 |
| `fiddle_take` (2: the wrong note, the clean take) | the Bard re-take, matched to Salty Sway's key | **new**, ElevenLabs Sound Effects or a Suno stem of the track |

Log every new file in `ASSETS.md` (CC0) or `ART_PROVENANCE.md` (AI). Beds duck under voice; positional
sounds use HRTF; captions for important cues (the wrong note, a lamp red or green, a gate opening, the
Seal).

### 8.3 Voice

- Pipeline: `tools/voice/generate.ts` with the lines in `courses/copilot-app/voice/lines.json` and each new
  speaker in `voice/cast.json` (`"tts": "elevenlabs"`, `eleven_v3`, through the signed-in `elevenlabs`
  CLI; no key in the repo). Generate only the new lines (`--only Hester,Dory,…`), then `npm run
  voice:lipsync`.
- Casting: for each new speaker, audition **three Voice Library voices** against §4.3 with two real
  lines; Dan picks one; record the voice id and name in `cast.json`, `docs/voices.md` and
  `ART_PROVENANCE.md`. No two speakers share a voice. Lyra keeps Azure `en-GB-LibbyNeural`.
- Ids: `kh.<speaker>.<beat>` (Keelhaven), `wingman.kh.*`, and `kh.bram.market.*` for the stall.
- Every teaching line cites its section in `chapters/03-development-workflows.json` → `voiced` (or
  `cited` for unvoiced puzzle text). A line marked "flavour" or "nav" teaches nothing and needs no cite.
- Volume: about 95 island lines + 13 market lines + about 24 hint lines ≈ **130 lines** (≈ 3.2 MB at
  32 kbps Opus).

**The lines** (`[§…]` = Chapter 03 unless marked):

| Id | Speaker | Text | Cite |
|---|---|---|---|
| `kh.juno.arrive.01` | Juno | Keelhaven, Captain. Shipwrights, a tavern, and a lock flight cut right through the headland. | flavour |
| `kh.juno.arrive.02` | Juno | They say nothing leaves this yard on a confident guess. Every hull proves itself first. | `[§core-concept-trust-the-evidence]` |
| `wingman.kh.01` | Wingman | Wrecks on the reef! I'm staying well clear of the reef. | flavour |
| `wingman.kh.02` | Wingman | Two circuits here, Captain: the drydocks in the cove, then the locks out to sea. | `[§learning-objectives]` |
| `wingman.kh.03` | Wingman | Lost? Follow the compass, or head for the Gate Light on the North Head. | nav |
| `wingman.starfish.keelhaven` | Wingman | Five starfish on Keelhaven. One's up by the falls, if you fancy a walk. | nav |
| `kh.lyra.01` | Lyra | Captain! A musician doesn't keep the first take just because it's finished. | `[§from-the-studio-from-take-to-final-mix]` |
| `kh.lyra.02` | Lyra | They record, listen, adjust and record again. That's the inner loop: make a change, then inspect the evidence. | `[§from-the-studio-…]` |
| `kh.lyra.03` | Lyra | Then the producer tracks the brief, the feedback, the quality checks and the final approval. | `[§from-the-studio-…]` |
| `kh.lyra.04` | Lyra | That's the outer loop: issues and pull requests move validated work through GitHub. | `[§from-the-studio-…]` |
| `kh.lyra.05` | Lyra | Hester's board is by the river bridge. She'll show you what counts as evidence. | nav |
| `kh.hester.01` | Hester | I pulled those name boards off the reef, Captain. Every one of them sailed on a confident guess. | flavour |
| `kh.hester.02` | Hester | A confident response from Copilot isn't the same as validated software. | `[§core-concept-trust-the-evidence]` |
| `kh.hester.03` | Hester | So we check four kinds of evidence. Each one answers its own question. | `[§core-concept-…]` |
| `kh.hester.04` | Hester | Your judgment comes in twice. On your machine, you decide if the diff, tests, build and preview show it's ready. | `[§core-concept-…]` |
| `kh.hester.05` | Hester | On GitHub, you review the pull request, its comments and checks, and decide when it's ready to merge. | `[§core-concept-…]` |
| `kh.hester.06` | Hester | Dory's at Drydock 1, up the ramp. Start with a hull you know is sound. | nav |
| `kh.dory.01` | Dory | Before you change a thing, prove the hull is sound. That's your known-good baseline. | `[§confirm-the-sample-app-is-ready]` |
| `kh.dory.02` | Dory | In the app, that's a new worktree session, the review panel, and its Terminal tab. | `[§confirm-…]` |
| `kh.dory.03` | Dory | Four planks ring true: four passing tests. And she floats: the build works. | `[§confirm-…]` |
| `kh.dory.04` | Dory | Every dock has its own tool chest. Run npm install the first time you use a new worktree. | `[§confirm-…]` |
| `kh.dory.05` | Dory | A reply may show a Run button by a snippet. Or copy the snippet into the Terminal tab yourself. | `[§running-code-snippets-in-the-terminal]` |
| `kh.dory.06` | Dory | The terminal keeps its shell, so where you were and what you set carry over. | `[§running-code-snippets-…]` |
| `kh.dory.07` | Dory | Cass runs Drydock 2, next along. Mind her slate. | nav |
| `kh.cass.01` | Cass | This ring's the inner loop: understand, change, inspect, test and build, preview. And again if the evidence says so. | `[§inner-loop-develop-and-validate-on-your-machine]` |
| `kh.cass.02` | Cass | Today's work order: the unread count ignores the filters. Read it, then pick the plan. | `[§1-review-and-fix-a-bug]` |
| `kh.cass.plan.ok` | Cass | Right. The count has to come from the books the filters show. | `[§1-review-…]` |
| `kh.cass.plan.hide` | Cass | That hides the number. The plan has to connect the stats to the books you see. | `[§1-review-…]` |
| `kh.cass.plan.test` | Cass | Changing the test weakens it. The plan fixes the code. | `[§2-add-a-regression-test]` |
| `kh.cass.03` | Cass | Now the slate. Is every chalk mark part of this job? | `[§1-review-…]` |
| `kh.cass.stray` | Cass | That plank's on the wrong hull. Pry it off or have the crew revise it, and you'll get a confirmation first. | `[§1-review-…]` |
| `kh.cass.04` | Cass | Hammer and float. If the crew already ran them, don't run them twice. | `[§validate-the-fix]` |
| `kh.cass.05` | Cass | Up the lookout. Pick the check that shows the bug, and shows the fix. | `[§validate-the-fix]` |
| `kh.cass.unread` | Cass | Unread alone won't tell you. All five unread books would still show. | `[§validate-the-fix]` |
| `kh.cass.06` | Cass | Fantasy and Unread: only The Night Circus, and the count says one. With the bug, it said five. | `[§validate-the-fix]` |
| `kh.cass.07` | Cass | One inner-loop cycle: plan, change, inspect, test, build and preview. Stop the server with Control+C. | `[§validate-the-fix]` |
| `kh.cass.08` | Cass | One more lap. A regression test proves the bug would fail before the fix and pass after. | `[§2-add-a-regression-test]` |
| `kh.cass.gauge.dry` | Cass | A gauge that's always dry proves nothing. It has to flood with the old leak. | `[§2-add-…]` |
| `kh.cass.gauge.lower` | Cass | Lowering the old mark weakens an expectation. Check what the filters show instead. | `[§2-add-…]` |
| `kh.cass.09` | Cass | That's the one. It checks what the filters show, and the tests and build pass. | `[§2-add-…]` |
| `kh.cass.10` | Cass | Barty's at the Old Hulk across the basin. Show him your log before the locks. | `[§3-ask-for-a-second-opinion]` |
| `kh.barty.01` | Barty | I'm from another port, Captain. A different eye sees different gaps. | `[§3-ask-for-a-second-opinion]` |
| `kh.barty.02` | Barty | The rubber duck agent is a constructive critic. It finds missing evidence before you open a pull request. | `[§3-ask-…]` |
| `kh.barty.03` | Barty | In the app, type a slash for the palette, then send /rubber-duck with your request. | `[§3-ask-…]` |
| `kh.barty.04` | Barty | Compare what I say with your evidence, and fix the gaps that matter. You still decide. | `[§3-ask-…]` |
| `kh.barty.05` | Barty | No /rubber-duck? Choose a different model for the session, or send the same request without the slash. | `[§3-ask-…]` |
| `kh.barty.06` | Barty | Stroud keeps the harbour office at Lock 1. That's where the work goes to GitHub. | `[§outer-loop-move-the-work-through-github]` |
| `kh.barty.polish` | Barty | Got a moment? Pick & Polish points at one thing in the preview and pins it to your next prompt. | `[§3-ask-…]` |
| `kh.barty.polish.back` | Barty | A visual change still needs the same diff, tests, build and preview. Good work. | `[§3-ask-…]` |
| `kh.stroud.01` | Stroud | Past this gate, work moves through GitHub: an issue, a session, a pull request, checks, then a merge. | `[§outer-loop-move-the-work-through-github]` |
| `kh.stroud.02` | Stroud | There are two seals on the way: one after the diff, one after the checks. Both are yours. | `[§outer-loop-…]` |
| `kh.stroud.03` | Stroud | Two ledgers: Issues and Pull requests. Each keeps its own repository pick. | `[§4-find-work-in-issues-and-pull-requests]` |
| `kh.stroud.04` | Stroud | Practice pull requests are on Authored by me. If one's missing, check the tab, the repository and your access. | `[§4-find-work-…]` |
| `kh.stroud.05` | Stroud | This order's bell rings at the main slipway. But search already works on main. | `[§5-start-from-an-issue-and-open-a-pull-request]` |
| `kh.stroud.06` | Stroud | So start where the bug is: Create from, Branches, the search-case branch. Then attach the issue. | `[§5-start-…]` |
| `kh.stroud.07` | Stroud | Your petition claims only what you saw. Don't claim a check passed unless the terminal or CI shows it. | `[§5-start-…]` |
| `kh.stroud.08` | Stroud | Lockfall fills the lock by itself. Checks run on the pull request; you read them. | `[§fix-a-failing-check]` |
| `kh.stroud.09` | Stroud | That hull waits in the basin. Don't merge this practice pull request: main already has the fix. | `[§5-start-…]` |
| `kh.stroud.10` | Stroud | Arlo's at Lock 2 with two more hulls. One has a note, one has a red lamp. | nav |
| `kh.arlo.01` | Arlo | Two seeded pull requests, Captain. You'll find both on Authored by me. | `[§6-address-review-comments-and-failing-checks]` |
| `kh.arlo.02` | Arlo | The note asks for more helpful guidance. The barge is a new session from the pull request. | `[§respond-to-a-review-comment]` |
| `kh.arlo.03` | Arlo | Answer the whole comment, not half of it. Then commit, push, and check the pull request. | `[§respond-…]` |
| `kh.arlo.04` | Arlo | A CI check is an automated validation run on a pull request, often through GitHub Actions. | `[§fix-a-failing-check]` |
| `kh.arlo.05` | Arlo | The Book app web lamp is red. Read why, then ask for the smallest fix. | `[§fix-a-failing-check]` |
| `kh.arlo.weaken` | Arlo | Filing down the gauge turns the lamp green, and leaves the ship's hull wrong. Don't weaken the failing test. | `[§fix-a-failing-check]` |
| `kh.arlo.06` | Arlo | Push, and the lamp runs again. Green, this time. | `[§fix-a-failing-check]` |
| `kh.arlo.actions` | Arlo | No lamp after a push? New forks start with workflows off, so turn them on in your fork's Actions tab. | `[00 §add-the-course-practice-items]` |
| `kh.arlo.07` | Arlo | Gate 2 opens only when the diff, local validation, GitHub checks and your own review agree. | `[§key-takeaways]` |
| `kh.arlo.08` | Arlo | And the Sea Gate stays shut. Nobody merges a practice pull request in this chapter. | `[§5-start-…]` |
| `kh.arlo.tug` | Arlo | That tug's Agent Merge: it merges only when GitHub allows. It's a finishing aid, not a replacement for human review. | `[§fix-a-failing-check]` |
| `kh.arlo.09` | Arlo | Ottoline keeps the Gate Light, through the cut. Off you go. | nav |
| `kh.otto.01` | Ottoline | From up here you can see both circuits, Captain. The cove, and the locks. | flavour |
| `kh.otto.02` | Ottoline | A change is ready only when the diff, local validation, GitHub checks and human review agree. | `[§key-takeaways]` |
| `kh.otto.03` | Ottoline | Guildcrest's guild saves this workflow in skills and agents. You'll reuse every step of it. | `[§whats-next]` |
| `kh.otto.retry` | Ottoline | Not yet, Captain. Read the evidence again, and come back when you're ready. | flavour |
| `kh.otto.assign.01` | Ottoline | One more job: run both loops on a small UI change, and open a pull request. | `[§assignment]` |
| `kh.otto.assign.back` | Ottoline | One focused change, an honest summary, and Book app web passing. That's the whole craft. | `[§assignment]` |
| `kh.otto.done` | Ottoline | Fair winds, Captain. The Gate Light will see you out. | flavour |

**Bram's market lines** (`market.json` → `keepers.keelhaven`, the same keys as Lani's; Chapter 01
anchors `models-and-reasoning-effort` and `try-again-with-a-different-model`): `kh.bram.market.hello`
"Welcome aboard, Captain! Bram's Model Market. Hire a model that fits the job; bigger ones cost more
starfish." · `.open` · `.auto` · `.right` · `.fair` · `.keep` · `.over.effort` · `.short` · `.hard.auto` ·
`.broke` · `.done` · `.early` · `.bye` "Off to the yard? Your starfish and your jobs go with you." Each
keeps the meaning and the citation of Lani's line with the same key.

**Wingman's hints** (`wingman.kh.hint.<station>.<tier>`, 3 tiers × 8 stations ≈ 24): tier 1 asks a
question, tier 2 gives the reason, tier 3 points to the choice (§5.4). Each cites its station's source.

---

## 9. Battles

### 9.1 Battle 3: "Trust the Evidence" (Thousand-Bough → Keelhaven, recaps Chapter 02)

Each passage battle recaps the chapter you just finished (BATTLES §2.0, §2.0b): spaced retrieval in a new
place. Chapter 03 isn't taught yet on this passage, so battle 3's questions are Chapter 02's (O2).

| Item | Value |
|---|---|
| Id, plan | `passage-thousand-bough-keelhaven`; `BATTLE_PLANS` index 2; `PASSAGE_BATTLES` `{ from: 'thousand-bough', to: 'keelhaven' }` |
| When | the first time you sail from Thousand-Bough toward Keelhaven with the Seal of Thousand-Bough; required, with **Skip battle** (BATTLES §2.0) |
| Where | open water between the two islands: ≥ 450 m from Thousand-Bough's mooring, ≥ 80 m from every island's `contains`; the band between Thousand-Bough's bounds (x 2460) and Keelhaven's (x 3240) is about 780 m wide |
| Frame (BATTLES §2.1) | **"Trust the Evidence."** Your gunner fires only when the evidence agrees: the side bears (the arc turns gold) and the battery is loaded. The title card: "Trust the Evidence"; Juno's opening bark: "Raiders, Captain. Wait for the evidence: arc gold, guns loaded. Then fire." (flavour; the battle loop, not a course claim) |
| Waves | BATTLES §2.0c as planned: 1 *Shared Deck*, *Muddy Main* + **N2.1** (new worktree by default); 2 *Whole Library*, *Every Issue* + **N2.2** (the smallest useful context); 3 *Port Jam*, *Same Lookout* + **N2.3** (different ports for parallel previews). N2.1–N2.3 are new scenario quizzes in `chapters/02-sessions-worktrees-context.json`, never a Trial item again |
| Between waves | the bosun's question (the second-opinion beat of BATTLES §2.1); the reward never punishes (§2.1) |
| Won line | "The raiders are back in the fog. Keelhaven lies ahead." Then the "Next morning" sky (O3) |
| Data | `course.json` → `hooks.battles["passage-thousand-bough-keelhaven"]` (`"chapter": "02"`, `won`, `waves[].quiz`, `waves[].raiders`); `labels.json` → `battle:passage-thousand-bough-keelhaven` |
| Gates | `tools/battletest.mjs`: the census with Keelhaven resident (peak ≤ 140 programs); the warm waits for every raider's figurehead (issue 266) |

### 9.2 Battle 4 (O2): Keelhaven → Guildcrest, recaps Chapter 03

Built with Guildcrest's passage. It uses BATTLES §2.1's raiders, whose sister ships are the wrecks on
Keelhaven's reef:

| Wave | Raiders | Habit (course) | Question (new, in `chapters/03-development-workflows.json`) |
|---|---|---|---|
| 1 | *Confident Guess* ×2 | "A confident response from Copilot isn't the same as validated software." `[§core-concept-trust-the-evidence]` | N3.1: which evidence answers "does CI agree with your local results?" → the pull request's checks in **Pull requests** |
| 2 | *First Take* ×2, a brigantine | the inner loop's "repeat if the evidence reveals a problem" `[§inner-loop-…]` | N3.2: the preview shows the old count after a fix → back to **Change** (inspect the diff, reload), not "open the pull request" |
| 3 | *Unchecked* ×3 | "Merge only when the diff, local evidence, and GitHub checks agree." `[§outer-loop-…]` | N3.3: a red check and an "easy fix" that edits the test → the smallest code fix; keep the test |

If Keelhaven ships before Guildcrest, Ottoline's farewell offers the three questions once at the
gangway (skippable), as BATTLES §2.0c plans for Chapter 02.

---

## 10. Tech plan

### 10.1 First: the island registry (D3, phase 1)

Thousand-Bough added hand-written branches in about 40 places (the checklist lists them: `session.ts`,
`flow.ts`, `cove-scene.ts`, `islands.ts`, `arrivals.ts`, `chart.ts`, `compass-goals.ts`, `island-tips.ts`,
`island-warm.ts`, `starfish/spots.ts`, `chart-map.ts`, `chart-art.ts`, `play.ts`, `content/check.ts`, and
eight tools). Keelhaven is built on a **generic island registry** instead:

- **As built (issue 303, docs/adding-an-island.md):** `src/islands/registry.ts` has one line for each
  island. The entry `src/islands/keelhaven.ts` (`KEELHAVEN_ISLAND: IslandEntry`) holds the data: berth,
  `arrival`, `sky`, `mood`, `skyReach`, `open: { after: { island: 'thousand-bough', condition: 'sealed' } }`,
  `ranges`, `footprint`, `starfish`, `courseBoard`, `chart` (the miniature; `terrain()` is a dynamic
  import of `keelhaven/chart.ts`), `theme` (Salty Sway), `terrainRegions`, `floraPalette`, `puzzles`
  (`'drydock-ring': 'circuit'`, `'lock-flight': 'circuit'`, `retake: 'ceremony'`), `market` (Bram's booth), and
  `stream: { nearLoads, reflected: false, courseData: 'chapter-part', depthTile: true }` (its reef's
  shallows, O6). Its terrain regions are in `ISLANDS_IN_BUILD` until then. Its code
  `src/game/keelhaven-island.ts` (`KEELHAVEN_CODE: IslandCode`, a dynamic import, its own chunk) has
  `stream`, `quests`, `walk`, `content`, `ways`, `chests` and `cast`. Outside the package only
  `STORY_CONDITIONS`/`STORY_EVENTS` (TypeScript asks), the cast specs (`NPC_IDS`), battle 3 and
  `tools/lib/islands.json` (one line: the tools' ids, scene names and spots) need a line.
- `cove-scene.ts`, `session.ts` and `flow.ts` loop over the registry; each island's code is its own
  chunk (`<id>-island`); the build shows no `INEFFECTIVE_DYNAMIC_IMPORT` for them.
- Tools read the registry's island list (`budgettest`, `memorytest`, `perftest`, `cameratest`,
  `wayfindtest`, `flickertest`, `starfishtest`, `audiotest`) and its URL flags (`?<id>`).
- **Proof that nothing changed:** the three bake hashes (Anchorage `1aac2f2a`, Port Meridian `8d32083a`,
  Thousand-Bough `90dc42b3`), every gate's numbers within noise, `revoyagetest`, `questtest`,
  `meridiantest`, `thousandboughtest` with empty logs, and the hitch guard empty.

### 10.2 Second: the course pack loads per chapter (D3, phase 2: PR #19)

PR #19 ("Course packs: core chunk plus one part per chapter", branch `danwahlin-course-chapter-split`)
does the split. Keelhaven builds on it:

- The **core** chunk (`course-<id>`, budget 48 KB gz) loads with the voyage: shared files, a per-chapter
  index (quiz and page ids, types, sections), images, chests, glossary, Trials, and each island's tracker,
  quests, story and signs. One **part per chapter** (`course-<id>-<chapter>`, budget 28 KB gz each)
  loads with its island: quizzes, pages, voiced and cited lines, the island's compass targets, beats,
  scripts and barks, and its puzzles' content.
- PR #19 adds `IslandStreamContext.courseData(priority)`. Keelhaven's entry sets
  `stream.courseData: 'chapter-part'` (cove-scene passes `loadIslandPart('keelhaven', p)`); its stream waits
  for Chapter 03's part together with its terrain pack, at the same priority (low for a prefetch), as
  Port Meridian's and Thousand-Bough's streams do. A failed part fails the stream, which retries through
  `StreamLifecycle`.
- **Keelhaven's puzzles go in its registry entry's `puzzles`** (`drydock-ring` and `lock-flight` → `circuit`, and
  `retake` → `ceremony`): `GAME_PUZZLES` and `PUZZLE_ISLANDS` (src/course/puzzle-islands.ts) come from the registry,
  so their content goes into Chapter 03's part.
- `onCourse` hooks that read a part run again when it arrives; a read outside a hook logs an error.
  The recap, the Logbook and battles load a part on demand (battle 3 loads Chapter 02's part).
- Chapter 03's part must stay ≤ 28 KB gz (it is the longest chapter); `check:budgets` gates it. If it
  doesn't fit, split its pages before raising the budget.
- This also helps the Lite JS heap (§10.7): a voyage keeps only the parts of the islands it visits.

### 10.3 Modules

```
src/world/islands/keelhaven/      (A, world)
  layout.ts           KEELHAVEN: every number in §3 (no three.js imports)
  contract.ts         KeelhavenSystem and its views (§10.4)
  height.ts           keelhavenHeightDry, keelhavenHeight, keelhavenMasks (+ test)
  terrain-regions.ts  paliWall, forestFloor, campSand, villageGround, paths, cliff
  water.ts            falls, river, pools, basin, docks, locks (data + maths)
  water-mesh.ts       the shared water strips
  vegetation.ts       KEELHAVEN_VEGETATION (rows in the shared table)
  flora.ts, flora-palette.ts
  rocks.ts            the shared rock kit
  town/               Old Town, the tavern, the quay, Bram's booth (village kit)
  shipyard/           slipway, basin, drydocks, sheerlegs, the Old Hulk, RingView
  locks/              the canal, the lock chambers and gates, lamps, the barge, the tug, FlightView
  gatehouse.ts        the gatehouse, the Gate Light, the Sea Gate, SealFx
  wrecks.ts           the three wrecks (the shared wreck builder)
  silhouette.ts       createIslandSilhouetteAsync (no `sheer`)
  starfish.ts, waypoints.ts
  index.ts            createKeelhavenAsync (sliced with breathe())
  stream.ts           createKeelhavenStream, KEELHAVEN_RANGE, KEELHAVEN_FOOTPRINT
src/world/mist/                   (A) the mist material moved from thousand-bough/mist.ts (shared)
src/world/wreck.ts                (A) the wreck builder moved from islands/anchorage/wreck.ts (shared)
src/game/keelhaven-*.ts           (B) quests, NPCs, session content, open gate
src/game/puzzles/circuit/         (B) types, logic, session glue, tests
src/ui/puzzles/Circuit.tsx        (B) the station HUD (choices, lamps, the petition tiles)
courses/copilot-app/chapters/03-development-workflows.json, quests/keelhaven.json,
  puzzles/drydock-ring.json, puzzles/lock-flight.json (circuit), puzzles/retake.json (ceremony) (B)
courses/schemas/puzzle-circuit.schema.json                                            (B)
```

### 10.4 The contract (step 0, `contract.ts`)

```ts
export type KhAnchorName =
  | 'landing' | 'bram' | 'lyra' | 'hester' | 'evidenceBoard' | 'dory' | 'cass' | 'barty' | 'stroud'
  | 'ledgers' | 'arlo' | 'barge' | 'ottoline'
  | 'ringPost' | 'ringStack' | 'ringSlate' | 'ringCaisson' | 'ringLookout' | 'ringCam'
  | 'lock1Slate' | 'gate1' | 'petitionMast' | 'gate2' | 'lockCam'
  | 'toolChest' | 'bellCord' | 'strataCut' | 'tug'
  | 'extraKids' | 'extraCaulker' | 'extraFisher' | 'extraLamplighter' | 'extraTug';

export interface RingView {            // the Drydock Ring (round 1)
  setLap(lap: 1 | 2): void;
  setLamp(place: RingPlace, lamp: Lamp): void;
  playChange(stray: boolean): Promise<void>;       // the crew fits planks (and carries the stray one)
  removeStray(): Promise<void>;
  sound(plank: number): Promise<void>;             // one plank rings
  float(): Promise<void>;                          // the caisson's sluice; the hull floats
  trialRun(pick: string): Promise<void>;           // the lookout's run for the chosen filters
  seal(): Promise<void>;
}
export interface FlightView {          // the Lock Flight (round 2)
  setLamp(place: FlightPlace, lamp: Lamp): void;
  ringMontage(dock: 3): Promise<void>;             // Drydock 3's lamps in order
  hoistPetition(tiles: readonly string[]): Promise<void>;
  fillLock(lock: 1 | 2 | 3): Promise<void>;        // Lockfall's leat; the lamp runs
  bargeAlongside(hull: 'note' | 'lamp'): Promise<void>;
  wipeNote(): void;
  seal(gate: 1 | 2): Promise<void>;
  moveHull(hull: 'search' | 'note' | 'lamp', to: 'lock1' | 'lock2' | 'basin'): Promise<void>;
}
export interface SealFx { sealCascade(reducedMotion: boolean): Promise<void>; pennants(on: boolean): void }
export interface KeelhavenSystem {
  group: Group;
  anchors: Readonly<Record<KhAnchorName, VillageAnchor>>;
  walkable(x: number, z: number, y?: number): number | null;
  surfaceKind(x: number, z: number, y?: number): SurfaceKind;
  colliders(): readonly BoxCollider[];
  circles(): readonly CircleObstacle[];
  cameraBoxes(): readonly CameraBlockerBox[];
  inland(x: number, z: number): number | null;     // pools, the river, basin, docks, canal
  shipObstacles(): readonly CircleObstacle[];
  ring: RingView; flight: FlightView; fx: SealFx;
  update(dt: number, t: number): void;             // no allocation
  dispose(): void;
}
```

B tests against a stub of the same interfaces (`src/game/keelhaven-contract.stub.ts`) until A's views
exist.

### 10.5 The `paliWall` look (O5, shared, phase 3)

From the look study §2.3, in our own TSL:

- Add `paliWall` to `TerrainRegionMasks` and `REGION_KEYS`. Where it is > 0, the slope term leaves the
  cliff colour (only the baked `cliffMask` paints cliff: the sea-cliff band); the wall canopy greens
  (§2.3) with darker gullies from the baked AO; rock in vertical streaks (the sampled triplanar noise with
  y scaled by 1/5); laterite on crest scars and fans; faint strata only where rock shows; crown relief
  faded by `fwidth`.
- No new texture, no new sampler; ≤ 15 % more fragment ALU; values shared between branches are built
  outside the branch; no uniform's `.value` in the graph.
- The other islands' masks are 0: their terrain pixels must not change (screenshot diff on Anchorage,
  Port Meridian and Thousand-Bough, High and Lite, both backends).
- Big flutes stay ≥ 56 m in the height (Lite's far levels step 16 m); finer flutes are shading only.

### 10.6 Arrival flyover (`KEELHAVEN_ARRIVAL` in `arrivals.ts`)

| Key | Camera (x, y, z) | Target (x, y, z) | Pace | Beat |
|---|---|---|---|---|
| 1 | (3131, 26, −2273) | (3800, 120, −1650) | 0.45 | H1: the whole island; the card holds here |
| 2 | (3444, 16, −2102) | berth (3539, 6, −1797) | 1.1 | into the mouth, the ship ahead |
| 3 | (3609, 30, −1920) | the docks (3806, 12, −1842) | 0.75 | over the cove to the shipyard |
| 4 | (3742, 62, −1744) | Ribbon Falls (4007, 150, −1393) | 0.7 | up the valley: one wall lit, one in shade |
| 5 | (3849, 70, −1925) | the Gate Light (3640, 26, −2118) | 0.7 | turn along the lock flight to the light |
| 6 | (3590, 14, −1790) | landing (3534, 4, −1788) | 0.75 | down to the captain on the quay |

`seconds: 24`, `cardAt: 0.6`, `cardFor: 3.6`, `label: 'arrival:keelhaven'`. A's test samples the spline
every 0.5 m: ≥ 3 m clear of terrain, walls, the sheerlegs, the Gate Light and every collider.

### 10.7 Budgets per tier

**Whole frame** (PLAN §12.1; `check:frame-budgets`, settled, both sets: Thousand-Bough resident and
freed). Today's worst values are the checklist's (2026-10-24).

| Tier | Draws / triangles gate | Today's worst (island) | **Keelhaven's own groups** (gated this time) |
|---|---|---|---|
| Lite | < 100 / < 300k | 89 / 263k (Anchorage, Thousand-Bough) | ≤ 40 draws / ≤ 110k |
| Low | < 150 / < 500k | 127 / 450k | ≤ 60 / ≤ 190k |
| Medium | < 225 / < 1.00M | 203 / 921k | ≤ 95 / ≤ 400k |
| High | < 300 / < 2.00M | 205 / 1.55M | ≤ 130 / ≤ 800k |
| Ultra | < 400 / < 3.50M | 206 / 1.90M | ≤ 170 / ≤ 1.4M |

The island's own groups are its terrain, town, shipyard, locks, gatehouse, wrecks, water, plants, cast
and cards. `budgettest` reports them by group (`--meshes`); the island PR fails if a share is over.
Plants count past their fade too (Thousand-Bough's plants alone took 287k on Medium).

**Look parts inside the share** (the look study's targets): terrain from the cove Lite ≤ 12 draws /
40k, High ≤ 40 / 400k; vegetation Lite ≤ 10 / 50k, High ≤ 26 / 480k; fresh water and falls 1 draw;
coast foam 1 draw; cloud caps 1 draw (0 on Lite); the silhouette (far only) ≤ 3 / 30k.

**Shader programs** (PLAN §15.4): ≤ 150 on every tier and both backends; goal ≤ 135; **≤ 2 new** for
Keelhaven (K10; the budget is 4); a sea battle with Keelhaven resident ≤ 140. Census at the landing and
after `travelTo('island:keelhaven')`, both backends, every tier; the numbers go in the PR.

**GPU and main thread** (`check:perf`): Low GPU gate 1.25 ms (target 1.0), High 4.6 ms (target 4.0);
Low main thread 7.7 ms (target 6), High 5.2 ms (target 4). New views `keelhaven` (the landing) and
`kh-ring` (the heaviest: the ring, the basin, the walls); both under the **target**. The wall fragment
cost is measured at the cove view on Low first (the terrain fills the screen).

**Memory** (`check:memory`): High ceilings 661 MB tracked / 129 MB heap; Lite 228 MB / 103 MB.
`memorytest`'s route gets Keelhaven (`ROUTE = ['meridian', 'thousand-bough', 'keelhaven', 'anchorage']`).
The Lite heap is the tightest (97 of 103 MB): the registry's island chunks and the chapter chunks (D3) go
in first; then measure; then O8.

**Download:** the course chunks (§10.2); the island's code chunk ≤ 120 KB gz (new row); the terrain pack
(O7: ≈ 1.0 MiB gz in full, ≈ 40 KB for the chart pack); ambience ≤ 5 MB; voice ≈ 3.2 MB. `check:audio`
gets the islands flow to Keelhaven (no music gap > 300 ms on Slow 4G).

### 10.8 Lite and Low cuts (PLAN §12.1)

| Feature | Lite | Low | Medium | High/Ultra |
|---|---|---|---|---|
| Cloud caps (mist material) | off (haze only) | 4 | 6 | 6 |
| Big flutes | geometry (≥ 56 m) | geometry | geometry | geometry |
| Fine flutes (shading) | fade by `fwidth` | same | same | same |
| Valley forest | `KEEP` 0.2 | 0.4 | 0.68 | 1.0 |
| Town houses | 10 (far ones as blocks) | 14 | 18 | 18 |
| Stream stones | 40 | 80 | 140 | 200 |
| Falls spray | off | 1 card each | full | full |
| Wrecks | hulls only | + masts | + rigging | + rigging |
| Crows | off | 4 | 8 | 12 |
| Lock lamps' glow halo | off | on | on | on |
| Calm-water mirror (cove) | — | — | — | on |
| Shadows | blob | cached 1024² | cached 2048² + characters | full |

---

## 11. Tests and gates

| Owner | Test |
|---|---|
| A | `height.test.ts`: lane depth ≥ 6 m in a 30 m half-width lane and the 45 m turning circle; no terrain or rock in them; the reef ≥ 90 m off the lane; bounds reach the deep floor; peaks rounded (no single-sample spike) |
| A | `layout.test.ts`: every anchor on a walk surface with a 4 m clear radius; the route, the ring, the towpath, the stairs and the valley loop sampled every 0.5 m have a surface, no step > 0.45 m, no collider across them; flyover clearance (§10.6); every playable point's distance to Thousand-Bough's footprint > 1370 m |
| A | `npm run bake`: Anchorage `1aac2f2a`, Port Meridian `8d32083a`, Thousand-Bough `90dc42b3` unchanged; Keelhaven's hash stable between two runs |
| A | props: bases within ±5 cm of their support; coplanar faces ≥ 1 cm apart (`flickertest --audit`, views `kh-quay`, `kh-board`, `kh-ring`, `kh-locks`, `kh-gate`); `prop-audit.test.ts` for the cast's props |
| A | `cameratest`: Keelhaven views inside the gate (`--max-bad 20`); every post, brace, beam and board has a collider or a camera box |
| A | `paliWall`: the other islands' screenshots match (High, Lite, both backends) |
| B | `ch03.test.ts`: every `source.anchor` is in the ch03 snapshot (`parseSections`); every hotspot rectangle inside its image and right of the sidebar edge (§1.4); no target id `ready-to-merge`; every app card's UI names appear in the chapter |
| B | `circuit.test.ts`: §5.6's rules; every station reachable; every wrong option has a `backTo` and a source; Gate 2 needs three lamps; no allocation in `advance` |
| B | `keelhaven-quests.test.ts`: course order Q3.1 → Q3.10; a compass target for every step; every teaching line has a source; every dialogue line has a voice file and a lipsync entry; no stop says more than 5 lines before an action |
| B | `learning-store.test.ts` (real pack): A3.1–A3.10 render; Later never blocks the next stop; A3.7 and A3.8 accept "already done"; the Logbook claims app work only when confirmed |
| B | `src/course/neutral.test.ts`: `DENIED` patterns for Chapter 03's quest ids and course words in game code (the `circuit` mechanic uses only its place ids) |
| B | `tools/keelhaventest.mjs` (a copy of `thousandboughtest.mjs`): sail in (battle 3 skipped and fought), every stop in order, both rounds of P3.1 by real input with one wrong choice per station, the Trial, the reflection, the Seal, the chests, the bottles, the starfish; no page error; no hitch |
| both | `residency.test.ts` (four islands; Keelhaven doesn't hold Thousand-Bough), `island-silhouettes`, `island-reload`, `stream-rollback`, `story`, `compass-goals`, `wayfinding`, `wading` (every tier grid), `battles`, `flora`, `content`, `labels`, `course-board`, `market`, `copilot-cli` (Keelhaven stays scenery there), `npc-paths`; `tools/course-pack/dump.test.ts` fingerprint updated on purpose |

**Gates, on every PR that touches the island:** `npm run typecheck && npm run lint && npm run format:check
&& npm test`; `npm run build && npm run check:budgets && npm run check:secrets`; `npm run content:check`
and `npm run course:drift`; `npm run test:e2e` (`--repeat-each=4` when the warm changes); then
`check:frame-budgets` (both sets, the island share), `check:memory`, `check:perf`, `check:opening`
(the chart's draws and triangles), `check:audio`, `battletest`, `wayfindtest` (`--only=sitting`,
`legs`, `sea`), `starfishtest`, `revoyagetest`, `questtest`, `meridiantest`, `thousandboughtest`, and the
hitch guard empty after the warm on the voyage, the travel and a save loaded on the island.

---

## 12. Build order (phases)

Each phase is its own PR, merged before the next starts unless noted. "A" = world, "B" = content.

| Phase | PR | Who | Done when |
|---|---|---|---|
| 0 | **This spec**; PLAN §3, §4, §6 and BATTLES §2.1 updated | — | done: Dan decided O1–O11 on 2026-10-24 |
| 1 | **Island registry** (D3, §10.1): every streamed island through one registry; island code chunks. **It lands first**, before PR #19 and before any Keelhaven code | A | every gate's numbers within noise; bake hashes unchanged; four scripted tests with empty logs |
| 2 | **Course pack per chapter: PR #19** (D3, §10.2), rebased on phase 1: a core chunk plus one part per chapter; `IslandStreamContext.courseData` | B | PR #19's gates; its `courseData` wiring is in the registry entry, so a new island gets it from its registry row; Lite heap measured |
| 3 | **Shared prerequisites:** `paliWall` (O5), the ocean floor tile registry (O6), the shared mist material, the shared wreck builder, coast-foam exposure, the per-island bake light radius, the `passageMood` blend, the chart pack (O7) | A | other islands unchanged (screenshot diff); census unchanged; Thousand-Bough gets its shallows |
| 4 | **Look prototype** (look study §5): `layout.ts`, `height.ts`, the bake, `devpages/terrain.html` views `sea-700`, `sea-400`, `cove`, `aerial`; the time of day (flute contrast at 9:30, 9:45, 10:00; §2.4) | A | the look study's measurable checks pass on Lite and High (flutes, skyline, green share, sea-cliff band, pops, Lite terrain budget); the time is chosen |
| 5 | **The island:** water, vegetation, town, shipyard, locks, gatehouse, wrecks, silhouette, stream (its entry's `courseData: 'chapter-part'`, §10.2), arrival, registry entry and code, sea lanes; `contract.ts` and the stub first (step 0, half a day, merged first so B can start) | A | §11's A tests; the whole-frame gates and the island share; census; `kh-ring` under the perf target |
| 6 | **Content:** Chapter 03 snapshot (`node tools/course/sync.mjs --chapters=00,01,02,03`, `npm run course:refs -- 03`), the chapter file, quests, puzzles (in the registry entry's `puzzles`, so they go into Chapter 03's part), `learning.json` rows, labels, market keeper, the `circuit` mechanic and its UI, hotspot rectangles in the Hotspot Editor | B (starts after phase 5's step 0, on the stub) | `content:check`, `course:drift`, B's tests |
| 7 | **Cast and voice:** NPC specs, palettes, props; auditions, Dan's picks, generation, lipsync | B | every line voiced; no shared voice |
| 8 | **Audio:** Salty Sway wired, new beds and SFX, emitters | B | `check:audio`; `ASSETS.md`, `ART_PROVENANCE.md` rows |
| 9 | **Battle 3** (§9.1): N2.1–N2.3, the battle data and plan | B | `battletest` with Keelhaven resident ≤ 140 programs |
| 10 | **Wire and gate:** B's content on A's real system; `keelhaventest`, `keelhaven-shots`; every gate in §11 | both | §13 acceptance; the Walt Disney review |
| 11 | **Records:** README ("Keelhaven is next"), PLAN §4 "as built", §13.3 and §15.4 numbers, `docs/content-data.md`, the skill's island table, `.plans/issues.md` | both | — |

---

## 13. Acceptance

### 13.1 Checklist

| # | Item |
|---|---|
| A-1 | Sail from Thousand-Bough (battle 3 first), dock at the quay, walk ashore; Thousand-Bough unloads while you play |
| A-2 | Ten quests at eight stops in the course's order with no walk back; the compass always points to the next (with heights) |
| A-3 | Two Circuits: both rounds play with keyboard, gamepad, mouse and touch (≥ 44 px), reduced motion, and the text-only HUD; every station has a wrong answer with a sourced reason |
| A-4 | Every teaching line, check, card and page cites its Chapter 03 anchor; no UI name that isn't in the chapter; no hotspot in a stale sidebar |
| A-5 | Ten app cards with the course's exact steps; Later never blocks; the Logbook claims app work only when confirmed; the Actions-off path is honest |
| A-6 | Budgets pass on Lite, Low, Medium, High, Ultra (WebGPU) and Lite, Low, Medium (WebGL2), with the island share; census ≤ 150 (goal ≤ 135) |
| A-7 | Hitch guard empty after the warm: by sea, by `travelTo`, and from a save on the island |
| A-8 | A round trip home leaves `renderer.info.memory` as it was; `check:memory` passes with Keelhaven on the route |
| A-9 | Chart: miniature, card, status, fast travel; the silhouette on the horizon from Thousand-Bough (H9) |
| A-10 | Starfish 5/5, chests 3/3, bottles 5/5 collectable and saved |
| A-11 | Voices for every line, one voice per character, lipsync working, subtitles on |
| A-12 | Salty Sway plays on Keelhaven and in the Songbook after the re-take |
| A-13 | Credits, `ASSETS.md`, `ART_PROVENANCE.md` updated; `check:secrets` passes |

### 13.2 Screenshots to judge it (`tools/keelhaven-shots.mjs`, JPEG, 1920 × 1080)

H1–H10 (§2.8) on **Lite, Medium and Ultra** (WebGPU), plus H1 and H2 on **WebGL2 Medium**; the arrival
flyover as a 10 fps burst; each ring station's result (right and wrong); the petition with a refused
tile; Gate 2's post with three and four lamps; the Seal cascade as a burst; a night H2. Saved under
`docs/reviews/<date>-island-03/`, named `<shot>-<tier>-<backend>.jpg`. The script fails on near-black
frames.

### 13.3 The Walt Disney review

As Thousand-Bough §12.3. Any "no" sends the island back.

1. **Story:** can a first-time player say what this place is about (a shipyard that proves every hull,
   wrecks that didn't, a light at the end) without reading?
2. **The weenie:** is the Gate Light the place you want to reach, from the sea, the quay and the yard?
3. **Wienies:** at every point on the route, can you see the next thing (the tavern sign, the board, the
   sheerlegs, the ring lamps, the Old Hulk, the lock lamps, the light)?
4. **Na Pali:** from the sea, do the walls read as tall, green and fluted, with a saw-tooth skyline, a dark
   sea-cliff band and surf? Is the water navy to the cliffs and turquoise only in the cove and on the reef?
5. **Colour story:** greens with red-brown and dark rock showing through; saturated colour only on lamps,
   the light, the seal and flags?
6. **Kinetics:** water, gates, lamps, the crew, crows: is something moving in every shot? Does any of it
   loop visibly or shimmer?
7. **Readable paths:** could you find your way with the compass off?
8. **Delight:** the reef reveal through the cut, the lamps answering at the Seal, the tug?
9. **Teaching through play:** after the puzzle, can a player say in their own words why a confident reply
   isn't evidence, and why they seal twice?
10. **Illusion breakers:** terrain edges; a green wall that turns to grey rock; skyline needles; z-fighting
    planks or signs; a floating prop; the camera in the rock cut's wall; an NPC in a rail; text that
    doesn't match the course; an Octocat or a Copilot logo in the world.
11. **Performance:** a single hitch on arrival, at a lock or at the Seal is a "no".

---

## 14. Open risks

| Risk | Effect | Mitigation |
|---|---|---|
| **The Lite JS heap** (97 of 103 MB) | a Keelhaven stop goes over | phases 1–2 first (island and chapter chunks); measure; O8 |
| **The course pack** | Chapter 03's part over 28 KB gz | PR #19's per-chapter parts (phase 2); split pages before raising the budget |
| **Pali walls on Lite and Low** (no geomorph, point-sampled normals) | walls pop at 40 and 170 m; speckle far away | big flutes only in geometry (≥ 56 m); the look study's pop metric; prefiltered coarse levels as a later opt-in |
| **The terrain fragment cost** (walls fill the cove view) | Low over its GPU gate (Thousand-Bough already 1.12 of 1.25 ms) | ≤ 15 % more ALU; no new texture; measure the cove view on Low in phase 4 |
| **Shader programs** (Thousand-Bough 133 on Ultra) | no room for new looks | ≤ 2 new; every material shared; census per phase |
| **A high sun flattens the flutes** (D2; they vanish at about 10:24) | the walls read flat from the sea | 10:00 at the latest; the prototype picks between 9:30 and 10:00 by measured contrast; a bearing that grazes the arrival wall (§2.4); H1 and H10 judge it |
| **Two resident islands** at the passage | memory and programs peak | Keelhaven's playable area > 1370 m from Thousand-Bough's footprint; the census with both resident |
| **Ten app cards** in a 75-minute chapter | fatigue; skipped cards | every card has Later; steps on cards, not in voice; the in-game decisions stand alone (O11) |
| **GitHub state changes for good** (step 6) | a second play can't redo it | A3.7 and A3.8 accept "already done"; nothing waits for GitHub |
| **Actions off on new forks** | no check runs | A3.8's option, Arlo's line, card A0.6 |
| **Stale screenshots** (six) | wrong targets after a retake | §1.4's rule; drift flags; reported upstream (O9) |
| **Course drift** after `64bc3d0` | stale names or steps | anchors and hashes in the snapshot; the weekly refresh; `course:drift` |
| **Voice casting** | caricature accents; credits | three auditions each; natural direction; Dan approves |
| **The "Next morning" cut** (O3) | a sky jump that reads as a bug | a clear fade with Juno's line after the battle; reduced-motion cross-fade |
| **The battle zone** near both islands | raiders near land | ≥ 80 m from every `contains`; `battletest` checks the zone |

---

## Wiring contract

> Written 2026-10-25 with the course content (issue 307, branch `danwahlin-keelhaven-content`). The
> course pack holds all of Chapter 03 now. The game does not use it yet: Keelhaven is not in the
> registry, so the game leaves its content out at load (`withoutIslandsAhead`, src/course/split.ts), and
> the content check does not check the game's side of the contract
> ([content-data.md](../content-data.md), "Content ahead of its island"). This section tells the wiring
> step what the game must add. It replaces §10.1's `two-circuits` file with two files.

### W.1 What the registry line does by itself

When `keelhaven: KEELHAVEN_ISLAND` goes into `ISLAND_REGISTRY` (`src/islands/registry.ts`):

| Effect | Where |
|---|---|
| The game loads Chapter 03's core and part, `quests/keelhaven.json`, the three puzzles and the ten app cards, the six objectives and the reflection | `withoutIslandsAhead` (src/course/load.ts) |
| Thousand-Bough's tracker shows `tracker.nextSail` ("Keelhaven's next. Board your ship and follow the compass east.") once Keelhaven is open | `NEXT_ISLAND` in src/game/thousand-bough-island.ts: the entry whose `open.after.island` is `thousand-bough` |
| The content check becomes strict for Keelhaven: the cast, the story names, the signs, the puzzle names and steps, the market stall, and audio for every line it plays | tools/content/check.ts (`aheadIsland` is false) |
| The Course map, the certificate, the Logbook counts and the App checklist include Chapter 03 | the learning systems read the loaded pack |

The entry must have `stream.courseData: 'chapter-part'` and
`puzzles: { 'drydock-ring': 'circuit', 'lock-flight': 'circuit', retake: 'ceremony' }`.

### W.2 Story (`src/game/story.ts`)

```ts
STORY_CONDITIONS.keelhaven = ['firstVisit', 'dockKitted', 'searchHullDown', 'prHullsDown', 'sealed'];
STORY_EVENTS.keelhaven = [];
```

| Name | The pack's `when` | What the game does with it |
|---|---|---|
| `firstVisit` | Q3.1 not done | Juno's and Wingman's first welcome (`hooks.islands.keelhaven`) |
| `dockKitted` | Q3.3 done | Drydock 2's rack holds Dory's tool chest after a reload |
| `searchHullDown` | Q3.8 at `solved` or `done` | the search hull waits in the basin above the Sea Gate |
| `prHullsDown` | Q3.9 at `solved` or `done` | both seeded-pull-request hulls wait in the basin |
| `sealed` | Q3.10 done | the Gate Light is lit and every lock lamp is green; battle 4 can start; Guildcrest's gate |

### W.3 Cast (`NPC_IDS`, `IslandCode.cast`, `voice/cast.json`)

| NPC id | Speaker (lines.json) | Anchor (§3.11) | Beats and scripts |
|---|---|---|---|
| `lyra_keel` | Lyra | `lyra` | `lyra` |
| `hester` | Hester | `hester` | `hester` |
| `dory` | Dory | `dory` | `dory` |
| `cass` | Cass | `cass` | `cass`, `cass.solved`, `cass.lap2`, `cass.lap2.solved` |
| `barty` | Barty | `barty` | `barty`, `barty.polish`, `barty.polish.back` |
| `stroud` | Stroud | `stroud` | `stroud`, `stroud.flight`, `stroud.flight.solved` |
| `arlo` | Arlo | `arlo` | `arlo`, `arlo.solved` |
| `ottoline` | Ottoline | `ottoline` | `ottoline`, `ottoline.retry`, `trial.passed`, `ottoline.assignment`, `ottoline.assignment.back` |
| `bram` | Bram | `bram` | the market stall (W.8) |
| `kh_nip`, `kh_tuck` | — (barks) | `extraKids` | barks only |
| `kh_moll` | — | `extraCaulker` | barks only |
| `kh_salter` | — | `extraFisher` | barks only |
| `kh_kit` | — | `extraLamplighter` | barks only |
| `kh_skipper` | — | `extraTug` | barks only |

Juno and Wingman keep their voices. The new speakers need a `voice/cast.json` entry each (W.9).

### W.4 Cues (`host.cues`)

| Cue | Script | What the session does |
|---|---|---|
| `kh-retake` | `lyra` | runs the Bard re-take (`puzzles/retake.json`, ceremony) and unlocks Salty Sway in the Songbook |
| `kh-board` | `hester` | turns the camera to the Evidence Board for quiz M3.1 |
| `kh-sounding` | `dory` | four planks light; the player taps each; the sluice floods Drydock 1 and the hull floats |
| `kh-tool-chest` | `dory` | the player carries a tool chest into Drydock 2 (sets nothing: `dockKitted` follows Q3.3) |
| `kh-bell-cord` | `dory` | the bell cord runs the winch (**Run**); the slip carried to the winch (copy and paste) |
| `kh-ring` | `cass`, `cass.lap2` | opens the Drydock Ring for the lap whose quest is at `ring` |
| `kh-flight` | `stroud.flight`, `arlo` | opens the Lock Flight for the part whose quest is at `flight` |
| `kh-ledgers` | `stroud` | the two ledgers and their port dials (signs `ledger*`), then quiz K3.7 |
| `kh-chalk-spyglass` | `barty.polish` | the chalk spyglass marks one sail on a model hull |
| `kh-chest:C3.2`, `kh-chest:C3.3` | `cass.lap2.solved`, `arlo.solved` | opens the chest at Drydock 2's head, and the one on the tug |
| `kh-seal` | `trial.passed` | the Gate Light kindles and the lamps answer (§4.5) |
| `celebrate` | `trial.passed` | as on the other islands |

### W.5 Compass ids → world places

Targets are interaction ids, not positions. The content builds an interaction for each id at the place
below. Use the world package's positions (`src/world/islands/keelhaven/`): the world step moved the town
to the south of the river, the shipyard and the locks to the north, and the Gate Light to a lower bench of
the North Head. The names and the order of the stops stay as in §3 and §4.

| Id | Place (anchor) |
|---|---|
| `npc:lyra_keel`, `npc:hester`, `npc:dory`, `npc:cass`, `npc:barty`, `npc:stroud`, `npc:arlo`, `npc:ottoline` | the NPC's anchor |
| `ring:post`, `ring:stack`, `ring:slate`, `ring:caisson`, `ring:lookout` | `ringPost`, `ringStack`, `ringSlate`, `ringCaisson`, `ringLookout` |
| `flight:ledger` | `ledgers` |
| `flight:bell` | the main slipway's bell (a new anchor at the slipway head) |
| `flight:slate`, `flight:gate1`, `flight:petition` | `lock1Slate`, `gate1`, `petitionMast` |
| `flight:lamps` | the lamp post of the lock that runs (Lock 1 in part 1, Lock 2 in part 2) |
| `flight:note`, `flight:redLamp`, `flight:barge` | the two hulls in Lock 2, and `barge` |
| `flight:gate2`, `flight:seaGate` | `gate2`, the Sea Gate |

`ring:*` and `flight:*` match by prefix. Only the station that waits for the player is usable, so the
compass points to it.

### W.6 Puzzles

| File | Mechanic | `PUZZLE_STEPS` | Notes |
|---|---|---|---|
| `drydock-ring.json` (`P3.1`) | `circuit` (`circuit: 'ring'`) | `['ring', 'solved']` | two laps: Q3.4 (fix) and Q3.5 (gauge) |
| `lock-flight.json` (`P3.2`) | `circuit` (`circuit: 'flight'`) | `['flight', 'solved']` | two parts: Q3.8 (Lock 1) and Q3.9 (Lock 2) |
| `retake.json` | `ceremony` | `['start']` | Q3.1; `text` keys only |

The `circuit` mechanic (src/game/puzzles/circuit/; `places.ts` is there now):

- **Bindings.** Read `places` through `acts` (`byActs`). The game's places are `CIRCUIT_PLACES`. Never
  name a course word in code (`neutral.test.ts`).
- **Laps.** A lap runs while `lap.quest` is at `lap.step`. Its stations run in order. When the last
  station is green, set `lap.quest` to `lap.solved` and play the island's script `lap.close` at once.
  The NPC's beat plays the same script if the player leaves first.
- **Kinds.** `choose`: show `prompt` and `options`; a right option shows `result` and lights the lamp
  green; a wrong option lights it red, shows `reason`, and sends the hull to `backTo`. `watch`: play the
  demo for `seconds` (E skips); show `text`. `sound`: `planks` taps, then the sluice; a second tap shows
  `again`. `seal`: as `choose` (the player's approval). `tiles`: each tile sticks or shows its `reason`;
  the station is green when every tile that sticks is on the mast. `gate`: the lamps in `lamps` light in
  order; the last one is the player's seal, and it is not possible before the others are lit.
- **Words.** Station `line`, option `line` and `lines.actions` are voice lines. Play `lines.actions`
  ("No lamp after a push?") after the second push in part 2. `image` and `caption` open the spyglass.
  `hints` are Wingman's three tiers, as text (not voice: this replaces §8.3's 24 hint lines). `text`
  holds the HUD's words (`lampDark`, `lampRunning`, `lampReady`, `lampNotReady`, `next`, `back`,
  `skip`, `leave`, `hint`, `sealIt`, `sendBack`, `title`, `intro`; the flight adds `darkLamp`, `sticks`,
  `noStick`, `hoist`, `actions`).
- **Labels.** `labels.json` has `puzzle:P3.1` and `puzzle:P3.2` (the file's `id`), and
  `arrival:keelhaven` for the flyover.
- **Saves.** Save the station, not the step inside it (§5.4): a reload starts the station again.

### W.7 Signs (`ISLAND_SIGNS.keelhaven`)

`dock1`, `dock2`, `dock3` (the drydocks' branch boards), `slipway` (`main`), `lampPlate` (**Book app
web**), `ledgerIssues`, `ledgerPulls`, `ledgerAll`, `ledgerFork` (the ledgers and their dial),
`hullSearch`, `hullNote`, `hullLamp` (the hulls' name boards: the course's titles),
`strataPrompt`, `strataSettings`, `strataInstructions`, `strataRepo` (chest C3.1's four bands),
`bellCord`, `winch` (Dory's two ways to run a snippet).

### W.8 Chests, bottles, market and hooks

- `IslandCode.chests`: `C3.1` (the strata cut), `C3.2` (Drydock 2's head, opened by its cue), `C3.3`
  (the tug, opened by its cue), and the bottles `B3.1`–`B3.5` (§3.12).
- `MARKET_STALLS` (src/game/market/stalls.ts): `{ island: 'keelhaven', keeper: { npc: 'bram', name:
  'Bram' }, lines: 'keepers' }`. Bram's lines are `market.json` → `keepers.keelhaven`.
- `course.json` → `hooks.islands.keelhaven` (Juno's landing, Wingman's welcome and tips) and
  `islands[keelhaven].arrival` are in place.
- App cards need no hook: the scripts hand off A3.1–A3.10 with `{ "appTask": … }` (A3.9 and A3.10 quiet
  at the brief, `orStop` at the return). No card has a GitHub check (K8).

### W.9 Voice

Done on 2026-10-25. Dan chose a voice for each new speaker, and each one is in `voice/cast.json`
(ElevenLabs `eleven_v3`): Hester (Hollie), Dory (Louisamay), Cass (Ruby B), Barty (Aldric Solheim),
Stroud (Gideon), Arlo (Robert), Ottoline (Cassandra Woodhouse) and Bram (Hendrik Vorster). Lyra keeps
Azure `en-GB-LibbyNeural`; Juno and Wingman keep theirs. The 117 lines (104 island lines and 13 market
lines) have their audio, their word timings and their mouth cues, and none is pending. To change a
line, edit its text, then run `npx tsx tools/voice/generate.ts --course copilot-app --only=<id>` and
`npm run voice:lipsync -- --course copilot-app`. ART_PROVENANCE.md and docs/voices.md list the voices.

### W.10 Not in this branch

- Battle 3 (§9.1: the hooks, N2.1–N2.3 and its label) and battle 4's N3.1–N3.3 (§9.2): phase 9.
- The optional hotspots H3.1 and H3.2 (§1.4): measure them after the weekly refresh takes the new
  screenshots.
- The game side: everything above, `tools/keelhaventest.mjs`, and the `neutral.test.ts` patterns for
  Chapter 03's ids and words.

### W.11 The course moved upstream

The pack's snapshot is the lock's commit `a5cdf7d` (Chapter 03 there is the same as at `64bc3d0`).
Upstream `main` is now `f24b521` (2026-10-25: PR #51 fixed issue #50). Chapter 03 changed: **View** >
**Toggle Panel**, a **Review plan** box with **Continue**, and a query filter in place of the repository
picker in "4. Find Work". The content does not use the changed names. It teaches "each view has its own
filter", which both texts say. A trial sync to `f24b521` gives 45 Chapter 03 entries whose section hash
changed, no quote or objective that is not word for word, and no UI name that the chapter does not
mention. The weekly refresh must update those hashes and unpin the six screenshots (they are retaken
upstream without the old sidebar).
