**D1: ACCEPT.** Six instanced fish and a few dozen splash quads are not the UHD 620 cost. The water shader is. Leaps stay on Low with the splash pool halved, and they stay off on Lite. The hull-ray, shadow, foam, and mirror cuts stand.

**D2: ACCEPT.** Two shots, with the capability ratio as a smoke alarm, is the right gate. Leaving "emulate only" in the plan, and recording a real UHD 620 session before Phase 1 content as a Decision risk for the user, respects the choice they already made.

**D3: ACCEPT.** One title list, a Lite column, and deleting the WebGPU and Iris Xe Low sentences removes the contradictions.

**D4: COUNTER.** The wire-time split, the time-to-interactive targets, the fog-bank timeout, and a single `title/ship` pack are right. The 1.4× / 1.05× band is not. At a 30 fps target the frame time is 33 ms, and "raise below 1.05×" is 35 ms, so a frame that is actually hitting 30 fps still asks for more resolution. The stable band sits at about 22–29 fps, under the floor you just set.

Alternative: lower the resolution when the frame time is over **1.25×** the tier target, and raise it when the frame time is under **0.85×**. At 30 fps that is a drop above about 42 ms and a rise below about 28 ms, so a true 30 fps frame sits still. Keep every other part of your D4 proposal.

**D5: ACCEPT.** Touch bindings stay in Phase 1, one iPad pass of both islands stays with them, and Android plus full 2D coverage wait until Phase 1b. The proof slice (title, Chart, Q0.2, H0.2, P0.1) is the right amount of 2D for this phase.

**D6: ACCEPT.** One horizontal integrator, springs limited to heave, pitch, and roll, vertex-shader sails, a small CPU-spring set on the player's ship, and authored waypoint splines for the POC.

**D7: ACCEPT.** Reduced motion still removes title Leaps for anyone who asks for it. Everyone else can have them on the title, kept off the logo and the menu by the text-box rule, and kept out of dialogue, quizzes, puzzles, the Chart, the Logbook, and pause. Capping the loader creep at the next real stage is the right limit.

### Consensus list

**D1:** Low and Lite use 3 Gerstner waves, a PMREM Fresnel reflection, a framebuffer-copy absorption with no distortion, one shoreline foam band, one wake term, and 1 lace octave. Low has no hull-SDF rays (only a darkened hull smear), a 1024² cached shadow map, and Leaps with the splash pool halved. Lite has blob shadows and no Leaps. Medium uses one hull ray inside the ship's screen rectangle. High and Ultra use 4 jittered rays. The harbor mirror is High/Ultra only, fails Phase 0 above 35% of the main pass, and is absent from the floor shot.

**D2:** Phase 0 records a Floor shot (the D1 set, judged on the Low budget) and a Beauty shot (mirror, caustics, shafts, judged on the High budget). The capability ratio is a smoke alarm with margin, not a gate. Emulate-only stays the plan. A real UHD 620 session before Phase 1 content is recorded as a Decision risk for the user.

**D3:** Remove the WebGPU-choice sentence and the "Iris Xe at Low" sentence. Replace "desktop-only" with the §14 device classes. Add a Lite column to §12.1. One title-contents list, in §13.5 and referenced everywhere: ocean, sky, clouds, the brigantine, and procedural distant ranges, with no island mesh. Leaps are on for Low and above, and off for Lite.

**D4:** 3 s and 6 s are wire-time ceilings only. Time-to-interactive targets are loader art ≤ 0.5 s, title interactive ≤ 5 s High / ≤ 10 s Low (emulated), and first playable ≤ 10 s High / ≤ 20 s Low. Adaptive resolution drops above 1.25× the tier's target frame time and rises below 0.85×. The fog bank fills a lighthouse beam. If the critical pack is still missing after about 20 s, or a fetch fails, retry with backoff and dock into a low-detail harbor while streaming continues. The brigantine exists only in `title/ship`, inside the title budget.

**D5:** Phase 1 keeps the touch bindings and one cloud iPad (A13+) pass through both islands. The Android tablet pass moves to Phase 1b. Phase 1's 2D mode is the proof slice: title, Chart, Q0.2, H0.2, and P0.1. Full 2D coverage of every Island 00/01 objective moves to Phase 1b, after the 3D slice is approved.

**D6:** One horizontal integrator, in order: trim and rudder set target speed and heading, then drag plus a small orbital nudge, then integrate, then depenetrate. Springs write only heave, pitch, and roll. Sails, flags, and foliage stay in the vertex shader. CPU springs are a fixed small set on the player's ship only, and §12.5 states that exception. P1.2 Autopilot and "Sail here" follow authored waypoint splines. The scoring planner is post-POC.

**D7:** Reduced motion disables Leaps and their splash sounds, the loader drift, and camera motion, and it slows cloud drift to near-static. Leaps never start during dialogue, quizzes, puzzles, the Chart, the Logbook, or pause. The title is exempt from the menu-focus rule, and the UI-text box still keeps leaps off the logo and the menu. Reduced motion still disables title Leaps. Loader creep cannot pass the start of the next real stage.
