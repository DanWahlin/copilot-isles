// The Copilot Isles highlight reel, v9 (1080p, about three and three-quarter minutes): the whole
// opening as one take, from the title screen (music from the first second) to the first steps on
// Anchorage Cay (Juno's full welcome in the cabin, the game's own parchment arrival card), then
// "Learn as You Play" ending on Rook's Practice Bough (his line on starting a session from a branch,
// and his session terminal magnified), then one highlight per puzzle or battle (the moves, one mistake
// and its feedback where there is one, the solve; the Three Helms with each mode's terminal
// magnified; the sea battle with the bosun's question answered right), a ~10 s fly-by of each island,
// and an end card. Inside a section, short crossfades skip dead time; the other joins fade through
// black. Each section is levelled to about -19 LUFS (the fly-bys -20) with one gain.
// Times are seconds into a take, or { mark, at } (a mark's label prefix plus an offset); the takes'
// marks are listed in <out>/.work/takes/<id>/take.json. Earlier cuts: `highlights-v1` … `-v8` (v9
// films the reworked Sluice & Waterwheel and Three Helms again: takes `sluice-wide` and `helms-reel`).
//   node tools/video/reel.mjs --reel=highlights --out=<dir> --base=http://127.0.0.1:5395
import fs from 'node:fs';

/**
 * The game's chart labels (content/labels.json, docs/specs/LOWER-THIRDS.md §10): the puzzle and
 * battle cards read their text from there, so the reel and the game can't drift. Only the text keys
 * are taken (the file's `game` and `source` fields are for the game).
 */
const { labels } = JSON.parse(
  fs.readFileSync(new URL('../../../content/labels.json', import.meta.url), 'utf8'),
);
const label = (id) => {
  const l = labels[id];
  if (!l) throw new Error(`content/labels.json has no "${id}"`);
  const { k, t, b, ch, c, chLine } = l;
  return { k, t, b, ch, c, ...(chLine ? { chLine } : {}) };
};

export default {
  id: 'highlights',
  version: 'v9',
  title: 'Copilot Isles · Highlights',
  lead: 'A highlight reel recorded live from the game (WebGPU, High tier, 1080p) with its own sound.',
  output: 'highlights-1080p-v9.mp4',
  size: '1920x1080',
  tier: 'high',
  jpeg: 100,
  quality: 'master',
  /** Each join: this long to black and silence, and this long back. */
  fade: 0.45,
  openFade: 0.6,
  closeFade: 1.6,
  /** Each section's integrated loudness (LUFS) and the true-peak ceiling (dBTP). */
  loudness: -19,
  truePeak: -1,
  /** The page's poster frame (seconds into the reel): the gull on the wordmark. */
  posterAt: 8,
  maxHighlight: 30,
  maxTotal: 240,
  alsoShow: [{ reel: 'highlights-v8', label: 'v8', note: 'the previous cut (3:36)' }],
  segments: [
    {
      id: 'opening',
      label: 'Title screen, Chart, New Voyage, Juno’s whole cabin scene, and the fly-in to Anchorage Cay',
      highlight: false,
      parts: [
        // One continuous take: the title (the mouse drags the ship at once, so the music starts
        // within a second; the gull flies in), the Chart (Anchorage Cay, then Thousand-Bough
        // pointed at), New Voyage and the name, Set sail, all of Juno's welcome, the chest, the chart
        // and the dive, and the fly-in with the game's parchment arrival card, until the captain
        // stands on the quay (Wingman's first word comes ~0.4 s later).
        { take: 'opening', in: { mark: 'title', at: 0.1 }, out: { mark: 'ashore', at: 0.3 } },
      ],
    },
    {
      id: 'learn',
      label:
        'Learn as you play: a hotspot quiz, a Logbook page, and Rook on starting a session from a branch',
      highlight: false,
      xfade: 0.4,
      parts: [
        // H0.2 on the course's screenshot of the app: read, the right spot clicked, marked correct.
        { take: 'learn', in: { mark: 'quiz H0.2', at: 0.6 }, out: { mark: 'quiz H0.2 clicked', at: 2.0 } },
        // The "Add your fork" Logbook page, then "Stow it in the Logbook" clicked.
        { take: 'learn', in: { mark: 'reveal C0.4', at: 0.9 }, out: { mark: 'reveal C0.4 stow', at: 1.2 } },
        // Rook's two lines (voiced, captioned), whole: "This bough's a branch…", then "Point to the
        // project, select Create from, open Branches and pick our branch. New worktree, every
        // time." The treehouse sign shows your branch and the session terminal is up. In just before
        // you press E (the quiet before his first line), out before his third line starts.
        { take: 'rook-talk', in: { mark: 'talk', at: -0.45 }, out: { mark: 'line 3', at: -0.15 } },
      ],
      // The session terminal, magnified, after the lower third has gone (one of our overlays at a
      // time): Create from › Branches, New worktree, your branch and issue.
      closeups: [
        {
          label: 'Rook’s session terminal',
          part: 2,
          at: { mark: 'line 2', at: 1.1 },
          dur: 3.5,
          crop: { x: 1400, y: 64, w: 504, h: 128 },
          y: 40,
        },
      ],
      lowerThird: {
        k: 'Thousand-Bough Isle · The Practice Bough',
        t: 'Start a session from a branch',
        b: 'Pick your branch under Create from, and every session gets its own new worktree.',
        ch: '02',
        // The course's section (src/learn/content/ch02.ts `exStart`, content/course.lock.json).
        c: 'Exercise: Start a Session from a Branch and Attach an Issue',
        // Over the Rook part only, clear of the quiz and the Logbook page.
        part: 2,
        at: 0.6,
        tail: 0.5,
      },
    },
    {
      id: 'sluice',
      // After Suri's "Gate's up, so your workflows are on!" (its caption sits where the card goes),
      // gone before her line at the check gate.
      lowerThird: { ...label('puzzle:P0.1'), at: 4.1 },
      label:
        'Sluice & Waterwheel: the lever (workflows on), a channel turned too far and back, the tee feeds the wheel and the check gate',
      xfade: 0.4,
      parts: [
        // One wide shot of the terrace (lever, tiles, check gate, tee and wheel in the upper part of
        // the frame): the captain pulls the lever, and Suri: "Gate's up, so your workflows are on!"
        { take: 'sluice-wide', in: { mark: 'lever', at: -1.2 }, out: { mark: 'lever', at: 2.7 } },
        // The first channel turned one step too far (the water stops short), then back (Shift+E).
        { take: 'sluice-wide', in: { mark: 'too far', at: -0.2 }, out: { mark: 'back', at: 1.55 } },
        // The last channel turned: the tee splits the water to the wheel and to the jammed check gate,
        // and Suri on the gate that fails on purpose.
        { take: 'sluice-wide', in: { mark: 'tile 11', at: -0.4 }, out: { mark: 'solved', at: 3.85 } },
      ],
    },
    {
      id: 'battle',
      lowerThird: { ...label('battle:passage-anchorage-meridian') },
      label:
        'Raiders on the Passage: brought round, broadsides, hits, a raider strikes, the bosun’s question',
      xfade: 0.4,
      parts: [
        // Past the fog bank: the raider closes, broadsides both ways, a hit each way, and she strikes.
        {
          take: 'battle1-review',
          in: { mark: 'caption: The helmsman brings her round', at: 8.3 },
          out: { mark: 'caption: Unchecked strikes', at: 0.85 },
        },
        // Between the waves: the bosun's question, answered right with the mouse, and the reward.
        { take: 'battle1-review', in: { mark: 'question 1', at: -0.3 }, out: { mark: 'answer 1', at: 2.8 } },
      ],
    },
    {
      id: 'helms',
      label:
        'The Three Helms: you choose the heading, Autopilot stops short of the reef, the plan is reviewed and fixed, Autopilot takes her home',
      xfade: 0.4,
      // Take `helms-reel` (the helms scenario with the game's own cards already shown). Times are
      // seconds into the take: its marks repeat (each order's card comes back after a balk or a
      // review), so plain times are clearer. 94–107 s has stalls; none of the parts use it.
      parts: [
        // Interactive: "To mark 1. Which way, Captain?" A heading picked, and she turns for the mark.
        { take: 'helms-reel', in: 74.2, out: 79.5 },
        // The reef passage order card: Autopilot picked, and she sets sail for the reef ...
        { take: 'helms-reel', in: 174.2, out: 179.0 },
        // ... and stops short: "Hold fast! This passage is one where the approach matters." The card
        // greys Autopilot out ("Chart it first.").
        { take: 'helms-reel', in: 192.0, out: 196.6 },
        // Plan picked: the review card with the app's three options, and Rhea's charted route.
        { take: 'helms-reel', in: 200.9, out: 206.9 },
        // "Suggest changes to the plan": "Good catch, I'll chart her round the Shoal."
        { take: 'helms-reel', in: 212.5, out: 217.8 },
        // The last order, in Autopilot: along the east arm to her berth with no stops ("✓ Moored").
        { take: 'helms-reel', in: 328.4, out: 333.6 },
      ],
      // Each mode's session terminal, magnified (top left, clear of the ship), after the lower third.
      closeups: [
        {
          label: 'Plan: the charted plan, straight across the Shoal',
          part: 3,
          at: 2.0,
          dur: 3.0,
          crop: { x: 1400, y: 64, w: 504, h: 152 },
          x: 80,
          y: 90,
        },
        {
          label: 'Plan (revised): keep her clear of the Shoal',
          part: 4,
          at: 1.4,
          dur: 3.2,
          crop: { x: 1400, y: 64, w: 504, h: 196 },
          x: 80,
          y: 90,
        },
        {
          label: 'Autopilot: no check-ins, moored',
          part: 5,
          at: 1.5,
          dur: 3.1,
          crop: { x: 1400, y: 64, w: 504, h: 110 },
          x: 80,
          y: 90,
        },
      ],
      // Over the Interactive and reef parts (no captions there), gone before Rhea's "Hold fast!".
      lowerThird: { ...label('puzzle:P1.2'), at: 0.6 },
    },
    {
      id: 'channels',
      // What you learn here and why (tools/video/lower-third.html), from content/labels.json.
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
      loudness: -20,
      // Over the first two fly-bys (steady through their crossfade), gone 1.5 s before Thousand-Bough.
      lowerThird: {
        k: 'The Copilot Isles · Early preview',
        t: 'Three islands charted, more on the way',
        // The island names and the next one (Keelhaven, Chapter 03) as the Chart and the game say them
        // (src/ui/chart/archipelago.ts, the Thousand-Bough quests' closing line).
        b: 'Anchorage Cay, Port Meridian and Thousand-Bough Isle cover Chapters 00–02. Keelhaven and the rest of the chart are next.',
        ch: '00–02',
        c: '',
        chLine: 'Course Chapters 00–02',
        at: 1,
        until: { segment: 'flyby-thousandbough', before: 1.5 },
      },
      label: 'Fly-by: Anchorage Cay, low over the water past the wreck and the lighthouse',
      highlight: false,
      parts: [{ take: 'flyby-anchorage', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: -0.2 } }],
    },
    {
      id: 'flyby-meridian',
      loudness: -20,
      label: 'Fly-by: Port Meridian, a high arc over the walled town and harbour',
      highlight: false,
      crossfadeIn: 0.9,
      parts: [{ take: 'flyby-meridian', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: -0.2 } }],
    },
    {
      id: 'flyby-thousandbough',
      label: 'Fly-by: Thousand-Bough Isle, up past the waterfalls to the banyan canopy, and the end card',
      highlight: false,
      loudness: -20,
      crossfadeIn: 0.9,
      parts: [
        // The flight, then its last view held: the end card unrolls over it as it softens.
        { take: 'flyby-thousandbough', in: { mark: 'fly', at: 1.0 }, out: { mark: 'landed', at: 6.4 } },
      ],
      lowerThird: {
        layout: 'end',
        k: 'Early preview',
        t: 'Copilot Isles',
        // The title screen's tagline (src/ui/screens/TitleScreen.tsx).
        tag: 'Learn the GitHub Copilot app, one island at a time',
        b: 'Quizzes use real app screenshots, Logbook pages quote the course, and sessions use your own branch and issue.',
        credit: 'Based on the GitHub Copilot app for Beginners course',
        at: { mark: 'landed', at: 0.3 },
        out: false,
        dim: { blur: 14, darken: 0.14, ramp: 1 },
        duck: 4,
      },
    },
  ],
};
