**E1: ACCEPT.** The abort rule belongs before any FFT work, and probing with `featureLevel: 'compatibility'` makes the check use the same adapter three will use. Leaving the real UHD 620 session before launch matches the decision already on the books.

**E2: ACCEPT.** Both counters hold. Thirty birds in one instanced draw are not a compute system, and they belong in the shot you will judge. A 128² cloud-shadow map, one slice per frame and one terrain fetch, is not the water shader. Lite still gets neither extra birds beyond the off switch nor that map. Shorebirds in 0a follow the analytic shoreline, so they do not pull ShoreSim forward.

**E3: ACCEPT.** `?webgl` with no WebGL2 falls through to a hardware WebGPU adapter, `adapter.info` cannot fail the probe, and `init()` failure retries WebGL2 before the 2D stub.

**E4: ACCEPT.** `render.drawCalls` and `render.frameCalls` are the frame counters. `render.calls` is the lifetime count `reset()` does not clear.

**E5: ACCEPT.** Those seven stale lines are the whole set.

**E6: ACCEPT.** `BoatController` stays a reference. The sailing model stays the one integrator and the eight attitude springs.

**E7: ACCEPT.** Phones stay on the Medium set until Phase 2b. An M-series iPad stays High, with the adaptive scaler as the thermal response. `GPUDevice.lost` rebuilds the device. The four optional features keep their fallbacks.

**E8: ACCEPT.** The full MIT notice goes in `THIRD_PARTY_NOTICES.md` before any Tidewater file is copied, and the Freesound table is copied only for files that ship. The diesel loop stays out.

### Consensus list

**E1:** Before any compute work, the title with only its own shaders meets the §13.5 time-to-interactive cap on WebGPU and on forced WebGL2, with at most 40 pipelines. The Low F1/F2 shots on forced WebGL2 pass the D1 set. No new compute system starts while the title is over either cap. If `renderer.init()` throws or the adapter is a fallback, retry `forceWebGL` and then the 2D stub. A UHD-class adapter that cannot create the device uses the WebGL2 Gerstner path for that session. The probe requests `featureLevel: 'compatibility'`. The real UHD 620 check stays before launch.

**E2:** Phase 0a is the scaffold, sky and time of day, the D1 Gerstner ocean, the brigantine, terrain and cliffs, vegetation, characters, basic post, loading, detection, the F/B shots on both backends, and the birds as one instanced draw. Shorebirds follow the analytic shoreline until ShoreSim exists. 0a must pass E1. Phase 0b adds the FFT first, then ShoreSim, WakeSim, GPU spray, SSR, and volumetric clouds, one at a time, each gated by the title caps. T5 does not include FFT. Low keeps a 128² cloud-shadow map, one slice per frame and one terrain fetch. Lite gets no cloud shadow.

**E3:** If `?webgl` is set and WebGL2 is missing, use a hardware WebGPU adapter and record the reason. If `adapter.info` is missing, use empty strings. If `init()` throws, retry with `forceWebGL: true`, then the 2D stub. Unit-test hardware WebGPU with no WebGL2, `preferWebGL` with no WebGL2, and a fallback adapter.

**E4:** Read `render.drawCalls` for budgets and `render.frameCalls` for renders per frame. Keep `memory.programs` for the §15.4 cap. Report `memory.texturesSize` as the texture budget and label `memory.total` as tracked resource bytes. Add a unit test, with a stubbed Info, that two frames do not accumulate draw calls.

**E5:** Point §0 Platforms at §15. In §12.7, ambience is not 0 bytes. Add a ~5 MB per-island ambience pack to §13.5 and the budget CI. Point §14.1 Low shadows at §12.1. Change the §11 2D line to the Phase 1 proof slice and Phase 1b. Replace §12.2 `#define` variants with uniform or attribute branches on one TSL material. Rewrite S13 to the §14.2 order. Delete the GLSL-generation sentence in the contributor instructions.

**E6:** The reuse matrix marks `BoatController` as reference only, do not adopt. Keep `HullLines` and `GeoKit` lofting. S7 may compare the controller on video. The sailing model stays the one horizontal integrator plus eight attitude springs. GPU wave readback, if used, only feeds the heights those springs sample.

**E7:** Until Phase 2b, a phone adapter caps at the Medium feature set: no volumetric clouds and no 4-cascade FFT. iPads stay on their GPU class, with an M-series iPad at High and adaptive resolution as the thermal response. On `GPUDevice.lost`, pause, recreate the device, and re-upload resident packs. `timestamp-query`, HDR output, worker rendering, and render bundles stay optional, with frame time, LDR, the main thread, and ordinary draws as the fallbacks. Orientation lock is a best-effort PWA call.

**E8:** Create `THIRD_PARTY_NOTICES.md` with the full MIT copyright and permission text now, before any Tidewater file is copied, and keep per-file headers. Copy the Freesound author and URL rows into `ASSETS.md` only for files that ship. Do not ship `boat_engine.ogg`, or the whale and underwater beds, unless one of those is actually used.
