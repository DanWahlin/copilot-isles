// Thousand-Bough Isle at dusk (issue 255): the glowing mushrooms in the falls' spray, brightest as the
// light goes, then the forest floor. The HUD is hidden.
import { floraTour, thousandBoughAshore } from '../game.mjs';
import { TB_STOPS } from './flora-thousandbough.mjs';

const stop = (label) => TB_STOPS.find((s) => s.label === label);

export default floraTour({
  id: 'flora-thousandbough-dusk',
  order: 33,
  code: 'Flora',
  title: 'Glowing Mushrooms at Dusk',
  island: 'Thousand-Bough Isle',
  who: "Silver Thread's spray and the forest floor as the light goes",
  subtitle: 'Mushrooms in the falls’ spray glow faintly in the shade, brightest at dusk.',
  chapter: 'Course Chapter 02 · Sessions, Worktrees, and Context (Thousand-Bough Isle)',
  flags: ['thousandbough'],
  hours: 18.4,
  titleFrame: 4,
  ashore: thousandBoughAshore,
  stops: [stop("Silver Thread's spray"), stop('stream to Silver Thread'), stop('forest floor')],
});
