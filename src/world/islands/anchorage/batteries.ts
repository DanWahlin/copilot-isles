import { COVE } from '../../layout';
import type { ShoreBattery } from '../../village/shore-battery';

/**
 * Anchorage Cay's shore battery (Dan: cannons at strategic spots, as in the pirate days). Two guns
 * on the harbour shoulder of the lighthouse ridge, aimed north across the basin at its mouth, so
 * any ship coming in sails under the point's guns; the old wreck on the knoll's shoal lies in their
 * field of fire. Each gun stands on its own planked platform, built level on a masonry revetment
 * where the ridge falls to the water, behind a log-rail fence, with round shot, a rammer and a
 * powder chest.
 *
 * Places are in the ridge path's frame: `a` metres from the lighthouse along the path toward the
 * quay, `c` metres off it toward the harbour (the path's walk strip is 0.8 m either side).
 */
const L = COVE.lighthouse;
const PATH_LEN = Math.hypot(L.neck.x - L.x, L.neck.z - L.z);
const D = { x: (L.neck.x - L.x) / PATH_LEN, z: (L.neck.z - L.z) / PATH_LEN };
/** Off the path toward the harbour (its right-hand side walking down to the quay). */
const N = { x: D.z, z: -D.x };

function ridge(a: number, c: number): { x: number; z: number } {
  return { x: L.x + D.x * a + N.x * c, z: L.z + D.z * a + N.z * c };
}

/** The platforms face the harbour square to the ridge. */
const DECK_HEADING = Math.atan2(N.x, N.z);
/** The guns are trained on the harbour mouth, north-north-east across the basin. */
const GUN_HEADING = 2.9;

const deck = (a: number, top: number) => ({
  ...ridge(a, 3.0),
  heading: DECK_HEADING,
  width: 3.6,
  depth: 3.4,
  top,
  kind: 'stone' as const,
});

export const ANCHORAGE_BATTERIES: readonly ShoreBattery[] = [
  {
    id: 'point-battery',
    guns: [
      { ...ridge(12.6, 2.95), heading: GUN_HEADING },
      { ...ridge(16.6, 2.95), heading: GUN_HEADING },
    ],
    // One terrace in two steps down the ridge (an easy step between them). Each just tops the
    // ridge's highest ground under it (its up-ridge back corner).
    decks: [deck(12.4, 4.1), deck(15.9, 3.68)],
    fences: [
      // Along the harbour edge (the guns fire past its ends) and down the low end, where the
      // revetment drops away.
      [ridge(12.15, 4.55), ridge(14.1, 4.55)],
      [ridge(16.1, 4.55), ridge(17.55, 4.55), ridge(17.55, 1.6)],
    ],
    props: [
      { kind: 'shot', ...ridge(13.3, 4.0) },
      { kind: 'shot', ...ridge(17.1, 4.0) },
      { kind: 'ball', ...ridge(16.0, 1.85) },
      { kind: 'ball', ...ridge(11.2, 3.4) },
      { kind: 'chest', ...ridge(11.2, 1.9), heading: DECK_HEADING },
      // The rammer and sponge leaning on the harbour rail.
      { kind: 'rammer', ...ridge(13.95, 4.0), heading: DECK_HEADING },
    ],
  },
];
