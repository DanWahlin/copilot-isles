import type { NpcSpec } from './npcs';

/**
 * Port Meridian's cast (Chapter 01), each at their town anchor. Everyone's scripted in the course's
 * order (meridian-quests.ts); barks are only the fallback when a script's missing.
 */
export const MERIDIAN_NPCS: NpcSpec[] = [
  { id: 'tobias', name: 'Tobias Crane', anchor: 'tobias', clip: 'idle', keepY: true },
  { id: 'mina', name: 'Mina Solé', anchor: 'mina', clip: 'idle', keepY: true },
  { id: 'lyra_meridian', body: 'lyra', name: 'Lyra Wren', anchor: 'lyra', clip: 'idle', keepY: true },
  { id: 'anders', name: 'Anders Holt', anchor: 'anders', clip: 'idle', keepY: true },
  { id: 'rhea', name: 'Captain Rhea Marlowe', anchor: 'rhea', clip: 'idle', keepY: true },
  { id: 'oren', name: 'Oren Vey', anchor: 'oren', clip: 'idle', keepY: true },
  { id: 'pell', name: 'Pell Winthrop', anchor: 'pell', clip: 'idle', keepY: true },
  { id: 'admiral', name: 'Admiral Vale', anchor: 'admiral', clip: 'idle', keepY: true },
];
