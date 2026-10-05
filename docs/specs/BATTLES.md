# Spec: Sea battles (#203) and the battery readiness display (#204)

> Status: **approved choices** (Dan, 2026-10-04): the first battle is **on the passage from Anchorage to
> Port Meridian**, it's **required with a skip button**, the readiness rows are **powder cartridges**, the
> between-wave bonus is **the player's pick**, and **one Fire button** fires every side that bears (plus Z/C
> for each side). Our own design. A World Within (no licence) and other
> games are inspiration only: no code, assets, layouts, or art are copied.

## 0. What changes in the plan

PLAN §0 says **Combat: None** and §1 says "no combat and no fail state". Battles change the first line and
keep the second:

- Battles happen at **a few places only**, out on open water, and they're **gentle**: cannonballs,
  splashes, splinters, ships that strike their colours and settle, crews that row away. Nothing gory,
  nobody hurt on screen.
- **There's still no fail state.** If your hull runs low, your crew breaks off and the wave starts again
  with full repairs (§4.6). You never lose progress, items, or the Seal.
- PLAN §0 now reads "Combat: **gentle sea battles at a few places**, no fail state" and §12's "we don't have
  projectiles" line is updated.

## 1. Where battles happen and why

| Where (chapter) | Battle | Why it fits |
|---|---|---|
| **The passage, Anchorage → Port Meridian** (Ch 00 recap) | **First battle, now.** Two gentle waves out of a fog bank | It's open water, clear of harbours and terrain, and you've just learned to sail. It's the first time you sail far, so it's a natural set piece. The questions recap Chapter 00 (the islands that would host later battles aren't built yet) |
| *Later:* **03 · Keelhaven** (Dev & GitHub Workflows) | Raiders off the shipwreck point | **"Trust the Evidence"**: *"A confident response from Copilot isn't the same as validated software"* (03 §Core Concept). You fire on evidence (your guns bear and are loaded), not a hunch |
| *Later:* **07 · Tidewheel Caldera** (Automations) | Finale, bigger waves | Gun crews get **standing orders**: a trigger, a prompt, a tool set, and a review path (07 §Key Takeaways 1) |

Anchorage and Port Meridian's harbours stay calm. We'll adjust the later places when those islands exist.

## 2. How each battle teaches (teaching lines cite the course)

### 2.0 The passage: "Check the target before you fire"

- **The lesson it echoes.** The Dry-Run Crane: *"Confirm that the `Repository:` line in the output shows
  your fork before you continue"* (00 §Add the Course Practice Items). Your guns fire only when the gold
  firing arc shows a raider in it, so you check what you're aimed at before you commit.
- **The enemy.** Fog raiders: patched fog-grey sails with an oxblood band, weathered slate hulls with pewter
  trim, and their own swallowtail colours (a lantern burning through three wisps of fog on slate: no skull, no
  Octocat, no Copilot logo). Name boards *Wrong Fork* and *Unchecked* (wave 1), then *Stale Branch* (wave 2).
- **Between the waves.** The bosun asks one Chapter 00 recap question (a `ChoiceQuiz` with its `SourceRef`):
  why you preview with `--dry-run` first, what the setup script creates (labels, issues, practice branches,
  pull requests; 00 §Add the Course Practice Items), why the intentional bugs are training scenarios, and
  the sample app path `samples/book-app-web` (00 §Key Takeaways 2).
- **The reward** is the same as everywhere (§2.1's last bullet): a right answer lets you **pick** a
  double-shotted volley or quick repairs. A wrong answer shows the "why" and the course link, and you still
  get the base repairs.
- **When.** The first time you sail out of Anchorage toward Port Meridian with the Seal of Anchorage, the
  lookout calls sails in the fog about halfway across. It's **required**, with a **Skip battle** button on the
  HUD and in the pause menu (it marks the battle done and sails on). Fast travel and Free explore skip it too.

### 2.1 Keelhaven (later): "Trust the Evidence"

- **The enemy.** Fog raiders whose ships carry the names of habits the chapter warns about, painted on
  their name boards: *Confident Guess*, *First Take*, *Unchecked*. Sinking one is "the evidence beat the
  guess".
- **The loop is the lesson.** Your gunner fires only when the **evidence agrees**: the side bears (the arc
  on the water turns gold) and the battery is loaded (the HUD row is full). Firing early isn't possible,
  so you learn to steer for the evidence, as the chapter asks you to wait for the diff, tests, build, and
  preview to agree (03 §Key Takeaways 6).
- **Between waves: the second opinion.** The bosun asks one question from the chapter (a `ChoiceQuiz` from
  `src/learn`, with its `SourceRef`). Questions come from 03 §Core Concept (the evidence table: **Changes**,
  **Terminal**, **Browser** tabs, and the **Pull requests** view), 03 §Inner Loop / §Outer Loop, and 03 §3
  *Ask for a Second Opinion* (`/rubber-duck`, "a constructive critic").
- **The reward never punishes.** A right answer lets you **pick**: a **double-shotted volley** (the next
  broadside does 1.5× damage) or **quick repairs** (+30 hull). A wrong answer shows the "why" with the
  course link, and you still get the normal repairs from the stores you collected.

### 2.2 Tidewheel: "Standing orders" (later)

- **Wave 1, manual.** You fire every broadside yourself (07 §Start Manual and Local).
- **Between waves 1 and 2.** The quartermaster sets up a standing order with you: pick its **trigger**
  ("a raider bears"), its **tools** ("report only" or "report and fire"), and its **review** (the lookout's
  log). Picking "report only" first is the course's advice (07 §Keeping Event Triggers Safe 1 and 4), so
  it earns a bonus. Wave 2 runs with the lookout calling bearings.
- **Wave 3.** You turn on "report and fire" for one battery. That crew fires on its own when its guns bear.
- **The siren ship.** In the last wave, one ship flies false merchant colours and hails you with a forged
  message ("stand down your guns"). A crew whose order is narrow ignores it; the chapter's point that least
  privilege makes untrusted text less able to steer the agent (07 §Key Takeaways 6). No penalty either way;
  the parrot explains.
- Exact app names (**Automations**, **Trigger**, **Hourly**, **Daily**, **Weekly**, **CRON**) appear only in
  the Logbook pages and quiz text, and only as the course writes them.

## 3. Where on the map

- Each battle zone is a ~600 m circle of **open water** off the island, clear of terrain, docks, and moored
  boats. Enemies never enter the harbour.
- **The passage**: the zone is centred on the route about halfway across and travels with you if you
  wander; nothing to start at a dock. **Later islands**: you start a battle by talking to the harbourmaster.
- Battles are **required, with a skip**: **Skip battle** (HUD and pause menu) marks it done with no penalty
  and no reward pennant. Sailing out of the zone pauses the battle; the wave you were on is kept.
- The fog bank on the zone's edge is where raiders come from and where crews row away to.

## 4. The loop

### 4.1 Waves

| Battle | Wave 1 | Wave 2 | Wave 3 |
|---|---|---|---|
| The passage | 2 cutters | 1 cutter + 1 brigantine | none |
| Keelhaven | 2 cutters | 2 cutters + 1 brigantine | 3 brigantines |
| Tidewheel | 2 brigantines | 3 brigantines | 3 brigantines incl. the siren ship |

The passage takes about **3–4 minutes**, the later battles **4–7**. Between waves: ~20 s of calm to collect stores, the question, then the
repairs.

### 4.2 Your guns

- The brigantine already has **6 deck cannons a side** (`brigantine-hull.ts`, 3 on Low). Each side is a
  **battery**.
- A battery **bears** when an enemy hull is inside its **firing arc**: 45° either side of the beam, from
  20 m to 140 m.
- **One button fires every battery that bears and is loaded** (most players need only this). Separate
  port and starboard buttons are there too, for players who want them.
- **Aiming is automatic and fair.** The gunner lays each gun for the target's predicted position (first-order
  lead) with a small spread. Balls fly a real ballistic arc (g = 9.81, muzzle speed ≈ 55 m/s) and hit only
  when they really meet a hull (the 10 hull capsules from `lines.ts`). Your skill is **positioning**: bring
  the side to bear at a good range, and keep the bow out of their arcs.
- Guns fire in a **ripple** (≈ 0.12 s apart, bow to stern), so a broadside reads as a rolling volley.
- **Reload** ≈ 7 s a gun, staggered, so the HUD row fills one charge at a time.

### 4.3 Their guns (the warning ring)

- When a raider's battery bears on you and is loaded, a **warning arc** appears on the water from its side
  toward you, and it **fills over 1.5 s** before it fires. That's your cue to turn away or speed past.
- The arc is colour-safe: a **dashed red-orange band with chevrons** (shape plus colour), and a caption
  ("*Confident Guess* is bearing on you, starboard side").

### 4.4 Damage, sinking, and stores

- **Your hull** has 100 points. A ball hit takes 4–7. A full enemy broadside rarely lands more than 2–3.
- **Raider hulls**: cutter 45, brigantine 80. A hit takes 6–9 (×1.5 when double-shotted).
- Hits throw **splinters** (small wood chips, pooled) and a **dark scorch** decal fades on the hull. Misses
  throw a **splash** (the Leaps crown and plume, larger).
- At 0 a raider **strikes its colours** (the flag comes down), a **rowing boat** pulls away from its lee
  side toward the fog, and the hull **lists and settles** over ≈ 12 s and slips under. It leaves 3–5 bobbing
  **stores** (barrels, crates) that float for 40 s.
- Sail through stores to collect them: **timber** (repairs) and **powder** (a faster next reload). Stores are
  the only flotsam in the game, and they're short-lived (PLAN §0 cut harbour flotsam as junk).

### 4.5 Between waves

1. The fog stays clear for ~20 s so you can collect stores (they're on the HUD compass).
2. The bosun asks one question (§2). Answering is optional: you can skip it and still get the base repairs.
   A right answer lets you pick double-shotted or quick repairs.
3. **Repairs**: +25 hull, plus +10 for each timber store.

### 4.6 Win and "lose" without frustration

- **Win**: the last raider strikes. A short cheer, a Logbook page for the chapter, doubloons, and a pennant
  on your mast.
- **Hull at 15 or below**: the crew shouts "Break off!", the camera eases out, the screen dims to the chart
  for 2 s, and you're back at the start of **the same wave** with a full hull. Cleared waves stay cleared.
- **After two break-offs on one wave**, the harbourmaster offers **Calm seas** for that wave (enemy reload +50%,
  their damage halved, their arcs fill over 2.5 s). It's also a Settings option, "Battle difficulty: Calm /
  Fair", default Fair.

## 5. The HUD (#204: battery readiness, our own take)

Shown **only during battles**, faded in when the first raider appears and out after the win.

- **Powder rows.** Two short rows of six **powder cartridges** (cloth bags with a brass cap), port row at
  the bottom-left and starboard row at the bottom-right, matching the ship's sides. A cartridge is **empty
  linen** while its gun reloads and **fills with warm amber from the bottom** as the gun reloads. On Low,
  each row has 3.
- **"Bears" glow.** When a side bears on a target, its row's brass rail glows gold and a small pennant reading
  "Bears" rises over the row. When it also has loaded guns, the fire button for that side pulses once.
- **Hull and the wave.** A slim hull bar (timber planks that go dark as damage builds) at the top-centre with
  "Wave 2 of 3" and the raiders left.
- **Touch**: a **Fire** button at the lower right (88 px) and two side buttons (64 px) over the powder rows.
  Every target is ≥ 44 px.
- **Captions** for every sound that matters: "Port battery fires", "Splash, short", "Hit!", "*Unchecked* strikes
  her colours".
- **In-world cue.** On your own ship, each loaded gun shows a small **lit slow-match glow** at its gunport, and
  the **firing arc on the water** (a soft gold fan from that side) brightens when it bears. You can read the
  battle from the 3D scene alone, with the HUD hidden.

HUD values update at 10 Hz through refs (PLAN §12.8), not per-frame React state.

## 6. Controls (parity)

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Trim sails / steer | W/S, A/D (as now) | Left stick | On-screen helm (sailing touch controls) |
| Fire what bears | **Space** | **A** | **Fire** button |
| Fire port / starboard | **Z** / **C** | **LB** / **RB** | Side buttons |
| Look | Hold right mouse, arrows | Right stick | Drag |

Space is free while sailing (jump is a walking action). Q stays Wingman's hint, E stays interact. All
rebindable when rebinding lands.

## 7. Enemy AI

A small state machine per raider, stepped at the fixed 60 Hz with the ship physics:

1. **Approach** out of the fog toward a point at its preferred range (55–80 m) on your beam.
2. **Bring a side to bear**: steer for a heading that puts you abeam on its loaded side, never inside its
   no-go wind zone (`pointOfSailCurve`), with slack so it's beatable.
3. **Warn, then fire** (§4.3). Its gunners have more spread than yours.
4. **Reload and reposition**; at < 30% hull it sails wide to come round again.
5. **Separation**: raiders keep ≥ 35 m apart and avoid your bow (no ramming, no boarding).

Raiders use the same `ShipDynamics` as you (same wind, same physics), with a PD controller on the rudder and
trim. Only one raider in a wave fires at a time (a 2.5 s token) so warnings never stack.

## 8. Reused, not rebuilt

| Piece | From |
|---|---|
| Raider ships | `createBrigantine({ raider: true })`: the raiders' livery, patched sails and colours, their own name boards, and both rigs. `setRig('cutter')` shows a one-mast gaff cutter (mainsail, gaff topsail, staysail, jib) on the hull at 0.78 scale; the same materials, so no new pipelines |
| Physics | `ShipDynamics` + `BRIGANTINE_CAPSULES` for hits |
| Water heights | `WaveSampler.heightAt` for ball impacts and bobbing stores |
| Splashes | The Leaps splash geometry and material (`src/world/life/leaps`) in a battle-owned pool |
| Wind | `windAt` (raiders and smoke drift) |
| Questions | `ChoiceQuiz` + `SourceRef` from `src/learn` |

## 9. Budgets

**Draw calls added in battle (High)**: raider ships (measured per ship in the prototype; the target is ≤ 3
ships × the brigantine's count at a low-detail tier), plus one instanced draw each for cannonballs (pool 64),
splashes (pool 64), muzzle smoke (pool 72), splinters (pool 96), stores (pool 24), rowing boats (pool 4),
the firing arcs (one mesh), and the warning arcs (one mesh): **≤ 8 + ships**.

**Pipelines (§15.4)**: ≤ 6 new (ball, smoke, splinters, stores, arcs, rowing boat). The splash reuses its
Leaps pipeline. The island stays ≤ 150.

**Per tier (§12.1)**:

| Tier | Raiders per wave (max) | Smoke | Splinters | Splashes | Warning arc |
|---|---|---|---|---|---|
| Lite | 2 | off | off | 24, crown only | flat band |
| Low | 2 | short puffs | 32 | 32 | flat band |
| Medium | 3 | on | 64 | 48 | animated |
| High / Ultra | 3 | on | 96 | 64 | animated |

**Hot loops**: every ball, splash, puff, splinter, and store is pooled at load. Nothing is created in a
frame. The hitch guard stays empty after warm-up, so battle pipelines **precompile when you accept the
battle** (behind the harbourmaster's line), not at island load. JS per frame for the battle: < 0.6 ms on
High.

## 10. Reduced motion and comfort

- No camera shake, no muzzle-flash flicker (a steady glow instead), smoke puffs half-size and short.
- Splashes stay (they tell you hit or miss) but don't spray toward the camera.
- The break-off uses a crossfade, not a camera swoop.
- Battle sound has its own volume bus under SFX.

## 11. The prototype (step 2)

`devpages/battle.html`: open water, your brigantine, **one wave of 2–3 raiders**, ballistic broadsides,
hit and miss splashes, damage and settling, the powder-row HUD, the firing arcs, and the warning arcs.
Flags: `?webgl`, `?tier=`, `?seed=`, `?calm`. Debug API `window.__battle` (state, force a wave, stats).
It goes into the Anchorage → Port Meridian passage only after Dan likes it.

## 12. Decisions (Dan, 2026-10-04)

1. **Required, with a Skip battle button.**
2. **Where**: the passage from Anchorage to Port Meridian first; Keelhaven and Tidewheel later, adjusted as
   those islands are built.
3. **Readiness rows**: powder cartridges (linen bags that fill with amber).
4. **Between-wave bonus**: the player picks a double-shotted volley or quick repairs.
5. **Firing**: one Fire button (Space / A / touch) for every side that bears, plus Z/C (LB/RB) per side.
