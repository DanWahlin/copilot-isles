# Gameplay videos (`tools/video`)

Films a scenario played live in the game and turns it into an MP4 you can watch: real key presses
and mouse clicks at a human pace, the game's own audio, a title card, and fades over trimmed
stretches. Each run also writes a contact sheet and refreshes an `index.html` that plays every
video in the output folder.

## Run it

Start a no-HMR dev server of your own (edits landing mid-run would otherwise reload the page):

```bash
npx vite --config tools/vite.nohmr.config.mjs --host 127.0.0.1 --port 5395 --strictPort
```

Then:

```bash
node tools/video/record.mjs --list
node tools/video/record.mjs --scenario=sluice,crane --out=<dir>
node tools/video/record.mjs --scenario=battle1 --base=http://127.0.0.1:5395 --tier=high
node tools/video/record.mjs --scenario=battle1 --quality=high
node tools/video/record.mjs --recompress --out=<dir>
```

| Flag                      | Default                  | What it does                                                                  |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `--scenario=<id>[,<id>…]` | (required)               | Scenarios to film, in order. An unknown id prints the list.                   |
| `--list`                  |                          | Prints the scenarios and their titles.                                        |
| `--base=<url>`            | `http://127.0.0.1:5395`  | The dev server.                                                               |
| `--tier=<tier>`           | `high`                   | Render tier (`lite`, `low`, `medium`, `high`, `ultra`).                       |
| `--out=<dir>`             | `~/Movies/copilot-isles` | Where the videos go. Don't put them in the repo.                              |
| `--quality=<quality>`     | `review`                 | Final encode quality (`review`, `high` or `master`).                          |
| `--size=<w>x<h>`          | `1280x720`               | Viewport, screencast, raw clip, title card and sheet size (e.g. `1920x1080`). |
| `--jpeg=<1–100>`          | `90`                     | The screencast's JPEG quality (`100` for finals).                             |
| `--no-audio`              |                          | Video only (silent track).                                                    |
| `--no-title`              |                          | No title card.                                                                |
| `--keep`                  |                          | Keeps `<out>/.work/<id>/` (raw clip, PCM audio, `take.json`, title PNG).      |
| `--refinish`              |                          | Rebuilds the MP4, sheet and index from a `--keep` run without filming again.  |
| `--recompress`            |                          | Re-encodes every `<out>/*.mp4` to review quality in place; requires `--out`.  |
| `--take-only`             |                          | Films and keeps the take (`take.json`, raw clip, PCM) with no MP4 (reels).    |
| `--work=<dir>`            | `<out>/.work`            | Where the takes go (`<work>/<id>/`).                                          |

## Output

Each scenario writes `<id>.mp4`, `<id>.png` (six frames in a 3×2 sheet), `<id>.jpg` (poster),
`<id>.json` (titles, duration, marks, notes), and the shared `index.html`. The default `review`
encode is 1280×720, 30 fps H.264 yuv420p (two-pass `-preset slow -b:v 1200k -tune animation`),
AAC 128k, and `+faststart`. It keeps HUD text and subtitles readable and targets about 8–20 MB per
two minutes.
`--quality=high` keeps the previous final encode settings: H.264 `-preset medium -crf 19` and AAC
160k. `--quality=master` is for finals and reels: H.264 High profile, `-preset slow -crf 16`, and
AAC 256k. The raw intermediate stays at high quality. With `--keep`, it remains in
`<out>/.work/<id>/`.
`--size=1920x1080` films and finishes at 1080p (the title card is laid out at 1280 CSS px and scaled
up; the sheet's frames are half size). Each take records the frame rate the page delivered and its
stalls (`fps`, `maxGapMs` and `gaps` in `take.json`). At 1080p with `--jpeg=100` on the High tier,
an M-series Mac delivers about 58–60 fps.
`--recompress --out=<dir>` applies review quality to every root-level MP4 in that folder. It writes
each candidate in `<out>/.work/`, checks its duration and audio/video streams with ffprobe, and
replaces the original only after validation.

`node tools/video/sync-check.mjs [--out=<dir>]` measures audio/video sync (see below).

## Add a scenario

Add a module to `scenarios/` whose default export is:

```js
export default {
  id: 'crane', // what --scenario= takes
  order: 2, // place on the index page
  code: 'P0.2', // shown on the title card's eyebrow
  title: 'The Dry-Run Crane',
  island: 'Anchorage Cay',
  who: 'with Pim and Pol on the quay', // optional line under the title
  subtitle: 'What it teaches, in one or two sentences.',
  chapter: 'Course Chapter 00 · Add the course practice items', // cite the course section
  flags: [], // extra dev-page query flags, e.g. ['meridian'], ['thousandbough']
  time: 17.6, // optional hour of day (default 16; 17.6 is golden hour)
  titleFrame: 2, // seconds into the clip for the title card's blurred background
  cursor: false, // optional: draw the mouse pointer (headless Chrome draws none; cursor.js)
  async open(page, { base, tier }) {}, // optional: open another page instead of devpages/play.html
  async setup(page, api) {}, // off camera: quests, teleports, skipping ahead
  async play(page, api) {}, // filmed: everything the player does, by real input
};
```

`record.mjs` opens `devpages/play.html?shot&quiet&time=16&tier=…` (the scenario's `time` if it sets one), presses **Set sail** (so the
AudioContext unlocks as it does for a player), runs `setup`, starts recording, runs `play`, and
stops. `this` in both is the scenario object, so `setup` can pass spots to `play`.

What `api` gives you (`lib.mjs`, `makeApi`):

- Input: `press(code, ms)`, `hold(codes, ms)`, `click(selector, { ms })` (moves the mouse there
  first; with `ms`, a visible glide), `glide(x, y, ms)` (an eased mouse move),
  `walkTo(x, z, { tol, run })` (camera-relative WASD, picked each tick from eight directions, Shift
  when it's far), `face(x, z)` (short taps of the move keys), `interact(text)` (waits for the
  interact prompt to read `text`, then presses E), `easeLook(yaw, pitch, ms)` (eases the camera like a
  mouse drag).
- Talk: `approachSpot(npcId, { back, sides })` (off camera: finds a side where the talk prompt shows,
  with room behind for the camera, and stands the captain `back` metres out), `talkTo(spot)`,
  `converse({ until, wrongFirst })` (voiced lines run on their own, cards are read then closed with
  E, quizzes answered with the number keys or a click).
- Editing: `cut(fn)` drops everything `fn` shows; `cutWhile(fn, { head, tail })` keeps only the
  first `head` and last `tail` ms of a long wait. Each join fades through black.
- State: `S(fn, arg)` (page.evaluate), `state()`, `learn()`, `prompt()`, `waitFor(fn, arg, ms)`,
  `mark(label)` (written to `<id>.json`), `watchText(selector, prefix)` (each new caption or toast
  becomes a mark when you call the function it returns), `log(msg)`.
- Setup only: `teleport(x, z, heading, y)`, `look(yaw, pitch)`, `skipTalk(page)` (from `lib.mjs`),
  and the island helpers in `game.mjs` (`meridianAshore`, `thousandBoughAshore`, `questsDone`, `tb`).

Pacing that reads well on video: a beat (0.5–1 s) before each press, 2.5–5 s to read a card,
question or terminal before acting, one realistic mistake so the feedback shows, then the solve,
and 2–3 s on the success at the end. Aim for 1–3 minutes; trim sailing and long fights with
`cutWhile`.

## Highlight reels (`reel.mjs`)

A reel is an edit of several takes: `reels/<id>.mjs` lists its segments, and each segment is one or
more parts (a take's stretch, `in` → `out`) that crossfade into each other. Every join between
segments fades the picture to black and the sound to silence and back (the fades sit inside the
clips, so they add no time). Times are seconds into a take or `{ mark, at }`: the first mark whose
label starts with `mark` (`last: true` for the last one), plus `at` seconds. A segment with
`crossfadeIn: <s>` crossfades from the segment before it instead of fading through black.

```bash
node tools/video/reel.mjs --reel=highlights --out=<dir> --base=http://127.0.0.1:5395
node tools/video/reel.mjs --reel=highlights --out=<dir> --refinish          # re-edit, no filming
node tools/video/reel.mjs --reel=highlights --out=<dir> --retake=battle1     # film that take again
node tools/video/reel.mjs --reel=highlights --out=<dir> --takes-only         # film missing takes only
```

Each take the reel needs is filmed once (with `record.mjs --take-only`, at the reel's `size`, `tier`
and `jpeg`) and kept in `<out>/.work/takes/<id>/`, so changing an in or out point only needs
`--refinish`. The reel is encoded once at its `quality` (`master`). The run writes:

- `<out>/<output>`: the reel (`highlights-1080p.mp4`).
- `<out>/review/<reel>/NN-<segment>.png`: a sheet per segment with its in and out frames, three frames
  inside, and both sides of each crossfade, labelled with the take and time.
- `<out>/<id>.json`: the edit (each part's in, out and length, its place in the reel, the sound
  level at each end so a cut word shows as a high level, the takes' delivered frame rate), and
  warnings: a highlight over `maxHighlight` seconds, a reel over `maxTotal`, a screencast stall
  over 150 ms inside a kept stretch. `still` lists stretches of the result with no change for
  0.6 s or more (`freezedetect`): a static screen such as the Chart or a card shows there too.
- `<out>/index.html` (or the reel's `index`): the reel in a large player, any earlier versions the
  reel lists in `alsoShow` (`{ reel, label, note }`) in smaller players below it, then every
  segment's sheet.

The `highlights` reel (v3, about three and a half minutes) uses the `opening` scenario (the real
title screen in a clean profile, the seagull, a mouse drag that starts the music, the Chart, New
Voyage, the name, Juno's whole cabin scene, the chest, the dive and the fly-in), `learn` (Ezra's
hotspot quiz and the "Add your fork" Logbook page), `rook-terminal` (Your setup's branch and issue
in Rook's session terminal), `sluice` and `sluice-wheel` (the lever, a channel turned too far and
back, and the last channel turned as the wheel starts), `shipwreck`, `battle1`, `helms`,
`channels-mix` (round 2 run with a gate turned back so the colours mix, then routed and run clean),
and a closing fly-by of each island: `flyby-anchorage`, `flyby-meridian` and `flyby-thousandbough`.
The current cut (v9) has a lower third on each learning section (Rook's Practice Bough, the
sluice, the battle, the helms and Channel Routing) and one over the fly-bys, terminal close-ups on
Rook's part and on the Three Helms' Plan and Autopilot parts (each after the lower third has gone),
and an end card. The sluice, sea-battle, Three Helms and Channel Routing cards read their text from
the game's `content/labels.json` (`label('<id>')` in `reels/highlights.mjs`), so the reel and the
game show the same words. `highlights-v8` is the previous cut (its mp4 is kept as a compressed copy
in the repo's ignored `videos/` folder); v1–v7's reel files are kept, but their takes were deleted
to save disk, so only v8 and v9 rebuild with `--refinish`. v9 films the reworked puzzles again:
`sluice-wide` (workflows on at the lever before the crane, a channel turned too far and back with
Shift+E, the tee feeding the wheel and the jammed check gate) and `helms-reel` (the `helms`
scenario with the game's own cards marked shown: Interactive heading picks, Autopilot stopping short
of the reef, the plan review with "Suggest changes to the plan", Autopilot to the berth). For a
smaller copy to share, re-encode the master with `ffmpeg -i <master> -c:v libx264 -preset slower
-crf 22 -tune animation -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart <copy>.mp4`.
Scenarios for puzzles and battles call `labelsShown(api)`
(`game.mjs`) in setup, which adds every label id to the save's `labels` list, so the game's own
parchment cards don't show under the reel's.

### Lower thirds

A segment's `lowerThird: { k, t, b, ch, c, chLine, part, at, hold, tail, showUnroll }` lays a parchment
"chart label" over it (`lower-third.html`, style A: torn parchment with burnt edges, a compass
rose, and a red wax seal with the chapter number). `k` is the small label, `t` the headline, `b` the
line under it, `ch` the chapter number on the seal and `c` the chapter text (`chLine` replaces
"Course Chapter <ch>"). It unrolls left to right like a scroll opening (0.8 s, a rolled curl on the
leading edge), the seal stamps down after it (0.3 s), it holds, and it fades out (0.5 s). It comes in
`at` seconds (default 1) after the segment's fade-in (or after the start of the segment's
`part`-th part, 0-based, when `part` is set), holds `hold` seconds (default 6.5) and is gone
at least `tail` seconds (default 1) before the segment's fade-out. `showUnroll: true` adds three
frames of the unroll to the review sheet; every sheet with a lower third also gets a frame at full
hold, and a full-size PNG of it (`review/<reel>/NN-<segment>-lower-third.png`).

`lower-third.mjs` renders the card and the seal once each, with fixed filter seeds, then makes the
way in and the way out as transparent 30 fps PNG sequences that only mask, move and fade those two
images (so the rough edge never shimmers); the hold is one still PNG. The reel composites them with
ffmpeg `overlay`, so `--refinish` re-renders them without filming. The fonts (Fraunces, Alegreya,
Alegreya SC and Cinzel; SIL Open Font License) are downloaded from Google Fonts once into the
git-ignored `tools/.cache/fonts/` and loaded as data URLs; the render stops if a face isn't loaded or
the text runs off the card.

Each segment is cut and finished into a near-lossless file (`<out>/.work/segments/<reel>/`), then
the segments are joined and encoded once at the reel's quality.

### Close-ups, end card and loudness

- `closeups: [{ label, part, at, dur, crop: { x, y, w, h }, scale = 2, x, y }]` on a segment: a
  region of the segment's own picture (the game's real UI, e.g. a session terminal) magnified with
  lanczos, framed in a thin parchment border with a soft shadow, fading in and out (0.3 s). `at` is
  seconds into the part or a take mark. Each gets a full-size frame on the review sheet.
- `lowerThird: { layout: 'end', k, t, tag, b, credit, at, out: false, dim, duck }`: the centred end
  card (1100×420, compass rose, an anchor on the seal). `out: false` holds it to the segment's end
  (its fade to black covers it), `dim: { blur, darken, ramp }` softens and darkens the picture
  behind it as it comes in, and `duck` (dB) dips the sound under it.
- `loudness` (LUFS) and `truePeak` (dBTP) on the reel: each section is measured (EBU R128) after
  it's cut and levelled with one gain (no compressor), lowered if a peak would pass the ceiling; a
  segment's own `loudness` wins (the fly-bys sit at -20). The report and the page give each
  section's measured loudness and true peak in the finished reel.

### Fly-bys

`flyby({ keys, seconds, ashore, ... })` in `game.mjs` makes a camera-only scenario: `keys` are
`{ x, y, z, tx, ty, tz, pace }` (eye and look-at in world space, as in `src/game/arrivals.ts`), flown
with the arrivals' own `FlyoverPath` through the follow camera's `cut` (a shot object changed each
frame is followed exactly). Setup hides the page's UI with a style tag (`hideUi`) and flies the path
once off camera, so everything it sees is streamed and warm before the filmed flight. No game code
changes.
`holdAfter` (seconds) holds the last view after the flight; the Thousand-Bough fly-by holds 8 s for
the end card.

## How it works

- **Video.** A CDP screencast (`Page.startScreencast`, JPEG) of the headless Chrome page. Each frame
  carries its own timestamp, so frames are laid onto a constant 30 fps timeline (each slot shows the
  newest frame at or before it) and piped into ffmpeg. The game keeps running at its own frame rate
  (60 fps with WebGPU on an M-series Mac).
- **Audio.** `audio-tap.js` is injected before any page script. It wraps
  `AudioNode.prototype.connect`: anything connected to an `AudioContext`'s destination is also
  connected to an `AudioWorklet` that copies the mix as 16-bit PCM and posts it to Node in ~1 s
  chunks (`page.exposeFunction`). The start sample is tied to an epoch time from the same JS turn,
  so it lines up with the screencast timestamps. No game code changes, and nothing plays on the
  speakers (Playwright keeps `--mute-audio`; the tap sits before the output).
- **Sync.** `sync-check.mjs` flashes the page white and beeps through the game's context in the same
  JS turn, then finds both in the finished MP4. The sound led the picture by 33–57 ms (a page
  change takes a frame or two to reach the screencast), so `AUDIO_LAG_MS = 45` holds the audio back.
  After that the five pairs measured −11 to +13 ms. In the sluice video, Suri's first subtitle box
  shows at 7.43 s and her voice starts at 7.47–7.49 s (the game starts the voice a moment after the
  line).
- **Post.** The title card is an HTML page screenshotted at the clip's size over a blurred frame of
  the clip. One ffmpeg pass trims the cuts, fades each join, prepends the title, and muxes.

## Pitfalls

- `?auto` on the play page starts **without audio** (`begin(false)`). Press the page's own start
  button instead; with `--autoplay-policy=no-user-gesture-required` the context unlocks.
- The title screen makes its AudioContext on the first click or key. The recorder starts the audio
  as soon as a context connects (on the same clock), so a clip that opens on the title is silent
  until that first gesture.
- Use `headless: true` with `channel: 'chrome'` and `--enable-unsafe-webgpu` (from
  `tools/lib/browser.mjs`). DPR 1 and a viewport the size of the video keep the screencast frames
  full size.
- Don't walk across unknown ground: a ledge or a wall stops `walkTo` (it gives up after 2.5 s
  without progress and logs it). Start the clip close to the action, on the same level (see the
  sluice scenario, which approaches Suri from the mill's top), and use waypoints round people and
  posts. Check prompt text before pressing E: two interactions close together (an NPC and a lever)
  compete for focus.
- The camera needs room behind the captain at the first frame, or the clip opens on the inside of
  the hat. `approachSpot` checks this.
- Dialogue lines advance on their own; pressing E skips a line. Only press E on cards and quizzes.
- Long sails: jump the ship (`debug.sailTo`) inside `cut()` to open water, then sail the last
  stretch for real. Steering straight at a target from a berth runs her into the mole.
- Don't run two recordings (or a probe) at once: they share the GPU and the frame rate drops.
- Don't use `/tmp` for work files; everything goes under `<out>/.work/`.
