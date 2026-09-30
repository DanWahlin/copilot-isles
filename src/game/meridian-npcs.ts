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
      barks: [
        'Forty years I’ve fished off this mole. Never once needed a worktree.',
        'Quick question? That’s a chat. Big job? That’s a project. Same as nets and boats.',
      ],
    },
    {
      id: 'mer_matron',
      name: 'Signora Rosa',
      anchor: 'extraBench',
      clip: 'sit',
      keepY: true,
      seatDrop: 0.22,
      barks: [
        'My grandson checks My work every morning. Issues, pull requests, all of it.',
        'The Admiral’s up on her terrace. She doesn’t hand out Seals for nothing.',
      ],
    },
    {
      id: 'mer_vendor',
      name: 'Marco',
      anchor: 'extraStall',
      clip: 'idle',
      barks: [
        'Fresh from the bay! Pick what suits the job, like a model.',
        'Auto picks the model for you. It isn’t Autopilot, mind.',
      ],
    },
    {
      id: 'mer_kid_a',
      name: 'Nico',
      anchor: 'extraFountain',
      clip: 'run',
      orbit: 3.4,
      speed: 2.6,
      barks: ['Catch me if you can!', 'Did you sail the three helms? I want to!'],
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
      barks: ['Nico, wait for me!', 'The lighthouse lights up when someone earns the Seal!'],
    },
    {
      id: 'mer_guard',
      name: 'Citadel Guard',
      anchor: 'extraCitadel',
      clip: 'idle',
      barks: [
        'The Hall of Records is through the gate. Settings, all nine areas.',
        'Mind the drop, Captain.',
      ],
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
      barks: ['Mind the ropes, Captain!', 'Your ship’s the talk of the quay.'],
    });
  return extras.filter((e) => anchors[e.anchor]);
}
