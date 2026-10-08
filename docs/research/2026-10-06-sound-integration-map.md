# Sound integration map (ElevenLabs sound effects)

2026-10-06. Where custom sound effects made with ElevenLabs (text to sound effects) could make the
game more immersive. Each row names the moment, the code hook, the sound there today, a proposed sound
name, its type, and a prompt to generate it. Code hooks are line numbers at commit `e8b8f3d`; they
can drift.

**Status:** the demos aren't made yet. The ElevenLabs sound-effects endpoint (`POST
/v1/sound-generation`) rejects the CLI's OAuth sign-in with HTTP 401, although speech works with the
same sign-in and the same `authorization` header. Generating sound effects needs an API key
(`ELEVENLABS_API_KEY`, kept out of the repo).

## Integration points

Existing sound assets are mostly CC0 or procedural and ship as `.ogg` and `.m4a`. The bank in
`src/audio/soundscape/bank.ts` already has wind, surf, boat and pier laps, gull and tern calls, cannon
fire, ball whiz, timber hits and creaks, splashes, birds, footsteps, waterfall and stream, the
opening's ambience, and some interaction sounds (provenance in `ASSETS.md`).

| # | Scene / moment | Code hook | Sound today | Proposed name | Type (length) | ElevenLabs prompt |
| --: | --- | --- | --- | --- | --- | --- |
| 1 | Open sea and the islands' exposed coasts: continuous wind | `src/game/flow.ts:503-504`, `src/opening/opening.ts:947-949` (ambience setup) | `wind` bed (CC0, Freesound) | `wind_coastal_gust` | Loop, not positional, 8-15 s | Steady tropical coastal wind sweeping across an open pirate island, with soft gusts through palms and rigging, natural ambience only, no music. |
| 2 | Beaches: small waves lightly reaching the sand | `src/game/session.ts:2017-2018` (update; `sfx.surf` at shore points) | `surf_wash`, `surf_backwash`, `surf_crash` (CC0) | `shore_wave_lap_light` | One-shot, positional, 2-4 s | Small gentle waves repeatedly lap onto a sandy tropical shore, foamy wash and quiet retreat, intimate natural water sound, no music. |
| 3 | Port Meridian harbour and piers | `src/game/flow.ts:503-504` (harbour bed) | `pier_lap` loop (CC0) | `harbour_water_lap` | Loop, positional or bed, 8-12 s | Calm harbour water softly tapping wooden pilings and a weathered pier beneath moored pirate boats, no music. |
| 4 | The player's ship moving through open water | `src/game/session.ts:1968-1971` (movement update) | `hull_slap` slices (CC0) | `boat_hull_lap` | One-shot or short loop, positional at the hull, 1-3 s | Water slaps rhythmically against a wooden sailing ship's hull while underway, close detailed nautical ambience, no music. |
| 5 | Ship under load (waves, hard turns): hull strain | `src/game/session.ts:1968-1971` (gate on speed and turn rate) | `timber_creak_groan` (battle only today) | `ship_hull_creak` | One-shot, positional, 2-5 s | Heavy wooden pirate ship hull creaks and groans under wave pressure, stressed beams flexing with deep resonant timber, no music. |
| 6 | Sails billow, trim or luff after W/S | `src/world/ship/brigantine.ts:552-571`, `:677-678` (sail/flag update) | `opening_sail` (opening only); nothing while sailing | `sail_flap_luff` | One-shot, positional near the mast, 1-3 s | Canvas pirate sails snap, flap, and luff sharply as the wind shifts during a course adjustment, natural cloth and rigging only, no music. |
| 7 | Rigging tension while sailing | `src/world/ship/brigantine.ts:552-571` (start/stop with speed and sails) | none | `rope_rigging_creak` | Loop, positional on the ship, 5-10 s | Taut hemp ropes and wooden mast fittings creak rhythmically on a moving sailing ship in a fresh sea breeze, no music. |
| 8 | Turning the helm and rudder | `src/world/ship/brigantine.ts:552-571` (heading/turn-rate update) | none | `helm_rudder_turn` | One-shot, positional, 0.8-2 s | Wooden ship wheel and rudder mechanism strain and creak during a hard turn, with subtle rope tension, no music. |
| 9 | Sea battle: cannon fired near the ship | `src/world/battle/battle.ts:386`, `src/game/battle-audio.ts:36-38` (`'cannon'`) | `cannon_boom` (CC0, 4 slices) | `cannon_fire_heavy` | One-shot, positional, 2-3 s | Massive close-range pirate broadside cannon erupts with explosive black-powder blast, wooden carriage recoil and ringing smoke tail, no music. |
| 10 | Sea battle: cannon fire far away | `src/game/battle-audio.ts:39-40` (distance branch) | `cannon_far` (CC0) | `cannon_fire_distant_roll` | One-shot, positional, 3-5 s | Distant naval cannon fire rolls across open water as a deep echoing thunderclap, fading into sea air, no music. |
| 11 | Cannon muzzle blast (an explosion layer) | `src/world/battle/battle.ts:386` (cannon event) | only `cannon_boom` | `cannon_muzzle_explosion` | One-shot, positional, 1-2 s | Short violent cannon muzzle explosion with roaring flame, powder crackle, smoke burst, and splintering wooden carriage, no music. |
| 12 | A cannonball flying past the player | `src/world/battle/battle.ts:386` (`'whiz'`) | `ball_whiz` (CC0) | `cannonball_air_whiz` | One-shot, positional, 0.8-1.5 s | A heavy cannonball tears rapidly through the air past the listener with a terrifying close whistle and Doppler rush, no music. |
| 13 | A cannonball hitting a ship's hull | `src/world/battle/battle.ts:386` (`'timber'`) | `timber_hit` | `ship_hull_hit_explosion` | One-shot, positional, 1-2 s | Cannonball smashes into a wooden pirate hull with a violent thud, splintering planks, deep impact, and scattered debris, no music. |
| 14 | A raider sinking | `src/world/battle/battle.ts:386` (`'sink'`) | `big_splash` (CC0) | `ship_sinking_explosion` | One-shot, positional, 2-4 s | Damaged pirate ship settles and breaks apart into a huge engulfing ocean splash with groaning timber and collapsing rigging, no music. |
| 15 | A cannonball missing into the sea | `src/world/battle/battle.ts:386` (`'splash'`) | `splash` (CC0) | `cannonball_water_splash` | One-shot, positional, 1-2 s | Cannonball punches into open seawater with a sharp explosive splash, rising spray and hollow underwater plunge, no music. |
| 16 | Gulls flying past (harbour, beach, Port Meridian) | `src/world/life/birds/birds.ts:125+` (`createBirds`), `src/world/cove-scene.ts:188,274` (on a flying-state change) | `gull`, `tern` (CC0); no fly-by hook | `seagull_flyby_call` | One-shot, positional, 1-3 s | A lively seagull cries while flying close past the listener over a tropical pirate harbour, wings and distant sea air audible, no music. |
| 17 | The dock gull taking off or landing | `src/world/life/dock-gull.ts:53+` (take-off/landing state change) | `gull` exists but isn't wired here | `seagull_wing_flap` | One-shot, positional, 0.8-2 s | A seagull suddenly takes off from a wooden dock with several strong wing flaps, feathers rustling and one sharp call, no music. |
| 18 | Dolphins and flying fish leaping and splashing back in | `src/world/life/leaps/system.ts:158,277-286` (`spawnSplash`) | `splash`/`big_splash` exist; no hook | `dolphin_leap_splash` | One-shot, positional, 1-3 s | A playful dolphin bursts from tropical seawater and crashes back in with a bright energetic splash and spray, no music. |
| 19 | Port Meridian's waterfall and stream | `src/world/cove-scene.ts:188+`; `stream`/`waterfall_small` loops in `bank.ts:16-23` | `stream`, `waterfall_small` (procedural) | `port_meridian_waterfall` | Loop, positional, 8-15 s | Small tropical waterfall and clear rocky stream burble continuously beside Port Meridian, close natural water ambience, no music. |
| 20 | Port Meridian's crane lifting crates | `src/game/session.ts:909` (crane interaction) | `crane_ratchet` (procedural) | `crane_rope_strain` | One-shot, positional, 1-3 s | Old wooden harbour crane rope strains and pulley fibers creak under a heavy crate, with subtle dock movement, no music. |
| 21 | Opening a treasure chest on an island | `src/game/session.ts:645-655` (chest interaction) | `step_wood` only | `chest_open_creak` | One-shot, positional, 1-2 s | A weathered pirate treasure chest lid opens with rusty hinges, dry wood creaks, and a soft wooden latch release, no music. |
| 22 | Picking up a starfish | `src/game/session.ts:1803` | `chime_solve` | `starfish_pickup_splash` | One-shot, positional, 0.8-1.5 s | A small wet starfish is lifted from shallow water with a delicate drip, tiny suction release, and sparkling tactile pickup sound, no music. |
| 23 | The opening: water arriving across the chart | `src/opening/opening.ts:1038-1039` (opening timeline) | `opening_spray`, `big_splash` | `opening_chart_water_surge` | One-shot, not positional, 2-4 s | Magical seawater washes across a parchment chart with a soft foamy surge, droplets and gentle swirling transition, no music. |
| 24 | The opening: the captain's cabin ambience | `src/opening/opening.ts:947-949,1038-1053` | `opening_cabin` loop, `opening_lantern` | `opening_ship_cabin_detail` | Loop, not positional, 8-15 s | Quiet wooden ship cabin with subtle hull creaks, faint rope movement, lantern glass resonance, and muffled sea outside, no music. |
| 25 | Towns: doors, hatches, a harbour bell, town life | `src/game/session.ts:678,955,981-993,1042-1069`; buildings in the Anchorage village and `src/world/meridian-town/` | `bottle_pop`, `gear_hang`, `chime_solve`, `crowd_cheer_small`, `hatch_clank`; no door, bell or town bed | `harbour_bell_town_ambience` | Loop or occasional one-shot, 6-12 s | Bustling tropical pirate harbour town ambience with distant conversations, rope work, wooden doors, gulls, and a resonant harbour bell, no music. |

## How to add a sound

1. **Register it:** add a `SliceBank` or `LoopBank` entry to `src/audio/soundscape/bank.ts` with the
   snake_case name (the file name). `SoundName`, `SliceName` and `LoopName` come from `BANK`.
2. **Play it:** `sfx.oneShot(name, position?, gain?)` for events, `sfx.loop(name, position, gain)` for
   positional loops, `sfx.setBed(name, gain)` for ambience beds, `sfx.surf(...)` for shore variation,
   `sfx.footstep(surface, position)` for footsteps (`src/audio/index.ts`).
3. **Positional audio:** loops and one-shots use Web Audio HRTF panning
   (`src/audio/soundscape/soundscape.ts`). Keep a stable world position and update loop handles with
   `setPos`; use non-positional playback only for ambience and UI.
4. **Allowed loops and beds:** add positional loops to `SoundLoopName`, and ambience beds to `BedName`
   and `BED_NAMES` in `soundscape.ts`.
5. **Both formats:** ship `public/audio/<name>.ogg` and `public/audio/<name>.m4a` (Ogg/Opus first,
   AAC fallback; `src/audio/soundscape/format.ts`).
6. **Encoding and loudness:** mono, trimmed and faded, normalised with ffmpeg `loudnorm` (about
   `TP=-1.5`), with the measured LUFS stored per slice in `bank.ts` (see `tools/sfx/fetch.sh`). Match
   nearby sounds' levels rather than using raw ElevenLabs output.
7. **Provenance:** a row per file in `ASSETS.md` (ElevenLabs sound effects, date, prompt, terms,
   processing) and a note in `ART_PROVENANCE.md`.
8. **Battle sounds:** add new battle cues to `BATTLE_SOUNDS` in `src/game/battle-audio.ts` so they load
   when a battle starts.
9. **Checks:** run `npm run build && npm run check:budgets` after adding files.
