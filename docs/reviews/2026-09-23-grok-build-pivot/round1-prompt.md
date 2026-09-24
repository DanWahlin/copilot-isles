New review round, same rules: READ-ONLY, no shell commands, and don't read ~/.env or ~/.grok.

Since our delta consensus (commit 508a00c), four things have happened:
1. **Phase 0 spec + scaffold** (`docs/specs/PHASE-0-spike.md`, `src/`, `tools/`, `tests/`, `.github/`), with CI green.
2. **Tidewater study** (`docs/research/2026-09-23-tidewater.md`): MIT, three 0.186 + Vite 8, WebGPURenderer + TSL, WebGPU-only. Measured on an M3 Max: ~23 MB and 30-60 s to playable (shader compiles), then 60 fps.
3. **User decisions:** **switch to WebGPU-first** (`WebGPURenderer` + TSL, with three's automatic WebGL2 backend as the fallback). Ambience/SFX become **CC0 field recordings** (music stays procedural). The user also asked to be **"cutting edge… modern machines (tablets and phones)"**. Phone UX stays in Phase 2b.
4. **Resulting changes:** PLAN §0/§6/§7/§12.9/§14.2/§14.3, the **new §15** (capability matrix, rendering + web-platform tech, pipeline budgets), Phase 0 spec v0.2 (both backends, time of day, birds S15), and the scaffold migrated to `three/webgpu` + `three/tsl` (`src/boot/detect.ts` `chooseBackend`, `src/boot/main.ts`, `src/engine/frame-counters.ts`, `src/title/title-scene.ts`, `tests/e2e/smoke.spec.ts`, the budget raised to 250 KB gz for `vendor-three`).

The diff is at **/tmp/copilot-isles-pivot.diff**. Also read `.plans/PLAN.md` (esp. §0, §6, §12.1, §13.5, §14, §15), `docs/specs/PHASE-0-spike.md`, `docs/research/2026-09-23-tidewater.md`, and the `src/` files above. For accuracy you may inspect `node_modules/three/src` (three 0.186) and `/tmp/tidewater` (the cloned Tidewater repo).

Focus:
- **Soundness of the pivot:** are the risks (TSL compile time, WebGL2-backend performance at the UHD 620 floor, compute gaps, browser/driver variance, private-internals patches) acknowledged and mitigated with concrete gates? What gate or decision rule is missing?
- **Consistency:** §15.1 capability classes vs the §12.1 tier table vs the §14.1 device classes vs Phase 0 §5 budgets. Also leftover WebGL2/GLSL-only statements, the D1-D7 consensus items still honoured (e.g. hull rays by tier, Leaps rules, one horizontal integrator), and whether adopting Tidewater's BoatController conflicts with D6.
- **Feasibility:** does the Phase 0 scope (now with FFT, ShoreSim, WakeSim, GPU spray, volumetric clouds, birds, time of day, both backends) still fit a *spike*? Recommend staging if not.
- **Code review** of the scaffold changes: correctness of `chooseBackend` (edge cases: WebGPU adapter present but WebGL2 missing; `?webgl` on a device without WebGL2; the fallback adapter), `detectWebGPU` (adapter.info / isFallbackAdapter across browsers; a double adapter request, since three also requests one), HDR gating, `FrameCounters` on the WebGPU `Info` object (`memory.programs`, `total`), and the test coverage gaps.
- **Licensing:** is the Tidewater MIT + CC0 audio plan correct and sufficient (notices, per-file headers, Freesound credits)?
- **Mobile/tablet:** anything in §15 that's wrong or risky for iPadOS/iOS Safari 26 or Android Chrome (memory, thermal, device loss, render bundles, HDR, OffscreenCanvas)?

Output: **Verdict** (≤ 3 sentences), **Findings E1…En** (≤ 15, prioritized, each with Severity / Location / Issue / Evidence / Recommendation), **Strengths** (≤ 5), **Questions for the user** (or "None").
