### Verdict

Approve with changes. The Sakura and Antikythera studies are usable, the Service Worker plan matches GitHub Pages, and the G1–G14 teaching text is still in place. The new water and title scene are specified as if every tier can run them, which the UHD 620 floor cannot, and Phase 0 and Phase 1 now gate on more than one product.

### Findings

**D1**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §6 Water system table, §12.1 Low row, §12.4 shadows; spec §3.1 title and §8 "Water reflection"; `docs/research/2026-09-23-antikythera-artifact.md` adoption row 3
- **Issue:** "Analytic ship reflection on every tier" will miss 30 fps on UHD 620. The floor's weakness is fragment throughput and bandwidth, not the 500k triangle cap. A fullscreen Gerstner sum plus a hull SDF tested with 4 jittered rays, plus foam and a wake, is the Sakura/Antikythera look measured on an M3 Max (Sakura: 239 draws and about 5.9 M triangles; Antikythera title: 1.42 M triangles). Low still keeps a 2048² cached shadow map, a half-res scene copy, and the title adds Leaps, ridgelines, and that reflection. A blit of the framebuffer for absorption is affordable. A second geometry pass is not. The High/Ultra harbor mirror reopens a second scene render. That is acceptable only as a measured add-on, not as part of the floor.
- **Evidence:** Water table: "Ships reflect analytically on every tier… 4 jittered normals" and the tier cell "Baseline + analytic ship reflection: all." §12.1 Low shadows: "Static cached map 2048²." Spec §3.1 puts analytic reflection, Leaps, and distant ranges on the title, which every device shows. Antikythera row 3: "on every tier."
- **Recommendation:** Low and Lite get 3 Gerstner waves, a PMREM Fresnel reflection, a framebuffer blit for absorption with no distortion, one shoreline foam band, and one wake term. No hull-SDF rays, no lace octaves, no 2048 shadow map (1024 cached, or blobs only), and no Leaps. Medium may ray-test the hull once, inside the ship's screen rectangle. High may use 4 jittered rays. The harbor mirror stays High/Ultra, fails Phase 0 if it costs more than 35% of the main pass, and is absent from the floor shot.

**D2**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §10 Phase 0, §14.5; spec §9 acceptance
- **Issue:** Phase 0 asks one spike to show every water layer, including caustics and the harbor mirror, and also to hit the §12 budgets. Those are different frames. The 25–35× UHD ratio is an estimate: an 8 ms M3 Max frame would be scored at about 240 ms, so the test either rejects a reasonable Low scene or gets relaxed until it passes. **Decision risk:** "emulated only until public launch" means the 30 fps floor is unverified through the whole content build.
- **Evidence:** Phase 0: "Water must show every layer… and the High-tier harbor mirror" and "hit the §12 budgets… with each water layer's cost measured separately." §14.5: "~25–35× for UHD 620" and a real UHD 620 laptop "before public launch."
- **Recommendation:** Record two shots. Floor uses the D1 feature set and the Low budget. Beauty includes the mirror and caustics and the High budget. Keep the ratio as a smoke alarm. Make one real UHD 620 session a Phase 0 exit, before island content.

**D3**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §6 stack and "Quality tiers & budgets," §12 preamble and §12.1, §6 "Cliffs" and §12.6; spec §9 Lite line
- **Issue:** Four leftover sentences contradict the new platform table. §6 still says the Phase 0 spike will choose WebGL2 or WebGPU, and that Iris Xe is the Low 30 fps target. §12 still says the game is desktop-only and that "mobile" means Iris Xe. §12.1 has no Lite column, while the spec requires Lite at 30 fps. The same title is "no island" in §12.1, "at most one impostor" in §12.6, and layered ranges plus Leaps in §6 and the spec.
- **Evidence:** §0: "Rendering backend | WebGL2" and "Performance floor: Intel UHD 620 at 30 fps, plus a Lite preset." §6: "We'll decide between WebGL2 and WebGPU/TSL" and "30+ fps on Intel Iris Xe at Low." §12: "we're desktop-only." §12.1 header puts UHD 620 on Low and Iris Xe on Medium. Spec acceptance: "The Lite preset holds 30 fps."
- **Recommendation:** Delete the WebGPU choice and the Iris Xe Low sentence. Replace the desktop-only line with the §14 classes. Add a Lite column that matches §14.1. State one title contents list: ocean, sky, clouds, the ship, baked ranges, and no Leaps on Low/Lite.

**D4**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §12.9, §13.4, §13.5, §13.8; spec §9 loading acceptance
- **Issue:** The 3 s and 6 s figures are transfer math, then treated as time-to-interactive. At 25 Mbps, 4 MB is about 1.3 s of transfer and 14 MB is about 4.5 s, which leaves almost no time for the shader compile that took the Antikythera title 10.9 s on an M3 Max. §12.9's example thresholds (23.5 ms, 17.6 ms) are the Sakura 60 fps numbers. Used as written, a healthy 30 fps frame (33 ms) is always "over budget," so the floor preset will shrink resolution and stay there. The fog bank that hides a late island has no progress and no way out. The brigantine is also listed both in title assets and in `common/critical`.
- **Evidence:** §13.5: "≤ 4 MB, ≤ 3 s" and "≤ 14 MB, ≤ 6 s." §13.4: a fog bank "slows the ship… until the critical pack is resident. It never shows a loading screen." §12.9: "over budget (e.g. > 23.5 ms at a 60 fps target)." §13.2 puts the brigantine in `common`; §13.5 also budgets "Title assets (sky, ocean, ship)."
- **Recommendation:** Make 3 s and 6 s wire-time ceilings only. Measure time-to-interactive, including compile, separately, and expect it to be longer on UHD 620. Scale the §12.9 thresholds with the tier before anyone copies 23.5 ms. Give the fog bank a filling lighthouse and a retry, and if the fetch fails, sail into a low-detail harbor instead of holding the ship. Ship the brigantine in one pack.

**D5**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §0, §10 Phase 1, §14.4; spec §0 and §9
- **Issue:** Phase 1 now includes the 3D islands, a full touch build certified on two tablet families, and a second client in which every chapter 00/01 objective and all five puzzles are playable with no WebGL. The shared data model is the right foundation. The acceptance bar is a second game beside the teaching slice. **Decision risk:** "tablets and 2D now" can stand, and still not all be inside this phase.
- **Evidence:** Phase 1 deliverable adds "tablet touch controls" and "the 2D Chart & Logbook mode" next to islands 00 and 01. Spec §9: both islands "fully playable with touch" on an iPad A13+ and a recent Android tablet, and "Every Island 00/01 objective in the §1 matrix can be completed" in 2D, including P0.1, P0.2, P1.1, P1.2, and P1.3.
- **Recommendation:** Keep the touch bindings in Phase 1. Keep a 2D proof of the title, Q0.2, one hotspot, and one grid puzzle. Move "every objective in 2D" and the cloud-device pass of both islands to the phase after the 3D slice is approved.

**D6**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §6 "Physics & motion" and "One shared wind field"; §12.5; research adoption rows for the autopilot planner and secondary motion
- **Issue:** Horizontal motion has three writers. Trim sets speed kinematically, orbital coupling "nudges" the ship, and depenetration then moves the hull. Springs also own heave, pitch, and roll, which is the right split only if they never write XZ. §12.5 still says wind and sway run in the vertex shader and the CPU does no per-instance work. §6 adds CPU springs on coats and nets and a cloth solver on sails and laundry. The autopilot is a heading scorer every 0.2 s, used for the P1.2 voyage that must finish with no required input. A search-based planner that stalls on a buoy breaks that beat.
- **Evidence:** §6: "the player controls heading and speed kinematically" and "orbital-velocity coupling (the swell nudges the ship)" and "3–4 iterations of depenetration." §12.5: "Wind and sway run in the vertex shader… so the CPU does no per-instance work." Sakura adoption row 18 assigns the lane planner to "P1.2 Autopilot voyage."
- **Recommendation:** One horizontal integrator, in this order: trim sets target speed, drag and a small orbital nudge modify it, integrate, then depenetrate. Springs write only heave, pitch, and roll. Sails stay in the vertex shader. CPU springs are limited to the player's ship. P1.2 and "Sail here" follow an authored waypoint path. The scoring planner is not a POC requirement.

**D7**
- **Severity:** Major
- **Location:** `.plans/PLAN.md` §6 Leaps, §9, §13.8; spec §3.1 and §3.10
- **Issue:** Leaps are on the title, every 15–45 s, with stereo splash sounds, and reduced motion does not turn them off. Reduced motion still covers bob, flicker, and sun shafts, which is the previous list, and it does not cover the new motion. The loader's asymptotic creep can sit near 99% during a compile and look stuck. None of these systems teach a course idea. They do compete with the menu and with dialogue if a leap fires behind a line.
- **Evidence:** Spec §3.1: the title stages "flying fish and the occasional dolphin pod." §9 and spec §3.10 list reduced-motion cuts and do not mention Leaps. §13.8: "An asymptotic creep (`p += (0.99 − p) × k`)." The Leaps rules keep leaps clear of UI text and off underwater, and do not mention dialogue or reduced motion.
- **Recommendation:** Reduced motion disables Leaps, splash sounds, cloud drift, and the loader drift. Leaps do not start during dialogue, quizzes, or while a menu has focus. Progress may creep only inside the current real stage, and it may not pass that stage.

### Strengths

- Both studies record a license boundary and a measurement, and the plan refuses the expensive parts: Sakura's triangle count, Antikythera's runtime mesh generation, and copying either codebase.
- The harbor mirror is an add-on with a 35% cap, layer culling, and a cheap shader path. PMREM stays the baseline.
- The Service Worker matches Pages: `max-age=600`, gzip only, cache-first for hashed packs, network-first for the manifest, and activation only at the title. The private-repo note is right that the built site is public anyway.
- Rapier is still primitives, queries, and a kinematic character controller. The boat is not a rigid body. The G1–G14 teaching commitments are still in the spec.
- Tablet input is specified as controls, not a wish: 44 px targets, a trim slider, a helm drag, pinch-zoom on screenshots, and landscape-only play.

### Questions for the user

None.
