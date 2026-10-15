// The Sluice & Waterwheel's last move, framed for a highlight: every channel but the last is set off
// camera (the crane done, so Suri's gate is up; her brief done; the tiles turned with the puzzle's own
// debug hooks, the check gate's branch already wet), then on camera the captain turns the wheel's
// tile with E, the water runs down the channel, and the waterwheel at the terrace's end starts to turn. The camera is pulled back a little with the mouse
// wheel and looks across the last tile to the wheel. The full puzzle, played by hand, is the `sluice`
// scenario.
import { skipTalk } from '../lib.mjs';

/** The path's rotatable tiles from the spring, and the quarter turns each still needs. */
async function plan(api) {
  return api.S(async () => {
    const L = await import('/src/world/sites/sluice-logic.ts');
    const lay = L.ANCHORAGE_SLUICE;
    const p = window.__dev.session().debug.puzzle('P0.1');
    const st = p.state();
    const spots = p.spots();
    return L.solutionPath(lay)
      .filter((i) => L.rotatable(lay.tiles[i]))
      .map((i) => {
        const t = lay.tiles[i];
        let k = 0;
        while (k < 4 && !L.sameOpenings(t.kind, (st.rots[i] + k) % 4, t.solution)) k++;
        const wheel = i === lay.outlet.row * lay.cols + lay.outlet.col;
        return { i, turns: k, wheel, x: spots.cells[i].x, z: spots.cells[i].z };
      });
  });
}

export default {
  id: 'sluice-wheel',
  order: 14,
  code: 'P0.1',
  title: 'Sluice & Waterwheel: the Last Channel',
  island: 'Anchorage Cay',
  who: 'at Suri’s mill',
  subtitle:
    'The last channel turned: the water reaches the wheel, and the practice checks run. One fails on purpose.',
  chapter: 'Course Chapter 00 · Add the course practice items',
  flags: [],
  titleFrame: 3,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.7']) d.quest(q, 'done');
      d.quest('Q0.6', 'sluice');
      d.puzzle('P0.1').lever();
    });
    await skipTalk(page, 15_000);
    await api.pause(1500);
    // Every tile on the path set but the wheel's, which is left one quarter turn short.
    const tiles = await plan(api);
    const last = tiles.find((t) => t.wheel);
    for (const t of tiles) {
      const n = t === last ? (t.turns + 3) % 4 : t.turns;
      for (let k = 0; k < n; k++) {
        await api.S((i) => window.__dev.session().debug.puzzle('P0.1').turn(i), t.i);
        await api.waitFor(() => !window.__dev.session().debug.puzzle('P0.1').state().turning, null, 5000);
        await api.pause(150);
      }
    }
    if (last.turns === 0) {
      // Already right: one turn away and back would solve it; turn it three times off camera.
      for (let k = 0; k < 3; k++) {
        await api.S((i) => window.__dev.session().debug.puzzle('P0.1').turn(i), last.i);
        await api.waitFor(() => !window.__dev.session().debug.puzzle('P0.1').state().turning, null, 5000);
      }
    }
    this.last = last;
    await skipTalk(page, 10_000);
    // Beside the tile, facing it; the camera off to the side shows the tile and the wheel together.
    await api.teleport(last.x, last.z + 1.05, Math.PI);
    await api.pause(600);
    await api.look(Math.PI + 1.2, 0.35);
    // Pull the camera back a little (mouse wheel), from the middle of the screen.
    const W = await api.S(() => innerWidth);
    const H = await api.S(() => innerHeight);
    await page.mouse.move(W / 2, H / 2);
    for (let k = 0; k < 5; k++) {
      await page.mouse.wheel(0, 120);
      await api.pause(80);
    }
    await api.pause(2000);
    const st = await api.S(() => window.__dev.session().debug.puzzle('P0.1').state());
    api.log(`setup: tile ${last.i}, solved ${st.solved}, focus ${(await api.state()).focus}`);
  },

  async play(page, api) {
    await api.pause(1500);
    await api.waitFor(() => window.__dev.state().focus === 'mill:tile', null, 3000);
    api.mark('turn');
    await api.press('KeyE');
    await api.waitFor(() => window.__dev.session().debug.puzzle('P0.1').state().solved, null, 8000);
    api.mark('solved');
    // Ease round toward the wheel as the water reaches it.
    await api.easeLook(Math.PI + 1.35, 0.38, 3000);
    await api.pause(7000);
    api.mark('end');
  },
};
