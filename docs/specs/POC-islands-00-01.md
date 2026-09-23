# Spec: Proof of Concept, Islands 00 & 01 (v0.1 draft)

> Companion to [`docs/PLAN.md`](../PLAN.md). This spec defines everything needed to play **title → character creation → Anchorage Cay (Ch 00) → Open Sea → Port Meridian (Ch 01)**.
> Course source: `github/copilot-app-for-beginners` @ `360fcb2` (local: `~/Desktop/projects/copilot-app-for-beginners`).
> Hotspot coordinates are **normalized (0-1)** and **approximate**. They'll be finalized in the Hotspot Editor.

---

## 0. Scope & success

**In scope:** title/menus, character creation, intro, the dialogue/voice system, Logbook, all quiz types, the puzzle pieces used here, Captain's Chart + fast travel, settings, save, procedural music and ambience, Island 00, the sea passage, and Island 01.
**Out of scope:** Islands 02-07 (they appear on the chart as fogged silhouettes marked "Coming soon"), the cosmetics shop (doubloons are collected, but the shop is stubbed), and the Master Captain certificate.

**The POC succeeds if:**
1. A first-time player finishes both islands in **~45-55 min** without outside help.
2. Afterwards they can answer every Ch 00/01 learning objective. We'll measure this with an optional 10-question exit quiz.
3. It hits the **High-tier budgets in PLAN §12** on an M1/M2 MacBook Air and the **Low tier** on Intel Iris Xe.
4. You look at it and say *"that's beautiful."*

---

## 1. Learning coverage matrix

Every course objective is **taught** (by an NPC or a Logbook page), **practiced** (in a puzzle or interaction), and **assessed** (in a quiz). IDs refer to the sections below.

### Chapter 00: Setup
| Course objective / section | Taught | Practiced | Assessed |
|---|---|---|---|
| Prerequisites (GitHub account, Copilot plan *or* own model provider, Business/Enterprise **GitHub Copilot app** policy, Git, Node LTS, `gh`) | Nell (Q0.2) | Gear Check (Q0.5) | T0 #6 |
| Install → **Sign in to GitHub** → skip **Connect your repositories** → pick theme → **Finish** → **New** page | Nell (Q0.2), C0.1-C0.3 | Paint Your Sails | H0.1, T0 #1 |
| Fork = your own copy | Ezra (Q0.3) | Copy the Master Chart | T0 #2 |
| **+** next to **Projects** → **Add GitHub repository**; alternatives **Open folder** / **Clone repository** | Ezra (Q0.3), C0.4 | Moor Your Ship | H0.2, H0.3, MC0.1 |
| Start a project session; workspace selector → **Local repository** (not **New worktree**) for setup | Bo (Q0.4) | Your Own Deck | H0.4 |
| **View → Toggle Review Panel** → **Terminal** tab; version checks; install only what's missing | Bo (Q0.5) | Gear Rack | M0.1 |
| `gh auth status` / `gh auth login` (GitHub.com → Login with a web browser) | Bo (Q0.5) | Right Signature | S0.1 |
| Enable workflows on a fork (**Actions** tab) | Suri (Q0.6) | P0.1 Sluice | T0 #4 |
| Setup script: labels, issues, practice branches, PRs; bugs stay off `main`; `--dry-run`, check the `Repository:` line, then `--yes`, wait for `Setup complete.` | Pim & Pol (Q0.7) | **P0.2 Dry-Run Crane** | T0 #3, #5, #7 |
| First prompt goes to the **Copilot app** prompt box, *not* Terminal | Juno (Q0.8) | Speaking Tube | S0.2 |
| Troubleshooting (sign-in, can't see repo, org fork, Issues disabled) | Bottles B0.1-B0.3 | | T0 #8 |
| Studio analogy: soundcheck | Lyra (Q0.9), C0.5 | | |
| Key takeaways (3) | Trial wrap-up | | T0 |

### Chapter 01: Tour the App
| Course objective / section | Taught | Practiced | Assessed |
|---|---|---|---|
| Why the app: 4 challenges → what the app adds; it isn't a replacement for your editor or "multi-project support" | Tobias (Q1.2) | Scattered Evidence | M1.1 |
| Keep your editor; open in VS Code any time ("Use both") | Gideon (Q1.3), C1.6 | | S1.1 |
| Sidebar: **New**, **My work**, **Automations**, **Customize**, **Projects & Chats** | Districts (Q1.4), C1.1-C1.3 | Harbor Passport | H1.1 (×4), H1.2 |
| Chat session vs Project session (branch/worktree?) | Marisol & Anders (Q1.5) | **P1.1 Tavern or Shipyard** | H1.3, H1.4, A1 #5 |
| Project sessions use **New worktree** by default; the Ch 00 session was the exception | Anders (Q1.5) | | A1 #4 |
| Modes: **Interactive / Plan / Autopilot** ("options, not levels to unlock") | Rhea (Q1.6), C1.7 | **P1.2 Three Helms** | S1.2 |
| **Model** & **Reasoning effort**; **Auto** ≠ **Autopilot**; you can change the model mid-session without changing the mode | Oren (Q1.7) | Star Charts | H1.5, S1.3, A1 #6-7 |
| Settings sections (9) & what **Model providers** does | Pell (Q1.8), C1.5 | **P1.3 Banners of the Hall** | H1.6, A1 #8 |
| Voice dictation (optional) | Whispering Gallery (Q1.9) | | O1.1 (optional) |
| Studio analogy: control room | Lyra (Q1.10), C1.8 | | |
| Key takeaways (6) | Admiral (Q1.11) | | A1 |

---

## 2. Player journey

```
Boot ─▶ Title (live 3D) ─▶ New Voyage ─▶ Character Creation ─▶ Intro (45s, skippable)
  ─▶ Anchorage Cay (~20 min) ─▶ Christening & Set Sail ─▶ Open Sea (~3 min)
  ─▶ Port Meridian (~28 min) ─▶ Lighthouse lit ─▶ POC end card (links to Chapter 02)
```

**Intro (voiced narrator, `en-GB-Ollie` HD):** Ink draws the archipelago onto the chart while fog rolls in. *"They call it the fog of scattered evidence: plans in one place, changes in another, and nobody quite sure where they left off…"* Then a rowboat glides into Anchorage Cay's lagoon at dawn, and a parrot lands on your shoulder.

---

## 3. Shared systems (POC requirements)

### 3.1 Title & menus
- **Title backdrop:** the real Anchorage Cay scene (with no extra assets). Your sloop sits at anchor at golden hour, the camera orbits slowly, gulls circle, and the logo fades in using Fraunces at weight 300 with generous letter-spacing.
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
| Action | Keyboard/Mouse | Gamepad |
|---|---|---|
| Move / look | WASD / mouse (pointer lock) | LS / RS |
| Sprint / jump | Shift / Space | LS-click / A |
| Interact / advance dialogue | E / Left-click | X |
| Parrot hint | Q | Y |
| Logbook / Chart / Pause | J / M / Esc | View / Map (d-pad ↑) / Menu |
| **Sailing:** trim sails (furled · half · full) | W / S | RT / LT |
| **Sailing:** rudder / helm camera / leave helm | A-D / C / E (at a dock) | LS / RS-click / B |

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
    show: { image: ch00/sign-in-to-app, caption: "Select Sign in to GitHub" }
  - choice:
      - { text: "What if my company manages my account?", goto: nell.policy }
      - { text: "Let's get signed in.", goto: nell.h0-1 }
```

### 3.5 Logbook (J)
- **Tabs:** Quests · Pages · Glossary · Crew · Songbook.
- **Pages** come from chests and NPCs. Each has a title, the image, a 1-3 sentence caption in plain words, and an **"Open in the course ↗"** link to the exact chapter section on GitHub.
- The **Glossary** fills in as terms are taught (fork, project session, worktree, mode, model, reasoning effort…).
- The **Songbook** plays each unlocked island theme. The procedural composer renders it live.

### 3.6 Quiz system
| Type | Behavior |
|---|---|
| **Multiple choice** / **multi-select** | 2-5 options, keys 1-5 |
| **Hotspot** | A large framed screenshot. Click to place a marker, hold **Shift** for a 2× magnifier lens. **Callout masking** patches over the course's red ①② badges with sampled background color, so the answer isn't given away. Accessible alternative: **Tab** cycles through candidate regions (correct ones + distractors) and **Enter** selects |
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
- **Free explore** (Settings): every island is selectable, including skipping straight to Port Meridian. In the POC, 02-07 show "Coming soon."

### 3.9 Save (localStorage, versioned)
- **Autosaves** on every quest step, chest, puzzle, quiz pass, docking, and fast travel.
- **Schema:** `{ v, created, character, settings, island, position, quests{}, chests[], pages[], glossary[], quizzes{id:{firstTry,attempts}}, doubloons, seals[], lighthouses[] }`.
- "Begin anew" asks for confirmation. Export/import works as a base64 code.

### 3.10 Settings (POC)
- **Graphics:** preset (auto-benchmarked) + render scale, shadows, water, vegetation density, post FX, FPS cap, perf HUD.
- **Audio:** Master, Music, Ambience, SFX, Voice, UI.
- **Gameplay:** **Free explore**, hint frequency, camera sensitivity, invert Y, FOV, camera shake, head bob, voice on/off.
- **Accessibility:** text size (90-150%), subtitle background opacity, high-contrast UI, dyslexia-friendly font, reduced motion.

### 3.11 Wingman the parrot *(placeholder name)*
- **Q** gives a hint. There are **3 tiers per beat**: a nudge, a direction, then the answer with its explanation.
- He also gives a short recap after each quest step and occasional ambient quips (throttled, and they respect the hint-frequency setting).
- **Voice:** `en-US-AnaNeural` (bright) + pitch +20% + light formant/high-pass FX. We'll audition this.

---

## 4. Island 00: Anchorage Cay (Chapter 00 · Setup)

### 4.1 Art & mood
- **Shape:** a crescent of about 350 × 180 m around a shallow turquoise lagoon, with a small forested hill and a waterfall in the middle.
- **Light:** dawn to early morning, sun elevation 12° → 25°, warm key light with cool sky fill. Fair-weather cumulus drift from the SW.
- **Palette:** lagoon `#3FD0C9`, deep `#0F5A7A`, sand `#F3E6C8`, palm `#3E8E4E`, driftwood `#9A7B5B`, sun-bleached canvas `#EFE7D6`.
- **Horizon:** **Port Meridian's citadel is faintly visible to the NE** (your next goal), and a volcanic silhouette sits far to the E (a nod to Tidewheel Caldera).
- **Ambient life:** gulls, scuttling crabs, lagoon fish, butterflies, palm rustle, surf on the reef.
- **Music (procedural):** major pentatonic at ~84 bpm, with marimba ostinato, steel-pan, and ukulele pluck.

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
| **Nell Tidewell** | Harbormaster · warm, brisk | C | `en-GB-Ada` HD | Prereqs, sign-in, theme |
| **Ezra Quill** | Chartmaker · meticulous, dry wit | D | `en-US-Andrew` HD | Fork, add a project |
| **Bo Marlin** | Quartermaster · hearty | E | `en-GB-RyanNeural` | Project session, Local repository, Terminal, tools, `gh` |
| **Suri Okoye** | Millwright · practical | F | `en-US-JennyNeural` | Enable workflows |
| **Pim & Pol** | Crane twins · finish each other's sentences | G | `en-IE-ConnorNeural` / `en-IE-EmilyNeural` | Setup script, dry-run |
| **Juno** | Your first mate (crew lead = agents) · calm, precise | H (ship) | `en-US-Ava` HD | First prompt & expected output |
| **Lyra Wren** | Wandering Bard · wistful | K | `en-GB-SoniaNeural` | Studio analogy |
| Villagers ×6 | Short voiced barks | B | assorted | Flavor |

### 4.4 Quest flow
Each step autosaves. **[C#]** marks a chest and **[P]** a Logbook page.

**Q0.1 · Landfall (tutorial, ~1 min).** You step onto the beach and learn movement, camera, and interaction. Wingman introduces himself: *"First mate's job is hints. Captain's job is decisions."* Nell waves you toward the pier.

**Q0.2 · Captain's Papers** *(00 · Prerequisites, Installation)*
- Nell covers the GitHub account, a Copilot plan *or* your own model provider, and says that for Business/Enterprise, the **GitHub Copilot app** policy must be enabled. **[P] "What you need."**
- The spyglass shows `sign-in-to-app`. **H0.1:** "Point to how you'd sign in with a regular GitHub account."
- She explains that at **Connect your repositories** you'll *continue without adding one*, because you'll connect your fork shortly.
- **Paint Your Sails:** a palette stand mirrors the app's theme picker (`pick-a-theme`). Your choice recolors your sails and persists. Nell adds: *"Preferences can be changed anytime from settings."* Then you select **Finish**, and the **New** page appears as a spyglass view (`github-copilot-app`).
- Rewards: **[C0.1]** sign-in, **[C0.2]** theme picker, **[C0.3]** the New page. You also get the key item *Captain's Papers*.

**Q0.3 · Copy the Master Chart** *(00 · Connect to your repository)*
- Ezra explains that a **fork** is *your own copy* of the course repository on GitHub. You hold E at the copy table and ink traces a fresh chart that has your name on the cartouche.
- **Moor Your Ship:** **H0.2** asks you to find the **+** next to **Projects**. **H0.3** asks you to pick **Add GitHub repository**. Then you "search for `copilot-app-for-beginners` and select your fork": the app clones it and adds the project to the sidebar. **[C0.4]**
- **MC0.1:** "You already have a local copy of your fork. Which option?" → **Open folder**. The explanation adds that **Clone repository** is for when you have the fork's URL.

**Q0.4 · Your Own Deck** *(00 · Check your tools, steps 1-3)*
- Bo confirms the project shows under **Projects**, then has you select **+ next to the project** to start a **project session**.
- **H0.4** uses `local-repository-workspace-selector` with the callouts masked: "For this one-time setup, where should the session run?" → **Local repository**.
- Explanations: **New worktree** "creates a separate copy for this session" (*"you'll meet those on Thousand-Bough Isle"*), and **Cloud** "runs in a cloud sandbox."

**Q0.5 · Gear Check & Right Signature** *(00 · Check your tools, steps 4-8)*
- Bo explains **View → Toggle Review Panel**, then the **Terminal** tab (if it isn't visible, **+ → Terminal**).
- You find four gear pieces around the village and set them on the **Gear Rack**: compass = `git --version`, lantern = `node -v`, rope coil = `npm -v`, spyglass = `gh --version`.
- Each piece prints a stylized terminal readout when you place it. **M0.1** matches gear ↔ command. Bo reminds you: *"Only install what's missing, then check again."*
- **Right Signature:** the ledger shows `gh auth status` as *Logged in as someone-else*. **S0.1:** what now? → `gh auth login` → **GitHub.com** → **Login with a web browser** → run `gh auth status` again and confirm.

**Q0.6 · Open the Sluice** *(00 · Add the course practice items, step 1)*. Suri explains: *"New forks switch workflows off. Turn them on so GitHub can run the automated checks for your practice exercises."* → **P0.1**.

**Q0.7 · The Dry-Run Crane** *(00 · Add the course practice items, steps 2-3)*
- Pim & Pol explain that the script stocks your ship with **labels** (colored pennants), **issues** (bounty notices), **practice branches** (practice hulls, *"the bugs stay on those, never on `main`"*), and **pull requests** (sealed inspection requests: changes to review, a feedback comment, and an intentionally failing check).
- *"They're training scenarios, not problems with your setup."* → **P0.2**.

**Q0.8 · First Words** *(00 · Your first prompt)*
- On your ship there are two pipes: the **Prompt Box** speaking tube (to the crew) and the **Terminal** hatch (to the engine room). **S0.2:** where does *"Give me an overview of the copilot-app-for-beginners course repository…"* go? → the **Prompt Box**.
- Juno replies with the expected output: the course structure, and `samples/book-app-web` as the web sample used in later exercises. **[P] "Your first prompt."**

**Q0.9 · Soundcheck (Bard, optional)** *(00 · What's Next)*
- Lyra: *"Before you record anything, you get the studio ready: sign in, plug in your gear, load the song, and run a soundcheck. You just did the sailor's version."*
- **[C0.5]** gives `studio-setup-soundcheck`, and the island theme unlocks in the Songbook.

**Q0.10 · The Harbormaster's Trial** at the Point Lighthouse. → §4.7.

**Message bottles (optional):**
- **B0.1** *I cannot sign in*: check the account, the plan or own model provider, and the org policy. If your org uses `*.ghe.com`, choose **Sign in to GitHub Enterprise Cloud**.
- **B0.2** *I cannot see the repository*: check access, the right account/org, or try **Open folder**.
- **B0.3** *The script stops for an organization fork*: use `--allow-shared-repository` **only** if you're authorized and the `Repository:` line is right. If issues are missing, go to **Settings → Features**, enable **Issues**, and rerun.

### 4.5 Puzzles

**P0.1 · Sluice & Waterwheel** (warm-up, ~2 min)
- A 3×4 grid of rotatable channel tiles runs between the waterfall ("Actions spring") and the waterwheel. You rotate tiles with E to connect a path. There's a single solution, and 2 dead-end tiles act as distractors.
- The final gate carries a painted sign: *"Workflows aren't being run on this forked repository."* Its lever reads **"I understand my workflows, go ahead and enable them."**
- **Solved:** water flows, the wheel turns, and lanterns across the village light up. This is a visual promise that "automation power" is now on.
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
| C0.1 | Harbormaster's desk | `00-setup/assets/sign-in-to-app.webp` | Open the app and select **Sign in to GitHub**. |
| C0.2 | Palette stand | `00-setup/assets/pick-a-theme.webp` | Pick a theme and select **Finish**. You can change it any time in settings. |
| C0.3 | Pier lookout | `assets/github-copilot-app.webp` | The **New** page is where work starts. |
| C0.4 | Chartmaker's loft | `00-setup/assets/app-add-project.webp` | **+** next to **Projects** → **Add GitHub repository** (or Clone repository / Open folder). |
| C0.5 | Bard's hammock | `00-setup/assets/studio-setup-soundcheck.webp` | Setting up the app is like prepping a studio before the first take. |
| C0.6 | Hidden cove (optional) | `00-setup/assets/local-repository-workspace-selector.webp` | **Local repository** works in the clone already on your machine. |

### 4.7 Quizzes
| ID | Type | Prompt → correct answer | Notes |
|---|---|---|---|
| H0.1 | Hotspot `sign-in-to-app` | "Sign in with a regular GitHub account" → **Sign in to GitHub** `[0.136,0.714,0.200,0.100]` | Distractor: Enterprise Cloud `[0.349,0.714,0.415,0.100]`. Explanation: that one's for `*.ghe.com` orgs |
| H0.2 | Hotspot `app-add-project` (masked) | "Where do you start adding a repository?" → **+ by Projects** `[0.218,0.322,0.026,0.044]` | See §3.6 YAML |
| H0.3 | Hotspot `app-add-project` (masked) | "Which option adds your fork from GitHub?" → **Add GitHub repository** `[0.223,0.441,0.228,0.043]` | Distractors: Chat `[0.223,0.381,0.228,0.041]`, Clone repository `[0.223,0.487,0.228,0.043]`, Open folder `[0.223,0.532,0.228,0.042]` |
| MC0.1 | MC | Local copy already → **Open folder** | Have the URL → Clone repository |
| H0.4 | Hotspot `local-repository-workspace-selector` (mask ① `[0.227,0.79,0.03,0.09]` ② `[0.414,0.40,0.026,0.10]`) | "Where should the setup session run?" → **Local repository** `[0.248,0.401,0.366,0.196]` | Explains New worktree / Cloud |
| M0.1 | Matching | compass→`git --version`, lantern→`node -v`, rope→`npm -v`, spyglass→`gh --version` | |
| S0.1 | Scenario | `gh auth status` shows the wrong account → **`gh auth login`, GitHub.com, web browser, re-check** | |
| S0.2 | Scenario | Where does the first prompt go? → **Copilot app prompt box** | Terminal is for commands |

**The Harbormaster's Trial (T0)** is 8 items. You pass when all 8 are correct (retries allowed). Stars are awarded for first-try accuracy.
1. **Ordering:** Sign in → Pick theme & Finish → Fork → **+ Projects → Add GitHub repository** → Project session on **Local repository** → **Toggle Review Panel → Terminal** → Version checks → `gh auth status` → Enable workflows → `--dry-run` → `--yes` → First prompt.
2. **MC:** "What is a fork?" → *Your own copy of the repository on GitHub.*
3. **Multi-select:** "What does the setup script create?" → labels, issues, practice branches, pull requests. Distractor: *"bugs on `main`."*
4. **MC:** "Why enable workflows on your fork?" → *So GitHub can run the automated checks for the practice exercises.*
5. **Scenario:** "The dry-run shows `Repository: someone-else/…`. What now?" → *Stop and point it at your fork before running `--yes`.*
6. **Multi-select:** prerequisites (GitHub account · Copilot plan **or** own model provider · Git · Node LTS · `gh`).
7. **MC:** "When is setup done?" → *When the terminal shows `Setup complete.`*
8. **Scenario:** "Practice issues weren't created." → *Enable **Issues** in the fork's **Settings → Features**, then rerun.*

**Reward:** the **Seal of Anchorage**, the Point Lighthouse lights (fast travel), +50 doubloons, and the chart reveals the route to Port Meridian.

### 4.8 Christening & Set Sail
Nell breaks a coconut on the bow, your sails show your chosen theme, and Juno reports, *"Crew's aboard, Captain."* The ship's name is your typed name + "'s Sloop" (editable). Wingman then runs a short sailing tutorial at the berth.

---

## 5. Open Sea passage (00 → 01)

- The trip is about 1.2 km: roughly 2.5 min at full sail and 4 min at half. A steady SW wind makes it a comfortable broad reach.
- **Buoys** mark the channel. The **citadel** grows on the horizon. Port Meridian's mountain ridge and the far ranges sit behind it.
- **Optional moments:** a dolphin pod rides the bow wave, there's a sea-stack arch to sail through (hidden achievement), and a floating bottle **B0.4** holds a teaser: *"Why a whole app? Ask the merchant in Port Meridian."*
- **Music:** the sailing theme, with pads that swell with the wave height, crossfades into the Port Meridian theme within 250 m of the harbor.
- **Streaming:** Port Meridian high-LOD loads during the sail (prefetch triggers as you leave the berth). Anchorage drops to medium LOD past 400 m and to a silhouette past 900 m.
- **Docking:** once you're within 25 m of the harbor berth below half speed, a soft auto-assist docks you and you step onto the quay.

---

## 6. Island 01: Port Meridian (Chapter 01 · Tour the App)

### 6.1 Art & mood
- **Shape:** roughly 700 × 450 m. Terraced hillside town above a walled harbor, a **mole with a lighthouse**, and the **citadel** on the summit. A mountain ridge sits behind with far ranges beyond.
- **Light:** late-afternoon **golden hour** with the sun at 18°, long shadows, and warm god rays through the streets.
- **Palette:** terracotta `#C8643B`, limestone `#E9DCC3`, bougainvillea `#C2306B`, cypress `#2F4F3A`, sea teal `#2BB3B1`, banners in deep blue `#1F3A6B` and gold `#E8C88A`.
- **Vegetation:** palms along the quay, cypress and olive on the terraces, bougainvillea on the walls.
- **Ambient life:** market murmur, church-bell-style chimes on the quarter hour (from the Clock Tower), pigeons, a harbor cat, flags snapping.
- **Music (procedural):** Ionian ↔ Dorian at ~76 bpm, with lute, recorder, harp arpeggios, and soft strings. It uses the same layer system as Anchorage Cay. The Trial layer adds low timpani rolls.
- **Efficiency:** the town is split into **chunked zones**. The Citadel hall is an interior zone behind a portal. See §8.

### 6.2 Layout
```
                          [K] CITADEL · Hall of Records ⛫   [L] Admiral's Terrace
                          [K2] Whispering Gallery (opt.)
           [J] Observatory ◔          terraces ▤▤▤▤
      [I] Naval Academy (3 helms) ══ harbor inner basin ══
  [G] Royal Shipyard ⚒     [D] Clock Tower ⏲      [E] Outfitter ⌂
  [H] Carpenter's Workshop  [C] Market Sq · Bounty Board ▦    [F] The Quick Chat Tavern 🍺
        [B] Harbor Plaza · Voyage Office ⌂ · [M] Bard at the fountain
  ════ quay ════ [A] Arrival berth ════ mole ════════ ◉ Mole Lighthouse
```

### 6.3 Cast
| NPC | Role | Location | Voice *(proposed)* | Teaches |
|---|---|---|---|---|
| **Admiral Isadora Vale** | Governor, gives the Trial | L | `en-GB-Ada` HD *(alt. `en-GB-LibbyNeural`)* | Summons, key takeaways |
| **Tobias Finch** | Merchant, scattered evidence | B | `en-GB-Ollie` HD | Why the app |
| **Gideon Hart** | Carpenter (your editor) | H | `en-US-DavisNeural` | Use both |
| **Mina Sol** | Voyage clerk | B | `en-US-EmmaNeural` | **New** |
| **Rourke** | Bounty keeper | C | `en-AU-WilliamNeural` | **My work** |
| **Hollis** | Clockkeeper | D | `en-GB-ThomasNeural` | **Automations** (teaser) |
| **Dee Castellan** | Outfitter | E | `en-US-AriaNeural` | **Customize** (teaser) |
| **Marisol** | Tavern keeper | F | `en-US-JaneNeural` | Chat sessions |
| **Anders Holm** | Shipwright | G | `en-US-GuyNeural` | Project sessions / New worktree |
| **Captain Rhea Storm** | Academy master | I | `en-US-NancyNeural` *(Juno already uses Ava on this island)* | Modes |
| **Oren Vey** | Astronomer | J | `en-US-Andrew` HD *(alt. `en-US-BrianNeural`)* | Model & reasoning effort |
| **Archivist Pell** | Keeper of records | K | `en-GB-NoahNeural` | Settings |
| **Lyra Wren** | Wandering Bard (traveled on ahead) | M | `en-GB-SoniaNeural` | Control-room analogy |

> Casting rule: no two NPCs on the same island share a voice. HD voices are reserved for the 3-4 most-heard characters per island. We'll audition in Phase 0.

### 6.4 Quest flow

**Q1.1 · The Admiral's Summons.** A herald meets you on the quay with a sealed letter: *"Learn the town, prove you can command, and the Seal of Meridian is yours."* Quest tracker: **Harbor Passport** (5 stamps) + **Three Helms** + **Observatory** + **Hall of Records** → Admiral.

**Q1.2 · The Scattered Evidence** *(01 · Why use the GitHub Copilot app?)*
- Tobias's voyage records are scattered across town: the **plan** at the tavern, the **diff** at the shipyard, the **tests** at the fort steps, and the **PR** at the post box. Collecting each item shows its **challenge card** (Shared working copy · Scattered evidence · Explore vs change · Repeat work).
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
- **Voyage Office = New:** the landing view. Start a chat without a project, pick a connected project, choose mode & model, or use a sample idea (the posters show *"Build a personal landing page with dark mode"* and others). **[C1.1]** `app-new-page`.
- **Bounty Board = My work:** your GitHub inbox for issues, PRs, and review requests, where you can start work on an item. **The notices are the practice items you loaded on Anchorage Cay**, like *Make search case-insensitive #1* and *Failing stats check practice #7*. **[C1.2]** `app-my-work-page`. Optional **H1.2:** "Click the pull request whose automated check **failed**" → row #7 `[0.207,0.356,0.793,0.053]`.
- **Clock Tower = Automations:** recurring agent tasks. Templates run manually or daily/weekly, events can trigger them, and you choose local or cloud. *"Tidewheel Caldera's clockmakers will teach you properly."* **[C1.3]** `app-automations-page`.
- **Outfitter = Customize:** skills, MCP servers, plugins, and extensions. *"You don't need any of it yet. Guildcrest, Sunspire Sands, and Inkwell Bluffs will kit you out."*
- **Tavern & Shipyard = Projects and chats:** covered in Q1.5.
- **Passport review, H1.1** (4 quick hotspots on `app-new-page`, no masking needed): **New** `[0.006,0.063,0.170,0.037]` · **My work** `[0.006,0.100,0.170,0.037]` · **Automations** `[0.006,0.137,0.170,0.037]` · **Customize** `[0.006,0.174,0.170,0.037]`.

**Q1.5 · A Word at the Tavern, Work at the Shipyard** *(01 · Projects and chats, Chat sessions, Project sessions)*
- Marisol: *"A chat is like asking a musician a quick question."* Chats are for learning and brainstorming, and they don't create a branch or worktree.
  - **H1.3** on `app-quick-chat` (masked ① `[0.111,0.248,0.028,0.05]`, ② `[0.408,0.524,0.029,0.05]`): "Start a new quick chat" → **the Chats row** (the + appears on hover) `[0.011,0.264,0.168,0.033]`.
  - **H1.4:** "Confirm Chat is selected" → **the project picker below the prompt** `[0.347,0.537,0.040,0.031]`. **[C1.4]**
- Anders at the Shipyard: use a **project session** when the agent needs repository context, has to change code, or must create an artifact such as a PR. Project sessions use **New worktree** by default. *"Your Anchorage setup used Local repository on purpose. That was the exception."*
- Then **P1.1**.

**Q1.6 · The Three Helms** *(01 · From the Studio: In the Control Room, Modes)*
- Rhea stands before **three helms side by side, all on the same level**. The subtle message is that these are *options, not levels to unlock*.
- *"Interactive is directing a take with frequent check-ins. Plan is charting the arrangement and approving it before the first take. Autopilot is handing a clearly defined task to a trusted crew."*
- → **P1.2**, then **S1.2**. **[C1.7]** `session-mode-decision-ladder`.

**Q1.7 · The Navigator's Observatory** *(01 · Models and reasoning effort)*
- Oren: the **Model** is *which navigator you consult* (they differ in capability, speed, and usage cost). **Reasoning effort** is *how long they study the charts*: higher can help on hard problems but takes longer, and it doesn't guarantee a correct answer.
- **Where to find it:** below the prompt box, next to the mode selector. It shows **Auto** or a model name, and opening it reveals **Model** and **Effort**. Some app versions show separate controls.
- **H1.5** on `app-new-page`: "Click the model control" → `[0.414,0.491,0.089,0.029]`. Distractor: the mode selector "Interactive" `[0.365,0.491,0.049,0.029]`.
- **Star Charts (S1.3):** three telescopes, three tasks:
  - Repo tour → keep **Auto**/default effort.
  - Tricky bug across several files → **a complex-coding model + higher effort**.
  - Quick explanation → default.
- **Try it:** you ask the crew (Juno, via the speaking tube) how `filterBooks` searches. They answer that it matches titles and authors without depending on letter case, see `samples/book-app-web/src/App.tsx`, and no files change.

**Q1.8 · The Hall of Records** *(01 · Settings)*. Pell's hall has **9 alcoves**, one per settings area: General, Accounts, Sessions, Themes, Accessibility, Voice dictation, Customize, Model providers, Experimental. → **P1.3**, then **H1.6** on `app-settings`: "Where would you set **app-wide instructions**?" → **Sessions** `[0.209,0.258,0.140,0.033]`. Pell adds: *"Model providers connects extra providers with your own keys. It doesn't replace the model picker below the prompt box."* **[C1.5]**

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
3. **Autopilot · Supply Run:** a clear, well-defined outcome (deliver 3 crates to the mole). Set the destination and let the trusted helmsman sail. You can **interrupt** at any time, and the voyage finishes with minimal intervention.

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
| C1.2 | Bounty Board | `01-tour-the-app/assets/app-my-work-page.webp` | **My work** is your GitHub inbox for issues, PRs & review requests. |
| C1.3 | Clock Tower | `01-tour-the-app/assets/app-automations-page.webp` | **Automations** saves agent tasks to run manually, on a schedule, or from events. |
| C1.4 | Tavern cellar | `01-tour-the-app/assets/app-quick-chat.webp` | Start a quick chat from **Chats**. Keep **Chat** selected in the project picker. |
| C1.5 | Archive vault | `01-tour-the-app/assets/app-settings.webp` | **Settings** holds General, Accounts, Sessions, Themes, Accessibility and more. |
| C1.6 | Workshop | `01-tour-the-app/assets/editor-vs-app.webp` | Use both. Switch when the job changes. |
| C1.7 | Academy | `01-tour-the-app/assets/session-mode-decision-ladder.webp` | Interactive, Plan, Autopilot: choose a mode for the task. |
| C1.8 | Fountain | `01-tour-the-app/assets/producer-control-room-modes.webp` | A producer directs each take differently, and so do you. |

### 6.7 The Admiral's Exam (A1)
Eight items. Pass with all correct (retries allowed). One item per key takeaway, plus extras.
1. **MC:** "When do you open the app instead of staying in your editor?" → *When agent work needs a clearer place to run and review.*
2. **MC:** "Can you open the project in VS Code from the app?" → *Yes, any time.*
3. **Matching:** New / My work / Automations / Customize → their purposes.
4. **Scenario:** "Your first project session, fresh." Which workspace by default? → **New worktree**.
5. **Scenario:** 3 tasks → Chat / Project session / Automation.
6. **Trick MC:** "**Auto** in the model control means…" → *The app picks a model for your task* (**not** Autopilot).
7. **True/False:** "You can change the model and effort mid-session without changing the mode." → **True**.
8. **Hotspot `app-settings`:** "Where do you configure your own model providers?" → **Model providers** `[0.209,0.461,0.140,0.033]`.

**Reward:** the **Seal of Meridian**, the Mole Lighthouse lights, +75 doubloons, and the **POC end card**: *"The fog lifts toward Thousand-Bough Isle… Coming soon."* The card has a button: **Continue learning: Chapter 02 ↗**.

---

## 7. Content, voice & art production

| Item | Estimate |
|---|---|
| Voiced lines | ~140 (Island 00) + ~210 (Island 01) + ~25 (intro/sea) + ~70 (parrot hints) ≈ **445 lines** |
| Voice audio size | ~6 s average × 445 at 32 kbps Opus ≈ **~11 MB** total, loaded per island (~4-6 MB each) |
| AI-painted portraits | 21 NPCs + parrot + player (m/f) |
| AI illustrations | Chart (2 islands + 6 silhouettes), 2 loading paintings, Logbook ornaments, the POC end card |
| AI tileable textures | Thatch, sailcloth, terracotta, limestone, and plaster, then derived to PBR |
| CC0 3D | Quaternius Pirate Kit, Stylized Nature MegaKit, Universal Base Characters + Animation Library 1 & 2; Kenney Pirate Kit (fill-ins); ambientCG/Poly Haven PBR |
| Custom/Blender | Stilt huts, crane, waterwheel, citadel modules, pillar banners, helms, restyle/atlas scripts |

- **Voice pipeline:** `tools/voice/generate.ts` reads dialogue YAML and builds SSML (voice + rate/pitch where supported). It calls Azure Speech with the `.env` credentials (local only), writes `voice/<island>/<lineId>.opus` + `.m4a`, plus `.json` word/viseme timings. It caches by hash of text and voice, and loudness-normalizes to **−18 LUFS**.
- **Provenance:** `ART_PROVENANCE.md` (AI art) and `CREDITS.md`. Credits cover the CC0 kits (a courtesy, since it isn't required), the course content & screenshots (**© GitHub, MIT License**), and the Azure TTS voices.

---

## 8. Performance plan for these islands (PLAN §12 applied)

| Scene | Main cost | Tactics |
|---|---|---|
| Anchorage Cay | Water + palms + grass | Clipmap ocean. **Instanced** palms (3 variants) and grass with vertex wind. One merged static chunk per village cluster. Beyond 350 m: impostors |
| Open Sea | Water + sky + distant islands | Wave octaves fade with distance. Islands become silhouettes. Clouds render at ¼ resolution on alternate frames |
| Port Meridian | Town draw calls | **Atlased building kit** (2 materials). Merged static geometry per terrace chunk. **Zones & portals** for the Citadel interior. NPCs off-screen don't animate. Small props cull at 60 m |
| Dialogue | DOF + portrait | DOF only on High+. Scene resolution scales down during long dialogue if frame time rises |
| Menus/Chart/Logbook | None | A single blurred frame; the 3D loop is paused |

**Benchmark flythrough** (built in Phase 0, then extended here): Anchorage beach → village → crane → sail → Meridian quay → market → citadel interior. **Pass criteria** are the §12.1 High-tier and Low-tier budgets.

---

## 9. Acceptance criteria (POC)

- [ ] Every row in §1's matrix is taught, practiced, and assessed as listed.
- [ ] Every teaching line and Logbook page links to the correct course section.
- [ ] All hotspot quizzes use masked images where callouts exist, and each has a keyboard alternative.
- [ ] Voice plays for every scripted line, with synced subtitles and working lip sync or jaw fallback. The voice-off setting works.
- [ ] Procedural music plays per island with adaptive layers, beat-quantized stingers, and ducking under voice.
- [ ] The chart supports sail-to and fast travel, and Free explore unlocks Port Meridian immediately.
- [ ] Save/continue works across reloads, and export/import works.
- [ ] The High tier holds 60 fps on an M1/M2 Air, the Low tier holds 30+ fps on Iris Xe, the title appears in under 25 MB, and no frame spikes over 50 ms during streaming.
- [ ] No API keys appear in the build output. A CI grep checks for key-like strings.
- [ ] Credits list the course (MIT), CC0 kits, and TTS.

---

## 10. Open items (defaults are chosen so the build isn't blocked)

| Item | Default |
|---|---|
| Parrot name | **Wingman** (a co-pilot joke) |
| NPC names & voices | As listed. We'll audition in Phase 0 |
| First mate "Juno" as the voice of the agent crew | Yes |
| The optional Whispering Gallery | Included, with no real microphone access |
| Sail palettes (mirroring the app's theme picker) | 6 **nautical** names (Harbor Blue, Coral Reef, Sunset Sail, Storm Grey, Sea Glass, Parchment), so they don't imply they're real app themes. The spyglass still shows the real picker |
