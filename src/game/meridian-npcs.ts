import type { NpcSpec } from './npcs';

/**
 * Port Meridian's cast (Chapter 01), each at their town anchor and standing on the town's real walk
 * surface there. Lyra plays up on the tavern stage (no walk surface), so she keeps the anchor's
 * height and you can talk to her from the foot of it. Everyone's scripted in the course's order
 * (meridian-quests.ts).
 */
export const MERIDIAN_NPCS: NpcSpec[] = [
  { id: 'tobias', name: 'Tobias Crane', anchor: 'tobias', clip: 'idle' },
  { id: 'mina', name: 'Mina Solé', anchor: 'mina', clip: 'idle' },
  {
    id: 'lyra_meridian',
    body: 'lyra',
    name: 'Lyra Wren',
    anchor: 'lyra',
    clip: 'idle',
    keepY: true,
    talkRadius: 4.6,
  },
  { id: 'anders', name: 'Anders Holt', anchor: 'anders', clip: 'idle' },
  { id: 'rhea', name: 'Captain Rhea Marlowe', anchor: 'rhea', clip: 'idle' },
  { id: 'oren', name: 'Oren Vey', anchor: 'oren', clip: 'idle' },
  { id: 'pell', name: 'Pell Winthrop', anchor: 'pell', clip: 'idle' },
  { id: 'admiral', name: 'Admiral Vale', anchor: 'admiral', clip: 'idle' },
];

/**
 * Port Meridian's townsfolk: life round the harbour and the plaza, with a bark each that nods to the
 * chapter. Placed at the town's `extra*` anchors (anyone whose anchor isn't there is left out).
 * Nobody here holds up the quest line.
 */
export function meridianExtras(anchors: Readonly<Record<string, { x: number; z: number }>>): NpcSpec[] {
  const quayA = anchors.extraQuayA,
    quayB = anchors.extraQuayB;
  const extras: NpcSpec[] = [
    {
      id: 'mer_fisher',
      name: 'Old Bruno',
      anchor: 'extraFisher',
      clip: 'sit',
      keepY: true,
      seatDrop: 0.22,
    },
    {
      id: 'mer_matron',
      name: 'Signora Rosa',
      anchor: 'extraBench',
      clip: 'sit',
      keepY: true,
      seatDrop: 0.22,
    },
    {
      id: 'mer_vendor',
      name: 'Marco',
      anchor: 'extraStall',
      clip: 'idle',
    },
    {
      // Gilda keeps the Model Market behind her counter: the market's own E (src/game/puzzles/
      // model-market.ts) is the way to talk shop, so she has no bark of her own.
      id: 'gilda',
      body: 'mer_market',
      name: 'Gilda',
      anchor: 'gilda',
      clip: 'idle',
      // On her step behind the counter (no walk surface there).
      keepY: true,
    },
    {
      id: 'mer_kid_a',
      name: 'Nico',
      anchor: 'extraFountain',
      clip: 'run',
      orbit: 3.4,
      speed: 2.6,
    },
    {
      id: 'mer_kid_b',
      name: 'Lucia',
      anchor: 'extraFountain',
      clip: 'run',
      orbit: 3.4,
      // Half a lap behind Nico, chasing him round.
      orbitPhase: Math.PI,
      speed: 2.6,
    },
    {
      id: 'mer_guard',
      name: 'Citadel Guard',
      anchor: 'extraCitadel',
      clip: 'idle',
    },
  ];
  if (quayA && quayB)
    extras.push({
      id: 'mer_dockhand',
      body: 'dockhand_a',
      name: 'Dockhand',
      anchor: 'extraQuayA',
      clip: 'walk',
      patrol: [
        [quayA.x, quayA.z],
        [quayB.x, quayB.z],
      ],
      speed: 1.2,
    });
  return extras.filter((e) => anchors[e.anchor]);
}
