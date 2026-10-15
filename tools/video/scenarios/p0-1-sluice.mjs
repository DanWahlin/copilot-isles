// P0.1 Sluice & Waterwheel (Suri, Anchorage), in the course's order: Pim and Pol's brief has sent
// you to Suri's gate first (Q0.7 `actions`: your fork's Actions tab), so she explains it and you
// pull the lever under the "Workflows aren't being run" sign. Then (the crane done off camera) her
// mill race: the channel tiles turned one by one (one a step too far first, then Shift+E back)
// until the water reaches both outlets: the wheel turns and the check gate stays jammed.
import { skipTalk } from '../lib.mjs';

/** The run's tiles from the spring and the fewest presses each needs (negative: Shift+E). */
async function plan(api) {
  return api.S(async () => {
    const L = await import('/src/world/sites/sluice-logic.ts');
    const lay = L.ANCHORAGE_SLUICE;
    const st = window.__dev.session().debug.puzzle('P0.1').state();
    const spots = window.__dev.session().debug.puzzle('P0.1').spots();
    return L.solutionPath(lay)
      .filter((i) => L.rotatable(lay.tiles[i]))
      .map((i) => {
        const t = lay.tiles[i];
        const turns = L.shortestTurn(t.kind, st.rots[i], t.solution);
        return { i, turns, kind: t.kind, x: spots.cells[i].x, z: spots.cells[i].z };
      })
      .filter((t) => t.turns !== 0);
  });
}

/** Actions first: the lever under the "Workflows aren't being run" sign, and Suri's line after it. */
export async function pullGateLever(page, api) {
  const spots = await api.S(() => window.__dev.session().debug.puzzle('P0.1').spots());
  // The lever stands in the gate's housing; you pull it from the tiles just south of it.
  await api.walkTo(spots.lever.x, spots.lever.z - 1.5, { tol: 0.3 });
  await api.face(spots.lever.x, spots.lever.z);
  await api.easeLook(0.5, 0.32, 900);
  await api.pause(500);
  api.mark('lever');
  await api.interact('Pull the lever');
  await api.pause(1200);
  await api.converse({ until: (s) => s.quests['Q0.7'] !== 'actions' && !s.dialogue });
  await api.pause(1500);
}

/**
 * The mill race played by real input from where Suri's brief leaves you (her gate's already up):
 * the channels from the spring down (the first one turned a step too far, then Shift+E back), then
 * over to watch the water reach the wheel and back up at the check gate, and Suri's closing lines.
 */
export async function solveSluice(page, api) {
  const spots = await api.S(() => window.__dev.session().debug.puzzle('P0.1').spots());
  const press = async (back) => {
    await api.waitFor(() => !window.__dev.session().debug.puzzle('P0.1').state().turning, null, 3000);
    if (back) await api.hold(['ShiftLeft', 'KeyE'], 110);
    else await api.press('KeyE');
    await api.pause(800);
  };

  // The channels, from the spring down. The first one goes a turn too far, then Shift+E back.
  const tiles = await plan(api);
  api.log(`tiles to turn: ${tiles.map((t) => `${t.i}×${t.turns}`).join(' ')}`);
  let first = true;
  for (const t of tiles) {
    await api.walkTo(t.x, t.z - 1, { tol: 0.3 });
    await api.face(t.x, t.z + 1);
    await api.easeLook(0.35, 0.62, 700);
    await api.waitFor(() => window.__dev.state().focus === 'mill:tile', null, 3000);
    api.mark(`tile ${t.i}`);
    if (first && t.turns > 0) {
      // One too many: the water stops short, so it comes back one with Shift+E.
      first = false;
      api.mark('too far');
      for (let k = 0; k <= t.turns; k++) await press(false);
      await api.pause(1600);
      api.mark('back');
      await press(true);
    } else for (let k = 0; k < Math.abs(t.turns); k++) await press(t.turns < 0);
    await api.pause(700);
    const st = await api.S(() => window.__dev.session().debug.puzzle('P0.1').state());
    if (st.solved) {
      api.mark('solved');
      break;
    }
  }
  // Over to the tiles' north edge to watch the water reach the wheel (it sits below, in its pool)
  // and back up at the check gate, then Suri's closing lines and the practice-checks card.
  const wheel = { x: spots.cells[9].x, z: spots.cells[9].z - 3.8 };
  await api.walkTo(spots.cells[10].x - 0.9, spots.cells[10].z - 0.7, { tol: 0.35 });
  await api.face(wheel.x, wheel.z);
  const h = (await api.state()).heading;
  api.mark('to the wheel');
  await api.easeLook(h + 0.35, 0.42, 1400);
  api.mark('wheel');
  await api.converse({
    until: (s) => s.quests['Q0.6'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
  });
  await api.pause(2500);
}

export default {
  id: 'sluice',
  order: 1,
  code: 'P0.1',
  title: 'Sluice & Waterwheel',
  island: 'Anchorage Cay',
  who: 'with Suri Okoye at the mill',
  subtitle:
    'New forks start with workflows switched off. Turn them on before the setup script, so GitHub can run the practice checks.',
  chapter: 'Course Chapter 00 · Add the course practice items',
  flags: [],

  async setup(page, api) {
    await skipTalk(page, 15_000);
    // Pim and Pol's brief is done: the crane job waits on Suri's gate (Actions first).
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5']) d.quest(q, 'done');
      d.quest('Q0.7', 'actions');
    });
    await skipTalk(page, 10_000);
    // From the mill's top (her south side), so the whole scene stays on the tiles' level.
    this.spot = await api.approachSpot('suri', { sides: [-1, -2, 0], back: 3.5 });
    await api.look(this.spot.heading + 0.25, 0.22);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    // Suri at her gate: it's your fork's Actions tab. Then the lever.
    await api.talkTo(this.spot);
    await api.converse({ until: (s) => !s.dialogue && !s.banner && !s.reveal });
    await api.pause(600);
    await pullGateLever(page, api);

    // The crane's run off camera (practice items in), so Suri's mill race opens.
    api.mark('crane done (off camera)');
    await api.S(() => {
      const d = window.__dev.session().debug;
      d.quest('Q0.7', 'done');
      d.quest('Q0.6', 'start');
    });
    await api.talkTo(this.spot);
    await api.converse({
      until: (s) => s.quests['Q0.6'] === 'sluice' && !s.dialogue && !s.banner && !s.reveal,
    });
    await api.pause(600);

    await solveSluice(page, api);
  },
};
