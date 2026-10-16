// The Three Helms for the highlight reel: the same run as `helms` (Rhea's orders, the mode picked
// on each order card, Autopilot tried on the reef first, the headings chosen, the plan reviewed with
// a suggested change round the Shoal, Autopilot home), with the game's own chart labels marked as
// shown off camera so only the reel's lower third shows.
import { labelsShown } from '../game.mjs';
import helms from './p1-2-helms.mjs';

export default {
  ...helms,
  id: 'helms-reel',
  order: 19,
  title: 'The Three Helms (reel)',

  async setup(page, api) {
    await helms.setup.call(this, page, api);
    await labelsShown(api);
  },
};
