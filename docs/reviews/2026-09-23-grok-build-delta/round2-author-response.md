Thanks. For each item, reply **ACCEPT** or **COUNTER** (with reasoning and an alternative), then give a one-line-per-item **Consensus list**. Stay read-only.

**D1: Agree, with one counter.**
- Low/Lite get:
  - 3 Gerstner waves and a PMREM Fresnel reflection
  - absorption via the framebuffer copy with no distortion
  - one shoreline foam band, one wake term, and 1 lace octave
  - **no hull-SDF rays** (Low shows only a cheap darkened "hull smear" gradient under the ship)
  - a 1024² cached shadow map on Low, blobs only on Lite
- Medium gets **one** hull ray, limited to the ship's screen rectangle. High/Ultra get 4 jittered rays.
- The harbor mirror stays High/Ultra only, fails Phase 0 above 35% of the main pass, and never appears in the floor shot.
- **Counter on "no Leaps at the floor":** Leaps are ≤ 6 instanced fish (~600 tris each) + ≤ 48 small splash quads, spawned every 15-45 s. Their fragment and bandwidth cost is negligible next to the water. **Keep Leaps on Low (splash particles halved), off on Lite.** The user specifically likes them.

**D2: Partially agree.**
- **Two Phase 0 shots:** a **Floor shot** (the D1 feature set, judged against the Low budget) and a **Beauty shot** (mirror, caustics, shafts, judged against the High budget). The capability ratio becomes a smoke alarm with margin, not a hard gate.
- **On the real UHD 620 device:** the user explicitly chose "emulate only", so I won't overrule that in the plan. I'll record it as an open **Decision risk**, and recommend to the user that one real-device session happen **before Phase 1 content**, not at launch. The user decides.

**D3: Agree.**
- Remove the WebGPU choice sentence and the "Iris Xe at Low" sentence.
- Replace "desktop-only" with the §14 device classes.
- **Add a Lite column** to §12.1.
- Define **one title contents list** in §13.5, referenced everywhere else: ocean, sky, clouds, the brigantine, and procedural distant ranges (no island), with Leaps on Low+ and not on Lite.

**D4: Agree.**
- 3 s / 6 s become **wire-time ceilings**, with separate **time-to-interactive** targets: loader art ≤ 0.5 s everywhere, title interactive ≤ 5 s High / ≤ 10 s Low (emulated), first playable ≤ 10 s High / ≤ 20 s Low.
- §12.9 thresholds become **multiples of each tier's target frame time**: down above 1.4× the target, up below 1.05×.
- **Fog bank:** a lighthouse beam fills to show progress. If the critical pack isn't resident after ~20 s, or a fetch fails, we **retry with backoff and dock into a low-detail harbor** while streaming continues. The ship is never held indefinitely.
- **The brigantine ships in exactly one pack**, `title/ship`, which is part of the title budget. `common/critical` no longer includes it.

**D5: Partially agree / counter.**
- The touch **bindings and UI** stay in Phase 1.
- **Phase 1 keeps one cloud iPad (A13+) pass through both islands**, since "tablets now" was the user's choice and touch problems surface late. The **Android tablet pass** moves to Phase 1b.
- **2D mode in Phase 1** is a **proof slice**: the title → Chart, Q0.2 (dialogue + voice + pages), one hotspot (H0.2), and one grid puzzle (P0.1). **Full 2D coverage of every Island 00/01 objective** moves to **Phase 1b**, right after the 3D slice is approved.

**D6: Agree.**
- **One horizontal integrator, in this order:** trim/rudder set the target speed/heading → drag + a small orbital nudge → integrate → depenetrate. **Springs write only heave, pitch, and roll.**
- Sails, flags, and foliage stay in the **vertex shader**. **CPU springs are limited to a fixed small set on the player's ship** (lanterns, blocks, 1-2 lines), and §12.5 gets that exception.
- **P1.2 Autopilot and "Sail here" follow authored waypoint splines** in the POC. The scoring planner is post-POC (free-roam autopilot).

**D7: Agree, with one counter.**
- **Reduced motion** disables Leaps (and their splash sounds), the loader drift, and camera motion. Cloud drift slows to near-static.
- **Leaps never start during dialogue, quizzes, puzzles, the Chart, the Logbook, or the pause menu.**
- **Counter:** the **title screen is exempt** from the "menu has focus" rule. Leaps on the title are the user's favourite moment, and the existing UI-text-box avoidance already keeps them off the logo and menu.
- **Loader creep is capped** at the next real stage's start value, so it never passes a stage it hasn't reached.
