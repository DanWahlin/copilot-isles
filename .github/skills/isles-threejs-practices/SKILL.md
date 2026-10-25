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

| Seam                      | Shared side (generic)                                                                                                                                                                                          | Island side (data)                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Island registry           | `src/islands/registry.ts` (`ISLAND_REGISTRY`, `IslandId`), `src/islands/types.ts` (`IslandEntry`); derived: `src/game/islands.ts` (`ISLANDS`, `islandAt`, `openIslands`), `src/islands/open.ts` (`islandOpen`) | `src/islands/<id>.ts`: berth, music, sky, arrival, gate, ranges, outline, starfish, course board (docs/adding-an-island.md)                                                                                                                         |
| Streams and content       | `src/world/islands/island-stream.ts` (`IslandStream`), `src/game/island-code.ts` (`IslandCode`, `IslandContent`, `IslandContentHost`); `cove.islands`, `cove.residents`                                        | `src/game/<id>-island.ts` (one lazy chunk: stream, quests, walks, content), `src/game/<id>-session.ts`, `src/world/islands/<id>/stream.ts`                                                                                                          |
| Terrain looks             | `src/world/terrain/terrain-material.ts` + `terrain-regions.ts` (`TerrainRegions`, `combineTerrainRegions`)                                                                                                     | each entry's `terrainRegions` (`anchorage/terrain-regions.ts`, `meridian-terrain-regions.ts`, `thousand-bough/terrain-regions.ts`; Keelhaven's through `ISLANDS_IN_BUILD` until it's in the game); `ISLAND_TERRAIN_REGIONS` comes from the registry |
| Vegetation                | `src/world/vegetation/scatter.ts`, `grass.ts`, `vegetation.ts` (`IslandVegetationRules` in `vegetation/types.ts`: bounds, grass bounds, species rules, exclusions, curated/extra plants, hero palm zones)      | `src/world/islands/anchorage/vegetation-rules.ts` (`ANCHORAGE_VEGETATION`)                                                                                                                                                                          |
| Grass and flowers (flora) | `src/world/flora/` (`FloraPalette`, `FloraRules` in `types.ts`; `scatterFlora`, drifts, plant forms, species table, terrain `floraGround`), drawn by `vegetation/grass.ts`                                     | `anchorage/flora*.ts`, `meridian-flora*.ts`, `thousand-bough/flora*.ts`; each entry's `floraPalette` (`ISLAND_FLORA_PALETTES` comes from the registry)                                                                                              |
| Starfish                  | `src/world/starfish/spots.ts` (`StarfishSpot`, `STARFISH`, from the registry)                                                                                                                                  | `src/world/islands/anchorage/starfish.ts`, `src/world/islands/meridian-starfish.ts`, `thousand-bough/starfish.ts`, in each registry entry's `starfish`                                                                                              |
| Compass routes            | `src/game/wayfinding/` (`WalkGraph`, `SeaChart`, `CompassRoute`, `Wayfinder`)                                                                                                                                  | `anchorage/waypoints.ts`, `meridian-waypoints.ts`, `thousand-bough/waypoints.ts`, in each island's code (`IslandCode.ways`; `loadIslandWays`)                                                                                                       |
| Towns                     | `src/world/village/kit.ts` (kit loader, buckets, `transform`/`paint`/`localToWorld`, colliders, anchors), `house-builder.ts`, `materials.ts`                                                                   | `src/world/islands/anchorage/village.ts` (+ `buildings.ts`, `plantings.ts`, `lighthouse-stair.ts`), `src/world/meridian-town/`                                                                                                                      |
| Shore batteries           | `src/world/village/shore-battery.ts` (decks, stairs, fences, guns into the town buckets; walk surfaces, colliders), `shore-cannon.ts` (the gun model and its levels)                                           | `src/world/islands/anchorage/batteries.ts`, `src/world/islands/meridian-batteries.ts` (+ the citadel's embrasures)                                                                                                                                  |
| Island layout data        | none                                                                                                                                                                                                           | `src/world/layout.ts` (`COVE`), `islands/meridian-layout.ts` (`MERIDIAN`), `islands/thousand-bough/layout.ts`, `islands/keelhaven/layout.ts` (`KEELHAVEN`): plain data the registry entries import                                                  |
| Ocean shallows (depth)    | `src/world/ocean/water-depth-texture.ts`: the home tile and one island tile slot holding the nearest lent tile (`addWaterDepthTile`, `tileUvBounds`); one format, so a swap builds no shader                   | an entry with `stream.depthTile` builds its tile from its baked terrain and lends it while in memory (`createIslandDepthTile`, `src/world/islands/depth-tile.ts`; Thousand-Bough)                                                                   |
| Coast foam surf           | `src/world/terrain/coast-foam.ts` `exposure` (0-1, default 0): a wider, whiter ribbon where the open sea reaches a steep shore (`shoreExposure`)                                                               | the island passes it                                                                                                                                                                                                                                |
| Terrain levels of detail  | `src/world/terrain/terrain-mesh.ts`, opt-in: `prefilter` (coarse levels' mean height), `maxMergedTriangles` (Lite/Low far blocks), `morphFrames` (a chunk eases to its new level)                              | `KEELHAVEN.terrain`; the other islands keep the defaults                                                                                                                                                                                            |

Adding an island: create its package and add one line to the island registry
(docs/adding-an-island.md lists what the package gives, and the few tables that still have a line
for each island). If you find yourself
writing `smoothstep(548, 566, P.x)` or `COVE.` inside a shared file, stop and add a region or rule to
the island's data instead. A terrain region is a 0-1 TSL mask in world space; the shared material owns
the look (`dryGrass`, `town`, `bluff`, `grassHill`, ...), the island only says _where_.

The same split holds for the course: an island owns its geometry, cast and puzzle mechanics; every
course word (quests, scripts, barks, quizzes, pages, labels, board text, arrival lines, voice lines and
their audio, the snapshot) is a course pack's, in `courses/<id>/` (docs/specs/COURSE-PACKS.md). A pack
loads with the voyage (`src/course/load.ts`), never with the title: read its data through
`src/course/active.ts` (or a module's `onCourse` hook), not at module top level. Its snapshot and
voice are served from `<base>courses/<id>/` (`courseAssetBase()`, `courseVoiceBase()`). Never write a
quest id in game code: ask the island's story by name (`storyHolds`, `storyEvent`, src/game/story.ts;
add the name to `STORY_CONDITIONS`), and read a puzzle's quest with `puzzleQuest()`. A mechanic acts on
its own ids (`steer`, `channel`, `tavern`…); the pack binds its ids to them (`"acts"`, read with
`byActs`/`rekey`), and a world sign with course words reads the pack and repaints in an `onCourse`
hook (release it when the site is freed).

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
  The slicer only yields at a `breathe()`: one step without one is one frame, however long. An island
  streamed during play once stalled 50–230 ms a frame (the banyan, the tree village's merges and signs,
  each cast's dressing) with the slicer on. Yield per part (`eachChunk`, `NpcCrowd.createAsync`,
  `SignSet.finalizeAsync`).
- The hitch guard only sees new programs, geometries and textures. CPU stalls go to
  `window.__isles.stalls()` (frame gaps over 50 ms after warm-up, `excused` inside a late warm); it
  isn't a test gate (timing depends on the machine), so measure a stream with long tasks and a CPU
  profile.
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
  `warmIsland`, game/island-warm.ts). Keep it hidden until its warm-up draws it: a hidden group
  isn't compiled by `compileAsync` (it compiles nothing), and a first on-screen draw builds shaders
  on the spot.
  Terrain levels of detail need a real draw each (`warmTerrainLods`); a precompile won't upload them.
- Anything added after the island's warm-up (late props, life, another island) goes through
  `cove.setLateWarm`'s warm (`warmLate`, game/island-warm.ts), not a bare `renderer.compileAsync`:
  a top-level precompile doesn't match the scene pass, so the first draw builds the shader anyway.
  So does what's hidden for the world's warm and shown later by code, not by `userData.prewarm`
  (Anchorage's silhouette, shown when it goes dormant, uploaded its geometry mid-play: issue 254).
  A part that loads after its owner is made needs a promise its warm waits for: the battle's raiders
  draw a lighter figurehead than your ship on High, which arrived after the battle's warm and
  uploaded mid-battle (`Brigantine.figurehead`, `Battle.shipsReady`; issue 266).
- Don't rebuild a geometry during play (a pickup, a state change): change its buffer instead. The
  message bottles merged a new mesh per material at each pickup (4 geometries, a hitch); now each
  is built once and a read bottle's vertices collapse (`bottles.ts`).
- Another island's plants go in with `vegetation.addPlants` when that island streams in, not in the
  first island's batches.
- Shader sharing (issues 235–237): three r186 names some buffers after node ids, which makes every
  mesh's shader unique. Characters go through `shareSkinning` (one skinning graph, a named bone
  buffer) and keep their palette in `paletteMap` (read through `materialTexture`), not `map`. New
  instanced meshes use `sharedInstancedMesh` and `markInstancesChanged`. Don't precompile instanced meshes for the scene
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
- A dev page warms like the game, or its census counts shaders the game never builds and its
  hitch guard sees what the game's wouldn't. play.html uses the game's own warms
  (`warmWorld`, `warmIsland`, `warmLate` in game/island-warm.ts) and exposes `window.__isles`
  (tests' hitch checks). Its own precompile, without `skipSunShadowsWhereOff` or a late warm,
  counted 145-147 on Ultra at Thousand-Bough against the game's 131-133 (issue 253). Check a dev
  page's number against the game's (`?debug`, `window.__flow.travelTo`) before cutting anything.
- r186 `compileAsync` builds its node graphs in `scheduler.yield()` slices that run ahead of the
  next frame: dozens in flight at once held a frame for 100–120 ms. `compileProgressively` keeps
  four in flight. One build stage can't be split (a big compute kernel's setup took 60–110 ms, the
  cloud noise bakes are sync `compute` calls): do that work where the screen is still (the opening
  makes the island's sky under its veil, `Opening.play(underVeil)`).
- Size a real-draw warm by **new looks** (material and geometry layout; an instanced mesh is always
  new), not by objects: shared looks are nearly free, each new one costs ~10 ms (`warmProgressively`).
- The first `AudioContext` of a browser session starts the audio service: a 300–600 ms block. Make
  it while the page loads (`audio/early-context.ts`); the first gesture only resumes it.
- Measure the opening with `tools/openingtest.mjs` (frame gaps, presented and requestAnimationFrame,
  `--profile` for a CPU profile of each gap). A gap with an idle main thread is the GPU process
  (a big WGSL module's first compile, or texture uploads).
- Late instanced additions on the title (gulls, leaps): don't precompile them (no precompile matches
  an instanced draw). Add them and wait two frames inside `engine.counters.excuse`.
- Every distinct look in the harbour mirror is a second set of shaders: keep small things out
  (`unreflected`: chests, message bottles, characters, the ship's small parts, sails, flags and
  rigging). Static instanced props cost an instanced shader per look: bake them per material
  (`bakeInstances`; Anchorage's crates, casks, sacks and pots). What the mirror should show of a
  whole island is a stand-in in one cheap look, drawn by the mirror alone (`HarborMirror.reflectOnly`
  puts it on `MIRROR_ONLY_LAYER`, the warm's mirror precompile builds it, `warmReflectOnly` uploads
  it): Anchorage's hills, village and quay are its silhouette on a 5 m grid with nothing under the
  water (#31: +4 programs on Ultra WebGPU, none on WebGL2). Plain blocks read as boxes even
  reflected: its houses are their kit houses' faces in vertex colours sampled from the kit's own
  palette textures (`houseFaces`: each wall in 3 × 3 cells, frontmost part wins), still one look.
  Bend a reflection by the water's slope times distance (`MIRROR_BEND`), not a fixed uv offset, and
  weight it by the view angle, or straight edges stay straight.
- A projected texture lookup (a planar mirror, a decal): check where it samples before tuning its
  strength. The harbour mirror's matrix already held the 0-1 bias and the ocean biased it again, and
  three samples a render target with v flipped, so its reflections landed metres off (the "ghost
  ship" of #32, hidden by taking the ship out and blending at 0.34). Dump the target
  (`readRenderTargetPixelsAsync`, rows padded to 256 bytes on WebGPU) and compare it with the frame.
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
- A freed texture can come back through another material's look (issues 264, 265). three r186
  builds a look once, and each new render object of it starts from a copy of that build's bindings:
  a texture binding holds whatever texture its node had at the build's generate stage, and the new
  object uploads it before its own update swaps in its material's. A texture that's freed later
  gets there two ways:
  - **Three's shared slots, by timing:** every material's `map` (`normalMap`, `emissiveMap`…) is
    read through one node for all looks (`MaterialNode`'s property cache), holding whichever
    material it was last drawn for. compileAsync's builds yield between stages, so a frame drawn
    mid-build leaves its texture in another look: the chest glow's kept the cabin's nameplate and
    uploaded it after the opening freed it (issue 264); on WebGL2, plants' looks caught each other's
    barks and leaves in every probed run.
  - **A look many materials share, every time:** its binding holds the first material's texture.
    Thousand-Bough's signs uploaded Anchorage's 4 MB sign atlas, and its NPCs Nell's palette, at
    every warm while Anchorage was dormant (issue 265).
  - **So** a texture that can be freed while the game goes on (an island's own, with its dormancy
    or unload; the opening's) never goes through three's slots. In a look of its own, give it a
    texture node of its own (`ownMap`, `ownNormalMap` in engine/own-map.ts: the dock gull, every
    mapped plant). In a look many materials share, read it per draw with `materialTexture`
    (engine/texture-stand-in.ts; the characters', signs' and kit's `paletteMap`): its build binds a
    1 × 1 stand-in with the texture's format, filters and wrapping, so the shader is the one the
    texture builds (census unchanged) and no material's texture is in the look. The stand-ins are
    freed with the voyage (`releaseTextureStandIns`). A node per material is a look per material:
    don't `ownMap` a shared look.
  - **Find them** with a scratch probe: wrap the renderer's bindings update and list textures
    uploaded for a render object that none of its bindings hold afterwards, and log every texture's
    dispose with its stack to see what's freed mid-voyage. To make the race show every run, make
    three's build yields (`scheduler.yield`) wait for a frame.
- Nothing new may draw through the island's post: back at the title, nothing's drawn until the
  title's post is ready (`restoreTitlePost`). One frame of the title through the island's TRAA scene
  pass built a second set of the title's shaders on Medium.
- Measure with `info.memory` at the first title, after one voyage and after two (a leftover that
  grows each voyage shows on the second), per tier, on both backends.

### Islands you've left are freed (residency)

- At most the island you're on and the one you're sailing to stay in memory (PLAN §13.3), plus any
  within its load range; the rest are silhouettes. `game/residency.ts` decides (pure, tested): an
  island streams in when you're on it, sail to it (a low-priority prefetch) or come within `load`,
  and is freed past `unload` after 20 s away, never while a battle, script, arrival, chart jump, the
  lift or a puzzle is on, or while it streams or warms. It measures from your feet or the ship, not
  the camera. `npm run check:memory` (tools/memorytest.mjs) is the gate.
- Meridian and Thousand-Bough are `StreamLifecycle`s (world/stream-lifecycle.ts): `load` builds,
  `unload` frees a part a frame (`freeInSlices`: dispose, then `releaseRemovedObjects`), `onReady`
  hears every load. Everything a streamed world adds to shared state comes off with it: its height
  field layer (`CompositeHeightField.remove`), ship obstacles, vegetation patch
  (`vegetation.removePlants`), and the session's colliders (`CollisionWorld.remove`), interactions,
  chests, puzzles and cast (each island's `IslandContent.teardown`, src/game/island-code.ts).
- Whatever the player can see after a reload comes from the save, never from scene objects: quests,
  puzzles' state (`progress.setPuzzle`), chests, bottles, starfish, the branch sign. A rebuilt island
  is a continued save's island. Session state that isn't saved (the lift car, mooring lines) is
  re-applied in the setup.
- Each reload is a new setup: the flow warms every setup (`session.onIslandSetup`), and a chart jump
  waits for the warm whose generation matches the stream's `loads` (a stale resolved warm let the
  island draw unwarmed: 2 hitches).
- Anchorage is built with the world, so it goes dormant instead: its parts leave the scene, and
  `releaseGpuCopies` frees the GPU copies only it uses (CPU data stays). Only plain meshes give their
  geometry back: three frees an instanced or skinned mesh's instance and bone buffers with its
  geometry, and the next draw submits the destroyed buffer (11 000 validation errors, like issue 251).
  Waking puts the parts back hidden and warms them; `reveal` shows them. Its `dispose` never puts
  parked parts back: their owners free them, and the world's dispose sends them `dispose`
  (`parkedRoots`). Put back, a quit while it was dormant left a ghost Anchorage on the title, drawn
  with freed buffers ("used in submit while destroyed").
- An island you've left stays resident for its 20 s grace, but past its swap distance it draws its
  silhouette, not its parts (issue 263: for 20 s after you reached Port Meridian, Anchorage's whole
  village drew on the horizon, 1.00M triangles on Medium). Every island swaps by the same rule,
  resident or not: the camera's `footprintDistance` against its `show`, with a ±20 m band
  (`SilhouetteSwap`, islands/silhouette-swap.ts, pure and tested) so an orbiting camera doesn't
  flicker at the line. It's decided in the stream's `update` (residency stays pure). Hiding frees
  nothing: the parts are only hidden (coming back inside the band is instant) and their systems stop
  updating (`shown` is false). Both sides stay warm: the parts were drawn by the world's warm, and
  the silhouette, hidden for that warm, is warmed once (the cove's late warm) before the first swap;
  the parts stay drawn until it's done. Not before the world's own warm-up is over
  (`cove.worldWarmed()`): parts hidden then would miss it, and showing them later builds shaders.
- A stream that fails part-way (a 404, offline) takes back what it added (scene, height field, ship
  obstacles) and goes `failed`: it tries again after `RETRY_AFTER_MS` or when asked (`load(…, true)`
  for a jump there), not every frame in range. A shared download promise (the kit) is never cached
  rejected. An optional speed-up (KTX2) is never `extensionsRequired`: the kit keeps its WebP.
- Silhouettes stand in for an island at its swap distance, so they're built to read like it there,
  per island (`anchorage/silhouette.ts`, `meridian-silhouette.ts`,
  `thousand-bough/tree/silhouette.ts`): the baked masks' colours, its sky's sun baked in (Lambert,
  with a sky-to-ground ambient), sheer faces as cliff, a tree line, the town as blocks from the same
  data the town builds with roofs, landmarks as prisms, falls as strips. The real ground's sheen
  toward a low sun is view dependent, so the one shared graph adds it (on bare ground, the colour's
  alpha; `sheen` scales it where the bare faces are cliff meshes that don't shine: Anchorage's
  headland read golden instead of grey). No tree bumps where the real trees are a pixel or two: on a
  coarse grid they read as a jagged ridge. Build them in slices (`createIslandSilhouetteAsync`) and
  wait for them before the warm. Swap by distance from the shore (`footprintDistance`), not the centre:
  Meridian's ridge runs ~500 m north-east of its centre, so a centre-distance swap came ~250 m off
  its cliffs. Compare real and silhouette from several bearings, High and Lite, before calling it done.
- `renderer.info.memory` isn't the GPU's memory as three counts it: an interleaved buffer counts once
  per attribute (an instanced mesh's matrices four times, ~120 MB on High) and a compressed texture as
  1 byte. `engine/memory-ledger.ts` corrects both on our renderer. Use `trackedMB` from the counters.
- three also counts a texture once, at its size when it's first seen: an image still decoding counts
  as 1 × 1 (a 1024² kit WebP is 5.3 MB), and a render target keeps its first size through every resize
  (TRAA's history, 11 MB on High, read 0 or 11 by the frame's luck). So the same stop read 453-484 MB
  from run to run under load, and the memory gate saw growth that wasn't there (issue 261). The
  ledger recounts a texture whose size changed (`refresh`, once a frame), and `check:memory` holds the
  render scale at the tier's so screen targets are the same size at every stop. When a memory figure
  moves between runs of the same tree, it's timing, not a leak: record every live resource (wrap the
  info's create/destroy, or catch its `memoryMap` writes in a scratch init script), diff the stops by
  name, size and owner, and compare each one's counted size with its current one.
- Buffers three makes for an object (node attributes) are freed only with its **geometry**, and only
  the first render object's: an instanced mesh's matrices on the attribute path (`sharedInstancedMesh`,
  past 1024; now and last frame's, interleaved) and colours, and what a material reads with
  `instancedBufferAttribute`. Every mesh or sprite over a geometry that outlives it (a shared rock, the
  crates, the banyan's cached parts, the sprite quad) left its buffers for good: ~0.6 MB a round trip on
  High and a voyage's worth after quitting (issue 262). Don't free them by disposing the shared
  geometry (its vertex buffers go too, and an interleaved one can't come back: issue 251). Free them
  with the object (engine/instance-buffers.ts): the renderer's public `info.createAttribute` notes
  each instance attribute by the array it views, and the backend's and info's public
  `destroyAttribute` free one mesh's, skipping a buffer when three frees it again with the geometry
  (WebGPU's backend throws on a plain attribute it's already forgotten). `sharedInstancedMesh` frees
  on the mesh's `dispose`; a material's own per-instance attributes over a shared quad go in its
  owner's dispose (`releaseInstanceAttributes`: the mist, fireflies, battle fog and smoke). So send
  `dispose` only at the end of an object's life: drawn again, it submits the destroyed buffers
  (Anchorage's dormancy parks its parts and never sends it). Trace a leak like this by
  attribute-view counts per stop (they matched to the view after the fix), not by MB: on WebGL2 the
  leftover views counted 0 bytes.
- What paid (High, Anchorage, honest MB): the sun's shadow map colour target as R8 (three always
  makes an RGBA8 one; −48 MB at 4096²), NPC palettes as 32 × 32 nearest textures (the kit atlas is
  flat 32 px swatches; 1.3 MB → 4 KB each), sign atlases painted by board size and shelf-packed, Lite
  and Low cloud keys decoded at half width, and the kit's roughness maps as KTX2 ETC1S
  (tools/village/ktx-roughness.mjs, `engine/ktx2.ts`). Base colour and normal maps stay WebP:
  ETC1S shows on them at High's distances, and UASTC would add megabytes to the download.

## 5. Lessons learned (bugs we have hit)

- **A value first built inside a `select` branch (palms went black):** three writes `select` as an
  `if`/`else` and sets a node shared by the graph where it's first built. The palm's `normalLocal`
  (the fronds' flutter) and `normalView` (the fronds' glow) were first built in the fronds' branches,
  so the trunk's normal was zero: a NaN once normalised, which turned the trunk black in the sun's
  normal-biased shadow lookup (and left it unlit before). Build shared values outside the branches
  (`withVars` in vegetation/materials.ts), and check the built shader: `palm-material.test.ts` builds
  WGSL with three's node builder and flags a variable read on a path that never set it.

- **A line down the sky (a wrapped texture coordinate):** the baked clouds' u is `fract(azimuth)`, and
  where it jumps 1 → 0 an implicit-derivative sample takes the coarsest mip (issue 252). Sample a
  wrapping coordinate with `.grad`, taking the derivative from it or its copy half a turn on, whichever
  doesn't wrap there. And a `texture()` node's shader is built for whatever is in its slot then: a
  Nearest placeholder made WebGPU's a `textureLoad` with no sampler (no filtering, no mips) for the
  real texture too. Give placeholders the real texture's filters.
- **Z-fighting with paper or decals:** geometry that lies exactly on a surface flickers through it.
  Sink it below the surface while it is flat (the chart's `PAPER_TUCK`), or offset it; never rely on
  equal depth.
- **Additive light layers wash out characters:** see-through additive volumes (sunbeams, haze)
  between the camera and a character read as a milky overlay. Clear them where they cross the
  character (the cabin's `guideClearance`), or put them behind.
- **Alpha-tested foliage at a distance:** thin leaf cards vanish when drawn small, leaving only their
  most opaque parts (red flowers became red blotches on the hills). Hand distant plants to impostors,
  and check authored leaf colours (the common bush's leaf map was red; it is recoloured green).
- **LOD bands must be continuous (grass and trees popped in front of the captain, issue 257):** the
  grass re-picks its clumps every metre or so and draws each with one of three blade geometries by
  distance, so at a re-pick every tussock crossing a band's edge swapped its blades at once, a few
  metres ahead of the captain. Impostors snapped between baked views 40° apart, and the kit's
  textured plants (broadleaf, fern, banana, bushes) ignored their `fade`, so they appeared whole
  where the field first drew them. A level of detail may only swap geometry where the shader already
  makes both levels draw the same pixels:
  - Make the coarse geometry a prefix of the dense one (a rank per blade, `bladeLayout`), shrink the
    extra blades away and widen the rest with distance in the shader, and slide a near blade's middle
    vertex onto its far triangle's edge (`bladeBandShape`, written once for CPU and shader through
    `BandMath`). Wind both levels' triangles alike: a double-sided face wound the other way is lit
    from behind, so the swap changed the shading.
  - Finish every transition a re-pick's move before the swap (`bladeBands`), and measure fades and
    bands from the same point the CPU uses (the clump's centre), or a clump left out at a re-pick is
    one the shader still shows.
  - Blend impostor views, and give every material of an instanced plant its dissolve (`lodMask`).
  - Every vertex runs the whole graph: a `normalize()` of a vector that's zero for another part
    (a flower's upright normal) is NaN, and NaN times a zero weight is still NaN (the flowers vanished).
  - Measure with a pop metric: freeze the clock, step the camera in small equal steps, supersample
    each still frame (thin blades alias without TAA), and flag blocks whose change is a one-step spike
    over both neighbours' (parallax is steady). Check a swap directly by drawing one band's instances
    with the other band's geometry and diffing.
- **A flower species is data, never a material:** every island's species is a row in one shared
  table (`floraSpeciesTable`, uniform arrays: shape, eye, glow, form), read by the one grass material by
  the row in its instance's `grassShape.x`. Plant forms are geometries with the blades' attributes;
  `grass-material.test.ts` builds every form's WGSL and expects one shader. Adding a species or an
  island's palette added no program (Ultra census unchanged); the terrain looks drift colours up in a
  table too (`DRIFT_BINS` rows per island), so its cost doesn't grow with islands or species.
- **Flowers lost in grass, and confetti on the ground:** single 7 cm heads on stems under the grass's
  height read as a few red specks. Plants are small clumps (three heads, five spikes, seven fronds)
  standing above the blades, their faces tipped outward so a side-on camera still sees them, densest
  in drifts. Past their reach the terrain carries the same drifts (`driftAt` and `driftNodes` share
  constants). Its first try, pixel-sized dots on a world grid, read as litter: grid cells are squares
  on the ground, so on slopes and at glancing angles every dot stretched into a dash, and cream
  flowers on green read as paper scraps. `floraDrifts` keeps dots round on screen (squashed along the
  view by the ground's foreshortening, searched over 2 × 2 cells so none is cut), swells and shrinks
  them by clump noise instead of switching them on and off, fades them out by 48 m and as they shrink
  under ~2 px, and leaves the distance to a patchy wash of the drift's colours (pale species darkened
  toward their eye). It's one branch: off the open ground nothing runs, past 48 m only the wash.
  Blades fill a disc (a sunflower spiral): a ring of blades read as circles on a sparse sward.

- **A few hundred triangles can cost a draw:** the village merges each material's bucket into chunks of
  24k triangles (48k on Lite, `chunkOptions`). Anchorage's ironwork stood at 23.6k, so a market booth's
  lanterns and chains (+490) split it into two draws. Before adding to an island's town, print each
  bucket's total (a scratch test over `createVillage`), and keep a new look out of an island that has none
  of it (a tiled roof on Anchorage would have been a new draw and a new pipeline there: its canopy is the
  cloth it already draws).
- **Shade reads blue at golden hour:** shaded ground is lit by the sky dome alone (PMREM and the
  hemisphere's sky), which is deep blue when the sun is low, so a pale plaza floor under sunlit sandstone
  read cool blue. Real shade gets warm light bounced off sunlit walls and ground: the paving's one material
  adds a share of `world.sunColor` × its own colour (`withSunBounce`, village/materials.ts). Fix the light
  a surface is missing, not its albedo, and measure the pixels (shade sampled before and after) rather
  than eyeballing.
- **Check a new prop against what grows near it:** generated trees (the banyan's little sister) reach
  their limbs out metres from the trunk; a booth first placed beside it had limbs through its roof. Look
  from above and from each side before settling a spot.
- **Masks decide the look more than the palette:** brown hills came from slope and height mask rules
  calling grassy hillsides rock and cliff. Fix the masks (`coveMasks`) before re-tinting colours.
- **Splashes from nowhere:** a splash reads as an event, so its cause must be visible at the distance
  it's seen. Battle splinters (0.4 m chips) and far flying fish made bright splashes with nothing
  visible above them; a hit splashed beside the hull; a pod splashed before its first animal; and the
  battle sampled waves on its own clock (out of phase with the drawn sea). Now: no splash without a
  ball, a sinking hull or an animal you can see (`LEAP_MIN_PIXELS`), effects sample the ocean's clock,
  and ambient life keeps out of battles and puzzle courses (`QuietSea`).
- **A live setting that reshapes a shared look (the sea state):** a setting that changes a TS table the
  shaders read (wave amplitudes, the wind) must reach them as uniforms built once (`sea-uniforms.ts`),
  never as constants baked into the graph, or each state (and each frame of its ease) is a new shader.
  Scale only what can change without tearing: amplitude and steepness per Gerstner component, never
  a wavelength or frequency (ω·t with t in the thousands jumps the phase). Anything that scrolls with
  a speed the setting changes scrolls by its integral (`world.windDrift`), not speed × time: the
  ripples raced across the sea while the wind eased. Keep the default exactly today's: × 1 last in
  each product, new terms behind `!== 0`, and an ease that ends by copying the target (not blending to
  it), then prove it with a hash of the CPU samples and a simulated track taken before the change
  (`breeze-fingerprint.test.ts`). Places with a fixed design (battles, puzzle courses, the title)
  hold the default through the driver (`seaState.hold`), easing in before they start.
- **Shared audio and voice:** one subsystem cancelling must not stop a voice another system started
  (`Dialogue.cancel` only stops its own line).
- **Streaming audio (the title was silent for 40 s on Slow 4G):** GitHub Pages serves HTTP/2 by
  request priority. A music `<audio>` element's request is low priority (`u=3`); a plain `fetch` is
  high (`u=1`). At the first press the beds, the title's head start on the island (4 MB) and the
  chart's terrain (6.7 MB) all went first, and the song got 0 bytes for 26–40 s. A local HTTP/1.1
  server or Chrome's throttling alone never shows it: measure with `npm run check:audio`
  (tools/audiotest.mjs serves the build like Pages, tools/lib/pages-server.mjs). Now:
  - Downloads nothing waits on yet go `priority: 'low'` (`packs.prefetch(…, 'low')`,
    `loadTerrainPack(…, 'low')`, the ambient beds): they share the line with the music.
  - The title's song buffers once the title's up (`music.prefetch`), and the title's other downloads
    wait for it (`music.whenBuffered`, up to 15 s). Prefetch the next track where it's known: the
    opening's on New Voyage, the island's theme when the session's made or you travel or sail into its
    waters, the battle's when the battle is built.
  - A track asked for before it has data starts (and the old one hands over) only on `playing`, and
    one that stalls fades back in, so music never slams in late at full level.
  - Voice lines load by id (`<id>.webm`, no 600 KB manifest first) and ahead of time
    (`preloadVoice`: the cabin's on New Voyage, an island's welcome at its arrival, a whole script as it
    starts). A caption waits up to 4 s for its voice (`VOICE_WAIT`), then shows on its own; a voice
    never starts late or under another line (`VoicePlayer`'s token).
  - Sounds a scene plays go in its preload list (`OPENING_SOUNDS`, `BATTLE_SOUNDS`): a one-shot
    asked for before its file has loaded is dropped. Preloads fetch before the unlock and decode at it.
  - The service worker leaves Range requests (media streams) to the network.
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
- **A canal, a grey slab and a ditch (fresh water, issue 258):** Thousand-Bough's streams read as
  canals and its Silver Pool as a dark grey slab (a brown basin at dusk, the stream's strip broken
  across it). Four causes, each worth checking on any water: (1) **winding**: a double-sided quad
  wound facing down is a back face seen from above, so three turns its normal down again and the
  water is lit from below. `WaterStrips.quad` flips the winding with the normal. (2) **a mirror of
  the environment**: a smooth `MeshStandardNodeMaterial` reflects the bright PMREM sky; small water
  washes white. The natural look is matte to the scene's lights and adds its own sky and sun glints
  with water's Fresnel (F0 0.02, like the sea). (3) **the shape**: a straight centre line, one
  width and a flat strip on the ground. A `course` meanders it (seeded, pinned at bridges, none at
  its ends), breathes its width, rounds its bed, caps its grade, and blends the nearest reaches so
  the ground doesn't step at a bend. Opt-in, so another island's bake hash doesn't move. (4) **the
  tier's mesh**: Lite draws the ground every 8 m (Low 6, Medium 4), which fills a 4 m channel, so
  the water vanished in patches. Build the water against the tier's own height field (what's
  drawn): its depth sets the look and its middle rides just over a coarse ground. Use a
  per-vertex depth over the drawn ground for colour and a soft shore, not a ruled edge.
- **Wade what's drawn (issue 259):** on Lite you walked through streams dry (Silver Run 22 %
  wading, Fernrun 26 %): the walker stands on the tier's finest mesh (4 m on Lite), which fills a
  3-5 m bed, while the gameplay water kept the stream's true surface. The water mesh already rode
  over that ground; the walker didn't know. Now one function says where the water is and how deep
  it reads over the drawn ground (`rideOver` in `fresh-water-natural.ts`); the mesh draws it and
  `naturalWaterAt` hands the walker its surface and the bed you wade on (under a coarse ground that
  fills it), through `CollisionWorld`'s `inland`. Any visual compromise a tier makes on water must
  reach gameplay through the same code. And a flow speed that changes per reach tears a scrolling
  pattern at every reach's edge (seams across the water, worse as the clock grows): scroll along
  the time the water takes to get there (`travel`), at one speed, so each reach flows at its own pace.
- **Water hidden by a far terrain level (issue 260):** past 40 m Lite draws the ground every 8 m
  (16 m past 170 m; Low 6/12, Medium 4/8), whose triangles span a 3-5 m bed from bank to bank, so
  about half of every stream's course vanished in the distance (it was patchy on the committed tree
  too). Riding the water over each far level would float it near you, where the finest level is
  drawn. The coarse levels keep under the water instead (`TerrainWaterCaps`, the terrain's
  `freshWater` option): a vertex whose cells hold water stands just under the lowest water there, so
  every triangle over the water lies under it, but never more than `maxDrop` lower (a cliff top over
  a pool at its foot stays up). The finest level, the one you walk on, never changes.
- **A seam where a stream meets a pool (issue 260):** two strips that abut show their edges (a
  straight cut against a polygonal ring, different looks, heights a few cm apart). Overlap them and
  cross-fade on one surface in one look: the pool's ring takes the stream's surface where the stream
  runs, and fades out as the stream fades in, drawn in the pool's look (per-vertex `kind`, `fill` in
  `QuadCorners`), then eases to its own look over a few metres (`joinPool`).
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
- **Lite at the edge of its budget (draws and triangles):** measure before cutting
  (`node tools/budgettest.mjs --tiers=lite --meshes` splits each worst frame by mesh and material).
  What paid: the terrain's chunks merge into far blocks once they're coarse (one draw for an island
  seen from the sea; `MERGED_BLOCKS`, and a warm draws every level, `lodCount`); the ship's merged
  hull takes index LODs as it sails (`attachMovingLod`); alike small parts draw with a neighbour on
  Lite (rope with cloth, `moveBucketInto`). What didn't: meshoptimizer can't simplify flat-shaded
  meshes (the trees' bark, the tree village's boxes): every hard-edge vertex is locked, so check what
  `buildChunkLodIndex`/`simplifyInPlace` return. And count what's drawn but unseen: plants past their
  dissolve band (fade 0) still cost their triangles.
- **A frame budget measured mid-warm (issue 260):** `budgettest` sampled 8 frames 0.9 s after each
  move. On a slow machine (15 fps) an island's warm-up is still running then (6-7 s after arrival
  here): it redraws the static shadow map and every terrain level each frame, so the committed tree
  read Low Meridian 627k and Medium 1.16M at the quay where a faster machine reads 461k and 935k.
  The same clock hid a second dependence: the island you've left is freed 20 s after you leave it,
  so whether Medium Meridian's worst view drew Anchorage's village (1.00M) or its silhouette (935k)
  depended on how fast the run got there. Now the tool waits for the world, never on a clock: the
  play page's `__dev.settled()` (no warm-up running, the sun shadow node not warming, every stream
  absent, resident or failed and none held), then frames with no static shadow redraw and steady
  counts. Each island is measured twice, both gated: on arrival with the island you've left still
  resident (held by `debug.keepResident` for the set, so the moment is the same on any machine), and
  with it freed (issue 263 made the first draw its silhouette). Compare trees on the same machine,
  same script, measured settled, before blaming or clearing a change.

- **An empty slot must hold no point (issue 305):** the ocean's island tile slot started with an inverse
  span of 0, so every point mapped to uv 0, read as inside, and took the 1 × 1 deep stand-in: Anchorage's
  and Meridian's home-tile shallows went navy, and the census and hitch guard saw nothing. Test the empty
  case of any slot or registry, and diff screenshots of the islands that shouldn't change against `main`.
- **Tall fluted walls (Keelhaven, issue 305):** flutes read by geometry and side light, not paint: painted
  stripes read as stripes. Ribs added to a wall keep its slope; gullies cut into it leave a flat bench at
  its foot. A sun much higher than ~50° lights the flutes evenly: pick the time by measured flute
  contrast. Faces over ~74° read as rock and go near-black in shade, so keep plants to ~75° (masks and
  shader), cap a sea cliff's height, and give shaded walls bounced light. Read features off a polygon
  coast with a weighted mean of the segments' along-coast distance (the nearest point jumps on every
  corner's bisector), and blend across the coast's start (the distance wraps there).
- **Pops on tall walls (issue 305):** coarse levels that point-sample a fluted wall differ most where they
  swap. Prefilter them (the mean height over each vertex's footprint) and ease a chunk to its new level
  over a few frames (`morphFrames`: its vertex buffers change, no new geometry or shader). A merged far
  block may show only when all its chunks are at its level, or a coarser chunk jumps to it uneased.
  Measure with the pop metric (frozen clock, 1 m camera steps, 16 px blocks).

### CPU and GPU time (issues 11 and 29)

- **Read GPU time as the union of the passes, never their sum.** On Apple GPUs a pass's start
  timestamp is taken as soon as it's queued and it then waits for the passes it reads, so a frame's
  passes overlap: High at Anchorage, seven passes started within 0.75 ms, and their sum read 19.5 ms
  for passes that all lay within 5.0 ms (7.1 ms at 227 fps uncapped, where a frame can't hold more
  than 4.4 ms). `BusyTimestampPool` (engine/gpu-timestamps.ts, in the backend's public
  `timestampQueryPool` slot) keeps each pass's interval; `Engine.gpuBusyMs` is the union, `gpuMs`
  limits it to the frame (`limitGpuMs`), `gpuRawMs` keeps the sum. WebGL2 can't do better on the
  Mac: ANGLE-Metal times a TIME_ELAPSED query by the command buffers its pass ran in (QueryMtl.mm),
  which overlap the same way, and it has no TIMESTAMP_EXT for a union; its sum read past the frame
  period on High. Measure GPU uncapped (`launchChrome({ uncapped: true })`).
- **three r186 spends ~50 µs of main thread per draw at Low's 3× throttle** (about 15 µs on the M3
  Max): every node material refreshes fully every frame (`NodeMaterialObserver.needsRefresh` is FULL
  whenever a material has a node), so its node updates and bind groups run per draw however static
  the object. Low's quay view draws 114 times, and its scene pass took 5.6 of the frame's 8.9 ms
  (a loaded run). Count draws when you plan Low's main thread, and don't expect per-object tricks to
  pay: sorting opaque draws by material (`setOpaqueSort`) and updating the shadow's reference nodes
  once per render instead of per object both measured within noise.
- **What paid on the main thread:** early-outs on a box before the maths in anything the follow
  camera asks (~1000 ground queries a frame: the streets, door stairs, batteries, basins and streams
  each kept a box; `CollisionWorld.groundUnder` looks the terrain and bed up once); skipping a plant
  batch's refill (and its upload) when the camera hasn't moved or turned; NPCs out of view not
  animating (their time is kept and spent when they're back, PLAN §12.3; above Low, only past the
  movers' shadow map); plants copying stored matrices and impostor cards building theirs directly
  on a moving camera; `FrameCounters` filling its stats in place. Low at 3×: sailing 9.5 → 6.0 ms,
  Thousand-Bough's booths 10.2 → 4.8 ms. Prove an early-out exact: fingerprint the queries over a
  dense grid in both trees (2.5 M queries hashed the same). Measure on a quiet machine: under a load
  average of ~9 the same tree read 8-9 ms at the quay that read 6.0 ms at ~6.
- **Triangles a camera can't see:** the ocean's polar grid draws only the wedges in the camera's
  frustum (`cullPolarSectors`; the disc round the camera stays whole because every wedge meets
  there), sector by sector so a run of wedges is one draw range, with the rings in order along each
  view ray (the sea writes no depth). A coarser caster in a shadow map moves the shadows you see:
  only a town whose own surfaces skip the sun's shadows (Anchorage on Low) draws its static map
  coarser (`chunkShadowLodFloor`). Check such a change with a same-frame A/B (pause the clock, stop
  the loop, `renderStill`, toggle, diff): run-to-run screenshots differ by far more than it does.

## 6. Verify like this

- `npm run typecheck && npm run lint && npm run format:check && npm test`, then
  `npm run build && npm run check:budgets && npm run check:secrets`.
- Frame budgets (PLAN §12.1): `npm run check:frame-budgets -- --base=<no-HMR server>` measures each
  view only once the world has settled (`__dev.settled()` on the play page, steady frames with no
  static shadow redraw), so a busy machine takes longer but reads the same; each island twice, with
  the last island still resident and with the islands you've left freed, both gated. An island that doesn't settle within `--settle-timeout` fails as UNSETTLED with what it
  waited on. The static shadow map's redraw (one frame per ~50 m walked, PLAN §12.4) is reported
  on its own lines and not gated. A dev page that warms things must count them in `settled()`.
- CPU, GPU and the flythrough (PLAN §12.1, §12.10): `npm run check:perf -- --base=<no-HMR server>`
  (tools/perftest.mjs) reads the main thread (`Engine.cpuMs`) at the tier's CPU throttle (Low 3×) on
  settled views, both backends; GPU ms uncapped (vsync lets an Apple GPU clock down: the same Low
  frame read 4.7 ms capped, 1.4 ms uncapped) on WebGPU's pass-timestamp union; and the Phase 0
  flythrough's peak triangles, redraw frames included. It gates on budgets.json `perf` and prints the
  PLAN targets a reading misses. `--profile=<dir>` saves a CPU profile per view and prints its top
  functions. Measure before/after trees in turns on a quiet machine (other browsers' GPU work lands in
  your timestamps; a GPU reading over the frame period is resampled).
- Terrain or mask changes: `npm run bake` and compare the printed hashes (unchanged hashes prove a
  refactor didn't move a single sample). Refactors of placement code should fingerprint their output
  (hash the scatter's JSON) before and after.
- Screenshots to compare between runs: take them as frozen frames (`tools/shots.mjs`, issue #86).
  Holding the clock isn't enough: set it to the same sim time, put back what integrates its own
  state (the ship's springs and fixed-step remainder, `restartMotion`, then replay the swell; birds
  and leaps to their seeds; the title's orbit), draw still frames for a few seconds (the metered
  exposure adapts on wall time) and restart TAA's jitter (`restartJitter`) before a fixed count, at
  render scale 1. Two runs then differ by ≤ 0.15 % (real time: 0.1-16 %).
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
  Shared helpers live in `src/util/math.ts` (`smoothstep`, `clamp01`, `wrapAngle`, `mulberry32`,
  `seededRandom`, `segmentDistance`, `segmentDistance3`, `sinHash`); don't add local copies.

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
