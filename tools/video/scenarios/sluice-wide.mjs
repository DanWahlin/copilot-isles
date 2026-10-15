// Sluice & Waterwheel for the highlight reel, on one wide shot of the mill terrace: the lever, the
// stone channel tiles, the water and the waterwheel all read at once, in the upper part of the frame
// (clear of the reel's lower third). The puzzle is played by real input as in `sluice` (the lever,
// the first channel turned a step too far and back, the rest, the wheel). Setup (off camera): Suri's
// brief done (Q0.6 at "sluice"), the game's own chart labels marked as shown, the captain by the
// lever, and the game camera held on the wide shot with its own `cut` (as the fly-bys do).
import { labelsShown } from '../game.mjs';
import { skipTalk } from '../lib.mjs';
import sluice, { solveSluice } from './p0-1-sluice.mjs';

/** Eye and look-at (world space): from the beach side, above the wheel end of the terrace. */
const WIDE = { x: -48, y: 9, z: -69, tx: -58.5, ty: -0.4, tz: -62.5 };

export default {
  ...sluice,
  id: 'sluice-wide',
  order: 18,
  title: 'Sluice & Waterwheel (wide)',

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await labelsShown(api);
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.7']) d.quest(q, 'done');
      d.quest('Q0.6', 'sluice');
    });
    await skipTalk(page, 10_000);
    const spots = await api.S(() => window.__dev.session().debug.puzzle('P0.1').spots());
    // A few steps from the lever, so the clip opens with the captain walking up to it.
    await api.teleport(spots.lever.x - 2.5, spots.lever.z - 3.5, 0.6);
    await api.pause(800);
    await api.S((s) => window.__dev.session().camera.cut(s), WIDE);
    await api.pause(2500);
  },

  async play(page, api) {
    await api.pause(700);
    await solveSluice(page, api);
  },
};
