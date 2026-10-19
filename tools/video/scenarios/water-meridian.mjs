// Port Meridian's brook (issue 259): from under the plunge pool down its ravine, wading the natural
// course (meanders, riffles, stones, white water at the rapids) to where it runs into the lake.
// Late afternoon light; the HUD is hidden.
import { floraTour, meridianAshore } from '../game.mjs';

export default floraTour({
  id: 'water-meridian',
  order: 34,
  code: 'Water',
  title: 'Fresh Water: Port Meridian',
  island: 'Port Meridian',
  who: 'the brook from the plunge pool down to the lake',
  subtitle: 'A natural brook: meanders, riffles, stones and white water, wading on every tier.',
  chapter: 'Course Chapter 01 · Tour the App (Port Meridian)',
  flags: ['meridian'],
  titleFrame: 4,
  hours: 16.2,
  ashore: meridianAshore,
  stops: [
    {
      label: 'under the plunge pool',
      x: 1077,
      z: -966,
      yaw: 3.3,
      pitch: 0.2,
      walk: [
        [1074, -956],
        [1066, -938],
        [1056, -920],
      ],
      pan: [[2.6, 0.24, 3600]],
    },
    {
      label: 'the rapids',
      x: 1052,
      z: -914,
      yaw: 5.8,
      pitch: 0.22,
      walk: [
        [1043, -898],
        [1034, -885],
      ],
      pan: [[2.5, 0.3, 3600]],
    },
    {
      label: 'into the lake',
      x: 1030,
      z: -879,
      yaw: 5.6,
      pitch: 0.16,
      walk: [
        [1022, -870],
        [1014, -861],
      ],
      pan: [
        [4.9, 0.18, 4200],
        [5.9, 0.2, 3000],
      ],
    },
  ],
});
