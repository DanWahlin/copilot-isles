// Sea battle 1 for the highlight reel: the same battle as `battle1`, but the bosun's question after
// the first wave is answered right (the reward pick shows), and the take stops there. The game's own
// chart label for the battle is marked as shown off camera, so only the reel's lower third shows.
import { battleScenario } from './battle-1.mjs';

export default battleScenario({
  rightFirst: true,
  firstWaveOnly: true,
  labelsSeen: true,
  id: 'battle1-review',
  order: 17,
  title: 'Raiders on the Passage: Review between the Waves',
});
