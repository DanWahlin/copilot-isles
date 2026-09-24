# Copilot Isles: contributor & agent instructions

A browser 3D island adventure that teaches the **GitHub Copilot app for Beginners** course
(`github/copilot-app-for-beginners`). Each chapter is an island.

- **Plan:** `.plans/PLAN.md` (decisions §0, water/physics/environment §6, budgets §12, loading §13, platforms §14)
- **Specs:** `docs/specs/PHASE-0-spike.md` (current phase), `docs/specs/POC-islands-00-01.md`
- **Research & reviews:** `docs/research/`, `docs/reviews/`

## Stack

TypeScript + Vite 8, **three.js pinned to 0.186.0** (our shaders patch three's chunks), React 19 for the DOM UI,
Vitest, and Playwright. **TypeScript stays on 6.0.x** until typescript-eslint supports 7.x. WebGL2 + GLSL only.

## Commands

```bash
npm install
npm run dev              # local dev server
npm run typecheck && npm run lint && npm test
npm run build && npm run check:budgets && npm run check:secrets
npm run test:e2e         # builds, serves on 127.0.0.1:4173, runs Playwright (local Chrome; Chromium in CI)
npm run toolchain        # installs KTX-Software into .tools/, finds Blender, verifies gltf-transform + ffmpeg
```

## Non-negotiables

- **No copying from reference projects** (Arkenfall, Sakura River Valley, the Antikythera artifact). Study techniques
  from `docs/research/` and write our own code, shaders, and assets.
- **Secrets are build-time only.** Tools in `tools/` may read `~/.env` (Azure Speech, image model). Nothing in `src/`
  may read env keys, and `npm run check:secrets` must pass on every build.
- **Budgets are enforced:** chunk/title sizes via `tools/budgets.json`, and per-tier frame budgets per PLAN §12.1 and
  the Phase 0 spec §5. Tier feature cuts follow PLAN §12.1 (Lite/Low/Medium/High/Ultra).
- **Single sources of truth:** functions shared by CPU and GPU (waves, terrain height, hull shape, wind) are written
  once in TS, and their GLSL is generated from the same constants.
- **Hot loops don't allocate.** Reuse vectors/matrices, keep a fixed timestep, and after warm-up the hitch guard
  (`window.__isles.hitches()`) must stay empty.
- **Teaching accuracy:** every teaching line cites its course chapter/section. Don't invent app UI names.
- **Accessibility:** respect reduced motion (PLAN §9), keep keyboard/gamepad/touch parity, and use ≥ 44 px touch targets.
- **Licensing:** log every third-party asset in `ASSETS.md` (CC0 kits, textures) and every AI-generated asset in
  `ART_PROVENANCE.md`. Never model or generate the Octocat or the Copilot logo.
- **Player-facing copy** uses friendly, conversational contractions ("you'll", "doesn't", "isn't").
