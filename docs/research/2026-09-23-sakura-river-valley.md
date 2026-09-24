# Reference study: Sakura River Valley (2026-09-23)

**URL:** https://valley.mengto.here.now/, "A real-time 3D mountain river valley in feudal East Asia at golden hour."
**Method:** I pretty-printed the production bundle and read its shaders and render loop. The GLSL comments survive minification and explain each technique. I also measured the scene in desktop Chrome (headless, ANGLE Metal, Apple M3 Max) through the page's own `window.__v` debug hook.

> **License:** the scene code has **no license**, so it's all rights reserved. **We study the techniques and write our own implementation. We never copy code or shaders.** The textures are Poly Haven CC0, and three.js is MIT. (Screenshots of the site stay out of this repo.)

## Measured

| Metric | Value | vs our PLAN §12.1 (High) |
|---|---|---|
| Total download | **~7.5 MB**: 7.25 MB of assets (45 files: WebP color+normal pairs and gzipped custom meshes) + a 283 KB Brotli JS bundle | Well under our 25 MB title budget |
| Draw calls per frame | **239**, counting the mirror pass, main pass, and every post pass | Within our < 300 |
| Triangles per frame | **~5.9 M** across both scene passes (mirror + main) | Far over our < 2 M. That's fine on an M3 Max, but it wouldn't be on Iris Xe/M1 |
| Shader programs | 85 | Fine (all compiled up front) |
| Frame rate | 60 fps (rAF-capped) at 1600×900, render scale 1.0 | n/a (a fast GPU) |

**Caveat:** it's an **on-rails river journey** with a bounded view corridor, which makes budgets far easier than our open islands and open sea.

## What it does, by system

### Water (river)
1. **Planar reflection:** a mirror camera renders at **half resolution (DPR capped at 1.3)**. A `noReflect` layer excludes small objects, and a global `uReflect` flag makes every material take a **cheap shading path** in the mirror pass (no triplanar, no caustics). The reflection is distorted by the surface normal and damped with distance.
2. **Refraction from a scene copy:** the opaque pass is copied to a half-res target with **linear depth in alpha**. The water offsets the lookup by the normal × depth, and **falls back to the undistorted sample if the offset lands in front of the water**, which avoids haloing.
3. **Beer-Lambert absorption:** the optical path is the vertical depth stretched by the view angle, clamped to the bed distance from the depth buffer. Transmittance is `exp(-absorb·path)` with an RGB absorption coefficient, plus an in-scatter body colour. The **Fresnel term** (Schlick) blends refraction and reflection.
4. **Two-phase flow map** for moving water: two offset phases cross-fade, so there's no visible reset. Wind ripples are layered on top without advection, and normal strength fades with distance to reduce aliasing.
5. **Foam:** a "lace" function erodes multi-octave cell noise by a coverage value, so edges break up. A **baked foam map** marks rapids and collars, shoreline foam comes from the depth threshold, and everything is advected with the flow. **Noise is only evaluated where foam is possible**, which is a branch for performance.
6. **Boat interaction, entirely analytic in the water shader**, with no particles or simulation:
   - **Kelvin wake arms**, a churned trail, a **bow-wave crescent**, hull-hugging streaky whitewater, and rings around the hull that are present even at rest
   - **Hull cut-out:** water fragments inside the hull are discarded, using **the same hull-shape function as the CPU**
   - **The boat's shadow on water** is ray-stepped toward the sun against that hull function
   - Oar rings plus a swirl
7. **Sun glitter** uses two specular lobes. **Lantern glints** (up to 8 lamps) are smeared into columns by the ripples.
8. **Rain rings** use a 3-layer cellular ripple field that fades with distance. **Wetness** darkens and smooths materials.
9. **Riverbed caustics** are injected into the terrain material (`onBeforeCompile`) *as extra sunlight*, so shadows still hold. Light below the waterline is **attenuated by the water column**, which fixes shallows that would otherwise "glow cyan".
10. Materials show a **waterline tidemark** (wet, darker wood plus an algae band) on the hull and rocks.

*It doesn't have* open-ocean swell, breaking surf, or beach run-up, because it's a river. Our Gerstner ocean plan still covers those.

### Physics (no physics engine)
- The **boat is kinematic** in **river-relative coordinates** (distance downstream plus lane). The hull is sampled at **8 points along the keel**, each widened by an analytic beam function. It's checked against **circle obstacles** (rocks, bridge piers) and the bank constraint, with **4 iterations of depenetration**.
- **Impact response:** a hard bow hit reverses speed (×−0.15) and adds a decaying "bump" shake. A glancing hit just adds drag. Yaw offset and speed use exponential smoothing.
- **Procedural bob, pitch, and roll** come from layered sines, turn-induced heel, and the bump shake. The **analytic terrain height `h(x,z)`** is shared with placement and gives the depth under the boat.
- **Autopilot lane planner:** when idle, it scores candidate lanes against obstacles ahead every 0.2 s and steers smoothly. Manual WASD takes over, and it hands back after 12 s idle.
- **Single sources of truth:** the hull, terrain, and river centre-line functions exist in **both JS and GLSL** (a river lookup texture feeds the shader).

### Environment
- **Sky:** procedural, with a warm horizon bloom, a **curved cloud layer** lit with silver-gold edges toward the sun and cool undersides, and a storm deck that thickens it. At night there are **stars** (jittered cube-grid, twinkling), a milky band, and a cratered moon with a halo, plus lightning inside the clouds.
- **Atmosphere:** analytic **exponential height fog** (closed-form integral), distance haze, and **low river mist** in drifting noise banks. Fog colour comes from the view direction relative to the sun (cool → warm), and the mist glows where the sun rakes through.
- **Volumetric sun shafts:** a **ray-march through the sun's shadow map** at half res (26 steps, interleaved-gradient-noise jitter, Henyey-Greenstein g = 0.8). It uses **temporal accumulation** (history blend 0.3) and a **depth-aware bilateral blur**.
- **One shared wind field:** gust fronts travel along the wind direction and drive all foliage, petals, flags, and a **CPU spring** on the straw cape.
- **Time of day & weather:** a 510 s cycle keyframes about 20 parameters: sun colour, hemisphere light, fog, mist, sky and cloud colours, exposure, bloom, shafts, lamps, and night. Storm/rain/wetness/lightning and rain audio come from filtered noise. Lamps turn on at dusk, **petals become fireflies**, and birds roost.
- **Particles:** falling, settled, and floating petals that **part around the hull and fan into the wake**. Bird flocks circle with flapping bouts and glides, and mist wisps have halos around lanterns. Particles **wrap in a camera-following box**, so nothing is spawned or allocated.
- **Materials:** triplanar that skips weak projections, an albedo lift for dark scanned maps, procedural roof-tile detail, and **translucency for straw, paper, and petals** with a low sun behind them. NPCs get **procedural idle life**: breathing, weight shifts, and a broom sweep.

### Post & performance
- **The pipeline, in order:**
  1. mirror pass (half-res)
  2. opaque pass
  3. copy (half-res color + linear depth)
  4. transparent pass (water)
  5. volumetric shafts, then SSAO (half-res, bilateral blur, fades with distance)
  6. **6-level bloom** (mip down/up chain)
  7. composite: chromatic edge fringe, a warm veil around the sun, **white balance by sun height**, a night blue shift (Purkinje), flat storm light, a painterly grade (teal shadows, amber highlights, S-curve), vignette, **film grain + dither**, and fade
  8. **FXAA + an unsharp mask** when upscaling
- **Shadows:** a single 4096² directional map with **`autoUpdate = false`**. It's re-rendered only when the focus point moves more than 55 m (snapped to a 4 m grid) or the lighting changes.
- **Adaptive resolution:** it averages frame time over 60 frames after a 90-frame warm-up. Above 23.5 ms, scale ×0.92 (×0.84 above 45 ms), with a floor of 0.72. Below 17.6 ms, scale +0.05. Cooldowns are 8 s after a drop and 2.5 s after a raise, and it pauses while the tab is hidden.
- **Loading:** a staged build that yields between stages via `MessageChannel` and reports progress to the brush-stroke loader. **`renderer.compile()` runs with everything visible** before the reveal, so there's no first-frame hitching.
- **Render layers** gate which objects render in which pass.
- **A debug API** (`window.__v`) offers `info()`, `setRes()`, `setDay()`, a deterministic `shot()` camera placement, and `bolt()`. It's ideal for automated visual tests.

## What we're adopting (see PLAN §6 "Water system", "Physics & motion", "Environment", and §12)

| # | Technique | Where it goes in Copilot Isles | Tier |
|---|---|---|---|
| 1 | Scene-copy **refraction + Beer-Lambert absorption** with per-island absorption presets | All water (turquoise lagoon vs deep ocean vs volcanic) | All tiers (Low: no distortion) |
| 2 | **Seabed caustics** injected into the terrain material + **underwater light attenuation** | Anchorage lagoon, reef, harbors | Medium+ |
| 3 | **Two-phase flow maps** | Waterfalls, streams, **the P0.1 sluice channels**, the Thousand-Bough rivers | All tiers |
| 4 | Foam lace + depth shoreline foam + evaluate-only-where-possible | All shores, wakes, rapids | All tiers |
| 5 | **Analytic wake / bow wave / hull foam / hull cut-out / boat shadow on water** | The brigantine, the training cutter (P1.2), NPC boats | All tiers (Low: no shadow march) |
| 6 | **Planar reflection for calm zones** (half-res, layer-culled, cheap-path shaders) | Lagoon & harbor basins only. The open sea keeps PMREM | **High/Ultra only**, as an *add-on* to the agreed PMREM baseline |
| 7 | Floating debris that parts around the hull (leaves, petals, flotsam) | Harbors, lagoon | Medium+ |
| 8 | **One shared wind field** (GPU + CPU) | Palms, grass, flags, **sails (tied to the sailing wind)**, sashes & coats (CPU springs) | All tiers |
| 9 | Analytic height fog + **low mist banks** + sun-direction fog colour | Every island (mist especially at Thousand-Bough and Keelhaven) | All tiers |
| 10 | **Shadow-map ray-marched shafts** + temporal accumulation | Port Meridian streets, jungle canopy | High+ (Medium: cheaper screen-space radial) |
| 11 | **Lighting keyframe system** (time-of-day presets, blendable) | Each island's fixed preset. Optional slow drift. Weather post-POC | All tiers |
| 12 | Rain rings + wetness + tidemark bands | Tidemarks on docks/hulls in the POC. Rain showers post-POC (e.g. Thousand-Bough "soft rain") | Medium+ |
| 13 | **Static cached shadow map** + movement-threshold refresh | Static world. Characters use a small dynamic map/contact shadows | All tiers |
| 14 | Concrete **adaptive-resolution** thresholds & cooldowns | PLAN §12.9 | All tiers |
| 15 | Film grain + **dither** (no banding in sky/fog), white balance by sun height, FXAA + unsharp when upscaled | Composite pass | All tiers |
| 16 | Translucency for thin materials | Palm fronds, sails, paper lanterns, bougainvillea | Medium+ |
| 17 | **Kinematic boat: multi-point hull sampling + iterative depenetration + bump response** | Brigantine vs docks, rocks, and buoys (no Rapier body, as agreed) | n/a |
| 18 | **Autopilot lane planner** (obstacle cost, periodic replanning) | **P1.2 Autopilot voyage** and chart **"Sail here"** auto-sail | n/a |
| 19 | Shared analytic functions in TS + GLSL (terrain, shore distance, hull) | Water, placement, buoyancy, wake | n/a |
| 20 | Procedural idle life on NPCs, layered over skeletal idles | All NPCs | Medium+ |
| 21 | Debug API with deterministic `shot()` | Playwright visual-regression tests + benchmark flythrough | Dev only |

**Not adopting:**
- Their custom mesh format. We stay with glTF + meshopt + KTX2, which keeps textures compressed in VRAM (they ship WebP, which decodes to full-size RGBA in VRAM).
- Their per-frame tri count. We keep our tighter budget, **counted across all passes including the mirror**.

## Gaps neither reference covers (our own additions)
- **Open-ocean swell + breaking surf lines + beach run-up (swash):** a wet-sand band that follows the wave run-up and recedes, plus foam lines that form over the reef break. Tropical beaches need this.
- **Wading interaction:** rings and foam around the player's legs, the same analytic ring technique as the oar.
- **Sail cloth:** a vertex-shader billow driven by the shared wind + sailing trim state, with luffing when you head into the wind.
