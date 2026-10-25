/**
 * The circuit mechanic's places (docs/specs/ISLAND-03-keelhaven.md §5.6, Two Circuits): the stations
 * where a circuit's lamps stand, in the order the player walks them. A course binds its own place ids
 * to these with `"acts"` (`puzzles/<name>.json` → `places`), and the content check holds each one
 * bound once. The mechanic's rules, lamps and views come with the island (its wiring step); this is
 * the part the course pack and its check need first.
 */
export const CIRCUIT_PLACES = {
  /** The Drydock Ring (the inner loop): one lap round a drydock. */
  ring: ['post', 'stack', 'slate', 'caisson', 'lookout'],
  /** The Lock Flight (the outer loop): the canal's locks and gates down to the sea. */
  flight: [
    'ledger',
    'bell',
    'slate',
    'gate1',
    'petition',
    'lamps',
    'note',
    'redLamp',
    'barge',
    'gate2',
    'seaGate',
  ],
} as const;

export type CircuitKind = keyof typeof CIRCUIT_PLACES;
export type RingPlace = (typeof CIRCUIT_PLACES.ring)[number];
export type FlightPlace = (typeof CIRCUIT_PLACES.flight)[number];

/**
 * What a station asks of the player: `choose` (one option; a wrong one goes back with its reason),
 * `watch` (a short demo, skippable), `sound` (tap each plank, then float the hull), `seal` (the
 * player's approval), `tiles` (claims that stick or don't), `gate` (a seal that waits for its lamps).
 */
export const STATION_KINDS = ['choose', 'watch', 'sound', 'seal', 'tiles', 'gate'] as const;
export type StationKind = (typeof STATION_KINDS)[number];
