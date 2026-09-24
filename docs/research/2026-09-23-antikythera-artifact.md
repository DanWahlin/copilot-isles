# Reference study: "Antikythera" (Claude artifact, 2026-09-23)

**Source:** a single-file Claude artifact (`~/Downloads/Antikythera.html`, 3.5 MB of **unminified** JS, three.js 0.186 from a CDN). It's a 1901 sponge-diver story: a Greek boat anchored under sea cliffs, then a dive to the wreck to clean fragments and reassemble the mechanism.
**What you asked me to look at:** the background cliffs, the jumping fish, the water/waves, the flow of the boat, and the initial loading screen.
**Method:** I read the source (it keeps its original module names: `waves.js`, `ocean.js`, `surface.js`, `leaps.js`, `island.js`, `horizon.js`, `boat.js`, `main.js`, …) and measured it in desktop Chrome (headless, ANGLE Metal, Apple M3 Max, 1600×900) via its `window.__ak` debug hook.

> **License:** unknown (it's someone's artifact, saved as a copy). **We study the techniques and write our own implementation. We never copy code, shaders, or the loader art.** Its HTML and screenshots stay out of this repo.

## Measured
| Metric | Value | Note |
|---|---|---|
| Frame at the title | **58 draw calls, 1.42 M tris**, 60 fps | Heavy geometry merging keeps the call count tiny |
| Shader programs | **213** | Lots of compile work |
| Network beyond the HTML | ~0.65 MB (three.js + fonts) | Everything else is generated in code |
| **Boot timeline** | world built 2-10 s → title compiled **10.9 s** → **title warmed 17.6 s** → underwater compiled 20.2 s → **all warmed 31 s** | **Runtime procedural generation is expensive.** This is the main thing *not* to copy |

## 1. Waves (`waves.js`, 60 lines)
- **5 Gerstner waves** with **deep-water dispersion** `ω = √(g·k)`: wavelengths 19 / 12.2 / 7.6 / 4.9 / 2.9 m, amplitudes 0.2 → 0.022 m, and steepness Q 0.55 → 0.35.
- **The JS wave table generates the GLSL constants** (`WAVES_GLSL`), so the CPU and GPU can never disagree.
- **Exact surface height at a world point:** Gerstner moves points sideways, so a naive `height(x, z)` is wrong. They **invert the horizontal displacement with a 3-step fixed-point iteration** before sampling. Buoyancy, floats, splashes, and foam all use this.
- **Distance fade:** wave amplitude is multiplied by `exp(-dist_to_camera / 240 m)` **identically on CPU and GPU**. Far water calms down, which prevents aliasing and keeps physics and visuals in agreement.

## 2. Water rendering (`ocean.js`)
- **Polar, camera-centred grid** out to 1.65 km. Rings grow geometrically, which gives roughly constant screen density (a projected-grid effect without the artefacts). **Each vertex stores its spacing (`aSpan`)**, and the shader counts wave cycles per sample and **drops wave components the mesh can't resolve**.
- **Specular anti-aliasing:** Beckmann roughness grows with the **unresolved wave variance** plus the screen-space normal derivative (`dFdx/dFdy(N)`). Distant water turns into a soft, correct sheen instead of sparkling noise.
- **Sun glints** use a Beckmann/Smith/Schlick microfacet BRDF, plus **Poisson-distributed sparkles** sized to the pixel footprint (`uPixAng`), so glitter stays stable at every distance.
- **The boat's reflection and shadow on the water are analytic.** The hull shape is ray-tested with **4 jittered normals** (a blurred reflection), and the shadow is traced toward the sun. **No mirror pass at all.**
- Sky reflection is spread by roughness. The horizon colour at grazing angles is sampled from the sky model.
- **Around the hull:**
  - a **waterline foam ring** (a mesh following the Gerstner surface, with lace noise, pulses, and sparkles)
  - a **"skirt"** of water hugging the hull for wave slap
  - a **wet band** on the hull that follows the actual sea height
  - **spray** triggered by hull-slam velocity (hull point vs sea surface)
- **From below:** refraction with total internal reflection (Snell's window). Not needed for us.

## 3. The boat's flow (`surface.js`)
It's a **fixed-timestep, semi-physical simulation**. Nothing about the motion is keyframed.
- **Heave, pitch, and roll** are **damped springs toward the sea surface** sampled at **8 hull stations**, each with its own natural frequency and damping ratio. The hull *lags, overshoots, and settles* like a real boat.
- **Horizontal forces:**
  - **quadratic wind drag** on the relative wind
  - **anisotropic hull drag** (low forward, high lateral; linear + quadratic)
  - a **nonlinear anchor-rope spring** (`K1·ext + K3·ext³` + damping) at the bow roller
  - **coupling to the waves' orbital velocity**, so the swell nudges the boat around
- **Yaw torques** come from the rope, windage, and the **fore/aft orbital difference**, with a soft limit and quadratic damping. **Heel** comes from apparent wind **plus the diver's weight at the rail**.
- **Wind** is layered sine gusts with a slowly wandering direction.
- **Secondary motion:** rigging and lanterns sway on a spring driven by the **boat's measured acceleration** (a derived "gravity" vector). Laundry is a cloth sim driven by wind + boat motion, and flags flutter.
- A NaN guard, clamps, and substep caps (≤ 10 per frame) keep it stable.

## 4. The jumping fish (`leaps.js`, 690 lines)
- It's a **director, not a spawner**. Every 15-45 s, **only in daylight and only while the camera is above water**, it tries up to 24 candidate spots **in front of the camera**. It **rejects any spot whose *whole* trajectory won't stay on screen**, that overlaps **UI text boxes** (title, logo, story, credits), or that's too close to the boat or between the camera and the boat.
- **Three species with physically based paths:**
  - **Flying fish** schools (1-5): an *out → taxi* phase with tail-slap splashes every ~0.08 s, then a *glide* with drag and fins spread, optionally a second taxi/glide, then re-entry
  - **Mullet:** 1-3 ballistic hops (`g = 9.81`) with pitch following velocity and a roll on re-entry
  - **Dolphins** (pods of 1-3): ballistic arcs with **separate splash events when the nose and tail cross the surface**, both leaving and entering
- **Trajectories are baked once at 60 Hz**, then interpolated. Splashes and sounds are **scheduled events** with distance and **stereo pan**. The fish bend and fold their fins in the vertex shader.
- **Tiny budgets:** instanced pools of 6 fish, 3 dolphins, 48 splashes, and 56 drops. A `?seed=` URL parameter makes it reproducible for testing.

## 5. Background cliffs & distant land (`island.js`, `horizon.js`)
- **One analytic height function** builds the whole island:
  - a **noisy elliptical coastline** with Gaussian coves and a cape
  - a **sea-cliff profile** about 30-44 m tall, rising to **124-210 m ridges**
  - **radial ravines** cutting the ridges
  - **"buttress" and "flute" functions** (sawtooth waves over rotated, noise-warped coordinates), which carve **vertical fluting into the cliff faces**. This is the main thing that makes the cliffs read as real
  - ridged-noise detail and flat **threshing floors** placed on gentle slopes
- **The cliff shader** adds:
  - **strata ledges** (`fract(y/9)`, anti-aliased with `fwidth`) and dark water streaks down the faces
  - a **tidal notch**: a dark erosion line 1.3-2.2 m above the sea
  - a **wet, darker band** at the waterline, with wet roughness
  - **sea caves**: arch shapes placed in hashed cells along the cliff base
  - **terraces with stone walls** (`fract(y/3)`) and scrub dots
- **Baked per vertex:** AO, and **sun visibility ray-marched against the height field for two sun positions**, blended as the sun moves. That's cheap, soft terrain self-shadowing at any distance.
- **Rim light:** a per-vertex **"skyline" test** flags vertices on the silhouette against the sky. When the sun is behind a ridge, those edges glow gold.
- **Land haze:** a height-fog integral plus distance haze. **The haze colour is sampled from the sky at the horizon**, warm-gold toward the sun and blue away from it, and it's clamped so sunlit faces never wash out.
- **Several distant ranges** (ridged noise on simple planes, around 8k vertices each) carry a **"faint" attribute** that layers them into atmospheric depth.
- **Coast foam:** a **marching-squares pass extracts the actual shoreline** (the height-0 contour) into a foam ribbon, with a surge that travels along the coast.
- **Life at the horizon:** a distant sailing vessel crosses the horizon. At night, lighthouse lamps and the boat lamp light up.

## 6. Loading screen (`main.js` + an inline classic script)
- A **tiny classic (non-module) script runs before the 3.5 MB module is even parsed**. It **paints the artwork procedurally in a few milliseconds**: a Path2D silhouette, noise-textured bronze, and blurred edges, drawn on **three stacked canvases with increasing gear detail**.
- A CSS variable **`--p` (progress)** fades in the finer layers (`ld-rg1` after 10%, `ld-rg2` after 60%), so **the artefact "resolves" as loading advances**. It also drifts slowly (30 s) and respects reduced motion.
- **Themed stage messages are mapped to the real build stages:** "Charting the strait" → "Raising the swell" → "Growing the seagrass" → "Sinking the cargo" → "Burying the fragments" → "Stocking the reef" → "Lighting the sea" → "Polishing the bronze". The title is Greek (**Αντικύθηρα**).
- An **asymptotic "creep"** keeps the bar moving during long shader compiles, so it never looks stuck.
- **Fonts are warmed** with hidden spans and `document.fonts`, so text never flashes unstyled.
- **Two-phase warm-up:** the **title objects compile first** (`compileAsync`) and are "warm-drawn" to force GPU uploads. The **underwater world then compiles in the background, time-boxed**, and is revealed in batches after the title is interactive.
- The loader fades out over 0.8 s.

## 7. Other notable systems
- **GPU-timed adaptive resolution:**
  - it uses `EXT_disjoint_timer_query_webgl2` (a 4-query ring, read asynchronously and smoothed), falling back to counting missed frames
  - scale levels depend on DPR
  - **after a failed upscale it backs off exponentially** (15 s → 120 s)
  - it **never rescales during a transition**, and phones are capped at 30 fps
- **`hitchGuard`** logs every shader program, geometry, or texture created *after* warm-up, which pinpoints hitches.
- **Optional HDR output:** on HDR displays, a WebGPU canvas composites the WebGL frame with extra stops.
- The diver, creatures, and props are procedural SDF/surface-nets geometry. Audio is procedurally generated (bells, bubbles, ratchets, clinks).

## What we're adopting

| # | Technique | Where in Copilot Isles | Tier |
|---|---|---|---|
| 1 | **Wave table → generated GLSL**, deep-water dispersion, **displacement-inverted exact height**, **CPU/GPU-identical distance fade** | The ocean, buoyancy, floats, splashes | All |
| 2 | **Polar camera grid + `aSpan` wave filtering + roughness-from-variance specular AA + Poisson sparkles** | The open sea (replaces a plain clipmap for the far field) | All (sparkles Medium+) |
| 3 | **Analytic ship reflection & shadow on the water** (a simplified hull SDF) | The brigantine and moored ships: **4 jittered rays on High/Ultra, 1 ray on Medium** (inside the ship's screen rectangle), a hull smear on Low, none on Lite. The planar mirror stays as the High/Ultra harbor add-on | Medium+ (per the delta-review consensus) |
| 4 | Hull **waterline foam ring**, hull **wet band**, **slam spray** | The brigantine, moored boats | All (spray Medium+) |
| 5 | **Damped-spring buoyancy at ~8 hull stations** (heave/pitch/roll) + orbital coupling + wind heel + anisotropic drag, **layered on our player-controlled kinematic sailing** | Sailing and docking, plus **anchored NPC ships swinging on mooring ropes** | All |
| 6 | **Secondary motion from measured hull acceleration** (lanterns, rigging, ropes), cloth flags/laundry/sails on the shared wind | The brigantine, harbors, villages | Medium+ |
| 7 | **Crew-load heel:** the ship heels slightly toward the player walking the deck | The brigantine | All |
| 8 | **The "Leaps" director:** visibility-checked, **UI-text-aware**, boat-aware, physically based leaps with scheduled splash/sound events | **Flying fish** (Anchorage lagoon/reef, open sea), **mullet** (Port Meridian harbor), **dolphins** (open sea). Later: a whale breach or mantas. Also **on the title screen** | All |
| 9 | **Analytic coastline & cliff functions** (buttress/flute fluting, ravines, capes) + a **cliff shader** (strata ledges, **tidal notch**, **wet band**, **sea caves**, terraces) | Port Meridian's ridge and harbor walls, Keelhaven's rocky cove, Sunspire's mesas, Tidewheel's volcanic cliffs, Guildcrest highlands | All |
| 10 | **Baked vertex AO + sun visibility for 2 sun states** + a **skyline rim-light attribute** | All island terrain and distant ranges (baked **at build time**, not at load) | All |
| 11 | **Layered distant ranges** with a "faint" attribute + a **sky-sampled land haze** (gold toward the sun, blue away) | Every horizon, **including the title screen** (procedural, ~0 bytes) | All |
| 12 | **Marching-squares shoreline → coast foam ribbon** with a travelling surge | Every island's shoreline (complements depth foam) | All |
| 13 | **Horizon life:** distant ships, and lighthouse lamps at night | The open sea, and lit lighthouses on the Chart islands | All |
| 14 | **Instant procedural loader art** (a classic script before the module), **progress-revealed layers**, **themed stage messages mapped to real stages**, asymptotic creep, font warm-up | Our loading screen (PLAN §13.8) | All |
| 15 | **Two-phase compile/warm:** title first, the island in the background (time-boxed), revealed in batches, plus `warmDraw` to force uploads | PLAN §13.4 / §12.5 | All |
| 16 | **GPU-timer-driven adaptive resolution** + exponential backoff + no rescaling during transitions | PLAN §12.9 | All |
| 17 | **`hitchGuard`** (log programs/geometries/textures created after warm-up) + `?seed=` determinism | Dev HUD + Playwright | Dev |
| 18 | Optional **HDR output** on HDR displays | Post-POC experiment (Ultra) | Ultra |

**What we'll do differently:** they generate everything at runtime (17.6 s to a warm title on an M3 Max, 213 programs). We **bake terrain, AO, sun visibility, rim flags, and shorelines at build time** into packs (§13), keep a small shader library, and generate in workers only what must be dynamic.
