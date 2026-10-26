// v1 of the Kraken Isles highlight reel (kept for comparison; `highlights` is the current cut).
// 1080p, under two minutes: the opening as one take from the
// title screen to the first steps on Anchorage Cay (Juno's welcome trimmed to its first and last
// lines), then one highlight per scenario (each 10 s or less), every join a fade through black.
// Times are seconds into a take, or { mark, at } (a mark's label prefix plus an offset); the takes'
// marks are listed in <out>/.work/takes/<id>/take.json.
//   node tools/video/reel.mjs --reel=highlights-v1 --out=<dir> --refinish
export default {
  id: 'highlights-v1',
  version: 'v1',
  /** Its own page, so rebuilding v1 doesn't replace the current reel's index.html. */
  index: 'index-v1.html',
  title: 'Kraken Isles · Highlights',
  lead: 'A highlight reel recorded live from the game (WebGPU, High tier, 1080p) with its own sound.',
  output: 'highlights-1080p.mp4',
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
  maxHighlight: 10,
  maxTotal: 120,
  segments: [
    {
      id: 'opening',
      label: 'Title screen, Chart, New Voyage, the cabin, and the fly-in to Anchorage Cay',
      highlight: false,
      xfade: 0.15,
      parts: [
        // The title (the gull flies in while the mouse drags the ship), the Chart, New Voyage and
        // the name, Set sail, and Juno's first line.
        // Lines 2 and 3 are cut in the quiet between lines (the voice starts ~0.15 s after its caption).
        { take: 'opening-v1', in: { mark: 'title', at: 0.1 }, out: { mark: 'juno 2', at: -0.05 } },
        // Juno's last line, the chest line, the chest, the chart and the dive, and the fly-in, until
        // the captain stands on the quay (Wingman's first word comes ~0.4 s later). Line 3's caption
        // holds until line 4's shows, so this part starts as line 4's caption shows (its voice
        // follows ~0.07 s later, inside the short crossfade).
        { take: 'opening-v1', in: { mark: 'juno 4', at: 0.03 }, out: { mark: 'ashore', at: 0.3 } },
      ],
    },
    {
      id: 'learn',
      label: 'Learn as you play: a hotspot quiz, a Logbook page, and your session terminal',
      highlight: false,
      xfade: 0.4,
      parts: [
        // H0.2 on the course's screenshot of the app: the right spot clicked and marked correct.
        { take: 'learn', in: { mark: 'quiz H0.2', at: 1.4 }, out: { mark: 'quiz H0.2 clicked', at: 1.8 } },
        // The "Add your fork" Logbook page, then "Stow it in the Logbook" clicked.
        { take: 'learn', in: { mark: 'reveal C0.4', at: 0.9 }, out: { mark: 'reveal C0.4 stow', at: 1.2 } },
        // Walking up to Rook: the session terminal with Your setup's branch and issue.
        { take: 'rook-terminal', in: { mark: 'terminal', at: -2.4 }, out: { mark: 'terminal', at: 1.2 } },
      ],
    },
    {
      id: 'sluice',
      label: 'Sluice & Waterwheel: the wheel starts turning',
      // The last channel turned with E; the water runs down to the wheel and it starts to turn.
      parts: [{ take: 'sluice-wheel', in: { mark: 'turn', at: -1.5 }, out: { mark: 'turn', at: 5.4 } }],
    },
    {
      id: 'wreck',
      label: 'The Wreck off the Point',
      // Round the point and along her on the open-sea side, before the camera swings astern.
      parts: [
        { take: 'shipwreck', in: { mark: 'approach', at: -1.2 }, out: { mark: 'look back', at: -0.4 } },
      ],
    },
    {
      id: 'battle',
      label: 'Raiders on the Passage: broadsides and a hit',
      // The first broadsides of wave 1, a hit each way, and the raider striking her colours.
      parts: [
        {
          take: 'battle1',
          in: { mark: 'fire', at: -0.3 },
          out: { mark: 'caption: Unchecked strikes', at: 0.45 },
        },
      ],
    },
    {
      id: 'helms',
      label: 'The Three Helms: Autopilot takes her home and moors',
      // The Autopilot helm brings her past the lighthouse and alongside the east-arm berth with no
      // stops (the solve), before the game fades to the captain ashore.
      parts: [
        {
          take: 'helms',
          in: { mark: 'autopilot-docking', at: -9.75 },
          out: { mark: 'autopilot-docking', at: -1.25 },
        },
      ],
    },
    {
      id: 'channels',
      label: 'Channel Routing: the colours mix, then route clean',
      // Round 2 run with Feature's elbow turned back (its water runs into Bug Fix's channel), then
      // routed and run clean, with the falls behind the Flume Gallery. The last shot: fade to black.
      parts: [
        // Feature's and Bug Fix's water meet and mix (cut as Fen starts to speak).
        {
          take: 'channels-mix',
          in: { mark: 'round 2 run unrouted', at: 0.9 },
          out: { mark: 'round 2 mixed', at: 0.05 },
        },
        // Routed: each crew's water runs down its own channel to its own wheel.
        {
          take: 'channels-mix',
          in: { mark: 'round 2 run routed', at: 0.5 },
          out: { mark: 'round 2 done', at: 0.1 },
        },
      ],
    },
  ],
};
