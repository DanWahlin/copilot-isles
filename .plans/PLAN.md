# Copilot Isles: Game Concept & Plan (v0.3, approved + Grok Build review consensus applied)

> Review history: [docs/reviews/2026-09-23-grok-build](../docs/reviews/2026-09-23-grok-build/README.md)

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
| Platforms | **Runs everywhere with a WebGL2 browser:** desktop (keyboard/mouse + gamepad) **and tablets (touch) now**, phones in a later phase. **Performance floor: Intel UHD 620 at 30 fps**, plus a **Lite** preset for Chromebooks. Devices that can't run 3D get the **2D Chart & Logbook mode**. See §14 |
| Rendering backend | **WebGL2 + GLSL** (three.js). WebGPU only for optional HDR output later |
| Test hardware | **Emulated** on the M3 Max (locked render scale + scaled GPU budgets + CPU throttling), with **cloud real-device runs** for iPad/Android tablets. A real UHD 620 laptop is recommended before public launch (§14.5) |
| Repository | `DanWahlin/copilot-isles` (**private**). GitHub Pages from a private repo needs a paid plan, and the published site is public either way |
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

### Sakura River Valley (water, physics & environment reference)
Full study: [docs/research/2026-09-23-sakura-river-valley.md](../docs/research/2026-09-23-sakura-river-valley.md). This is a three.js river scene with **the best browser water we've seen**. It weighs **~7.5 MB** in total and draws **239 calls per frame**, though it pushes **~5.9 M triangles per frame** (mirror + main pass).
- **Water:**
  - half-res planar reflection with cheap-path shaders
  - scene-copy refraction with **Beer-Lambert absorption** along the optical path
  - two-phase flow maps and lace foam
  - **riverbed caustics**
  - **analytic Kelvin wake, bow wave, hull cut-out, and boat shadow**, all computed in the water shader
- **Physics:** no engine. The boat is a **kinematic hull sampled at 8 points** with iterative depenetration, bump response, procedural bob/heel, and an **autopilot lane planner**.
- **Environment:** analytic height fog + drifting mist, **shadow-map ray-marched sun shafts** with temporal accumulation, one shared wind field, a keyframed time-of-day/weather system, and particles in camera-following boxes.
- **Performance:** a cached shadow map refreshed on movement, half-res effect buffers (DPR ≤ 1.3), adaptive resolution (0.72-1.0), and shader precompile before reveal.
- **The scene code isn't licensed**, so we re-implement the *techniques* and don't copy code.

### "Antikythera" Claude artifact (cliffs, leaps, waves, boat motion, loader reference)
Full study: [docs/research/2026-09-23-antikythera-artifact.md](../docs/research/2026-09-23-antikythera-artifact.md). This is a single-file three.js dive game: a Greek sponge boat anchored under sea cliffs. It draws **58 calls and 1.4 M triangles at the title**, and everything is procedural.
- **Waves:** a JS wave table that *generates* the GLSL, an exact height via displacement inversion, a CPU/GPU-identical distance fade, a polar grid that filters waves it can't resolve, and roughness-based specular anti-aliasing with Poisson sparkles. The **ship's reflection and shadow are analytic**.
- **Boat:** **damped-spring buoyancy at 8 hull stations**, wind/hull drag, an anchor-rope spring, orbital coupling, heel from wind and crew weight, and rigging that sways from the hull's real acceleration.
- **Jumping fish:** a **director** that stages flying fish, mullet, and dolphins only where the whole leap is on screen and away from UI text.
- **Cliffs:** an analytic coastline with **fluted buttresses**, ravines, strata, a tidal notch, sea caves, baked sun visibility, **silhouette rim light**, and layered distant ranges in sky-tinted haze.
- **Loader:** instant procedural art that **"resolves" with progress**, and themed stage messages.
- **Caveat:** it generates everything at load (17.6 s to a warm title on an M3 Max, 213 shader programs), so we **bake at build time** instead. Its license is unknown, so we re-implement techniques only.

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
- **Vite code splitting** (dynamic `import()` chunks), a **pack builder** with a hashed `manifest.json`, and a **Workbox Service Worker** for modular loading and caching (§13)
- **gltf-transform** (meshopt + KTX2) and headless **Blender** scripts to restyle and optimize CC0 assets
- **Vitest** (quiz/puzzle/save logic) + **Playwright** (menu flows, visual smoke tests)
- Hosting: **GitHub Pages**. A GitHub Actions workflow builds `dist/` and deploys it with `actions/upload-pages-artifact`. There's **no Git LFS** (Pages would serve LFS pointer files) and **no Releases-hosted bundles** (release downloads redirect cross-origin, so browsers can't reliably fetch them from the Pages site). Generated voice files and compressed textures are small enough to commit directly. Limits to keep in mind: every file < 100 MB, the site < 1 GB, and a soft bandwidth cap of ~100 GB/month

### Rendering features ("stylized realism")
- **Water:** see the **Water system** section below.
- **Sky:** a procedural atmosphere with a warm horizon glow, a **curved, drifting cloud layer** (silver-gold edges toward the sun, cool undersides), aerial-perspective haze, and **distant mountain silhouettes**. Night-capable (stars, moon) for later islands.
- **Lighting keyframes:** each island's look is a **preset of about 20 blendable parameters**: sun colour/angle, hemisphere light, fog, mist, sky & cloud colours, exposure, bloom, shafts, lamp level, and white balance. Islands pick fixed presets (dawn, noon, golden hour) and can drift slowly, and the same system blends presets while sailing between islands.
- **Atmosphere:** **analytic exponential height fog** (closed-form, no ray-march), distance haze, and **low mist banks** that drift over water and glow where the sun rakes through. Fog colour follows the view direction relative to the sun (cool → warm).
- **One shared wind field:** gust fronts roll across the world along the wind direction. The **same field** drives grass, palms, flags, **sails (tied to the sailing wind and trim, with luffing into the wind)**, and CPU springs on sashes, coats, and hanging nets.
- **Terrain:** heightmap islands with sand/grass/rock/dirt splat blending using CC0 PBR textures, triplanar cliffs (skipping weak projections), and **wet-sand darkening** where waves run up.
- **Vegetation:** instanced grass that bends as you walk, plus palms, cactus, and bushes with shared-wind sway, LODs, impostors, and **translucency** for fronds, leaves, and petals when the low sun is behind them.
- **Buildings:** one architecture kit per island, restyled to a shared palette with baked AO, weathering, and a **waterline tidemark** (wet, darker wood plus an algae band) on docks, piers, and hulls.
- **Characters:** CC0 base bodies with pirate outfit pieces and CC0 animations. NPCs layer **procedural idle life** on top (breathing, weight shifts, head look-at, wind on cloth).
- **Post, in order:**
  1. SSAO (half-res, bilateral blur, fades with distance)
  2. **sun shafts** (see §12.5)
  3. a 6-level mip bloom chain
  4. AgX tone mapping
  5. **white balance by sun height**, then a per-island grade (LUT)
  6. subtle edge chromatic fringe and a warm veil near the sun
  7. vignette, then **film grain + dither**, which prevents banding in sky and fog gradients
  8. FXAA + a light unsharp mask when rendering below native resolution
  - Soft DOF during dialogue (High+).
- **Ambient life:** gull flocks (circling, with flapping bouts and glides), lagoon fish, butterflies, fireflies at dusk, chimney smoke, drifting leaves, floating flotsam, and **distant ships crossing the horizon**. All particles **wrap inside camera-following boxes**, so nothing is spawned or allocated per frame.
- **The "Leaps" director (jumping fish & dolphins):** a stager, not a random spawner. Every ~15-45 s, **in daylight with the camera above water**, it picks a spot ahead of the camera and **only commits if the *entire* leap stays on screen**. It also has to stay **clear of UI text** (title logo, dialogue, prompts) and away from the ship and the camera-to-ship line.
  - **Species:** **flying-fish schools** (taxi with tail-slaps → glide → re-entry) in the tropics and open sea, **mullet** hops in harbors, and **dolphin pods** at sea (nose and tail each splash as they cross the surface). Later islands can add a whale breach or leaping mantas.
  - **Physics:** trajectories are ballistic (g = 9.81), with pitch following velocity. Each leap is baked once at 60 Hz and interpolated.
  - **Events:** splash particles and **stereo-panned splash sounds** are scheduled.
  - **Budgets & testing:** tiny instanced pools (≈ 6 fish, 3 dolphins, 48 splashes), and a `?seed=` for reproducible tests.

### Cliffs, coastline & distant land
- **Coastlines are analytic functions** (baked to terrain at build time). Each is a noisy base shape with Gaussian coves and capes, a **sea-cliff profile** rising to inland ridges, and **radial ravines**.
- **Cliff faces are carved** by "buttress" and "flute" functions (sawtooth waves over rotated, noise-warped coordinates). **This vertical fluting is what makes cliffs read as real.** Ridged-noise detail and flat features (terraces, threshing floors, plazas) sit on the gentle slopes.
- **The cliff/rock shader** adds:
  - **strata ledges** (anti-aliased with `fwidth`) and dark water streaks
  - a **tidal-notch** erosion line just above the sea, plus a **wet, darker, glossier band** at the waterline
  - **sea caves** placed in hashed cells along the cliff base
  - terraces with stone walls, and scrub dots
  - **per-biome palettes:** limestone and terracotta at Port Meridian, dark basalt at Keelhaven and Tidewheel, red sandstone mesas at Sunspire
- **Baked lighting (build time):**
  - per-vertex AO
  - **sun visibility ray-marched against the height field for two sun states** (blended when a preset drifts), for cheap soft terrain self-shadowing at any distance
  - a **skyline rim-light flag** on vertices silhouetted against the sky, so **ridges glow gold when the sun sits behind them**
- **Distant ranges:** several layered, procedurally generated ridgelines (a few thousand vertices each, ~0 bytes of assets) carry a **"faint" depth attribute**. A **land-haze shader** (height-fog integral + distance haze) **samples its colour from the sky at the horizon**: warm gold toward the sun, cool blue away. It's clamped so sunlit faces never wash out. The same ranges appear on the **title screen** and every sea view.

### Water system
Our water has to cover **open-ocean swell, surf, lagoons, harbors, and flowing water**. The Sakura Valley techniques cover the last three, and Gerstner covers the swell.

| Layer | Technique | Tier |
|---|---|---|
| **Surface motion** | Open sea: **4-6 Gerstner waves with deep-water dispersion `ω = √(g·k)`**, defined in **one TS table that generates the GLSL constants**, plus two scrolling detail-normal layers, with amplitude by zone (calm lagoon → open swell). Amplitude also fades with camera distance (`exp(-d/≈240 m)`), **identically on CPU and GPU**. The mesh is a **camera-centred polar grid** (geometric ring spacing out to ~1.6 km). Each vertex carries its spacing, so **wave components the grid can't resolve are dropped instead of aliasing**. Rivers, waterfalls, and **the P0.1 sluice channels** use **two-phase flow maps** (no visible reset). Wind ripples on top | All |
| **Reflection** | **Baseline:** a Fresnel (Schlick) reflection of a **prefiltered PMREM sky map**, spread by roughness. **Roughness grows with unresolved wave variance and the normal's screen derivative**, so far water becomes a soft sheen rather than sparkling noise. Sun glints use a **microfacet (Beckmann/Smith) BRDF** plus **Poisson sparkles** sized to the pixel footprint. **Ships reflect analytically on every tier:** a simplified hull SDF is ray-tested with 4 jittered normals, with no second render. **Add-on for calm zones:** a **half-res planar mirror pass** (DPR ≤ 1.3) inside the lagoon and harbor basins only. It uses a `noReflect` layer (grass, particles, small props excluded), a global `uReflect` flag that puts every material on a **cheap shading path**, frozen shadows, and normal-distorted lookups | Baseline + analytic ship reflection: all. Sparkles: Medium+. Mirror: **High/Ultra**, calm zones only |
| **Refraction & colour** | Copy the opaque pass to a **half-res target with linear depth in alpha**. Offset the lookup by normal × depth, and **fall back to the undistorted sample if the offset hits something in front of the water**. Colour is **Beer-Lambert absorption along the optical path** (depth ÷ view angle, clamped to the depth-buffer bed distance) plus an in-scatter body colour. **Per-island absorption presets**: turquoise lagoon, deep-blue ocean, jade river, and inky volcanic | All (Low: no distortion offset) |
| **Seabed** | **Caustics** injected into the terrain material as *extra sunlight* (so shadows still hold), fading with depth and distance. **Underwater light attenuation** on anything below the waterline (so the shallows don't glow). Terrain uses a matte, wet look below the surface | Medium+ |
| **Foam** | "Lace" foam (coverage eroding multi-octave cells, never solid sheets), depth-based **shoreline foam**, a **coast-foam ribbon extracted from the real shoreline contour at build time** (marching squares) with a surge travelling along the coast, **reef-break foam lines**, wave-crest foam from Gerstner steepness, and a **beach run-up (swash)** band with receding wet sand. Noise is **only evaluated where foam is possible** | All (Low: fewer octaves) |
| **Boat ↔ water** | All **analytic in the water shader**, with no particles or simulation: **Kelvin wake arms + churned trail**, a **bow-wave crescent**, hull-hugging streaky whitewater, rings around the hull at rest, and a **hull cut-out** (water discarded inside the hull, using the *same* hull function as the CPU). The **boat's shadow on water** is ray-stepped against that hull function. The hull also gets a **waterline foam ring** that rides the Gerstner surface, a **wet band** that follows the real sea height, and **spray bursts when the bow slams** a wave (hull-point vs sea velocity) | All (Low: no shadow march, no spray) |
| **Other interaction** | Rings + foam around the player's legs when wading, rings where crates or oars touch water, and floating flotsam/leaves that **part around the hull and fan into the wake** | Medium+ |
| **Night & weather (post-POC)** | Lantern glints smeared into columns by the ripples, rain-ring fields, and wetness | Medium+ |

**Single sources of truth:** the Gerstner wave sum, the terrain height `h(x,z)`, shore distance, and hull shape are each written **once as paired TS + GLSL functions**. Where possible, the GLSL is **generated from the TS constants at build time**. Buoyancy, placement, wading depth, wake, and cut-out all use them, so what you see always matches what the game simulates. Because Gerstner moves points sideways, the **exact surface height at a world point is found by inverting the horizontal displacement** (a 2-3 step fixed-point iteration) before sampling.

### Physics & motion
- The **agreed split stands:** Rapier provides only primitive static colliders, scene queries, and the kinematic character controller. There are no dynamic bodies, and push blocks are grid logic.
- **Boat (no physics engine, following the Valley's approach):**
  - a **kinematic hull sampled at ~8 points** along the keel, each widened by the analytic beam
  - tested against **circle/capsule obstacles** (dock posts, rocks, buoys, moored ships) and the shoreline distance field, with **3-4 iterations of depenetration**
  - **Impact response:** a hard bow hit reverses a little speed and adds a decaying shake. A glancing hit adds drag.
  - **Grounding:** the depth from `h(x,z)` under the hull slows you in the shallows before you touch sand.
  - **Motion feel (fixed-timestep):** the player controls heading and speed kinematically (sail trim, rudder), and **heave, pitch, and roll are damped springs** toward the exact sea height at **~8 hull stations**. Each has its own natural frequency and damping, so the hull *lags, overshoots, and settles* instead of snapping to the waves.
  - **Layered on top:** **orbital-velocity coupling** (the swell nudges the ship), **anisotropic drag** (easy forward, hard sideways), **heel from apparent wind and turning**, and **crew-load heel** (the ship leans slightly toward you as you walk the deck).
  - **Stability:** substeps are capped per frame, with clamps and a NaN guard.
- **Moored & NPC ships:** the same buoyancy, plus a **nonlinear mooring/anchor-rope spring** and wind drag, so anchored ships **swing and weathervane** naturally in the harbor.
- **Secondary motion:** lanterns, blocks, loose rigging, and hanging nets sway on springs driven by the **hull's measured acceleration**. Flags, pennants, laundry, and sails use a light cloth/billow solver on the shared wind.
- **Autopilot planner:** a lane/waypoint planner scores candidate headings against the obstacles ahead every ~0.2 s and steers smoothly. It powers the **P1.2 Autopilot voyage**, the chart's **"Sail here"** auto-sail, and docking assist. Manual input always takes over.
- **Player on foot:** the kinematic controller + `h(x,z)`. Wading slows you and spawns ring shaders, and deep water gently returns you to shore (POC).

### 6a. AI-assisted art pipeline
- **Image model** (`AI_IMAGE_*` in `~/.env`) generates the parchment map & island illustrations, NPC portrait paintings, loading-screen art, Logbook page ornaments, UI flourishes, and **tileable textures** (sand, plaster, thatch, sailcloth) that we then turn into PBR maps.
- **3D:** we start with CC0 kits. For hero pieces (the citadel, the ships, the world-tree) we can try image-to-3D later. That needs a separate service, since it isn't in `~/.env`.
- Every generated asset goes in an `ART_PROVENANCE.md` log: prompt, model, date, file.
- Keys are only ever used by **offline build scripts**, never in the browser.

### Quality tiers & budgets
- **Low / Medium / High / Ultra** presets, plus resolution scale. The full per-tier budgets and efficiency rules are in **§12**.
- Targets: **60 fps @1080p** on an M1/M2 MacBook Air or RTX 3050-class machine at High, and **30+ fps** on Intel Iris Xe at Low.
- Download size: **≤ 4 MB to an interactive title**. The title is ocean, sky, clouds, and the ship only. Code and content load on demand as modules and packs (**§13**).

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

Text size, dyslexia-friendly font option, adjustable text speed, high-contrast UI, and reduced motion (no camera bob or shake, lantern flicker, or sun shafts). Also: colorblind-safe quiz feedback (icons + color), full keyboard navigation of the UI, rebindable controls, and a **no-pointer-lock default look** (hold right mouse, arrow keys, or gamepad) with pointer lock as an option. Plus camera sensitivity/invert/FOV, separate volume sliders, and captions for every sound cue that matters.

---

## 10. Roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| **0 · Look, sound & perf spike** | One frame that shows **the polar-grid ocean (with analytic ship reflection), one restyled building cluster, a dressed pirate, and ≥ 8 skinned NPCs**, plus sky, clouds, character + camera, sailing and docking the brigantine, a prototype of the procedural music engine (one island theme), the voice pipeline (a few lines), and the debug HUD + benchmark flythrough (which also measures physics time).<br>**Water must show every layer of the Water system**: Gerstner swell → calm lagoon with **refraction + absorption + caustics**, shoreline/reef foam and **beach run-up**, **analytic wake + bow wave + hull cut-out**, a flow-map channel, and the **High-tier harbor mirror**.<br>Also required: cached shadows, sun shafts, the shared wind (grass, palms, sails), mist/height fog, adaptive resolution, the `shot()` debug API, and the **§13 loading skeleton** (boot/title chunk split, the manifest + one streamed pack, and the Service Worker), with its §13.5 title budget measured.<br>It must **hit the §12 budgets** on reference hardware, with each water layer's cost measured separately | You approve the *look*, the *sound*, and the *frame rate* |
| **1 · Proof of concept** | **Islands 00 + 01 fully playable**, plus all core systems: **tablet touch controls**, the **2D Chart & Logbook mode**, menu, character creation, dialogue, chests/logbook, all quiz types, puzzle toolkit, map/fast travel, settings, save, audio. **Vertical-slice gate first:** Anchorage Q0.2-Q0.8 fully playable with real TTS before the rest of the content is built | You approve the *slice*, then the *fun & teaching* |
| **2 · Expansion** | Islands 02-04 | |
| **2b · Phones** | Phone layout (portrait-friendly HUD, readable screenshot quizzes, a smaller memory budget) and the phone 30 fps tier | Phone UX review |
| **3 · Complete** | Islands 05-07 + finale, certificate, polish, accessibility audit, perf pass, credits, deploy | |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Realism vs browser performance | Quality tiers and an early Phase 0 look/perf gate |
| Planar mirror doubles the scene cost | Limited to High/Ultra and calm-zone visibility. Half-res, layer-culled, cheap-path shaders, a ≤ 35% budget, and PMREM always as the fallback |
| Copying code from reference scenes | Arkenfall, Sakura Valley, and the Antikythera artifact are **study references only**. We re-implement their techniques and never copy their code, shaders, or assets |
| Mixed CC0 kits look inconsistent | 1-2 kits per island, a shared palette and material pass, and Blender restyle scripts |
| Pirate characters (m/f) need to look great | CC0 base bodies + modular outfits. We may need custom Blender work for hats and coats |
| Procedural music sounds "synthy" | Physical-modeling plucks, FM bells, detuned ensembles, humanized timing, and good generated reverb. We'll A/B test in Phase 0, and you sign off on the sound before content work starts |
| Voice lines add a lot of files | Opus at ~32 kbps (AAC fallback, and each client downloads one format), loaded per island, cached by hash, regenerated only when a line changes |
| Course UI and screenshots change | Pinned course SHA in `course.lock.json` + image hashes + CI hotspot check |
| Trademarks & affiliation (Octocat, Copilot logo, product name) | The MIT license covers the course's copyright, not GitHub's trademarks. We include the **full MIT notice** in the credits, keep screenshots as screenshots, and **never model or generate the Octocat or Copilot logo**. An **affiliation line** (e.g. "Unofficial fan project…" vs official wording) is a **required decision before the first public deploy** |
| Film likeness (the "Pirates of the Caribbean" ship brief) | Build a generic Golden Age brigantine. Don't replicate any specific film ship's distinctive design |
| GitHub Pages bandwidth (~100 GB/month soft cap) | Keep the per-island downloads small, use Service Worker caching, and monitor. Move to a CDN if the game gets popular |
| Emulated-only performance testing misses real iGPU limits | Conservative emulation ratios with margin, cloud real devices for tablets, and one real UHD 620 laptop before public launch (§14.5) |
| "Runs everywhere" scope (tablets + 2D mode) | Shared data-driven content, 2D renderers for only 5 POC puzzles, and phones deferred to Phase 2b |
| Service Worker serves stale or mixed versions | Content-hashed immutable URLs, a network-first manifest, new versions activated only at the title screen, and old packs kept until the new ones verify |
| Player outruns streaming (fast travel, fast sailing) | Critical packs kept small (≤ 8 MB), prefetch starting at the Trial, a diegetic fog-bank slowdown, and a lighthouse transition with progress |
| Scope (8 islands of bespoke content) | Data-driven content + a reusable puzzle toolkit + a shared template per island |

## 12. Efficiency (rendering & runtime)

Efficiency is a **Phase 0 gate**. The spike has to hit these budgets on reference hardware before we build content on top of it. The rules below are adapted from your list. We don't have projectiles, and we're desktop-only, so "mobile" means **integrated laptop GPUs** (Intel Iris Xe, base M1). The same discipline applies.

### 12.1 Budgets per quality tier
| Budget | Low (**floor**: Intel UHD 620) | Medium (Iris Xe, M1 Air 8 GB, iPad A13+) | High (M2/M3 Air, RTX 3050, iPad M1+) | Ultra (M Pro/Max, RTX 3060+) |
|---|---|---|---|---|
| Target frame rate | 30 fps | 45-60 | 60 @1080p | 60 @1440p+ |
| Render scale / max DPR | 0.6-0.75 / 1.0 | 0.8-1.0 / 1.25 | 1.0 / 1.5 | 1.0 / 2.0 |
| Draw calls (in-game, **whole frame incl. mirror + post passes**) | < 150 | < 225 | < 300 | < 400 |
| Triangles (**summed across all scene passes, incl. the mirror**) | < 500k | < 1M | < 2M | < 3.5M |
| GPU texture memory | < 256 MB | < 384 MB | < 512 MB | < 768 MB |
| Shadows | **Static cached map** 2048² (refresh on movement) + blob shadows for characters | Static cache 2048² + dynamic character map 1024² | Static cache 4096² + dynamic 1024² | Static cache 4096² + dynamic 2048² |
| Water | PMREM reflection, absorption (no refraction offset), foam, wake | + refraction offset, caustics, flotsam | + **planar mirror in calm zones** (half-res), boat shadow march | + wading/rain detail |
| Post FX | Tone map + grade + vignette + grain/dither | + bloom, screen-space radial shafts | + SSAO (half-res), **shadow-map sun shafts** | + DOF, full-res AO |
| JS main thread per frame | < 6 ms | < 5 ms | < 4 ms | < 4 ms |
| Initial download (to title) | **≤ 4 MB, interactive in ≤ 3 s at 25 Mbps** on every tier (see §13.5). The title is ocean, sky, clouds, and the ship, with no island | | | |

### 12.2 Draw calls & batching *(your "minimize draw calls")*
- **InstancedMesh / BatchedMesh** for vegetation, rocks, crates, barrels, fences, and modular building parts. Each chunk gets its own instance set, so culling still works per chunk.
- **Merge static geometry** per island chunk (`mergeGeometries`) for things that never move, like docks, walls, and terrain dressing.
- **Texture atlases / array textures** so each island's building kit shares one or two materials.
- **A small material library**, so there are only a few unique shader programs in the whole game. Quality tiers are `#define` variants of the same shaders.

### 12.3 Level of detail *(your "LOD")*
- **Islands:** the island you're on renders at full detail and its neighbors at medium. Far islands are low-poly silhouettes that fade into the haze, and anything past the horizon isn't drawn at all.
- **Vegetation:** full mesh → simplified mesh → **billboard impostor** → dithered fade-out.
- **Water:** a camera-centred **polar grid** with geometric ring spacing (dense near you, sparse far away, out to ~1.6 km). Each vertex carries its spacing, so the shader **drops wave components the grid can't resolve**, and the wave amplitude fades with distance identically on CPU and GPU.
- **Terrain:** chunked, with geomorphing between LODs to avoid visible popping.
- **Characters:** skinned-mesh LODs. Distant NPCs update their animation at a lower rate, and NPCs you can't see don't animate at all.

### 12.4 Culling *(your "object culling")*
- **Frustum culling** with correct bounds on instanced and batched chunks.
- **Distance culling per layer:** small props at around 60 m, grass at around 40 m, and particles at around 30 m. The distances scale with the quality tier.
- **Zones and portals** for towns and interiors, so a room renders only when you're inside it or looking through its doorway.
- **Render layers** gate which objects draw in which pass: mirror (no grass, particles, or small props), opaque, transparent, and shadow casters.
- **Shadows are cached.** The static-world shadow map has `autoUpdate = false` and is re-rendered only when the focus point moves past a threshold (~50 m, snapped to a grid so it doesn't shimmer) or the sun preset changes. Moving characters use a small separate dynamic map (or blob shadows on Low). The **boat's shadow on water is analytic** in the water shader. Only large objects cast into the static map, and small props rely on baked AO.

### 12.5 Shaders & GPU cost *(your "optimize shaders and materials")*
- **Water reflection is tiered.** Everywhere, the baseline is a Fresnel reflection of a prefiltered (PMREM) sky map + sun glints, which needs no second scene render. On **High/Ultra only, inside calm lagoon/harbor zones**, we add a **half-res planar mirror pass**:
  - Its budget is **≤ 35% of the main pass's GPU time**.
  - Its content is layer-culled: no grass, particles, or small props.
  - Every material takes a **cheap shading path** in it (no triplanar, caustics, or AO).
  - Shadow updates are frozen during it.
  - The mirror switches off whenever the calm zone isn't on screen.
- **Refraction reuses one half-res copy** of the opaque pass (color + linear depth in alpha). The copy also feeds foam, shoreline fades, and soft particles, so no extra depth pre-pass is needed.
- **Half- or quarter-resolution effects** (clouds, SSAO, shafts, bloom, mirror, scene copy), with **offscreen buffers capped at DPR 1.3**, a depth-aware (bilateral) blur/upsample, and clouds updated on alternate frames.
- **Sun shafts (High+)** ray-march the sun's shadow map at half res with ~24-26 steps, interleaved-gradient-noise jitter, and **temporal accumulation**, which hides the noise so few steps are needed. Medium uses a cheap screen-space radial blur, and Low has none.
- **Expensive noise only where needed:** foam, caustics, and wake terms are behind distance/coverage branches, so the open sea far away costs little.
- The **sky/atmosphere lookup table** is recomputed only when the sun moves.
- **All post-processing merges into as few full-screen passes as possible** (tone map, grade, vignette, and chromatic effects in one pass).
- **Wind and sway run in the vertex shader** (grass, palms, flags, sails), so the CPU does no per-instance work. Grass bending uses a small "trample" render target around the player.
- The **terrain** blends at most 4 splat layers per chunk, with AO/roughness/metal packed into one texture.
- **Shaders compile during loading.** We call `compileAsync` / `renderer.compile()` with **every object temporarily visible and all layers enabled**, so there's no hitch the first time something appears on screen. Loading runs as staged builds that yield between stages (via `MessageChannel`) and report progress to the loader.

### 12.6 Streaming & async loading *(your "asynchronous loading")*
- The full design is **§13 Modular loading**: code splitting, asset packs, and world streaming.
- **KTX2 transcoding and meshopt decoding run in Web Workers.**
- **Time-sliced GPU uploads** push only a few textures or meshes per frame, so streaming never causes a frame spike.
- The title screen is **ocean, sky, clouds, and the player's ship** (at most one distant impostor island), so the menu appears in a couple of seconds. The first island starts streaming after New Voyage/Continue (or is prefetched while you sit on the title, §13.4).

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
- **GPU time is the primary signal.** We measure it with `EXT_disjoint_timer_query_webgl2` (a ring of ~4 queries, read asynchronously and smoothed). If the extension is missing or disjoint, we fall back to frame-time and missed-frame counting. **We never rescale during transitions** (fast travel, docking, dialogue cuts), and after a failed upscale we **back off exponentially** (≈ 15 s → 120 s).
- **Dynamic resolution** starts measuring after a ~90-frame warm-up and averages over 60 frames:
  - **Lowering:** over budget (e.g. > 23.5 ms at a 60 fps target), scale × 0.92, or × 0.84 if badly over (> 45 ms). The floor is **0.72**, and there's an 8 s cooldown after a drop.
  - **Raising:** with headroom (< 17.6 ms), scale + 0.05, with a 2.5 s cooldown.
  - It pauses while the tab is hidden, and it can be locked from the debug HUD. Thresholds scale with each tier's target.
  - FXAA + a light unsharp mask restore crispness when the scale is below 1.
- On first launch, a **quick GPU benchmark** picks the starting preset. You can override it in Settings.

### 12.10 Measuring it
- **Debug HUD** (`?debug`): FPS, frame ms (CPU/GPU), **whole-frame** draw calls and triangles (counters accumulated across all passes, not just the last render), textures, geometries, and JS heap, plus a lil-gui tuning panel.
- **Debug API** (dev builds only, e.g. `window.__isles`): `info()`, `setRes()`, `setPreset()`/`setTime()`, and a deterministic **`shot(id)`** that places the camera, freezes time, and renders one frame. Playwright uses it for **visual-regression screenshots** and for the benchmark. A **`?seed=`** parameter makes ambient systems (Leaps, birds, flotsam) reproducible.
- **Hitch guard (dev):** after warm-up, log every shader program, geometry, or texture created during play, with the game state and time. Any entry is a bug to fix (a missing precompile or preload).
- A **benchmark flythrough** follows a fixed camera path across the ocean, into the town, and through a dialogue scene. It reports average FPS and 1% lows, and we run it before merging any visual change.
- For deeper profiling we'll use Chrome Performance traces and Spector.js frame captures.

---

## 13. Modular loading (code splitting, asset packs & world streaming)

**Terminology:**
- **Code** is split into **chunks** that are lazy-loaded with dynamic `import()`. This is *code splitting*.
- **Content** ships as **asset packs** (also called asset bundles), which are **streamed** per island and per zone. This is *level/world streaming*. Unity calls this **Addressables**, and Unreal calls it **pak chunks + World Partition**.
- The goal is to download and hold **only what the player is about to need**. That makes the first load faster, and it cuts memory, JS parse time, shader compiles, and GPU residency during play.

### 13.1 Code chunks (Vite dynamic `import()`)
| Chunk | Contents | Loaded when |
|---|---|---|
| `boot` (entry) | Renderer init, loader UI, input, settings, save, menu shell, the **title scene** (ocean/sky/ship shaders), module loader + manifest client | Page load |
| `vendor-three` | three.js (measured **184 KB gz** for the whole library, less after tree-shaking). Its own long-lived hashed chunk | Page load (parallel) |
| `game-core` | Player controller, camera, dialogue runtime, quest/event system, HUD, Logbook, Chart, quiz runtime | Prefetched while the title is idle. Required at New Voyage/Continue |
| `char-create` | Character creator | New Voyage |
| `sailing` | Boat kinematics, analytic buoyancy, autopilot planner, wake uniforms | First time you board |
| `physics` | Rapier (WASM) for on-foot collision. **Use the separate-`.wasm` build with streaming compile** (`WebAssembly.compileStreaming`) rather than the "compat" build, which inlines base64 WASM (**measured ~1.06 MB gz**) | First time you step onto an island. Not needed for the title or while sailing |
| `audio-composer` + `palette-<island>` | Procedural music engine + each island's instrument/mode data | After the first user gesture (audio unlock). Palettes per island |
| `puzzle-<type>` | Sluice, crane, push-block, pillars, helms | Prefetched within ~50 m of the puzzle |
| `island-<nn>` | That island's build code + **compiled content JSON** (dialogue, quizzes, puzzles, NPCs, lighting and music presets) | With the island's packs (§13.3) |
| `dev-*` | Debug HUD, Hotspot Editor, `window.__isles` | **Dev builds only**. Never shipped |

`import.meta.glob('./islands/*/index.ts')` registers islands without importing them. Vite's preload helper emits `modulepreload` hints for each chunk's dependencies.

### 13.2 Asset packs & the manifest
- A build step (`tools/packs/build.ts`) groups assets into **content-hashed packs** and writes `manifest.json`:
  - `common`: player m/f, parrot, brigantine, UI ornaments
  - **shared kits**: `kit-tropical`, `kit-mediterranean`, … (shared by islands with the same biome)
  - **per-island packs**, split by kind (`geo`, `tex-<tier>`, `voice`, `shots`) and **by zone** (`anchorage/village`, `meridian/citadel`, …)
- **Quality variants:** Low/Medium download 1K textures and High/Ultra download 2K. A player only ever downloads their own tier.
- **Manifest entries** list the URL, byte size, hash, dependencies (e.g. `island-00 → kit-tropical, common`), priority class (`critical` / `near` / `later`), and the zone bounds that trigger loading.
```json
{ "v": 12, "packs": {
  "island-00/critical": { "url": "packs/i00-crit.3f9a1c.bin", "bytes": 6800000, "deps": ["common/critical", "kit-tropical"], "class": "critical" },
  "island-00/village":  { "url": "packs/i00-vil.b21e07.bin",  "bytes": 5200000, "deps": ["island-00/critical"], "class": "near", "zone": [ -40, 10, 120, 90 ] },
  "island-00/voice-nell": { "url": "voice/i00-nell.8c2d11.webm", "bytes": 310000, "class": "near", "npc": "nell" } } }
```
- **CI budget check:** the build **fails if any pack, or any critical path in §13.5, exceeds its budget**.

### 13.3 Streaming scheduler
- **Priority queue:** `critical` (needed to play here, now) > `near` (the zone you're walking into, the NPC you're approaching, a puzzle ahead) > `later` (the next island, optional areas).
- **Up to 4-6 concurrent fetches**, each cancellable with `AbortController` when priorities change (e.g. you fast travel elsewhere mid-download).
- **Decode & upload throttling:** KTX2 and meshopt run in a worker pool, and screenshots decode with `createImageBitmap`. GPU uploads are limited to **~2 ms per frame during play** (unlimited behind transitions). Decode pauses while frame time is over budget.
- **Shader warm-up per island:** `compileAsync` for that island's materials runs **behind the arrival transition or the sea passage**, never on first sight.
- **Residency states:** `remote` → `cached` (on disk via the Service Worker) → `decoded` (CPU memory) → `resident` (on the GPU). Eviction is **LRU against each tier's GPU/CPU memory budget** (§12.1). Normally that means the current island is resident, the next one is decoded, and islands two hops away are released (`dispose()`).
- **Network awareness:** with `navigator.connection.saveData` or a slow `effectiveType`, prefetching is limited to `critical` + `near`. Settings offers **"Download all islands for offline play"**, shows storage used, and has a "Clear downloaded content" button.

### 13.4 When things load (hidden inside play)
| Moment | What loads | How it's hidden |
|---|---|---|
| Page load → title | `boot` + `vendor-three` + title assets | Brush-stroke loader (≤ 3 s target) |
| Title idle (5 s, no Save-Data) | `game-core`, `common/critical`, and the **saved island's critical pack** (Continue) or **island-00 critical** (new players) | Invisible |
| New Voyage | `char-create` now, then island-00 critical + `physics` + `sailing` | **Character creation + the 45 s intro** cover it |
| Walking an island | `near` zone packs, NPC voice files (~60 m radius), screenshots for nearby chests/NPCs, puzzle chunks (~50 m) | Invisible, since they're already loaded when you arrive |
| Trial started / lighthouse lit | Next island's `critical` + its kit at `later` priority | Invisible |
| **"Set sail"** | Next island raised to `critical`/`near` priority | **The sea passage (~2.5-4 min)** needs only ~1.1 Mbps to finish 20 MB |
| Arriving before it's ready | Remaining critical assets | **A diegetic fog bank** ("the fog of scattered evidence") slows the ship near the harbor until the critical pack is resident. It never shows a loading screen |
| Fast travel (Chart) | Destination critical pack | **Lighthouse-beam transition**: ≤ 2 s if cached, ≤ 10 s uncached at 25 Mbps, with progress shown |
| Returning visitor | Everything from the Service Worker cache | Title ≤ 1.5 s |

### 13.5 Load budgets (over the wire, gzip, High tier)
| Item | Budget |
|---|---|
| `boot` JS | ≤ 150 KB gz |
| `vendor-three` | ≤ 190 KB gz |
| Title assets (sky, ocean, ship) | ≤ 3.5 MB |
| **→ Interactive title (cold)** | **≤ 4 MB, ≤ 3 s at 25 Mbps** |
| `game-core` + `sailing` + `physics` | ≤ 1.5 MB |
| `common/critical` | ≤ 4 MB |
| Island `critical` pack (terrain, colliders, near buildings, first NPCs' voice) | ≤ 8 MB |
| **→ First playable after New Voyage, if every cinematic is skipped** | **≤ 14 MB, ≤ 6 s at 25 Mbps** |
| Whole island, all zones incl. voice + screenshots | ≤ 20 MB High / ≤ 10 MB Low |

### 13.6 Caching & updates (GitHub Pages specifics)
- **GitHub Pages sends `Cache-Control: max-age=600` and gzip only** (no Brotli, verified), and we can't change its headers. A **Service Worker (Workbox)** therefore provides long-term caching:
  - precaches `boot` + `vendor-three` + title assets
  - **cache-first for content-hashed URLs**, which are immutable
  - **network-first for `manifest.json`**
- Heavy assets are already compressed formats (KTX2, meshopt, Opus), so the lack of Brotli only costs ~10-15% on JS.
- **Safe updates:** a new manifest version downloads in the background. The SW **only activates the new version at the title screen** (never mid-session), and old packs are kept until the new ones verify. `navigator.storage.persist()` is requested when the player enables offline play.
- Phase 0 verifies that Pages serves `.wasm` as `application/wasm`, which streaming compile needs. If it doesn't, we fall back to the compat build.

### 13.7 Verification
- The **Playwright** suite runs throttled network profiles (25 Mbps broadband, 9 Mbps "fast 4G") and asserts the §13.5 timings: title interactive, first playable, fast travel cached/uncached, and that a sea passage finishes its prefetch before arrival.
- The **debug HUD** shows pack residency, the download queue, bytes/s, and GPU memory per pack.

### 13.8 The loading screen (first impression)
- **Instant art, before the game code:** a tiny **inline classic script** (not a module) runs as soon as the HTML arrives. It paints the loader art procedurally in a few milliseconds, so there's something beautiful on screen before `boot`/`vendor-three` finish downloading. For us that's an **ink-and-parchment Captain's Chart**: a compass rose, coastlines, and a sailing ship.
- **The art resolves with progress:** three stacked canvases hold increasing detail (rough ink wash → coastlines and the compass rose → fine hatching, island names, and the ship). A CSS variable `--p` (0-1) fades in each layer, and a slow drift animation runs (off under reduced motion).
- **Themed stage messages mapped to *real* stages** (never fake timers): "Charting the isles" (manifest), "Raising the swell" (ocean/sky shaders), "Rigging the brigantine" (ship), "Planting the palms" (the island pack), "Waking the harbor" (NPCs and voice), "Lighting the lighthouses" (shader warm-up).
- **An asymptotic creep** (`p += (0.99 − p) × k`) keeps the progress moving during long compiles.
- **Fonts are warmed** before reveal (hidden spans + `document.fonts.ready`), so there's no flash of unstyled text. The loader cross-fades into the live title in ~0.8 s.
- **Two-phase warm-up:** we compile and **warm-draw** (render once off-screen to force GPU uploads) the **title objects first** and reveal the title. The **island is then precompiled in the background, time-boxed**, and revealed in batches. The dev hitch guard confirms nothing compiles during play.
- **Bake, don't generate:** the Antikythera study took **~17.6 s to a warm title** on an M3 Max because it generates everything at runtime. Our terrain, AO, sun visibility, rim flags, shorelines, and foam ribbons are **baked at build time** into packs. Only small procedural pieces (distant ranges, sky, water) run at load, and anything heavier runs in a worker.

---

## 14. Platform support ("runs everywhere")

**Promise:** the **same course content, voices, quizzes, and puzzles on every device**. Only the visuals scale. Devices that can't run 3D get the same learning journey in the **2D Chart & Logbook mode**.

### 14.1 Device classes
| Device class | Examples | Preset | Expectation |
|---|---|---|---|
| High-end | RTX 3060+, Apple M Pro/Max | Ultra | Everything at 60 fps |
| Mainstream (2020+) | M2/M3 Air, RTX 3050 | High | 60 fps @1080p |
| Mainstream (older) | Intel Iris Xe, M1 Air 8 GB, AMD 680M/780M, iPad A13+ | Medium | 45-60 fps with adaptive resolution |
| **Floor** (2017-2020, common in schools and enterprise) | **Intel UHD 620/630** | **Low** | **30 fps** at render scale 0.6-0.75. No mirror, sun shafts, SSAO, caustics, or flotsam. Fewer foam octaves, sparser grass, blob shadows, and NPC animation at a reduced rate |
| Chromebooks & very weak GPUs | Celeron/UHD 600, ARM Mali | **Lite** | 30 fps target: render scale ~0.55, no post except tone map + grade, PMREM water with no refraction, impostor-heavy vegetation, shadows off (blob only), and only one island zone resident |
| Tablets | iPad A13+ (Medium), iPad M1+ (High), recent Android tablets (Low/Medium) | per GPU | Touch controls, larger UI, landscape |
| Phones | iPhone 12+, mid-range Android | *later phase (2b)* | Needs a dedicated small-screen UX |
| **No 3D** | No WebGL2, or hardware acceleration off/software rendering (VMs, remote desktop, locked-down PCs) | **2D mode** | The full course journey in 2D |

### 14.2 Detection & tier choice
1. **WebGL2 check.** If it's missing, start in 2D mode with an explanation.
2. **Software-rendering check:** `WEBGL_debug_renderer_info` strings such as SwiftShader, llvmpipe, "Microsoft Basic Render", or "Software". Some browsers mask this string, so we also run the benchmark in step 3. If it's software rendering, offer 2D mode ("Your browser isn't using the graphics card…" plus a how-to for enabling hardware acceleration).
3. **A ~1.5 s silent benchmark** on the title scene at a fixed render scale, plus GPU-string heuristics and `navigator.deviceMemory` / `hardwareConcurrency` where available. Together these pick Lite/Low/Medium/High/Ultra. The player can always override it, and adaptive resolution (§12.9) fine-tunes within the tier.
4. **Memory-constrained devices** (tablets, 4 GB machines) keep **one island zone resident** and a lower texture tier. Streaming (§13) respects each tier's memory budget.
5. **Context loss** (common on mobile/iPad under memory pressure) is handled: `webglcontextlost` pauses, and restore re-uploads resident packs from the decoded cache.

### 14.3 Browser notes
| Topic | Handling |
|---|---|
| Chrome / Edge / Firefox / Safari | All targets are WebGL2. Playwright runs the same checks on each |
| GPU timer queries | Effectively Chrome-only, so frame-time measurement is the fallback everywhere else (§12.9) |
| Texture formats | KTX2/Basis transcodes to whatever the GPU supports (BCn on desktop, ASTC/ETC2 on Apple and Android) |
| Voice audio | Opus first, AAC fallback via `canPlayType` (Safari versions vary) |
| Audio unlock | The first click, tap, or key press starts the AudioContext (required on iOS/iPadOS) |
| iOS/iPadOS memory limits | Pack budgets, one resident zone on Medium/Low tablets, and context-loss recovery |

### 14.4 2D Chart & Logbook mode
- A **DOM/Canvas-2D experience** built on the parchment Captain's Chart. You travel island to island on the chart, and each island opens as an **illustrated scene** (AI-painted art per location) with clickable characters, chests, and puzzle boards.
- **The content is shared:** it uses the same data files as 3D mode (dialogue, voice lines, Logbook pages, quizzes, hotspots, and puzzle definitions). Each puzzle has a **2D renderer**: the P0.1 channel grid, the P0.2 crane as a top-down berth diagram, the P1.1 push-block grid, the P1.2 helms as three chart voyages (waypoints for Plan, a check-in steering slalom for Interactive, set-and-watch for Autopilot), and the P1.3 rotating banners.
- **Same progress, same save:** Seals, the Logbook, and progress are shared, so a player can switch modes at any time.
- It's also the **accessibility-first path**: fully keyboard- and screen-reader-navigable, with minimal motion.
- It uses the procedural music (low CPU) and voice, and makes no WebGL calls at all.

### 14.5 Testing without the physical devices (chosen: emulate)
- **Emulated GPU tiers on the M3 Max:**
  - lock the render resolution per tier
  - **scale the GPU-time budget by rough capability ratios:** ~5-8× less headroom for M1/Iris Xe, **~25-35× for UHD 620**, ~40× for Chromebook-class. In practice a tier's frame must render in ≤ its budget ÷ that ratio on the M3 Max
  - apply **Chrome DevTools CPU throttling** (4× for Medium, 6× for Low/Lite) to catch main-thread and physics costs
  - The ratios are **estimates**, so we'll add a small margin
- **Cloud real devices** (e.g. BrowserStack/LambdaTest) for **iPad and Android tablets**: touch, Safari/iPadOS behaviour, memory, and context loss. **Cloud desktop VMs lack real GPUs**, so they're used for compatibility and 2D-mode checks only, never for performance.
- **Risk:** emulation can't fully predict an Intel iGPU's bandwidth limits or driver quirks. **Before public launch we should test on one real UHD 620 laptop** (a ~$150-250 used 8th-gen i5 ultrabook).
