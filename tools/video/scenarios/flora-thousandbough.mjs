// Thousand-Bough Isle's grass and flowers (issue 255): ferns and orchids over moss on the forest
// floor, heliconia and ginger lilies along the stream, and the spray by Silver Thread and the Veil.
// Afternoon light; the HUD is hidden.
import { floraTour, thousandBoughAshore } from '../game.mjs';

const ahead = (x, z, yaw, d) => [x + Math.sin(yaw) * d, z + Math.cos(yaw) * d];

export const TB_STOPS = [
  {
    label: 'forest floor',
    x: 1903,
    z: -1554,
    yaw: 0.2,
    pitch: 0.32,
    walk: [ahead(1903, -1554, 0.2, 12)],
    pan: [[1.6, 0.24, 4200]],
  },
  {
    label: 'under the trees',
    x: 2080,
    z: -1500,
    yaw: 1.2,
    pitch: 0.16,
    walk: [ahead(2080, -1500, 1.2, 14)],
    pan: [[2.6, 0.22, 3800]],
  },
  // On Silver Run's east bank (its course meanders; issue 258), up the stream toward the falls.
  {
    label: 'stream to Silver Thread',
    x: 1894,
    z: -1580,
    yaw: 3.36,
    pitch: 0.18,
    walk: [ahead(1894, -1580, 3.36, 8)],
    pan: [[4.1, 0.26, 3600]],
  },
  { label: "Silver Thread's spray", x: 1896, z: -1606, yaw: 4.12, pitch: 0.4, pan: [[3.2, 0.3, 4200]] },
  {
    label: 'toward the Veil',
    x: 1985,
    z: -1640,
    yaw: 3.4,
    pitch: 0.18,
    walk: [ahead(1985, -1640, 3.4, 10)],
    pan: [[2.4, 0.24, 3800]],
  },
];

export default floraTour({
  id: 'flora-thousandbough',
  order: 32,
  code: 'Flora',
  title: 'Grass and Flowers: Thousand-Bough Isle',
  island: 'Thousand-Bough Isle',
  who: 'the forest floor, the stream and the falls',
  subtitle: 'Misty jungle palette: ferns, moss, orchids, heliconia and ginger lilies.',
  chapter: 'Course Chapter 02 · Sessions, Worktrees, and Context (Thousand-Bough Isle)',
  flags: ['thousandbough'],
  titleFrame: 4,
  ashore: thousandBoughAshore,
  stops: TB_STOPS,
});
