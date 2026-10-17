import type { NpcSpec } from './npcs';

/**
 * Thousand-Bough's cast (Chapter 02), each at their island anchor (docs/specs/ISLAND-02-thousand-bough.md
 * §3.7, §4.2), standing on the island's walk surfaces. Scripted in the course's order
 * (thousand-bough-quests.ts).
 */
export const THOUSAND_BOUGH_NPCS: NpcSpec[] = [
  { id: 'tamsin', name: 'Tamsin Reed', anchor: 'tamsin', clip: 'idle' },
  { id: 'lyra_bough', body: 'lyra', name: 'Lyra Wren', anchor: 'lyra', clip: 'idle' },
  { id: 'saffi', name: 'Saffi Rootwell', anchor: 'saffi', clip: 'idle' },
  { id: 'oak', name: 'Bosun Oak Okoro', anchor: 'oak', clip: 'idle' },
  { id: 'fen', name: 'Fen Marrow', anchor: 'fen', clip: 'idle' },
  { id: 'ines', name: 'Ines Calloway', anchor: 'ines', clip: 'idle' },
  { id: 'rook', name: 'Rook Tallow', anchor: 'rook', clip: 'idle' },
  { id: 'pip', name: 'Pip Hollow', anchor: 'pip', clip: 'idle' },
  { id: 'elder', name: 'Elder Maren Ashgrove', anchor: 'elder', clip: 'idle' },
];

/** The speaker names the voice lines use (the first word of each name), for the dialogue's faces. */
export const THOUSAND_BOUGH_SPEAKERS = [
  'Tamsin',
  'Lyra',
  'Saffi',
  'Oak',
  'Fen',
  'Ines',
  'Rook',
  'Pip',
  'Maren',
];

/**
 * The islanders: life round the pools, the Root Hall and the beach, with barks that nod to the chapter
 * (any that teach cite their section in the comment). Nobody here holds up the quest line. Anyone
 * whose anchor isn't there is left out.
 */
export function thousandBoughExtras(
  anchors: Readonly<Record<string, { x: number; z: number }>>,
  twistDone: boolean,
): NpcSpec[] {
  const extras: NpcSpec[] = [
    {
      id: 'tb_kid_a',
      name: 'Teo',
      anchor: 'extraSwing',
      clip: 'run',
      orbit: 2.6,
      speed: 2.4,
    },
    {
      id: 'tb_kid_b',
      name: 'Lark',
      anchor: 'extraSwing',
      clip: 'run',
      orbit: 2.6,
      orbitPhase: Math.PI,
      speed: 2.4,
    },
    {
      id: 'tb_weaver',
      name: 'Weaver Bea',
      anchor: 'extraWeaver',
      clip: 'sit',
      keepY: true,
      seatDrop: 0.22,
    },
    {
      id: 'tb_operator',
      name: 'Moss',
      anchor: 'extraLift',
      clip: 'idle',
    },
    {
      id: 'tb_fisher',
      name: 'Old Kettle',
      anchor: 'extraFisher',
      clip: 'sit',
      keepY: true,
      seatDrop: 0.22,
    },
  ];
  if (twistDone)
    extras.push({
      id: 'tb_lookout',
      name: 'Lookout Jory',
      anchor: 'extraLook',
      clip: 'idle',
    });
  return extras.filter((e) => anchors[e.anchor]);
}
