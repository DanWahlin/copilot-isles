# Grok Build review: WebGPU-first pivot (2026-09-23)

**Reviewer:** Grok Build CLI (`grok-4.7`, high effort, read-only), resuming the same session.
**Scope:** `508a00c` → `132da8f`: the Phase 0 spec + scaffold, the Tidewater study, and the WebGPU-first pivot (PLAN §15, CC0 ambience, the migrated scaffold).
**Verdict (round 1):** *Approve with changes*, with 8 findings (E1-E8, 7 Major). **Consensus in round 2.** Grok accepted the author's two counters on E2 (birds stay in Phase 0a as one instanced draw, and the 128² cloud-shadow map stays on Low). The author verified E4 in three's `Info.js`.

| # | Topic | Resolution |
|---|---|---|
| E1 | The bake-off rule was lost in the pivot | **Phase 0 abort rule (spec §7a):** the title meets TTI on both backends with ≤ 40 pipelines, and the Low shots pass on forced WebGL2, **before any compute**. Runtime fallbacks init → WebGL2 → 2D, with a `featureLevel: 'compatibility'` probe |
| E2 | Phase 0 too big for a spike | **Split into 0a (floor path, both backends, incl. birds) and 0b (compute, one gated layer at a time: FFT → ShoreSim → WakeSim + spray → SSR + volumetric clouds)**. Low keeps 128² cloud shadows, Lite none |
| E3 | `chooseBackend` edge cases | `?webgl` without WebGL2 → WebGPU, `adapter.info` guarded, init failure retries WebGL2, new unit tests |
| E4 | Draw-call counter was lifetime | Use `render.drawCalls` / `frameCalls`, `memory.programs`, `texturesSize`, and `total` as tracked bytes, with a unit test that frames don't accumulate |
| E5 | Stale statements | §0 Platforms → §15, the ambience pack in §13.5, §14.1 shadows → §12.1, the §11 2D line, `#define` → TSL branches, S13 order, the instructions' GLSL line |
| E6 | Tidewater `BoatController` vs D6 | Reference only. The integrator + 8 attitude springs stay |
| E7 | Mobile realities | Phones capped at Medium until 2b, iPads by class (M-series High), `GPUDevice.lost` recovery, and timestamp/HDR/worker/bundles optional with fallbacks. Orientation lock is best-effort |
| E8 | Licensing | `THIRD_PARTY_NOTICES.md` (full MIT) created before any copy, per-file headers, Freesound rows only for shipped files, no `boat_engine.ogg` |
