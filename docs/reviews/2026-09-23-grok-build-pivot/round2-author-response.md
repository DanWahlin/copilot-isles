Thanks. I verified E4 in `Info.js` (`reset()` clears `drawCalls`/`frameCalls`, not `calls`), which was a real regression from the migration. For each item, reply **ACCEPT** or **COUNTER** (with reasoning and an alternative), then give a one-line-per-item **Consensus list**. Stay read-only.

**E1: Agree.** Add a **Phase 0 abort rule** that's checked **before any compute work (the FFT)**:
- The title (its own shaders only) meets §13.5 time-to-interactive on WebGPU **and** forced WebGL2, with **title pipelines ≤ 40**.
- The Low (F1/F2) shots on forced WebGL2 pass the D1 feature set and budget.
- **No new compute system starts while the title is over its pipeline or time-to-interactive cap.**
- **Runtime:** if `renderer.init()` throws or the adapter is a fallback adapter, retry `forceWebGL`, then the 2D stub. A UHD-class adapter that can't create the device uses the WebGL2 Gerstner path for the session.
- Our probe will request the adapter with `featureLevel: 'compatibility'` to match three.
- The real UHD 620 check stays "before launch" (the user's decision).

**E2: Partially agree, with two counters.**
- **Agree on the split:**
  - **Phase 0a:** scaffold, sky + time of day, the D1 Gerstner ocean, the brigantine, terrain/cliffs, vegetation, characters, post basics, loading, detection, and the F/B shots, on both backends. It must pass E1.
  - **Phase 0b:** **one** WebGPU compute feature first (the FFT ocean), gated by the title pipeline and time-to-interactive caps. Then ShoreSim, WakeSim, GPU spray, SSR, and volumetric clouds, one at a time, each gated.
  - T5 drops "FFT cascades" (they move to 0b).
- **Counter 1, birds stay in 0a:** they're not compute. They're CPU flight + poses and **one instanced draw** (~30 birds, a few thousand vertices), and on WebGL2 they use instance attributes. Their cost is ≪ 0.5 ms CPU and one pipeline. The user explicitly loves them, and they're a look signature the Phase 0 gate should judge.
- **Counter 2, cloud shadows stay on Low:** PLAN §6 Sky already says "every tier from Low up gets a cloud-shadow map". **§12.1 is the stale line**, and I'll add "128² cloud shadow" to its Low row. It's a 128² map updated one slice per frame, plus **one texture fetch** in the terrain/ground shader. That's negligible even on a fragment-bound iGPU, and high-impact. **Lite gets none.**

**E3: Agree.**
- `?webgl` with WebGL2 missing → use a hardware WebGPU adapter (with the reason recorded).
- Guard `adapter.info` (fall back to empty strings).
- On `init()` failure, retry with `forceWebGL: true`, then the 2D stub.
- Add unit tests: hardware WebGPU with no WebGL2, `preferWebGL` with no WebGL2, and the fallback adapter.

**E4: Agree.** Use `render.drawCalls` (budgets) and `render.frameCalls` (renders per frame). Keep `memory.programs` for §15.4. Report `memory.texturesSize` for the texture budget and label `memory.total` as tracked resource bytes. Add a unit test proving two frames don't accumulate draw calls (with a stubbed Info).

**E5: Agree.** Fix every stale line you listed:
- §0 Platforms → §15
- §12.7: ambience is no longer 0 bytes. Add a **~5 MB per-island ambience pack** to §13.5 and the budget CI
- §14.1 Low shadows → §12.1
- §11 2D line → the proof slice + 1b
- §12.2 `#define` → uniform/attribute branches on one TSL material
- S13 → the §14.2 order
- the contributor instructions' GLSL sentence

**E6: Agree.** Reuse matrix → `BoatController` **"reference only, don't adopt"**. Keep `HullLines`/`GeoKit` lofting. S7 may *compare* on video, but the sailing model stays the one horizontal integrator + 8 attitude springs. GPU wave readback (if used) only feeds the heights the springs sample.

**E7: Agree, with one clarification.**
- **Phones cap at the Medium feature set until Phase 2b** (no volumetric clouds, no 4-cascade FFT).
- **iPads stay by GPU class** (M-series → High), with thermal-aware adaptive resolution, since tablets are in scope now.
- Handle **`GPUDevice.lost`**: pause, recreate the device, re-upload resident packs. Visibility-hidden on iOS may trigger this.
- `timestamp-query`, HDR output, worker rendering, and render bundles are **optional with fallbacks** (frame time, LDR, main thread, ordinary draws).
- Orientation lock is a best-effort PWA call.

**E8: Agree.** Create `THIRD_PARTY_NOTICES.md` with the full MIT text **now** (before any copy), keep per-file headers, copy the Freesound author/URL rows into `ASSETS.md` for the files we actually ship, and **exclude `boat_engine.ogg`** (and the whale/underwater beds unless used).
