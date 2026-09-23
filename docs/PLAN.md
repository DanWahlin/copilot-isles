# Copilot Isles: Game Concept & Plan (v0.3, approved + Grok Build review consensus applied)

> Review history: [docs/reviews/2026-09-23-grok-build](reviews/2026-09-23-grok-build/README.md)

> Working title. A relaxing, beautiful, browser-based 3D island adventure that teaches the
> [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners) course.
> Each chapter is an island. You're a pirate captain. Your crew are AI agents. You direct them and review their work.

---

## 0. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Title | **Copilot Isles** |
| Course basis | Public `github/copilot-app-for-beginners`, **8 chapters → 8 islands** |
| Framing | Captain & crew metaphor + a **Wandering Bard** who keeps the studio analogy |
| Progression | **Hybrid**: sequential by default, plus a **"Free explore"** toggle in Settings that opens every island or the user can select an island from the map |
| Combat | **None**. Puzzles, exploration, sailing |
| Character | Man/woman + name, skin tone, hair, outfit colors |
| NPC voices | **Fully voiced, neural TTS** (Azure Speech, pre-generated). See §7a |
| Art approach | **A. Hybrid stylized realism** |
| AI-generated art | **Allowed anywhere it helps** (uses the image model in `~/.env`). See §6a |
| Branding | **Unsure.** Build unbranded, with a theme layer so logos/mascots can be dropped in later. The **affiliation line** wording is a required decision before the first public deploy |
| Platforms | **Desktop browsers**: keyboard/mouse + gamepad |
| Hosting | **GitHub Pages** |
| Project folder | `~/Desktop/test/copilot-isles` |
| Deadline | None |
| Music | **Fully procedural** (Arkenfall-style), plus procedural ambience and SFX. See §7 |

---

## 1. Vision & pillars

**One-liner:** Sail a sun-drenched archipelago, meet the islanders, solve puzzles, and earn a Captain's Seal on every island by learning to direct AI agents with the GitHub Copilot app.

| Pillar | What it means |
|---|---|
| **Breathtaking but calm** | Golden-hour light, glittering water, drifting clouds, distant mountains. There's no combat and no fail state. |
| **Learn by doing** | Every puzzle is a concept from the chapter. You don't just read "worktrees isolate work", you physically route water through separate channels, organize shapes into patterns, and manipulate objects to see the concepts in action. |
| **Faithful to the course** | Every teaching line maps back to a chapter section. Real app screenshots show up in chests, dialogue, and quizzes. Links back to the relevant chapter sections are provided throughout the game. |
| **Clean, refined UI** | Minimal frosted-glass panels, elegant serif and sans type, generous spacing, subtle motion. It should feel like a premium indie game. |

---

## 2. Research findings

### The course (important: the version matters)
- The **public repo `github/copilot-app-for-beginners` has 8 chapters (00-07)**. Local version can be found at /Users/danwahlin/Desktop/projects/copilot-app-for-beginners.
- The course's recurring analogy is a **recording studio** (soundcheck, control room, booths, song charts, arrangement board, sequencer).
- The course has **72 images** (~9 MB). About 40 are **real app UI screenshots at 1920×1080**, which is perfect for "click the right spot" hotspot quizzes. The rest are conceptual illustrations, which work well as chest rewards and logbook art.
- Chapters include exact UI names (**New**, **My work**, **Automations**, **Customize**, **Local repository / New worktree / Cloud**, `@ # / &`, `/chronicle standup`, `/rubber-duck`, **Pick & Polish**, `/create-canvas`, **Create and run**…), so quiz content can be precise.

### Arkenfall (what makes it look and feel so good)
I reverse-read its production bundle:
- **Three.js + Vite**, split into modules: `terrain`, `water`, `swell`, `sky`, `fog`, `atmosphere`, `vegetation`, `structures`, `Humanoid`, `camera`, `ui`, `audio`.
- **100% procedural.** There are zero model or texture files. Terrain, water, vegetation, buildings, and characters are all generated in code.
- **Music is synthesized live** ("Every note synthesised as you play") via Web Audio.
- It uses AgX tone mapping, fbm-noise clouds, shoreline foam, and a DOM UI overlay with **Fraunces + Manrope** fonts.
- **Takeaway:** its beauty comes from **lighting, atmosphere, water, and color grading**, not from asset fidelity. We should invest in the same places.

### CC0 asset sources (verified CC0)
| Need | Source |
|---|---|
| Rigged male/female characters | Quaternius **Universal Base Characters** |
| 120-250+ animations (walk, run, talk, sit, push, swim, emotes) | Quaternius **Universal Animation Library 1 & 2** |
| Ships, docks, cannons, barrels, chests, flags | Quaternius **Pirate Kit**, Kenney **Pirate Kit** |
| Palms, bushes, rocks, flowers, trees | Quaternius **Stylized Nature MegaKit**, KayKit nature packs |
| Medieval/castle buildings | Quaternius medieval kits, KayKit medieval packs |
| Photoreal PBR textures (sand, rock, wood, plaster), HDRIs | **Poly Haven**, **ambientCG** |
| SFX & UI sounds | **Kenney** audio packs, **Freesound** (CC0 filter) |

### CC0 music sources (researched; not used since we chose procedural music)
- If we ever need a recorded track: OpenGameArt (CC0 filter, e.g. Tallbeard Studios), Free Music Archive (HoliznaCC0, Loyalty Freak Music, Komiku), and nullrights.com.
- ⚠️ Pixabay, Kevin MacLeod, and Alexander Nakarada **aren't** CC0.

---

## 3. The core metaphor: you're the captain, the agents are your crew

The course frames the app as a "desktop cockpit" where **humans stay in control while agents do the work**. That maps naturally to a captain and crew. The studio analogy isn't lost, though. A **Wandering Bard** appears on every island, retells the chapter's studio analogy in a sentence or two, and unlocks that island's music track.

| Course concept | In the game |
|---|---|
| GitHub Copilot app | Your ship's **Command Deck** |
| AI agents | Your **crew** |
| Repository / Fork | A **harbor** / your own **copy of the master chart** |
| Chat session | A quick question at the **tavern** (nothing changes, no branch) |
| Project session | A **crew expedition** assigned to real work in a harbor |
| Interactive / Plan / Autopilot | **Steer together** / **Chart the course first** / **Trusted helmsman** ("options, not levels to unlock") |
| Model & reasoning effort | Which **navigator** you consult & **how long they study the charts** (and yes, "Auto" ≠ "Autopilot") |
| Worktrees | **Treehouses on one great tree**. Each treehouse is its **own house (folder) on its own branch**, and they all share the trunk (the repository). A shared rope bridge shows that **ports can still collide**. The Bard keeps the course's recording-booth analogy |
| Context `@` `#` `/` `&` | Four **signal flags**: cargo (files), bounty notices (issues/PRs), bosun's commands, another crew's log (sessions) |
| My work | The **Bounty Board** |
| Diff / tests / build / preview | Hull before & after / **sea trials** / hull integrity / **test sail** |
| PR, review, CI checks, merge | Harbormaster **inspection**, notes, **lock gates** that turn green, then **your own review as the final gate** before launch (the course's practice PRs are never launched/merged) |
| Skills | **Shanty scrolls**: one shared chart so the whole crew works in rhythm. A scroll **doesn't change anyone's toolbelt** (a skill doesn't enforce permissions) |
| Custom agents | **Specialist crew** (navigator, carpenter, lookout) whose limited **toolbelt is the restriction** |
| MCP servers / Plugins | **Signal towers** to distant libraries / sealed **supply crates** |
| Canvas | The **captain's chart table**. You and your first mate both draw on it |
| Automations | The **clockwork lighthouse**: saved routines on a lever, a clock, or a bell |
| Prompt injection | A **siren's song** / a forged message in a bottle |

**Companion:** a clever **parrot** (name TBD) rides on your shoulder. It gives hints, recaps, and nudges, like Navi but less chatty.

**Story frame (light):** A fog of *scattered evidence* has settled over the Copilot Isles ("where was I?" is literally a pain point in Chapter 01). Each island's guild keeps a **Captain's Seal**. Earn it by proving you can direct a crew wisely, and that island's **lighthouse** lights up, clearing the fog on the map and revealing the next island. Earn all 8 to become **Master Captain** and get a shareable certificate that links back to the course.

---

## 4. The archipelago: 8 islands

| # | Chapter | Island | Biome & settlement | Landmark | Music mood | Signature puzzle |
|:-:|---|---|---|---|---|---|
| 00 | Setup | **Anchorage Cay** | Tropical crescent, turquoise lagoon, palms, stilt-hut fishing village | Little point lighthouse | Ukulele, marimba, steel pan | **Dry-Run Crane**: preview the supply drop, catch that it's aimed at the *wrong ship*, fix it, then run it for real |
| 01 | Tour the App | **Port Meridian** | Lush Mediterranean-Caribbean hills, terracotta terraces, harbor walls | **Hilltop citadel/castle** | Renaissance lute, recorder, harp | **Three Helms**: pick the right mode for each voyage, then sail it |
| 02 | Sessions, Worktrees & Context | **Thousand-Bough Isle** | Misty jungle, waterfalls, a giant banyan world-tree | Treehouse village on one great trunk (each house its own folder on its own branch) | Kalimba, flutes, soft rain | **Channel Routing**: reroute water so parallel crews never collide, plus the shared rope-bridge twist (worktrees don't separate ports) |
| 03 | Dev & GitHub Workflows | **Keelhaven** | Rocky cove, shipwrecks, weathered **old pirate town** & shipyard | Drydock & canal locks | Tavern shanty, accordion, fiddle | **Two Circuits**: an inner loop on your machine (diff → tests → build → preview), then an outer loop on GitHub (PR → review → CI). **The last gate is your own review.** The practice PR doesn't launch |
| 04 | Skills & Custom Agents | **Guildcrest** | Temperate highlands, pines, heather, windmills, stone guildhalls | Scriptorium abbey | Celtic harp, tin whistle | **Toolbelt Trial**: a shanty scroll (skill) guides *how* the crew works but doesn't lock any tools. A specialist (custom agent) whose toolbelt *is* the restriction does the job with only what they need |
| 05 | MCP Servers & Plugins | **Sunspire Sands** | **Desert** with mesas, saguaro cactus, scrub, oasis, adobe bazaar | Heliograph signal towers | Spanish guitar, oud, hand drums | **Mirror Beams**: aim mirrors to *connect* a tower. "Enabled" isn't "connected"; the beam has to arrive. Later specs add "installed isn't invoked" and MCP server vs plugin |
| 06 | Canvases | **Inkwell Bluffs** | White-washed cliffside cartographers' colony, bougainvillea, sea stacks | Giant plaza chart table | Mandolin, accordion waltz | **The Shared Chart**: push-block stages along the rail Propose → Plan → Baseline → Implement → Validate (**no Approve column**; approval happens in the Plan tab), with a beat where **you and your first mate both change the same board** |
| 07 | Automations | **Tidewheel Caldera** | Volcanic black sand, hot springs, ferns | **Clockwork lighthouse** & tide mill | Music box + soft orchestral finale | **Gears & Bells**: manual lever first, then align the schedule gears, local before cloud, starting with a read-only routine. Guard against the siren's song |

The **Open Sea** between islands has sailing, dolphins, gulls, whales, sea stacks, shipwrecks to peek at, and far-off mountains.

### Island 00: Anchorage Cay (Setup), first-pass beats
1. **Captain's Papers:** the Harbormaster covers sign-in (screenshot `sign-in-to-app`). You also choose your theme by painting your sails light or dark (`pick-a-theme`).
2. **Copy the Master Chart:** the Chartmaker explains what a fork is (your own copy).
3. **Moor Your Ship:** Connect the repo. A hotspot quiz on `app-add-project` asks you to find **+ next to Projects → Add GitHub repository**. Other ways in, **Open folder** and **Clone repository**, show up as alternate berths.
4. **Your Own Deck:** choose **Local repository** rather than **New worktree** for setup. A hotspot quiz uses `local-repository-workspace-selector`. The islanders say "you'll learn about treehouses later."
5. **Gear Check:** find the compass (`git`), lantern (`node`), rope (`npm`), and spyglass (`gh`) around the village. Then check them in the **Terminal** tab. You'll learn **View → Toggle Review Panel** along the way.
6. **Right Signature:** `gh auth status` means signing the ledger with the correct account.
7. **Open the Sluice:** on GitHub.com, open your fork's **Actions** tab and enable workflows ("I understand my workflows…") so GitHub Actions can run the practice checks. Wingman makes clear that these aren't the app's **Automations**.
8. **Dry-Run Crane (signature puzzle):** `--dry-run` shows ghost crates (labels, issues, practice branches, PRs) and a sign that reads `Repository:`. It's pointing at someone else's ship! Rotate the crane, confirm it's yours, and then pull `--yes`. Afterwards, a Logbook page shows the real `node .github/scripts/setup-training-scenarios.js` commands and says they run in **Terminal** from the repo root.
9. **First Words:** send your first prompt to the crew through the speaking tube and see the expected output.
10. **Bard:** "Before you record, you get the studio ready: soundcheck." This unlocks the tropical track.
11. **Trial:** order the five key setup decisions, then a hotspot round and multiple choice. You earn the Seal, the lighthouse lights, and **Port Meridian** appears on the map.
- *Side:* messages in bottles hold the troubleshooting tips (app policy is separate from the CLI policy, Git missing, org fork).

### Island 01: Port Meridian (Tour the App), first-pass beats
The town's districts mirror the app's sidebar:
- **Voyage Office** on the harbor plaza is the **New** page. Sample project ideas hang as posters.
- **Bounty Board** in the market square is **My work**. The practice issues and PRs you loaded on Anchorage Cay show up here, so the two islands connect.
- **Clock Tower** is **Automations** (a teaser for island 07).
- **Outfitter's Shop** is **Customize** (a teaser for islands 04-06).
- **The Tavern** is where **Chat sessions** happen (no branch), and **The Shipyard** is where **Project sessions** happen (a new worktree).
- The **Citadel's Hall of Records** holds **Settings**. Each banner or room is a section (General, Accounts, Sessions, Themes, Accessibility, Voice dictation, Customize, Model providers, Experimental).
- **Scattered Evidence quest:** the course's four scattered places, played out. The plan is at the **tavern** (chat), the diff is at the **carpenter's workshop** (the editor), the tests are at a **terminal hatch**, and the PR is at the **post office** ("The Browser"). You feel the pain of running between them, and then the Command Deck brings it all together. This is Chapter 01's challenge/solution table. The carpenter also shows that "you still keep your editor."
- **Three Helms (signature puzzle):** at the Naval Academy you match voyages to **Interactive / Plan / Autopilot**, then sail each one. Plan means drawing the route and approving it before you cast off.
- **Navigator's Observatory:** pick a model and effort level for a task. Includes the trick question "Auto isn't Autopilot."
- *Optional:* a whispering gallery for **Voice dictation**.
- **Trial at the Citadel:** the Admiral's exam, which includes a hotspot quiz on the sidebar (`app-new-page`).

---

## 5. Core gameplay systems

| System | Design |
|---|---|
| **Exploration** | Third-person camera with WASD. The default look is **hold right mouse** (no pointer lock), with arrow-key look, an optional pointer-lock "mouse-look" setting, sprint, and jump. Gamepad is supported. **POC:** wading only (deep water gently returns you to shore). **Swimming and ledge climbing are post-POC.** |
| **Sailing** | Board at a dock into a pirate ship similar to what you'd see in Pirates of the Carribean. In practice that's a generic Golden Age **brigantine** (two masts, square-rigged, weathered hull, patched canvas), not a copy of any specific film ship's design. W/S trims the sails, A/D steers. There's a wind indicator and wake/spray FX, and the boat rocks on **analytic Gerstner buoyancy** that matches the wave shader. Docking is a gentle auto-assist when you're close. Islands stream in as you approach. |
| **Dialogue** | Fully voiced lines with portrait, name, and synced subtitles. Screenshots appear inside the dialogue as framed **spyglass views** you can zoom into. Choices can branch. You can always replay lines in the Logbook. |
| **Chests & Logbook** | Chests reveal **Logbook pages**: a screenshot or illustration plus a clear caption and a link to the course section. The Logbook works as your codex, glossary, and quest log. |
| **Quizzes** | Multiple choice · **Hotspot** (click the right spot on a real screenshot, with a magnifier) · Ordering (drag steps into sequence) · Matching (`@`→files, `#`→issues) · Scenario ("which mode?"). Feedback explains the *why*, and retries are unlimited. |
| **Puzzle toolkit** | Reusable grid pieces: push blocks, pressure plates, levers, sluice gates & water flow, rotating mirrors & beams, gears, timers. Each island combines them in new ways. |
| **Progression** | Islands unlock in order by default. A **"Free explore"** setting opens them all. Each island has 3-5 teaching NPCs, 3-6 chests, 1-2 puzzles, and 1 Trial, which awards a **Seal** and lights the lighthouse. Doubloons buy cosmetics (sails, hats, figureheads, parrot hats). About **25-45 min per island**, since the voiced dialogue alone is a large share of that. Required stops on each island are clustered about a 60-90 s walk apart, with at most one deliberately long scenic walk. |
| **Map (Captain's Chart)** | A full-screen parchment chart with an animated compass rose, ink coastlines, and fog that clears. Click an island to see its chapter, progress (NPCs, chests, puzzles, Trial), and **Sail there** or **Fast travel** (to lit lighthouses). In **Free explore**, you can pick any island from the chart and jump straight there. There's also a zoomed island map with points of interest. |
| **Menus** | The title screen has a live 3D backdrop: **ocean, sky, clouds, and your ship** at golden hour (plus at most one distant impostor island) with a slow camera orbit. The first island streams in only after New Voyage/Continue. It offers **Continue · New Voyage · Chart · Logbook · Settings · Controls · Credits · Quit** (Quit saves and returns to the title, since browsers can't close tabs). The pause menu mirrors it. |
| **Character creation** | Man or woman pirate, plus name, skin tone, hair, and outfit/sash colors. |
| **Save** | Autosave at checkpoints to localStorage (puzzles checkpoint at their start), with "Keep my journey" / "Begin anew". Export/import a save code. |

---

## 6. Visual direction & tech

### Recommended stack
- **TypeScript + Vite** (same foundation as Arkenfall)
- **Three.js**: custom shaders for water, sky, terrain, foliage, and post-processing. We'll decide between WebGL2 and WebGPU/TSL in the Phase 0 spike, favoring compatibility.
- **Rapier** (WASM physics), limited to **primitive static colliders** (boxes, capsules, heightfield), scene queries, and the **kinematic character controller**. The POC has no dynamic rigid bodies: push blocks are grid logic, and the boat is a kinematic hull on analytic buoyancy
- **React DOM overlay** for menus, dialogue, quizzes, map, and logbook, plus a small store (e.g. Zustand) to bridge the game and the UI
- **Custom Web Audio engine** (AudioWorklet + OfflineAudioContext) for procedural music, ambience, and SFX, plus streamed voice lines
- **gltf-transform** (meshopt + KTX2) and headless **Blender** scripts to restyle and optimize CC0 assets
- **Vitest** (quiz/puzzle/save logic) + **Playwright** (menu flows, visual smoke tests)
- Hosting: **GitHub Pages**. A GitHub Actions workflow builds `dist/` and deploys it with `actions/upload-pages-artifact`. There's **no Git LFS** (Pages would serve LFS pointer files) and **no Releases-hosted bundles** (release downloads redirect cross-origin, so browsers can't reliably fetch them from the Pages site). Generated voice files and compressed textures are small enough to commit directly. Limits to keep in mind: every file < 100 MB, the site < 1 GB, and a soft bandwidth cap of ~100 GB/month

### Rendering features ("stylized realism")
- **Ocean:** multi-octave Gerstner waves plus detail normals, shallow turquoise → deep blue by depth, shoreline foam, a fresnel reflection that samples a **prefiltered (PMREM) sky environment map** (one scene render, no planar reflection), sun glints, crest tint, and a boat wake. The CPU evaluates the same wave function analytically at a few hull points for buoyancy, with no GPU readback.
- **Sky:** physically based atmosphere, drifting noise-based clouds, aerial-perspective haze, and **distant mountain silhouettes**. Each island gets its own lighting preset (dawn, noon, golden hour).
- **Terrain:** heightmap islands with sand/grass/rock/dirt splat blending using CC0 PBR textures, and tri-planar cliffs.
- **Vegetation:** instanced grass that bends as you walk, plus palms, cactus, and bushes with vertex wind, LODs, and impostors.
- **Buildings:** one architecture kit per island, restyled to a shared palette with baked AO and weathering.
- **Characters:** CC0 base bodies with pirate outfit pieces and CC0 animations, plus NPC idle routines and head look-at.
- **Post:** AgX tone mapping, cascaded shadows, SSAO (High+), bloom, subtle god rays, height fog, a per-island color-grading LUT, and soft DOF during dialogue.
- **Ambient life:** gulls, lagoon fish, dolphins, butterflies/fireflies, chimney smoke, and flags and sails that ripple.

### 6a. AI-assisted art pipeline
- **Image model** (`AI_IMAGE_*` in `~/.env`) generates the parchment map & island illustrations, NPC portrait paintings, loading-screen art, Logbook page ornaments, UI flourishes, and **tileable textures** (sand, plaster, thatch, sailcloth) that we then turn into PBR maps.
- **3D:** we start with CC0 kits. For hero pieces (the citadel, the ships, the world-tree) we can try image-to-3D later. That needs a separate service, since it isn't in `~/.env`.
- Every generated asset goes in an `ART_PROVENANCE.md` log: prompt, model, date, file.
- Keys are only ever used by **offline build scripts**, never in the browser.

### Quality tiers & budgets
- **Low / Medium / High / Ultra** presets, plus resolution scale. The full per-tier budgets and efficiency rules are in **§12**.
- Targets: **60 fps @1080p** on an M1/M2 MacBook Air or RTX 3050-class machine at High, and **30+ fps** on Intel Iris Xe at Low.
- Download size: **under 25 MB** before the title screen. The title is ocean, sky, clouds, and the ship only, and each island streams in on demand.

### Three possible art approaches
| Option | Look | Speed | Notes |
|---|---|---|---|
| **A. Hybrid stylized realism** *(chosen)* | Closest to Arkenfall and "as realistic as possible" in a browser | Medium | Custom shaders + CC0 kits restyled + CC0 PBR textures |
| B. Low-poly kits as-is | Toy-like, cute | Fastest | Mixed kits can look inconsistent |
| C. Push realism (photoscans) | Most realistic | Slowest, heaviest | Characters will lag behind the environment, which risks the uncanny valley |

---

## 7. Audio

### What Arkenfall does
It ships **no audio files**. A procedural engine synthesizes everything live in Web Audio:
- **Instruments:** harp, lute, flute, strings, choir, bells, pads, drums
- **Musical rules:** modal scales (dorian, lydian, mixolydian, aeolian, pentatonic) with chord progressions, reverb, and delay
- **Ambient life:** birdsong, bees, frogs, gusts, surf, creaks, and drips, all built from filtered noise and oscillators

The upside is that the music is adaptive, tiny to download, and has no licensing concerns. The trade-off is that synthesized timbres don't sound as rich as recorded acoustic instruments.

### 7a. Voice acting (Azure Speech TTS)
- An **offline build script** (`tools/voice/generate.ts`) reads each island's dialogue YAML and renders every line with SSML to **Opus (WebM) plus an AAC (.m4a) fallback**. The client downloads exactly **one** format per line, picked with `canPlayType`. The key stays in `~/.env` and never ships to the browser.
- **Disclosure:** the credits and Settings say the voices are **synthetic, generated with Azure AI Speech**. Before the first public deploy, we check the current Azure Speech terms for redistributing neural and Dragon HD audio.
- The script caches by a hash of the text and voice, so only changed lines get re-rendered.
- **Cast:** the 4 HD voices already configured are `en-US-Andrew` & `en-GB-Ollie` (male) and `en-US-Ava` & `en-GB-Ada` (female), all `DragonHDLatestNeural`. We'll add more Azure neural voices and regional English accents per character, chosen respectfully and never as caricature. Rate and pitch settings give each character a distinct personality. The **parrot** uses a pitch-shifted, bright voice with audio FX.
- The player can type any name, so **spoken lines call you "Captain"** while the on-screen text uses your name.
- **Lip sync** comes from Azure viseme events where the voice supports them, and falls back to amplitude-driven jaw movement. Subtitles are always on, with word-by-word highlighting from word-boundary events.
- Settings include a voice volume slider, "skip voice", and a text-only mode.

### Music plan: fully procedural (Arkenfall-style)
- A custom **Web Audio engine**. Instrument one-shots (plucks via Karplus-Strong, FM bells and marimbas, breathy flutes, pads) are **synthesized once at load time with `OfflineAudioContext` into AudioBuffers**. After that, playing them is cheap. Anything that has to stay live runs in an `AudioWorklet`, off the main thread.
- A **generative composer** uses a look-ahead scheduler. It works from each island's mode, tempo, chord progression, motif, and instrument palette. A shared **Copilot Isles leitmotif** is re-voiced on every island so the whole game feels like one score.
- The music **adapts** to what you're doing. Layers fade in and out across exploring, dialogue, puzzle, Trial, and sailing. Stingers for chest opened, correct answer, puzzle solved, and lighthouse lit are quantized to the beat. Music **ducks under voice lines**.

| Island | Mode / feel | Palette |
|---|---|---|
| 00 Anchorage Cay | Major pentatonic, ~84 bpm, sunny | Marimba, steel-pan (FM), ukulele pluck, shaker |
| 01 Port Meridian | Ionian/Dorian, stately but relaxed | Lute, recorder, harp arpeggios, soft strings |
| 02 Thousand-Bough | Lydian, dreamy | Kalimba, pan flute, rain-drop percussion |
| 03 Keelhaven | Mixolydian, 6/8 jig (tavern-soft) | Accordion, fiddle, frame drum |
| 04 Guildcrest | Dorian/Aeolian, pastoral | Celtic harp, tin whistle, drone |
| 05 Sunspire Sands | Phrygian, warm | Nylon guitar pluck, oud-like pluck, hand drum |
| 06 Inkwell Bluffs | Major, 3/4 waltz | Mandolin tremolo, accordion |
| 07 Tidewheel Caldera | Lydian → triumphant Ionian finale | Music box, soft orchestral pads, bells |
| Sailing / Title | Ionian, broad and calm | String pads that swell with the waves, harp, leitmotif |

- **Ambient life and SFX are procedural too:** surf, gulls, wind, palm rustle, jungle birds and frogs, market murmur, forge clinks, creaking rigging, and bubbling springs. Positional emitters switch on by distance. **Kenney CC0 SFX** fill in only where synthesis can't do a sound justice.
- Settings have separate sliders for Music, Ambience, SFX, Voice, and UI.

---

## 8. Content pipeline (course → game)

- **Course source:** a configurable `COURSE_PATH`, which defaults to your local clone at `~/Desktop/projects/copilot-app-for-beginners` (tracking `github/` `main`). A sync script copies the referenced screenshots into the game and writes `content/course.lock.json` with the **course commit SHA and a hash for each image**. In CI (the GitHub Pages build), Actions checks out `github/copilot-app-for-beginners` at that pinned SHA.
- Content is authored per island in YAML/TS: NPCs, dialogue, chests, quizzes, puzzles. Every teaching line is tagged with its **source chapter + section** and carries a "Read more in the course" link.
- A dev-only **Hotspot Editor** lets you draw clickable regions on screenshots. CI flags any hotspot whose screenshot hash changed, so a course update can't silently break a quiz.
- Anything a learner does "for real" in the app is optional **"Try it in the app"** side quests that link to the chapter. The game itself is self-contained.

---

## 9. Accessibility

Text size, dyslexia-friendly font option, adjustable text speed, high-contrast UI, and reduced motion (no camera bob or shake, lantern flicker, or god rays). Also: colorblind-safe quiz feedback (icons + color), full keyboard navigation of the UI, rebindable controls, and a **no-pointer-lock default look** (hold right mouse, arrow keys, or gamepad) with pointer lock as an option. Plus camera sensitivity/invert/FOV, separate volume sliders, and captions for every sound cue that matters.

---

## 10. Roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| **0 · Look, sound & perf spike** | One frame that shows **the clipmap ocean, one restyled building cluster, a dressed pirate, and ≥ 8 skinned NPCs**, plus sky, clouds, character + camera, sailing and docking the brigantine, a prototype of the procedural music engine (one island theme), the voice pipeline (a few lines), and the debug HUD + benchmark flythrough (which also measures physics time). It must **hit the §12 budgets** on reference hardware | You approve the *look*, the *sound*, and the *frame rate* |
| **1 · Proof of concept** | **Islands 00 + 01 fully playable**, plus all core systems: menu, character creation, dialogue, chests/logbook, all quiz types, puzzle toolkit, map/fast travel, settings, save, audio. **Vertical-slice gate first:** Anchorage Q0.2-Q0.8 fully playable with real TTS before the rest of the content is built | You approve the *slice*, then the *fun & teaching* |
| **2 · Expansion** | Islands 02-04 | |
| **3 · Complete** | Islands 05-07 + finale, certificate, polish, accessibility audit, perf pass, credits, deploy | |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realism vs browser performance | Quality tiers and an early Phase 0 look/perf gate |
| Mixed CC0 kits look inconsistent | 1-2 kits per island, a shared palette and material pass, and Blender restyle scripts |
| Pirate characters (m/f) need to look great | CC0 base bodies + modular outfits. We may need custom Blender work for hats and coats |
| Procedural music sounds "synthy" | Physical-modeling plucks, FM bells, detuned ensembles, humanized timing, and good generated reverb. We'll A/B test in Phase 0, and you sign off on the sound before content work starts |
| Voice lines add a lot of files | Opus at ~32 kbps (AAC fallback, and each client downloads one format), loaded per island, cached by hash, regenerated only when a line changes |
| Course UI and screenshots change | Pinned course SHA in `course.lock.json` + image hashes + CI hotspot check |
| Trademarks & affiliation (Octocat, Copilot logo, product name) | The MIT license covers the course's copyright, not GitHub's trademarks. We include the **full MIT notice** in the credits, keep screenshots as screenshots, and **never model or generate the Octocat or Copilot logo**. An **affiliation line** (e.g. "Unofficial fan project…" vs official wording) is a **required decision before the first public deploy** |
| Film likeness (the "Pirates of the Caribbean" ship brief) | Build a generic Golden Age brigantine. Don't replicate any specific film ship's distinctive design |
| GitHub Pages bandwidth (~100 GB/month soft cap) | Keep the per-island downloads small, use Service Worker caching, and monitor. Move to a CDN if the game gets popular |
| Scope (8 islands of bespoke content) | Data-driven content + a reusable puzzle toolkit + a shared template per island |

## 12. Efficiency (rendering & runtime)

Efficiency is a **Phase 0 gate**. The spike has to hit these budgets on reference hardware before we build content on top of it. The rules below are adapted from your list. We don't have projectiles, and we're desktop-only, so "mobile" means **integrated laptop GPUs** (Intel Iris Xe, base M1). The same discipline applies.

### 12.1 Budgets per quality tier
| Budget | Low (Iris Xe) | Medium | High (M1/M2, RTX 3050) | Ultra |
|---|---|---|---|---|
| Target frame rate | 30+ fps | 45-60 | 60 @1080p | 60 @1440p+ |
| Render scale / max DPR | 0.75 / 1.0 | 1.0 / 1.25 | 1.0 / 1.5 | 1.0 / 2.0 |
| Draw calls (in-game) | < 150 | < 225 | < 300 | < 400 |
| Triangles on screen | < 500k | < 1M | < 2M | < 3.5M |
| GPU texture memory | < 256 MB | < 384 MB | < 512 MB | < 768 MB |
| Shadows | 1 cascade 1024², blob shadows for characters | 2 × 1024² | 2 × 2048² | 3 × 2048² |
| Post FX | Tone map + grade + vignette only | + bloom | + SSAO (half-res), god rays | + DOF, full-res AO |
| JS main thread per frame | < 6 ms | < 5 ms | < 4 ms | < 4 ms |
| Initial download (to title) | < 25 MB on every tier. The title is ocean, sky, clouds, and the ship, with no island | | | |

### 12.2 Draw calls & batching *(your "minimize draw calls")*
- **InstancedMesh / BatchedMesh** for vegetation, rocks, crates, barrels, fences, and modular building parts. Each chunk gets its own instance set, so culling still works per chunk.
- **Merge static geometry** per island chunk (`mergeGeometries`) for things that never move, like docks, walls, and terrain dressing.
- **Texture atlases / array textures** so each island's building kit shares one or two materials.
- **A small material library**, so there are only a few unique shader programs in the whole game. Quality tiers are `#define` variants of the same shaders.

### 12.3 Level of detail *(your "LOD")*
- **Islands:** the island you're on renders at full detail and its neighbors at medium. Far islands are low-poly silhouettes that fade into the haze, and anything past the horizon isn't drawn at all.
- **Vegetation:** full mesh → simplified mesh → **billboard impostor** → dithered fade-out.
- **Water:** a camera-centered **clipmap grid**, with dense vertices near you and sparse ones far away. Wave octaves drop out with distance.
- **Terrain:** chunked, with geomorphing between LODs to avoid visible popping.
- **Characters:** skinned-mesh LODs. Distant NPCs update their animation at a lower rate, and NPCs you can't see don't animate at all.

### 12.4 Culling *(your "object culling")*
- **Frustum culling** with correct bounds on instanced and batched chunks.
- **Distance culling per layer:** small props at around 60 m, grass at around 40 m, and particles at around 30 m. The distances scale with the quality tier.
- **Zones and portals** for towns and interiors, so a room renders only when you're inside it or looking through its doorway.
- The **shadow camera** tightly fits the view, and only large objects cast shadows. Small props rely on baked AO instead.

### 12.5 Shaders & GPU cost *(your "optimize shaders and materials")*
- **No planar reflections.** Water samples a prefiltered (PMREM) sky environment map through a fresnel term, adds sun glints, and reuses the depth texture for foam. This alone avoids rendering the scene twice.
- **Half- or quarter-resolution effects** (clouds, SSAO, god rays, bloom) with a bilateral upsample. Clouds also update on alternate frames.
- The **sky/atmosphere lookup table** is recomputed only when the sun moves.
- **All post-processing merges into as few full-screen passes as possible** (tone map, grade, vignette, and chromatic effects in one pass).
- **Wind and sway run in the vertex shader** (grass, palms, flags, sails), so the CPU does no per-instance work. Grass bending uses a small "trample" render target around the player.
- The **terrain** blends at most 4 splat layers per chunk, with AO/roughness/metal packed into one texture.
- **Shaders compile during loading** (`compileAsync`) so there's no hitch the first time something appears on screen.

### 12.6 Streaming & async loading *(your "asynchronous loading")*
- **Islands stream in by distance** while you sail. We prefetch the next island once it's within range and unload anything two hops away.
- **KTX2 transcoding and meshopt decoding run in Web Workers.**
- **Time-sliced GPU uploads** push only a few textures or meshes per frame, so streaming never causes a frame spike.
- A **Service Worker** caches assets so return visits load instantly and the game can work offline (PWA).
- The title screen is **ocean, sky, clouds, and the player's ship** (at most one distant impostor island), so the menu appears in a couple of seconds. The first island starts streaming only after New Voyage/Continue.

### 12.7 Compression & memory *(your "compress textures and audio")*
- **Textures: KTX2/Basis**, with UASTC for normal maps and ETC1S for albedo. They stay **compressed in VRAM**, using 4-8× less memory than PNG/JPG. Mipmaps are always on.
- **Meshes:** meshopt compression and vertex quantization.
- **Audio:** music and ambience are **procedural, so they cost 0 bytes**. Voice lines are **Opus mono at ~32 kbps** with an AAC fallback, and the client downloads **exactly one format** (via `canPlayType`). They load **per island**, not all up front.
- **Course screenshots** stay as WebP, lazy-load per island, and get decoded off the main thread (`img.decode()`).
- **Explicit dispose** of geometry, materials, and textures when an island unloads. `renderer.info` is tracked in the debug HUD to catch leaks.

### 12.8 CPU, GC & pooling *(your "object pooling" and "profile scripts")*
- **Zero per-frame allocations in hot loops.** Vectors, quaternions, and matrices are reused, and event objects are pooled. This prevents garbage-collection hitches.
- **Pooling** is used for particles (spray, splashes, sparkles, dust), chest and doubloon pop-ups, toasts, audio voices, and floating UI markers.
- **Physics (Rapier)** runs at a fixed 60 Hz with interpolation, and it only handles **primitive static colliders** (capsules, boxes, heightfield, with **no triangle-mesh colliders** across towns), scene queries, and the **kinematic character controller**. The POC has **no dynamic rigid bodies**. Push blocks are grid logic, and the boat is a kinematic hull on analytic Gerstner buoyancy. Only the active island's colliders are loaded. Phase 0 measures physics time, and it moves to a worker only if it misses the §12.1 budget.
- **Game logic is event-driven.** Puzzles, quests, and triggers react to changes instead of polling every frame.
- The **React UI stays out of the render loop.** HUD values update at about 10 Hz through refs, not per-frame React state.
- **Nothing renders when nothing's visible.** When a full-screen menu, the map, or the Logbook is open, we render a single frame, blur it into a still backdrop, and pause the 3D loop. We also pause everything when the tab is hidden.

### 12.9 Adaptive quality
- **Dynamic resolution** lowers the render scale when frame time runs over budget and raises it again once there's headroom.
- On first launch, a **quick GPU benchmark** picks the starting preset. You can override it in Settings.

### 12.10 Measuring it
- **Debug HUD** (`?debug`): FPS, frame ms (CPU/GPU), draw calls, triangles, textures, geometries, and JS heap, plus a lil-gui tuning panel.
- A **benchmark flythrough** follows a fixed camera path across the ocean, into the town, and through a dialogue scene. It reports average FPS and 1% lows, and we run it before merging any visual change.
- For deeper profiling we'll use Chrome Performance traces and Spector.js frame captures.
