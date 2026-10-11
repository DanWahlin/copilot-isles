# Copilot Isles: Game Concept & Plan (v0.3, approved + Grok Build review consensus applied)

> Review history: [docs/reviews/2026-09-23-grok-build](../docs/reviews/2026-09-23-grok-build/README.md) · [delta review](../docs/reviews/2026-09-23-grok-build-delta/README.md) · [WebGPU-pivot review](../docs/reviews/2026-09-23-grok-build-pivot/README.md)

> Working title. A relaxing, beautiful, browser-based 3D island adventure that teaches the
> [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners) course.
> Each chapter is an island. You're a pirate captain. Your crew are AI agents. You direct them and review their work.

---

## 0. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Title | **Copilot Isles** |
| Course basis | Public `github/copilot-app-for-beginners`, **8 chapters → 8 islands** |
| Course content | **Planned, not built yet:** retrieve the course text and screenshots live at runtime, with a bundled snapshot fallback, plus a **weekly refresh automation** for content, screenshots, and voices (Dan, 2026-09-26). Today the game uses bundled copies. See §8 |
| Framing | Captain & crew metaphor + a **Wandering Bard** who keeps the studio analogy |
| Progression | **Hybrid**: sequential by default, plus a **"Free explore"** toggle in Settings that opens every island or the user can select an island from the map |
| Combat | **Gentle sea battles at a few places** (changed 2026-10-04, #203): the first is on the passage from Anchorage to Port Meridian, required with a skip button. Cannonballs, splashes, and ships that settle; nothing gory and **no fail state** (the crew breaks off and the wave restarts). Otherwise puzzles, exploration, sailing. See [docs/specs/BATTLES.md](../docs/specs/BATTLES.md) |
| Character | Man/woman + name, skin tone, hair, outfit colors |
| NPC voices | **Fully voiced, neural TTS** (Azure Speech, pre-generated). See §7a |
| Art approach | **A. Hybrid stylized realism** |
| AI-generated art | **Allowed anywhere it helps** (uses the image model in `~/.env`). See §6a |
| Branding | **Unsure.** Build unbranded, with a theme layer so logos/mascots can be dropped in later. The **affiliation line** wording is a required decision before the first public deploy |
| Platforms | **Runs everywhere, WebGPU-first** (capability classes in **§15.1**, with the automatic WebGL2 backend as the fallback): desktop (keyboard/mouse + gamepad) **and tablets (touch) now**. Phones get the same technology **capped at the Medium feature set**, and **phone UX lands in Phase 2b**. **Performance floor: Intel UHD 620 at 30 fps**, plus a **Lite** preset for Chromebooks. Devices that can't run 3D get the **2D Chart & Logbook mode**. See §14 |
| Rendering backend | **WebGPU-first: three.js `WebGPURenderer` + TSL** (one node shader language → WGSL on WebGPU, GLSL on the automatic **WebGL2 backend**). Compute features (FFT ocean, sims, volumetric clouds, GPU particles, GPU culling) run on WebGPU tiers, and WebGL2 gets non-compute paths. Decided 2026-09-23 after the Tidewater study. See **§15** |
| Test hardware | **Emulated** on the M3 Max (locked render scale + scaled GPU budgets + CPU throttling), with **cloud real-device runs** for iPad/Android tablets. A **real UHD 620 check happens before public launch** (user decision; accepted risk in §11) |
| Repository | `DanWahlin/copilot-isles` (**private**). GitHub Pages from a private repo needs a paid plan, and the published site is public either way |
| Hosting | **GitHub Pages** |
| Project folder | `~/Desktop/test/copilot-isles` |
| Deadline | None |
| Music & sound | **Recorded CC0 music** (changed 2026-09-25 from procedural, after Dan A/B'd both): one streamed track per place, crossfaded. **Ambience and SFX use real CC0 field recordings** (Tidewater's 31 Freesound CC0 files + more), spatialized with HRTF and **lazy-loaded per island** (~5 MB). See §7 |
| Floating flotsam | **Cut** (2026-10-02): loose crates and barrels adrift in a harbour read as junk, not life. Harbours get boats bobbing at their moorings and proper buoys instead (the "more life" pass). |

---

## 1. Vision & pillars

**One-liner:** Sail a sun-drenched archipelago, meet the islanders, solve puzzles, and earn a Captain's Seal on every island by learning to direct AI agents with the GitHub Copilot app.

| Pillar | What it means |
|---|---|
| **Breathtaking but calm** | Golden-hour light, glittering water, drifting clouds, distant mountains. There's no fail state, and the few sea battles are gentle (§0). |
| **Learn by doing** | Every puzzle is a concept from the chapter. You don't just read "worktrees isolate work", you physically route water through separate channels, organize shapes into patterns, and manipulate objects to see the concepts in action. |
| **Faithful to the course** | Every teaching line maps back to a chapter section. Real app screenshots show up in chests, dialogue, and quizzes. Links back to the relevant chapter sections are provided throughout the game. |
| **Clean, refined UI** | Minimal frosted-glass panels, elegant serif and sans type, generous spacing, subtle motion. It should feel like a premium indie game. |

---

## 2. Research findings

### The course (important: the version matters)
- The **public repo `github/copilot-app-for-beginners` has 8 chapters (00-07)**. Local version can be found at /Users/danwahlin/Desktop/projects/copilot-app-for-beginners.
- The course's recurring analogy is a **recording studio** (soundcheck, control room, booths, song charts, arrangement board, sequencer).
- The course has **72 images** (~9 MB). About 40 are **real app UI screenshots at 1920×1080**, which is perfect for "click the right spot" hotspot quizzes. The rest are conceptual illustrations, which work well as chest rewards and logbook art.
- Chapters include exact UI names (**New**, **Pull requests**, **Issues**, **Automations**, **Customize**, **New worktree / Current checkout / Cloud**, `@ # / &`, `/chronicle standup`, `/rubber-duck`, **Pick & Polish**, `/create-canvas`, **Create and run**…), so quiz content can be precise.

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

### Tidewater (MIT, open source; time of day, birds, water, clouds, trees)
Full study: [docs/research/2026-09-23-tidewater.md](../docs/research/2026-09-23-tidewater.md). It's a tropical island + ocean on **three 0.186 + Vite 8** (our versions), using **WebGPURenderer + TSL, WebGPU-only**. It's **MIT-licensed, so we may reuse its code** with the notice kept. Measured on an M3 Max: **~23 MB and 30-60 s to playable** (shader compiles), then 60 fps.
- **Time of day:** a cheap parametric sun path (latitude, declination, hour angle) **rotated by a sun-azimuth setting**, a night factor, a sun→moon handoff, a sky-view LUT, **progressive env/PMREM refresh**, emissive night windows, and 8 packed local lights. It's a draggable sun dial in the UI.
- **Birds:** 5 species with **staged behaviours**: perched gulls that **flush when you approach or sail off**, a pelican line, frigatebirds soaring, sanderlings chasing the swash. They use a coordinated-turn `Flyer` model and a single instanced draw.
- **Vegetation:** procedural plants + scatter rules, **8 m grass cells with 3 tiers**, **baked octahedral impostors**, dithered LOD fades, and wind sheen.
- **Water & shore:** a 4-cascade FFT ocean (WebGPU compute), **ShoreWaves** that refract around headlands via a travel-time field (analytic), breakers synced to spray, a swash/wet-sand sim, a spectral wake sim, and a waterline-split underwater view.
- **Clouds & light:** volumetric Nubis-style clouds (compute), a **cloud-shadow map on land**, contact shadows, ground bounce, PCSS near cascade, and TAAU + RCAS.
- **World:** hulls **lofted from naval lines**, a village `GeoBuilder` with weathering attributes, ~40 procedural props, and a **CC0 field-recording soundscape** (surf synced to waves, footsteps by surface).
- **Caveats:** it's WebGPU-only, there's no lazy loading, it builds hundreds of pipeline variants, and it patches private three internals. **This reopens our renderer decision** (§0; see the study's §8 bake-off).

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

### CC0 music sources (researched; now in use, see §7)
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
| Pull requests & Issues | The **Bounty Board** |
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
1. **Captain's Papers:** the Harbormaster covers sign-in (screenshot `app-sign-in`) and the **New** view. The app's theme lives in **Settings → Themes** (app 1.1.25 dropped the first-run theme step), and here you choose it by painting your sails at the palette stand.
2. **Copy the Master Chart:** the Chartmaker explains what a fork is (your own copy).
3. **Moor Your Ship:** Connect the repo. A hotspot quiz on `app-add-project` asks you to find **+ next to Projects → Add GitHub repository**. Other ways in, **Open folder** and **Clone repository**, show up as alternate berths.
4. **Your Own Deck:** choose **Current checkout** rather than **New worktree** for setup, then send a short prompt to create the session. A hotspot quiz uses `app-current-checkout-workspace-selector`. The islanders say "you'll learn about treehouses later."
5. **Gear Check:** find the compass (`git`), lantern (`node`), rope (`npm`), and spyglass (`gh`) around the village. Then check them in the **Terminal** tab. You'll learn **View → Toggle Review Panel** along the way.
6. **Right Signature:** `gh auth status` means signing the ledger with the correct account.
7. **Open the Sluice:** on GitHub.com, open your fork's **Actions** tab and enable workflows ("I understand my workflows…") so GitHub Actions can run the practice checks. Wingman makes clear that these aren't the app's **Automations**.
8. **Dry-Run Crane (signature puzzle):** `--dry-run` shows ghost crates (labels, issues, practice branches, PRs) and a sign that reads `Repository:`. It's pointing at someone else's ship! Rotate the crane, confirm it's yours, and then pull `--yes`. Afterwards, a Logbook page shows the real `node .github/scripts/setup-training-scenarios.js` commands and says they run in **Terminal** from the repo root.
9. **First Words:** send your first prompt to the crew through the speaking tube and see the expected output.
10. **Bard:** "Before you record, you get the studio ready: soundcheck." This unlocks the tropical track.
11. **Trial:** order the five key setup decisions, then a hotspot round and multiple choice. You earn the Seal, the lighthouse lights, and **Port Meridian** appears on the map.
- *Side:* messages in bottles hold the troubleshooting tips (app policy is separate from the CLI policy, Git missing, org fork).

### Island 01: Port Meridian (Tour the App), as built
A walled harbour town at golden hour: an east arm where your ship berths, a paved plaza and tavern up the stair street, the shipyard at the west end of the quay, terraced houses climbing to a limestone citadel on a bluff, and a cliff lift up the bluff. Eight stops in the chapter's order, each one "what you'll do → where it is in the app → one check → a Logbook page → who's next" (`src/game/meridian-quests.ts`), with the compass pointing to the next one:
1. **Tobias Crane** (plaza table): why use the app. The challenge/solution table is told rather than played (the Scattered Evidence quest was cut to keep stops few, the Chapter 00 lesson), and you keep your editor for deep coding.
2. **Mina Solé** (plaza tour): the sidebar's work surfaces as landmarks, each framed by the camera with its screenshot: Voyage Office = **New**, Bounty Board = **Pull requests** and **Issues** (your practice items from Anchorage), Clock Tower = **Automations**, Outfitter = **Customize**. Then a hotspot check on the sidebar.
3. **Lyra** (tavern stage): the producer's control room (modes), then **Chats**: hover over Chats, select **+**, and pick **Chat** in the project picker. No branch or worktree.
4. **Anders Holt** (shipyard): **Project sessions** on a **New worktree** by default. **P1.1 The Crate Yard:** push each job crate onto the right plates (chat work to the tavern plates, project work to the slipway); a wrong plate refuses and says why.
5. **Captain Rhea Marlowe** (east arm): session modes. **P1.2 The Three Helms:** board your ship; Rhea comes aboard and takes each buoy's helm in turn. **Interactive** heaves to at every mark until you say go, **Plan** charts the whole route on the water and waits for your approval, and **Autopilot** sails home to your berth and moors with no stops. A session-style terminal shows your ask, her steps, and where she's waiting on you. Then a "which mode?" check.
6. **Oren Vey** (observatory, up the cliff lift): the model and reasoning-effort controls below the prompt box. Auto picks a model, and it isn't Autopilot.
7. **Pell Winthrop** (Hall of Records): **Settings** and its nine areas; app-wide instructions are under Sessions. Voice dictation and the chapter's troubleshooting are filed in the Logbook.
8. **Admiral Vale** (her terrace): the exam (A1), including a hotspot round on the sidebar. Passing earns the Seal of Meridian, the lighthouse on the mole lights across the harbour, and a Chapter 02 page points on.

Tests: `tools/meridiantest.mjs` plays the chapter end to end in the browser (the helms are sailed for real).

---

## 5. Core gameplay systems

| System | Design |
|---|---|
| **Exploration** | Third-person camera with WASD. The default look is **hold right mouse** (no pointer lock), with arrow-key look, an optional pointer-lock "mouse-look" setting, sprint, and jump. Gamepad is supported. **POC:** wading only (deep water gently returns you to shore). **Swimming and ledge climbing are post-POC.** |
| **Sailing** | Board at a dock into a pirate ship similar to what you'd see in Pirates of the Carribean. In practice that's a generic Golden Age **brigantine** (two masts, square-rigged, weathered hull, patched canvas), not a copy of any specific film ship's design. W/S trims the sails, A/D steers. There's a wind indicator and wake/spray FX, and the boat rocks on **analytic Gerstner buoyancy** that matches the wave shader. Docking is a gentle auto-assist when you're close. Islands stream in as you approach. |
| **Dialogue** | Fully voiced lines with portrait, name, and synced subtitles. Screenshots appear inside the dialogue as framed **spyglass views** you can zoom into. Choices can branch. You can always replay lines in the Logbook. |
| **Chests & Logbook** | Chests reveal **Logbook pages**: a screenshot or illustration plus a clear caption and a link to the course section. Once §8 is built, the image comes live from the course and the page adds a "From the course" excerpt. The Logbook works as your codex, glossary, and quest log. |
| **Quizzes** | Multiple choice · **Hotspot** (click the right spot on a real screenshot, with a magnifier) · Ordering (drag steps into sequence) · Matching (`@`→files, `#`→issues) · Scenario ("which mode?"). Feedback explains the *why*, and retries are unlimited. |
| **Puzzle toolkit** | Reusable grid pieces: push blocks, pressure plates, levers, sluice gates & water flow, rotating mirrors & beams, gears, timers. Each island combines them in new ways. |
| **Progression** | Islands unlock in order by default. A **"Free explore"** setting opens them all. Each island has 3-5 teaching NPCs, 3-6 chests, 1-2 puzzles, and 1 Trial, which awards a **Seal** and lights the lighthouse. Doubloons buy cosmetics (sails, hats, figureheads, parrot hats). About **25-45 min per island**, since the voiced dialogue alone is a large share of that. Required stops on each island are clustered about a 60-90 s walk apart, with at most one deliberately long scenic walk. |
| **Map (Captain's Chart)** | A full-screen parchment chart with an animated compass rose, ink coastlines, and fog that clears. Click an island to see its chapter, progress (NPCs, chests, puzzles, Trial), and **Sail there** or **Fast travel** (to lit lighthouses). In **Free explore**, you can pick any island from the chart and jump straight there. There's also a zoomed island map with points of interest. |
| **Menus** | The title screen has a live 3D backdrop at golden hour with a slow camera orbit. Its contents are defined once in **§13.5**. The first island streams in only after New Voyage/Continue. It offers **Continue · New Voyage · Chart · Logbook · Settings · Controls · Credits · Quit** (Quit saves and returns to the title, since browsers can't close tabs). The pause menu mirrors it. |
| **Character creation** | Man or woman pirate, plus name, skin tone, hair, and outfit/sash colors. |
| **Save** | Autosave at checkpoints to localStorage (puzzles checkpoint at their start), with "Keep my journey" / "Begin anew". Export/import a save code. |

---

## 6. Visual direction & tech

### Recommended stack
- **TypeScript + Vite** (same foundation as Arkenfall)
- **three.js `WebGPURenderer` + TSL** (`three/webgpu`, `three/tsl`): node materials, compute, and the `RenderPipeline` post stack, with the automatic WebGL2 backend as the fallback (§0, §15). No GLSL strings or `onBeforeCompile`. Techniques from the GLSL-based studies are re-expressed as TSL nodes.
- **Rapier** (WASM physics), limited to **primitive static colliders** (boxes, capsules, heightfield), scene queries, and the **kinematic character controller**. The POC has no dynamic rigid bodies: push blocks are grid logic, and the boat is a kinematic hull on analytic buoyancy
- **React DOM overlay** for menus, dialogue, quizzes, map, and logbook, plus a small store (e.g. Zustand) to bridge the game and the UI
- **Web Audio:** streamed CC0 music tracks crossfaded through the music bus, plus a **sample-based soundscape** (CC0 field recordings, HRTF panners, buses, ducking, voice caps; Tidewater's `SoundScape` design) and streamed voice lines
- **Vite code splitting** (dynamic `import()` chunks), a **pack builder** with a hashed `manifest.json`, and a **Workbox Service Worker** for modular loading and caching (§13)
- **gltf-transform** (meshopt + KTX2) and headless **Blender** scripts to restyle and optimize CC0 assets
- **Vitest** (quiz/puzzle/save logic) + **Playwright** (menu flows, visual smoke tests)
- Hosting: **GitHub Pages**. A GitHub Actions workflow builds `dist/` and deploys it with `actions/upload-pages-artifact`. There's **no Git LFS** (Pages would serve LFS pointer files) and **no Releases-hosted bundles** (release downloads redirect cross-origin, so browsers can't reliably fetch them from the Pages site). Generated voice files and compressed textures are small enough to commit directly. Limits to keep in mind: every file < 100 MB, the site < 1 GB, and a soft bandwidth cap of ~100 GB/month

### Rendering features ("stylized realism")
- **Water:** see the **Water system** section below.
- **Sky:** a physically based atmosphere (Hillaire-style transmittance + sky-view LUTs, as fragment passes on WebGL2), a warm horizon glow, aerial-perspective haze, **distant mountain silhouettes**, and a sun, moon, and stars.
- **Clouds, tiered:**
  - **Lite/Low:** a curved, drifting cloud layer (silver-gold edges toward the sun, cool undersides).
  - **Medium+:** a low-step, quarter-res raymarched cloud dome with temporal reprojection.
  - **WebGPU High/Ultra (if adopted):** volumetric cumulus + cirrus.
  - **Every tier from Low up** gets a **cloud-shadow map on the land** (a 128-256² sun-transmittance map, updated a slice per frame), which is cheap and very high impact.
- **Time of day & sun position (a player-facing feature):**
  - **Sun direction** comes from a parametric sun path (latitude, declination, hour angle) **rotated by a sun-azimuth setting** (Tidewater's model).
  - A **night factor** from sun elevation drives stars, the moon (with a **sun→moon key-light handoff** through twilight), night ambient, **emissive windows and lanterns**, and **the 8 nearest local lights** (inverse-square, optional spot cone, no shadows).
  - **Changes are cheap:** only the sky LUT and uniforms update. The **environment map + PMREM refresh progressively** (one face or roughness level per frame, only after a meaningful sun move), and the cached shadow map refreshes on sun moves (§12.4).
  - **Islands start at their authored time** (dawn, noon, golden hour). The player can **change the time and sun azimuth**, pause time, or let it flow, from Settings → **Sky & Time** (a draggable sun-dial) and in photo mode. The ~20-parameter **lighting keyframes** (sun colour, hemisphere, fog, mist, sky and cloud colours, exposure, bloom, shafts, lamps, white balance) are now **keyed by sun elevation** and blended continuously, and they still blend between islands while sailing.
- **Atmosphere:** **analytic exponential height fog** (closed-form, no ray-march), distance haze, and **low mist banks** that drift over water and glow where the sun rakes through. Fog colour follows the view direction relative to the sun (cool → warm).
- **One shared wind field:** gust fronts roll across the world along the wind direction. The **same field** drives grass, palms, flags, **sails (tied to the sailing wind and trim, with luffing into the wind)**, and CPU springs on sashes, coats, and hanging nets.
- **Terrain:** heightmap islands with sand/grass/rock/dirt splat blending using CC0 PBR textures, triplanar cliffs (skipping weak projections), and **wet-sand darkening** where waves run up.
- **Vegetation:**
  - **Geometry and placement:** procedural plants (palms, banana plants, ferns, broadleaf trees, shrubs, and per-biome additions: cactus, pines, castle gardens) placed by **rule-based scatter** (height, slope, gullies, exclusions, min spacing). Tidewater's JS is reusable.
  - **Grass:** in **8 m cells**, with near/mid/far tiers (~18/46/88 m, scaled per quality tier) and **wind sheen**.
  - **Trees & shrubs:** **octahedral impostors baked at build/load time** (coverage, normal, AO; colour applied per instance), handing off at ~75 m for trees and ~45 m for shrubs.
  - **LOD transitions** are **dithered** (Bayer), never alpha-blended.
  - **Shading:** shared-wind sway, and **translucency** for fronds, leaves, and petals when the low sun is behind them.
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
- **Birds (staged, not random):** species-specific behaviours on a coordinated-turn flight model:
  - **gulls** perch on rails, roofs, beaches, and **the brigantine's yards**, and **flush when you approach or set sail**
  - **terns** patrol, **pelicans** fly in lines and plunge-forage, **frigatebirds** soar in high circles with almost no flapping, and **shorebirds** chase the swash
  - landings follow curved paths with the legs dropping, and there's one instanced draw for every species
  - **per-island casts:** parrots in Thousand-Bough's jungle, crows around Keelhaven, swifts around Guildcrest, and desert raptors at Sunspire
- **Ambient life:** lagoon fish (schooling ecology), crabs that scuttle and burrow, butterflies, fireflies at dusk, chimney smoke, drifting leaves, boats bobbing at their moorings, and **distant ships crossing the horizon**. All particles **wrap inside camera-following boxes**, so nothing is spawned or allocated per frame.
- **The "Leaps" director (jumping fish & dolphins):** a stager, not a random spawner. Every ~15-45 s, **in daylight with the camera above water**, it picks a spot ahead of the camera and **only commits if the *entire* leap stays on screen**. It also has to stay **clear of UI text** (title logo, menus, prompts) and away from the ship and the camera-to-ship line. **Leaps never start during dialogue, quizzes, puzzles, the Chart, the Logbook, or pause.** The **title screen is exempt** from that rule, since the text-box avoidance keeps leaps off the logo and menu. **Reduced motion disables Leaps and their splash sounds**, and **Lite** has none.
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
| **Surface motion** | Open sea: **4-6 Gerstner waves with deep-water dispersion `ω = √(g·k)`**, defined in **one TS table that builds the TSL wave nodes** (it's all TS, so there's no code generation), plus two scrolling detail-normal layers, with amplitude by zone (calm lagoon → open swell). Amplitude also fades with camera distance (`exp(-d/≈240 m)`), **identically on CPU and GPU**. The mesh is a **camera-centred polar grid** (geometric ring spacing out to ~1.6 km). Each vertex carries its spacing, so **wave components the grid can't resolve are dropped instead of aliasing**. Rivers, waterfalls, and **the P0.1 sluice channels** use **two-phase flow maps** (no visible reset). Wind ripples on top | All (**Low/Lite: 3 Gerstner waves**) |
| **Reflection** | **Baseline:** a Fresnel (Schlick) reflection of a **prefiltered PMREM sky map**, spread by roughness. **Roughness grows with unresolved wave variance and the normal's screen derivative**, so far water becomes a soft sheen rather than sparkling noise. Sun glints use a **microfacet (Beckmann/Smith) BRDF** plus **Poisson sparkles** sized to the pixel footprint. **Ships reflect analytically (no second render), tiered:** a simplified hull SDF is ray-tested with **4 jittered normals on High/Ultra** and **1 ray on Medium**, only inside the ship's screen rectangle. **Low** shows just a cheap darkened "hull smear" gradient under the ship, and **Lite** shows nothing. **Add-on for calm zones:** a **half-res planar mirror pass** (DPR ≤ 1.3) inside the lagoon and harbor basins only. It uses a `noReflect` layer (grass, particles, small props excluded), a global `uReflect` flag that puts every material on a **cheap shading path**, frozen shadows, and normal-distorted lookups | Baseline: all. Hull rays: High/Ultra 4, Medium 1, Low smear, Lite none. Sparkles: Medium+. Mirror: **High/Ultra**, calm zones only, **≤ 35% of the main pass** (Phase 0 fails above that), never in the Floor shot |
| **Refraction & colour** | Copy the opaque pass to a **half-res target with linear depth in alpha**. Offset the lookup by normal × depth, and **fall back to the undistorted sample if the offset hits something in front of the water**. Colour is **Beer-Lambert absorption along the optical path** (depth ÷ view angle, clamped to the depth-buffer bed distance) plus an in-scatter body colour. **Per-island absorption presets**: turquoise lagoon, deep-blue ocean, jade river, and inky volcanic | All (Low: no distortion offset) |
| **Seabed** | **Caustics** injected into the terrain material as *extra sunlight* (so shadows still hold), fading with depth and distance. **Underwater light attenuation** on anything below the waterline (so the shallows don't glow). Terrain uses a matte, wet look below the surface | Medium+ |
| **Foam** | "Lace" foam (coverage eroding multi-octave cells, never solid sheets), depth-based **shoreline foam**, a **coast-foam ribbon extracted from the real shoreline contour at build time** (marching squares) with a surge travelling along the coast, **reef-break foam lines**, wave-crest foam from Gerstner steepness, and a **beach run-up (swash)** band with receding wet sand. Noise is **only evaluated where foam is possible** | All (**Low/Lite: one shoreline band + 1 lace octave**) |
| **Boat ↔ water** | All **analytic in the water shader**, with no particles or simulation: **Kelvin wake arms + churned trail**, a **bow-wave crescent**, hull-hugging streaky whitewater, rings around the hull at rest, and a **hull cut-out** (water discarded inside the hull, using the *same* hull function as the CPU). The **boat's shadow on water** is ray-stepped against that hull function. The hull also gets a **waterline foam ring** that rides the Gerstner surface, a **wet band** that follows the real sea height, and **spray bursts when the bow slams** a wave (hull-point vs sea velocity) | All (**Low/Lite: one wake term**, no shadow march, no spray) |
| **Other interaction** | Rings + foam around the player's legs when wading, and rings where crates or oars touch water | Medium+ |
| **Night & weather (post-POC)** | Lantern glints smeared into columns by the ripples, rain-ring fields, and wetness | Medium+ |
| **WebGPU compute layers** (adapted from Tidewater, §15) | **4-cascade FFT ocean** (JONSWAP/TMA, persistent Jacobian foam) replacing Gerstner offshore, **ShoreWaves** travel-time refraction around headlands (analytic, *all* tiers), **ShoreSim** swash/foam/wet-sand field, **breakers** synced to spray, **spectral WakeSim** for the brigantine, a **GPU spray pool**, and **SSR** in calm zones | FFT/sims/spray: WebGPU Medium+ (reduced) and High/Ultra (full). ShoreWaves: all |

**Single sources of truth:** the Gerstner wave sum, the terrain height `h(x,z)`, shore distance, and hull shape are each written **once in TS**, and the GPU side is **built from the same TS as TSL nodes**. There's no second shader copy to drift. With the **FFT ocean** (WebGPU tiers), the CPU samples the waves either via async GPU readback with latency prediction (Tidewater's `WaterQuery` approach) or via a matched CPU Gerstner/low-cascade approximation. Phase 0 T5 picks one per tier. Buoyancy, placement, wading depth, wake, and cut-out all use them, so what you see always matches what the game simulates. Because Gerstner moves points sideways, the **exact surface height at a world point is found by inverting the horizontal displacement** (a 2-3 step fixed-point iteration) before sampling.

### Physics & motion
- The **agreed split stands:** Rapier provides only primitive static colliders, scene queries, and the kinematic character controller. There are no dynamic bodies, and push blocks are grid logic.
- **Boat (no physics engine, following the Valley's approach):**
  - a **kinematic hull sampled at ~8 points** along the keel, each widened by the analytic beam
  - tested against **circle/capsule obstacles** (dock posts, rocks, buoys, moored ships) and the shoreline distance field, with **3-4 iterations of depenetration**
  - **Impact response:** a hard bow hit reverses a little speed and adds a decaying shake. A glancing hit adds drag.
  - **Grounding:** the depth from `h(x,z)` under the hull slows you in the shallows before you touch sand.
  - **One horizontal integrator, in this order:** trim/rudder set the target speed and heading → drag + a small orbital nudge → integrate → depenetrate. There's no other writer of XZ.
  - **Motion feel (fixed-timestep):** **heave, pitch, and roll are damped springs** (and they write *only* those three) toward the exact sea height at **~8 hull stations**. Each has its own natural frequency and damping, so the hull *lags, overshoots, and settles* instead of snapping to the waves.
  - **Layered on top:** **orbital-velocity coupling** (the swell nudges the ship), **anisotropic drag** (easy forward, hard sideways), **heel from apparent wind and turning**, and **crew-load heel** (the ship leans slightly toward you as you walk the deck).
  - **Stability:** substeps are capped per frame, with clamps and a NaN guard.
- **Moored & NPC ships:** the same buoyancy, plus a **nonlinear mooring/anchor-rope spring** and wind drag, so anchored ships **swing and weathervane** naturally in the harbor.
- **Secondary motion:** a **fixed, small set of CPU springs on the player's ship only** (lanterns, blocks, 1-2 lines) sways from the **hull's measured acceleration**. Flags, pennants, laundry, and sails billow **in the vertex shader** on the shared wind.
- **Autopilot (POC):** the **P1.2 Autopilot voyage**, the chart's **"Sail here"** auto-sail, and docking assist follow **authored waypoint splines**. Manual input always takes over. A **scoring lane planner** (candidate headings vs obstacles every ~0.2 s) is **post-POC**, for free-roam autopilot.
- **Player on foot:** the kinematic controller + `h(x,z)`. Wading slows you and spawns ring shaders, and deep water gently returns you to shore (POC).

### 6a. AI-assisted art pipeline
- **Image model** (`AI_IMAGE_*` in `~/.env`) generates the parchment map & island illustrations, NPC portrait paintings, loading-screen art, Logbook page ornaments, UI flourishes, and **tileable textures** (sand, plaster, thatch, sailcloth) that we then turn into PBR maps.
- **3D:** we start with CC0 kits. For hero pieces (the citadel, the ships, the world-tree) we can try image-to-3D later. That needs a separate service, since it isn't in `~/.env`.
- Every generated asset goes in an `ART_PROVENANCE.md` log: prompt, model, date, file.
- Keys are only ever used by **offline build scripts**, never in the browser.

### Quality tiers & budgets
- **Low / Medium / High / Ultra** presets, plus resolution scale. The full per-tier budgets and efficiency rules are in **§12**.
- Targets per device class are in **§12.1 and §14.1**: the **floor is Intel UHD 620 at 30 fps (Low)**, Chromebooks use **Lite**, and Iris Xe/M1 Air are Medium.
- Download size: **≤ 4 MB (wire) to the title**. Its contents and time-to-interactive targets are in **§13.5**. Code and content load on demand as modules and packs (**§13**).

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
- **Cast:** the UK HD voices in `~/.env` are the defaults: `en-GB-Ollie` (`AZURE_SPEECH_MALE_VOICE_UK`) and `en-GB-Ada` (`AZURE_SPEECH_FEMALE_VOICE_UK`), both `DragonHDLatestNeural`. Juno, who sails with you to every island, uses Ada. Other characters use the other UK HD voices (`en-GB-Sonia`, `en-GB-Ryan`) or a distinct regional neural voice, so no two characters on one island share a voice (changed 2026-09-25). We'll add more Azure neural voices and regional English accents per character, chosen respectfully and never as caricature. Rate and pitch settings give each character a distinct personality. The **parrot** uses a pitch-shifted, bright voice with audio FX.
- The player can type any name, so **spoken lines call you "Captain"** while the on-screen text uses your name.
- **Lip sync** comes from Azure viseme events where the voice supports them, and falls back to amplitude-driven jaw movement. Subtitles are always on, with word-by-word highlighting from word-boundary events.
- Settings include a voice volume slider, "skip voice", and a text-only mode.

### Music plan: recorded CC0 tracks (changed 2026-09-25)
- **The decision:** we built a generative Web Audio score first (a look-ahead composer with adaptive layers and stingers). Dan A/B'd it against CC0 recordings and picked the recordings: **"Medieval: The Bard's Tale" by RandomMind** for the title screen and open sea, and **"Reggae" by Pro Sensory** for Anchorage Cay. Both are CC0 from OpenGameArt and logged in `ASSETS.md`. `tools/music/fetch.sh` re-downloads them, checks their hashes, trims the dead air, and encodes Opus + AAC.
- **How it plays:** each track streams from its own `<audio>` element through the music bus, so the sliders, mute, and the voice duck all apply. Tracks loop, are loudness-matched to -13.7 LUFS, and **crossfade over 3 s** when you go ashore or set sail. A track you leave pauses and picks up mid-song when you come back.
- The generative composer is in git history (last in commit `cafbe02`) if we ever want adaptive layers back.
- **Future islands** get one CC0 track each, picked with Dan. The table below is the mood brief for choosing them.

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

- **Ambience & SFX: real CC0 field recordings** (decided 2026-09-23), not synthesis:
  - **Sources:** Tidewater's 31 Freesound CC0 files (surf crash/wash/backwash, gulls, terns, wind, palms, crickets, boat laps and hull slaps, footsteps on sand, wet sand, wood, rock, grass, and water, splashes, underwater) plus more CC0 Freesound/Kenney for village, market, forge, rigging, and the jungle.
  - **Mixing:** spatialized with **HRTF panners** on buses with a limiter and **ducking under voice**, with **voice caps** per sound type.
  - **Timing:** **surf timed to the ShoreWaves crash/wash/backwash**, **footsteps chosen by surface**, and beds that follow the time of day.
  - **Loading:** gesture-gated and **lazy-loaded per island** as Ogg/Opus (+ AAC fallback), about 5 MB per island, inside the §13 pack budgets.
  - **Credits:** every file is logged in `ASSETS.md` with its author and link.
- Settings have separate sliders for Music, Ambience, SFX, Voice, and UI.

---

## 8. Content pipeline (course → game)

**Goal (Dan, 2026-09-26):** the course's text and screenshots are **retrieved dynamically** from [`github/copilot-app-for-beginners`](https://github.com/github/copilot-app-for-beginners), so the islands stay current as the course changes. Nobody should have to copy text or re-export screenshots by hand.

> **Status (2026-10-10): planned, not built.** §8.1-8.4 describe the design. Today the course screenshots are bundled copies in `public/course/{ch00,ch01,shared}`, and all teaching content is authored in `src/learn/content/*.ts`. The only piece built so far is the README section parser, `src/learn/course/sections.ts` (with tests). `CourseSource`, `course.lock.json`, the snapshot fallback, the Service Worker rule, and `weekly-refresh.yml` don't exist yet.

### 8.1 What's live and what's authored

| Layer | What it covers | Source | How it updates |
|---|---|---|---|
| **Course-derived (live)** | Section text ("From the course" excerpts in Logbook pages, chest scrolls, spyglass captions), screenshots and illustrations, alt text, chapter titles, learning objectives, key takeaways, the glossary (`GLOSSARY.md`), and section links | **Fetched at runtime** from the course repo | Automatically, within minutes of a course commit |
| **Game-authored** | Voiced NPC dialogue, quiz questions and answers, hotspot rects, puzzles, quests | Typed TS modules (`src/learn/content/*`). They point at the course **by chapter + heading anchor + image filename** and never copy course text | When we change it. The drift check (§8.4) tells us when the course moved underneath it |

Two things can't be fully live, and that's why they stay authored:
- **Voiced lines** are pre-generated with Azure TTS at build time (§7a), and the Speech key can't ship to the browser.
- **Hotspot rects** are positions on one specific screenshot. If a button moves, a stale rect would mark the right answer wrong. §8.3 guards them.

### 8.2 Runtime fetch

- **Where from:** `https://raw.githubusercontent.com/github/copilot-app-for-beginners/<ref>/…`, meaning each chapter's `README.md`, `GLOSSARY.md`, and the `assets/*.webp` those files reference. Raw GitHub sends `Access-Control-Allow-Origin: *` and `max-age=300` (verified 2026-09-26). `<ref>` defaults to `main`, and `?course=<sha>` pins a commit for testing. We **never call the GitHub REST API**, since it only allows 60 unauthenticated requests per hour per IP.
- **Parsing:** a small `CourseSource` module splits each README into sections `{anchor, title, markdown, images[]}`:
  - Anchors use GitHub's heading-slug rules, so they match the "Open in the course ↗" links.
  - It handles both `![alt](path)` and `<img src alt>`, resolved relative to the chapter folder (e.g. `../assets/github-copilot-app.webp`).
  - Text renders through a sanitized, allow-listed markdown renderer: no raw HTML except `<img>`, and links open in a new tab.
- **When:** a chapter's README is fetched along with its island's packs and prefetched during the sea passage (§13.4). Screenshots lazy-load per chest and NPC, same as today (§12.6).
- **Caching:** the Service Worker caches course responses **stale-while-revalidate** (§13.6). Course content shows instantly from cache and refreshes in the background. A new version is picked up the next time a page or quiz opens, never swapped mid-dialogue.
- **Fallback:** every build bundles a **snapshot** of the course (the text plus the images in `public/course/*`) and `content/course.lock.json`, which holds the snapshot's commit SHA and a hash for every section and image. If the fetch fails, the player is offline, or the parse breaks (e.g. a chapter folder gets renamed), the game quietly uses the snapshot. It never breaks just because GitHub is unreachable.

### 8.3 Guarding authored content when the course changes

Each authored quiz, hotspot, and voiced line records the hash of the section or image it was written against (from `course.lock.json`). At runtime:

| What changed upstream | What the player sees |
|---|---|
| **Section text** | Logbook pages and excerpts show the new live text. Authored lines keep working, since they paraphrase rather than quote |
| **A screenshot used by a hotspot quiz** | The quiz keeps using the **bundled snapshot image**, so its targets stay correct. The Logbook page for that image shows the new live screenshot |
| **A screenshot used anywhere else** | The new live image, straight away |
| **An anchor or image was renamed or removed** | That item falls back to the snapshot, and its course link falls back to the top of the chapter README |
| **A whole new chapter** | The Chart shows it as an **uncharted island in the fog**, with a link to the chapter, until an island gets built for it |

### 8.4 Weekly refresh automation (CI)

One scheduled GitHub Actions workflow, **`weekly-refresh.yml`**, keeps everything the course feeds into the game up to date. It runs **Mondays at 6 AM Pacific** (`cron: '0 13 * * 1'`), and you can also start it by hand (`workflow_dispatch`) when you know the course just changed. If nothing changed upstream, it finishes in about a minute and doesn't open a PR.

| Step | What it refreshes | How |
|---|---|---|
| **1 · Course check** | — | Compares upstream `main` against `course.lock.json`. If the SHA matches, it skips to step 6 |
| **2 · Content** | Chapter text, section excerpts, learning objectives, key takeaways, the glossary, alt text, and the course's `LICENSE` notice in the credits | `tools/course/sync.mjs` pulls the READMEs and `GLOSSARY.md`, re-parses the sections, updates the snapshot, and recomputes every section hash |
| **3 · Screenshots** | Every course image the game references, plus any new image a chapter we've built starts using | The script copies them byte-for-byte (today's `public/course/*` files are identical to upstream), then rehashes. Changed hotspot screenshots get before/after montages for the PR |
| **4 · Drift report** | — | Lists every authored quiz, hotspot, voiced line, and puzzle whose source section or image changed. A **UI-term check** also pulls the bolded UI names from each section (**New**, **My work**, **Automations**…) and flags authored lines that still use a name the course dropped or renamed |
| **5 · Drafted fixes** | Affected dialogue, quiz text, and hotspot rects | The **Copilot coding agent** gets the drift report as an issue. It drafts the edits in the same PR and runs the tests, and it never merges anything itself |
| **6 · Voices** | Voice lines whose text or voice changed, including step 5's edits | `tools/voice/generate.ts` regenerates **only changed lines** (cached by hash, §7a) with `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` from Actions secrets. It also confirms every configured Azure voice still exists and flags any line that fell back to its backup voice |
| **7 · Other sources** | CC0 music, ambience, and kit assets | Re-checks each source URL and sha256 (`tools/music/fetch.sh --check` and the `ASSETS.md` list) and flags anything that moved or changed |
| **8 · Verify** | — | Typecheck, unit tests (including every `SourceRef` anchor and image resolving against the snapshot), a live-course parse, build, budgets, the secret scan, and the scripted suite (flow · play · quest · usertest) on the WebGL2 backend |
| **9 · Deliver** | — | One PR: **"Weekly refresh: course @ `<sha>`"**, with a summary of what changed, the drift report, before/after images, the regenerated voice lines, and the TTS characters used |

**Merge rules:**
- **Nothing authored affected and every check green:** the PR auto-merges, then redeploys Pages (once public deploys are switched on, §10).
- **Anything authored affected, or any check fails:** the PR gets a `needs-content-review` label and waits for you. The dev-only **Hotspot Editor** opens straight to the affected quizzes, and it rejects any mask that overlaps a target rect.

**Cost:** a no-change week uses about 1 Actions minute. A week with changes uses roughly 15-25 minutes (mostly the scripted suite) and pennies of Azure TTS, since only changed lines are resynthesized. The coding agent only runs in weeks where authored content was affected.

**Needs before it can run:**
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` as repository Actions secrets. The generator reads environment variables first and falls back to `~/.env` locally.
- The §8.2 `CourseSource` and snapshot/lock, since steps 2-4 depend on them. Steps 6-8 can ship first.

### 8.5 Authoring rules

- Content is authored per island in typed TS modules: NPCs, dialogue, chests, quizzes, puzzles. Every teaching line is tagged with its **source chapter + section** and carries an **"Open in the course ↗"** link.
- Authored text paraphrases in the game's voice. Anything that should read *exactly* like the course comes from the live excerpt instead of being copied.
- Anything a learner does "for real" in the app is an optional **"Try it in the app"** side quest that links to the chapter. The game itself is self-contained.
- **Licensing and privacy:** the course's full MIT notice in the credits covers fetched content, just as it covers bundled content. Fetching from `raw.githubusercontent.com` means GitHub sees the player's IP (the same as clicking a course link), so the credits' privacy note says so. If we add a CSP, it has to allow `raw.githubusercontent.com` in `connect-src` and `img-src`.
- **Roadmap:** Chapters 00 and 01 were authored before `CourseSource` existed. When it's built, migrate both chapters to it, and author later chapters against anchors from the start.

---

## 9. Accessibility

Text size, dyslexia-friendly font option, adjustable text speed, high-contrast UI, and reduced motion (no camera bob or shake, lantern flicker, sun shafts, **Leaps and their splash sounds**, or loader drift, and cloud drift slows to near-static). Also: colorblind-safe quiz feedback (icons + color), full keyboard navigation of the UI, rebindable controls, and a **no-pointer-lock default look** (hold right mouse, arrow keys, or gamepad) with pointer lock as an option. Plus camera sensitivity/invert/FOV, separate volume sliders, and captions for every sound cue that matters.

---

## 10. Roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| **0 · Look, sound & perf spike** | One frame that shows **the polar-grid ocean (with analytic ship reflection), one restyled building cluster, a dressed pirate, and ≥ 8 skinned NPCs**, plus sky, clouds, character + camera, sailing and docking the brigantine, a prototype of the procedural music engine (one island theme), the voice pipeline (a few lines), and the debug HUD + benchmark flythrough (which also measures physics time).<br>**Water must show every layer of the Water system**: Gerstner swell → calm lagoon with **refraction + absorption + caustics**, shoreline/reef foam and **beach run-up**, **analytic wake + bow wave + hull cut-out**, a flow-map channel, and the **High-tier harbor mirror**.<br>Also required: cached shadows, sun shafts, the shared wind (grass, palms, sails), mist/height fog, adaptive resolution, the `shot()` debug API, and the **§13 loading skeleton** (boot/title chunk split, the manifest + one streamed pack, and the Service Worker), with its §13.5 title budget measured.<br>It's judged on **two shots**: a **Floor shot** (the Low feature set in §12.1, on the Low budget) and a **Beauty shot** (mirror, caustics, sun shafts, on the High budget). Each water layer's cost is measured separately. The §14.5 capability ratios are a **smoke alarm with margin, not a hard gate** | You approve the *look*, the *sound*, and the *frame rate* |
| **1 · Proof of concept** | **Islands 00 + 01 fully playable**, plus all core systems: **tablet touch controls** (with **one cloud iPad A13+ pass through both islands**), a **2D Chart & Logbook proof slice** (title → Chart, Q0.2, H0.2, P0.1), menu, character creation, dialogue, chests/logbook, all quiz types, puzzle toolkit, map/fast travel, settings, save, audio. **Vertical-slice gate first:** Anchorage Q0.2-Q0.8 fully playable with real TTS before the rest of the content is built | You approve the *slice*, then the *fun & teaching* |
| **1b · Reach** | **Full 2D Chart & Logbook coverage** of every Island 00/01 objective and puzzle, plus the **Android tablet** cloud pass | 2D and tablet parity |
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
| Procedural music sounds "synthy" | **Resolved 2026-09-25:** we A/B tested the generated score against CC0 recordings, and Dan picked the recordings (§7) |
| Voice lines add a lot of files | Opus at ~32 kbps (AAC fallback, and each client downloads one format), loaded per island, cached by hash, regenerated only when a line changes |
| Course UI and screenshots change | Planned (§8): live content picks up changes automatically (§8.2). Hotspot quizzes keep their snapshot image when the live one changes (§8.3), and the weekly refresh opens a drift-report PR (§8.4) |
| GitHub unreachable, or the course gets restructured | Planned (§8): a bundled snapshot plus `course.lock.json` fallback, per item (§8.2-8.3). The weekly refresh's live-course parse catches restructures early |
| Trademarks & affiliation (Octocat, Copilot logo, product name) | The MIT license covers the course's copyright, not GitHub's trademarks. We include the **full MIT notice** in the credits, keep screenshots as screenshots, and **never model or generate the Octocat or Copilot logo**. An **affiliation line** (e.g. "Unofficial fan project…" vs official wording) is a **required decision before the first public deploy** |
| Film likeness (the "Pirates of the Caribbean" ship brief) | Build a generic Golden Age brigantine. Don't replicate any specific film ship's distinctive design |
| GitHub Pages bandwidth (~100 GB/month soft cap) | Keep the per-island downloads small, use Service Worker caching, and monitor. Move to a CDN if the game gets popular |
| **Accepted risk (user decision, 2026-09-23):** emulated-only testing leaves the 30 fps floor unverified during content production | The user chose **real-device verification before public launch**. Until then: conservative ratios with margin, the Floor shot, and extra headroom on the Low budget. If the launch check fails, Low features get cut rather than content |
| Emulated-only performance testing misses real iGPU limits | Conservative emulation ratios with margin, cloud real devices for tablets, and one real UHD 620 laptop before public launch (§14.5) |
| "Runs everywhere" scope (tablets + 2D mode) | Shared data-driven content, a 2D **proof slice** in Phase 1 (title → Chart, Q0.2, H0.2, P0.1) with full 2D coverage in **Phase 1b**, and phone UX deferred to Phase 2b |
| Service Worker serves stale or mixed versions | Content-hashed immutable URLs, a network-first manifest, new versions activated only at the title screen, and old packs kept until the new ones verify |
| Player outruns streaming (fast travel, fast sailing) | Critical packs kept small (≤ 8 MB), prefetch starting at the Trial, a diegetic fog-bank slowdown, and a lighthouse transition with progress |
| Scope (8 islands of bespoke content) | Data-driven content + a reusable puzzle toolkit + a shared template per island |

## 12. Efficiency (rendering & runtime)

Efficiency is a **Phase 0 gate**. The spike has to hit these budgets on reference hardware before we build content on top of it. The rules below are adapted from your list. Projectiles exist only in sea battles (pooled cannonballs, splashes, and smoke; docs/specs/BATTLES.md §9). "Mobile" here means the **§14 device classes**: integrated laptop GPUs down to the **UHD 620 floor**, Chromebooks (Lite), and tablets. The same discipline applies.

### 12.1 Budgets per quality tier
| Budget | Lite (Chromebooks, weakest GPUs) | Low (**floor**: Intel UHD 620) | Medium (Iris Xe, M1 Air 8 GB, iPad A13+) | High (M2/M3 Air, RTX 3050, iPad M1+) | Ultra (M Pro/Max, RTX 3060+) |
|---|---|---|---|---|---|
| Target frame rate | 30 fps | 30 fps | 45-60 | 60 @1080p | 60 @1440p+ |
| Render scale / max DPR | ~0.55 / 1.0 | 0.6-0.75 / 1.0 | 0.8-1.0 / 1.25 | 1.0 / 1.5 | 1.0 / 2.0 |
| Draw calls (in-game, **whole frame incl. mirror + post passes**) | < 100 | < 150 | < 225 | < 300 | < 400 |
| Triangles (**summed across all scene passes, incl. the mirror**) | < 300k | < 500k | < 1M | < 2M | < 3.5M |
| GPU texture memory | < 192 MB | < 256 MB | < 384 MB | < 512 MB | < 768 MB |
| Shadows | Blob shadows only | **Static cached map 1024²** (refresh on movement) + blob shadows for characters | Static cache 2048² + dynamic character map 1024² | Static cache 4096² + dynamic 1024² | Static cache 4096² + dynamic 2048² |
| Water | 3 Gerstner waves, PMREM reflection, absorption (no distortion), 1 foam band, 1 wake term, no hull reflection | Same as Lite + **hull smear**, 1 lace octave | + refraction offset, caustics | + **planar mirror in calm zones** (half-res), boat shadow march | + wading/rain detail |
| Post FX | Tone map + grade + dither | Tone map + grade + vignette + grain/dither | + bloom, screen-space radial shafts | + SSAO (half-res), **shadow-map sun shafts** | + DOF, full-res AO |
| JS main thread per frame | < 7 ms | < 6 ms | < 5 ms | < 4 ms | < 4 ms |
| Leaps (jumping fish) | Off | On, splash pool halved | On | On | On |
| Clouds & cloud shadows | Cloud layer, no cloud shadows | Cloud layer + **128² cloud-shadow map** (one slice/frame, one terrain fetch) | Quarter-res dome + 256² | Dome, or **volumetric on WebGPU** (Phase 0b), + 256² | Volumetric (WebGPU) + 256² |
| Initial download (to title) | **≤ 4 MB wire**. Time-to-interactive and title contents are in **§13.5** | | | | |

### 12.2 Draw calls & batching *(your "minimize draw calls")*
- **InstancedMesh / BatchedMesh** for vegetation, rocks, crates, barrels, fences, and modular building parts. Each chunk gets its own instance set, so culling still works per chunk.
- **Merge static geometry** per island chunk (`mergeGeometries`) for things that never move, like docks, walls, and terrain dressing.
- **Texture atlases / array textures** so each island's building kit shares one or two materials.
- **A small material library**, so there are only a few unique shader programs in the whole game. Quality tiers are **uniform- or attribute-driven branches on one TSL material** (not per-tier material variants), so tier changes don't multiply pipelines (§15.4).

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
- **Wind and sway run in the vertex shader** (grass, palms, flags, sails, laundry), so the CPU does no per-instance work. **The one exception** is the fixed small set of secondary-motion springs on the player's ship (§6). Grass bending uses a small "trample" render target around the player.
- The **terrain** blends at most 4 splat layers per chunk, with AO/roughness/metal packed into one texture.
- **Shaders compile during loading.** We call `compileAsync` / `renderer.compile()` with **every object temporarily visible and all layers enabled**, so there's no hitch the first time something appears on screen. Loading runs as staged builds that yield between stages (via `MessageChannel`) and report progress to the loader.

### 12.6 Streaming & async loading *(your "asynchronous loading")*
- The full design is **§13 Modular loading**: code splitting, asset packs, and world streaming.
- **KTX2 transcoding and meshopt decoding run in Web Workers.**
- **Time-sliced GPU uploads** push only a few textures or meshes per frame, so streaming never causes a frame spike.
- The title screen uses the **§13.5 title contents** (no island mesh), so the menu appears quickly. The first island starts streaming after New Voyage/Continue (or is prefetched while you sit on the title, §13.4).

### 12.7 Compression & memory *(your "compress textures and audio")*
- **Textures: KTX2/Basis**, with UASTC for normal maps and ETC1S for albedo. They stay **compressed in VRAM**, using 4-8× less memory than PNG/JPG. Mipmaps are always on.
- **Meshes:** meshopt compression and vertex quantization.
- **Audio:** the music is **one streamed CC0 track per place** (Opus ~100 kbps + AAC fallback, about 2-3 MB each, one format downloaded). It streams after the first gesture, so it's outside the title budget. **Ambience & SFX are CC0 recordings in a ~5 MB per-island ambience pack** (Ogg/Opus + AAC, one format downloaded), counted in the island budget (§13.5). Voice lines are **Opus mono at ~32 kbps** with an AAC fallback, and the client downloads **exactly one format** (via `canPlayType`). They load **per island**, not all up front.
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
- **GPU time is the primary signal.** On WebGPU it comes from **`timestamp-query`** (the renderer's `trackTimestamp` + `resolveTimestampsAsync`). On the WebGL2 backend it comes from `EXT_disjoint_timer_query_webgl2` where exposed. Both are smoothed. If neither is available, we fall back to frame-time and missed-frame counting. **We never rescale during transitions** (fast travel, docking, dialogue cuts), and after a failed upscale we **back off exponentially** (≈ 15 s → 120 s).
- **Dynamic resolution** starts measuring after a ~90-frame warm-up and averages over 60 frames:
  - **Thresholds are multiples of the tier's target frame time `T`** (33.3 ms at 30 fps, 16.7 ms at 60 fps).
  - **Lowering:** above **1.25 × T**, scale × 0.92, or × 0.84 above 2.5 × T. The floor is **0.72** (lower for Lite/Low), and there's an 8 s cooldown after a drop.
  - **Raising:** below **0.85 × T**, scale + 0.05, with a 2.5 s cooldown. A frame that's genuinely hitting its target sits still.
  - It pauses while the tab is hidden, and it can be locked from the debug HUD. Thresholds scale with each tier's target.
  - FXAA + a light unsharp mask restore crispness when the scale is below 1.
- On first launch, a **quick GPU benchmark** picks the starting preset. You can override it in Settings.
- **Settings → Graphics** shows what Auto picked (tier, GPU name, and WebGL2 when on that backend) and one line per tier, built from the `TIERS` row (`src/engine/tier-info.ts`) with examples for the player's platform (Mac, PC, or phone/tablet). **Apply and reload** saves and reloads into the title or back into the game. **Render scale** is Auto (this adaptive resolution) or a fixed 50-100% (125% on Ultra only on screens up to 1.6× DPR); a fixed scale locks adaptive resolution and applies without a reload.

### 12.10 Measuring it
- **Debug HUD** (`?debug`): FPS, frame ms (CPU/GPU), **whole-frame** draw calls and triangles (counters accumulated across all passes, not just the last render), textures, geometries, and JS heap, plus a lil-gui tuning panel.
- **Debug API** (dev builds only, e.g. `window.__isles`): `info()`, `setRes()`, `setPreset()`/`setTime()`, and a deterministic **`shot(id)`** that places the camera, freezes time, and renders one frame. Playwright uses it for **visual-regression screenshots** and for the benchmark. A **`?seed=`** parameter makes ambient systems (Leaps, birds) reproducible.
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
| `vendor-three` | `three/webgpu` + `three/tsl` (**234 KB gz measured**: WebGPURenderer, its WebGL2 backend, and the node system). Its own long-lived hashed chunk | Page load (parallel) |
| `game-core` | Player controller, camera, dialogue runtime, quest/event system, HUD, Logbook, Chart, quiz runtime | Prefetched while the title is idle. Required at New Voyage/Continue |
| `char-create` | Character creator | New Voyage |
| `sailing` | Boat kinematics, damped-spring buoyancy, waypoint-spline autopilot, wake uniforms | First time you board |
| `physics` | Rapier (WASM) for on-foot collision. **Use the separate-`.wasm` build with streaming compile** (`WebAssembly.compileStreaming`) rather than the "compat" build, which inlines base64 WASM (**measured ~1.06 MB gz**) | First time you step onto an island. Not needed for the title or while sailing |
| `public/audio/music_*` | The recorded CC0 music tracks (not a pack; streamed by `<audio>` elements) | Streamed after the first user gesture (audio unlock), one track per place |
| `puzzle-<type>` | Sluice, crane, push-block, pillars, helms | Prefetched within ~50 m of the puzzle |
| `island-<nn>` | That island's build code + **compiled content JSON** (dialogue, quizzes, puzzles, NPCs, lighting and music presets) | With the island's packs (§13.3) |
| `dev-*` | Debug HUD, Hotspot Editor, `window.__isles` | **Dev builds only**. Never shipped |

`import.meta.glob('./islands/*/index.ts')` registers islands without importing them. Vite's preload helper emits `modulepreload` hints for each chunk's dependencies.

### 13.2 Asset packs & the manifest
- A build step (`tools/packs/build.ts`) groups assets into **content-hashed packs** and writes `manifest.json`:
  - `title/ship`: **the brigantine** (the only pack that contains it), part of the title budget
  - `common`: player m/f, parrot, UI ornaments
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
| Page load → title | `boot` + `vendor-three` + title assets + `title/ship` | The instant chart loader (§13.8) |
| Title idle (5 s, no Save-Data) | `game-core`, `common/critical`, and the **saved island's critical pack** (Continue) or **island-00 critical** (new players) | Invisible |
| New Voyage | `char-create` now, then island-00 critical + `physics` + `sailing` | **Character creation + the 45 s intro** cover it |
| Walking an island | `near` zone packs, NPC voice files (~60 m radius), screenshots for nearby chests/NPCs, puzzle chunks (~50 m) | Invisible, since they're already loaded when you arrive |
| Trial started / lighthouse lit | Next island's `critical` + its kit at `later` priority | Invisible |
| **"Set sail"** | Next island raised to `critical`/`near` priority | **The sea passage (~2.5-4 min)** needs only ~1.1 Mbps to finish 20 MB |
| Arriving before it's ready | Remaining critical assets | **A diegetic fog bank** ("the fog of scattered evidence") slows the ship near the harbor while the **lighthouse beam fills to show progress**. If the critical pack still isn't resident after **~20 s**, or a fetch fails, we **retry with backoff and dock into a low-detail harbor** while streaming continues. The ship is never held indefinitely |
| Fast travel (Chart) | Destination critical pack | **Lighthouse-beam transition**: ≤ 2 s if cached, ≤ 10 s uncached at 25 Mbps, with progress shown |
| Returning visitor | Everything from the Service Worker cache | Title ≤ 1.5 s |

### 13.5 Load budgets (over the wire, gzip, High tier)
| Item | Budget |
|---|---|
| `boot` JS | ≤ 150 KB gz |
| `vendor-three` | ≤ 250 KB gz (`three/webgpu`: WebGPURenderer + WebGL2 backend + TSL node system, measured 234 KB gz) |
| Title assets + `title/ship` | ≤ 3.5 MB |
| **→ Title (cold), wire ceiling** | **≤ 4 MB, ≤ 3 s of transfer at 25 Mbps** |
| `game-core` + `sailing` + `physics` | ≤ 1.5 MB |
| `common/critical` | ≤ 4 MB |
| Island `critical` pack (terrain, colliders, near buildings, first NPCs' voice) | ≤ 8 MB |
| **→ First playable after New Voyage (every cinematic skipped), wire ceiling** | **≤ 14 MB, ≤ 6 s of transfer at 25 Mbps** |
| Ambience pack (CC0 field recordings, per island) | ≤ 5 MB (included in the whole-island total). Enforced by the budget CI once packs exist (T3) |
| Whole island, all zones incl. voice + screenshots + ambience | ≤ 20 MB High / ≤ 10 MB Low |

**Time-to-interactive** (measured separately, including shader compile and warm-up):

| Moment | High | Low (emulated floor) |
|---|---|---|
| Loader art visible | ≤ 0.5 s (all tiers) | ≤ 0.5 s |
| Title interactive | ≤ 5 s | ≤ 10 s |
| First playable | ≤ 10 s | ≤ 20 s |

**Title contents (the single definition, referenced everywhere):** ocean, sky, clouds, **the brigantine at anchor** (`title/ship`), and **procedural distant ranges**, with **no island mesh**. **Leaps** run on Low and above (off on Lite and under reduced motion).

### 13.6 Caching & updates (GitHub Pages specifics)
- **GitHub Pages sends `Cache-Control: max-age=600` and gzip only** (no Brotli, verified), and we can't change its headers. A **Service Worker (Workbox)** therefore provides long-term caching:
  - precaches `boot` + `vendor-three` + title assets
  - **cache-first for content-hashed URLs**, which are immutable
  - **network-first for `manifest.json`**
  - **planned:** **stale-while-revalidate for live course content** from `raw.githubusercontent.com` (§8.2). Today's `sw.js` skips cross-origin requests, so this needs an explicit allow-list
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
- **An asymptotic creep** keeps the progress moving during long compiles, but it's **capped at the next real stage's start value**, so it never passes a stage that hasn't begun.
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
| **Floor** (2017-2020, common in schools and enterprise) | **Intel UHD 620/630** | **Low** | **30 fps** at render scale 0.6-0.75. No mirror, sun shafts, SSAO, or caustics. Fewer foam octaves, sparser grass, shadows per **§12.1's Low row** (1024² cached map + blob character shadows), a 128² cloud-shadow map, and NPC animation at a reduced rate |
| Chromebooks & very weak GPUs | Celeron/UHD 600, ARM Mali | **Lite** | 30 fps target: render scale ~0.55, no post except tone map + grade, PMREM water with no refraction, impostor-heavy vegetation, shadows off (blob only), and only one island zone resident |
| Tablets | iPad A13+ (Medium), iPad M1+ (High), recent Android tablets (Low/Medium) | per GPU | Touch controls, larger UI, landscape |
| Phones | iPhone 12+, mid-range Android | *later phase (2b)* | Needs a dedicated small-screen UX |
| **No 3D** | No WebGL2, or hardware acceleration off/software rendering (VMs, remote desktop, locked-down PCs) | **2D mode** | The full course journey in 2D |

### 14.2 Detection & tier choice
1. **WebGPU adapter check (first):** `navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })`. A hardware adapter selects the **WebGPU backend**. A **fallback adapter** (`isFallbackAdapter`) or a SwiftShader one counts as software. We record the adapter vendor/architecture, **features** (`timestamp-query`, `shader-f16`, `float32-filterable`, `subgroups`, `texture-compression-astc`/`-bc`), and limits.
2. **WebGL2 check (fallback):** if there's no hardware adapter, we try WebGL2 through `WebGPURenderer({ forceWebGL: true })`. `WEBGL_debug_renderer_info` strings such as SwiftShader, llvmpipe, "Microsoft Basic Render", or "Software" mean software rendering. Some browsers mask this string, so we also run the benchmark in step 3.
3. **Neither is hardware:** start in **2D mode** ("Your browser isn't using the graphics card…" plus a how-to for enabling hardware acceleration). Test overrides: `?webgl`, `?forceGpu`, `?forceSoftware`.
4. **A ~1.5 s silent benchmark** on the title scene at a fixed render scale, plus GPU-string heuristics and `navigator.deviceMemory` / `hardwareConcurrency` where available. Together these pick Lite/Low/Medium/High/Ultra. The player can always override it, and adaptive resolution (§12.9) fine-tunes within the tier.
5. **Memory-constrained devices** (tablets, 4 GB machines) keep **one island zone resident** and a lower texture tier. Streaming (§13) respects each tier's memory budget.
6. **Device loss / context loss** (common on phones and iPads under memory pressure or when backgrounded) is handled on both backends: WebGPU's **`GPUDevice.lost`** (three's `renderer.onDeviceLost`) and WebGL2's `webglcontextlost` both pause the loop, **recreate the device/context**, and re-upload resident packs from the decoded cache. (The Phase 0 scaffold reloads once. T2 builds the real recovery.)

### 14.3 Browser notes
| Topic | Handling |
|---|---|
| Chrome / Edge / Firefox / Safari | All targets are WebGL2. Playwright runs the same checks on each |
| WebGPU availability (2026) | Default in **Chrome/Edge 113+** (Windows, macOS, ChromeOS), **Chrome Android 121+** (Android 12+, Qualcomm/ARM), **Safari 26+** (macOS, **iOS, iPadOS**, visionOS), and **Firefox 141+ Windows / 147+ macOS**. Firefox Linux/Android and blocked drivers use the WebGL2 backend |
| GPU timing | WebGPU `timestamp-query` where supported, the WebGL2 timer-query extension on some Chrome builds, otherwise frame time (§12.9) |
| Texture formats | KTX2/Basis transcodes to whatever the GPU supports (BCn on desktop, ASTC/ETC2 on Apple and Android) |
| Voice audio | Opus first, AAC fallback via `canPlayType` (Safari versions vary) |
| Audio unlock | The first click, tap, or key press starts the AudioContext (required on iOS/iPadOS) |
| iOS/iPadOS memory limits | Pack budgets, one resident zone on Medium/Low tablets, and context-loss recovery |

### 14.4 2D Chart & Logbook mode
- A **DOM/Canvas-2D experience** built on the parchment Captain's Chart. You travel island to island on the chart, and each island opens as an **illustrated scene** (AI-painted art per location) with clickable characters, chests, and puzzle boards.
- **The content is shared:** it uses the same data files as 3D mode (dialogue, voice lines, Logbook pages, quizzes, hotspots, and puzzle definitions). Each puzzle has a **2D renderer**: the P0.1 channel grid, the P0.2 crane as a top-down berth diagram, the P1.1 push-block grid, the P1.2 helms as three chart voyages (waypoints for Plan, a check-in steering slalom for Interactive, set-and-watch for Autopilot), and the P1.3 rotating banners.
- **Same progress, same save:** Seals, the Logbook, and progress are shared, so a player can switch modes at any time.
- It's also the **accessibility-first path**: fully keyboard- and screen-reader-navigable, with minimal motion.
- It uses the same streamed music (low CPU) and voice, and makes no WebGL calls at all.

### 14.5 Testing without the physical devices (chosen: emulate)
- **Emulated GPU tiers on the M3 Max:**
  - lock the render resolution per tier
  - **scale the GPU-time budget by rough capability ratios** vs this M3 Max: ~4× for M2 Air (High), ~5-7× for M1/Iris Xe (Medium), **~25-35× for UHD 620 (Low)**, ~40-70× for Chromebook-class (Lite). In practice a tier's frame must render in ≤ its budget ÷ that ratio on the M3 Max, measured with GPU timer queries at that tier's render scale. The Phase 0 spec's §5 has the table
  - apply **Chrome DevTools CPU throttling** by approximate single-thread ratios (**~2× Medium, ~3× Low, ~6× Lite**) to catch main-thread and physics costs
  - The ratios are **estimates**, so we'll add a small margin
- **Cloud real devices** (e.g. BrowserStack/LambdaTest) for **iPad and Android tablets**: touch, Safari/iPadOS behaviour, memory, and context loss. **Cloud desktop VMs lack real GPUs**, so they're used for compatibility and 2D-mode checks only, never for performance.
- **Risk:** emulation can't fully predict an Intel iGPU's bandwidth limits or driver quirks. **Before public launch we should test on one real UHD 620 laptop** (a ~$150-250 used 8th-gen i5 ultrabook).

---

## 15. Technology stack: cutting edge, by capability (WebGPU-first)

**Principle:** build on the newest platform features that **modern computers, tablets, and phones actually ship**, and turn them on **per device capability**, never by browser name. Every WebGPU-only feature has a non-compute fallback on the WebGL2 backend, so the game still runs everywhere (§14) and looks fantastic where the hardware allows.

### 15.1 Who gets what
| Capability class | Typical devices (2026) | Backend | Signature features |
|---|---|---|---|
| **WebGPU Ultra/High** | Apple M-series Macs & **iPads** (adaptive resolution is the thermal response), RTX/Radeon desktops & laptops | WebGPU | **4-cascade FFT ocean** (JONSWAP/TMA, persistent Jacobian foam; adapted from Tidewater), **ShoreSim swash + wet sand**, **spectral WakeSim**, **GPU spray pool**, **volumetric clouds + cloud shadows**, **Hillaire atmosphere LUTs in compute**, **GPU-driven culling** (compute + **indirect draws**) for vegetation, props, and birds, **render bundles** (`BundleGroup`) for static towns, **TAAU + RCAS**, GTAO, PCSS near cascade, SSR in calm zones, and **HDR output** on HDR displays (`outputType: HalfFloatType` → extended tone mapping) |
| **WebGPU Medium** | Intel Iris Xe/Arc, M1 Air, iPad A14-A16, and **all phones until Phase 2b** (iPhone 13+, flagship and mid-range Android), which get **no volumetric clouds and no 4-cascade FFT** | WebGPU | 2-cascade FFT (128²) or Gerstner in lagoons, a reduced ShoreSim (384²), the analytic wake + a smaller GPU spray pool, a quarter-res cloud dome + cloud shadows, TAAU, compute culling |
| **WebGPU Low (floor)** | Intel UHD 620/630 (D3D12), Vulkan Chromebooks | WebGPU | The Low feature set (§12.1): Gerstner, analytic swash, no sims, a cloud layer + cloud shadows, render scale 0.6-0.75 |
| **WebGL2 backend** | Firefox Linux/Android, blocklisted drivers, older browsers | WebGL2 (automatic) | Lite/Low/Medium features, **no compute** except transform-feedback particles. The same TSL materials compile to GLSL |
| **No hardware 3D** | Software rendering, no WebGL2 | none | **2D Chart & Logbook mode** (§14.4) |

### 15.2 Rendering technology
- **TSL node materials everywhere:** one shader language that compiles to **WGSL** (WebGPU) or **GLSL** (WebGL2 backend). Shared CPU/GPU functions (waves, wind, terrain, hull) are written **once in TS** and build TSL nodes directly, so there's no code-string generation.
- **Compute (WebGPU):** FFT ocean, shore/wake sims, spray, cloud noise/weather generation, atmosphere LUTs, **GPU frustum + distance culling writing indirect draw args**, and impostor/terrain bakes. Each has a documented WebGL2 fallback (§6 Water system, §6 Sky, §12.1).
- **Modern pipeline features:**
  - **reversed-Z depth** for sea-to-horizon precision
  - **MRT** (colour, velocity, water mask) feeding TAAU and the water compositing
  - a **half-float HDR** pipeline with `RenderPipeline` post
  - **render bundles** for static geometry, which cut CPU submit cost (big on phones and tablets)
  - **storage buffers** for instance data (birds, fish, spray)
- **Texture formats:** KTX2/Basis transcoded at runtime to **ASTC** (Apple, mobile), **BC7/BC3** (desktop), or **ETC2** (Android), with `texture-compression-*` feature detection.
- **Optional GPU features, used when present:**
  - `timestamp-query`: profiling + adaptive resolution
  - `float32-filterable`: higher-precision sim sampling
  - `shader-f16`: cheaper math on mobile, where three exposes it
  - `subgroups`: faster reductions, where exposed
- **HDR & colour:** HDR canvas output on HDR displays (WebGPU, Ultra/High, opt-in in Settings), AgX tone mapping, dithered output. Wide-gamut Display-P3 output is an evaluation item (not native in three 0.186).
- **Optional, never required** (consensus E7): `timestamp-query`, HDR canvas output, worker (`OffscreenCanvas`) rendering, and render bundles are all capability-checked, with fallbacks: frame-time adaptive resolution, LDR output, main-thread rendering, and ordinary draws. iOS Safari often lacks `timestamp-query`, and HDR or worker WebGPU are unreliable there.

### 15.3 Web platform technology
- **Installable PWA:** the manifest + Service Worker (§13.6) give a full-screen, home-screen app on iPad/iPhone/Android, with a **best-effort Screen Orientation lock** (landscape; usually only works in an installed PWA) and the **Fullscreen API** on tablets.
- **Workers:** KTX2 transcoding, meshopt, pack decoding, and scatter/impostor prep run in **Web Workers**. **Rendering in a worker via `OffscreenCanvas`** (keeping the main thread free for UI, input, and audio) is a **Phase 0 evaluation** (T2), adopted only if input and audio stay simple.
- **WebAssembly:** **SIMD** builds for anything we compile (Rapier SIMD, if we keep Rapier). Tidewater's plain-JS capsule/collider player model is evaluated in T11 as a lighter alternative (it saves ~1 MB).
- **Scheduling:** `scheduler.yield()` / `requestIdleCallback` for staged loading, and `navigator.storage.persist()` for offline packs.
- **Input:** Pointer Events + multi-touch, the **Gamepad API with haptics** (`vibrationActuator`), and the Vibration API on Android for tactile beats (chest open, puzzle solved). There's always a setting to turn it off.
- **UI:** React 19 with modern CSS (container queries, `@property` transitions, `backdrop-filter` frosted panels, `color-mix()`) and the **View Transitions API** for menu, Chart, and Logbook transitions (with reduced-motion fallbacks).
- **Sharing:** photo mode → `canvas.toBlob` → the **Web Share API** (the native share sheet on tablets and phones) or a download.
- **Audio:** `MediaElementAudioSourceNode` (streamed music) and HRTF `PannerNode`s.

### 15.4 Keeping cutting edge fast (lessons from Tidewater)
- **Pipeline budget:** we track `renderer.info.memory.programs`, with **title ≤ 40** and **island ≤ 150**. Note: that number counts WebGPU shader **modules** (vertex + fragment + compute, deduplicated by code), not pipelines; render pipelines are counted separately (`renderer._pipelines.caches`, debug only). After issue 231 the island has about 295 modules and 222 pipelines (157 drawn in a typical look-around), so both budgets are still over. We prefer a **small set of uber-materials driven by uniforms/attributes** over many material variants, and we avoid needless MRT/shadow/transparency permutations.
- **Compile only what the next view needs:** the title first, then the island's pipelines **in the background** during character creation, the intro, the sea passage, or the fast-travel transition (§13.4). We **never force-compile hidden effects up front** (Tidewater's 30-60 s first load came partly from this).
- **No private-internals patches** (like Tidewater's `TSLPatches.js`). If one becomes unavoidable, it's isolated, version-guarded, and covered by a test.
- **WebGL2-backend parity is tested** in CI (Playwright forces the WebGL2 backend), and WebGPU is tested on real GPUs locally and on cloud devices.
- **Device loss** (mobile under memory pressure) is handled like context loss (§14.2).
