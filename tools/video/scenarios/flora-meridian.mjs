// Port Meridian's grass and flowers (issue 255): drifts of lavender and poppies with rosemary on the
// gold hillside, the terraces' bougainvillea, oleander and geraniums, and the ridge path. Late
// afternoon light; the HUD is hidden.
import { floraTour, meridianAshore } from '../game.mjs';

const ahead = (x, z, yaw, d) => [x + Math.sin(yaw) * d, z + Math.cos(yaw) * d];

export default floraTour({
  id: 'flora-meridian',
  order: 31,
  code: 'Flora',
  title: 'Grass and Flowers: Port Meridian',
  island: 'Port Meridian',
  who: 'the gold hillside, the terraces and the ridge path',
  subtitle: 'Mediterranean palette: lavender, poppies, rosemary, bougainvillea, oleander and geraniums.',
  chapter: 'Course Chapter 01 · Tour the App (Port Meridian)',
  flags: ['meridian'],
  titleFrame: 4,
  ashore: meridianAshore,
  stops: [
    {
      label: 'gold hillside',
      x: 880,
      z: -900,
      yaw: 0.6,
      pitch: 0.16,
      walk: [ahead(880, -900, 0.6, 20)],
      pan: [
        [2.1, 0.24, 4000],
        [-0.4, 0.3, 4400],
      ],
    },
    {
      label: 'toward the terraces',
      x: 880,
      z: -900,
      yaw: 4.71,
      pitch: 0.2,
      walk: [ahead(880, -900, 4.71, 14)],
      pan: [[3.9, 0.24, 3800]],
    },
    {
      label: 'ridge path',
      x: 980,
      z: -900,
      yaw: 4.0,
      pitch: 0.18,
      walk: [ahead(980, -900, 4.0, 16)],
      pan: [[5.2, 0.26, 4200]],
    },
  ],
});
