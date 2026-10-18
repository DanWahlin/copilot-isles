// Anchorage Cay's grass and flowers (issue 255): a walk through the hill meadow's hibiscus and
// frangipani, toward the hill, down the dunes' sea oats and morning glory to the beach, and along
// the village's edge. Golden afternoon light; the HUD is hidden.
import { floraTour } from '../game.mjs';

const ahead = (x, z, yaw, d) => [x + Math.sin(yaw) * d, z + Math.cos(yaw) * d];

export default floraTour({
  id: 'flora-anchorage',
  order: 30,
  code: 'Flora',
  title: 'Grass and Flowers: Anchorage Cay',
  island: 'Anchorage Cay',
  who: 'a walk through the meadows, dunes and village edge',
  subtitle: 'Tropical palette: hibiscus, frangipani, morning glory and sea oats.',
  chapter: 'Course Chapter 00 · Setup (Anchorage Cay)',
  flags: [],
  time: 16.6,
  titleFrame: 4,
  stops: [
    {
      label: 'hill meadow',
      x: -40,
      z: 20,
      yaw: 0.8,
      pitch: 0.1,
      walk: [ahead(-40, 20, 0.8, 20)],
      pan: [
        [2.0, 0.22, 3800],
        [0.2, 0.34, 4200],
      ],
    },
    {
      label: 'toward the hill',
      x: 30,
      z: -20,
      yaw: 1.6,
      pitch: 0.18,
      walk: [ahead(30, -20, 1.6, 16)],
      pan: [[2.6, 0.26, 3600]],
    },
    {
      label: 'dunes to the beach',
      x: -20,
      z: 75,
      yaw: 0,
      pitch: 0.16,
      // Stops short of Lyra's hammock; the camera then looks along the backshore, not back up the
      // slope (the dune behind would push it into the captain's hat).
      walk: [ahead(-20, 75, 0, 6)],
      pan: [
        [1.1, 0.2, 3600],
        [-1.1, 0.2, 4400],
      ],
    },
    {
      label: 'backshore, looking inland',
      x: -34,
      z: 86,
      yaw: Math.PI,
      pitch: 0.2,
      walk: [ahead(-34, 86, Math.PI, 10)],
      pan: [[Math.PI - 0.9, 0.24, 3600]],
    },
    {
      label: 'village edge',
      x: -80,
      z: -30,
      yaw: 1.57,
      pitch: 0.16,
      walk: [ahead(-80, -30, 1.57, 14)],
      pan: [[4.71, 0.2, 4600]],
    },
  ],
});
