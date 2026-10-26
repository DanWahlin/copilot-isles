// v6 of the Kraken Isles highlight reel (kept for comparison; `highlights` is the current cut).
// 1080p, about three and a half minutes: the whole opening as
// one take, from the title screen to the first steps on Anchorage Cay (Juno's full welcome in the
// cabin), then "Learn as you play", then one highlight per puzzle or battle (15–20 s each, showing the
// play: the moves, one mistake and its feedback, the solve and a beat of the success), and to close,
// a ~10 s fly-by of each island so far, crossfading one into the next. Inside a highlight, short
// crossfades skip dead time; every other join between sections fades through black.
// Times are seconds into a take, or { mark, at } (a mark's label prefix plus an offset); the takes'
// marks are listed in <out>/.work/takes/<id>/take.json. Earlier cuts: `highlights-v1` … `-v5`
// (v5 added a parchment lower third on each learning section; v6 moves the Learn as You Play card
// onto a longer Rook terminal part, clear of the quiz and the Logbook page).
//   node tools/video/reel.mjs --reel=highlights-v6 --out=<dir> --refinish
import fs from 'node:fs';

/**
 * The game's chart labels (courses/copilot-app/labels.json, docs/specs/LOWER-THIRDS.md §10): the puzzle and
 * battle cards read their text from there, so the reel and the game can't drift. Only the text keys
 * are taken (the file's `game` and `source` fields are for the game).
 */
const { labels } = JSON.parse(
  fs.readFileSync(new URL('../../../courses/copilot-app/labels.json', import.meta.url), 'utf8'),
);
const label = (id) => {
  const l = labels[id];
  if (!l) throw new Error(`courses/copilot-app/labels.json has no "${id}"`);
  const { k, t, b, ch, c, chLine } = l;
  return { k, t, b, ch, c, ...(chLine ? { chLine } : {}) };
};

export default {
  id: 'highlights-v6',
  version: 'v6',
  /** Its own page, so rebuilding v6 doesn't replace the current reel's index.html. */
  index: 'index-v6.html',
  title: 'Kraken Isles · Highlights',
  lead: 'A highlight reel recorded live from the game (WebGPU, High tier, 1080p) with its own sound.',
  output: 'highlights-1080p-v6.mp4',
  size: '1920x1080',
  tier: 'high',
  jpeg: 100,
  quality: 'master',
  /** Each join: this long to black and silence, and this long back. */
  fade: 0.45,
  openFade: 0.6,
  closeFade: 1.2,
  /** The page's poster frame (seconds into the reel): the gull on the wordmark. */
  posterAt: 8,
  maxHighlight: 20,
  maxTotal: 225,
  segments: [
    {
      id: 'opening',
      label: 'Title screen, Chart, New Voyage, Juno’s whole cabin scene, and the fly-in to Anchorage Cay',
      highlight: false,
      parts: [
        // One continuous take: the title (the gull flies in while the mouse drags the ship, which
        // starts the music), the Chart, New Voyage and the name, Set sail, all of Juno's welcome,
        // the chest, the chart and the dive, and the fly-in until the captain stands on the quay
        // (Wingman's first word comes ~0.4 s later).
        { take: 'opening-v4', in: { mark: 'title', at: 0.1 }, out: { mark: 'ashore', at: 0.3 } },
      ],
      // Juno's rewritten line 02, checked on the review sheet: early, middle and its last words.
      checkFrames: [
        { label: 'Juno 02 start', at: { mark: 'juno 2', at: 0.6 } },
        { label: 'Juno 02 middle', at: { mark: 'juno 2', at: 4.0 } },
        { label: 'Juno 02 end', at: { mark: 'juno 2', at: 7.2 } },
      ],
    },
    {
      id: 'learn',
      // What you learn here and why (tools/video/lower-third.html).
      lowerThird: {
        // The whole section: the Ch00 quiz and Logbook page, then the Ch02 session terminal.
        k: 'Learn as You Play',
        t: 'Learn the real Copilot app',
        b: 'Quizzes use real app screenshots, Logbook pages quote the course, and sessions use your own branch and issue.',
        ch: '00–02',
        c: '',
        chLine: 'Course Chapters 00–02',
        // Over the Rook terminal part only (the third part), clear of the quiz and the Logbook page:
        // in 0.9 s after that part starts, gone at least 0.5 s before the section fades out.
        part: 2,
        at: 0.9,
        tail: 0.5,
      },
      label: 'Learn as you play: a hotspot quiz, a Logbook page, and your session terminal',
      highlight: false,
      xfade: 0.4,
      parts: [
        // H0.2 on the course's screenshot of the app: read, the right spot clicked, marked correct.
        { take: 'learn', in: { mark: 'quiz H0.2', at: 0.6 }, out: { mark: 'quiz H0.2 clicked', at: 2.0 } },
        // The "Add your fork" Logbook page, then "Stow it in the Logbook" clicked.
        { take: 'learn', in: { mark: 'reveal C0.4', at: 0.9 }, out: { mark: 'reveal C0.4 stow', at: 1.2 } },
        // Walking up to Rook: the session terminal with Your setup's branch and issue, and Rook; long
        // enough for the lower third's full hold (to just before the take's sound ends).
        { take: 'rook-terminal', in: { mark: 'terminal', at: -3.77 }, out: { mark: 'terminal', at: 6.33 } },
      ],
    },
    {
      id: 'sluice',
      // What you learn here and why (tools/video/lower-third.html), from courses/copilot-app/labels.json.
      lowerThird: {
        ...label('puzzle:P0.1'),
      },
      label: 'Sluice & Waterwheel: the lever, a channel turned too far and back, the wheel turns',
      xfade: 0.4,
      parts: [
        // The lever under the "Workflows aren't being run" sign: the water's let in.
        { take: 'sluice', in: { mark: 'lever', at: -0.4 }, out: { mark: 'lever', at: 4.0 } },
        // The first channel turned one step too far (the water stops short), then back round.
        { take: 'sluice', in: { mark: 'too far', at: 0.1 }, out: { mark: 'too far', at: 8.1 } },
        // The last channel turned: the water runs down to the wheel and it starts to turn.
        { take: 'sluice-wheel', in: { mark: 'turn', at: -1.5 }, out: { mark: 'turn', at: 5.4 } },
      ],
    },
    {
      id: 'wreck',
      label: 'The Wreck off the Point: round the lighthouse and along her',
      // One slow move: round the point, the wreck coming out from behind it, along her on the
      // open-sea side, and a look back as she drops astern.
      parts: [{ take: 'shipwreck', in: { mark: 'round the point', at: 0.7 }, out: 20.3 }],
    },
    {
      id: 'battle',
      // What you learn here and why (tools/video/lower-third.html), from courses/copilot-app/labels.json.
      lowerThird: {
        ...label('battle:passage-anchorage-meridian'),
      },
      label: 'Raiders on the Passage: brought round, broadsides, hits, a raider strikes',
      xfade: 0.4,
      parts: [
        // Wave 1 out of the fog: run out the guns, and the helmsman brings her round.
        {
          take: 'battle1',
          in: { mark: 'caption: Sails in the fog', at: 1.9 },
          out: { mark: 'caption: Sails in the fog', at: 7.4 },
        },
        // The raider closes, broadsides both ways, a hit each way, and she strikes her colours.
        {
          take: 'battle1',
          in: { mark: 'fire', at: -3.6 },
          out: { mark: 'caption: Unchecked strikes', at: 0.75 },
        },
      ],
    },
    {
      id: 'helms',
      // What you learn here and why (tools/video/lower-third.html), from courses/copilot-app/labels.json.
      lowerThird: {
        ...label('puzzle:P1.2'),
        // Three frames of the unroll on the review sheet (a bright scene shows the curl best).
        showUnroll: true,
      },
      label: 'The Three Helms: Interactive holds, Plan waits for approval, Autopilot takes her home',
      xfade: 0.4,
      parts: [
        // Interactive: she heaves to at the mark and Rhea asks; "Sail the next leg" (E).
        {
          take: 'helms',
          in: { mark: 'interactive-hold-0', at: -0.3 },
          out: { mark: 'interactive-leg-1', at: 0.6 },
        },
        // Plan: the charted plan in the terminal, "Approve the plan" (E), and Rhea's line.
        { take: 'helms', in: { mark: 'plan-review-0', at: 2.8 }, out: { mark: 'plan-sailing-0', at: -1.7 } },
        // Autopilot: past the lighthouse and alongside the east-arm berth with no stops.
        {
          take: 'helms',
          in: { mark: 'autopilot-docking', at: -8.25 },
          out: { mark: 'autopilot-docking', at: -1.25 },
        },
      ],
    },
    {
      id: 'channels',
      // What you learn here and why (tools/video/lower-third.html), from courses/copilot-app/labels.json.
      lowerThird: {
        ...label('puzzle:P2.1'),
      },
      label: 'Channel Routing: a gate turned, the colours mix, re-routed, every crew runs clean',
      xfade: 0.4,
      parts: [
        // Feature's elbow turned back (E), the gates opened (F): Feature's water runs into Bug
        // Fix's channel and they mix; Fen says why.
        {
          take: 'channels-mix',
          in: { mark: 'round 2 run unrouted', at: -1.5 },
          out: { mark: 'round 2 mixed', at: 6.15 },
        },
        // Re-routing the gates with the arrow keys and E.
        {
          take: 'channels-mix',
          in: { mark: 'round 2 run routed', at: -6.5 },
          out: { mark: 'round 2 run routed', at: -4.0 },
        },
        // The gates opened again: each crew's water runs down its own channel to its own wheel.
        {
          take: 'channels-mix',
          in: { mark: 'round 2 run routed', at: -0.3 },
          out: { mark: 'round 2 done', at: 0.1 },
        },
      ],
    },
    // The closing fly-bys: one slow camera move per island, in the order a player meets them, each
    // crossfading into the next; the last fades to black. Camera moves only (tools/video/game.mjs
    // `flyby`): the UI is hidden and each flight is flown once off camera first, so nothing loads.
    {
      id: 'flyby-anchorage',
      label: 'Fly-by: Anchorage Cay, low over the water past the wreck and the lighthouse',
      highlight: false,
      parts: [{ take: 'flyby-anchorage', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: -0.2 } }],
    },
    {
      id: 'flyby-meridian',
      label: 'Fly-by: Port Meridian, a high arc over the walled town and harbour',
      highlight: false,
      crossfadeIn: 0.9,
      parts: [{ take: 'flyby-meridian', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: -0.2 } }],
    },
    {
      id: 'flyby-thousandbough',
      label: 'Fly-by: Thousand-Bough Isle, up past the waterfalls to the banyan canopy',
      highlight: false,
      crossfadeIn: 0.9,
      fadeOut: 1.6,
      parts: [
        { take: 'flyby-thousandbough-v6', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: 0.3 } },
      ],
    },
  ],
};
