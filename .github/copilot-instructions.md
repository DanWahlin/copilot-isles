# Kraken Isles: contributor & agent instructions

A browser 3D island adventure that teaches GitHub Copilot courses: **GitHub Copilot app for Beginners**
(`github/copilot-app-for-beginners`) and **GitHub Copilot CLI for Beginners** (`github/copilot-cli-for-beginners`). Each chapter is an island.

- **Plan:** `.plans/PLAN.md` (decisions §0, water/physics/environment §6, budgets §12, loading §13, platforms §14)
- **Specs:** `docs/specs/PHASE-0-spike.md` (current phase), `docs/specs/POC-islands-00-01.md`,
  `docs/specs/COURSE-PACKS.md` (course content as data)
- **Adding an island:** `docs/adding-an-island.md` (the island registry, `src/islands/registry.ts`: one
  package and one registry line for each island; shared code never names an island)
- **Research & reviews:** `docs/research/`, `docs/reviews/`

## Stack

TypeScript + Vite 8, **three.js pinned to 0.186.1**, React 19 for the DOM UI, Vitest, and Playwright. **TypeScript stays
on 6.0.x** until typescript-eslint supports 7.x.

**Rendering is WebGPU-first** (PLAN §15): import from `three/webgpu` and `three/tsl`, and write shaders as **TSL nodes**
(no GLSL strings, no `onBeforeCompile`). The same TSL runs on WebGPU and on the automatic WebGL2 backend. **Compute is
WebGPU-only**, so every compute feature needs a capability check and a non-compute fallback. Keep pipeline counts
within PLAN §15.4, and don't patch three.js private internals.

## Commands

```bash
npm install
npm run dev              # local dev server
npm run typecheck && npm run lint && npm test
npm run build && npm run check:budgets && npm run check:secrets
npm run test:e2e         # builds, serves on 127.0.0.1:4173, runs Playwright (local Chrome; Chromium in CI)
npm run check:frame-budgets -- --base=http://127.0.0.1:5353  # PLAN §12.1 draws/triangles per tier (no-HMR server), measured settled: no warm-up, islands you've left freed, steady frames (UNSETTLED fails; static shadow redraws reported, not gated)
npm run check:opening -- --base=http://127.0.0.1:5353  # the opening's frame gaps (fails over 150 ms; --profile, --webgl, --tier)
npm run check:perf -- --base=http://127.0.0.1:5353  # Low+High: main-thread ms at the tier's CPU throttle (Low 3×) on settled views (quays, towns, sailing; both backends), GPU ms uncapped (WebGPU's pass-timestamp union gated; WebGL2's timer sum printed), the Phase 0 flythrough's triangle peak; median of 90 frames, resampled when noisy; fails over budgets.json `perf` gates, prints PLAN targets missed (--sea=gale, --profile=<dir>, --views, --skip=cpu,gpu,fly)
npm run build && npm run check:audio  # streaming audio on Slow 4G, served like GitHub Pages (HTTP/2 by priority): fails on a music gap > 300 ms or a voiced caption without its voice (--profile=fast3g|dsl|none, --flow=islands|full, --visits=cold,warm, --tap)
npm run check:memory -- --base=http://127.0.0.1:5353  # GPU (renderer.info, honest) + JS heap per stop of Anchorage → Meridian → Thousand-Bough → Anchorage ×2, High+Lite × WebGPU+WebGL2: fails over budgets.json `memory` ceilings, > +10 % tracked / +15 % heap back home, growth between round trips, hitches or WebGPU errors, then quits with Anchorage dormant and starts a new voyage (one Anchorage, memory as the first) (--tiers, --backends, --trips, --out)
npm run toolchain        # installs KTX-Software into .tools/, finds Blender, verifies gltf-transform + ffmpeg
npm run models:sync      # the Model Market's models from GitHub Docs → courses/copilot-app/models.json (-- --check)
npm run content:check    # a course pack's files against courses/schemas/ and the content checks (-- --course=<id>)
```

## Non-negotiables

- **Only copy code with a license that allows it.** Sakura River Valley and the Antikythera artifact are
  **technique-only**. **Tidewater is MIT:** adapted files keep a header (`Adapted from Tidewater © 2026 DRG Software
Solutions LLC, MIT, <path>@<commit>`), and the full notice goes in `THIRD_PARTY_NOTICES.md` (create it if missing).
- **Secrets are build-time only.** Tools in `tools/` may read `~/.env` (Azure Speech, image model). Nothing in `src/`
  may read env keys, and `npm run check:secrets` must pass on every build.
- **Budgets are enforced:** chunk/title sizes via `tools/budgets.json`, and per-tier frame budgets per PLAN §12.1 and
  the Phase 0 spec §5. Tier feature cuts follow PLAN §12.1 (Lite/Low/Medium/High/Ultra).
- **Single sources of truth:** functions shared by CPU and GPU (waves, terrain height, hull shape, wind) are written
  once in TS, and the GPU side is built from the same TS as TSL nodes (no second shader copy).
- **Hot loops don't allocate.** Reuse vectors/matrices, keep a fixed timestep, and after warm-up the hitch guard
  (`window.__isles.hitches()`) must stay empty.
- **Course content is data:** every course word (quests, scripts, barks, quizzes, pages, labels, board
  text, arrival lines, voice lines and audio, the snapshot) lives in a course pack, `courses/<id>/`
  (docs/specs/COURSE-PACKS.md, docs/content-data.md). The game reads it through `src/course/` after a
  voyage loads it; the title loads only each pack's `course.json`. Game code never names a quest id:
  it asks the island's `story` for a condition or event by name (`src/game/story.ts`), and a puzzle
  reads its pack's `"quest"` (`puzzleQuest()`). Mechanics act on the game's own ids (`steer`, `channel`,
  `tavern`, `small`…), and a pack binds its ids to them with `"acts"`; `src/course/neutral.test.ts`
  fails on a course id or word in code. Saves are per course (`kraken-isles.<course>.save.v1`).
  Adding a course: docs/adding-a-course.md.
- **Teaching accuracy:** every teaching line cites its course chapter/section. Don't invent app UI names.
- **Accessibility:** respect reduced motion (PLAN §9), keep keyboard/gamepad/touch parity, and use ≥ 44 px touch targets.
- **Licensing:** log every third-party asset in `ASSETS.md` (CC0 kits, textures) and every AI-generated asset in
  `ART_PROVENANCE.md`. Never model or generate the Octocat or the Copilot logo.
- **Player-facing copy** uses friendly, conversational contractions ("you'll", "doesn't", "isn't").
