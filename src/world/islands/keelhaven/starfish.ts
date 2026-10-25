import type { StarfishSpot } from '../../starfish/spots';
import { toWorld } from './layout';

/**
 * Keelhaven's five starfish (spec §3.12, moved to the as-built town and works): by the quay's steps,
 * on the beach's tide line, at Drydock 3's head, on the lock terrace, and at the Gate Light's door.
 * `y` picks the level where walk surfaces stack.
 */
const SPOTS = [
  { id: 'sf.k.quay', name: 'Under the quay steps', u: 12, v: 66.5 },
  { id: 'sf.k.beach', name: "In the beach's tide line", u: -6, v: 24 },
  { id: 'sf.k.dock', name: "By Drydock 3's head", u: 169, v: -45 },
  { id: 'sf.k.lock', name: 'On the lock terrace by the lower gate', u: 14, v: -47 },
  { id: 'sf.k.light', name: "At the Gate Light's door", u: -223, v: -151, y: 44 },
] as const;

export const KEELHAVEN_STARFISH: readonly StarfishSpot[] = SPOTS.map((s) => ({
  id: s.id,
  island: 'keelhaven',
  name: s.name,
  ...toWorld(s.u, s.v),
  ...('y' in s ? { y: s.y } : {}),
}));
