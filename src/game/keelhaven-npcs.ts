import { marketStall } from './market/stalls';
import { withCourseVoices, type NpcSpec } from './npcs';

/**
 * Keelhaven's cast (Chapter 03), each at their anchor (docs/specs/ISLAND-03-keelhaven.md §4.3, the
 * as-built places in src/world/islands/keelhaven/anchors.ts). Scripted in the course's order
 * (keelhaven-quests.ts). Each name holds the speaker word its voice lines use.
 */
export const KEELHAVEN_NPCS: NpcSpec[] = withCourseVoices([
  { id: 'lyra_keel', body: 'lyra', name: 'Lyra Wren', anchor: 'lyra', clip: 'idle' },
  { id: 'hester', name: 'Hester Vane', anchor: 'hester', clip: 'idle' },
  { id: 'dory', name: 'Dory Pascoe', anchor: 'dory', clip: 'idle' },
  { id: 'cass', name: 'Cass Abara', anchor: 'cass', clip: 'idle' },
  { id: 'barty', name: 'Barty Quist', anchor: 'barty', clip: 'idle' },
  { id: 'stroud', name: 'Harbourmaster Stroud', anchor: 'stroud', clip: 'idle' },
  { id: 'arlo', name: 'Arlo Fenwick', anchor: 'arlo', clip: 'idle' },
  { id: 'ottoline', name: 'Ottoline Gage', anchor: 'ottoline', clip: 'idle', keepY: true },
]);

/**
 * The islanders, with barks from the course pack (`quests/keelhaven.json` → `barks`): Nip and Tuck
 * racing model hulls by the slipway, Caulker Moll by the yard's timber, Old Salter fishing off the
 * beach, Kit the lamplighter at Lock 2, and the tug skipper by the cut. Bram keeps the Model Market's
 * booth on the quay (his counter's E is the way to talk shop). Anyone whose anchor isn't there is
 * left out.
 */
export function keelhavenExtras(anchors: Readonly<Record<string, { x: number; z: number }>>): NpcSpec[] {
  const extras: NpcSpec[] = [
    { id: 'kh_nip', name: 'Nip', anchor: 'extraKids', clip: 'run', orbit: 2.4, speed: 2.3 },
    {
      id: 'kh_tuck',
      name: 'Tuck',
      anchor: 'extraKids',
      clip: 'run',
      orbit: 2.4,
      orbitPhase: Math.PI,
      speed: 2.3,
    },
    { id: 'kh_moll', name: 'Caulker Moll', anchor: 'extraCaulker', clip: 'idle' },
    { id: 'kh_salter', name: 'Old Salter', anchor: 'extraFisher', clip: 'sit', seatDrop: 0.05 },
    { id: 'kh_kit', name: 'Kit', anchor: 'extraLamplighter', clip: 'idle' },
    // On his barge's deck in the cut (the ground under her is the cut's floor).
    { id: 'kh_skipper', name: 'Skipper Rourke', anchor: 'extraTug', clip: 'idle', keepY: true },
  ];
  const stall = marketStall('keelhaven');
  extras.push({
    id: stall.keeper.npc,
    body: 'kh_market',
    name: stall.keeper.name,
    anchor: 'marketKeeper',
    clip: 'idle',
    keepY: true,
  });
  return extras.filter((e) => anchors[e.anchor]);
}
