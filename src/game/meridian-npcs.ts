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
