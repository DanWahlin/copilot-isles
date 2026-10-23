// Settings → Sea state, filmed at sea: out of Anchorage's harbour under sail in a Calm (glassy water,
// light airs, a slow ship), then the setting changes to Gale and the sea builds over a few seconds
// (no jump): big seas, heavy whitecaps and spindrift, bow spray, and the ship heeling and pitching
// hard on the same course. The play page has no Settings screen, so the change goes through the dev
// page's `seaState` (the same driver Settings sets).

/** Steers for (x, z) with A/D under full sail for `ms` (or until she's within `near` m of it). */
async function sailToward(api, x, z, ms, near = 0) {
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms) {
    const st = await api.S(() => window.__dev.state().ship);
    if (near && Math.hypot(x - st.x, z - st.z) < near) break;
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

const camYaw = (api) => api.S(() => window.__dev.session().camera.yaw);

export default {
  id: 'sea-state',
  order: 30,
  code: 'Settings',
  title: 'Sea State: Calm, then Gale',
  island: 'Anchorage Cay',
  who: 'your brigantine sailing out of the harbour',
  subtitle:
    'Settings → Sea state drives the waves, the wind, the foam and the sailing. A Calm, then a Gale building on the same course.',
  chapter: 'Settings · Sea state (Calm, Breeze, Fresh, Gale)',
  flags: ['sea=calm'],
  time: 15.5,
  titleFrame: 6,

  async setup(page, api) {
    await api.S(() => window.__dev.seaState('calm', true));
    await api.S(() => window.__dev.session().debug.board());
    await page.waitForFunction(() => window.__dev.state().mode === 'sail', null, { timeout: 20_000 });
    // Cast off: in the basin clear of the pier, bow to the harbour mouth (north).
    await api.S(() => window.__dev.session().debug.sailTo(-100, -146, Math.PI));
    await api.pause(3000);
  },

  async play(page, api) {
    api.mark('calm: glassy water, light airs');
    // Sails up, out through the harbour mouth toward the open sea (north-east).
    await api.hold('KeyW', 2500);
    await sailToward(api, -96, -235, 30_000, 12);
    await sailToward(api, 747, -700, 8000);
    api.mark('calm: on the beam');
    const astern = await camYaw(api);
    await api.easeLook(astern + 1.2, 0.07, 2200);
    await sailToward(api, 747, -700, 7000);
    await api.easeLook(astern, 0.12, 1800);
    api.mark('the setting changes to Gale');
    await api.S(() => window.__dev.seaState('gale'));
    // The sea builds over five seconds: stay astern to watch it.
    await sailToward(api, 747, -700, 9000);
    api.mark('gale: big seas, whitecaps, spray');
    await sailToward(api, 747, -700, 9000);
    const behind = await camYaw(api);
    api.mark('gale: on the beam, heeling hard');
    await api.easeLook(behind + 1.2, 0.05, 2400);
    await sailToward(api, 747, -700, 12_000);
    await api.easeLook(behind + 0.3, 0.16, 2400);
    api.mark('gale: from the quarter');
    await sailToward(api, 747, -700, 8000);
  },
};
