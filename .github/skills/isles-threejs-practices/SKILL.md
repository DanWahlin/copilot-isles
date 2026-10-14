---
name: isles-threejs-practices
description: Copilot Isles' rules and lessons for three.js (r186, WebGPU-first, TSL) world building. Use when adding or changing an island, terrain, vegetation, characters, the opening, shaders/materials, GPU resources, loading/streaming, or anything rendered in the game; and before adding a new island.
---

# Copilot Isles: three.js world-building practices

The game runs on three.js **0.186** with `three/webgpu` + `three/tsl` (WebGPU first, automatic WebGL2
fallback). Read `.github/copilot-instructions.md` first; this skill adds the _how_ and the lessons
learned. For general TSL/WebGPU API questions, also load the `webgpu-threejs-tsl` skill.

## 1. Islands are data, shared systems are generic

Every island is a package; shared systems never import an island's coordinates.

| Seam                       | Shared side (generic)                                                                                                                                                                                     | Island side (data)                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Berth, music, sky, arrival | `src/game/islands.ts` (`ISLANDS`, `IslandId`)                                                                                                                                                             | one entry per island                                                                                                                               |
| Terrain looks              | `src/world/terrain/terrain-material.ts` + `terrain-regions.ts` (`TerrainRegions`, `combineTerrainRegions`)                                                                                                | `src/world/islands/anchorage/terrain-regions.ts`, `src/world/islands/meridian-terrain-regions.ts`; registry `src/world/islands/terrain-regions.ts` |
| Vegetation                 | `src/world/vegetation/scatter.ts`, `grass.ts`, `vegetation.ts` (`IslandVegetationRules` in `vegetation/types.ts`: bounds, grass bounds, species rules, exclusions, curated/extra plants, hero palm zones) | `src/world/islands/anchorage/vegetation-rules.ts` (`ANCHORAGE_VEGETATION`)                                                                         |
| Starfish                   | `src/world/starfish/spots.ts` (`StarfishSpot`, `STARFISH`)                                                                                                                                                | `src/world/islands/anchorage/starfish.ts`, `src/world/islands/meridian-starfish.ts`                                                                |
| Towns                      | `src/world/village/kit.ts` (kit loader, buckets, `transform`/`paint`/`localToWorld`, colliders, anchors), `house-builder.ts`, `materials.ts`                                                              | `src/world/islands/anchorage/village.ts` (+ `buildings.ts`, `plantings.ts`, `lighthouse-stair.ts`), `src/world/meridian-town/`                     |
| Shore batteries            | `src/world/village/shore-battery.ts` (decks, stairs, fences, guns into the town buckets; walk surfaces, colliders), `shore-cannon.ts` (the gun model and its levels)                                      | `src/world/islands/anchorage/batteries.ts`, `src/world/islands/meridian-batteries.ts` (+ the citadel's embrasures)                                 |
| Island layout data         | none                                                                                                                                                                                                      | `src/world/layout.ts` (`COVE`, Anchorage), `src/world/islands/meridian.ts` (`MERIDIAN`)                                                            |

Adding an island: create its package, add one line to each registry, done. If you find yourself
writing `smoothstep(548, 566, P.x)` or `COVE.` inside a shared file, stop and add a region or rule to
the island's data instead. A terrain region is a 0-1 TSL mask in world space; the shared material owns
the look (`dryGrass`, `town`, `bluff`, `grassHill`, ...), the island only says _where_.

## 2. Shaders: TSL only, one graph per look

- Write materials as TSL node graphs (`colorNode`, `positionNode`, `opacityNode`, `maskNode`).
  Never GLSL strings, `ShaderMaterial`, `onBeforeCompile`, or three.js private fields.
- CPU and GPU share one source of truth: write the maths once in TS and build the TSL from it
  (waves, terrain height, hull shape, wind, the chart pop-up curve `popUpY` in `opening/island-grid.ts`).
- Reuse materials: one shared, parameterised material per look (per-instance variety through
  attributes like `tint`, or uniforms), not a new material per mesh. Each distinct graph is a WebGPU
  pipeline; keep within PLAN §15.4.
- Compute is WebGPU-only: gate it on the capability check and ship a non-compute fallback. WebGL2 is a
  first-class, tested path (iPad WebGPU only arrived with iPadOS 26).

## 3. No hitches: precompile, don't allocate

- The hitch guard (`window.__isles.hitches()`, `src/engine/frame-counters.ts`) records any new
  program, geometry or texture after warm-up. It must stay empty. Meshes or materials that appear
  later (a flight, a pop-up, a late-loading prop) must be shown to warm-up (`userData.prewarm`,
  `compileProgressively`, `renderer.compileAsync`) before they are needed.
- A deliberate late addition (loaded after first paint on purpose, like the title's gulls and leaps)
  must be precompiled with `renderer.compileAsync` and wrapped in `engine.counters.excuse(load())`,
  so its uploads aren't reported as hitches. Don't use `excuse` to hide a missing precompile.
- Hot loops (`update`, `frame`) don't allocate: no `new Vector3/Quaternion/Color/Matrix4`, array or
  object literals, spreads, `.map`/`.filter` per frame. Keep scratch objects at module or class level
  and refill reusable arrays (`arr.length = 0; arr.push(...)`), like the harbour mirror's hidden list
  and the cloud trace's compute lists.
- Build big things in slices (`buildSlice`, `runSliced`, generators with `breathe()`), a few ms a frame.
- A precompile only helps if it builds the **exact** pipeline the real draw uses (same shader code and
  same pipeline key: depth format, sample count, blending). Otherwise it's waste, and the real draw
  still builds its pipeline synchronously. Measure, don't assume (issue 231):
  - `renderer.info.memory.programs` counts shader **modules** (deduplicated by code), not pipelines.
  - r186 `compileAsync` builds nodes and pipelines **after** its first await, across several yields.
    State you set around the call (render target, MRT, `velocity.setProjectionMatrix`) can be gone by
    then, unless it's held until the returned promise settles (see `post.compileObject`).
  - The scene pass draws one render call deeper than `compileAsync`, so it gets new render objects.
    Skinned and instanced meshes then get new bone/instance buffers named by node id, so a new shader:
    don't precompile them for the pass; the warm's real draws build them.
  - Only precompile what a pass really draws (the harbour mirror skips its hidden list).
- Other islands load lazily (issue 232): stream one only when something needs it (boarding, the
  chart, a save or jump there, or coming within range), then warm it through the flow (see
  `GameFlow.warmMeridian`). Keep it hidden until its warm-up draws it: a hidden group isn't compiled
  by `compileAsync` (it compiles nothing), and a first on-screen draw builds shaders on the spot.
  Terrain levels of detail need a real draw each (`warmTerrainLods`); a precompile won't upload them.
- Anything added after the island's warm-up (late props, life, another island) goes through
  `cove.setLateWarm`'s warm (`GameFlow.warmLate`), not a bare `renderer.compileAsync`: a top-level
  precompile doesn't match the scene pass, so the first draw builds the shader anyway.
- Another island's plants go in with `vegetation.addPlants` when that island streams in, not in the
  first island's batches.
- Shader sharing (issues 235–237): three r186 names some buffers after node ids, which makes every
  mesh's shader unique. Characters go through `shareSkinning` (one skinning graph, a named bone
  buffer) and keep their palette in `paletteMap`, not `map`. New instanced meshes use
  `sharedInstancedMesh` and `markInstancesChanged`. Don't precompile instanced meshes for the scene
  pass (it doubles their instance buffers); the warm's real draws build them.
- New characters (anything made by the character library) stay out of the harbour mirror through
  `unreflected`; other late roots that shouldn't reflect can register there too.
- Shadow passes (PLAN §15.4): three builds each material's shadow shader from its `colorNode` alpha
  and its `map`, so an opaque look got its own shadow shaders. Pass opaque `colorNode` materials
  through `plainShadowColor` (engine/shadow-color.ts) once the graph is final, and opaque `map`
  materials through `palettedMaterial` (characters/stage-light.ts). Don't set
  `receiveShadow = false` to keep a mesh out of the sun's shadows: it builds a second shader for the
  same look. Use `skipSunShadows` (sky/cached-sun-shadow.ts); the warms mark the rest
  (`skipSunShadowsWhereOff`). The islands take the sun's shadows on Medium and up
  (`islandsTakeSunShadows`); on Low `cove-scene` skips them for every island root it adds.
- Count programs with a census, not by guess: per tier, landed on Anchorage and after
  `window.__flow.travelTo('island:meridian')`, on both backends (`renderer.info.memory.programs`).
  Walk both islands first (teleport through a few spots): roaming Port Meridian adds about 6.
- A precompile that builds a different shader from the draw only wastes programs. Find them in the
  census as stages used only in the precompile context. The very first scene-pass build always came
  out different (an unused varying, or render uniforms in another order) for whatever compiled first
  (the sky dome, the ocean, the terrain): `post.compileObject` now compiles a throwaway lit receiver
  first and frees it.
- The WebGL2 backend names uniform buffers after node ids, even with `setName`. Make per-object
  inputs (`reference`, `referenceBuffer`) once, outside the `Fn`: built inside, each build (each
  shadow map) made new nodes and a new shader (the shared skinning gave 12 shadow vertex shaders).
- Prefer one graph with a uniform switch over two near-identical materials (dolphins and flying
  fish share `createLeapCreatureMaterial`); a double-sided colour graph can often be faces of its own
  (the chest lid's inside is flipped, darker faces on the body's shader).
- Use a uniform's node in a graph, never its `.value`: `world.sunDir.value.y` went into the
  vegetation shader as a constant, so each vegetation material built at another sun height (the
  banyan, the brush) was its own program, and the glow didn't follow the sun.
- A dev page precompiles like the game (`post.compileObject` through `compileProgressively`), or its
  census counts shaders the game never builds (play.html's bare `compileAsync` added about 12).
- Late instanced additions on the title (gulls, leaps): don't precompile them (no precompile matches
  an instanced draw). Add them and wait two frames inside `engine.counters.excuse`.
- Every distinct look in the harbour mirror is a second set of shaders: keep small things out
  (`unreflected`: chests, message bottles, characters). Static instanced props cost an instanced
  shader per look: bake them per material (`bakeInstances`; Anchorage's crates, casks, sacks and pots).
- Don't draw to the canvas outside the post stack: the renderer's own output pass (a canvas-sized
  target and an output quad) then lives for the page. The opening draws through
  `createCutsceneOutput`, which it frees.
- Measure a sea battle too (`tools/battletest.mjs`; its world comes from a continued save, so warm
  order differs from a new voyage). Keep the battle peak ≤ 140 so a new island has room.

## 4. GPU resources have an owner

- Whoever creates a geometry, material, texture or render target disposes it. Shared caches expose a
  release function that frees the **GPU copy** but keeps the CPU data, so the next voyage re-uploads
  without a refetch or a regeneration (`releaseTerrainTextures`, `releaseTerrainNoiseTexture`, the
  opening's `releaseNoiseTexture`). The world's owner (`cove-scene` dispose) calls them.
- After a voyage ends, `renderer.info.memory` at the title should match the title before it. Trace
  leftovers by recording textures that get a `dispose` listener and never dispose (debug-only page
  patch of `EventDispatcher`; see the session's `texleak.mjs` approach), or wrap the renderer's
  `info.createTexture`/`destroyTexture` for an exact list.
- three r186 keeps a drawn object's render object (and its shaders) until the **object or its
  material** is disposed; disposing the geometry isn't enough. Meshes that share a cached material
  (chests, palms, faces) kept theirs after a voyage: `GameFlow.endVoyage` sends `dispose` to every
  object that left the scene (`releaseRemovedObjects`), and the opening does the same for its cabin.
- Cached materials and geometries free their GPU side after a voyage (`releaseFaceResources`,
  `releaseVillageKitTextures`, `releaseWaterDepthTexture`, the chests' last `dispose`).
- three's `RTTNode` (`convertToTexture`, FXAA's input `fxaaNode.textureNode`): call the node's own
  `dispose()`. It frees its target and its quad's material, and with them the quad's shaders.
- three's `TRAANode` draws with a 1x1 depth stand-in until its first depth copy and never frees it:
  the post uses our copy (`engine/traa-node.js`, MIT, three r186), whose `dispose()` frees it.
- A viewport depth node's `.sample(uv)` clones share their base's copies (three's own do); our
  `MatchedDepthNode` once made a full-screen depth copy per clone (9 on the title). Each ocean owns
  its depth copies (`MatchedDepth`): one shared set, freed by whichever ocean went first, left 1×1
  depth textures behind.
- Never dispose a geometry with **interleaved** attributes that something will draw again: three r186's
  WebGPU backend keeps the destroyed buffer and the next draw submits it ("used in submit while
  destroyed", issue 251). three's `Sprite` quad is interleaved and shared by every sprite: our sprites
  draw `useSpriteQuad` (engine/sprite-quad.ts, plain attributes, counted), never three's. A one-shot
  geometry (merged, never drawn again) is fine. `tools/revoyagetest.mjs` plays three voyages in a
  row and fails on any WebGPU validation error.
- Shared texture caches count their users: the baked cloud keys free their GPU copy with the last
  dome that used them (the voyage's dawn and dusk keys stayed at the title).
- Nothing new may draw through the island's post: back at the title, nothing's drawn until the
  title's post is ready (`restoreTitlePost`). One frame of the title through the island's TRAA scene
  pass built a second set of the title's shaders on Medium.
- Measure with `info.memory` at the first title, after one voyage and after two (a leftover that
  grows each voyage shows on the second), per tier, on both backends.

## 5. Lessons learned (bugs we have hit)

- **A value first built inside a `select` branch (palms went black):** three writes `select` as an
  `if`/`else` and sets a node shared by the graph where it's first built. The palm's `normalLocal`
  (the fronds' flutter) and `normalView` (the fronds' glow) were first built in the fronds' branches,
  so the trunk's normal was zero: a NaN once normalised, which turned the trunk black in the sun's
  normal-biased shadow lookup (and left it unlit before). Build shared values outside the branches
  (`withVars` in vegetation/materials.ts), and check the built shader: `palm-material.test.ts` builds
  WGSL with three's node builder and flags a variable read on a path that never set it.

- **Z-fighting with paper or decals:** geometry that lies exactly on a surface flickers through it.
  Sink it below the surface while it is flat (the chart's `PAPER_TUCK`), or offset it; never rely on
  equal depth.
- **Additive light layers wash out characters:** see-through additive volumes (sunbeams, haze)
  between the camera and a character read as a milky overlay. Clear them where they cross the
  character (the cabin's `guideClearance`), or put them behind.
- **Alpha-tested foliage at a distance:** thin leaf cards vanish when drawn small, leaving only their
  most opaque parts (red flowers became red blotches on the hills). Hand distant plants to impostors,
  and check authored leaf colours (the common bush's leaf map was red; it is recoloured green).
- **Masks decide the look more than the palette:** brown hills came from slope and height mask rules
  calling grassy hillsides rock and cliff. Fix the masks (`coveMasks`) before re-tinting colours.
- **Splashes from nowhere:** a splash reads as an event, so its cause must be visible at the distance
  it's seen. Battle splinters (0.4 m chips) and far flying fish made bright splashes with nothing
  visible above them; a hit splashed beside the hull; a pod splashed before its first animal; and the
  battle sampled waves on its own clock (out of phase with the drawn sea). Now: no splash without a
  ball, a sinking hull or an animal you can see (`LEAP_MIN_PIXELS`), effects sample the ocean's clock,
  and ambient life keeps out of battles and puzzle courses (`QuietSea`).
- **Shared audio and voice:** one subsystem cancelling must not stop a voice another system started
  (`Dialogue.cancel` only stops its own line).
- **Background shakes with TAA on (motion vectors):** trees and hills behind Thousand-Bough's mist
  shook by about 1 px with the camera still: TRAA's sub-pixel jitter showed wherever the motion
  vectors were wrong. Velocity has no blending, so a see-through card wrote its (nonsense) motion over
  its whole quad, and three takes a vertex's last position from the plain geometry, not the
  `positionNode`, so wind sway and shader-placed grass read as motion. Now the scene pass uses
  `sceneVelocity` (engine/motion-vectors.ts): see-through effects that write no depth leave the
  motion behind them (`writesMotionVectors` opts one in, like the ocean). Wrap displacing
  `positionNode`s in `trackedPosition`, or set `positionPrevious` yourself (ocean, shared skinning).
  Check with a still camera and paused clock: a burst of screenshots should not move.
- **Frozen waterfalls (animation finer than a pixel):** the falls behind Fen's deck looked like ice.
  Their only motion was 44 ribbon columns across the sheet, each under a pixel wide at 120–140 m.
  That changes too fast for TRAA's history, which averages it towards a flat mean (and the video's
  encoder smears what is left), so only the still striation showed. The motion-vector fix wasn't
  the cause: the sheet's mesh is still, so its motion is zero with or without `sceneVelocity`, and
  with `?notaa` the ribbons only shimmer, they don't flow. Animated detail must be
  readable at the distance it's seen: the shared water material fades sub-pixel ribbons by
  `fwidth` and carries the motion in broad surges down the sheet. Measure the change per frame on
  the effect against a still patch, with TAA on and off.
- **Props stuck through an arm:** Rhea's spyglass sat on her forearm, placed for the bind pose, and
  her commander's hip fist went on the spyglass hand, so it stuck out through her arm in talk. Now a
  carried prop goes in the fist (`holdInFist`/`inFist` in npc-accessories: on the palm bone, its
  handle along the knuckle line, hanging plumb), a carrying hand never gestures or goes to the hip,
  and holders nod hello (the wave swings the prop through the head). Belt and back props sit where
  the arms and legs don't reach. `prop-audit.test.ts` plays every NPC's clips on the real rigs and
  measures each prop's depth in the skinned body (and a held one's in the coats): keep it under 1 cm.
- **vendor-three over its cap:** the shore cannon's `ExtrudeGeometry`/`LatheGeometry` (with
  `Shape`, its curves and earcut) added 6 KB gz to vendor-three, which is at its 256 KB cap. Build
  extrusions and lathes by hand (`extrudeX`/`lathe` in shore-cannon.ts, the starfish's fan). Before
  you import a new three class, check `npm run check:budgets` exits 0.

## 6. Verify like this

- `npm run typecheck && npm run lint && npm run format:check && npm test`, then
  `npm run build && npm run check:budgets && npm run check:secrets`.
- Terrain or mask changes: `npm run bake` and compare the printed hashes (unchanged hashes prove a
  refactor didn't move a single sample). Refactors of placement code should fingerprint their output
  (hash the scatter's JSON) before and after.
- Visual changes: screenshot with Playwright against `http://localhost:5301` (see `tools/flowtest.mjs`
  and `tools/lib/browser.mjs`), before and after, at the moment that matters. Use a fast JPEG burst
  for timed sequences (the opening chart lasts about 11 s).
- Flicker or z-fighting (docks, decals, paths, roofs, stacked boxes):
  `node tools/flickertest.mjs --views=pier,m-town --audit` freezes time, diffs still, sub-pixel
  jittered and dollied frames, and flags `stacked` regions (two hits under 5 cm apart). It writes
  diff images and `report.json`. Keep coplanar opaque faces at least 1 cm apart. Foliage shimmer
  with AA off is aliasing, not a fight.
- `tools/flowtest.mjs` runs title → voyage → chart → travel → settings → title with no console errors;
  `npm run test:e2e` runs the WebGPU and WebGL2 smoke tests (run them with `--repeat-each=4`
  when touching the title or warm-up: timing-dependent hitches only show some of the time).
- Dead code: `npx knip` with the real entry points (`src/boot/main.ts`, `src/dev/*.ts`, `tools/**`,
  tests). Duplication: `npx jscpd src --min-lines 12 --ignore "**/rock-assets.ts,**/*.test.ts"`.
  Shared helpers live in `src/util/math.ts` (`smoothstep`, `clamp01`, `mulberry32`,
  `segmentDistance`, `sinHash`); don't add local copies.

## 7. Scaling checklist

1. Islands data-driven (section 1).
2. Code-split per island with dynamic `import()`. Check Vite's `INEFFECTIVE_DYNAMIC_IMPORT` warnings:
   a dynamic import of a module that's also statically imported splits nothing.
3. Stream island assets (GLB, KTX2, audio) per island; prefetch the next, unload the far.
4. Disposal verified by `renderer.info`.
5. One material per look.
6. InstancedMesh for repeats, BatchedMesh for same-material props, merge static decor.
7. Per-instance culling, LOD and impostors for vegetation.
8. A gltf-transform pipeline (KTX2, meshopt) for every asset.
9. Per-island VRAM budgets sized for iPad; read `adapter.limits`.
10. Adaptive resolution and quality tiers (PLAN §12.1).
11. WebGPU timestamp queries when profiling.
12. WebGL2 tested continuously.
