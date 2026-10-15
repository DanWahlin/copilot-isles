// Thousand-Bough Isle fly-by (a closing shot for the highlight reel): up from the mirror pool past
// Great Falls, round past the Veil, then rising over the great banyan's canopy. A camera move only (no
// play), golden-hour light.
import { flyby, thousandBoughAshore } from '../game.mjs';

export default flyby({
  id: 'flyby-thousandbough',
  order: 22,
  code: 'Fly-by',
  title: 'Thousand-Bough Isle',
  island: 'Thousand-Bough Isle',
  who: 'rising past the waterfalls to the banyan canopy',
  subtitle: 'The third island: Chapter 02, Sessions, Worktrees & Context.',
  chapter: 'Course Chapter 02 · Sessions, Worktrees & Context',
  flags: ['thousandbough'],
  time: 17.6,
  seconds: 12,
  // The last view holds 8 s: the reel's end card unrolls over it.
  holdAfter: 8,
  ashore: thousandBoughAshore,
  // The look turns from Great Falls through the Veil and the flume shelf to the banyan, always on
  // far targets so the view never swings across the camera.
  keys: [
    { x: 2104, y: 18, z: -1570, tx: 2145, ty: 38, tz: -1640 },
    { x: 2100, y: 42, z: -1578, tx: 2120, ty: 50, tz: -1680 },
    { x: 2094, y: 72, z: -1584, tx: 2020, ty: 55, tz: -1690 },
    { x: 2084, y: 100, z: -1582, tx: 2010, ty: 76, tz: -1560 },
  ],
});
