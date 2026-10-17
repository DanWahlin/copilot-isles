# Spec: Chart labels (in-game lower thirds)

> Status: **rolled out** (Dan, 2026-10-14). The prototype on Thousand-Bough Isle was approved with its
> Channel Routing line, the Georgia fallback (no new fonts) and the 6.4 s arrival hold; then it rolled out to
> Anchorage Cay, Port Meridian and both sea battles (§9).

## 1. Purpose

The highlight reel's parchment lower thirds (style A, "chart label": `tools/video/lower-third.html`) say what
you learn in a section and why it matters, and cite the course. The game uses the same card to set
expectations: when you arrive at an island, and the first time a puzzle opens. Each label answers three
questions:

1. **Where am I and what is this?** The small-caps label: _place · activity_.
2. **What do I learn here?** The headline.
3. **Why does it matter?** One line, then the course chapter and section that it comes from.

## 2. Where they show

| Moment | Trigger | How often | Goes away |
| --- | --- | --- | --- |
| **Island arrival** | The arrival flyover's title card (`hud.showCard`, `IslandArrival.label`) on every island, the short flight after the opening's chart dive too | Every arrival flyover, as before (the flyover plays once per island per save) | With the card (`cardAt + cardFor`, 6.4 s on every island), or when the flyover is skipped |
| **Puzzle start** | The puzzle is ready to play where you stand (its own `engaged()`: the quest step is on and you're at it), checked 4 times a second with no conversation, quest beat, quiz, menu, flyover or other label in the way. Channel Routing (the board opens), the Spire twist (the question's cutaway) and the Flag Hoist (the hoist opens) call it themselves | **Once per save** (`progress.labels`, `firstShowing()`); a new voyage resets it | The player's first key, click, tap, wheel or gamepad press (after 0.45 s), or after 9 s. The input still reaches the game (passive listeners) |
| **Sea battle start** | The first wave starts, after the briefing (`BattleRunOptions.onStart`) | Once per save, per battle | As a puzzle's |

There's **one card**: the parchment replaces the plain title card on every island. An island added later
without a `label` keeps the plain card. A puzzle without a label in `content/labels.json` shows nothing.

**The puzzles** (POC §4.5, §6.5; ISLAND-02 §5-§7): Anchorage has the Sluice & Waterwheel (P0.1) and the
Dry-Run Crane (P0.2); Port Meridian has the Crate Yard (P1.1, "The Shipyard" in the quest log) and the
Three Helms (P1.2) and the Lost Letters (P1.3, at Pell's desk in the Hall of Records), and the optional Model
Market (`market`, at Gilda's counter on the plaza; docs/specs/MODEL-MARKET.md); Thousand-Bough
has Channel Routing (P2.1), the Spire twist (P2.2) and the Flag Hoist (P2.3). The other `Puzzle` objects aren't puzzles you
solve and get no label: First Words, the Soundcheck, the Christening and Paint Your Sails are quest
beats with their own dialogue and quiz, and the gear rack and Rook's session terminal are scenery.

**The battles' questions** (`BATTLE_PLANS`, src/world/battle/battle.ts): battle 1 (Anchorage → Port
Meridian) asks N0.1 and N0.2, both from Chapter 00 · Add the course practice items. Battle 2 (Port
Meridian → Thousand-Bough) asks N1.6 (Project Sessions), N1.1 (Modes) and N1.2 (Models and reasoning
effort), all Chapter 01. Each battle's label cites the chapter its questions come from (a test checks every
wave's quiz).

## 3. Rules

- **Teaching accuracy.** Every label cites its course chapter and section (`source` in `content/labels.json`:
  the README anchor and its hash in `content/course.lock.json`). A unit test fails when the section's hash
  moves on. Don't invent app UI names.
- **Don't spoil a puzzle.** A label says what you'll learn, not the answer. The Spire twist asks "why are they
  stuck?", so its label doesn't say "ports" (a test checks it).
- **Player-facing copy:** friendly, with contractions and curly apostrophes, no em dashes. Headline ≤ 40
  characters, line ≤ 130.
- **Never cover the puzzle panel.** On wide screens the label sits bottom-left and the panel sits right; with a
  panel open, the label's width is capped to the room left of it. On phones the panel is a bottom sheet and
  the label sits at the top.
- **Never cover the subtitles.** While a label is up on a wide screen, the subtitles move up clear of it (a
  transform, measured once when it shows).

## 4. Text (one source: `content/labels.json`)

| Id | Shown | Label (k) | Headline (t) | Line (b) | Chapter line | Course source (README anchor) |
| --- | --- | --- | --- | --- | --- | --- |
| `arrival:anchorage` | Arrival | Anchorage Cay · Landfall | Set up the GitHub Copilot app | Connect your fork of the course, check your tools, and add the practice items that later chapters use. | Course Chapter 00 · Setup | 00 `#learning-objectives` |
| `arrival:meridian` | Arrival | Port Meridian · Landfall | Find your way around the app | Tour the app, then pick a chat or a project session, a mode, and a model and reasoning effort that fit the task. | Course Chapter 01 · Tour the App | 01 `#learning-objectives` |
| `arrival:thousand-bough` | Arrival | Thousand-Bough Isle · Landfall | Give every task its own session | A session has its own branch, diff and history, and its worktree keeps the changes out of your main checkout. | Course Chapter 02 · Sessions, Worktrees, and Context | 02 `#key-takeaways` (1, 2) |
| `puzzle:P0.1` | Sluice & Waterwheel | Anchorage Cay · Sluice & Waterwheel | Turn on GitHub Actions in your fork | New forks start with workflows switched off. Turn them on so the course’s practice checks can run. | Course Chapter 00 · Add the course practice items | 00 `#add-the-course-practice-items` (step 3) |
| `puzzle:P0.2` | The Dry-Run Crane | Anchorage Cay · The Dry-Run Crane | Preview before you run | Run the setup script with --dry-run first. Check that its Repository: line names your fork, then run it with --yes. | Course Chapter 00 · Add the course practice items | 00 `#add-the-course-practice-items` (steps 4-5) |
| `puzzle:P1.1` | The Crate Yard | Port Meridian · The Shipyard | Chat or project session? | Chats are for questions and exploring. Use a project session when the agent needs your repository, even just to read it. | Course Chapter 01 · Chat sessions and Project sessions | 01 `#project-sessions` (and Chat Sessions above it) |
| `puzzle:P1.2` | The Three Helms | Port Meridian · The Three Helms | Interactive, Plan, or Autopilot? | Read each order and pick the mode: step by step, plan first and review, or end to end. Then sail it that way. | Course Chapter 01 · Modes | 01 `#modes` |
| `puzzle:P1.3` | The Lost Letters | Port Meridian · The Hall of Records | Find your way around Settings | Open it with the gear at the bottom of the sidebar. Model providers adds providers. You still pick the model below the prompt box. | Course Chapter 01 · Settings | 01 `#settings` (and the table in it) |
| `puzzle:market` | The Model Market | Port Meridian · The Model Market | Hire a model that fits the job | Models differ in capabilities, speed and cost. Keep it light for a quick look; bring more power and effort for hard work. | Course Chapter 01 · Models and Reasoning Effort | 01 `#models-and-reasoning-effort` |
| `puzzle:P2.1` | Channel Routing | Thousand-Bough Isle · Channel Routing | Parallel sessions with worktrees | Each session gets its own worktree, so parallel sessions don’t mix their file changes. Then pick where each crew works. | Course Chapter 02 · Why the app uses worktrees | 02 `#why-the-github-copilot-app-uses-worktrees` |
| `puzzle:P2.2` | Spire twist | Thousand-Bough Isle · The Spire Twist | What worktrees don’t keep apart | Worktrees keep files and branches apart. Find out what two previews running side by side can still share. | Course Chapter 02 · Two previews collided | 02 `#two-previews-collided` |
| `puzzle:P2.3` | Flag Hoist | Thousand-Bough Isle · The Flag Hoist | Bring the right context | A few special characters in the prompt box add context and commands. Bring only what the task needs: less is often more. | Course Chapter 02 · Context syntax | 02 `#context-syntax` (the table and its tip) |
| `battle:passage-anchorage-meridian` | Battle 1 | The Passage · Sea Battle | Review between the waves | Between waves, the bosun asks a question about what you just learned. | Questions from Course Chapter 00 · Add the course practice items | 00 `#add-the-course-practice-items` (N0.1, N0.2) |
| `battle:passage-meridian-thousand-bough` | Battle 2 | The Passage to Thousand-Bough · Sea Battle | Review between the waves | Between waves, the bosun asks about Port Meridian: chats and project sessions, modes, and reasoning effort. | Questions from Course Chapter 01 · Key takeaways | 01 `#key-takeaways` (3-5; N1.6, N1.1, N1.2) |

`Repository:`, `--dry-run` and `--yes` are the course's own script output and flags. Battle 1's chapter line
was "Questions from Course Chapter 00 · Setup" in the reel; it now names the section both its questions
cite. The reel's battle and the Sluice and Three Helms texts are otherwise the same.

**One change from the reel:** the reel's Channel Routing line says "so parallel work never collides". The
course says sessions run in parallel "without mixing their file changes", and the next puzzle (the Spire
twist, from "Two previews collided") teaches that previews **do** collide on a port. The game's line follows
the course: "so parallel sessions don’t mix their file changes".

## 5. Layout

The card is the reel's 1180×236 card scaled by `--lt-px` (one reel pixel), with minimum font sizes.

| Breakpoint                                                   | Where                                                                                          | Size                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Wide** (≥ 761 × 561 px)                                    | Bottom-left (72 × 64 reel px in). Over an arrival: just above the letterbox's bottom bar       | `--lt-px` = 0.62 px at 1920×1080 (732×157 px), clamped 0.5-0.75 px. Text ≥ 12-20 px      |
| **Wide, puzzle open**                                        | As above; width capped to the room left of the panel (420 px + gutter)                         | As above                                                                                 |
| **Wide, under sail**                                         | Above the sail gauge (bottom-left)                                                             | As above                                                                                 |
| **Wide, sea battle**                                         | Bottom-left; width capped to the room left of the gun panel (bottom centre)                    | As above                                                                                 |
| **Phone or short screen** (≤ 760 px wide or ≤ 560 px tall)   | Top centre, 4.9 rem down: below the purse (its seal too) (the quest tracker and compass hide in puzzles), above the bottom-sheet panel. Over an arrival: below the top bar. In a sea battle: 8.6 rem down, below the hull bar and Skip battle | `--lt-px` = (100vw − 48 px) / 1180, clamped 0.27-0.42 px (342 px wide at 390 px). Seal 66 px with the number only |

At 390×844 the card ends at y ≈ 250 px; the Gate Board's sheet starts at y ≈ 275 px.

## 6. Motion

- **In:** the card unrolls left to right in 0.8 s (eased out): a `clip-path: inset()` on the card and a CSS
  curl (a shaded cylinder) that rides the edge on a `transform`, shrinking away over the last 22%. Then the
  wax seal stamps down in 0.3 s (scale 1.25 → 1, a small overshoot).
- **Hold:** an arrival's holds for the card's time (6.4 s of the flight on every island). A puzzle's holds
  until the first input or 9 s.
- **Out:** a 0.5 s fade (an animation, so the HUD's reduced-motion rule doesn't cut it).

## 7. Accessibility

- **Reduced motion** (PLAN §9: the Settings toggle, `:root.reduced-motion`, or `prefers-reduced-motion`): a
  0.4 s fade in and the 0.5 s fade out. No unroll, no curl, no stamp. With no flight, an arrival with a label
  holds 7 s over the captain (the plain card's 3.4 s is too short to read it).
- **Screen readers:** the card is `aria-hidden`; a visually hidden `aria-live="polite"` region reads the whole
  label once per show ("Thousand-Bough Isle, Channel Routing. Parallel sessions with worktrees. …"), then
  clears so a later label is read again.
- **Dismiss:** any key, click, tap, wheel, or a new gamepad press (polled every 100 ms only while a puzzle's
  label is up). The card itself takes no pointer input (`pointer-events: none`), so there's no small target:
  a tap anywhere works, and reaches the game.
- **Contrast** (measured on the screenshots, darkest parchment behind the text): headline 9.2:1, line 8.2:1,
  chapter section 6.7:1, small-caps label and "Course Chapter" 6.0:1 (AA). The seal's numerals are 6.1:1 on
  the wax's middle, 4.3:1 on its highlight (large bold text, AA ≥ 3:1). The seal repeats the chapter line, which
  passes AA on its own.
- **Fonts:** the game's `--ci-display` (Fraunces, falling back to Georgia). No web fonts are added. The
  small caps are synthesised from Georgia; see the open question in §10.

## 8. Performance

- DOM and CSS only, in the HUD layer. No GPU resources, no new pipelines, no per-frame work.
- No live SVG filters: the parchment (`paper.webp`, 1575×403, 24.9 KB) and the blank wax seal (`seal.webp`,
  188×188, 5.7 KB) are baked once by `tools/ui/bake-chart-label.mjs` (our own HTML/CSS; recorded in
  `ART_PROVENANCE.md`) and drawn with `border-image` (9-slice, so the torn edge keeps its shape at any width)
  and a background. They're decoded when the HUD is built.
- The unroll animates `clip-path` (paint only) and `transform`/`opacity`. Showing a label does one layout
  read (to restart the animation and measure its top for the subtitles).

## 9. Rollout (done)

1. **Thousand-Bough** (the prototype): its arrival and its three puzzles.
2. **Anchorage Cay and Port Meridian arrivals:** `label` on `ANCHORAGE_ARRIVAL` (and its `fromChart` flight)
   and `MERIDIAN_ARRIVAL`, with `cardFor` 6.4 s. `tools/usertest.mjs` reads `.hud-card.show, .hud-chart.show`.
3. **The other puzzles:** the session shows `puzzle:<id>` the first time a puzzle is `engaged()` (§2), so a new
   puzzle only needs its text in `content/labels.json`.
4. **The sea battles:** `battle:<plan id>` when the first wave starts.

To add an island: give its `IslandArrival` a `label`, and add `arrival:<id>` and its puzzles' `puzzle:<id>`
texts to `content/labels.json`. The unit tests check every arrival, puzzle and battle has one, with a
chapter that matches.

## 10. Sharing the text with the reel

`content/labels.json` is plain JSON with the reel's keys (`k`, `t`, `b`, `ch`, `c`, `chLine`), so a reel can
read it without TypeScript:

```js
import fs from 'node:fs';
const { labels } = JSON.parse(fs.readFileSync(new URL('../../../content/labels.json', import.meta.url)));
// in a section: lowerThird: { ...labels['puzzle:P2.1'] },
```

`renderLowerThird` only reads the text keys, so the extra `game` and `source` fields don't matter. (The reel's
"Learn as You Play" card isn't a game label; it can stay in the reel.) This task doesn't change
`tools/video/**`.

## 11. Decisions

- **Fonts:** keep the Georgia fallback; no web fonts (Dan, 2026-10-14). For the record, the reel's Latin
  subsets would cost: Fraunces 800 35.7 KB, Alegreya 500 24.3 KB, Alegreya SC 700 21.2 KB, Cinzel 700 15.2 KB.
- **Channel Routing line:** the course's wording (§4), approved.
- **Arrival hold:** 6.4 s, approved; used on every island.
