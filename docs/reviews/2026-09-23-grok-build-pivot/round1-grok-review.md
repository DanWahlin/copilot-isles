### Verdict

Approve with changes. WebGPU-first with a TSL fallback is a sound way to reuse Tidewater, and the D1–D7 water, leap, and sailing rules are still written down. Phase 0 as specified is Tidewater's ocean plus the cove, and the study's own pass/fail rule was dropped when the backend was chosen, so nothing stops a 30–60 second compile or a weak WebGPU device from becoming the floor.

### Findings

**E1**
- **Severity:** Major
- **Location:** `docs/research/2026-09-23-tidewater.md` §8; `.plans/PLAN.md` §0, §11, §15.4; `docs/specs/PHASE-0-spike.md` §5 and §7
- **Issue:** The study's bake-off rule was not replaced. It said to pick TSL only if the forced WebGL2 backend stayed within about 15% of a hand-written GLSL water shader and the title still met the load budget. The plan now commits to TSL, and the only floor check is an emulated smoke alarm plus a real UHD 620 laptop before launch. UHD 620 in Chrome is a WebGPU device (D3D12, `featureLevel: 'compatibility'`), not the WebGL2 backend the study was worried about. An M3 Max timing that device will not show a missing feature, a failed `requestDevice`, or a minute-long compile. There is no rule that stops the team from adding FFT, ShoreSim, and clouds after the title is already too slow.
- **Evidence:** Tidewater §8 pass rule, and the measured "30–60 s to playable" on an M3 Max. PLAN §0: the real UHD 620 check is "before public launch." Phase 0 §5: the GPU ratios are "a smoke alarm with margin, not a hard gate." three `WebGPUBackend.js` requests the adapter with `featureLevel: 'compatibility'` and then `requestDevice` with every feature the adapter lists.
- **Recommendation:** Add an abort rule to Phase 0 §7, checked before T5's FFT work. The title, with only its own shaders, must meet the §13.5 time-to-interactive cap on WebGPU and on forced WebGL2. The Low shot on forced WebGL2 must pass the D1 feature set. If `renderer.init()` throws, or the adapter is a fallback adapter, retry `forceWebGL` and then the 2D stub. If the title pipeline count is already over 40, do not start another compute system. A UHD-class adapter that cannot create that device uses the WebGL2 Gerstner path for the session.

**E2**
- **Severity:** Major
- **Location:** `docs/specs/PHASE-0-spike.md` §1, §3 S2–S3 and S15, §6 T5; `.plans/PLAN.md` §15.1
- **Issue:** This spike now includes a 4-cascade FFT ocean, ShoreSim, WakeSim, a GPU spray pool, SSR, Hillaire LUTs, volumetric clouds, a 24-hour sun path, five bird behaviours, the full Gerstner fallback, and both backends. Tidewater's own cost for a subset of that was about 23 MB and a 30–60 second compile, with hundreds of pipeline variants. T5 attaches the FFT to the first ocean task, so the floor path is not proven before the expensive path exists. §15.1 also adds cloud shadows to WebGPU Low, which §12.1's Low row does not have.
- **Evidence:** Phase 0 S3 requires the FFT, ShoreSim, WakeSim, GPU spray, and SSR on WebGPU, and the full Gerstner stack otherwise. T5 is "ocean core + FFT cascades." §15.1 WebGPU Low: "a cloud layer + cloud shadows." §12.1 Low post is tone map, grade, vignette, and grain.
- **Recommendation:** Split the spike. Phase 0a is the scaffold, the sky, the D1 Gerstner ocean, the ship, and the two shots, on both backends, and it must pass E1. Phase 0b adds one WebGPU compute feature, the FFT or the shore, not both, and only if the title stays inside the pipeline cap and the time-to-interactive cap. Birds, volumetric clouds, ShoreSim, WakeSim, GPU spray, and SSR wait until 0b passes. WebGPU Low uses the §12.1 row, with no cloud-shadow pass.

**E3**
- **Severity:** Major
- **Location:** `src/boot/detect.ts` `chooseBackend`; `src/boot/main.ts`; `src/boot/detect.test.ts`; `node_modules/three/src/renderers/webgpu/WebGPUBackend.js` `init`
- **Issue:** `?webgl` on a machine with no WebGL2 drops to the 2D stub even when a hardware WebGPU adapter exists. `main.ts` never calls `detectWebGPU` when `?webgl` is set, and `chooseBackend` then returns `no-webgl2` without looking at that adapter. A hardware adapter with WebGL2 missing does take WebGPU, and that path is untested. Detection and the renderer also request two different adapters: `detectWebGPU` uses the default adapter, and three requests another with `featureLevel: 'compatibility'` and every advertised feature. If `adapter.info` is missing, the `try` block throws and WebGPU is reported unavailable. If `renderer.init()` throws, the boot catch shows a reload message and does not try WebGL2.
- **Evidence:** `main.ts` lines 16–18 null the probe when `webgl` is in the query. `chooseBackend` lines 90–93 return `{ backend: null, reason: 'no-webgl2' }` whenever WebGL2 is absent, unless `force` is set. `WebGPUBackend.js` lines 215–250 call `requestAdapter` again and `requestDevice({ requiredFeatures: supportedFeatures })`. `detect.test.ts` never passes a hardware adapter with `webgl2: false`, or `preferWebGL` with no WebGL2.
- **Recommendation:** If `?webgl` is set and WebGL2 is missing, use a hardware WebGPU adapter and record the reason. Guard `adapter.info` so a missing object does not fail the probe. On `init()` failure, retry with `forceWebGL: true`, then show the 2D stub. Add those two cases to `detect.test.ts`.

**E4**
- **Severity:** Major
- **Location:** `src/engine/frame-counters.ts`; `node_modules/three/src/renderers/common/Info.js`
- **Issue:** The counter that the budgets will read is the lifetime render count, not the frame's draw calls. `info.reset()` clears `render.drawCalls` and `render.triangles`. It does not clear `render.calls`, which Info documents as the count since the app started. `memory.programs` and `memory.total` do exist on this shared Info object for both backends, so the pipeline count and the byte total are the right fields. `total` includes buffers and programs, not texture memory alone. The smoke test only checks `calls > 0`, so this stays green while the number climbs every frame.
- **Evidence:** `Info.js` reset (lines 187–197) versus `render.calls` (lines 55–59) and `dispose()` (line 209), which is what clears `calls`. `frame-counters.ts` line 43 assigns `calls: render.calls`. `tests/e2e/smoke.spec.ts` line 20 expects `info.calls > 0`.
- **Recommendation:** After `reset()`, read `render.drawCalls` for the budget and `render.frameCalls` for how many `render()` calls the frame made. Keep `memory.programs` for the §15.4 cap. Name the byte total as tracked resource bytes, or use `memory.texturesSize` for the texture budget. Assert in a unit test that two frames do not accumulate draw calls.

**E5**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §0 Platforms, §11, §12.2, §12.7, §14.1 Low row; `docs/specs/PHASE-0-spike.md` S13; `.github/copilot-instructions.md`
- **Issue:** Several sentences still describe the previous renderer and the previous audio and shadow decisions. §0 still says the game runs everywhere there is WebGL2, while §15 treats WebGPU as the floor path. §12.7 still says ambience costs 0 bytes. §7 now lazy-loads about 5 MB of recordings per island, and that 5 MB is not in the §13.5 table. §14.1 still gives the UHD 620 floor blob shadows. §12.1 correctly gives it a 1024² cached map. §11 still says Phase 1 builds 2D renderers for five puzzles. The Phase 1 row was updated to the proof slice. §12.2 still says tiers are `#define` variants. S13 still says detection starts with a WebGL2 check. The contributor instructions still say to generate GLSL from the TS constants.
- **Evidence:** §12.7: "music and ambience are procedural, so they cost 0 bytes." §7: "about 5 MB per island, inside the §13 pack budgets." §14.1 floor cell: "blob shadows." §12.1 Low shadows: "Static cached map 1024²." §11: "2D renderers for only 5 POC puzzles."
- **Recommendation:** Make §15 the platform sentence in §0. Put the 5 MB ambience pack inside the §13.5 island cap and the budget CI. Point §14.1's Low shadow line at §12.1. Change the §11 2D line to the Phase 1 proof slice and Phase 1b. Replace `#define` with uniform or attribute branches on one TSL material. Rewrite S13 to the §14.2 order. Delete the GLSL-generation sentence in the contributor instructions.

**E6**
- **Severity:** Major
- **Location:** `docs/research/2026-09-23-tidewater.md` §7 reuse matrix; `docs/specs/PHASE-0-spike.md` S7; `.plans/PLAN.md` §6 "Physics & motion"
- **Issue:** Tidewater's `BoatController` is a 120 Hz CPU rigid body: buoyancy patches, added mass, keel lift, rudder lift, and thrust. Adopting it replaces the one horizontal integrator. The plan still has that integrator, and springs still write only heave, pitch, and roll. The research matrix says "Reuse as-is." S7 says "evaluate" the controller and also requires the integrator. Those two instructions will be read as permission to swap the sailing model.
- **Evidence:** Tidewater §3: "CPU rigid-body physics at 120 Hz." Reuse matrix: "Reuse as-is" for `BoatController`. PLAN §6: "One horizontal integrator, in this order… There's no other writer of XZ."
- **Recommendation:** Change the matrix to "do not adopt." Keep hull lofting from `HullLines`. S7 may compare the controller on video, and the sailing model stays the integrator plus the eight attitude springs. GPU wave readback, if T5 uses it, only feeds the height those springs sample. It does not write XZ.

**E7**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §14.2 step 6, §15.1, §15.2, §15.3
- **Issue:** The phone and iPad notes describe a desktop WebGPU device. §15.1 gives an iPhone 15 Pro the same list as an M3 Max: 4-cascade FFT, volumetric clouds, GTAO, PCSS, and HDR. Phone UX is still Phase 2b, so that class should not be live. §14.2 handles device loss only as `webglcontextlost`. WebGPU fires `GPUDevice.lost`, and iOS drops the device when the tab is backgrounded. The visibility handler in `main.ts` stops the loop and does not rebuild the device. Safari often has no `timestamp-query`, so adaptive resolution must use frame time there. A half-float HDR canvas and WebGPU-in-a-worker `OffscreenCanvas` are not reliable on iOS. `screen.orientation.lock` usually works only in an installed PWA. Render bundles should not be required for a correct frame.
- **Evidence:** §15.1 Ultra/High includes "iPhone 15 Pro+ (A17 Pro+)" next to the full compute list. §14.2 step 6 names only `webglcontextlost`. §15.3 makes an OffscreenCanvas renderer a Phase 0 evaluation and lists orientation lock for tablets. `main.ts` lines 93–99 pause on `visibilitychange` and do not listen for device loss.
- **Recommendation:** Until Phase 2b, any phone adapter caps at the Medium feature set, with no volumetric clouds and no 4-cascade FFT. On `device.lost`, pause, recreate the device, and re-upload resident packs. Treat `timestamp-query`, HDR canvas output, worker rendering, and render bundles as optional. If they are missing, use frame time, LDR output, main-thread rendering, and ordinary draws. Keep orientation lock as a best-effort PWA call.

**E8**
- **Severity:** Minor
- **Location:** `.plans/PLAN.md` §7; `docs/research/2026-09-23-tidewater.md` §6; `/tmp/tidewater/LICENSE` and `public/audio/CREDITS.md`
- **Issue:** The legal split is right: Tidewater's code is MIT, and the 31 Freesound files in that credits table are marked CC0 1.0. A file header is not the MIT condition. The license requires the copyright line and the permission paragraph in the distribution. CC0 does not require credit. Copying only "CC0" into `ASSETS.md` drops the author and the Freesound URL that their own credits rule asks for. `boat_engine.ogg` is in that pack and is a diesel loop, which this sailing game does not need.
- **Evidence:** `/tmp/tidewater/LICENSE` lines 3–13 require the notice and the permission text. `public/audio/CREDITS.md` is a per-file table of author, URL, and "CC0 1.0." PLAN §7 says each file is logged with author and link.
- **Recommendation:** Put the full MIT text in `THIRD_PARTY_NOTICES.md` before any Tidewater file is copied, and keep the per-file header as well. Copy the Freesound table into `ASSETS.md` for the files you actually ship. Leave the diesel loop out.

### Strengths

- The D1 tier cuts, the D6 integrator order, and the D7 leap rules are still in §6, including the title exemption and reduced motion.
- Compute is explicitly WebGPU-only, and the Gerstner, analytic-wake, and cloud-layer fallbacks are named rather than implied.
- The plan forbids Tidewater's private `TSLPatches.js` unless a patch is isolated, version-guarded, and tested.
- CI already forces the WebGL2 backend with `?webgl`, and the software-render path has a course link.
- The scaffold's TSL title compiles through `three/webgpu` on both backends, and `memory.programs` is a real field on three 0.186's shared `Info` object.

### Questions for the user

None.
