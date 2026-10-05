# Sea battles: polish plan

> Context: the battle prototype (`devpages/battle.html`, docs/specs/BATTLES.md) works end to end. On
> 2026-10-04 Dan asked if it would pass a Disney-level release bar. It doesn't yet: the loop works, but
> the craft isn't there. This plan closes the gap, in order. Issues #203 and #204.

## What already holds up

- The powder-cartridge readiness HUD is clear and our own.
- Ballistic arcs, gunsmoke, and splashes read well.
- A raider strikes its colours, its crew rows away, and the hull settles. That beat is gentle.

## The plan (in order)

| # | Work | Done when |
|---|---|---|
| 1 | **Sound.** CC0 recordings for the near cannon (crack, boom, tail), the distant cannon, the ball whistling past, a timber hit and splinter crack, and the big splash (reused). Spatialized through the soundscape (HRTF, the air low-pass with distance). Ducked under dialogue. Logged in `public/audio/CREDITS.md` and `ASSETS.md`. | Every visual battle event has a matching sound, and a near broadside is the loudest one-shot in the game without clipping |
| 2 | **Animation beats.** Gun recoil (each gun runs back and is run out again as it reloads), the hull heels away from its own broadside and shudders when hit, the struck colours come **down the halyard** (anticipation, then an ease), the wreck settles with a list, a bow-up moment, and a follow-through as she slips under, and the rowers pull their oars in rhythm | Each beat shows anticipation and follow-through and respects reduced motion |
| 3 | **Staging and camera.** A battle intro (the lookout's call, sails rising out of a fog bank, the camera eases out to frame them), framing for broadsides and strikes, and clear wave transitions (a held beat, then the next wave's sails) | You can read every beat of a wave with the HUD hidden |
| 4 | **Raider identity.** Their own flag (no skulls, no Octocat, no Copilot logo), patched grey sails with a stripe, and a real **cutter** (one mast, fore-and-aft rig) built from the brigantine kit, not a scaled brigantine | A raider reads as "the fog raiders" from 150 m |
| 5 | **Visual cleanup.** Quieter warning chevrons, soft ends on the gold arcs, splinters as chips with a little spin and splash, barrels that sit in the water with a wet line, scorch decals and shot holes in sails | A frame strip looks finished at 1600×900 on High and on Low |
| 6 | **Playtest pass.** Pacing (3–4 minutes for the passage), difficulty and the break-off feel, the full two waves and the win in the browser, gamepad and touch helm, reduced motion and captions audit, frame time on Low (UHD 620 floor) and the hitch guard clean | A scripted playtest (`tools/`) plays the battle end to end on WebGPU and WebGL2 |

### Progress

- **1 and 2: done** (8ee929f).
- **3: done.** Each wave opens with an intro phase (5.5 s): a fog bank forms on the weather side (`src/world/battle/fog.ts`, one instanced sprite draw), the lookout calls where it lies ("Sails in the fog, off the starboard beam!"), a title band names the wave, the raiders show inside the fog and sail out as it thins, and their guns stay quiet until "Run out the guns!". The battle reports staging beats (`onBeat`: intro, broadside, incoming, strike, clear, won, breakoff) to a camera director (`src/game/battle-camera.ts`) that frames each one and then gives you your own view back. It stands off for 8 s when you drag or zoom, doesn't chase every broadside (9 s cooldown), and cuts instead of swooping with reduced motion. A small cheer marks a beaten wave and the win. Follow-ups fixed: the win card hides the guns, Skip and the bonus line. The faint ship outline in the fog was the AO pass: its distance fade read the post quad's near/far instead of the scene camera's, so AO never faded with distance (an engine-wide bug, now fixed in `src/engine/post.ts`). The fog bank now forms fully in front of the raiders, and they show only once it's thick.

- **4: done.** Raiders build with `createBrigantine({ raider: true })`: a slate hull with oxblood and pewter trim, patched fog-grey sails, swallowtail colours of our own (a lantern in the fog), and a real one-mast gaff cutter rig (`setRig`). The struck colours come down the cutter's mast too. No new pipelines; a cutter draws less than a brigantine.

- **Flotsam (Dan's note).** The rowing boat had no visible hull (it sat below the water line) and its oars floated free (the oar shader worked in world space). Now the boat floats with freeboard and has bottom boards, a wale, three rowers in different shirts and caps, a coxswain, and bladed oars that sweep from their oarlocks a little out of step. Stores have distinct shapes: lashed planks (timber), a barrel (powder), and broken planks (wreckage, not collectable), each with its own size, angle, roll and tone.

- **5: done.** Arcs are additive light on the water (no grey band), with metre-wide lines, soft ends, and thin, slower warning chevrons. Splinters are tapered chips in wood and paint tones that tumble, land with a small splash, float a few seconds and sink. Flotsam has a wet, glossy band below the water line. Hits leave shot holes (a dark hole in torn pale wood with a soot halo, eight per hull, patched on repairs), and sails show scorched holes as a hull takes damage. Shot marks and gun recoil for every ship share two uniform arrays (one block per ship), which cut the battle's shader programs from 84 to 81.

- **Aiming (Dan's note: hard to steer, fire and move the mouse at once).** Dan picked: a follow camera, a turn hint, and a helm assist. Between beats the camera keeps your ship and the nearest raider in one frame (high and to one side, so your rigging doesn't hide her; capped turn rate; stands off for 8 s after a drag; `?nofollow` turns it off). A hint above the guns says what to do next ("◀ Turn to port: your starboard guns will bear", "Your starboard guns bear: fire!"). **Bring her round** (R, or the 44 px button) hands the helm to your helmsman, the raiders' broadside logic steering for you; any helm key takes it back. With only R and Space, wave 1 fell in 37–74 s. Step 6 to do: gamepad (a face button for R) and touch.

- **Briefing (Dan's note: what are the lines on the water?).** A short card before each battle ("Before the fog lifts") with four drawn rows: gold arcs (where your guns reach), red chevrons (a raider is about to fire), cartridges (reloading, Space / Z / C), and Bring her round (R). Set sail (Enter, Space, Esc) or Skip closes it; "Don't show this again" is kept in localStorage. Keyboard focus starts on Set sail; all buttons are at least 44 px; it fits a 390 px phone. Dev flags `?brief` / `?nobrief`.

## Teaching map (v2; built 2026-10-04: `BATTLE_PLANS` in `src/world/battle/battle.ts`, new quizzes N0.1, N1.1, N1.2)

Each wave carries its own quiz id, so the bosun asks about the habit that wave stands for. Battle 2 plays on the dev page with `?battle=2`; in the game it follows the Seal of Meridian once Thousand-Bough Isle exists. Wave 3 is in (*Max Effort*, *Overthought*). The wave 2 merchant is not built yet (Dan to decide).

One habit per wave, from the chapter you just finished. The course states these as steps to do (and why), not as named "pitfalls", so each wave is framed as the habit. Every quote is a **full sentence, verbatim**, checked against `github/copilot-app-for-beginners` (main, 61a5da6) on 2026-10-04. The only teaching text in a wave is the bosun's question and its cited sentence; lookout calls stay plain ("Sails in the fog, off the starboard bow!") and teach nothing. A wrong answer shows the right one and the section link, and never costs anything. *Stale Branch* is dropped (no course text).

v1 mistakes, fixed here: a cut fragment was presented as a pitfall; one quote was shortened with an ellipsis and one ended at a colon; the lookout lines were teaching lines with no source.

### Battle 1: the passage Anchorage → Port Meridian (recaps Chapter 00)

| Wave | Habit | Course sentence (verbatim) | Section | Raiders | Bosun's question |
|---|---|---|---|---|---|
| 1 | Preview before you run it | "The script creates items on GitHub in your fork, so you'll preview its target and planned changes before running it." | 00 · Add the Course Practice Items | *Unchecked*, *No Dry Run* | **New:** "The setup script creates items on GitHub in your fork. What do you run first?" `--dry-run` ✓ / `--yes` / `--allow-shared-repository` |
| 2 | Check the target | "Wait for the preview to finish. It ends with `Dry run complete. No changes were made.` Confirm that the `Repository:` line in the output shows your fork before you continue." | 00 · Add the Course Practice Items | *Wrong Fork*, *Wrong Account* | **Existing T0.5** (source `00-setup#add-the-course-practice-items`): the dry run shows someone else's repository. What now? Stop and point it at your fork ✓ |

*Wrong Account* rests on: "The setup script uses the GitHub CLI, which has a separate sign-in. Confirm that it uses the account you used to create your fork:" (00 · Check Your Tools in Terminal; the sentence ends in a colon before `gh auth status`, so quote it with the command or not at all).

Optional wave 2 mechanic: a friendly merchant flying your colours comes out of the fog with the raiders, and your guns hold fire on her. The only line: "Check her colours first." It's a game line, not a course claim.

### Battle 2 (later): Port Meridian → the Chapter 02 island (recaps Chapter 01)

| Wave | Habit | Course sentence (verbatim) | Section | Raiders | Bosun's question |
|---|---|---|---|---|---|
| 1 | One worktree per session | "Most project sessions should use a **New worktree**. Separate worktrees let agents work at the same time without changing the same working copy." | 01 · Project Sessions | *Shared Checkout*, *Tangled Copy* | **Existing A1.5** (`01-tour-the-app#project-sessions`) |
| 2 | Know when the agent will ask | "**Always ask** asks each time. **Approve all** runs tools without asking. **Assisted** asks only when a tool request fails an AI safety check. Check this setting so you know when to expect approval requests." | 01 · Modes | *Blind Approval*, *Unasked* | **New:** "You want the agent to ask before every tool it uses. Which **Tool permissions** setting?" **Always ask** ✓ / **Approve all** / **Assisted** |
| 3 (optional) | Effort isn't a guarantee | "Higher effort does not guarantee a correct answer." | 01 · Models and Reasoning Effort | *Max Effort* | **New:** "Does a higher **Reasoning effort** guarantee a correct answer?" No ✓ / Yes / Only with **Auto** |

Dropped from v1: "Pick the mode that fits the task." It's image alt text in the course, not body text, so it can't carry a teaching line. The helmsman tie goes with it.

Open questions for Dan: keep the wave 2 merchant? Build battle 2 now or after the Chapter 02 island? OK with the new question wording?

Budget note (coordinator, 2026-10-04): vendor-three is at 249.5/250 KB gz. When the battle goes into the game, load it with a dynamic `import()` so it ships in its own chunk, and add no new eager three.js imports.

Then the passage battle goes into the game (Anchorage → Port Meridian, required with a skip), and Dan reviews.

## Rules that apply throughout

- TSL only, public three.js APIs, no allocations in hot loops (pools), hitch guard clean after warm-up.
- Budgets: PLAN §12.1 tiers, §15.4 pipelines (island ≤ 150), `tools/budgets.json`.
- Every new asset in `ASSETS.md` (CC0) or `ART_PROVENANCE.md` (AI-generated). Never model the Octocat or the Copilot logo.
- Player copy uses friendly contractions. Teaching lines cite their chapter and section.
