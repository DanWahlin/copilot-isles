// Port Meridian fly-by (a closing shot for the highlight reel): a high arc from over the bay round
// the walled town, the harbour, the mole and its lighthouse, with the citadel on its bluff. A camera
// move only (no play), late-afternoon light.
import { flyby, meridianAshore } from '../game.mjs';

/** Points on an arc round (cx, cz): radius r, angles a (radians, 0 = +z), heights y. */
const arc = (cx, cz, r, steps, look) =>
  steps.map(([a, y]) => ({ x: cx + Math.sin(a) * r, y, z: cz + Math.cos(a) * r, ...look }));

export default flyby({
  id: 'flyby-meridian',
  order: 21,
  code: 'Fly-by',
  title: 'Port Meridian',
  island: 'Port Meridian',
  who: 'a high arc over the walled town and harbour',
  subtitle: 'The second island: Chapter 01, Tour the App.',
  chapter: 'Course Chapter 01 · Tour the App',
  flags: ['meridian'],
  time: 17,
  seconds: 12,
  ashore: meridianAshore,
  keys: arc(
    700,
    -740,
    200,
    [
      [-1.05, 98],
      [-0.55, 92],
      [-0.05, 86],
      [0.45, 80],
    ],
    { tx: 712, ty: 14, tz: -752 },
  ),
});
