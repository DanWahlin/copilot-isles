// Anchorage Cay fly-by (a closing shot for the highlight reel): a low pass over the water from the
// open sea, past the wreck on her sand bar and the point lighthouse, and on toward the harbour, the
// ship at her mooring, and the village. A camera move only (no play), afternoon light.
import { flyby } from '../game.mjs';

export default flyby({
  id: 'flyby-anchorage',
  order: 20,
  code: 'Fly-by',
  title: 'Anchorage Cay',
  island: 'Anchorage Cay',
  who: 'low over the water, past the wreck and the lighthouse',
  subtitle: 'The first island: Chapter 00, Setup.',
  chapter: 'Course Chapter 00 · Setup',
  flags: [],
  time: 16,
  seconds: 12,
  keys: [
    { x: -228, y: 3.2, z: -196, tx: -152, ty: 3, tz: -124 },
    { x: -190, y: 4, z: -158, tx: -158, ty: 7, tz: -104 },
    { x: -156, y: 5.5, z: -146, tx: -118, ty: 5, tz: -96 },
    { x: -128, y: 8, z: -142, tx: -110, ty: 6, tz: -62 },
  ],
});
