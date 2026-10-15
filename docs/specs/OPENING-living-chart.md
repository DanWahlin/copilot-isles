# Spec: The opening — the Captain's Chest and the living chart

> Dan chose this on 2026-10-04 (option "Chest + living chart"). Our own idea, not a copy of A World
> Within's ship-in-a-bottle. Classic Disney films open on a storybook coming to life; ours opens on the
> Captain's Chart, the map players already use to travel.
>
> **Flow corrected 2026-10-04 (Dan):** the title stays as it is (the brigantine at anchor at sea, gulls,
> dolphins). The chest beat plays **after** captain select, in place of the old `voyage-loading` screen.

## Where it sits in the flow

1. **Title** (unchanged) → **New Voyage** → **captain select** (captain, captain's name, ship's name;
   unchanged) → **Set sail**.
2. **The opening** (below) replaces the loading screen. The island pack streams while it plays: it's
   the loading screen in disguise.
3. **Continue** (returning player) skips the cabin: a short (3–5 s) dive into the living chart, then
   wherever the save left off.

## The beat (new voyage, about 15–20 s, skippable at any time)

1. **The cabin.** After Set sail, the title fades through warm dark into a lamp-lit captain's cabin at
   golden hour: a heavy oak sea chest on the desk, a lantern swaying gently, dust motes in a shaft of
   light through the stern windows, the creak of timbers and soft waves outside.
2. **The chest.** The cabin holds on the wide shot while the island's heavy build finishes (the
   keyhole glows softly). Then the camera eases in to the chest, a gold ring breathes round the
   lock, and **Open the chest** invites the player to click or tap it (or press E, Enter, Space or
   gamepad A). If they don't, it opens by itself after about 12 s. The latch snaps, the lid
   anticipates (a small dip) and swings open with a puff of dust and a warm glow from inside.
3. **The chart.** The rolled Captain's Chart rises from the chest and unrolls across the desk (follow-
   through on the paper's curl and settle). It's the Captain's Chart in our ink-and-parchment style:
   Anchorage Cay, Port Meridian, fogged islands, a compass rose, the route line.
4. **It comes alive.** The inked sea ripples and turns to real water, from the centre outward. The
   islands rise from the paper like a pop-up book (Anchorage first), and a tiny brigantine on the chart
   catches the wind.
5. **The dive.** The camera swoops down into the chart and through the surface of the sea (a soft
   white flash of spray), and lands on Anchorage's existing arrival flyover. The music swells from the
   cabin into the island's theme.

**Holding for the load.** If the island isn't ready when the dive would start, the camera holds
gracefully on the living chart (the water moves, the brigantine bobs, the lantern sways) with a quiet
ink caption of the real loading stage. The dive starts as soon as it's ready.

## Music

The cabin is quiet at first (the title music fades away; timbers creak and the lantern swings). The
song, **"Island Reveal"** (Dan, made with Suno; G major, 147 s, plays once), starts with the latch:
its soft intro carries the lid and the chart, and its entrance (6.7 s in) lands as the islands pop up.
It plays on through the dive and over the arrival flight; at the end of its first phrase (27.6 s), once
the flight is within a couple of seconds of the captain, Anchorage's theme crossfades in. A skip
starts it at the matching moment; Continue starts it 20 s in with the dive, so the handover comes just
after the splash; reduced motion starts it as the cabin fades in.

## Skipping and accessibility

- **Opening the chest:** the glowing ring over the lock is a ≥ 44 px button; a click or tap anywhere,
  E, Enter, Space or gamepad A open it too. After the chest is open, the same inputs skip ahead.
- **Skippable any time:** Esc or the visible **Skip** button (≥ 44 px). A skip goes straight to the
  dive's flash if the island is ready; if it isn't, it jumps to the living chart and holds there.
- **Reduced motion:** no camera moves and no prompt. The cabin fades in with the chest already open,
  it holds while loading, then a short crossfade goes to the island card (the arrival's card-only mode).
- Keyboard, gamepad and touch do the same things.

## Rules

- **One world, not two.** The miniature islands on the chart are built from the real island height
  functions (`coveHeight`, `meridianHeight`) and coloured with the same terrain masks, and the tiny
  ship is the real brigantine, scaled down. Anchorage's chart position matches the world, so the dive
  ends exactly where the arrival flyover starts. No second art set.
- **Budgets.** The cabin is a small procedural set (one room, ~15 props) plus the hero chest, chart
  and lantern, with no extra download: it's code in a lazy `opening` chunk, inside the §13.5 budgets.
  It stays within the §15.4 pipeline caps.
- **Tech.** TSL only (no GLSL strings), public three.js APIs only, no allocation in hot loops, and the
  hitch guard (`window.__isles.hitches()`) stays clean after warm-up.
- **No visible stalls.** From the title's first press to the captain ashore, no frame gap over 100 ms
  (aim for 50) where the player can see it. `tools/openingtest.mjs` plays the highlight reel's opening
  steps and fails on any gap over 150 ms (`--max`); `--profile` names the functions inside each gap.
  How it's kept there:
  - The AudioContext is made while the game loads (`audio/early-context.ts`): the first one starts
    the browser's audio service, a 300–600 ms block that froze the title on its first click.
  - The Chart's coastlines and its course list load while the title idles, the island art is drawn
    once, and the paper is a layer of its own, so a hover animation doesn't redraw its noise.
  - On the captain screen, the cabin's bounds are worked out in slices and its warm draw lets a few
    new looks in a frame (`warmProgressively`).
  - Work three can't split (the island sky's cloud noise bakes and compute kernels, 60–110 ms each)
    runs under the veil, before the cabin fades up (`Opening.play(underVeil)`). Everything else in
    the island build yields a slice at a time (`breathe()`, `buildSlice()`), and the world's warm
    sizes each frame by new looks, not objects.
  - Left: a shader module's first compile in the GPU process (a 38 k-character WGSL module took
    about 100 ms with the main thread idle). The browser does it; the warm spreads them a frame apart.
- **Disney bar.** Anticipation and follow-through on the latch, the lid and the paper; warm key light
  with cool fill; no hard cuts except the spray flash; the camera always moves on eased arcs.

## Later uses of the same pieces

- Opening the chest again from the pause menu shows the chart (fast travel, already in the game).
- Each new island's first arrival can rise from the chart the same way, in a few seconds.
