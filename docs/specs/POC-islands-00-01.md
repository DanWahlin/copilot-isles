# Spec: Proof of Concept, Islands 00 & 01 (v0.2: Grok Build review consensus applied)

> Companion to [`.plans/PLAN.md`](../../.plans/PLAN.md). This spec defines everything needed to play **title → character creation → Anchorage Cay (Ch 00) → Open Sea → Port Meridian (Ch 01)**.
> Course source: `github/copilot-app-for-beginners` @ `360fcb2` (local: `~/Desktop/projects/copilot-app-for-beginners`), re-synced to `0112446` (app 1.1.26) on 2026-10-02 (issue #177). Where this spec and that commit differ on UI names, steps or screenshots, the course wins and the game follows it.
> Hotspot coordinates are **normalized (0-1)** and **approximate**. They'll be finalized in the Hotspot Editor.

---

## 0. Scope & success

**In scope:** desktop + **tablet (touch, one cloud iPad pass)** play, a **2D Chart & Logbook proof slice** (full 2D coverage is Phase 1b), title/menus, character creation, intro, the dialogue/voice system, Logbook, all quiz types, the puzzle pieces used here, Captain's Chart + fast travel, settings, save, music (recorded CC0 tracks) and ambience, Island 00, the sea passage, and Island 01.
**Out of scope:** Islands 02-07 (they appear on the chart as fogged silhouettes marked "Coming soon"), the cosmetics shop (doubloons are collected, but the shop is stubbed), and the Master Captain certificate.

**The POC succeeds if:**
1. A first-time player finishes both islands in **~70-90 min** without outside help. Voice alone is ~44 min of audio, so trims (the Whispering Gallery, the bottles, a shorter Passport review) stay available as levers after the playtest.
2. Afterwards they can answer every Ch 00/01 learning objective, measured with the **10-question exit quiz in Appendix A** (hints off).
3. It hits the **PLAN §12.1 budgets** for each tier: **Low, 30 fps on the UHD 620 floor** (emulated per PLAN §14.5; a real-device session before Phase 1 content is recommended); **Medium, 45-60 fps on Iris Xe / M1 Air**; High and Ultra on faster machines. It also runs on **tablets with touch** (iPad A13+ at Medium), and the **2D Chart & Logbook mode** (a proof slice in the POC) covers devices that can't run 3D.
4. You look at it and say *"that's beautiful."*

**Vertical-slice gate:** **Anchorage Q0.2-Q0.8** must be fully playable, with real TTS for those lines, before the rest of the Phase 1 content is built.

---

## 1. Learning coverage matrix

Every course objective is **taught** (by an NPC or a Logbook page), **practiced** (in a puzzle or interaction), and **assessed** (in a quiz). IDs refer to the sections below.

### Chapter 00: Setup
| Course objective / section | Taught | Practiced | Assessed |
|---|---|---|---|
| Prerequisites (GitHub account, Copilot plan *or* own model provider, Business/Enterprise **GitHub Copilot app** policy, Git, Node LTS, `gh`) | Nell (Q0.2), chest C0.1 → pg.prereqs | Gear Check (Q0.4) | T0 #6 |
| Download & install → **Sign in to GitHub** → leave every repository unselected at **Connect your repositories** → **Continue** → **New** view (the theme lives in **Settings → Themes**) | Nell (Q0.2), pg.install, C0.3 | Paint Your Sails | *(shown, not quizzed: one obvious button)* |
| Fork = your own copy; pick **your fork**, not the original, in search | Ezra (Q0.3), pg.fork | Copy the Master Chart | S0.3, T0 #1 |
| **+** next to **Projects** → **Add GitHub repository**; alternatives **Open folder** / **Clone repository** | Ezra (Q0.3), C0.4 | Moor Your Ship | H0.2, T0 #1 |
| Start a project session with the **+ next to the project** (not the **Projects +**); workspace selector → **Current checkout** (not **New worktree**) for setup, then a short prompt creates the session | Bo (Q0.4), C0.6 | Your Own Deck | H0.4, T0 #1, #2, #7 |
| **View → Toggle Review Panel** → **Terminal** tab (or **+ → Terminal**); version checks; install only what's missing | Bo (Q0.4), pg.terminal | Gear Rack (scenery) | T0 #2 |
| `gh auth status` / `gh auth login` (GitHub.com → Login with a web browser) | Bo (Q0.4), pg.terminal | | S0.1, T0 #2 |
| Enable workflows on the fork (GitHub.com → your fork → **Actions** tab) so GitHub Actions can run the practice checks | Pim & Pol (Q0.7), pg.workflows; Suri (Q0.6, optional), pg.checks | P0.1 Sluice (optional) | T0 #4, #2 |
| Setup script: labels, issues, practice branches, PRs; bugs stay off `main`; in **Terminal**, from the repo root, run `node .github/scripts/setup-training-scenarios.js --dry-run`, check the `Repository:` line, then `--yes`, and wait for `Setup complete.` | Pim & Pol (Q0.7), page P0.S | **P0.2 Dry-Run Crane** | T0 #1, #3, #5 |
| First prompt goes to the **Copilot app** prompt box, *not* Terminal; model output varies | Juno (Q0.8), pg.first-prompt | Speaking Tube | S0.2, T0 #2 |
| Troubleshooting (sign-in, app policy ≠ CLI policy, Git missing, can't see repo / chat can't explain it, org fork, `Setup failed`, Issues disabled, manual appendix) | Bottles B0.1-B0.4 | | T0 #8 |
| Studio analogy: soundcheck | Lyra (Q0.9), C0.5 | | |
| Key takeaways (3) | Trial wrap-up | | T0 |

### Chapter 01: Tour the App
| Course objective / section | Taught | Practiced | Assessed |
|---|---|---|---|
| Why the app: 5 challenges (canvases for progress buried in chat) → what the app adds; it doesn't replace your editor | Tobias (Q1.2) | Scattered Evidence | M1.1 |
| Keep your editor; open in VS Code any time ("Use both") | Gideon (Q1.3), C1.6 | | S1.1 |
| Sidebar: **New**, **Pull requests**, **Issues**, **Automations**, **Customize**, **More** (**Edit sidebar...**), **Projects** (a **Chats** row once you've started a chat) | Districts (Q1.4), C1.1-C1.3 | Harbor Passport | H1.1 (×4), H1.2 |
| Chat session vs Project session (branch/worktree?) | Marisol & Anders (Q1.5) | **P1.1 Tavern or Shipyard** | H1.3, H1.4, A1 #5 |
| Most project sessions use **New worktree**; the Ch 00 session on **Current checkout** was the exception (the app remembers it until Ch 02) | Anders (Q1.5) | | A1 #4 |
| Modes: **Interactive / Plan / Autopilot** ("options, not levels to unlock"); **Tool permissions** (Always ask, Approve all, Assisted) | Rhea (Q1.6), C1.7 | **P1.2 Three Helms** | S1.2, A1 #9 |
| **Model**, **Reasoning effort** & **Context window** (hidden while the **Auto** switch is on); **Auto** ≠ **Autopilot**; you can change the model mid-session without changing the mode | Oren (Q1.7) | Star Charts | H1.5, S1.3, A1 #6-7 |
| Settings (the gear at the bottom of the sidebar): 9 areas plus **Projects**, & what **Model providers** does | Pell (Q1.8), C1.5 | **P1.3 Banners of the Hall** | H1.6, A1 #8 |
| Voice dictation (optional) | Whispering Gallery (Q1.9) | | O1.1 (optional) |
| Studio analogy: control room | Lyra (Q1.10), C1.8 | | |
| Key takeaways (6) | Admiral (Q1.11) | | A1 |

---

## 2. Player journey

```
Boot ─▶ Title (live 3D) ─▶ New Voyage ─▶ Character Creation ─▶ Intro (45s, skippable)
  ─▶ Anchorage Cay (~30-40 min) ─▶ Christening & Set Sail ─▶ Open Sea (~3 min)
  ─▶ Port Meridian (~35-45 min) ─▶ Lighthouse lit ─▶ POC end card (links to Chapter 02)
```

**Intro (voiced narrator, `en-GB-Ollie` HD):** Ink draws the archipelago onto the chart while fog rolls in. *"They call it the fog of scattered evidence: plans in one place, changes in another, and nobody quite sure where they left off…"* Then a rowboat glides into Anchorage Cay's lagoon at dawn, and a parrot lands on your shoulder.

---

## 3. Shared systems (POC requirements)

### 3.1 Title & menus
- **Loading screen (PLAN §13.8):** an instant ink-and-parchment Captain's Chart painted by an inline script. It **resolves in three layers as real loading progresses**, with themed stage messages ("Charting the isles" → "Raising the swell" → "Rigging the brigantine" → "Lighting the lighthouses").
- **Title backdrop:** **ocean, sky, clouds, and your brigantine at anchor**, **swinging gently on its anchor rope** (mooring spring + damped-spring buoyancy), with its analytic reflection on the swell on Medium+ (a hull smear on Low). Behind it sit **layered procedural distant ranges** in sky-tinted haze with **gold rim light on the ridges**. Contents follow the single definition in PLAN §13.5, with no island mesh. A far-off ship crosses the horizon, and **the Leaps director stages flying fish and the occasional dolphin pod, never behind the logo or menu text** (on Low and above; off on Lite and under reduced motion). The camera orbits slowly at golden hour, gulls circle, and the logo fades in using Fraunces at weight 300 with generous letter-spacing. Anchorage Cay streams in only after **New Voyage** or **Continue** (or quietly while the title sits idle), which keeps the title within its **≤ 4 MB** budget (PLAN §13).
- **Affiliation line:** a small line under the logo and in the credits. Its wording is a **required decision before the first public deploy** (see §10). It doesn't block Phase 0.
- **Main menu:** Continue (if a save exists) · New Voyage · Captain's Chart · Logbook · Settings · Controls · Credits · Quit. Quit saves and returns to the title, with a note that you can close the tab.
- **Pause menu (Esc):** Resume · Captain's Chart · Logbook · Settings · Controls · Save & Return to Title.
- **Style tokens:**

| Token | Value |
|---|---|
| Panel | `rgba(14,17,24,.55)` + `backdrop-filter: blur(16px)`, 12px radius, 1px hairline `rgba(232,200,138,.35)` |
| Type | Display: **Fraunces**. UI/body: **Manrope** (or Inter). Body 16px at 100% text size |
| Accent | Warm gold `#E8C88A`, sea teal `#3FD0C9`, coral (sparingly) `#FF7A59` |
| Motion | 180-240 ms ease-out. Hover shows a 2px underline slide and a soft glow. Reduced-motion mode swaps to fades only |
| Focus | Always-visible 2px focus ring for keyboard and gamepad navigation |

- **Efficiency:** while a full-screen menu is open, we render one frame, blur it, and pause the 3D loop (PLAN §12.8).

### 3.2 Character creation
- **Choose:** Man / Woman pirate. Name (max 16 characters). Skin tone (8 swatches). Hair style (4 per body) & color (6). Coat color (6) & sash color (6).
- A live turntable preview with an idle animation, plus a "Randomize" button.
- Voiced lines address you as **"Captain."** Your typed name appears in text only: save slot, Logbook cover, chart cartouche.

### 3.3 Controls (defaults, all rebindable)
| Action | Keyboard/Mouse | Gamepad | Touch (tablets) |
|---|---|---|---|
| Move / look | WASD / **hold right mouse to look** (default, no pointer lock) · arrow keys to look · optional **pointer-lock "mouse-look"** setting | LS / RS | **Left virtual stick** (appears where your thumb lands) / **drag on the right half** to look |
| Sprint / jump | Shift / Space | LS-click / A | Push the stick to its edge to sprint / **Jump** button |
| Interact / advance dialogue | E / Left-click | X | **Tap** the prompt, NPC, or chest (large context button) / tap the dialogue |
| Parrot hint | Q | Y | Parrot button |
| Logbook / Chart / Pause | J / M / Esc | View / Map (d-pad ↑) / Menu | Top-bar buttons |
| **Sailing:** trim sails (furled · half · full) | W / S | RT / LT | Trim slider (right edge) |
| **Sailing:** rudder / helm camera / leave helm | A-D / C / E (at a dock) | LS / RS-click / B | Helm wheel (drag) / camera button / Leave button |
| **Quizzes & screenshots** | Click, Shift for the magnifier | Cursor on LS, A to select | **Tap to place, pinch to zoom, long-press for the magnifier** |
| **Push-block puzzles** | Walk into a crate | Walk into a crate | Walk into a crate, or **tap a crate then tap a direction arrow** |

Touch targets are **≥ 44 px**, UI scales with the viewport, and tablets play **landscape** (portrait shows a "rotate" card). Audio unlocks on the first tap.

**POC movement limits:** you can wade in the shallows, and deep water gently returns you to shore. There's no swimming and no ledge climbing in the POC (PLAN §5 lists both as post-POC).

### 3.4 Dialogue & voice
- The subtitle panel sits bottom-center, with speaker name + portrait (AI-painted, 256²). **Word-by-word highlighting** is driven by TTS word-boundary timings.
- **Spyglass view:** when a line references an image, a framed panel slides in above the dialogue. Click it to open full-screen with pan/zoom (Esc closes).
- Advance with E/click/Space, hold to fast-forward, **L** opens the backlog (last 30 lines, with replay). Choices are keys 1-4.
- The camera goes over-the-shoulder, with a soft DOF on High+.
- **Lip sync** uses viseme events where the voice supports them, falling back to amplitude-driven jaw movement. Music ducks by −8 dB under voice.
- **Data (YAML):**
```yaml
id: nell.papers
npc: nell
source: { chapter: 00-setup, anchor: installation }
lines:
  - id: nell.papers.01
    say: "Morning, Captain! Nobody sails from Anchorage without their papers."
  - id: nell.papers.02
    say: "Papers means a GitHub account, and either a Copilot plan or your own model provider."
    show: { image: ch00/app-sign-in, caption: "Select Sign in to GitHub" }
  - choice:
      - { text: "What if my company manages my account?", goto: nell.policy }
      - { text: "Let's get signed in.", goto: nell.h0-1 }
```

### 3.5 Logbook (J)
- **Tabs:** Quests · Pages · Glossary · Crew · Songbook.
- **Pages** come from chests and NPCs. Each has a title, the image, a 1-3 sentence caption in plain words, and an **"Open in the course ↗"** link to the exact chapter section on GitHub.
- The **Glossary** fills in as terms are taught (fork, project session, worktree, mode, model, reasoning effort…).
- The **Songbook** plays each unlocked island's music track.

### 3.6 Quiz system
| Type | Behavior |
|---|---|
| **Multiple choice** / **multi-select** | 2-5 options, keys 1-5 |
| **Hotspot** | A large framed screenshot. Click to place a marker, hold **Shift** for a 2× magnifier lens. **Callout masking** patches over the course's red ①② badges with sampled background color, so the answer isn't given away. The Hotspot Editor **rejects any mask that overlaps a target rect**. Accessible alternative: **Tab** cycles through candidate regions (correct ones + distractors) and **Enter** selects |
| **Ordering** | Drag cards into sequence, or use arrow keys |
| **Matching** | Drag labels onto targets, or use keyboard pairs |
| **Scenario** | A short situation followed by a choice |

- **Feedback:** always explains *why* (correct or not). Wrong answers get a gentle parrot nudge and unlimited retries. First-try correct answers earn bonus doubloons. Feedback uses both **icons and color** (colorblind-safe).
- **Data (YAML):**
```yaml
id: H0.2
type: hotspot
image: ch00/app-add-project
mask: [[0.232,0.277,0.027,0.048],[0.373,0.438,0.027,0.049]]   # x,y,w,h: hide ①②
prompt: "Where do you start adding a repository to the app?"
targets:
  - { id: projects-plus, rect: [0.218,0.322,0.026,0.044], correct: true }
  - { id: new,           rect: [0.008,0.089,0.240,0.050] }
  - { id: customize,     rect: [0.008,0.244,0.240,0.050] }
explain:
  correct: "Right: the + next to Projects opens the menu for adding a project."
  wrong:   "Close! Look for the + beside the Projects heading in the sidebar."
source: { chapter: 00-setup, anchor: connect-to-your-repository }
```

### 3.7 Puzzle toolkit (POC subset)
Lever · rotatable pipe tile · sluice gate · flowing-water channel (a GPU-animated strip) · waterwheel · capstan-rotated crane · ghost-preview projector · carryable item + pedestal · push crate (grid-snapped) · floor sign/door target · rotating 3-face banner pillar · helm with mode dial · chart-table waypoint editor · buoy course. Every piece is data-driven, pooled, and event-driven (PLAN §12.8).

### 3.8 Captain's Chart (M)
- A parchment chart with an ink compass rose, animated wave strokes, and fog that clears. Island cards show the chapter number & title, progress (NPCs · chests · puzzles · Trial), and buttons: **Sail here** (an auto-sail cinematic) / **Fast travel** (lit lighthouses only).
- **Free explore** (Settings): the POC's two built islands, **Anchorage Cay and Port Meridian**, can be entered in any order (including skipping straight to Port Meridian). Islands 02-07 are visible on the chart as "Coming soon" and **can't be entered**.

### 3.9 Save (localStorage, versioned)
- **Autosaves** on every quest step, chest, quiz pass, docking, and fast travel.
- **Puzzles save as checkpoints:** a checkpoint is taken at each puzzle's start (they're ≤ 7 min), and P1.2 takes one after each of its 3 voyages. Reloading mid-puzzle resets that puzzle to its start, and the pause screen says so.
- **Schema:** `{ v, created, character, settings, island, position, quests{}, chests[], pages[], glossary[], quizzes{id:{firstTry,attempts}}, puzzles{id:{solved,checkpoint}}, doubloons, seals[], lighthouses[] }`.
- "Begin anew" asks for confirmation. Export/import works as a base64 code.

### 3.10 Settings (POC)
- **Graphics:** preset (auto-benchmarked) + render scale, shadows, water, vegetation density, post FX, FPS cap, perf HUD.
- **Audio:** Master, Music, Ambience, SFX, Voice, UI. A note says **voices are synthetic, generated with Azure AI Speech**.
- **Gameplay:** **Free explore**, hint frequency, look mode (hold-right-mouse / pointer lock), camera sensitivity, invert Y, FOV, camera shake, head bob, voice on/off.
- **Mode & quality:** preset **Lite / Low / Medium / High / Ultra** (auto-picked, PLAN §14.2) and **"Play in 2D Chart & Logbook mode"**.
- **Accessibility:** text size (90-150%), subtitle background opacity, **captions for important sound cues** (chest nearby, water flowing, crane locking, correct/incorrect, lighthouse lit), high-contrast UI, dyslexia-friendly font, and reduced motion. Reduced motion covers camera bob/shake, UI motion, **lantern flicker, sun shafts, Leaps and their splash sounds, and loader drift**, and slows cloud drift to near-static.

### 3.11 Wingman the parrot *(placeholder name)*
- **Q** gives a hint. There are **3 tiers per beat**: a nudge, a direction, then the answer with its explanation. **Inside Trials and the exit quiz, tier 3 is disabled**, so a Seal reflects what you know.
- He also gives a short recap after each quest step and occasional ambient quips (throttled, and they respect the hint-frequency setting).
- **Voice:** `en-US-AnaNeural` (bright) + pitch +20% + light formant/high-pass FX. We'll audition this.

---

## 4. Island 00: Anchorage Cay (Chapter 00 · Setup)

### 4.1 Art & mood
- **Shape:** a crescent of about 350 × 180 m around a shallow turquoise lagoon, with a small forested hill and a waterfall in the middle.
- **Light:** dawn to early morning, sun elevation 12° → 25°, warm key light with cool sky fill. Fair-weather cumulus drift from the SW.
- **Palette:** lagoon `#3FD0C9`, deep `#0F5A7A`, sand `#F3E6C8`, palm `#3E8E4E`, driftwood `#9A7B5B`, sun-bleached canvas `#EFE7D6`.
- **Horizon:** **Port Meridian's citadel is faintly visible to the NE** (your next goal), and a volcanic silhouette sits far to the E (a nod to Tidewheel Caldera).
- **Water (PLAN §6 Water system):**
  - The **lagoon** gets turquoise absorption, **caustics dancing on the sand floor**, and the planar mirror on High/Ultra. Palms and stilt huts reflect in the calm water.
  - The **reef** gets break foam lines, and the **beach** gets run-up with a receding wet-sand band.
  - The waterfall and the **P0.1 channels** use flow maps.
  - The **pier and huts** carry waterline tidemarks, and wading in the shallows spawns rings.
- **Ambient life:** gulls, scuttling crabs, lagoon fish, butterflies, palm rustle, and surf on the reef. **Flying-fish schools** skip across the reef edge and lagoon mouth (Leaps director). The hill's seaward face gets fluted cliffs with a tidal notch and wet band, and the shoreline gets a coast-foam ribbon.
- **Music:** "Reggae" by Pro Sensory (CC0), which Dan picked on 2026-09-25.

| Layer | What plays |
|---|---|
| Base | Pad + marimba |
| Explore | + ukulele melody |
| Puzzle | Sparse kalimba + soft tick |
| Trial | + hand drum |

### 4.2 Layout
```
                         N ↑        (Port Meridian citadel on the NE horizon)
        [I] Point Lighthouse ◉
              ╲  reef ~~~
   [J] hidden   ╲         [F] Waterfall ▶ Sluice ▶ Waterwheel
   cove  ☼       ╲   hill ▲▲           │
                  ╲  [D] Chartmaker ⌂   │
   [A] Arrival ~~ beach ~~ [B] Driftwood Landing (stilt huts ⌂⌂⌂, nets, stall)
   (rowboat)          [E] Storehouse ⌂      [K] Bard's hammock ~ lagoon ~
                              ╲
               [C] Harbormaster ⌂══ pier ══[G] Supply Crane ⚓══[H] Your berth
```

### 4.3 Cast
| NPC | Role · personality | Location | Voice *(proposed; audition)* | Teaches |
|---|---|---|---|---|
| **Nell Tidewell** | Harbormaster · warm, brisk | C | `en-GB-Sonia` HD | Prereqs, sign-in, theme |
| **Ezra Quill** | Chartmaker · meticulous, dry wit | D | `en-GB-Ollie` HD (`AZURE_SPEECH_MALE_VOICE_UK`) | Fork, add a project |
| **Bo Marlin** | Quartermaster · hearty | E | `en-GB-Ryan` HD | Project session, Current checkout, Terminal, tools, `gh` |
| **Suri Okoye** | Millwright · practical | F | `en-US-Jenny` HD | Enable workflows |
| **Pim & Pol** | Crane twins · finish each other's sentences | G | `en-IE-ConnorNeural` / `en-IE-EmilyNeural` | Setup script, dry-run |
| **Juno** | Your first mate (crew lead = agents) · calm, precise | H (ship) | `en-GB-Ada` HD (`AZURE_SPEECH_FEMALE_VOICE_UK`) | First prompt & expected output |
| **Lyra Wren** | Wandering Bard · wistful | K | `en-GB-LibbyNeural` | Studio analogy |
| Villagers ×6 | Short voiced barks | B | assorted | Flavor |

### 4.4 Quest flow
Each step autosaves. **[C#]** marks a chest and **[P]** a Logbook page.

**Q0.1 · Landfall (tutorial, ~1 min).** You step onto the beach and learn movement, camera, and interaction. Wingman introduces himself: *"First mate's job is hints. Captain's job is decisions."* Nell waves you toward the pier.

The stops run along the harbour in the chapter's order, so there's no doubling back: Nell's door → Ezra's chart table and Bo's gear rack at the pier foot → the crane, Juno, and Nell again at the pier head. Suri's mill and Lyra's hammock are optional detours.

**Q0.2 · Captain's Papers** *(00 · Prerequisites, Installation)*
- Nell starts with the basics: the GitHub account, a Copilot plan *or* your own model provider, and, for Business/Enterprise, the **GitHub Copilot app** policy. Then the tools: she opens **[C0.1] her chest** while she talks (the `nell-chest` cue), which holds **[P] "What you need"** (pg.prereqs): the tool links, what each is for, and that you'll check them in the app's **Terminal** later.
- The spyglass shows the app (`app-github-copilot-app`) with the download link, and she grants **[P] "Get the Copilot app"** (pg.install).
- The spyglass shows `app-sign-in`. Signing in is one obvious button, so it's shown and told, not quizzed. She explains that at **Connect your repositories** you leave every repository unselected and select **Continue**, because you'll connect your fork shortly. The app opens the **New** view (**[C0.3] "The New view"**).
- **Paint Your Sails:** app 1.1.25 dropped the first-run theme step, so the spyglass shows `app-settings` and Nell points you to the gear at the bottom of the sidebar, then **Themes**. Here, your theme is your sails: the palette stand beside her has six palettes named after the app's themes. Your choice recolors your sails and persists, and **Finish** sends you on to Ezra.

**Q0.3 · Copy the Master Chart** *(00 · Connect to your repository)*
- Ezra waits at his chart table on the quay by the pier foot. He explains that a **fork** is *your own copy* of the course repository on GitHub, and grants **[P] "Fork the course"** (pg.fork, with the fork URL).
- **Moor Your Ship:** on the unopened New view, **H0.2** asks you to find the **+** next to **Projects**. Then the spyglass shows the menu it opens (`app-add-project`): **Add GitHub repository** is told, not quizzed, along with **Open folder** / **Clone repository**.
- Ezra warns that search can show the original too. **S0.3:** `github/…` or `your-handle/…`? → **your fork**. The app clones it and adds the project to the sidebar. **[C0.4]**

**Q0.4 · Your Own Deck** *(00 · Check your tools in Terminal)*
- Bo stands at his gear rack beside Ezra. He confirms the project shows under **Projects**, then has you point to it and select the **+** that appears beside it (not the **Projects +**, which adds another project) to start a **project session**.
- **H0.4** uses `app-current-checkout-workspace-selector` with the callouts masked: "For this one-time setup, where should the session run?" → **Current checkout**. The checkmark on **New worktree** is just the *default*; **New worktree** is "a separate directory for each session" (*"you'll meet the other options on Thousand-Bough Isle"*), and **Cloud** "runs in a cloud sandbox." **[C0.6]** has the short prompt that creates the session (*"Name the top-level folders in this repository. Do not change any files."*).
- The spyglass shows the review panel (`shared/app-review-panel`). Bo explains **View → Toggle Review Panel**, then the **Terminal** tab (if it isn't visible, **+ → Terminal**).
- **Gear Rack (scenery):** four pieces over readable plaques (compass = Git `git --version`, lantern = Node.js `node -v`, rope coil = npm `npm -v`, spyglass = GitHub CLI `gh --version`) under a **Gear Check** header. Bo runs them (the `gear-checks` cue) and the terminal panel shows every version plus `gh auth status`. **Every check passes:** the game can't see your machine, so it never claims a tool is missing. *"If one says command not found, install just that tool, then run the checks again."* E at the rack reruns the readout any time.
- GitHub CLI has its own sign-in. **S0.1:** `gh auth status` shows *someone-else*. What now? → `gh auth login` → **GitHub.com** → **Login with a web browser** → run `gh auth status` again and confirm. **[P] "Terminal in the app"** (pg.terminal) has the checks, `gh auth status`, and `gh auth login` as a code block.

**Q0.6 · Open the Sluice (optional)**. Opens once the crane's done. Suri's mill shows what turning on workflows does → **P0.1**, then **[P] "The practice checks"** (pg.checks). Afterwards, Wingman heads off a mix-up: *"These are GitHub Actions workflows. The Clock Tower's **Automations** are something else, saved agent tasks, and you'll learn those much later."*

**Q0.7 · The Dry-Run Crane** *(00 · Add the course practice items, steps 2-3)*
- Pim & Pol explain that the script stocks your ship with **labels** (colored pennants), **issues** (bounty notices), **practice branches** (practice hulls, *"the bugs stay on those, never on `main`"*), and **pull requests** (sealed inspection requests: changes to review, a feedback comment, and an intentionally failing check).
- *"They're training scenarios, not problems with your setup."*
- **Actions first** *(the section's step 1)*: *"First, a job on GitHub.com. Open your fork's **Actions** tab. New forks switch workflows off."* Select **I understand my workflows, go ahead and enable them**, so GitHub can run the practice checks. **[P] "Turn on workflows"** (pg.workflows). → **P0.2**.
- After the crane, Pol hands you a **[P0.S] "The setup commands"** page. It shows exactly what the crane stood for. You run both commands in the app's **Terminal** tab, from the repository root (the folder that contains `.github` and `samples`):
  ```bash
  node .github/scripts/setup-training-scenarios.js --dry-run   # preview; check the Repository: line
  node .github/scripts/setup-training-scenarios.js --yes       # run it; wait for "Setup complete."
  ```

**Q0.8 · First Words** *(00 · Your first prompt)*
- On your ship there are two pipes: the **Prompt Box** speaking tube (to the crew) and the **Terminal** hatch (to the engine room). **S0.2:** where does *"Give me an overview of the copilot-app-for-beginners course repository…"* go? → the **Prompt Box**.
- Juno replies with the expected output: the course structure, and `samples/book-app-web` as the web sample used in later exercises. **[P] "Your first prompt."**

**Q0.9 · Soundcheck (Bard, optional)** *(00 · What's Next)*
- Lyra: *"Before you record anything, you get the studio ready: sign in, plug in your gear, load the song, and run a soundcheck. You just did the sailor's version."*
- **[C0.5]** gives `studio-setup-soundcheck`, and the island theme unlocks in the Songbook.

**Q0.10 · The Harbormaster's Trial.** Once the first prompt's sent, Nell waits at the pier head by your bow, so there's no walk back. Passing goes straight on to **Q0.11 · the christening** in the same conversation. → §4.7.

**Message bottles (optional):**
- **B0.1** *I cannot sign in*: check the account and the plan or own model provider. For Business/Enterprise, the **GitHub Copilot app** policy must be enabled, and **that's separate from the Copilot CLI policy**. If your org uses `*.ghe.com`, choose **Sign in to GitHub Enterprise Cloud**.
- **B0.2** *I cannot see the repository*: check access, the right account/org, or try **Open folder**. If the app says **Git is missing**, install Git and retry. If a chat can't explain the repository, check the right one's connected and the prompt names it.
- **B0.3** *The script stops for an organization fork*: use `--allow-shared-repository` **only** if you're authorized and the `Repository:` line is right. If issues are missing, go to **Settings → Features**, enable **Issues**, and rerun. If the script can't run at all, the course's manual appendix covers it; do it before Chapter 02.

### 4.5 Puzzles

**P0.1 · Sluice & Waterwheel** (warm-up, ~2 min)
- A 3×4 grid of rotatable channel tiles runs between the waterfall ("Actions spring") and the waterwheel. You rotate tiles with E to connect a path. There's a single solution, and 2 dead-end tiles act as distractors. The water is a **flow-map surface** that follows each tile's direction. When a tile connects, its water visibly starts moving, and a dead end pools and stops.
- The final gate carries a painted sign: *"Workflows aren't being run on this forked repository."* Its lever reads **"I understand my workflows, go ahead and enable them."**
- **Solved:** water flows, the wheel turns, and lanterns across the village light up. Suri: *"There. The practice checks can run on your fork now."*
- **Hints:** (1) "Follow the water from the spring." (2) Highlights the tile nearest the break. (3) Auto-rotates one tile.

**P0.2 · The Dry-Run Crane** (signature, ~4 min)
- **Pieces:** a crane on a capstan (4 facings, one per berth), a **Dry-Run lever**, a **`--yes` lever**, and a painted **`Repository:` sign** on the crane arm. Berth 1 is your ship, with your chart's name on its flag. Berth 2 belongs to another captain. Berth 3 flies a guild (organization) flag.
- **Start state:** the crane faces **Berth 2**.
- **Loop:**
  1. Pull **Dry-Run**. Translucent ghost crates (pennants, notices, hulls, sealed requests) drop onto the targeted ship, and the sign reads `Repository: <other-captain>/copilot-app-for-beginners`. Pim: *"Wait for the preview to finish, then check the Repository line."*
  2. Turn the capstan to aim at your ship and pull Dry-Run again. The sign shows **your** name and the ghosts land on your deck.
  3. Pull **`--yes`**. Real crates drop into your hold with a satisfying stack animation, and a banner unfurls: **`Setup complete.`**
- **Guards (these teach; nothing fails):**
  - Pulling `--yes` before a confirmed dry-run makes Pol stop you: *"Preview first, always!"*
  - Aiming at **Berth 3** makes the crane lock. *"The script stops before changing a repository owned by an organization."* An optional dialogue explains `--allow-shared-repository`.
- **Checklist board:** pennants for labels, notices for issues, hulls for branches, seals for PRs, each ticked as it lands.
- **Hints:** (1) "What does the sign say?" (2) Highlights the capstan. (3) Points to your berth.

### 4.6 Chests & pages
| ID | Where | Image | Caption |
|---|---|---|---|
| C0.1 | Nell's chest (beside her door) | *(page pg.prereqs, no image)* | What you need: account, plan or own provider, app policy, Git, Node LTS, `gh`, with links. |
| C0.3 | Nell, after sign-in | `assets/app-github-copilot-app.webp` | Select **Continue** and the **New** view opens, where new work starts. You can close the tip it may show. |
| C0.4 | Chartmaker's loft | `00-setup/assets/app-add-project.webp` | **+** next to **Projects** → **Add GitHub repository** (or Clone repository / Open folder). |
| C0.5 | Bard's hammock | `00-setup/assets/studio-setup-soundcheck.webp` | Setting up the app is like prepping a studio before the first take. |
| C0.6 | Bo, after H0.4 | `00-setup/assets/app-current-checkout-workspace-selector.webp` | **Current checkout** works in the clone already on your machine. A short prompt creates the session. |
| P0.S | From Pol, after the crane | *(Logbook page: code block, no image)* | The two setup commands, run in **Terminal** from the repo root: `--dry-run` first, check `Repository:`, then `--yes`. |

Pages granted in dialogue (not chests): **pg.install** (Nell), **pg.fork** (Ezra), **pg.terminal** (Bo: review-panel image, the Terminal tab, and the checks as a code block), **pg.workflows** (Pim & Pol), **pg.checks** (Suri, optional), **pg.first-prompt** (Juno: the prompt as a code block, and a note that models word replies differently). The sign-in and Settings screenshots appear in Nell's spyglass rather than as separate pages.

### 4.7 Quizzes
Quizzes cover what's specific to the app or easy to get wrong. Obvious steps (the sign-in button, a menu item named after what you want, `node -v`) are shown and told instead; the old H0.1, H0.3, MC0.1 and M0.1 were cut for that reason.

| ID | Type | Prompt → correct answer | Notes |
|---|---|---|---|
| H0.2 | Hotspot `shared/app-github-copilot-app` (unopened New view) | "Where do you start adding your fork to the app?" → **+ by Projects** (px 300, 328, 34 × 34 of 1920 × 1080) | Distractors: the prompt-box **+**, **New**, **Customize** |
| S0.3 | Scenario | Search shows `github/…` and `your-handle/…` → **your fork** | The setup script refuses the original |
| H0.4 | Hotspot `app-current-checkout-workspace-selector` (masks: both callouts and the outline round Current checkout) | "Where should the setup session run?" → **Current checkout** | Wrong-answer copy: "The checkmark shows the default, **New worktree**, a separate directory for each session. For setup, change it to **Current checkout**." Also explains Cloud |
| S0.1 | Scenario | `gh auth status` shows the wrong account → **`gh auth login`, GitHub.com, web browser, re-check** | |
| S0.2 | Scenario | Where does the first prompt go? → **Copilot app prompt box** | Terminal is for commands |

**The Harbormaster's Trial (T0)** is 8 items. You pass when all 8 are correct (retries allowed, and hint tier 3 is off). Stars are awarded for first-try accuracy.
1. **Ordering (5 dependent steps):** Fork the course repo → Add your fork (**+ Projects → Add GitHub repository**) → Start a project session on **Current checkout** → `--dry-run` and check `Repository:` → `--yes` and wait for `Setup complete.`
2. **Matching (T0.9, where each step happens):** turn on workflows → GitHub.com · switch to Current checkout → workspace selector · `gh auth status` → Terminal tab · ask for an overview → prompt box.
3. **Multi-select:** "What does the setup script create?" → labels, issues, practice branches, pull requests. Distractor: *"bugs on `main`."*
4. **MC:** "Why enable workflows on your fork?" → *So GitHub can run the automated checks for the practice exercises.*
5. **Scenario:** "The dry-run shows `Repository: someone-else/…`. What now?" → *Stop and point it at your fork before running `--yes`.*
6. **Multi-select:** prerequisites (GitHub account · Copilot plan **or** own model provider · Git · Node LTS · `gh`).
7. **MC (T0.10):** "Your fork shows under **Projects**. How do you start the setup session?" → *the **+** next to the project*. Distractors: the **Projects +** (adds another project), **Chat** (not tied to the repo).
8. **Scenario:** "Practice issues weren't created." → *Enable **Issues** in the fork's **Settings → Features**, then rerun.*

**Reward:** the **Seal of Anchorage**, the Point Lighthouse lights (fast travel), +50 doubloons, and the chart reveals the route to Port Meridian.

### 4.8 Christening & Set Sail
Nell breaks a coconut on the bow of your **brigantine**, a two-masted, square-rigged Golden Age pirate ship with a weathered hull and patched canvas. It's generic historical design, not a copy of any film ship. Your sails show your chosen colors, and Juno reports, *"Crew's aboard, Captain."* The ship's name is your typed name + "'s Brigantine" (editable). Wingman then runs a short sailing tutorial at the berth.

---

## 5. Open Sea passage (00 → 01)

- The trip is about 1.2 km: roughly 2.5 min at full sail and 4 min at half. A steady SW wind makes it a comfortable broad reach.
- **Buoys** mark the channel. The **citadel** grows on the horizon. Port Meridian's mountain ridge and the far ranges sit behind it.
- **Optional moments:** a dolphin pod rides the bow wave and **leaps alongside** (Leaps director, nose and tail splashes), flying fish skim ahead of the bow, a distant ship crosses the horizon, there's a sea-stack arch to sail through (hidden achievement), and a floating bottle **B0.4** holds a teaser: *"Why a whole app? Ask the merchant in Port Meridian."*
- **Music:** the sea track ("The Bard's Tale"), crossfading into the Port Meridian track within 250 m of the harbor.
- **Streaming:** Port Meridian's **critical pack is prefetched from the moment the Harbormaster's Trial starts** and raised to top priority when you set sail. Anchorage drops to medium LOD past 400 m and to a silhouette past 900 m. If you'd arrive before the critical pack is resident, a **fog bank** gently slows the ship near the harbor while the lighthouse beam fills to show progress. After ~20 s, or on a fetch failure, the ship docks into a low-detail harbor while streaming continues (PLAN §13.4).
- **Docking:** once you're within 25 m of the harbor berth below half speed, a soft auto-assist docks you and you step onto the quay.

---

## 6. Island 01: Port Meridian (Chapter 01 · Tour the App)

### 6.1 Art & mood
- **Shape:** roughly 700 × 450 m. Terraced hillside town above a walled harbor, a **mole with a lighthouse**, and the **citadel** on the summit. A mountain ridge sits behind with far ranges beyond.
- **Pacing rule:** the landmass stays large, but the **required stops are clustered** so neighboring required beats are about a **60-90 s walk** apart. The **citadel climb is the one deliberately long walk**, a scenic payoff before the Hall of Records and the Exam.
- **Light:** late-afternoon **golden hour** with the sun at 18°, long shadows, and warm **shadow-map sun shafts** through the streets (High+).
- **Water:** the walled inner basin is a calm zone (planar mirror on High/Ultra), so the terracotta town and **moored ships (swinging on their mooring springs)** reflect in it at golden hour. **Mullet** hop in the basin now and then.
- **Cliffs:** the ridge behind the citadel and the headland below it are **fluted limestone cliffs** with strata ledges, a tidal notch, sea caves at the waterline, **gold rim light at golden hour**, and terraced slopes. The far ranges layer into the haze.
- **Palette:** terracotta `#C8643B`, limestone `#E9DCC3`, bougainvillea `#C2306B`, cypress `#2F4F3A`, sea teal `#2BB3B1`, banners in deep blue `#1F3A6B` and gold `#E8C88A`.
- **Vegetation:** palms along the quay, cypress and olive on the terraces, bougainvillea on the walls.
- **Ambient life:** market murmur, church-bell-style chimes on the quarter hour (from the Clock Tower), pigeons, a harbor cat, flags snapping.
- **Music:** a CC0 track we'll pick with Dan. The mood brief: Ionian ↔ Dorian at ~76 bpm, with lute, recorder, harp arpeggios, and soft strings.
- **Efficiency:** the town is split into **chunked zones**. The Citadel hall is an interior zone behind a portal. See §8.

### 6.2 Layout
```
                          [K] CITADEL · Hall of Records ⛫   [L] Admiral's Terrace
                          [K2] Whispering Gallery (opt.)
           [J] Observatory ◔          terraces ▤▤▤▤
      [I] Naval Academy (3 helms) ══ harbor inner basin ══
  [G] Royal Shipyard ⚒     [D] Clock Tower ⏲      [E] Outfitter ⌂      [P] Post Office ✉ ("The Browser")
  [H] Carpenter's Workshop  [C] Market Sq · Bounty Board ▦    [F] The Quick Chat Tavern 🍺
        [B] Harbor Plaza · Voyage Office ⌂ · [M] Bard at the fountain · [T] Pump-house terminal hatch
  ════ quay ════ [A] Arrival berth ════ mole ════════ ◉ Mole Lighthouse
```

### 6.3 Cast
| NPC | Role | Location | Voice *(proposed)* | Teaches |
|---|---|---|---|---|
| **Admiral Isadora Vale** | Governor, gives the Trial | L | `en-GB-Sonia` HD *(Juno already uses Ada)* | Summons, key takeaways |
| **Tobias Finch** | Merchant, scattered evidence | B | `en-GB-Ollie` HD | Why the app |
| **Gideon Hart** | Carpenter (your editor) | H | `en-US-DavisNeural` | Use both |
| **Mina Sol** | Voyage clerk | B | `en-US-EmmaNeural` | **New** |
| **Rourke** | Bounty keeper | C | `en-AU-WilliamNeural` | **Pull requests** & **Issues** |
| **Hollis** | Clockkeeper | D | `en-GB-ThomasNeural` | **Automations** (teaser) |
| **Dee Castellan** | Outfitter | E | `en-US-AriaNeural` | **Customize** (teaser) |
| **Marisol** | Tavern keeper | F | `en-US-JaneNeural` | Chat sessions |
| **Anders Holm** | Shipwright | G | `en-US-GuyNeural` | Project sessions / New worktree |
| **Captain Rhea Storm** | Academy master | I | `en-US-NancyNeural` | Modes |
| **Oren Vey** | Astronomer | J | `en-US-Andrew` HD *(alt. `en-US-BrianNeural`)* | Model & reasoning effort |
| **Archivist Pell** | Keeper of records | K | `en-GB-NoahNeural` | Settings |
| **Lyra Wren** | Wandering Bard (traveled on ahead) | M | `en-GB-LibbyNeural` | Control-room analogy |

> Casting rule: no two NPCs on the same island share a voice. HD voices are reserved for the 3-4 most-heard characters per island. We'll audition in Phase 0.

### 6.4 Quest flow

**Q1.1 · The Admiral's Summons.** A herald meets you on the quay with a sealed letter: *"Learn the town, prove you can command, and the Seal of Meridian is yours."* Quest tracker: **Harbor Passport** (5 stamps) + **Three Helms** + **Observatory** + **Hall of Records** → Admiral.

**Q1.2 · The Scattered Evidence** *(01 · Why use the GitHub Copilot app?)*
- Tobias's voyage records are scattered across four places, which match the course's four tools: the **plan** at the **tavern** (a chat), the **diff** at **Gideon's workshop** (the editor), the **tests** at the **pump-house terminal hatch** (a terminal), and the **PR** at the **post office**, whose sign reads *"The Browser"* (GitHub in your browser, outside the app). Collecting each item shows its **challenge card** (Shared working copy · Scattered evidence · Explore vs change · Repeat work).
- Back at the Plaza, Tobias lays the cards on the **Command Deck table**. **M1.1** matches each challenge ↔ *what the app adds*:
  - Shared working copy → project sessions keep work separate
  - Scattered evidence → sessions, diffs, terminal, preview, and GitHub work in one app
  - Explore vs change → Chats for safe questions, project sessions for repo work
  - Repeat work → Automations save a prompt and run it on demand, on a schedule, or from GitHub events
- Tobias adds: *"Mind you, it's not a replacement for your editor, and it isn't 'multi-project support' by itself."*

**Q1.3 · Use Both** *(01 · The solution: "You still keep your editor")*
- Gideon's workshop has fine tools for deep work. He shows `editor-vs-app` **[C1.6]**: *"Use both. Switch when the job changes."* He explains you can jump from the app to VS Code on the same project any time.
- **S1.1** gives 3 tasks → Editor or App: "hand-debug a tricky function" → Editor; "review what an agent changed and move it to a PR" → App; "run a session, pick a mode, check the preview" → App.

**Q1.4 · Harbor Passport** *(01 · Tour the App)*. Visit five districts and each keeper stamps your passport:
- **Voyage Office = New:** the landing view. Start a chat without a project, pick a connected project, choose mode & model, or use a sample idea. The posters match the screenshot you're shown: *"Create a reusable technical design doc template for feature proposals"*, *"Compare monorepo vs multi-repo and when to use each"*, and *"Create an accessibility audit checklist for web interfaces"*. Mina notes that the ideas shown can vary. **[C1.1]** `app-new-page`.
- **Bounty Board = Pull requests & Issues** (My work split in two in app 1.1.26): each view lists the items that involve you, with tabs to filter them. **The notices are the practice items you loaded on Anchorage Cay**: the practice pull requests on **Authored by me** (`app-pull-requests-page`, where *Failing stats check practice* shows **Failed**) and the practice issues on **Assigned to me** (`app-issues-page`, like *Make search case-insensitive*). Rourke: *"Numbers on your own fork may differ. Go by the title."* **[C1.2]** Keelhaven teaches opening and fixing the check.
- **Clock Tower = Automations:** recurring agent tasks. Templates run manually or daily/weekly, events can trigger them, and you choose local or cloud. *"Tidewheel Caldera's clockmakers will teach you properly."* **[C1.3]** `app-automations-page`.
- **Outfitter = Customize:** skills, MCP servers, plugins, extensions, and canvases. **More → Edit sidebar...** chooses which views show; keep them all. *"You don't need any of it yet. Guildcrest, Sunspire Sands, and Inkwell Bluffs will kit you out."*
- **Tavern & Shipyard = Projects and chats:** covered in Q1.5.
- **Passport review, H1.1** (on `app-new-page`, no masking needed): "Where do you find the practice issues assigned to you?" → **Issues** (the sidebar rows are 40 px apart from y 68: New, Pull requests, Issues, Automations, Customize, More).

**Q1.5 · A Word at the Tavern, Work at the Shipyard** *(01 · Projects and chats, Chat sessions, Project sessions)*
- Marisol: *"A chat is like asking a musician a quick question."* Chats are for learning and brainstorming, and they don't create a branch or worktree.
  - The spyglass shows `app-quick-chat`: start a chat with **+** next to **Projects**, then **Chat** (in 1.1.26 the **Chats** row only appears once a chat exists).
  - **H1.2:** "Where do you check whether your prompt goes to a chat or a project?" → **the project picker below the prompt**. **[C1.4]**
- Anders at the Shipyard: use a **project session** when the agent needs repository context, has to change code, or must create an artifact such as a PR. Most project sessions should use **New worktree**. *"Your Anchorage setup used Current checkout on purpose. That was the exception, and the app remembers it, so you'll switch back in Chapter 02."*
- Then **P1.1**.

**Q1.6 · The Three Helms** *(01 · From the Studio: In the Control Room, Modes)*
- Rhea stands before **three helms side by side, all on the same level**. The subtle message is that these are *options, not levels to unlock*.
- *"Interactive is directing a take with frequent check-ins. Plan is charting the arrangement and approving it before the first take. Autopilot is handing a clearly defined task to a trusted crew."*
- → **P1.2**, then **S1.2**. **[C1.7]** `session-mode-decision-ladder`.

**Q1.7 · The Navigator's Observatory** *(01 · Models and reasoning effort)*
- Oren: the **Model** is *which navigator you consult* (they differ in capability, speed, and usage cost). **Reasoning effort** is *how long they study the charts*: higher can help on hard problems but takes longer, and it doesn't guarantee a correct answer.
- **Where to find it:** below the prompt box, next to the mode selector. It shows **Auto** or a model name, and opening it reveals **Model** and **Effort**. Some app versions show separate controls.
- **H1.5** on `app-new-page`: "Click the control that shows the **model name**" → `[0.414,0.491,0.089,0.029]`. Distractor: the mode selector "Interactive" `[0.365,0.491,0.049,0.029]`. The explanation: *"On this screenshot it reads **GPT-5.6 Sol · Medium**. That's the model name, and **Medium** is the reasoning effort. On your machine it might say **Auto**."*
- **Star Charts (S1.3):** three telescopes, three tasks:
  - Repo tour → keep **Auto**/default effort.
  - Tricky bug across several files → **a complex-coding model + higher effort**.
  - Quick explanation → default.
- **Try it:** the speaking tube shows the chapter's prompt (*"In samples/book-app-web, explain how filterBooks searches book titles and authors. Does letter case affect the results?…"*) with a **"Try it in the app ↗"** link to the chapter section. You then choose **"I tried it"** or **"Show me a good answer"**. Only after that choice does Juno describe what a good answer contains: it matches titles and authors without depending on letter case, it cites `samples/book-app-web/src/App.tsx`, and no files change. Players who never open the app still learn it, and players who do aren't spoiled.

**Q1.8 · The Hall of Records** *(01 · Settings)*. Pell's hall has **9 alcoves**, one per settings area: General, Accounts, Sessions, Themes, Accessibility, Voice dictation, Customize, Model providers, Experimental (and a **Projects** list below them). Settings opens from the gear at the bottom of the sidebar. → **P1.3**, then **H1.6** on `app-settings`: "Where would you set **app-wide instructions**?" → **Sessions** `[0.209,0.258,0.140,0.033]`. Pell adds: *"Model providers connects extra providers with your own keys. It doesn't replace the model picker below the prompt box."* **[C1.5]**

**Q1.9 · The Whispering Gallery (optional)** *(01 · Optional: Voice dictation)*. An echoing dome explains that dictation turns speech into **editable prompt text**. **O1.1** orders the steps: Settings → **Voice dictation** → set up input device → **Microphone privacy / Open preferences** → **Test mic** → note the shortcut → new chat → use the shortcut. *The POC never touches the real microphone.*

**Q1.10 · The Bard in the Plaza.** Lyra retells the control-room analogy (*"a producer doesn't handle every song the same way…"*). **[C1.8]** `producer-control-room-modes`, and the Meridian theme unlocks.

**Q1.11 · The Admiral's Exam.** → §6.7.

### 6.5 Puzzles

**P1.1 · Tavern or Shipyard?** (Sokoban-lite, ~4 min)
- **Setup:** a market lane on a 7×5 grid holds 6 **request crates**, each with a painted label. Push each crate onto the **Tavern door plate** (Chat) or the **Shipyard gate plate** (Project session). Walls and barrels block some lanes, and there's no move that can't be undone. **R** resets and **Z** undoes.

| Crate | Goes to |
|---|---|
| "When should I use a chat vs a project session?" | Tavern |
| "Brainstorm a name for a reading-stats feature" | Tavern |
| "Explain what a Git worktree is, in general" | Tavern |
| "Fix the unread-count bug and open a PR" | Shipyard |
| "Add a regression test for case-insensitive search" | Shipyard |
| **"Tour `samples/book-app-web`, citing file paths. Don't change files"** | **Shipyard**. The trick: it needs repository context even though nothing changes |

- **Feedback:** a misrouted crate bounces back with a one-line reason.
- **Solved:** both doors swing open, and the tavern cheers.

**P1.2 · The Three Helms** (signature, ~7 min). Three short harbor voyages in a training cutter, one per helm:
1. **Interactive · Harbor Slalom:** you steer through 5 buoys. At each buoy the crew *checks in* ("Hard to port, Captain?"), and you confirm or adjust. It teaches step-by-step collaboration.
2. **Plan · Reef Passage:** at the chart table, place 4-6 waypoints on a top-down chart through a reef. The route validates against shallows (red where it's too shallow). Once you **approve the plan**, the cutter sails it by itself. If you try to cast off without a plan, Rhea says, *"This passage is one where the approach matters. Chart it first."*
3. **Autopilot · Supply Run:** a clear, well-defined outcome (deliver 3 crates to the mole). Set the destination and let the trusted helmsman sail it **end to end with no required input**. It follows an **authored waypoint spline** around moored boats and buoys (PLAN §6 Physics & motion). A small, de-emphasized **Stop** control exists, but it's optional and the voyage never asks you for anything.

*Checkpoints:* P1.2 saves after each of the three voyages (§3.9).

- **S1.2 (scenario, 5 cards):**

| Card | Mode |
|---|---|
| "I want to be involved the whole way" | Interactive |
| "The initial approach and project details matter" | Plan |
| "Well defined, with a clear outcome" | Autopilot |
| "I'm exploring and want to steer each step" | Interactive |
| "A multi-file change I'd like to approve before any edits" | Plan |

- **Bonus MC:** "Is Autopilot the 'highest level' you unlock?" → *No. They're options you pick per task.*

**P1.3 · Banners of the Hall** (Zelda-style rotating pillars, ~3 min)
- Six stone pillars, each with 3 banner faces (settings areas). Above each pillar a request is carved. Rotate every pillar to its matching area and the **Archive vault** opens (chest **C1.5**).

| Carved request | Answer |
|---|---|
| Set app-wide instructions | **Sessions** |
| Add another GitHub account | **Accounts** |
| Use your own API keys for other providers | **Model providers** |
| Change where repositories are stored | **General** |
| Display zoom & keyboard shortcuts | **Accessibility** |
| Try preview features | **Experimental** |

- **Hints:** (1) "Read each carving aloud." (2) Highlights one wrong pillar. (3) Solves one pillar.

### 6.6 Chests & pages
| ID | Where | Image | Caption |
|---|---|---|---|
| C1.1 | Voyage Office | `01-tour-the-app/assets/app-new-page.webp` | **New** is the landing view: start a chat, pick a project, choose a mode & model. |
| C1.2 | Bounty Board | `01-tour-the-app/assets/app-pull-requests-page.webp`, `app-issues-page.webp` | **Pull requests** and **Issues** list the items that involve you, with tabs to filter them. |
| C1.3 | Clock Tower | `01-tour-the-app/assets/app-automations-page.webp` | **Automations** saves agent tasks to run manually, on a schedule, or from events. |
| C1.4 | Tavern cellar | `01-tour-the-app/assets/app-quick-chat.webp` | Start a chat with **+** next to **Projects**, then **Chat**. The project picker shows **Chat**. |
| C1.5 | Archive vault | `01-tour-the-app/assets/app-settings.webp` | **Settings** holds General, Accounts, Sessions, Themes, Accessibility and more. |
| C1.6 | Workshop | `01-tour-the-app/assets/editor-vs-app.webp` | Use both. Switch when the job changes. |
| C1.7 | Academy | `01-tour-the-app/assets/session-mode-decision-ladder.webp` | Interactive, Plan, Autopilot, with more autonomy from left to right: pick the mode that fits the task. |
| C1.8 | Fountain | `01-tour-the-app/assets/producer-control-room-modes.webp` | A producer directs each take differently, and so do you. |

### 6.7 The Admiral's Exam (A1)
Nine items. Pass with all correct (retries allowed, hint tier 3 off). All six key takeaways are covered: takeaway 1 → #1, 2 → #2, 3 → #3, 4 → #5, 5 → #9, 6 → #6-7. The rest are extras.
1. **MC:** "When do you open the app instead of staying in your editor?" → *When agent work needs a clearer place to run and review.*
2. **MC:** "Can you open the project in VS Code from the app?" → *Yes, any time.*
3. **Matching:** New / Pull requests / Issues / Automations / Customize → their purposes.
4. **Scenario:** Which workspace should most project sessions use? → **New worktree**.
5. **Scenario (3 tasks → Chat / Project session / Automation):**
   - "Brainstorm when to use a monorepo, with no repository involved" → **Chat session**
   - "Fix the unread-count bug in `samples/book-app-web` and open a PR" → **Project session**
   - "Every Monday, summarize open pull requests without retyping the prompt" → **Automation**
6. **Trick MC:** "**Auto** in the model control means…" → *The app picks a model for your task* (**not** Autopilot).
7. **True/False:** "You can change the model and effort mid-session without changing the mode." → **True**.
8. **Hotspot `app-settings`:** "Where do you configure your own model providers?" → **Model providers** `[0.209,0.461,0.140,0.033]`.
9. **MC (modes):** "What do Interactive, Plan, and Autopilot change?" → *How much autonomy the agent has: step-by-step together, plan-then-approve, or end to end with minimal intervention.* Distractor: *"Which AI model answers."*

**Reward:** the **Seal of Meridian**, the Mole Lighthouse lights, +75 doubloons, and the **POC end card**: *"The fog lifts toward Thousand-Bough Isle… Coming soon."* The card has a button: **Continue learning: Chapter 02 ↗**.

---

## 7. Content, voice & art production

| Item | Estimate |
|---|---|
| Voiced lines | ~140 (Island 00) + ~210 (Island 01) + ~25 (intro/sea) + ~70 (parrot hints) ≈ **445 lines** |
| Voice audio size | ~6 s average × 445 at 32 kbps Opus ≈ **~11 MB downloaded** in total, loaded per island (~4-6 MB each). The repo stores two formats per line, but each client downloads exactly one |
| AI-painted portraits | 21 NPCs + parrot + player (m/f) |
| AI illustrations | Chart (2 islands + 6 silhouettes), 2 loading paintings, Logbook ornaments, the POC end card |
| AI tileable textures | Thatch, sailcloth, terracotta, limestone, and plaster, then derived to PBR |
| CC0 3D | Quaternius Pirate Kit, Stylized Nature MegaKit, Universal Base Characters + Animation Library 1 & 2; Kenney Pirate Kit (fill-ins); ambientCG/Poly Haven PBR. **Re-read each kit's license file when it's vendored** |
| Custom/Blender | Stilt huts, crane, waterwheel, citadel modules, pillar banners, helms, the player's **brigantine**, restyle/atlas scripts |

- **Voice pipeline:** `tools/voice/generate.ts` reads dialogue YAML and builds SSML (voice + rate/pitch where supported). It calls Azure Speech with the `.env` credentials (local only), writes `voice/<island>/<lineId>.webm` (Opus) + `.m4a` (AAC), plus `.json` word/viseme timings. It caches by hash of text and voice, and loudness-normalizes to **−18 LUFS**. At runtime the client picks **one** format via `canPlayType` (Opus first, AAC fallback). Generated files are committed to the repo directly (no LFS).
- **Provenance:** `ART_PROVENANCE.md` (AI art) and `CREDITS.md`. The credits include:
  - the course content & screenshots, with the **full MIT copyright line and permission notice** from the course `LICENSE` (not just "MIT License")
  - the CC0 kits (a courtesy, since it isn't required)
  - **"Voices are synthetic, generated with Azure AI Speech"** (no implication that they're human actors)
  - the affiliation line (§10)
- **Brand rule:** screenshots stay as screenshots. We **never model or generate the Octocat or the Copilot logo**.
- **Before the first public deploy:** check the current Azure Speech terms for redistributing neural and Dragon HD audio.

---

## 8. Performance plan for these islands (PLAN §12 applied)

| Scene | Main cost | Tactics |
|---|---|---|
| Anchorage Cay | Water + palms + grass | Polar-grid ocean (Low/Lite: 3 waves, hull smear or none). **Lagoon mirror only while the lagoon is on screen (High/Ultra)**. Caustics and foam behind distance branches. **Instanced** palms (3 variants) and grass with shared-wind sway. One merged static chunk per village cluster. Cached static shadows. Beyond 350 m: impostors |
| Open Sea | Water + sky + distant islands | Wave octaves fade with distance. Islands become silhouettes. Clouds render at ¼ resolution on alternate frames |
| Port Meridian | Town draw calls + harbor mirror | **Atlased building kit** (2 materials). Merged static geometry per terrace chunk. **Zones & portals** for the Citadel interior. The harbor mirror excludes the town's small props and NPCs, and turns off once you're up the hill. NPCs off-screen don't animate. Small props cull at 60 m |
| Dialogue | DOF + portrait | DOF only on High+. Scene resolution scales down during long dialogue if frame time rises |
| Menus/Chart/Logbook | None | A single blurred frame; the 3D loop is paused |

**Physics & movement split:**
- **Rapier** provides only **primitive static colliders** (boxes, capsules, a heightfield, with **no triangle-mesh colliders** across the town), scene queries, and the **kinematic character controller**.
- **There are no dynamic rigid bodies in the POC.**
- **Push crates** (P1.1) are **grid logic**, with no physics.
- The **boat** is a kinematic hull driven by **analytic Gerstner buoyancy**. The CPU evaluates the same wave function as the shader at a few hull sample points. There's no GPU readback and no Rapier body.
- Phase 0 measures physics time, and it moves to a worker only if it misses the §12.1 budget.

**Water reflection (tiered, PLAN §12.5):** everywhere, the water samples a **prefiltered (PMREM) sky environment map** plus a sun-glint term, with no second scene render. On **High/Ultra only**, while the **Anchorage lagoon** or the **Port Meridian inner basin** is on screen, a half-res, layer-culled, cheap-path **planar mirror** is added within a ≤ 35% budget of the main pass.

**Benchmark flythrough** (built in Phase 0, then extended here): Anchorage beach → village → crane → sail → Meridian quay → market → citadel interior. **Pass criteria** are the §12.1 High-tier and Low-tier budgets.

---

## 9. Acceptance criteria (POC)

- [ ] Every row in §1's matrix is taught, practiced, and assessed as listed.
- [ ] Every teaching line and Logbook page links to the correct course section.
- [ ] All hotspot quizzes use masked images where callouts exist, no mask overlaps a target rect (checked by the Hotspot Editor), and each quiz has a keyboard alternative.
- [ ] Voice plays for every scripted line, with synced subtitles and working lip sync or jaw fallback. The voice-off setting works.
- [ ] Each place's music track plays and crossfades when you arrive, with ducking under voice.
- [ ] **First landfall** on each island plays its flyover once (sea → ship → island → behind the captain) with a letterboxed title card, then Wingman's welcome. E, moving, or Skip skips it, and reduced motion shows only the card. It's warmed while loading, so the hitch guard stays empty in flight (`src/game/arrivals.ts`). Anchorage is done; Meridian adds its own keys.
- [ ] The chart supports sail-to and fast travel. Free explore can enter Anchorage Cay and Port Meridian in either order, and 02-07 are visible but can't be entered.
- [ ] Save/continue works across reloads, puzzles restore to their checkpoints, and export/import works.
- [ ] Each tier holds its §12.1 target (**Low 30 fps on the emulated UHD 620 floor**, Medium 45-60 fps on emulated Iris Xe/M1, High 60 fps). The **Lite** preset holds 30 fps on the emulated Chromebook profile, and there are no frame spikes over 50 ms during streaming.
- [ ] **Tablets:** Anchorage and Port Meridian are fully playable with touch on a **cloud iPad (A13+)**, including hotspot quizzes, push-block puzzles, sailing, and the Chart. The Android tablet pass is Phase 1b.
- [ ] **2D Chart & Logbook proof slice:** it runs automatically when WebGL2 or hardware acceleration is missing (and on request in Settings), and covers the **title → Chart, Q0.2 (dialogue, voice, pages), H0.2, and P0.1**. Full 2D coverage of every objective is **Phase 1b**.
- [ ] The title (PLAN §13.5 contents, no island mesh) stays within **≤ 4 MB wire**. Loader art appears in ≤ 0.5 s, and the **title is interactive in ≤ 5 s on High / ≤ 10 s on the emulated Low floor**.
- [ ] **Modular loading (PLAN §13):** code chunks and island/zone packs load on demand. First playable is ≤ 14 MB wire, and **≤ 10 s High / ≤ 20 s Low time-to-interactive**, even with every cinematic skipped. The Open Sea passage finishes Port Meridian's prefetch before arrival at 25 Mbps. Fast travel takes ≤ 2 s when cached. Throttled Playwright tests assert all of these.
- [ ] The Appendix A exit quiz is implemented with hints off.
- [ ] No API keys appear in the build output. A CI grep checks for key-like strings.
- [ ] Credits include the course's full MIT notice, the CC0 kits, and the synthetic-voice disclosure.
- [ ] **Deploy gate:** the affiliation line is decided and the Azure Speech terms are checked before the first public GitHub Pages deploy.

---

## 10. Open items (defaults are chosen so the build isn't blocked)

| Item | Default |
|---|---|
| Parrot name | **Wingman** (a co-pilot joke) |
| NPC names & voices | As listed. We'll audition in Phase 0 |
| First mate "Juno" as the voice of the agent crew | Yes |
| The optional Whispering Gallery | Included, with no real microphone access |
| Sail palettes | 6 palettes named after the app's themes, as the course's first-run picker showed them (GitHub is still the default in **Settings → General → Current theme**). App 1.1.25 dropped that step, so Nell points you to **Settings → Themes** |
| **Affiliation line** (title + credits) | **Your decision, required before the first public deploy.** For example "Unofficial fan project. Not affiliated with GitHub." if it's a community project, or official wording if it becomes an official GitHub/Microsoft project. It doesn't block Phase 0 |

---

## Appendix A: Exit quiz (10 questions, hints off)

This is optional for players but required for the POC success measure (§0). It draws only from Ch 00/01 objectives, and none of its items repeat a Trial or Exam item word for word.

1. **MC:** You want your *own* copy of the course repository on GitHub. What do you create? → **A fork**.
2. **Hotspot `app-add-project` (masked):** "Show where you'd clone a repository from its URL." → **Clone repository**.
3. **Scenario:** Your company uses Copilot Business and you can't sign in to the app, but Copilot CLI works fine. What's the likely cause? → *The **GitHub Copilot app** policy is disabled. It's separate from the CLI policy.*
4. **MC:** Where do you run `node .github/scripts/setup-training-scenarios.js --dry-run`? → *In the app's **Terminal** tab, from the repository root.*
5. **MC:** Why run `--dry-run` before `--yes`? → *To preview the changes and confirm the `Repository:` line is your fork.*
6. **Hotspot `app-new-page`:** "Where do you find the issues assigned to you?" → **Issues**.
7. **Scenario:** "Explain what a pull request is, in general. No repo needed." Chat or project session? → **Chat session**.
8. **Scenario:** A multi-file change where the initial approach matters, and you want to approve it before any edits. Which mode? → **Plan**.
9. **MC:** Which control changes how long a supported model reasons? → **Effort (reasoning effort)**, in the model control below the prompt box.
10. **MC:** Where do you connect your own model provider's API keys? → **Settings → Model providers**.
