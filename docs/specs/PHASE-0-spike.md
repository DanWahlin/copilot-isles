# Spec: Phase 0: Look, Sound & Performance Spike (v0.1)

> **Gate:** you approve the **look**, the **sound**, and the **frame rate/load numbers** before any island content is built. The spike **isn't a game**. It's the engine proven on one small test cove, built the way the real game will be built.
> Source of truth for techniques and budgets: [`.plans/PLAN.md`](../../.plans/PLAN.md) §6 (Water, Physics, Environment), §7 (Audio), §12 (Efficiency), §13 (Modular loading), and §14 (Platforms).

---

## 1. Scope

**In scope:**
- the engine shell
- the title screen + loader
- one streamed test island, **"Test Cove"**
- the ocean (all tiers), sky/atmosphere, terrain + cliffs + distant ranges, vegetation + wind
- a dressed pirate (m/f) + 8 idle NPCs
- the brigantine (sailing, docking, buoyancy, secondary motion)
- the Leaps director, post-processing, shadows
- a procedural music prototype, ambience, and the voice pipeline (a few lines)
- tier detection + adaptive resolution
- the modular-loading skeleton
- measurement tooling (HUD, benchmark, budget CI, Playwright tier emulation)

**Out of scope:** quests, dialogue UI beyond a subtitle test, quizzes, puzzles, the Chart/Logbook, save, character creation UI (the m/f choice is a debug toggle), touch controls, the 2D mode (only a detection stub + message), and course content. **Only the Anchorage theme** gets music.

---

## 2. Test Cove (the spike island)

One compact island (~300 × 200 m) that exercises **every hard case** in one place:

| Zone | Contents | Proves |
|---|---|---|
| **Lagoon & beach** | Shallow turquoise lagoon, sand beach, reef edge, palms + grass | Absorption, caustics, shoreline foam, swash + wet sand, reef-break foam, flying-fish leaps, wading rings |
| **Headland** | Fluted limestone cliffs (~35 m) rising to a ridge. Tidal notch, wet band, sea cave, strata ledges | Analytic cliffs, the cliff shader, baked AO/sun visibility, rim light, coast-foam ribbon |
| **Harbor basin** | Stone quay + wooden dock, **one building cluster** (restyled CC0 kit, atlased), 2 moored boats, **8 NPCs** idling | Calm-zone mirror (High+), town draw calls, NPC skinning cost, mooring springs, flotsam |
| **Open water** | A 1.2 km loop around the cove, with buoys and a sea stack | Polar-grid ocean, swell, glints/sparkles, wake/bow wave, analytic ship reflection, dolphins, distant ranges + haze |

**Lighting:** the **golden-hour** preset (sun 18°) plus a **noon** preset for comparison. Preset blending is shown with a debug slider.

### 2.1 The reference shots (deterministic via `shot(id)`)
| Shot | Camera | Tier | Budget used |
|---|---|---|---|
| **F1 Floor: harbor** | Quay, looking across the basin to the town and the moored brigantine | **Low** feature set, render scale 0.65 | Low (§5) |
| **F2 Floor: sailing** | Behind the brigantine at sea, cliffs + ranges ahead | Low | Low |
| **B1 Beauty: lagoon** | Low over the lagoon at golden hour, palms + huts reflected, caustics visible | High (mirror + caustics + shafts) | High |
| **B2 Beauty: headland** | Sailing past the fluted cliffs, rim light on the ridge, dolphins | High | High |
| **T1 Title** | Title composition (§13.5 contents) | Each tier | Per tier |

**Benchmark flythrough (60 s):** title → lagoon → headland → harbor (with the 8 NPCs) → sail the loop → dock. It reports avg FPS, 1% lows, GPU ms (timer query), CPU ms, draw calls, triangles, and programs.

---

## 3. Systems & acceptance

| ID | System | Acceptance (all measured by the tooling in S14) |
|---|---|---|
| **S1** | **Engine shell:** `boot` / `vendor-three` / chunk split, renderer, fixed-step + render loop, tiers, adaptive resolution (§12.9: GPU timer + fallback, 1.25×/0.85× T), `window.__isles` debug API, `shot()`, hitch guard, `?seed=` | No programs/geometries/textures created after warm-up (hitch guard empty) along the whole benchmark |
| **S2** | **Sky, atmosphere & lighting keyframes:** procedural sky, curved cloud layer, height fog + mist, sky-sampled land haze, a preset system (~20 params) | Golden hour and noon both approved by you. No sky or fog banding (dither on) |
| **S3** | **Ocean**, the full §6 Water system:<br>• wave table → GLSL, exact height, distance fade<br>• polar grid + `aSpan` filtering, PMREM + roughness AA, glints + sparkles<br>• copy/absorption, caustics, foam layers + coast ribbon + swash<br>• wake/bow/cut-out/foam ring/wet band/spray<br>• analytic hull reflection (4/1/smear/none by tier)<br>• harbor mirror (High/Ultra, ≤ 35%) | Each layer can be toggled in the HUD, **its GPU cost is listed separately**, the mirror stays ≤ 35% of the main pass, and there's no visible aliasing or shimmer at the horizon in a 10 s pan |
| **S4** | **Terrain, cliffs & distant land:** analytic coast/cliff function **baked by a build tool** (heights, AO, sun visibility ×2, rim flag, shoreline contour → foam ribbon), the cliff/rock shader, 3 distant ranges (procedural at load) | The bake is deterministic (same hash twice). Load-time generation of the distant ranges takes ≤ 150 ms on M3 Max (≤ 450 ms at 3× CPU throttle) |
| **S5** | **Vegetation & wind:** one shared wind field (TS + GLSL), instanced palms (3 variants) + grass with trample, translucency, LOD → impostor | ≤ 12 draw calls for all vegetation in F1 |
| **S6** | **Characters:** CC0 base body m/f + pirate outfit, idle/walk/run/wade animations, procedural idle life on 8 NPCs, the kinematic controller (Rapier primitives), hold-RMB camera, wading | 8 NPCs + the player cost ≤ 1.5 ms CPU/frame at 3× throttle. Off-screen NPCs don't animate |
| **S7** | **Brigantine & sailing:** hull defined by **one station function** (mesh + hull SDF + buoyancy from the same source), procedural masts/spars/sails (vertex-shader billow + luffing), damped-spring heave/pitch/roll at 8 stations, one horizontal integrator, trim/rudder, docking assist, a waypoint-spline autopilot demo, a small CPU-spring set (lantern + 1 line), crew-load heel | Motion reviewed on video (lag, overshoot, settle). No NaNs over a 10-minute soak. Docking assist lands within ±0.5 m |
| **S8** | **Leaps director:** flying fish + dolphins, UI-text-box avoidance, reduced-motion off, Lite off | Across 50 seeded spawns there are zero leaps behind the title text or partly off screen |
| **S9** | **Post:** SSAO (half-res), shafts (shadow-map ray-march + temporal on High, radial on Medium), bloom mip chain, AgX, white balance, grade, grain + dither, FXAA + unsharp | Each effect can be toggled, with its cost listed |
| **S10** | **Shadows:** static cache (refresh on movement threshold) + dynamic character map, blob on Lite | Shadow re-render ≤ 1 per ~50 m of travel. No shimmering |
| **S11** | **Audio:** procedural composer (Anchorage theme, 4 layers), ambience (surf, gulls, wind, palm rustle), leap splashes. **Voice pipeline**: `tools/voice/generate.ts` renders **6 lines** (Nell ×3 in HD, Wingman ×3 with FX) to Opus + AAC with word timings, played with synced subtitles | You approve the music and voices. Audio CPU ≤ 1 ms/frame. Music ducks under voice |
| **S12** | **Loading skeleton (§13):**<br>• the manifest + packs `title/ship`, `common/critical`, and `testcove/critical` + `testcove/harbor` (zone-streamed)<br>• Workbox SW (cache-first for hashed files, network-first manifest, activate at title)<br>• the instant chart loader (3 layers, `--p`, stage messages, capped creep, font warm-up)<br>• two-phase warm-up | §13.5 **wire** and **time-to-interactive** targets met at High and emulated Low. A second visit loads the title from the SW cache in ≤ 1.5 s |
| **S13** | **Detection & tiers (§14.2):** WebGL2 check, software-render detection, a 1.5 s benchmark picks the tier, and a 2D-mode *stub* (message + course link) | Forcing SwiftShader (`--use-angle=swiftshader`) routes to the stub. The benchmark picks the expected tier in the emulation profiles |
| **S14** | **Measurement:** the debug HUD (whole-frame counters, per-layer GPU ms, pack residency), the benchmark flythrough, Playwright **tier-emulation** runs (render scale + CPU throttle + the GPU budget ÷ ratio), a CI **budget check** (chunk/pack sizes), and visual-regression screenshots of F1/F2/B1/B2/T1 | One command (`npm run bench`) produces the §5 report table |

---

## 4. Assets for the spike
| Need | Source | Processing |
|---|---|---|
| Player m/f + NPC bodies, animations | Quaternius Universal Base Characters + Universal Animation Library (CC0) | Blender script: retarget check, outfit parts, LODs → glTF + meshopt |
| Building cluster, dock, props | Quaternius/Kenney/KayKit kits (CC0) | Blender restyle + **texture atlas** (2 materials) → glTF + meshopt + KTX2 |
| Palms, grass, rocks | Quaternius Stylized Nature MegaKit (CC0) + procedural grass | LODs + impostor bake |
| Ground/rock/plaster/wood textures | ambientCG / Poly Haven (CC0), plus **1-2 AI-generated tileables** to evaluate that pipeline | KTX2 (ETC1S albedo, UASTC normals), 1K + 2K tiers |
| Brigantine | **Procedural** (hull station function → mesh), with CC0 barrels/crates/rigging props | Built at load from the shared function. Props via glTF |
| Voices | Azure Speech (the `~/.env` key, **build-time only**) | Opus + AAC, −18 LUFS, timings JSON |

Every asset's source, license, and processing is logged in `ASSETS.md` (CC0 kits) and `ART_PROVENANCE.md` (AI art).

---

## 5. Budgets & how they're judged (emulation, per PLAN §14.5)
The GPU ms figures are **measured on this M3 Max with timer queries at the tier's render scale**, and they're a **smoke alarm with margin**, not a hard gate. The real UHD 620 check happens before public launch (an accepted risk).

| Tier (target) | Render (1080p output) | GPU ratio vs M3 Max | **M3 Max GPU budget / frame** | CPU throttle | Main thread budget (throttled) |
|---|---|---|---|---|---|
| Lite (30 fps) | ×0.55 | ~40-70× | ≤ 0.5 ms | 6× | ≤ 7 ms |
| **Low / floor (30 fps)** | ×0.65 | ~25-35× | **≤ 1.0 ms** (33 ms ÷ ~33) | 3× | ≤ 6 ms |
| Medium (45-60 fps) | ×0.9 | ~5-7× | ≤ 2.5 ms | 2× | ≤ 5 ms |
| High (60 fps) | ×1.0 | ~4× | ≤ 4.0 ms | 1× | ≤ 4 ms |
| Ultra (60 fps @1440p) | ×1.0 @1440p | 1× | ≤ 14 ms | 1× | ≤ 4 ms |

The shots are also judged on the §12.1 draw-call, triangle, and texture-memory limits, and the loader/title on §13.5 wire + time-to-interactive.

---

## 6. Build order & tasks
Tasks are tracked in the session todo list. The dependencies are listed so work can run in parallel where possible.

| # | Task | Depends on |
|---|---|---|
| T1 | Scaffold repo + toolchain + CI (Vite/TS/three/React, lint, Vitest, Playwright, budget check, KTX + gltf-transform + Blender discovery) | none |
| T2 | S1 engine shell + S14 HUD/debug API skeleton | T1 |
| T3 | S12 loading skeleton (manifest, pack builder, SW, loader art v1, stage messages) | T2 |
| T4 | S2 sky/atmosphere/presets | T2 |
| T5 | S3a ocean core (wave table → GLSL, polar grid, exact height, PMREM, roughness AA, glints) | T4 |
| T6 | S7 brigantine (station function → mesh/SDF/buoyancy) + sailing + docking | T5 |
| T7 | S3b ocean interaction (wake, bow, cut-out, foam ring, wet band, spray, analytic hull reflection tiers) | T5, T6 |
| T8 | S4 terrain/cliff bake tool + cliff shader + distant ranges + haze | T4 |
| T9 | S3c coastal water (copy/absorption, caustics, shoreline/swash/reef foam, coast ribbon) | T5, T8 |
| T10 | S5 vegetation + shared wind + sails billow | T4, T6 |
| T11 | S6 characters + controller + camera + wading + 8 NPCs + building cluster | T2, T8 |
| T12 | S10 shadows + S9 post | T5, T8 |
| T13 | S3d harbor mirror (High/Ultra) + flotsam | T9, T11 |
| T14 | S8 Leaps director | T5 |
| T15 | S11 audio: composer + ambience + voice pipeline (6 lines) + subtitles | T2 |
| T16 | S13 detection, tiers, benchmark, 2D stub | T2, T12 |
| T17 | S14 benchmark flythrough + tier-emulation Playwright + visual regression + report | T3-T16 |
| T18 | **Review package:** F1/F2/B1/B2/T1 stills, a 2-min video, the audio samples, and the perf/load report → your approval | T17 |

---

## 7. Exit criteria (the Phase 0 gate)
- [ ] You approve the **Beauty shots** (B1, B2) and the **Floor shots** (F1, F2): *"that's beautiful"* on High, *"still good"* on Low.
- [ ] You approve the **Anchorage music**, the **ambience**, and the **six voice lines**.
- [ ] The §5 table is **green** for every tier on the benchmark, or has a written, approved exception.
- [ ] The §13.5 wire + time-to-interactive targets are met (High + emulated Low), and a second visit is served from the SW cache.
- [ ] The hitch guard stays empty across the benchmark, and there are no NaNs over the 10-minute sailing soak.
- [ ] CI is green: lint, types, unit tests, budget check, visual regression, and the no-secrets grep.
- [ ] `ASSETS.md` / `ART_PROVENANCE.md` are complete. No reference-project code or assets are in the repo.

## 8. Phase 0 risks
| Risk | Mitigation |
|---|---|
| The Low floor can't hold 30 fps with a pleasing look | Cut Low features first (sparkles, octaves, foam layers), then render scale. Content is never cut |
| CC0 characters look toy-like next to the stylized-realistic environment | Evaluate early in T11. Fallbacks: custom outfit sculpting, or push the art direction more painterly |
| Procedural music sounds synthetic | A/B test in T15 with you. Richer physical-modelling voices and reverb |
| Water complexity eats the schedule | T5 → T7 → T9 are staged, each reviewable on its own. The mirror (T13) is last and optional |
