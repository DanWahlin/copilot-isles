// P1.2 The Three Helms (Rhea, Port Meridian): Rhea's brief on the session modes, then your own
// ship sailed out to the three buoys. At each one Rhea hands you an order and you pick the helm:
// Interactive (you choose each heading), Plan (the review: her first chart crosses the Shoal, so you
// suggest a change, then approve it to sail in Autopilot; Autopilot picked for the reef passage
// stops short first), and Autopilot home to the berth. Long stretches under sail are trimmed (a fade
// covers each cut).
import { meridianAshore, questsDone } from '../game.mjs';

const helms = (api) => api.S(() => window.__dev.session().debug.puzzle('P1.2').state());
const BUOY = { interactive: { x: 680, z: -582 } };

/** Steers for (x, z) with A/D under full sail (W) until `done()` or `ms` runs out. */
async function sailToward(api, x, z, ms, done = async () => false) {
  await api.hold('KeyW', 1800);
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms) {
    if (await done()) break;
    const st = await api.S(() => window.__dev.state().ship);
    const want = Math.atan2(x - st.x, z - st.z);
    const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
    const next = Math.abs(d) < 0.08 ? null : d > 0 ? 'KeyA' : 'KeyD';
    if (next !== key) {
      if (key) await api.page.keyboard.up(key);
      if (next) await api.page.keyboard.down(next);
      key = next;
    }
    await api.pause(150);
  }
  if (key) await api.page.keyboard.up(key);
}

export default {
  id: 'helms',
  order: 4,
  code: 'P1.2',
  title: 'The Three Helms',
  island: 'Port Meridian',
  who: 'with Rhea, out in the bay',
  subtitle:
    'Read each order and pick the mode: choose every heading, review the plan and fix it, or hand over a clear job. Pick the mode that fits the task.',
  chapter: 'Course Chapter 01 · Modes',
  flags: ['meridian'],
  titleFrame: 4,

  async setup(page, api) {
    await meridianAshore(page, api);
    await questsDone(api, ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4']);
    this.spot = await api.approachSpot('rhea', { back: 3.5 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    await api.converse({
      until: (s) => s.quests['Q1.5'] === 'helms' && !s.dialogue && !s.banner && !s.reveal,
    });
    await api.pause(800);

    // Aboard and out of the harbour (cut: the walk to the gangway, and the harbour mouth, where
    // steering straight for the buoy would run her into the mole), then the last stretch under sail.
    await api.cut(async () => {
      await api.S(() => window.__dev.session().debug.board());
      await api.waitFor(() => window.__dev.state().mode === 'sail', null, 20_000);
      await api.pause(1500);
      // Open water north-west of the buoy (the harbour mole runs south-west of it), 60 m out.
      await api.S((b) => {
        const x = b.x - 35,
          z = b.z + 50;
        window.__dev.session().debug.sailTo(x, z, Math.atan2(b.x - x, b.z - z));
      }, BUOY.interactive);
      await api.pause(2500);
    });
    const near = async () => (await api.prompt())?.includes('Hear Rhea’s order');
    await api.cutWhile(() => sailToward(api, BUOY.interactive.x, BUOY.interactive.z, 60_000, near), {
      head: 9000,
      tail: 4000,
    });
    if (!(await near())) {
      api.log('never reached the Interactive buoy under sail; moving her up to it');
      await api.cut(async () => {
        await api.S(() => window.__dev.session().debug.sailTo(686, -600, 0));
        await api.pause(2500);
      });
    }

    // Three orders in turn. The cards wait on you; the long sails between are trimmed.
    const pick = async (id) => {
      await api.pause(1400);
      await page.click(`.ci-sc button[data-choice="${id}"]`);
    };
    let reefTried = false;
    const t0 = Date.now();
    let lastRun = '';
    while (Date.now() - t0 < 360_000) {
      const h = await helms(api);
      if (h.solved) break;
      const s = await api.learn();
      const key = h.run ? `${h.run.mode}-${h.run.phase}-${h.run.leg}` : `free-${h.done.length}`;
      if (key !== lastRun) {
        api.mark(key);
        lastRun = key;
      }
      if (s.dialogue) {
        await api.pause(300);
        continue;
      }
      if (!h.run) {
        const p = await api.prompt();
        if (p?.includes('Hear Rhea’s order')) {
          await api.pause(900);
          await api.interact('Hear Rhea’s order');
        } else await api.pause(300);
      } else if (h.run.phase === 'order' && !h.choice?.busy) {
        // The reef passage: Autopilot first (she stops short), then Plan.
        if (h.run.mode === 'plan' && !reefTried) {
          reefTried = true;
          await pick('autopilot');
        } else await pick(h.run.mode);
      } else if (h.run.phase === 'choose' && !h.choice?.busy) await pick(h.choice.options[h.run.leg % 2]);
      else if (h.run.phase === 'review' && !h.choice?.busy) {
        // Read the charted plan, suggest the change round the Shoal, then approve the fixed plan.
        await api.pause(3000);
        await pick(h.run.revised ? 'approve' : 'suggest');
      } else if (
        h.run.phase === 'leg' ||
        h.run.phase === 'sailing' ||
        h.run.phase === 'docking' ||
        h.run.phase === 'balk'
      ) {
        const phase = h.run.phase;
        const mode = h.run.mode;
        const leg = h.run.leg;
        await api.cutWhile(
          async () => {
            for (let k = 0; k < 600; k++) {
              const n = await helms(api);
              if (!n.run || n.run.phase !== phase || n.run.mode !== mode || n.run.leg !== leg) break;
              await api.pause(250);
            }
          },
          { head: 4500, tail: 3500 },
        );
      } else await api.pause(300);
    }
    // Moored at the east arm: Rhea's last line.
    await api.converse({ idle: 2500, timeout: 60_000 });
    await api.pause(2000);
  },
};
