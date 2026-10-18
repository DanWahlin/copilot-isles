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
- Don't rebuild a geometry during play (a pickup, a state change): change its buffer instead. The
  message bottles merged a new mesh per material at each pickup (4 geometries, a hitch); now each
  is built once and a read bottle's vertices collapse (`bottles.ts`).
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
  chests, puzzles and cast (an island scope in session.ts; `ThousandBoughContent.teardown`).
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
- A stream that fails part-way (a 404, offline) takes back what it added (scene, height field, ship
  obstacles) and goes `failed`: it tries again after `RETRY_AFTER_MS` or when asked (`load(…, true)`
  for a jump there), not every frame in range. A shared download promise (the kit) is never cached
  rejected. An optional speed-up (KTX2) is never `extensionsRequired`: the kit keeps its WebP.
- Silhouettes stand in for an island at its swap distance, so they're built to read like it there,
  per island (`meridian-silhouette.ts`, `thousand-bough/tree/silhouette.ts`): the baked masks'
  colours, its sky's sun baked in (Lambert, with a sky-to-ground ambient), sheer faces as cliff, a
  tree line, the town as blocks from the same terrace rows with roofs, landmarks as prisms, falls as
  strips. The real ground's sheen toward a low sun is view dependent, so the one shared graph adds it
  (on bare ground, the colour's alpha). Build them in slices (`createIslandSilhouetteAsync`) and wait
  for them before the warm. Swap by distance from the shore (`footprintDistance`), not the centre:
  Meridian's ridge runs ~500 m north-east of its centre, so a centre-distance swap came ~250 m off
  its cliffs. Compare real and silhouette from several bearings, High and Lite, before calling it done.
- `renderer.info.memory` isn't the GPU's memory as three counts it: an interleaved buffer counts once
  per attribute (an instanced mesh's matrices four times, ~120 MB on High) and a compressed texture as
  1 byte. `engine/memory-ledger.ts` corrects both on our renderer. Use `trackedMB` from the counters.
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
