# Spec: Island 02, Thousand-Bough Isle (Chapter 02 · Sessions, Worktrees & Context)

> Status: **design spec, ready to build** (2026-10-13). Written for two builders working in parallel:
> **A (world)** and **B (content)**. Every decision here is made; where a number must be tuned in the
> game, the spec gives the target and the test that proves it. Course source: `github/copilot-app-for-beginners`
> `02-sessions-worktrees-context/README.md` at commit `86bb298` (2026-10-13).
>
> Diagrams: [top-down layout](island-02/top-down-layout.svg) · [tree village elevation](island-02/tree-elevation.svg) ·
> [Channel Routing grids](island-02/channel-routing-grids.svg). All are hand-drawn SVG (no AI art), generated
> from the same numbers as this spec by `docs/specs/island-02/draw.py`.

---

## 0. Decisions log

| # | Decision | Why |
|---|---|---|
| D1 | **Site:** island centre `(2050, -1500)`, baked bounds x 1640…2460, z −1900…−1100 (cell 2 m) | North-east of Port Meridian, matching the chart's position (`archipelago.ts` 490, 165). 330 m of open sea between its bounds and Meridian's; 1.9 km clear of the `north-ridge` distant range |
| D2 | **One weenie: the great banyan** at `T = (2010, -1560)` on a knoll (deck y 18.5), crown top y ≈ 77 | It breaks the skyline in the ridge's saddle (y 58) from every sea approach, and from Meridian's citadel 1.4 km away |
| D3 | **Arrival light:** late golden hour going to dusk, sun elevation **0.10 rad (≈ 6°)** from bearing **≈ 290° (WNW)** | The valley sits in blue-green shade with lanterns and fireflies glowing; the decks catch side light; the Crown Deck stands in gold sun **above the mist**. Different from Meridian (warm town, sun in the SW over the harbour) |
| D4 | **The metaphor (PLAN §3):** trunk = the repository, each crew's treehouse = its own folder on its own **bough** (branch), the Great Hall in the trunk = `main` / your main checkout, the gondola into the clouds = **Cloud**, the four signal flags = `@ # / &` | The course image `one-repo-many-worktrees` shows one repo with Feature, Bug Fix and Docs worktrees; the island builds exactly that |
| D5 | **Signature puzzle Channel Routing** in three rounds on a 5 × 4 flume grid, then the **Spire Bridge** twist (ports) | Learn by doing (PLAN §1). Rounds 2 and 3 each have **exactly one** solution (checked by `draw.py`'s solver; B's tests repeat it) |
| D6 | **Nine stops in the course's order**, one check each, max 30 s walk between neighbours | The Chapter 00 lesson: few stops, close together. A helical stair round the trunk gives one climb with stops on it, no doubling back |
| D7 | **Music:** `music_salty_sway` **doesn't fit** (its Suno style is "Maritime folk"). Keep it for Keelhaven (Chapter 03, tavern/shipyard). Dan made the island's Suno track, "Misty Jungle Dusk" (`music_thousand_boughs`, 2026-10-13), from the §8.1 prompt | PLAN §7 asks for Lydian, dreamy, kalimba, pan flute, rain-drop percussion |
| D8 | **No falling rain.** "Soft rain" is in the music and in a light *after-the-shower* bed: drips, wet sheen, beads on the rails | Rain audio with no rain on screen breaks the illusion; real rain particles would hide the view |
| D9 | **Reuse every shared material.** The tree's bark and leaves use the vegetation materials, the treehouses the village kit materials, water the Meridian water-strip material. At most **4 new shader modules** for the island (mist/shaft cards, fireflies, and up to two more if a census proves the need) | PLAN §15.4: island ≤ 150 modules, and Meridian already reads 147–149 on Ultra |
| D10 | **No new chapter id in `CourseSource` until it lands.** Content cites `{ chapter: '02-sessions-worktrees-context', anchor }` plus image filenames; B adds the id to `ChapterId` after rebasing on the live-course work | Avoids a merge fight in `src/learn/types.ts` |
| D11 | **Stable ids:** island id `thousand-bough` everywhere (chart, `IslandId`, saves, music key, packs) | The chart already uses it |
| D12 | **Ladders are scenery.** The player climbs only stairs, ramps, bridges and the Sky Basket lift | The POC has no ledge climbing (POC §3.3) |
| D13 | **Every edge the player can reach has a rail or a natural barrier** (rock, dense ferns, cliff). No invisible walls in the open | Walkability without falls or "why can't I go there?" moments |

---

## 1. Teaching map (Chapter 02)

Course folder `02-sessions-worktrees-context`. Anchors are the slugs that `src/learn/course/sections.ts`
produces for this README (checked by running it). Images are in `assets/` (the live-course agent will
snapshot them to `public/course/ch02/`; ids below are `ch02/<file-without-extension>`).

### 1.1 Sections, in order

| # | Anchor | Section | Images | Key UI names (bold or code in the course) |
|---|---|---|---|---|
| 0 | *(top, no anchor; cite `learning-objectives`)* | Intro: "What if every task had its own workspace, branch, context, and history?" A session can have its own **branch, working folder, plan, diff, terminal output, browser preview, and GitHub context** | `chapter-header.svg` (not used) | — |
| 1 | `learning-objectives` | Objectives (6 bullets), ~30 minutes | — | `@`, `#`, `/chronicle standup`, `/context`, `main` |
| 2 | `prerequisites` | Chapters 00 and 01 done | — | — |
| 3 | `from-the-studio-one-studio-many-recording-booths` | Three musicians, one song, separate soundproof booths; "A worktree is like a separate recording booth… its own folder and branch so parallel work doesn't collide" | `recording-booths-worktrees.webp` (1536 × 1024) | — |
| 4 | `what-is-a-git-worktree` | A **Git worktree** adds working directories for the same repository, each usually on a different branch (or commit); work on several tasks or branches without stashing or switching branches in one folder | — | **Git worktree** |
| 5 | `why-the-github-copilot-app-uses-worktrees` | 4-row table *Without isolation* vs *With a worktree-backed session*; sessions can run in parallel without mixing file changes; "For this chapter, work through one session at a time" | `one-repo-many-worktrees.webp` (1536 × 1024; shows an Octocat icon, see §12.3) | — |
| 6 | `where-a-session-runs` | Start a session with **+**; the **workspace selector** below the prompt box; **Base branch** sets the branch a new worktree starts from; the app remembers your last choice: switch back from **Current checkout** (Chapter 00) to **New worktree**; **Create from** always gets a new worktree. Table: **New worktree** / **Current checkout** / **Cloud** (cloud sandbox on GitHub's hosted infrastructure, public preview). Tip: when in doubt, a new worktree. Worktrees separate **files and branches**, not dev servers, databases, or ports | `app-where-sessions-run.webp` (1000 × 480; menu titled "Where to work"; **New worktree** has the course's blue highlight) | **+**, **Base branch**, **Current checkout**, **New worktree**, **Cloud**, **Create from** |
| 7 | `context-syntax` | `@` files or folders (`@samples/book-app-web/src`), `#` issues or pull requests (`#12`), `/` slash commands (`/chronicle standup`), `&` other sessions "when the prompt box offers it". Tip: "Provide the smallest amount of useful context. Less is often more." | — | `@ # / &` |
| 8 | `attaching-files` | Drag files from your computer and drop them onto a session or agent in the sidebar; useful for files that aren't part of the repository | — | — |
| 9 | `slash-commands` | Shortcuts in the prompt box; type `/` and read the palette (commands vary by app version, plugins, skills, organization policy). Two you need: `/chronicle` (`/chronicle standup` summarizes your work from the last day) and `/context` (the usage popup: token usage, context details, AI credit spend). Optional table: `/agent`, `/collect-debug-logs`, `/create-canvas`, `/orchestrate`, `/research`, `/review`, `/rubber-duck`, `/skills`, `/usage`, `/[skill-name]` | — | `/chronicle`, `/context` |
| 10 | `exercise-start-a-session-from-a-branch-and-attach-an-issue` | **Create from** icon → **Branches** tab → `practice-empty-state-copy` (new worktree) → **Mode** **Plan** → `#3` **Improve the empty state copy** → "Investigate the issue and create a plan to address it." → **Plan** tab and **Review plan** box (Approve and implement this plan / **Exit plan mode and I will prompt myself** / Suggest changes to the plan) → back to **Interactive** → run the Book App and open the preview → `hobbit` (**The Hobbit**) → `zzzz-no-match` (empty state) → `Implement the plan` → **Changes** tab or **Changes** pill → reload and compare | `app-create-from-icon.webp` (1034 × 240), `app-plan-from-issue.webp` (1568 × 1080), `app-book-app-empty-state-before.webp` (1568 × 1080) | **Create from**, **Branches**, **Mode**, **Plan**, **Review plan**, **Autopilot**, **Exit plan mode and I will prompt myself**, **Interactive**, **Changes** |
| 11 | `exercise-check-the-session-with-slash-commands` | `/chronicle standup` (report of the last day's work), `/context` (usage popup; also the AI credits icon next to the microphone icon; select the **Context** bar): **Plan** (or **Usage hidden** in **Streamer Mode**), **Session** (AI credits), **Tokens** (↑ sent, ↓ received), **Context** breakdown (system prompt, system tools, MCP tools, messages, free space, buffer), **View usage and plan...**. Session details (working branch, base branch, **Remote control**, **Path**, **Project**, **Session name**, **Session ID**) by selecting the session name at the top of the window. Ask Copilot to stop the dev server; no PR needed | `app-chronicle-standup-output.webp` (1568 × 1080), `app-context-information.webp` (1920 × 1080; the **Context** bar has the course's blue highlight) | **Context**, **Plan**, **Streamer Mode**, **Usage hidden**, **Session**, **Tokens**, **View usage and plan...**, **Remote control**, **Path**, **Project**, **Session name**, **Session ID** |
| 12 | `troubleshooting` → `i-dont-see-the-practice-branches`, `the-session-edited-the-wrong-folder`, `context-or-chronicle-is-missing`, `two-previews-collided` | Rerun setup / connect your fork; check worktree path and branch, prefer a new worktree; `/context` needs one sent prompt first; "Worktrees isolate files and branches, not ports. Stop one Vite server or start the second on port `5174`." | — | — |
| 13 | `key-takeaways` | 1 sessions = focused workspaces with own branch, diff, history · 2 worktrees keep changes out of main, new worktree is the safe default · 3 not ports, databases, or background processes; different ports for parallel previews · 4 `@ # /` | — | — |
| 14 | `assignment` | Light/dark theme toggle in an isolated worktree, `@samples/book-app-web/src`, **Plan** mode, inspect the diff, tests/build, `/chronicle standup`, stop the server; don't change `main` | `../assets/assignment.webp` (shared) | **Create from**, **Branches**, **Plan**, **Exit plan mode and I will prompt myself** |
| 15 | `whats-next` | Chapter 03: inner loop (review, debug, test, browser preview) and outer loop (issues, pull requests, review comments, checks) | — | — |

### 1.2 Concept → island → check

| Concept (anchor) | Where on the island | Check | Logbook page |
|---|---|---|---|
| What a session holds (intro, `learning-objectives`) | Bough Landing, Tamsin | **K2.1** multi-select | `pg2.session` |
| Booth analogy (`from-the-studio-…`) | Booth Pools, Lyra | **K2.2** MC | `pg2.booths` (chest C2.1) |
| Worktree + why (`what-is-a-git-worktree`, `why-the-github-copilot-app-uses-worktrees`) | Root Hall, Saffi | **M2.1** matching (the table) | `pg2.worktree`, `pg2.why` |
| Where a session runs, Base branch, switch back, Create from (`where-a-session-runs`) | Three Landings, Oak | **H2.1** hotspot | `pg2.where` |
| Parallel without collisions; not ports (`why-…`, `where-a-session-runs`, `two-previews-collided`, `key-takeaways`) | Flume Terrace + Spire, Fen | **P2.1** Channel Routing, **P2.2** Spire twist | `pg2.parallel`, `pg2.ports` |
| Decide between current checkout, a new worktree, or a cloud sandbox (`learning-objectives`, `where-a-session-runs`) | Oak; Flume Terrace round 3, Fen | **P2.1** round 3 (a place for each crew), **K2.4** (switch back to New worktree) | `pg2.where`, `pg2.parallel` |
| `@ # / &`, less is more, drag and drop, the `/` palette (`context-syntax`, `attaching-files`, `slash-commands`) | Signal Deck, Ines | **P2.3** Flag Hoist (six orders), then **K2.3** | `pg2.context-syntax`, `pg2.attach`, `pg2.slash`, `pg2.more-commands` (chest C2.2) |
| Exercise 1 (`exercise-start-…`) | Practice Bough, Rook | **H2.3** hotspot | `pg2.create-from`, `pg2.plan`, `pg2.preview` |
| Exercise 2 (`exercise-check-…`) | Chronicle Loft, Pip | **H2.6** hotspot | `pg2.chronicle`, `pg2.context`, `pg2.details` |
| Key takeaways (`key-takeaways`) | Crown Deck, Elder Maren | **Trial T2** (9 items) | `pg2.takeaways` |
| Troubleshooting (`troubleshooting` subsections) | Three message bottles + the Spire twist | — | `B2.1`–`B2.3` |
| Assignment (`assignment`) | Lantern House (optional, after the Seal) | "Try it in the app ↗" | `pg2.assignment` |
| What's next (`whats-next`) | Elder's farewell + Chart | — | — |

### 1.3 Screenshot hotspot geometry (measured on the course images, pixels `x, y, w, h`)

Measured by drawing the rects on each image (`files/ch02/*.rects.png` in the session); B converts them
with a `px(x, y, w, h, W, H)` helper like `ch01.ts`, and the Hotspot Editor confirms them.

| Image (W × H) | Target id | Rect px | Notes |
|---|---|---|---|
| `app-where-sessions-run` (1000 × 480) | `new-worktree` | 262, 224, 292, 62 | **Has the course's blue highlight.** Never the correct answer (it would give it away); a distractor only, with feedback that says the box is the course's highlight |
| | `current-checkout` | 262, 290, 292, 52 | |
| | `cloud` | 262, 348, 292, 52 | |
| | `base-branch` | 262, 414, 292, 42 | |
| | `workspace-selector` | 260, 140, 186, 36 | the chip reading "New worktree · main" |
| | `project` | 30, 140, 222, 36 | |
| | `mode` | 64, 92, 90, 30 | "Interactive" |
| `app-context-information` (1920 × 1080) | `plan` | 1362, 380, 536, 46 | |
| | `session` | 1362, 436, 536, 46 | "8.61 AI credits" |
| | `tokens` | 1362, 494, 536, 76 | |
| | `context` | 1555, 588, 346, 82 | **has the course's blue highlight**: distractor only |
| | `view-usage` | 1362, 938, 260, 44 | |
| | `credits-icon` | 1652, 1008, 46, 40 | the AI credits icon next to the microphone |
| `app-plan-from-issue` (1568 × 1080) | `approve` | 34, 880, 628, 38 | |
| | `exit-plan` | 34, 920, 628, 38 | |
| | `suggest` | 34, 960, 628, 38 | |
| | `continue` | 543, 1010, 114, 34 | |
| | `plan-tab` | 714, 12, 122, 34 | |
| | `issue-chip` | 168, 166, 292, 32 | "Improve the empty state copy #3" |
| | `worktree-ready` | 20, 72, 580, 28 | |
| `app-chronicle-standup-output` (1568 × 1080) | `changes-pill` | 24, 904, 154, 38 | |
| | `plan-pill` | 190, 904, 90, 38 | |
| | `background-pill` | 292, 904, 136, 38 | the label is only in the screenshot: feedback mustn't explain it |
| | `chronicle-chip` | 484, 546, 190, 44 | |
| `app-book-app-empty-state-before` (1568 × 1080) | `empty-state` | 726, 884, 804, 146 | |
| | `url` | 850, 58, 372, 34 | shows `127.0.0.1:5173` (used by the ports beat) |
| | `search` | 750, 585, 368, 56 | |
| | `books-shown` | 724, 782, 212, 40 | |

`app-create-from-icon` has the mouse pointer on the icon and the tooltip "Create from...": use it in the
spyglass and the Logbook only, never as a hotspot.

---

## 2. Art direction

### 2.1 The story the land tells

The crews of Thousand-Bough used to work together in the **Great Hall** inside the trunk, and their work
kept getting tangled. Now every crew has its own treehouse on its own bough, all fed by one spring and
rooted in one trunk. The **Elder** won't light the **Crown Beacon** until a captain proves they can keep
crews apart. The fog of scattered evidence (PLAN §3) lies in the valley as mist; at the top of the tree
you **rise above it**. That climb is the island's emotional line: **cool, misty, mysterious at the water →
warm, lantern-lit, busy in the boughs → golden and clear at the crown.**

### 2.2 Look in one sentence

A Disney-park "land": a misty jade jungle valley held in a horseshoe of mossy basalt cliffs, three
waterfalls, and in the middle one enormous, silver-barked banyan whose limbs carry a lantern-lit village
of honey-teak treehouses, rope bridges and signal flags.

### 2.3 Palette (the colour story)

| Role | Colour | Where |
|---|---|---|
| Deep canopy | `#1F4A2E` | canopy undersides, shaded jungle |
| Mid leaf | `#3E7A3A` | most foliage |
| Sunlit leaf rim | `#8DBF4F` | canopy tops in the low sun, translucency |
| Moss | `#5E8C3A` | rocks, roots, rails, roofs |
| Banyan bark | `#8C8573` (silver-grey), undertone `#6B5A45`, aerial roots `#A69C86` | the great tree and its little sister |
| Wet basalt | `#3A3F3C`, moss caps `#4F6E3A` | cliffs, the Spire, pool rims |
| Jade water | `#2E9C8A` (pools, streams), cove `#1FA39A` | absorption preset "jade river"; cove "turquoise lagoon" |
| Treehouse timber | honey teak `#B07A45`, weathered `#7D5A3A`, thatch `#C9A86A`, rope `#C8B48A` | village kit materials, tinted |
| Lantern light | amber `#FFB54A` (halo `#FFD08A`) | every lantern; the Crown Beacon is whiter `#FFF1C8` |
| Crew colours | Feature **blue `#3B82F6`**, Bug Fix **green `#3FA34D`**, Docs **teal `#1EA7A7`** | sails, banners, dye, house trims (echo the course diagram) |
| Cloud Loft | pale lilac sailcloth `#E9E4F5` | only on the far peak |
| Path wienies | heliconia red-orange `#E2552D`, orchid magenta `#C2307A` | flower clusters at every path turn (sparingly) |
| Mist | sunlit `#F2D9A6`, shade `#9FB3C8` | mist cards and fog tint |

Rules: saturated colour only on things that matter (crew colours, lanterns, wienie flowers). The jungle
stays in 3 greens; the bark stays silver so the tree reads against green; no pure white except foam and
the Beacon.

### 2.4 Time, sky, fog, light (`ISLANDS['thousand-bough'].sky` and a new `mood`)

- **Sun:** elevation **0.10 rad** (≈ 6°), bearing **≈ 290°** (WNW; bearings in this spec are degrees
  clockwise from north = −z). A tunes `hours` and `azimuth` until the debug sun direction matches and
  writes the values into `islands.ts` (Meridian is `17.35 / −45`).
- **Why that sun:** from the berth (looking NNE) the tree is **side-lit from the left**: warm faces on the
  west sides of the decks, deep shade under the canopy where lanterns glow. On High/Ultra the cached
  shadow map makes shafts through the canopy gaps (PLAN §12.5); the crown and the cliff tops catch rim
  light (the bake's rim flag).
- **Mood (new, small shared change by A):** an optional `mood` on `IslandBerth`, blended in the passage
  exactly like `passageSky`:
  `{ fogScale: 1.8, hazeTint: [0.93, 0.97, 1.0], mistTop: 34, mistSun: '#F2D9A6', mistShade: '#9FB3C8' }`.
  `fogScale` multiplies the keyframe `fog` density; `hazeTint` multiplies the haze colour. Anchorage and
  Meridian get the identity mood (no visual change; their screenshots must match before and after).
- **Valley mist:** 30–60 large soft **mist cards** (one instanced mesh, one material) floating between
  y 8 and `mistTop` 34 over the valley floor, the pools and the cove's inner edge, drifting slowly with
  the shared wind. Rules: no card within 3 m of terrain, trunk, decks, or a walkable surface (a hard
  intersection line breaks the illusion); cards fade by camera distance (gone within 6 m) and by height;
  colour blends `mistShade` → `mistSun` by the sun-facing side. Plus a **mist plume** at each waterfall foot.
- **Shaft cards (Low only):** 6 warm translucent cards using the **same mist material** (no new pipeline)
  under canopy gaps, ≥ 4 m from any walkable surface, cleared where they cross a character (lesson:
  additive layers wash out characters; these use normal alpha blending and a character clearance like
  the cabin's `guideClearance`). Medium has the screen-space radial shafts, High/Ultra the real ones.
- **Night handoff:** if the player changes the time (Sky & Time), lanterns, windows and fireflies follow
  the night factor; at the authored time they're already on (the valley is in shade).

### 2.5 The weenie and the wienies along the paths

- **The weenie:** the banyan. Visible from the sea approach, the berth, every path and every deck. Its
  crown breaks the skyline in the saddle between two higher peaks, which frame it like a proscenium.
- **Wienies along the way** (you always see where to go next):
  1. **The little sister tree** at Bough Landing: a 14 m banyan whose prop roots hold up the jetty's land
     end. Same generator, scale ≈ 0.18. It foreshadows the great tree and makes it read bigger (repetition
     at a smaller scale).
  2. **Lantern posts** along the Fern Walk every 12 m, alternating sides; heliconia clusters at each turn.
  3. **The Root Gate**: two prop roots that cross in an arch over the path, framing the trunk and the
     Great Hall's glowing arch carved "main".
  4. **Signal flags** on the Signal Deck mast (y 31 + 12 m mast), seen from the jetty.
  5. On the tree, each landing shows the **next deck's lantern string**; the Crown Beacon glows down
     through the Sky Window.
  6. **The Spire's magic-lantern screen** glows when a crew projects a preview.

### 2.6 Silhouette and landmark readability

- From the sea (300–1500 m): a horseshoe ridge with two peaks (W 95 m, E 125 m) and a low saddle (58 m);
  the **tree's asymmetric dome** (tallest mass to the NE, top ≈ 77 m) stands in the saddle; three white
  threads of water (Silver Thread W, the Veil behind the tree, Great Falls E). No other tree on the island
  comes within 25 m of the banyan's height.
- On the chart (opening and `M`): the miniature shows the horseshoe, the cove and a single raised dome.
- The far silhouette (`createThousandBoughSilhouette`, like Meridian's) includes the tree's dome so
  you see it on the horizon from Meridian's citadel and from the passage.

### 2.7 Disney-land rules applied

- **Layered depth** from the berth: water → jetty and little sister tree → Fern Walk lanterns → Booth
  Pools → Root Gate → trunk and decks → canopy → mist → cliffs and falls → sky.
- **Forced perspective:** treehouses get smaller with height (upper houses at 0.85 scale, windows and
  doors too); leaf clusters get smaller toward the crown; stair rails taper. The tree reads taller.
- **Kinetic elements:** three waterfalls, streams, three wheel-lifts turning, baskets rising, the Cloud
  gondola gliding into the mist every 90 s, flags snapping, lanterns swaying (off in reduced motion),
  fireflies, parrots crossing between the tree and the cliffs, blue butterflies at the Booth Pools,
  dragonflies over the pools, rope bridges swaying a few centimetres (visual only).
- **Every crew house is distinct** (roof shape, trim colour, a prop that says who they are: Feature has a
  star-shaped window and blue sails; Bug Fix has a beetle weathervane and green shutters; Docs has
  scroll racks and paper-boat garlands). No copy-pasted house.
- **Nothing random:** every prop has a reason (a rope coil by the lift, a dye bucket by each gate, a
  ledger on Pip's table). Scatter is only for plants and rocks, inside rules.
- **Signs use the course's exact strings:** `main`, `feature`, `bug-fix`, `docs` (from
  `one-repo-many-worktrees`), `practice-empty-state-copy`, `5173`, `5174`. Never an Octocat or a Copilot
  logo (AGENTS.md).

### 2.8 Hero shots (they must be screenshot-ready; §12.2 lists the captures)

| Id | Shot | Camera → target | Must show | Must not show |
|---|---|---|---|---|
| H1 | **The Approach** (arrival key 1) | (1700, 12, −1020) → (2010, 48, −1560) | whole island, tree in the saddle, three falls, cove mouth, ship lane | terrain edge, apron, any pop-in |
| H2 | **First Look** (landing, default follow camera) | landing pose | jetty, little sister tree on the left, Fern Walk lanterns as a leading line from bottom-left, Root Gate, trunk on the right third, decks with lanterns, flags, Great Falls right, Silver Thread left | empty sky in the middle, a bare cliff wall filling the frame |
| H3 | **Root Gate** | (1980, 16.5, −1532) → (2010, 24, −1556) | arch framing the trunk, "main" arch glowing, the stair rising | camera inside a root |
| H4 | **Signal Bridge** | mid-span of R1 looking SW → (1931, 5, −1372) | ship at the jetty, cove, mist, sea | canopy leaves within 2 m of the lens |
| H5 | **Flume Terrace** | puzzle camera (2010, 36, −1596) → (2008, 21, −1626) | full grid, three colours flowing, header gates, Upper Pool, the Veil behind | the player's head |
| H6 | **Two Lookouts** | twist camera (2026, 34, −1626) → (2056, 24, −1578) | L1E, bridges R2 and R3, the Spire with lookouts 5173 and 5174, crews on the bridge | — |
| H7 | **Above the Mist** | Crown Deck (2010, 52.3, −1548) → (1931, 4, −1372) | mist filling the valley, treetops poking out, cove glinting, ship, Silver Thread and Great Falls at the edges, sun low WNW | the deck rail across the middle of the frame |
| H8 | **Seal Cascade** | (1960, 30, −1470) → (2010, 40, −1560) | lanterns lighting from the Beacon down every bough | — |
| H9 | **Horizon Weenie** | Meridian citadel (816, 42, −786) → (2010, 40, −1560) | the tree's dome on the horizon | — |
| H10 | **Behind the Falls** | in the cave (2150, 20.5, −1640) → (2120, 15, −1595) | the curtain of water, Mirror Pool beyond, mist | cave walls clipping the camera |

---

## 3. Layout (world space)

Conventions (same as the code): metres; **x east, z south, y up**; sea level y 0. A heading `h` faces
`(sin h, cos h)` (Meridian: berth heading 0 = bow south, landing heading π = facing north).
**Bearing** b (°) is clockwise from north: a point at bearing b and radius r from P is
`(P.x + r·sin b, P.z − r·cos b)`. All tree-relative values use **T = (2010, −1560)**.
See [top-down-layout.svg](island-02/top-down-layout.svg).

### 3.1 Island data (`THOUSAND_BOUGH` in `src/world/islands/thousand-bough/layout.ts`)

| Key | Value |
|---|---|
| `center` | (2050, −1500) |
| `bounds` | minX 1640, maxX 2460, minZ −1900, maxZ −1100, cell 2 (410 × 400 samples; Meridian is 465 × 345). Ground falls to the deep sea floor (−58) at every edge (Meridian's edge apron) |
| `island` | ellipse half-axes 300 (x) × 270 (z), coastline noise ±12 m, cove bite to the SW |
| `contains(x, z)` | inside `bounds` |
| `deepDepth`, `seabedRadius` | 58, 1000 (as Meridian) |

### 3.2 Terrain shape (`thousandBoughHeight`, `thousandBoughMasks`)

Built like `meridianHeight`: a noisy ellipse, pads (`padHeight`), segment masks, plus these features.

| Feature | Geometry | Height | Notes |
|---|---|---|---|
| **Mistcrown ridge** (horseshoe) | spline W Peak (1835, −1705) → Saddle (2010, −1748) → E Peak "Thunder Crown" (2200, −1695) → (2290, −1560) → (2280, −1400) → East Head (2240, −1285) | 95 → 58 → 125 → 80 → 55 → 28 | ridged noise; **inner (valley) face steep**: fluted basalt cliffs 25–45 m where slope > 50°; outer face to the north coast with 20–40 m sea cliffs |
| **West spur** | W Peak → (1800, −1560) → (1790, −1420) → West Point (1840, −1300) | 95 → 60 → 35 → 18 | cliffs into the cove's west side |
| **Valley floor** | bowl inside the horseshoe | 6 at the cove shore → 14 at (1990, −1500) | gentle (≤ 12°) everywhere the player walks |
| **Knoll** (tree) | pad at T, radius 34, edge 26 | **18.5** | under the Root Hall deck; buttress roots grow from its rim |
| **Flume shelf** | pad (2008, −1622), r 18, edge 12 | 22 (north edge 23, south 20; the grid steps down) | |
| **Upper Pool** | basin (2010, −1665), r 16 | water level 23.5 | fed by the Veil |
| **Mirror Pool** | basin (2135, −1612), r 22 | level 15 | fed by Great Falls |
| **Silver Pool** | basin (1880, −1610), r 12 | level 12 | fed by Silver Thread |
| **Booth Pools** | three stepped pools at (1916, −1484), (1920, −1494), (1924, −1504), r 4–5 | levels 6.0 / 6.5 / 7.0 | on Fernrun; tiny cascades between them |
| **Spire** | basalt column at (2066, −1594), radius 7, ground ≈ 13 | top 27; lower ledge on its south side y 24.5 | fluted, mossy, a small fern garden on top |
| **The cove** | sea basin, centre (1905, −1360), rX 75, rZ 90, mouth to the south between West Point and (1985, −1285) | floor −6.5 (−8 in the mouth) | calm zone (mirror on High/Ultra) |
| **East Beach** | (2150, −1290) | 0–2 | gold sand, Thunder Run reaches the sea here |
| **Behind-the-falls cave** | mouth (2148, −1642), 9 m wide, 7 m high, 10 m deep | floor 19 | ledge path 3 m wide from the Mirror Pool's west shore (y 17) |

Masks: the inner cliffs and the Spire are `cliff`; the valley floor is `grassHill` with a new **`jungleFloor`**
look only if the census allows (otherwise `grassHill` tinted dark green by a region tint); beaches are
`sand`; the knoll top is `town`-like packed earth under the deck. Regions go in
`src/world/islands/thousand-bough/terrain-regions.ts` and the registry line (skill §1).

### 3.3 Water (`src/world/islands/thousand-bough/water.ts`, data like `meridian-water.ts`)

| Name | From → to | Width / drop | Feeds |
|---|---|---|---|
| **The Veil** (waterfall) | Saddle lip (2010, −1712, y 52) → Upper Pool | 14 m wide curtain, 28 m drop | the puzzle header |
| **Header Race** | Upper Pool (2010, −1650) → header box (2008, −1632) | 2 m stone race | puzzle gates |
| **Flume grid outflows** | grid south edge → three chutes → wheel-lifts at bearings 330, 0, 30, r 26 from T | 0.8 m wooden chutes | wheels, then the Wheel Race |
| **Wheel Race** | round the knoll's north and west at y 17.5 → (1978, −1572) | 1.5 m | Fernrun |
| **Fernrun** (stream) | (1978, −1572) → (1958, −1540) → (1948, −1515) → Booth Pools → (1895, −1460) → cove at (1872, −1420) | half-width 1.6–2.5, `minFall` 0.02 | the cove |
| **Silver Thread** (waterfall) | W cliff lip (1878, −1650, y 60) → Silver Pool | 3 m wide, 48 m drop (tall, thin) | Silver Run → joins Fernrun at (1898, −1468) |
| **Great Falls** | E cliff lip (2150, −1652, y 70) → Mirror Pool | 22 m wide, 55 m drop (the biggest) | Thunder Run → (2170, −1500) → East Beach |

Wading: every pool has a 2 m wading shelf; the deep middle stops you (Meridian's `inland`). No stream
the player must cross is deeper than wading; the Fern Walk crosses Fernrun on plank bridge **B0**
near (1957, −1518).

### 3.4 The berth (ship and approach)

| Item | Value |
|---|---|
| **Approach lane** (from Meridian) | (1500, −800) → (1860, −1120) → mouth (1905, −1265) → berth. Lane half-width 30 m: no rock or terrain above −6 m inside it; the mouth is ≥ 90 m wide at the waterline and ≥ 8 m deep mid-channel |
| **Turning room** | a 45 m circle at (1905, −1360) at least 6 m deep |
| **Jetty** ("Root Wharf") | timber on piles, deck x 1936–1942, z −1425 → −1350, height 2.2; its **face (water's edge) runs along x0 = 1936**; fenders every 6 m; its land end sits among the little sister tree's roots |
| **Berth** | (1931.35, −1372), heading 0 (bow south toward the mouth, port side to the jetty), like Meridian |
| **Landing** | (1939.2, −1376), heading **2.77** (faces the tree: `atan2(70.8, −184)`); A may tune ± 0.15 to frame H2 |
| **Bough Landing** | timber deck 18 × 14 at y 2.6, centre (1949, −1434), with a thatched boathouse, the little sister tree at (1956, −1442) |
| **Ship obstacles** | circles along the jetty's piles (Meridian's ship-obstacle rows) |
| **Fast-travel quay** | the landing pose |

### 3.5 The great banyan

| Part | Spec |
|---|---|
| **Trunk** | 7 fused trunks, fluted; radius 9 at y 18.5 (buttress flare to 14 at the knoll rim, between the deck ring segments), 8 at y 30, 7 at y 40, 6 at y 50, top of the trunk y 52 |
| **Major limbs** | 7, leaving the trunk between y 27 and 40 at bearings **20, 95, 135, 165, 235, 300, 340**, reaching r 45–60, diameter 3.5 → 1.5 m. Each limb's height where it crosses the stair band (r 15.5–19.5) obeys the **stair clearance rule** (§3.6). Proposed limb heights at the band: 20 → 32.5, 95 → 35, 135 → 31, 165 → 37, 235 → 27.5, 300 → 30, 340 → 34 |
| **Prop roots** | 36 aerial roots from the limbs to the ground at r 26–55, diameter 0.8–2.2 m; none on a path, deck, or within 2.5 m of one; they make colonnades either side of the Fern Walk's last 30 m |
| **Canopy** | an **open cathedral**: no leaves inside r 26 below y 56; an outer ring of leaf at r 27–58 (one continuous ceiling, its underside sloping up toward the trunk), bottoms ≥ 36, tops ≤ 48 on the south side (bearings 120–260, the **Sea Window**) and ≤ 56 elsewhere; a **high crown** of two masses to the NE (bearings 20–80, r 19–45) from y 58 to **77**. The Crown Deck has open sky to the S, W and N. **Every leaf clump hangs on wood:** sprays fork off the limbs and the leaders into the leaf, and each clump has its own twig off them into its heart (tested); its leaves sway about where the twig enters, never the whole clump |
| **Hanging life** | vines and moss strands (leaf material ribbons), 120 lanterns on the limbs, 6 bird perches |
| **Canopy clearance envelope** | **no leaf geometry within 6 m above or 4 m beside any walkable surface** (tested) |
| **The little sister tree** | at (1956, −1442), the same generator at scale 0.18, 6 prop roots, 12 lanterns |

### 3.6 The tree village: stair, decks, houses, bridges, lifts

**The Great Stair** is one continuous **clockwise helix** round the trunk: radius band **15.5–19.5** (3.4 m
walkway + rails), **12 m of rise per turn** (10.9 % grade), starting on the Root Hall deck at **bearing 200,
y 18.5** and topping out at **bearing 80, y 50.5** (2.67 turns, ≈ 290 m of stairs, about 70 s of walking in
pieces). Height at total turn angle θ (degrees from the start): `y = 18.5 + 12·θ/360`.
The helix above itself is always 12 m higher, so the follow camera always has headroom.
Outer rail all the way; open to the outside (no walls: the lighthouse-stairwell lesson). Inner side is the
trunk (a camera blocker). Lanterns every 8 m on the outer rail.

**Stair clearance rule** (A's tests check it): wherever anything crosses the helix band, its underside is
≥ 4.5 m above the stair walk at that bearing, or its top is ≥ 0.6 m below it.

| Id | Deck | Bearing / r | y | Size | Reached by | What's there |
|---|---|---|---|---|---|---|
| **L0** | **Root Hall** | ring r 9–24 | 18.5 | ring with gaps for buttress roots | Fern Walk via the Root Gate (bearing 220) | Saffi; Great Hall arch "main" (bearing 180, r 9, a glowing woven screen, not enterable); three wheel-lifts on the north (bearings 330, 0, 30, r 26); the Sky Basket (bearing 270, r 23); the stair foot (bearing 200) |
| **L1E** | **Three Landings** | 90 / 27 | **26.8** (θ 250) | 16 (radial) × 14 | helix | Oak; the gondola station (SE corner, 2043, −1552); the "new house" scaffold on a fresh bough (bearing 110, r 30, y 30) with a sign **Base branch: main**; an upper door into the Great Hall; bridges R2 and R3 to the Spire; the boardwalk to the Flume Gallery |
| **FG** | **Flume Gallery** | (2024, −1618) | 26 | 8 × 10 | boardwalk from L1E's north edge: (2037, −1567) → (2040, −1595) → (2026, −1618), 3 m wide, on trestles, with rails | Fen; the Gate Board console; the puzzle camera anchor |
| **L2SW** | **Signal Deck** | 225 / 26 | **31.3** (θ 385) | 16 × 12 | helix | Ines; the signal mast (12 m, four halyards); bridge R1 |
| **L2S** | **Practice Bough** | 160 / 32 | 32.5 | house + 12 × 10 deck | bridge R1 | Rook; the house with the sign `practice-empty-state-copy` |
| **L3SE** | **Chronicle Loft** | 130 / 26 | **40.2** (θ 650) | 14 × 12 deck + two-storey loft | helix | Pip; ledgers, a long desk, a brass speaking tube |
| **L4** | **Crown Deck** | disc centre (2010, −1556), r ≤ 15 | **50.5** (θ 960, helix tops out at bearing 80 via a 4 m landing) | disc | helix or Sky Basket | Elder Maren; the **Crown Beacon** (lantern cage on a mast to y 64) |

Crew houses (**not walkable**, seen and animated): **Feature** (bearing 315, r 31, floor y 31, blue),
**Bug Fix** (bearing 0, r 33, floor y 33, green), **Docs** (bearing 30, r 32, floor y 31, teal). Each sits on
its own bough with a carved folder-tab sign (`feature`, `bug-fix`, `docs`) and has a basket lift on a rope
from its wheel at the trunk's foot.

| Id | Rope bridge | From → to | Span / sag | Notes |
|---|---|---|---|---|
| **R1** | Signal Bridge | L2SW east end (1987, −1537, y 31.3) → L2S deck (2015, −1527, y 32.5) | ≈ 30 m / 1.2 m | the first bridge; faces the sea; H4 |
| **R2** | Spire Bridge (5173) | L1E east edge (2045, −1563, y 26.8) → Lookout **5173** on the Spire top (2064, −1597, y 27) | ≈ 39 m / 1.8 m | the shared bridge of the twist |
| **R3** | Second Bridge (5174) | L1E east edge (2045, −1556, y 26.8) → Lookout **5174** on the ledge (2066, −1587, y 24.5) | ≈ 37 m / 1.5 m | rolled up until the twist; then walkable |
| **B0** | plank bridge | over Fernrun at (1957, −1518) | 6 m | on the Fern Walk |

All bridges: 2.4 m clear walkway, rope rails at 1.1 m, planks with 3 cm gaps that read as gaps but walk
as a smooth sag curve. Visual sway ±5 cm (none with reduced motion); the walk surface doesn't move.

**Lifts:** the **Sky Basket**, L0 ↔ L4 at bearing 270, r 23 (passes 3.5 m outside the stair band; lands on a
4 m bridge-landing to the Crown disc at y 50.5, 5.7 m above the helix's pass there). It opens **after you
first reach the Crown** (the Elder sends it down). It reuses Meridian's cliff-lift transit
(`lighthouse-transit.ts` style, two stops). The three crew wheel-lifts are scenery driven by the puzzle.

**Gondola (Cloud):** from L1E's SE corner (2043, −1552, y 28) to the **Cloud Loft** on Thunder Crown's
shoulder (2165, −1668, y 92); cable clears the Spire by 20 m and the canopy by ≥ 4 m. One car cycles
every 90 s, vanishing into the mist cards round the loft. Not rideable.

**The Fern Walk** (ground path, 3.5 m wide, stone and root steps where it climbs > 15 %):

| Waypoint | Position | y |
|---|---|---|
| W0 Bough Landing | (1945, −1432) | 2.6 |
| W1 | (1948, −1458) | 4.5 |
| W2 Booth Pools stop | (1934, −1488) | 7.5 |
| W3 | (1950, −1510) | 10.5 |
| B0 plank bridge | (1957, −1518) | 11.5 |
| W4 | (1980, −1532) | 15 |
| Root Gate | (1992, −1538) | 17.2 |
| L0 deck edge | (1996, −1544) (bearing 220, r 22) | 18.5 |

Side paths: Booth Pools loop; the cove's west beach (bottle B2.1); Mirror Pool path from L0's east side
(2032, −1566) down to the Mirror Pool's west shore (2116, −1600, y 15.5) and the ledge behind Great Falls
(chest C2.2); Thunder Run to East Beach.

### 3.7 Stations (NPC anchors and look targets)

Anchor names are part of the contract (§9.3). Each anchor stands on a walk surface with **4 m clear
radius** and **camera space** (§3.9).

| Anchor | Who | Position (x, y, z) | Heading | Look target (tx, ty, tz) |
|---|---|---|---|---|
| `tamsin` | Tamsin Reed | (1949.5, 2.6, −1436) | −0.17 | (1940, 3.5, −1376) |
| `lyra` | Lyra Wren | (1928, 7.4, −1494) | 0.79 | (1934, 8.6, −1488) |
| `saffi` | Saffi Rootwell | (2010, 18.5, −1547) | −1.36 | (1996, 19.7, −1544) |
| `oak` | Bosun "Oak" Okoro | (2040, 26.8, −1556) | −2.29 | (2023, 28, −1571) |
| `fen` | Fen Marrow | (2024, 26, −1618) | −1.57 | (2008, 22, −1622) |
| `ines` | Ines Calloway | (1991.6, 31.3, −1541.6) | 2.36 | (2001, 32.5, −1551) |
| `rook` | Rook Tallow | (2020.9, 32.5, −1529.9) | −1.57 | (2000, 33.5, −1533) |
| `pip` | Pip Hollow | (2029.9, 40.2, −1543.3) | −2.27 | (2016, 41.4, −1555) |
| `elder` | Elder Maren Ashgrove | (2010, 50.5, −1552) | 0 | (1931, 6, −1372) |
| `gateBoard` | Gate Board console (P2.1 start) | (2022.5, 26, −1620) | −1.57 | grid centre |
| `puzzleCam` | puzzle camera | (2010, 36, −1596) | — | (2008, 21, −1626) |
| `twistCam` | twist camera | (2040, 31, −1598) (was (2026, 34, −1626): too far for the jam to read) | — | (2054, 25.5, −1576) |
| `flagMast` | signal mast base | (1986, 31.3, −1540) | — | — |
| `skyBasketBottom` / `skyBasketTop` | lift | (1987, 18.5, −1560) / (1987, 50.5, −1560) | — | — |
| `lanternHouse` | optional assignment house | the L1E scaffold (2038, 30, −1549) | — | — |
| `extraSwing`, `extraWeaver`, `extraLift`, `extraFisher`, `extraLook` | islanders | Fernrun pool (1940, 9, −1505) · L0 west (1992, 18.5, −1566) · Sky Basket bottom · West beach (1860, 1, −1330) · Lookout 5173 | — | — |

### 3.8 Collectibles

Five starfish (Meridian has five), two chests, three bottles.

| Id | What | Where (x, z, y) |
|---|---|---|
| `sf.t.landing` | starfish "On the Root Wharf" | (1947, −1428), y 2.6 |
| `sf.t.booths` | "By the Booth Pools" | (1918, −1499), y 6.8 (on a mossy stone) |
| `sf.t.roothall` | "Among the roots" | (1992.7, −1570), y 18.5 (L0, bearing 300, r 20) |
| `sf.t.signal` | "Up on the Signal Deck" | (1986.7, −1536.7), y 31.3 |
| `sf.t.crown` | "At the top of the tree" | (2010, −1567), y 50.5 |
| `C2.1` | chest: `pg2.booths` (10 doubloons) | beside the third booth (1924, −1500) |
| `C2.2` | chest: `pg2.more-commands` (15 doubloons) | behind Great Falls, in the cave (2150, −1646), y 19 |
| `B2.1` | bottle: practice branches | cove west beach (1858, −1335) |
| `B2.2` | bottle: wrong folder | Fernrun bank (1902, −1468) |
| `B2.3` | bottle: `/context` missing | Mirror Pool shore (2122, −1592) |

### 3.9 Walkability and camera (hard rules)

- **Everywhere the player can stand** has a walk surface: terrain (≤ 35° slope), deck, stair, bridge,
  ledge. Stacked surfaces use the `y` argument of `WalkSurface.heightAt` (as the lighthouse stair does).
  No gap between connected surfaces is wider than 0.25 m or taller than the 0.45 m step height.
- **Colliders** use `y0`/`y1` (`BoxCollider`, `CircleObstacle`) so a rail on a deck doesn't block the ground
  below it.
- **Off-limits** (blocked by rails, rock, cliffs, or dense plants, never a bare invisible wall in the open):
  crew houses, the Cloud Loft, the cliffs above the falls, the north coast, the Spire's sides, the grid's
  tiles (the puzzle is played from the gallery).
- **Camera space:** stops have ≥ 12 m of open deck; stairs are open to the outside; nothing overhead
  lower than 4.5 m on any walk surface except doorways (not entered); the trunk, Spire, cliffs, cave walls,
  house walls and rails are camera blockers (`meshCameraBlockers` / `addCameraBox`); canopy leaves aren't
  blockers but stay outside the clearance envelope (§3.5). The cave behind the falls is 9 m wide and 7 m
  high for the camera.
- **No floating, buried, or intersecting objects:** every prop's base sits within ±5 cm of its support
  (sampled); no prop, root, or rock intersects a walk surface, rail, or another prop; no lantern inside a
  leaf pad; no plant inside a deck, path, or pool's wading ring.
- **Coplanar faces ≥ 1 cm apart** (decks over terrain, signs on walls, planks on stringers), checked by
  `tools/flickertest.mjs --audit` with new views (§12.2).

---

## 4. Chapter beats

Each stop is **what you'll do → where it is in the app → one check → a Logbook page → who's next**, with
the compass on the next stop (like `meridian-quests.ts`). Lines below are outlines in the game's voice;
B writes the final lines (≤ 22 words, ≤ 2 sentences each, contractions, spoken lines say "Captain").
`[§anchor]` marks the source of each teaching line; every teaching line in `ch02.ts` and the voice file
carries it.

### 4.0 Arrival

- **Before:** battle 2 (`MERIDIAN_BATTLE`, docs/specs/BATTLES.md §2.0b) on the passage; its win card says
  Thousand-Bough lies ahead. The fog bank parts as you round East Head.
- **Card** (arrival flyover, §9.5): eyebrow `Chapter 02 · Sessions, Worktrees & Context`, title
  `Thousand-Bough Isle`, line `Give every task its own treehouse`.
- **Juno** (first mate) on the jetty: "That's no ordinary tree, Captain. Folk say every crew up there has
  a house of its own." **Wingman**: "Lanterns! Mist! I'm not going in the mist." (no teaching; no cite).

### 4.1 Stops

| # | Quest | NPC · place | What you'll do | Where it is in the app | One check | Logbook | Next |
|---|---|---|---|---|---|---|---|
| Q2.1 | **The Root Wharf** | Tamsin · Bough Landing | Hear what a session can hold | A project session (the chapter intro) | **K2.1** | `pg2.session` | Lyra at the Booth Pools |
| Q2.2 | **The Booth Pools** | Lyra (Bard) · Booth Pools | Hear the booth analogy; step into each booth | — (analogy) | **K2.2** · chest C2.1 · music unlocks | `pg2.booths` | Saffi at the Root Hall |
| Q2.3 | **One Trunk, Many Houses** | Saffi · Root Hall (L0) | Learn what a Git worktree is and why the app uses them | Worktree-backed sessions | **M2.1** | `pg2.worktree`, `pg2.why` | Up the Great Stair to Oak |
| Q2.4 | **The Three Landings** | Oak · L1E | Choose where a session runs; send a crate up the Cloud gondola | **+**, the workspace selector, **New worktree** / **Current checkout** / **Cloud**, **Base branch**, **Create from** | **H2.1** | `pg2.where` | Fen at the Flume Gallery |
| Q2.5 | **Channel Routing** | Fen · Flume Gallery, then the Spire | Route three crews' water so they never mix; then the ports twist | Parallel sessions; worktrees don't separate ports | **P2.1**, **P2.2** | `pg2.parallel`, `pg2.ports` | Ines on the Signal Deck |
| Q2.6 | **Four Flags** | Ines · Signal Deck (L2SW) | Hoist the right flag for each need; pack light; drop a file on the session | `@`, `#`, `/`, `&` in the prompt box; drag and drop onto a session; type `/` for the palette | P2.3 Flag Hoist, then **K2.3** | `pg2.context-syntax`, `pg2.attach`, `pg2.slash` | Rook across the Signal Bridge |
| Q2.7 | **The Practice Bough** | Rook · L2S | Walk through Exercise 1 with the screenshots | **Create from** → **Branches** → **Plan** → `#3` → **Review plan** → **Exit plan mode and I will prompt myself** → preview → **Changes** | **H2.3** | `pg2.create-from`, `pg2.plan`, `pg2.preview` | Pip at the Chronicle Loft |
| Q2.8 | **The Chronicle Loft** | Pip · L3SE | Read the crew's day back; check the session's usage | `/chronicle standup`, `/context`, the usage popup, the session name menu | **H2.6** | `pg2.chronicle`, `pg2.context`, `pg2.details` | The Elder at the Crown |
| Q2.9 | **The Canopy Trial** | Elder Maren · Crown Deck (L4) | Pass the Trial; light the Crown Beacon | key takeaways | **Trial T2** | `pg2.takeaways` | Keelhaven (Chapter 03) |

Quest data (B, `src/game/thousand-bough-quests.ts`), modelled on `MERIDIAN_QUESTS`:

| Id | `task` (tracker) | `steps.start` | `steps.done` |
|---|---|---|---|
| Q2.1 | Learn what a session can hold | Tamsin Reed waits under the little banyan at the end of the wharf. | A session can have its own branch, folder, plan, diff, terminal output, preview and GitHub context. |
| Q2.2 | Hear the Bard's tale | Lyra's playing by the Booth Pools, up the Fern Walk. | A worktree is like a recording booth: its own folder and branch, the same song. |
| Q2.3 | Learn what a worktree is | Saffi Rootwell keeps the Root Hall at the foot of the great tree. | A Git worktree is another working folder for the same repository, usually on its own branch. |
| Q2.4 | Choose where a session runs | Climb the Great Stair to Oak at the Three Landings. | New worktree is the safe default. Base branch sets where it starts. Create from always makes a new worktree. |
| Q2.5 | Run crews in parallel | Fen Marrow's at the Flume Gallery, along the boardwalk from the Three Landings. (`channels`: Route each crew's water to its own wheel. · `twist`: Both crews want the Lookout. · `solved`: Talk to Fen.) | Worktrees separate files and branches, not ports. Use different ports for parallel previews. |
| Q2.6 | Add context to a prompt | Ines Calloway runs the Signal Deck, higher up the stair. | `@` files and folders, `#` issues and pull requests, `/` commands, `&` other sessions. Less is often more. |
| Q2.7 | Start a session from a branch | Cross the Signal Bridge to Rook on the Practice Bough. | Create from, Branches, Plan, attach #3, then review the plan and the diff. |
| Q2.8 | Check a session | Pip Hollow keeps the Chronicle Loft, near the top. | /chronicle standup recaps your day. /context shows tokens, context and AI credits. |
| Q2.9 | Pass the Trial to earn the Seal | Elder Maren waits on the Crown Deck. (`exam`: The Elder's Trial is ready whenever you are.) | The Seal of Thousand-Bough is yours. |

`THOUSAND_BOUGH_ISLAND.next`: "Keelhaven is next, and she's still being charted. Until then these waters
are yours." Meridian's `next` changes to point here once the island ships.

### 4.2 Cast

No two characters on the island share a voice (PLAN §7a). Bodies and palettes come from the character
library (`npc-palettes.ts`); "look" says what to pick and tint.

| NPC (id) | Role | Look | Voice direction (ElevenLabs, eleven_v3) |
|---|---|---|---|
| **Tamsin Reed** (`tamsin`) | Wharf warden; greets every ship | woman, 40s; woven palm rain cape over a teal tunic; lantern pole; rolled sleeves | warm, unhurried alto, a gentle South-West English lilt, wry |
| **Lyra Wren** (`lyra_bough`, body `lyra`) | The Wandering Bard (travels ahead) | as on Meridian, plus a moss-green shawl and a kalimba | **keep her voice** (Azure `en-GB-LibbyNeural`, rate −5 %) for continuity |
| **Saffi Rootwell** (`saffi`) | Rootkeeper; the island's teacher | woman, 60s; bark-brown and moss shawl; a staff carved with a three-forked branch | soft, low, measured, grandmotherly; neutral British; never sing-song |
| **Bosun "Oak" Okoro** (`oak`) | Dispatcher of crews | man, 30s; broad, rope coil over a shoulder, sleeveless vest, bright headscarf | deep, upbeat, energetic; a light West African English accent, natural and respectful |
| **Fen Marrow** (`fen`) | Flumewright (water engineer) | man, 50s; wiry, leather apron, goggles pushed up, wet sleeves, a wrench | quick, delighted, fussy; Scottish |
| **Ines Calloway** (`ines`) | Signal-keeper | woman, 20s; bright scarf, flags on her belt, quick hands | bright, crisp, fast; Welsh lilt |
| **Rook Tallow** (`rook`) | Lead of the practice crew | young man, 20s; tool belt, paint-flecked shirt | friendly, casual, eager; Northern English |
| **Pip Hollow** (`pip`) | Chronicler | man, 70s; spectacles, ink-stained cuffs, a ledger under each arm | dry, gentle humour, slow; older RP |
| **Elder Maren Ashgrove** (`elder`) | Keeper of the Seal | woman, 70s; silver braids woven with leaves, layered green cloak | rich, calm contralto; Received Pronunciation; serene authority |
| Juno, Wingman | first mate, parrot | existing | existing ElevenLabs voices |

Extras (barks are text toasts like `meridianExtras`; any bark that teaches cites its anchor):
**Teo & Lark** (kids at the Fernrun rope swing; orbit), **Weaver Bea** (L0, sits), **Moss** (Sky Basket
operator), **Old Kettle** (fisher on the west beach, sits), **Lookout Jory** (on Lookout 5173 after the
twist). Sample barks: "My treehouse, my branch. Nobody tracks mud in." `[§why-the-github-copilot-app-uses-worktrees]`
· "Two lanterns on one lookout? That's a jam on the bridge." `[§two-previews-collided]` ·
"Less is often more, Captain. Don't bring the whole library." `[§context-syntax]`.

### 4.3 Dialogue outlines (with sources)

**Q2.1 Tamsin (Bough Landing).**
1. "Welcome to Thousand-Bough, Captain. Out here, every crew gets a treehouse of its own." (flavour)
2. "On Port Meridian you saw two tasks blur together in one folder. Sessions fix that." `[§learning-objectives]` (intro paragraph)
3. "A session can have its own branch, working folder, plan, diff, terminal output, browser preview and GitHub context." `[§learning-objectives]`
4. Check **K2.1**. → "Saffi will show you the trunk. Lyra's at the pools on the way."

**Q2.2 Lyra (Booth Pools).** Three reed-and-log booths over the stepped pools; a kalimba, a flute and a
rain-stick player, one in each.
1. "Three musicians, one song. You wouldn't crowd them round one microphone." `[§from-the-studio-one-studio-many-recording-booths]`
2. "Each gets a soundproof booth. They record apart, or at the same time, and you mix the takes later." `[§from-the-studio-…]`
3. "A worktree's a booth: same song, its own folder and branch, so parallel work doesn't collide." `[§from-the-studio-…]`
4. Check **K2.2**; chest C2.1 opens; the island track unlocks in the Songbook.

**Q2.3 Saffi (Root Hall).** Spyglass: `one-repo-many-worktrees`.
1. "One trunk, Captain: that's your repository. Every bough grows from it." (metaphor)
2. "A Git worktree is another working folder for the same repository, usually on its own branch, or a commit." `[§what-is-a-git-worktree]`
3. "So you can work on several tasks without stashing changes or switching branches in one folder." `[§what-is-a-git-worktree]`
4. "Without isolation, tasks edit the same folder, tests and diffs mix. With a worktree-backed session, each task gets its own folder, and its diff stays with it." `[§why-the-github-copilot-app-uses-worktrees]`
5. "The session's branch is visible in the app, so it's easier to inspect and approve." `[§why-…]`
6. Check **M2.1**. → "Oak dispatches crews from the Three Landings. Up the stair, dear."

**Q2.4 Oak (Three Landings).** Spyglass: `app-where-sessions-run`. The three choices are physical: the new
house on a fresh bough, the Great Hall's upper door, the gondola.
1. "Every job asks one question first: where does the work happen?" `[§where-a-session-runs]`
2. "Start a session with **+**, and the workspace selector below the prompt box picks the place." `[§where-a-session-runs]`
3. "New worktree: its own folder and branch beside your clone. That's the safe default this course uses." `[§where-a-session-runs]`
4. "Current checkout works right in your existing clone. Quick, but it touches your working folder." `[§where-a-session-runs]`
5. "Cloud sends the session to a cloud sandbox on GitHub's hosted infrastructure. It's in public preview." `[§where-a-session-runs]` (the gondola glides into the mist)
6. "**Base branch** sets the bough a new worktree grows from." (the scaffold's sign) `[§where-a-session-runs]`
7. "The app remembers your last choice. You picked Current checkout on Anchorage, so switch back to New worktree." `[§where-a-session-runs]`
8. "And a session you start with **Create from** always gets a new worktree." `[§where-a-session-runs]`
9. "When in doubt, a new worktree. It keeps `main` clean and still runs on your machine." `[§where-a-session-runs]`
10. Check **K2.4** right after line 7 (switch back): "Your workspace selector still says **Current checkout**, your pick from Chapter 00. What do you do before your next session?" → "Open the workspace selector and choose **New worktree**" (vs "Nothing. Each new session starts on New worktree": the app remembers your last choice · "Choose Cloud" · "Keep Current checkout. It's quicker"). `[§where-a-session-runs]`
11. Check **H2.1**. → "Fen's got crews that won't stop tangling. Boardwalk's that way."

**Q2.5 Fen (Flume Gallery → Spire).** See §5 for the puzzle. Outline: Fen's demo of the shared trough
(Without isolation), three rounds, then the twist. Closing lines:
- "Three crews, three channels, one spring. You can run sessions side by side without mixing their changes." `[§why-the-github-copilot-app-uses-worktrees]`
- "Mind, the course has you work one session at a time in this chapter." `[§why-…]`
- After the twist: "Worktrees separate files and branches, not everything. Dev servers, databases and ports can still collide." `[§where-a-session-runs]` "So give parallel previews different ports." `[§key-takeaways]`
- Back to the app, over `app-where-sessions-run`: "In the app you don't dig channels. Pick New worktree in the workspace selector, and the app makes the folder and branch." `[§where-a-session-runs]`
→ "Ines wants a word about what you pack. Signal Deck, up the stair."

**Q2.6 Ines (Signal Deck).** Four flags on the mast (PLAN §3): **cargo crate** = `@`, **bounty notice** =
`#`, **bosun's whistle** = `/`, **crew log** = `&`.
1. "Context goes in the prompt box with a few special characters. Each is a flag." `[§context-syntax]`
2. "`@` for files or folders, like `@samples/book-app-web/src`. `#` for issues or pull requests, like `#12`." `[§context-syntax]`
3. "`/` for slash commands. `&` points to other sessions, when the prompt box offers it." `[§context-syntax]`
4. "Bring the smallest amount of useful context. Less is often more." `[§context-syntax]`
5. "Got a file that isn't in the repository? Drag it from your computer onto a session or agent in the sidebar." `[§attaching-files]`
6. "Not sure what commands you've got? Type `/` and read the palette. It changes with your app, plugins, skills and policy." `[§slash-commands]`
7. "Today you need two: `/chronicle`, and `/context`. Pip'll show you both." `[§slash-commands]`
8. **P2.3 Flag Hoist** (after line 5; lines 6 and 7 follow the check), then check **K2.3**. Grants the
   glossary terms **Context** and **Context syntax**. → "Rook's crew is on the Practice Bough. Mind the bridge, it sways."

**Q2.7 Rook (Practice Bough).** A spyglass walk-through, one screenshot per step, each with an "Open in
the course ↗" link; nothing is clicked in the real app.
1. "This bough's a branch: `practice-empty-state-copy`. Its empty-state message got worse on purpose." `[§exercise-start-a-session-from-a-branch-and-attach-an-issue]`
2. "Point to the project, select **Create from**, open **Branches**, pick our branch. New worktree, every time." (`app-create-from-icon`) `[§exercise-start-…]`
3. "Set **Mode** to **Plan**, type `#3`, pick **Improve the empty state copy**, and ask for a plan." `[§exercise-start-…]`
4. "The plan opens in the **Plan** tab, and **Review plan** takes the prompt box's place." (`app-plan-from-issue`) `[§exercise-start-…]`
5. "Pick **Exit plan mode and I will prompt myself**. You're back in **Interactive**." `[§exercise-start-…]`
6. "Run the Book App, open the preview, search `hobbit`, then `zzzz-no-match`, and note the empty state." (`app-book-app-empty-state-before`) `[§exercise-start-…]`
7. "Say `Implement the plan`, then check the **Changes** tab or the **Changes** pill, reload, and compare." `[§exercise-start-…]`
8. Check **H2.3**. "Try it in the app ↗" side quest. → "Pip's got the day's log. Up you go."

**Q2.8 Pip (Chronicle Loft).** Spyglass: `app-chronicle-standup-output`, then `app-context-information`.
1. "`/chronicle standup` reports your work from the last day. It should list this session and its changes." `[§exercise-check-the-session-with-slash-commands]`
2. "`/context` opens the usage popup below the prompt box. Or select the AI credits icon by the microphone." `[§exercise-check-…]`
3. "**Session** shows the AI credits it used, **Tokens** what went to the model and back, and **Plan** your plan's use." `[§exercise-check-…]`
4. "Select the **Context** bar to see the system prompt, tools, messages, free space and buffer." `[§exercise-check-…]`
5. "Context is what the app's using for this session. Check it before you pile on more files." `[§exercise-check-…]`
6. "Select the session name at the top of the window for its branch, base branch, **Path** and **Session ID**." `[§exercise-check-…]`
7. "Then ask Copilot to stop the session's development server. No pull request needed." `[§exercise-check-…]`
8. Check **H2.6**. → "The Elder's waiting at the Crown. Last flight up."

**Q2.9 Elder Maren (Crown Deck).** On arrival the camera opens to H7 (Above the Mist).
1. "You've climbed above the mist, Captain. Down there, every crew works on its own bough." (flavour)
2. Trial **T2** (§6.3). On a pass: the **Seal of Thousand-Bough**, then §4.4.
3. "Keelhaven's shipwrights put sessions to real work: review, debug, test and preview, then issues, pull requests and checks." `[§whats-next]`
4. Card button: **Continue learning: Chapter 03 ↗**. The Sky Basket now runs both ways.

### 4.4 The Seal and what lights up

1. The Elder touches the Seal to the **Crown Beacon**; it kindles white-gold (y 64).
2. **The Thousand Lanterns:** a wave of light runs from the Beacon down every bough to the roots
   (6 s), the crew houses' windows glow in their colours, the three wheel-lifts spin, and fireflies rise
   from the valley in a slow spiral.
3. The mist thins by 30 % (mood `fogScale` eases 1.8 → 1.3 over 10 s and stays) and the Veil catches a
   last rim of sun.
4. The Chart: Thousand-Bough's lighthouse marker lights (status `complete`), the fog lifts toward
   **Keelhaven** ("Coming soon" until it's built).
5. Reduced motion: lanterns fade on together over 2 s, no firefly spiral, no camera move.

### 4.5 Optional: the Lantern House (assignment)

After the Seal, the L1E scaffold is a finished little house. Rook: "Your turn: a light and dark theme for
the Book App, in its own worktree." A lever switches its shutters between **day** (open, warm light) and
**night** (closed, lanterns on). "Try it in the app ↗" links to `[§assignment]`; Logbook `pg2.assignment`
paraphrases the success criteria (identify the branch and worktree, the context you attached, the change
and its evidence, `main` unchanged).

---

## 5. Signature puzzle: Channel Routing (P2.1) and the Spire twist (P2.2)

See [channel-routing-grids.svg](island-02/channel-routing-grids.svg).

### 5.1 How it maps to the course

| In the puzzle | In the course |
|---|---|
| One spring (the Veil) feeding every channel | one repository (`what-is-a-git-worktree`) |
| A crew's own channel to its own wheel and house | a session on its own worktree: its own folder and branch (`why-…`, `one-repo-many-worktrees`) |
| Two colours in one race → mud, both wheels stall | "Multiple tasks can edit the same folder", "Tests and diffs can mix together" (`why-…`, *Without isolation*) |
| Water spilling off the grid into the Great Hall | changes landing in your main checkout; a new worktree keeps them out of `main` (`learning-objectives`, `where-a-session-runs` tip) |
| A crew's water turning another crew's wheel | "Diffs stay tied to the session" (`why-…`) |
| Three colours running at once, no mixing | "you can run several sessions in parallel without mixing their file changes" (`why-…`) |
| Round 3: a crew's own channel, the Great Hall, or the gondola | the workspace selector's **New worktree**, **Current checkout** and **Cloud**, each for the order its "Choose it when..." row describes (`where-a-session-runs`) |
| Two crews on one bridge to Lookout 5173 | "Dev servers, databases, and ports can still collide" (`where-a-session-runs`, `two-previews-collided`) |
| Opening the bridge to Lookout 5174, or closing one crew's lantern | "Stop one Vite server or start the second on port `5174`" (`two-previews-collided`); "Use different ports for parallel previews" (`key-takeaways` 3) |

### 5.2 The board

- **Grid:** 5 columns (c0–c4, west → east) × 4 rows (r0–r3, north → south) of 3.2 m wooden flume tiles,
  centre (2008, −1622): column centres x 2001.6, 2004.8, 2008, 2011.2, 2014.4; row centres z −1626.8,
  −1623.6, −1620.4, −1617.2. The grid steps down 0.5 m per row (y 23 → 21.5) so water visibly cascades.
- **Gates (north edge):** **Feature** (blue) above **c1**, **Bug Fix** (green) above **c2**, **Docs** (teal)
  above **c3**. Each gate has a dye bucket and the crew's banner.
- **Wheels (south edge):** outlets at **c0 → Feature's wheel** (bearing 330), **c2 → Bug Fix's wheel**
  (bearing 0), **c4 → Docs' wheel** (bearing 30). Outlets c1 and c3 and both side edges spill into the
  **Great Hall** sluice (the "main" spillway). Each wheel drives its crew's basket lift to its house.
- **Tiles:** `straight` (rot 0 = N–S, 1 = E–W), `elbow` (rot 0 = N–E, 1 = E–S, 2 = S–W, 3 = W–N; each rotation
  is 90° clockwise), `rock` (fixed). Only rotation is allowed; tiles never move.
- **Water dye and floats (colourblind-safe):** Feature's water is blue and carries **blue blossoms**; Bug
  Fix's is green and carries **leaves**; Docs' is teal and carries **paper boats**. Mixed water turns
  brown and the floats tangle. Each banner and HUD chip also shows the crew's icon (star, beetle, scroll).

### 5.3 Rounds

Notation: rows north → south, `S` straight, `L` elbow, `R` rock. Rotations as above.

**Cold open: the shared trough (demo, ~20 s, not a round).** Until Fen's demo, the old shared trough
stands over the board (one wide channel, nothing dividing it); the three gates carry painted boards with
each crew's name and icon (as on the Gate Board). Fen: "We used to run every crew down the Great Hall
trough. Watch this." A title card reads **The old way · One shared trough**. All three gates open: three
coloured tongues of water (with their floats) spread, meet in brown seams, and turn to mud by the foot;
the mud spills into the sluice and down all three crews' chutes. "Three tasks, one folder. Their work
blurs together." `[§why-…]` The gates shut and the trough drains, then a short fade cuts to the board
with the trough taken apart (its boards stacked beside the terrace) and the card **The new way · One
channel per crew**, under "So now each crew gets its own channel." Nothing floats up; reduced motion
keeps the same fade.

**Round 1: One crew, one channel.** Board A, only **Feature**'s gate is live.

```
Board A (types)        Solution rotations                Start rotations
r0: L L S L L         r0: 1(E–S) 3(W–N) 0 0(N–E) 2(S–W)   r0: 3 0 0 3 0
r1: S R S R S         r1: 0 · 0 · 0                       r1: 1 · 0 · 1
r2: S L S L S         r2: 0 (any) 0 (any) 0               r2: 0 0 0 3 0
r3: S S S S S         r3: 0 0 0 0 0                       r3: 0 0 0 0 0
```

Feature needs r0c1 → W–N, r0c0 → E–S, r1c0 → N–S (3 tiles). The start sends blue east into Bug Fix's
column (a dead end in Round 1, a mix in Round 2), so pressing **Open the gates** at once shows the problem.

**Round 2: Parallel crews.** Same board; **Bug Fix** and **Docs** gates go live, and Round 1's tiles stay.
Docs needs r0c3 → N–E, r0c4 → S–W, r1c4 → N–S. Bug Fix runs straight down c2. **Exactly one solution**
(the solver in `draw.py` confirms it; B's test repeats it).

**Round 3: Where does each crew work?** (Replaced the boulder round and Board B, 2026-10-15.) Fen's crew
digs the rest: every tile turns to Board A's solution (every crew has its own channel; the tiles don't
turn this round). Each crew now gets an order, and you pick where it works, as the workspace selector
does for a session: the course's objective *"Decide between working in your current checkout, an
isolated worktree, or a cloud sandbox"* (`learning-objectives`, `where-a-session-runs`). Each order is
one row of the course's "Choose it when..." column. A new worktree is **never wrong** where the order
leaves it open: the section's tip says *"When in doubt, choose a new worktree"* and Key Takeaway 2 calls it
the safe default. So only Bug Fix, whose order asks to offload the work and keep the machine untouched,
has a single right place (Cloud); Feature's order (keep it apart from main, on your machine) is New
worktree; the quick look takes Current checkout **or** New worktree:

| Crew | Order | Best | In the world |
|---|---|---|---|
| ★ Feature | "Build the reading list. Keep its changes, branch and diff apart from main, on your machine." | **New worktree** | down its own channel to its wheel |
| 🐞 Bug Fix | "A long job to offload. Keep your own machine untouched." | **Cloud** | its gate stays shut; the gondola runs (off your deck) |
| 📜 Docs | "Just a quick, low-stakes look at the README. Touching your working folder is fine." | **Current checkout** ✓ "Right: a quick, low-stakes look can run in your current checkout." · **New worktree** ✓ "That works too. A new worktree is the safe default; for a quick look, Current checkout is fine as well." | checkout: its water runs into the Great Hall (main), fine for a quick look; worktree: down its own channel |

Opening the gates with a crew in the wrong place shows each crew's result in words (✓/✗ and "fits /
doesn't fit this order", or the place's own line, as for Docs above), the first wrong crew's reason on
screen (`CREW_ORDERS[…].why`, e.g. Docs in the Cloud: "Cloud offloads the work. For a quick, low-stakes
look, Current checkout is fine, and a new worktree is the safe default."), and Fen says why its best
place fits (`tb.fen.ws.worktree|checkout|cloud`; for Docs: "That's only a quick, low-stakes look. Your
current checkout's fine for that, and a new worktree's the safe default."). `CREW_ORDERS[…].accept` lists
every right place; a unit test fails if an order refuses New worktree without asking to offload the work
and keep the machine untouched. Solved: "Every crew where its order fits. The choices trade speed
against isolation." `[§where-a-session-runs]`

Controls: each crew is a radio group of three buttons (≥ 44 px; the pick shows ● and a frame, never
colour alone). Keys ↑/↓ pick the crew, ←/→ (or E, or 1–3) its place, F opens the gates, R clears, Q
hints. Gamepad: d-pad ↑/↓ crew, ←/→ or A place, X gates, Y hint. Hints: (1) "Read each crew's order. Own
channel, a quick look, or off your deck?" (2) the first wrong crew's order again; (3) Wingman puts it
in its place. Resuming a save at round 3 opens straight on the picks (nothing replays).

Board B and the boulder (below, kept for the record) are retired; `draw.py` still draws them. With
Board B gone, the **wrong wheel** ending can't happen on the board (Board A can't send a crew to
another crew's wheel); the logic and Fen's line stay.

*Retired:* **After the rain.** A boulder rolled into r2c2 and Fen swapped in Board B. All gates live.
Start: every tile at rot 0.

```
Board B (types)       Solution rotations
r0: L L S L L         r0: 1 3 0 0 2
r1: S L L L S         r1: 0 1 3 (unused) 0
r2: S S R L L         r2: 0 0 · 1 3
r3: S L L L L         r3: 0 0 2 0 2
```

Paths (unused tiles may point any way; "exactly one solution" means one set of paths): Feature c1 → r0c1 W–N → r0c0 E–S → down c0. Bug Fix c2 → r0c2 → r1c2 **W–N** (west round the
boulder) → r1c1 E–S → r2c1 → r3c1 N–E → r3c2 S–W → out c2. Docs c3 → r0c3 N–E → r0c4 S–W → r1c4 →
r2c4 W–N → r2c3 E–S → r3c3 N–E → r3c4 S–W → out c4. Bug Fix has **two** tempting detours; only the west
one leaves room for Docs. **Exactly one solution.**

### 5.4 Rules and feedback

A colour **mixes** when its water reaches a tile that another colour's water passes through (connected or
not). A colour **spills** when it leaves a tile through an open side that the next tile doesn't accept.
Pressing **Open the gates** runs every live crew's water at once (≈ 4 m/s along the tiles, each colour
from its gate). The first problem each colour meets decides its result. Messages come from Fen (voiced)
with the crew's icon; the tile that went wrong pulses.

| Result | What you see | Fen says (paraphrase) | Source |
|---|---|---|---|
| **Mixed** (two colours enter one tile) | brown swirl at that tile, floats tangle, both crews' wheels stall | "Two crews in one race. Their changes blur together, like two tasks in one folder. Give each its own channel." | `why-…` |
| **Main hall** (off a side, or out c1/c3) | water pours into the Great Hall's sluice; the "main" arch flickers | "That ran into the Great Hall: your main checkout. A new worktree keeps a session's changes out of `main`." | `learning-objectives`, `where-a-session-runs` |
| **Wrong wheel** | the wrong house's lift jerks up and stops | "Feature's water turned the Docs wheel. A session's diff stays with that session." | `why-…` |
| **Dead end** | water pools and stops | "It stops short. Follow it from the gate." | (mechanics) |
| **Solved** | every wheel turns, three baskets rise, each house lights in its colour, a chime | R1: "One crew, one channel." R2/R3: "Three crews, three channels, one spring. That's one repository with a worktree for each session." | `what-is-…`, `why-…` |

Water resets when you rotate a tile after a run. There's no fail state, no move limit, no timer.

**Hints (Wingman, Q; tier 3 is available, this isn't a Trial):** R1/R2: (1) "Follow each colour down
from its gate. Where do two meet?" (2) the first mixed or spilling tile pulses; (3) one wrong tile turns
right. R3 (retired Board B): (1) "Bug Fix can't go through the boulder. Which side leaves Docs a way down?" (2) r1c2
pulses; (3) r1c2 turns to W–N.

### 5.5 Controls

The puzzle plays from the **Gate Board** at the Flume Gallery: interact (E) to start, and the camera
moves to `puzzleCam` (a fixed 3/4 view; the follow camera is off). Esc/B leaves at any time and keeps the
board.

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move the cursor | WASD / arrows; or point with the mouse | LS / d-pad | — (tap the tile) |
| Rotate clockwise | E or Space; left-click | A or RB | tap a tile |
| Rotate anticlockwise | Shift+E; right-click | LB | long-press a tile, or the ↺ chip on the selected tile |
| Open the gates | F or Enter; the **Open the gates** button | X | **Open the gates** button |
| Undo / Reset | Z / R | View (reset), d-pad ↓ held (undo) | Undo / Reset buttons |
| Hint | Q | Y | parrot button |
| Leave | Esc | B / Menu | Leave button |

- Touch targets: each tile's hit area is the projected tile (≥ 88 px on a 1024 × 768 tablet at the
  puzzle camera; the HUD overlay draws an invisible button per tile and never shrinks below 44 × 44 px).
  Buttons are ≥ 48 px; **Open the gates** is ≥ 64 px.
- Accessibility: `Tab` cycles tiles in reading order; every tile has a label ("Row 2, column 3, elbow,
  north to east"); results are announced in the live region; the board also works with **text-only** HUD
  chips. Reduced motion: no camera moves, water still flows (it's the information).

### 5.6 The Spire twist (P2.2, ~2 min)

1. Fen: "Now both Feature and Docs want to show their work at the Lookout." Camera → `twistCam`.
2. Two lanterns (Feature blue, Docs teal, big stage lanterns on carrying poles) come out onto bridge
   **R2**, one from each end, and meet nose to nose at mid-span; they bump a few times and stand stuck
   (`timber_creak_groan`, a comic stop). The camera's close enough (about 20 m) for the jam to read.
   After the answer, Feature's walks on to Lookout 5173 and Docs' to 5174 (or Feature's goes out and
   Docs' crosses alone); they stay lit there. (`set-pieces.ts` `spireJam` / `spireLantern`: rigid
   parts of the set pieces' merged meshes, so no new draw or shader.)
3. Fen: "Their channels are separate. So why are they stuck?" A choice (keys 1–4, or tap):

| Choice | Result | Line | Source |
|---|---|---|---|
| "Dig them new channels." | wrong | "Their channels are already apart. Worktrees separate files and branches, not ports." | `where-a-session-runs`, `two-previews-collided` |
| "Send Docs to Lookout 5174." | **right** | Bridge R3 unrolls; Docs crosses; two screens glow side by side. "Different ports for parallel previews." | `two-previews-collided`, `key-takeaways` |
| "Close Feature's lantern for now." | **right** | Feature steps back; Docs crosses alone. "That works too: stop one server. Or start the second on 5174." Then R3 unrolls anyway | `two-previews-collided` |
| "Let them share. They'll manage." | wrong | they jam again. "Two previews on one port collide." | `two-previews-collided` |

4. Wingman: "And it's not just ports. Databases and background processes aren't separated either."
   `[§key-takeaways]` R3 stays open: the Spire's two lookouts are walkable afterwards.

### 5.7 State API (B owns the logic; A owns the view)

```ts
// src/game/puzzles/channel-routing/types.ts (B), consumed by A's view through the contract (§9.3)
export type Crew = 'feature' | 'bugfix' | 'docs';
export type TileKind = 'straight' | 'elbow' | 'rock';
export type Rot = 0 | 1 | 2 | 3;
export interface Tile { kind: TileKind; rot: Rot }
export type FlowEnd = 'wheel' | 'wrongWheel' | 'mixed' | 'mainHall' | 'deadEnd';
export interface Flow {
  crew: Crew;
  cells: readonly (readonly [row: number, col: number])[]; // in order from the gate
  end: FlowEnd;
  at?: readonly [row: number, col: number];               // where it went wrong
  wheel?: Crew;                                           // whose wheel it reached
}
export interface ChannelRoutingState {
  round: 1 | 2 | 3;
  phase: 'demo' | 'routing' | 'running' | 'solved' | 'twist' | 'done';
  board: readonly (readonly Tile[])[];                     // 4 rows × 5 columns
  live: Readonly<Record<Crew, boolean>>;
  cursor: readonly [number, number] | null;
  flows: readonly Flow[];                                  // empty until the gates open
  twistChoice?: 'redig' | 'port5174' | 'closeOne' | 'share';
}
```

Logic is pure (`rotate`, `openGates → Flow[]`, `solved`), saved as a checkpoint at each round's start
(POC §3.9). Tests: Board A/B solution counts are exactly 1 for Rounds 2 and 3; each start state is
unsolved and the Round 1/2 start produces `mixed`; every `FlowEnd` is reachable.

---

## 6. Checks, Logbook, chests and Trial (`src/learn/content/ch02.ts`)

`const ch = '02-sessions-worktrees-context'`. Ids: `K` = choice or multi check, `M` = matching, `H` =
hotspot, `T2.x` = Trial items, `C2.x` chests, `B2.x` bottles, `pg2.*` pages. Every item has
`source: src(anchor)`, an `explain` pair, and three hint tiers. Options are shuffled by the UI.

### 6.1 Stop checks

| Id | Type | Prompt | Answer | Distractors (feedback) | Source |
|---|---|---|---|---|---|
| **K2.1** | multi | "What can a project session have of its own?" | its own **branch**; its own **working folder**; a **plan** and a **diff**; **terminal output** and a **browser preview**; **GitHub context** | "Its own GitHub account" ("You sign in once. The chapter's list is branch, folder, plan, diff, terminal output, preview and GitHub context.") · "A new fork of your repository" ("A fork is your own copy on GitHub, from Chapter 00. A session works on a branch and folder of your project.") | `learning-objectives` (intro) |
| **K2.2** | mc | "In Lyra's studio, what's a recording booth like?" | **A worktree: the same song, its own folder and branch** | "A chat: a quick question, nothing recorded" · "The model: who sings" · "A pull request: the final mix" | `from-the-studio-one-studio-many-recording-booths` |
| **M2.1** | matching | "Match each problem to what a worktree-backed session gives you." | Multiple tasks edit the same folder ↔ Each task gets a separate folder · Easy to lose track of branch state ↔ The session branch is visible in the app · Tests and diffs mix together ↔ Diffs stay tied to the session · Hard to compare work ↔ Easier to inspect and approve | — | `why-the-github-copilot-app-uses-worktrees` |
| **H2.1** | hotspot `app-where-sessions-run` | "Where do you set the branch that a new worktree starts from?" | `base-branch` | `new-worktree` ("That box is the course's highlight. **New worktree** says *where*; the starting branch is set further down.") · `current-checkout` · `cloud` · `workspace-selector` ("This opens the menu. The setting you want is inside it.") | `where-a-session-runs` |
| **P2.1/P2.2** | puzzle | §5 | — | — | §5.1 |
| **K2.4** | mc | "Your workspace selector still says **Current checkout**, your pick from Chapter 00. What do you do before your next session?" | **Open the workspace selector and choose New worktree** | "Nothing. Each new session starts on New worktree" ("The app remembers your last choice, so it would stay on Current checkout.") · "Choose Cloud" ("Cloud runs the session off your machine. The course switches back to New worktree.") · "Keep Current checkout. It's quicker" ("Quick, but it works right in your clone…") | `where-a-session-runs` |
| **K2.3** | mc | "Your turn: Copilot's adding a light and dark theme to the Book App. What context do you attach?" | **`@samples/book-app-web/src`: the code it needs** | "`@` every folder in the repository" · "Every open issue, with `#`" · "Nothing. Copilot will search everything" | `context-syntax` (the tip; the scenario is the chapter's assignment) |
| **H2.3** | hotspot `app-plan-from-issue` | "The course has you leave plan mode and write your own prompts. Which option?" | `exit-plan` | `approve` ("That approves the plan and implements it in **Autopilot**.") · `suggest` ("That asks for changes to the plan.") · `continue` ("Pick an option first; **Continue** confirms it.") · `plan-tab` ("That's where the plan opens.") | `exercise-start-a-session-from-a-branch-and-attach-an-issue` |
| **H2.6** | hotspot `app-context-information` | "Where do you see how many AI credits this session has used?" | `session` | `plan` ("**Plan** is the share of your plan used.") · `tokens` ("**Tokens** counts what went to the model and back.") · `context` (course highlight; "That's how the context window is divided.") · `view-usage` ("That opens your account's usage and billing.") | `exercise-check-the-session-with-slash-commands` |

### 6.2 Optional extras (spyglass moments, not required)

- **H2.4** (Rook's spyglass, optional "Spot it"): `app-book-app-empty-state-before`, "Where's the empty
  state you'll compare after the fix?" → `empty-state`; distractors `books-shown`, `search`, `url`.
- **H2.5** (Rook): `app-chronicle-standup-output`, "Where's the pill that opens the session's diff above
  the prompt box?" → `changes-pill`; distractors `plan-pill`, `chronicle-chip`, `background-pill` (feedback
  doesn't explain Background; it isn't in the chapter's text).
- *(Was K2.3, now the Flag Hoist's "Pack light" order, with the course exercise's answer: `#` just the
  empty-state issue.)* "You want Copilot to fix one empty-state message. What do you
  attach?" → "Just the folder it lives in, with `@`" (less is often more) vs "Every folder in the
  repository" / "Nothing; Copilot will search everything" / "Every open issue with `#`".
  `[§context-syntax]`

### 6.3 The Canopy Trial (T2)

Nine items, pass with all correct, retries allowed, hint tier 3 off. Covers the four key takeaways
(1 → T2.1, 2 → T2.2 and T2.3, 3 → T2.4, 4 → T2.5 and T2.9) and the objectives.

| Id | Type | Prompt | Answer | Source |
|---|---|---|---|---|
| T2.1 | mc | "What's a session in the app?" | "A focused agent workspace with its own branch, diff and history" (vs "A chat that can't change files" · "A copy of your GitHub account" · "A saved prompt that runs on a schedule") | `key-takeaways` |
| T2.2 | mc | "Which workspace keeps a session's changes out of your main checkout, and is the safe default?" | **New worktree** (vs Current checkout · Cloud · "Whichever you picked last") | `key-takeaways`, `where-a-session-runs` |
| T2.3 | matching | "Match each need to where the session runs." | "Keep changes, branches and diffs apart from main" ↔ **New worktree** · "A quick, low-stakes look; it may touch your folder" ↔ **Current checkout** · "Offload the work, keep your machine untouched" ↔ **Cloud** | `where-a-session-runs` |
| T2.4 | scenario | "Two sessions in separate worktrees both start the Book App's preview on port 5173." → "What happens?" | "They can collide: worktrees separate files and branches, not ports" (vs "Nothing; worktrees separate everything" · "The second session's files overwrite the first") | `key-takeaways`, `two-previews-collided` |
| T2.5 | matching | "Match each example to its symbol." | `@samples/book-app-web/src` ↔ files or folders · `#12` ↔ issues or pull requests · `/chronicle standup` ↔ slash commands · `&` + a session from the list ↔ other sessions | `context-syntax` |
| T2.6 | ordering | "Put the first steps of the exercise in order." | Point to the project, select **Create from** → open **Branches** and pick `practice-empty-state-copy` → set **Mode** to **Plan** → type `#3` and pick the issue → send the prompt → review the plan | `exercise-start-a-session-from-a-branch-and-attach-an-issue` |
| T2.7 | hotspot `app-where-sessions-run` | "Your Chapter 00 session worked straight in your existing clone. Which option was that?" | `current-checkout` (distractors `new-worktree`, `cloud`, `base-branch`) | `where-a-session-runs` |
| T2.8 | hotspot `app-context-information` | "Where do you see the tokens the session sent to the model and got back?" | `tokens` (distractors `session`, `plan`, `context`, `credits-icon`) | `exercise-check-the-session-with-slash-commands` |
| T2.9 | mc | "What does `/chronicle standup` do?" | "Summarizes your work from the last day" (vs "Shows the session's token use" · "Starts a new session on a branch" · "Lists every slash command") | `slash-commands` |

Reward: `{ seal: 'Seal of Thousand-Bough', doubloons: 60 }`.

### 6.4 Logbook pages, chests, bottles, glossary

Captions are 1–3 plain sentences in the game's voice (`**bold**` for UI labels); the live excerpt replaces
nothing authored (PLAN §8.1).

| Page | Title | Image | Caption gist | Source |
|---|---|---|---|---|
| `pg2.session` | What a session holds | — | own branch, working folder, plan, diff, terminal output, browser preview, GitHub context | `learning-objectives` |
| `pg2.booths` | One studio, many booths | `recording-booths-worktrees` | the booth analogy | `from-the-studio-…` |
| `pg2.worktree` | What's a Git worktree? | `one-repo-many-worktrees` | extra working folders for one repository, usually each on its own branch | `what-is-a-git-worktree` |
| `pg2.why` | Why worktrees | — | the four rows of the table; parallel sessions don't mix file changes; one at a time in this chapter | `why-…` |
| `pg2.where` | Where a session runs | `app-where-sessions-run` | **+**, the workspace selector, the three options, **Base branch**, switch back to **New worktree**, **Create from** | `where-a-session-runs` |
| `pg2.parallel` | Parallel sessions | `app-where-sessions-run` | the Channel Routing lesson, then the app: you don't dig channels, you pick **New worktree** in the workspace selector and the app makes the folder and branch; **Current checkout** for a quick look, **Cloud** to offload | `where-a-session-runs` |
| `pg2.ports` | Not ports | `app-book-app-empty-state-before` (the URL shows 5173) | files and branches, not dev servers, databases, or ports; stop one or use `5174` | `where-a-session-runs`, `two-previews-collided` |
| `pg2.context-syntax` | Four flags | — | the `@ # / &` table; less is often more | `context-syntax` |
| `pg2.attach` | Drop a file on a session | — | drag files onto a session or agent in the sidebar | `attaching-files` |
| `pg2.slash` | Slash commands | — | type `/` and read the palette; `/chronicle`, `/context` | `slash-commands` |
| `pg2.more-commands` (C2.2) | More slash commands | — | the optional table, as a list | `slash-commands` |
| `pg2.create-from` | Create from a branch | `app-create-from-icon` | **Create from**, **Branches**, a new worktree | `exercise-start-…` |
| `pg2.plan` | Review the plan | `app-plan-from-issue` | **Plan** tab, **Review plan**, the three options | `exercise-start-…` |
| `pg2.preview` | Baseline, then compare | `app-book-app-empty-state-before` | `hobbit`, `zzzz-no-match`, **Changes** tab or pill, reload | `exercise-start-…` |
| `pg2.chronicle` | `/chronicle standup` | `app-chronicle-standup-output` | a recap of the last day's work | `exercise-check-…` |
| `pg2.context` | `/context` | `app-context-information` | **Plan**, **Session**, **Tokens**, **Context**, **View usage and plan...**; **Streamer Mode** hides usage | `exercise-check-…` |
| `pg2.details` | Session details | — | select the session name: branches, **Remote control**, **Path**, **Project**, **Session name**, **Session ID**; stop the dev server | `exercise-check-…` |
| `pg2.takeaways` | Key takeaways | — | the four takeaways | `key-takeaways` |
| `pg2.assignment` | Your turn: light and dark | — | the assignment's success criteria | `assignment` |
| `B2.1` | No practice branches? | — | rerun the setup script, or connect your fork, not the upstream repo | `i-dont-see-the-practice-branches` |
| `B2.2` | Wrong folder? | — | check the worktree path and branch in session details; prefer a new worktree | `the-session-edited-the-wrong-folder` |
| `B2.3` | No `/context`? | — | it works after one sent prompt; type `/` for the palette | `context-or-chronicle-is-missing` |

Chests: `{ id: 'C2.1', page: 'pg2.booths', doubloons: 10 }`, `{ id: 'C2.2', page: 'pg2.more-commands',
doubloons: 15 }`; bottles `B2.1`–`B2.3` (5 each, `kind: 'bottle'`).

Glossary: Git worktree · New worktree · Current checkout · Cloud (sandbox) · Base branch · Create from ·
Workspace selector · Context · Context syntax (`@ # / &`) · Slash command · `/chronicle standup` ·
`/context` · Usage popup · Empty state. Definitions paraphrase the chapter; each links its anchor.

---

## 7. Smaller interactions (the island feels alive)

| Id | Where | What | Controls | Teaches |
|---|---|---|---|---|
| **P2.3 Flag Hoist** | Signal Deck | Ines calls six orders. Four are needs, never the symbol: "Copilot needs the Book App's source folder" (`@`), "Get a recap of your last day's work" (`/`), "Attach the bug report about the empty state" (`#`), "Use what Rook's crew's session found" (`&`); you hoist the flag that brings it. Then **Pack light**: "Copilot's fixing one empty-state message. What do you bring?" → `#` just the empty-state issue (vs `@` every folder, nothing, `#` every open issue). Last, **A letter from ashore**: "A letter's on your computer, not in the repository. Get it into the session." → drag it onto the session in the sidebar (vs `@`, `#`, `/context`). The flag runs up the mast and snaps in the wind; a wrong pick drops back with Ines's reason. Then check **K2.3** (a new job, the same tip) | keys 1–4 / tap the flag or choice (≥ 48 px; ≥ 44 px in the landscape-phone layout) | `context-syntax`, `attaching-files`, `exercise-start-…` |
| **Booth Pools** | Q2.2 | Step into each of the three booths: the island music ducks and that booth's instrument plays close (kalimba, flute, rain-stick), muffled outside it. Stepping back out lets the full song in | walk | the analogy, felt |
| **Cloud gondola** | Q2.4 | Pull the bell rope: a crate rides the gondola into the mist on Thunder Crown and comes back sealed 60 s later. Oak: "Done somewhere else, and your own deck stayed untouched." `[§where-a-session-runs]` | E at the bell | Cloud |
| **Lantern House** | §4.5 | day/night shutters | E at the lever | the assignment |
| **Life** | everywhere | the Fernrun rope swing (kids), parrots that flush when you pass the Booth Pools, blue butterflies, frogs that go quiet as you approach the pools, dragonflies, the Sky Basket operator's wave | — | — |

---

## 8. Audio

### 8.1 Music

- **Decision:** `music_salty_sway` is "Maritime folk, instrumental" on its Suno page (track
  `4411cff4…`). That's a harbour-and-tavern sound: give it to **Keelhaven** (Chapter 03). It doesn't
  match PLAN §7's brief here (Lydian, dreamy, kalimba, pan flute, rain-drop percussion).
- **New track for Dan to make with Suno** ("Thousand Boughs"), then `tools/music/fetch.sh
  music_thousand_boughs` (trim, loop fade, loudness, Opus + AAC) and an `ART_PROVENANCE.md` row:
  > *Instrumental, dreamy Lydian mode, 76 bpm, gentle kalimba ostinato, breathy pan flute melody, soft
  > marimba, rain-drop percussion and light hand drums, warm string pad, misty jungle at dusk, magical and
  > calm, seamless loop, no vocals, 2:30*
- **Wiring (B):** `IslandMusic` gains `'thousand-bough'`; `MUSIC_TRACKS['thousand-bough']` points at
  `music_thousand_boughs`. Done: it points at `music_thousand_boughs` ("Misty Jungle Dusk"), so acceptance item A-12 is met. The Bard (Q2.2) unlocks it in the Songbook.
- **Stingers:** reuse `chime_solve` for each solved round; the Seal uses the same Seal sound as Meridian.

### 8.2 Ambience and SFX (lazy-loaded per island, ≤ 5 MB, PLAN §7)

Existing files (`public/audio/`) and where they go:

| File | Use |
|---|---|
| `bird_forest` | the main jungle bird bed (valley, under the canopy) |
| `crickets` | dusk insects in the valley (night factor and shade raise it) |
| `stream` | Fernrun, Silver Run, Thunder Run, the Header Race (positional loops) |
| `waterfall_small` | Silver Thread, the Booth Pool cascades, the flume tiles while water runs |
| `wind`, `palms` | the Crown Deck and the cove's palms |
| `surf_far`, `surf_wash`, `pier_lap`, `boat_lap` | coast, Root Wharf |
| `wheel_creak` | the three wheel-lifts (only while turning) |
| `timber_creak_groan` | rope bridges (sparse, when you walk them) and the Spire jam |
| `step_wood`, `step_rock`, `step_grass`, `step_water` | footsteps by surface (decks, bridges, rocks, ferns, wading) |
| `gate_lift`, `lever`, `chime_solve`, `splash`, `crane_ratchet` | gates, levers, solves, the Sky Basket |

New files (B sources them; each logged: CC0 field recordings in `ASSETS.md`, AI-made in `ART_PROVENANCE.md`):

| New file | What | Source preference |
|---|---|---|
| `waterfall_large` | the Veil and Great Falls (positional; a low roar that grows near) | Freesound CC0 field recording |
| `rain_canopy` | after-the-shower drips on leaves (bed, quiet; drips only, no downpour) | Freesound CC0 |
| `frogs_dusk` | tree frogs round the pools (bed; hush within 6 m of the player) | Freesound CC0 |
| `parrot_call` (3 variants) | parrots flushing and crossing | Freesound CC0 |
| `booth_kalimba`, `booth_flute`, `booth_rainstick` | 8 s loops for the three booths (key and tempo matched to the island track) | ElevenLabs Sound Effects (the `sound-effects` skill) or Suno stems from Dan's track |
| `gondola_bell`, `rope_hoist`, `lantern_click`, `rock_tumble` | gondola (and round 3's Cloud crew), Flag Hoist, magic lantern, (the retired Round 3 boulder) | ElevenLabs Sound Effects or Kenney CC0 |

Mix: beds duck under voice; positional sounds use HRTF; captions for important cues (water flowing,
mixed, wheels turning, bridge jam, Seal).

### 8.3 Voice

- Pipeline: `tools/voice/generate.ts` with lines in `tools/voice/lines.testcove.json` (the one set the
  game uses today; Meridian's cast is in it too), `"tts": "elevenlabs"`, model `eleven_v3`, through the
  signed-in `elevenlabs` CLI (no key in the repo). Generate only changed lines (`--only Tamsin,Saffi,…`),
  then `npm run voice:lipsync` for mouth cues.
- Line ids: `tb.<npc>.<beat>.<n>` (for example `tb.saffi.worktree.03`). Juno and Wingman keep their voices;
  Lyra keeps Azure `en-GB-LibbyNeural`.
- Casting: for each new character, audition **three Voice Library voices** against the direction in
  §4.2 with two real lines, pick one, and record the voice id and name in the lines file and in
  `ART_PROVENANCE.md` (one row per speaker, like Juno's). No two characters on the island share a voice.
  Never a caricature accent.
- Volume of work: about 9 NPCs × 9 lines + Juno/Wingman 20 + Wingman hints 40 ≈ **140 lines**
  (≈ 3.5 MB at 32 kbps Opus).

---

## 9. Tech plan

### 9.1 Modules

```
src/world/islands/thousand-bough/     (A)
  layout.ts            THOUSAND_BOUGH data: every number in §3 (no three.js; the Logbook may import it)
  contract.ts          the interfaces in §9.3 (frozen after step 0)
  height.ts            thousandBoughHeight, thousandBoughMasks (+ test)
  terrain-regions.ts   regions for the shared terrain material (+ registry line)
  water.ts             pools, streams, falls (data + maths, Meridian-water style)
  vegetation-rules.ts  THOUSAND_BOUGH_VEGETATION (IslandVegetationRules)
  starfish.ts          THOUSAND_BOUGH_STARFISH (+ registry line)
  tree/banyan.ts       trunk, limbs, prop roots (sliced build), LODs
  tree/canopy.ts       leaf-cluster instances (shared vegetation leaf material)
  tree/silhouette.ts   the far silhouette (dome + trunk, distant-island material)
  village/index.ts     decks, helix stair, bridges, houses (village kit), lifts, gondola, lanterns,
                       anchors, colliders, walkable(x, z, y), camera blockers
  flume.ts             the Flume Terrace and FlumeTerraceView
  spire.ts             the Spire, lookouts, R2/R3, magic lanterns, SpireView
  signal-mast.ts       mast, halyards, flags, SignalMastView
  mist.ts              mist and shaft cards (one material)
  index.ts             createThousandBoughAsync → ThousandBoughSystem
src/world/life/fireflies.ts           (A) generic: instanced, TSL motion, no CPU per frame
src/game/thousand-bough-quests.ts     (B) quests, targets, tracker, npc scripts
src/game/thousand-bough-npcs.ts       (B) cast + extras
src/game/thousand-bough-open.ts       (B) like meridianOpen (dev, ?thousandbough, or Seal of Meridian)
src/game/puzzles/channel-routing/     (B) types.ts, boards.ts, logic.ts, session glue, tests
src/game/puzzles/flag-hoist.ts        (B)
src/ui/puzzles/ChannelRouting.tsx     (B) HUD overlay, tile buttons, chips, live region
src/learn/content/ch02.ts             (B)
```

### 9.2 Streaming and warm-up (like Meridian, skill §3)

- `cove-scene.ts` gets a `thousandBough` entry shaped like `meridian` (`roots()`, `hold()`, `stream()`,
  `townReady`, `terrain`, `silhouette`). It streams **only when needed**: boarding with the island open,
  the chart, a save or jump there, or the ship within **1100 m** of `(2050, −1500)`. Its plants go in with
  `vegetation.addPlants` when it streams.
- `flow.ts` gets `warmThousandBough`, a copy of `warmMeridian` using `warmLate` (`keepHidden`, terrain
  LOD warm), and `travelTo('island:thousand-bough')` waits for it behind the fade.
- The island's world stays hidden until its warm-up draws it; late parts (the R3 bridge, the Seal's
  lanterns, fireflies) carry `userData.prewarm` so the warm shows them once.
- Instanced meshes (canopy clusters, lanterns, mist, fireflies, prop roots if instanced) use
  `sharedInstancedMesh` and aren't precompiled for the scene pass. Characters go through `shareSkinning`
  and `unreflected`.
- When the player is on Thousand-Bough, Meridian's island-only roots are hidden and held at "decoded"
  (PLAN §13.3); A measures whether disposing Meridian's unique materials is needed for the program
  budget (§9.7).
- Terrain pack: `public/packs/thousand-bough/terrain.{bin,json}` from `npm run bake`; Anchorage's and
  Meridian's bake hashes must not change.
- Shared generalizations A makes (each with a test that Anchorage/Meridian behave the same):
  `IslandId` + `ARRIVALS`, `ISLANDS`, `islandAt`, `openIslands`, `passageSky` (blend by distance to the
  nearest two islands), the new `mood` blend, `CHART_ISLANDS` + `ChartIslandId`, budgettest's island list.

### 9.3 The contract (step 0, `contract.ts`)

```ts
export type TbAnchorName =
  | 'tamsin' | 'lyra' | 'saffi' | 'oak' | 'fen' | 'ines' | 'rook' | 'pip' | 'elder'
  | 'gateBoard' | 'puzzleCam' | 'twistCam' | 'flagMast' | 'skyBasketBottom' | 'skyBasketTop'
  | 'lanternHouse' | 'gondolaBell' | 'boothA' | 'boothB' | 'boothC'
  | 'extraSwing' | 'extraWeaver' | 'extraLift' | 'extraFisher' | 'extraLook';

/** Interaction ids the compass and prompts use. */
export type TbInteractionId =
  | `npc:${'tamsin' | 'lyra_bough' | 'saffi' | 'oak' | 'fen' | 'ines' | 'rook' | 'pip' | 'elder'}`
  | 'flume:board' | 'flag:@' | 'flag:#' | 'flag:/' | 'flag:&' | 'gondola:bell'
  | 'basket:bottom' | 'basket:top' | 'lantern:lever' | 'booth:a' | 'booth:b' | 'booth:c';

export interface FlumeTerraceView {
  setRound(round: 1 | 2 | 3): Promise<void>;          // every round plays on Board A (round 3: channels dug)
  setBoard(board: ChannelRoutingState['board'], animate: boolean): void;
  setCursor(cell: readonly [number, number] | null): void;
  tileCenter(row: number, col: number, out: Vector3): Vector3;  // for touch hit areas
  demoSharedTrough(): Promise<void>;
  runFlows(flows: readonly Flow[]): Promise<void>;       // animates water, mud, floats, wheels, lifts
  resetWater(): void;
}
export interface SpireView {
  playJam(): Promise<void>;
  openSecondBridge(): Promise<void>;                     // R3 unrolls, then walkable
  preview(crew: Crew, lookout: 5173 | 5174, on: boolean): void;
}
export interface SignalMastView { hoist(flag: '@' | '#' | '/' | '&', ok: boolean): Promise<void>; lowerAll(): void }
export interface TreeVillageFx {
  sealCascade(reducedMotion: boolean): Promise<void>;
  gondolaSend(): Promise<void>;
  lanternHouse(mode: 'day' | 'night'): void;
  skyBasketEnabled(on: boolean): void;
}
export interface ThousandBoughSystem {
  group: Group;
  anchors: Readonly<Record<TbAnchorName, VillageAnchor>>;
  walkable(x: number, z: number, y?: number): number | null;
  surfaceKind(x: number, z: number, y?: number): SurfaceKind;
  colliders(): readonly BoxCollider[];
  circles(): readonly CircleObstacle[];
  cameraBoxes(): readonly CameraBlockerBox[];
  inland(x: number, z: number): number | null;           // pools and streams
  flume: FlumeTerraceView; spire: SpireView; mast: SignalMastView; fx: TreeVillageFx;
  update(dt: number, t: number): void;                   // no allocation
  dispose(): void;
}
```

Until A's views exist, B tests against a **stub** of the same interfaces (`contract.stub.ts`, B).

### 9.4 The tree: build and LOD

| Level | Distance (from camera to T) | Trunk + limbs + roots | Canopy clusters | Notes |
|---|---|---|---|---|
| LOD0 | < 110 m | Ultra/High 40k tris, Medium 25k, Low 14k, Lite 8k | High 900 × 48 tris, Medium 600, Low 350, Lite 200 × 24 | full lanterns, vines |
| LOD1 | 110–400 m | 6k merged, every prop root | half the clusters, larger: one flat, ragged lobe under a few big leaf cards each | lanterns as halo points only |
| LOD2 | > 400 m (and the silhouette before streaming) | 600-tri dome + trunk silhouette in the distant-island material | — | 0 new programs |

LOD switches are dithered (PLAN §6), never alpha-blended; the hand-off distances get hysteresis (±8 m).
Only the trunk, limbs and the canopy clusters cast into the cached sun shadow map; small props don't.
The build is sliced (`runSliced`, a few ms a frame). Clusters are a soft core with a leaf pattern and
alpha-tested leaf cards round it (the shared vegetation material's card part, `vegPart` 5: no new
graph), tinted per instance (`tint`) with the §2.3 greens. The far level (`BANYAN_DETAIL.far`) reads as
broad layers of leaves from the sea, not round puffs: each clump is one flat (`squash`), ragged lobe
whose normals lean to the canopy's own (`lean`), so the clumps shade as one canopy, darker under each
tier, with a few big leaf cards round its rim (each holds several sprays, `cardSpan`, and lies on the
lobe, which fills the shape: the cards only break up the edge, so a far one can't turn into a blotch;
lesson: alpha-tested foliage at a distance). Lite and Low get more cards a clump (`farCards`: fewer,
bigger clumps), and it has fewer triangles than the round two-lobe clumps it replaced on every tier.

### 9.5 Arrival flyover (`THOUSAND_BOUGH_ARRIVAL` in `arrivals.ts`, A)

| Key | Camera (x, y, z) | Target (tx, ty, tz) | Pace | Beat |
|---|---|---|---|---|
| 1 | (1700, 12, −1020) | (2010, 48, −1560) | 0.45 | H1: the whole island; the card holds here |
| 2 | (1890, 16, −1215) | berth (1931, 6, −1372) | 1.1 | into the cove mouth, the ship ahead |
| 3 | (1925, 26, −1345) | Root Gate (1992, 18, −1538) | 0.75 | over the masts, up the Fern Walk |
| 4 | (2010, 24, −1536) | (2010, 45, −1560) | 0.7 | under the canopy: trunk, decks, lanterns |
| 5 | (2010, 64, −1534) | (1931, 6, −1372) | 0.6 | straight up through the Sky Window, turning to the sea: above the mist |
| 6 | (2070, 58, −1500) | Great Falls (2140, 40, −1640) | 0.8 | out over the east canopy toward the falls |
| 7 | (1975, 22, −1330) | landing (1939, 4, −1376) | 0.75 | down to the captain on the wharf |

`seconds: 24`, `cardAt: 0.6`, `cardFor: 3.6`. Key 4 → 5 rises at r 24 from T, outside the stair band and
inside the cathedral's open radius; every segment clears terrain, decks and leaves by ≥ 3 m (A's test
samples the spline every 0.5 m against the walk surfaces, colliders and the canopy envelope).

### 9.6 Frame budgets (PLAN §12.1; every tier must pass `tools/budgettest.mjs`)

Whole-frame budgets stay PLAN's. The island's **own groups** (terrain, tree, village, water, its plants,
mist, fireflies, cast) get this share at their worst view; A measures Meridian's non-island baseline
first and adjusts if the sum doesn't fit, keeping 15 % headroom.

| Tier | Island draws | Island triangles (all passes) | Whole-frame gate |
|---|---|---|---|
| Lite | ≤ 40 | ≤ 120k | < 100 / < 300k |
| Low | ≤ 60 | ≤ 200k | < 150 / < 500k |
| Medium | ≤ 95 | ≤ 420k | < 225 / < 1M |
| High | ≤ 130 | ≤ 850k | < 300 / < 2M |
| Ultra | ≤ 170 | ≤ 1.5M | < 400 / < 3.5M |

Draw-call plan: the village is merged per kit material (≈ 6–8 draws for all decks, houses, bridges,
rails, ropes); lanterns are one instanced glow + one halo; canopy clusters one instanced draw per LOD;
prop roots merged into the trunk mesh per LOD; water strips one draw per water body group; mist one;
fireflies one. Add a `thousand-bough` entry to `budgettest.mjs` (`box: [1720, −1760, 2320, −1260]`, named
spots `wharf`, `booths`, `roothall`, `landings`, `flume`, `crown`, `spire`), extending its spots to take
a `y` for the decks.

### 9.7 Shader programs (PLAN §15.4)

- Target: **≤ 150 modules on every tier and both backends** after `window.__flow.travelTo('island:thousand-bough')`
  from a save that visited Meridian; **≤ 135** is the goal. Today Meridian reads 147–149 on Ultra, so
  this island may add only what it removes.
- Reuse (0 new): terrain material (regions only), rock material, vegetation trunk and leaf materials,
  village kit materials (wood, thatch, rope, cloth, metal, glow, halo), Meridian's water-strip material,
  the distant-island material, birds, characters, starfish, chests, bottles.
- New (≤ 4): mist/shaft cards (1), fireflies (1), and at most two more if the census proves a need
  (for example a puzzle tile highlight that can't be the glow material). Opaque `colorNode` materials
  go through `plainShadowColor`; nothing sets `receiveShadow = false` to dodge shadows (`skipSunShadows`).
- Census per tier, landed at the wharf and after the travel, both backends, recorded in the PR.

### 9.8 Lite and low cuts (PLAN §12.1)

| Feature | Lite | Low | Medium | High/Ultra |
|---|---|---|---|---|
| Mist cards | off (fog scale only) | 20 | 40 | 60 |
| Shaft cards | off | 6 | off (radial shafts) | off (shadow-map shafts) |
| Fireflies | off | 120 | 300 | 600 / 1000 |
| Falls spray plumes | off | 1 card each | full | full |
| Canopy clusters | 200 × 24 tris | 350 | 600 | 900 |
| Prop roots | 12 | 24 | 36 | 36 |
| Lanterns | 40, no halo | 80 | 120 | 120 |
| Grass on the valley floor | off | ferns only | creeper, sparse | creeper + meadow |
| Calm-zone mirror (cove) | — | — | — | on |
| Parrots / butterflies | off / off | 6 / 0 | 12 / 6 | 20 / 12 |
| Shadows | blob | cached 1024² | cached 2048² + characters | full |

---

## 10. Work split (two builders, no shared files)

**Step 0 (A, half a day, merged first):** `layout.ts` with every §3 number, `contract.ts` (§9.3),
`IslandId` gains `'thousand-bough'` (with a stub arrival), a stub `ThousandBoughSystem` that returns the
anchors and an empty group. After step 0 the contract changes only with both builders' agreement.

| Area | **A: world** owns | **B: content** owns |
|---|---|---|
| New files | everything under `src/world/islands/thousand-bough/`, `src/world/life/fireflies.ts`, `public/packs/thousand-bough/*`, `tools/thousandbough-shots.mjs` | `src/game/thousand-bough-*.ts`, `src/game/puzzles/channel-routing/*`, `src/game/puzzles/flag-hoist.ts`, `src/ui/puzzles/ChannelRouting.tsx` (+ css), `src/learn/content/ch02.ts`, `contract.stub.ts`, `tools/thousandboughtest.mjs` |
| Shared files edited | `src/world/cove-scene.ts`, `src/game/flow.ts`, `src/game/islands.ts`, `src/game/arrivals.ts`, `src/opening/chart-map.ts`, `src/ui/chart/archipelago.ts` (status only), `src/world/sky/sky-system.ts` (mood), `src/world/islands/terrain-regions.ts`, `src/world/starfish/*` registry, `src/world/terrain/*` only if a shared fix is needed, `public/packs/manifest.json`, `tools/budgettest.mjs`, `tools/cameratest.mjs`, `tools/flickertest.mjs`, the bake tool | `src/game/session.ts` (cast, scripts, sites, wiring the system's surfaces/colliders/camera boxes/inland), `src/game/meridian-quests.ts` (`next`), `src/learn/types.ts` (`ChapterId`, after the live-course work lands), `src/learn/content/index.ts`, `src/audio/music/tracks.ts`, `src/audio/soundscape/*`, `public/audio/*`, `tools/music/fetch.sh`, `tools/voice/lines.testcove.json`, `public/voice/testcove/tb-*`, `ASSETS.md`, `ART_PROVENANCE.md`, `public/audio/CREDITS.md`, `THIRD_PARTY_NOTICES.md` if needed |
| Interfaces | provides the `ThousandBoughSystem` and its views; anchors exactly as §3.7 | calls the views; never reads world geometry directly; places NPCs only at anchors |
| Licensing rows | sends B the rows for any world asset (in the PR text) | writes every `ASSETS.md` / `ART_PROVENANCE.md` row |

Order of work (both can start after step 0):
- **A:** terrain + water + bake → berth and approach (sail in, dock) → tree trunk/limbs/canopy + LODs →
  helix stair, decks, bridges, lifts (walk it end to end) → flume, Spire, mast views → vegetation, mist,
  fireflies, life → streaming + warm + chart + silhouette + arrival → budgets, census, shots.
- **B:** `ch02.ts` (images, checks, pages, Trial) with tests → quests, targets, scripts on the stub →
  Channel Routing logic + UI on the stub → Flag Hoist, gondola, booths, Seal flow → voices (audition,
  generate, lipsync) → audio beds → wire to A's real system → `thousandboughtest.mjs`.

---

## 11. Tests

| Owner | Test |
|---|---|
| A | `height.test.ts`: berth lane depth ≥ 6 m in a 30 m half-width lane and the 45 m turning circle; no terrain or scattered rock in it; the island stays inside its bounds; edges reach the deep floor |
| A | `layout.test.ts`: every anchor on a walk surface with a 4 m clear radius; the Fern Walk, helix, decks, bridges, boardwalk and side paths sampled every 0.5 m have a surface, no step > 0.45 m, no collider across them; stair clearance rule (§3.6); canopy clearance envelope (§3.5); gondola cable clearance; flyover spline clearance (§9.5) |
| A | props: every prop base within ±5 cm of its support, no prop inside another or inside a walk surface; coplanar faces ≥ 1 cm apart (`flickertest --audit` on new views `tb-wharf`, `tb-roothall`, `tb-bridge`, `tb-flume`, `tb-crown`) |
| A | `npm run bake`: Anchorage and Meridian hashes unchanged |
| A | camera: `tools/cameratest.mjs` with Thousand-Bough views stays within the gate (80 bad frames) |
| B | `ch02.test.ts`: every `source.anchor` exists in the ch02 README sections (via `parseSections` on the snapshot); every hotspot rect inside its image; no mask overlaps a target; no correct target is a course-highlighted box (`new-worktree`, `context`) |
| B | `channel-routing.test.ts`: boards A and B, Round 2 and 3 have exactly one solution (path sets), starts are unsolved, the Round 1/2 start gives `mixed` in Round 2, every `FlowEnd` reachable, no allocation in `openGates` after warm-up |
| B | `thousand-bough-quests.test.ts`: course order Q2.1 → Q2.9; compass targets exist for every step; every teaching line has a source; every dialogue line has a voice file and a lipsync entry |
| B | `tools/thousandboughtest.mjs`: plays the chapter end to end in the browser (sail in, every stop, the puzzle solved by real input, the twist, the Trial, the Seal), no console errors |
| both | `npm run typecheck && npm run lint && npm run format:check && npm test`, `npm run build && npm run check:budgets && npm run check:secrets`, `npm run test:e2e`, `npm run check:frame-budgets` on every tier, the hitch guard empty after warm-up on the voyage to the island and on the travel |

---

## 12. Acceptance

### 12.1 Checklist

| # | Item |
|---|---|
| A-1 | Sail from Meridian (battle 2 first), dock at the Root Wharf with the dock assist, go ashore, land facing the tree (H2) |
| A-2 | Nine stops in order; the compass always points to the next; each stop has one check and a Logbook page |
| A-3 | Channel Routing: three rounds and the twist play with keyboard, gamepad, mouse and touch (≥ 44 px), with reduced motion, and with the text-only HUD |
| A-4 | Every teaching line, check and page cites its ch02 anchor; no UI name that isn't in the chapter |
| A-5 | All walk routes pass the layout tests; no floating, buried, or intersecting object (tests + a manual walk of every route; A adds a dev-only collider overlay if none exists) |
| A-6 | Budgets pass on Lite, Low, Medium, High, Ultra (WebGPU) and Lite/Low/Medium (WebGL2); census ≤ 150 everywhere |
| A-7 | Hitch guard empty after warm-up: arriving by sea, by `travelTo`, and by loading a save on the island |
| A-8 | Leaving for Anchorage and returning to the title leaves `renderer.info.memory` as it was (skill §4) |
| A-9 | Chart: miniature, card, status, fast travel; silhouette visible from Meridian (H9) |
| A-10 | Starfish 5/5, chests 2/2, bottles 3/3 collectible and saved |
| A-11 | Voices for every line, distinct per character, lipsync working; subtitles always on |
| A-12 | The island's own music track is in (D7); the placeholder is gone |
| A-13 | Credits, `ASSETS.md`, `ART_PROVENANCE.md` updated; `check:secrets` passes |

### 12.2 Screenshots to judge it (`tools/thousandbough-shots.mjs`, JPEG, 1920 × 1080)

H1–H10 (§2.8) on **Lite, Medium and Ultra** (WebGPU), plus H2 and H7 on **WebGL2 Medium**; the arrival
flyover as a 10 fps burst; the puzzle at each round's solve and at a `mixed` result; the twist's jam and
its two-lookout ending; the Seal cascade as a burst; a night-time H2 (Sky & Time at 21:00). Saved under
`docs/reviews/<date>-island-02/`, each named `<shot>-<tier>-<backend>.jpg`.

### 12.3 The Walt Disney review

Run it on the screenshots and a full play-through. **Any "no" sends the island back for refinement.**

1. **Story:** Can a first-time player say what this place is about without reading anything? (Crews,
   their own houses, one great tree, an Elder who lights the beacon.)
2. **The weenie:** From the sea, the wharf, and every path, is the tree the thing you want to walk to? Is
   its silhouette unmistakable on the horizon from Meridian?
3. **Wienies along the way:** At every point on the route, can you see the next thing to go to (lanterns,
   flags, the Root Gate, the next deck's lights, the Beacon)?
4. **Layered depth and forced perspective:** Does H2 read as foreground, middle and background? Does the
   tree feel taller than it is?
5. **Colour story:** Cool and misty at the water, warm in the boughs, golden at the crown? Are saturated
   colours only where they mean something?
6. **Kinetics:** Is something moving in every shot (water, wheels, flags, gondola, fireflies, parrots)?
   Does any of it loop visibly or jitter?
7. **Readable paths:** Could you find your way with the compass off?
8. **Delight:** Is there a surprise worth telling a friend about (behind the falls, the booths, the
   gondola, the Seal cascade, the view above the mist)?
9. **Teaching through play:** After the puzzle, can a player explain "worktrees separate files and
   branches, not ports" in their own words?
10. **Does anything break the illusion?** Look for: terrain edges or the apron; z-fighting decks or
    signs; anything floating, buried, or sticking through rails; leaf cards popping or blotching at
    distance; a hard line where mist meets geometry; shafts washing out a character; the camera inside the
    trunk, a root, or leaves; an NPC clipping a rail; rain sound with nothing wet; identical copy-pasted
    houses or rock clusters; text that doesn't match the course; an Octocat or Copilot logo built into the
    world (the course's `one-repo-many-worktrees` image shows an Octocat icon: it may appear **only** as
    that course image in the spyglass and Logbook); placeholder music.
11. **Performance as part of the show:** a single hitch on arrival, the climb, or the Seal is a "no".

---

## 13. Open risks

| Risk | Effect | Mitigation |
|---|---|---|
| **Shader programs:** Meridian already reads 147–149 on Ultra | the island can't add looks without going over 150 | reuse every material (§9.7); release Meridian's island-only materials when docked here; census before content is added |
| **Meridian is wired by hand** in `cove-scene.ts`, `flow.ts` and `session.ts` | generalizing streaming may break Meridian | copy the Meridian pattern for this island first; generalize in a later refactor with Meridian's tests and bake hashes as the guard |
| **Stacked walk surfaces** (helix, decks, bridges over each other) | the walker or camera picks the wrong level | `heightAt(x, z, y)` (as the lighthouse stair), `y0`/`y1` on colliders, the clearance rules, the layout tests |
| **Triangles in shadow passes** (the tree is big) | Low/Medium over budget | only trunk, limbs and clusters cast; LOD by distance; cached shadows; measure early on Low |
| **Music mismatch** | the island sounds like a tavern | D7: new Suno track from Dan; placeholder blocks acceptance |
| **New audio** (waterfall, rain drips, frogs, parrots, booth loops) | missing files block the soundscape | source CC0 first; ElevenLabs/Firefly for the rest; log each |
| **Course drift** (the chapter or screenshots change after 86bb298) | stale rects or names | anchors + filenames only; tests against the ch02 snapshot; the weekly refresh flags drift |
| **The live-course agent** is changing `SourceRef` and course assets tonight | merge conflict in `src/learn/types.ts` | B rebases on it before adding `'02-sessions-worktrees-context'` (D10) |
| **Course images with built-in highlights** (`new-worktree`, `context`) and the pointer in `app-create-from-icon` | a give-away answer | never the correct target; the test checks it |
| **Voice casting** | accents that read as caricature, or ElevenLabs credits | three auditions per character, Dan approves, natural direction only |
| **Battle 2 zone** near Meridian's east shore | raiders near land | keep the zone ≥ 120 m from both coasts on the §3.4 route; battle code owner checks |
| **Motion comfort** (bridges, lifts, flyover rising 40 m) | discomfort | visual-only sway, no surface motion; reduced motion holds the camera and skips the rise |
| **Mist cards on WebGL2 / Lite** | extra pipeline, overdraw | off on Lite; card count by tier; overdraw checked in H7 |
