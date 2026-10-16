// Sluice & Waterwheel for the highlight reel, on one wide shot of the mill terrace: the lever, the
// stone channel tiles, the water and the waterwheel all read at once, in the upper part of the frame
// (clear of the reel's lower third). Played by real input as in `sluice`: Actions first (the lever
// under the "Workflows aren't being run" sign), then the mill race (the first channel turned a step
// too far and Shift+E back, the rest, the tee feeding the wheel and the jammed check gate). Setup
// (off camera): Pim and Pol's brief done (Q0.7 at "actions"), the game's own chart labels marked as
// shown, the captain by the lever, and the game camera held on the wide shot with its own `cut` (as
// the fly-bys do). Between the lever and the race the crane's run is skipped off camera (a cut).
import { labelsShown } from '../game.mjs';
import { skipTalk } from '../lib.mjs';
import sluice, { pullGateLever, solveSluice } from './p0-1-sluice.mjs';

/** Eye and look-at (world space): from the beach side, south of the wheel, so the tee, the wheel and
 * the "Practice check" gate all show with the lever and its sign. */
const WIDE = { x: -49.5, y: 8.5, z: -73, tx: -59.5, ty: -0.4, tz: -63 };

export default {
  ...sluice,
  id: 'sluice-wide',
  order: 18,
  title: 'Sluice & Waterwheel (wide)',

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await labelsShown(api);
    // Pim and Pol's brief done: the crane job waits on Suri's gate (Actions first, Q0.7 `actions`).
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5']) d.quest(q, 'done');
      d.quest('Q0.7', 'actions');
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
    // Actions first: the lever under the "Workflows aren't being run" sign, and Suri's line.
    await pullGateLever(page, api);
    // Off camera: the crane's run (practice items in), so Suri's mill race opens; the wide shot is
    // held again in case her lines moved the camera.
    await api.cut(async () => {
      await api.S(() => {
        const d = window.__dev.session().debug;
        d.quest('Q0.7', 'done');
        d.quest('Q0.6', 'sluice');
      });
      await skipTalk(page, 10_000);
      await api.S((s) => window.__dev.session().camera.cut(s), WIDE);
      await api.pause(1500);
    });
    api.mark('race');
    await solveSluice(page, api);
  },
};
