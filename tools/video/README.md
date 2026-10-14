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
```

| Flag                      | Default                  | What it does                                                                 |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `--scenario=<id>[,<id>…]` | (required)               | Scenarios to film, in order. An unknown id prints the list.                  |
| `--list`                  |                          | Prints the scenarios and their titles.                                       |
| `--base=<url>`            | `http://127.0.0.1:5395`  | The dev server.                                                              |
| `--tier=<tier>`           | `high`                   | Render tier (`lite`, `low`, `medium`, `high`, `ultra`).                      |
| `--out=<dir>`             | `~/Movies/copilot-isles` | Where the videos go. Don't put them in the repo.                             |
| `--no-audio`              |                          | Video only (silent track).                                                   |
| `--no-title`              |                          | No title card.                                                               |
| `--keep`                  |                          | Keeps `<out>/.work/<id>/` (raw clip, PCM audio, `take.json`, title PNG).     |
| `--refinish`              |                          | Rebuilds the MP4, sheet and index from a `--keep` run without filming again. |

Output per scenario: `<id>.mp4` (1280×720, 30 fps H.264 yuv420p, AAC 160k, `+faststart`),
`<id>.png` (six frames in a 3×2 sheet), `<id>.jpg` (poster), `<id>.json` (titles, duration, marks,
notes), and the shared `index.html`.

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
  titleFrame: 2, // seconds into the clip for the title card's blurred background
  async setup(page, api) {}, // off camera: quests, teleports, skipping ahead
  async play(page, api) {}, // filmed: everything the player does, by real input
};
```

`record.mjs` opens `devpages/play.html?shot&quiet&time=16&tier=…`, presses **Set sail** (so the
AudioContext unlocks as it does for a player), runs `setup`, starts recording, runs `play`, and
stops. `this` in both is the scenario object, so `setup` can pass spots to `play`.

What `api` gives you (`lib.mjs`, `makeApi`):

- Input: `press(code, ms)`, `hold(codes, ms)`, `click(selector)` (moves the mouse there first),
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
  `mark(label)` (written to `<id>.json`), `log(msg)`.
- Setup only: `teleport(x, z, heading, y)`, `look(yaw, pitch)`, `skipTalk(page)` (from `lib.mjs`),
  and the island helpers in `game.mjs` (`meridianAshore`, `thousandBoughAshore`, `questsDone`, `tb`).

Pacing that reads well on video: a beat (0.5–1 s) before each press, 2.5–5 s to read a card,
question or terminal before acting, one realistic mistake so the feedback shows, then the solve,
and 2–3 s on the success at the end. Aim for 1–3 minutes; trim sailing and long fights with
`cutWhile`.

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
- **Post.** The title card is an HTML page screenshotted at 1280×720 over a blurred frame of the
  clip. One ffmpeg pass trims the cuts, fades each join, prepends the title, and muxes.

## Pitfalls

- `?auto` on the play page starts **without audio** (`begin(false)`). Press the page's own start
  button instead; with `--autoplay-policy=no-user-gesture-required` the context unlocks.
- Use `headless: true` with `channel: 'chrome'` and `--enable-unsafe-webgpu` (from
  `tools/lib/browser.mjs`). DPR 1 and a 1280×720 viewport keep the screencast frames full size.
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
