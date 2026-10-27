// The kraken's distant sightings at sea: out of Anchorage's harbour under sail, then on the open sea
// (past the harbour's reach) a tip, then a group of arms, break the surface 150–400 m off, sway and
// curl, and sink back with a swirl. Sightings come minutes apart on their own; this clip asks for two
// in a row (`force`) so it stays short. `?sightings` loads them 5 s in rather than a minute.

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

const sighting = (api) =>
  api.S(() => {
    const s = window.__dev.session().debug.sightings();
    return { loaded: !!s.system, allowed: s.allowed, current: s.system?.current?.kind ?? null };
  });

/** Asks for a sighting of `kind` and waits (sailing on) for it to show and end. */
async function watchOne(api, kind, label) {
  for (let tries = 0; tries < 6; tries++) {
    await api.S((k) => window.__dev.session().debug.sightings().system?.force(k, 280), kind);
    await sailToward(api, 3300, -1560, 1500);
    if ((await sighting(api)).current) break;
  }
  const s = await sighting(api);
  if (!s.current) return api.log(`no ${kind} sighting (${JSON.stringify(s)})`);
  api.mark(label);
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000 && (await sighting(api)).current) await sailToward(api, 3300, -1560, 1000);
}

export default {
  id: 'kraken-sightings',
  order: 31,
  code: 'Open sea',
  title: 'Something Out There',
  island: 'Off Anchorage Cay',
  who: 'your brigantine on the open sea',
  subtitle: 'Now and then, far off, the kraken shows itself: a tip, a group of arms, then gone.',
  chapter: 'Ambient life · the kraken’s distant sightings',
  flags: ['sightings'],
  time: 15.5,
  titleFrame: 6,

  async setup(page, api) {
    await api.S(() => window.__dev.session().debug.board());
    await page.waitForFunction(() => window.__dev.state().mode === 'sail', null, { timeout: 20_000 });
    // Out between Thousand-Bough and Keelhaven, far from either harbour, bow to the east.
    await api.S(() => window.__dev.session().debug.sailTo(2600, -1500, 1.6));
    await page.waitForFunction(() => !!window.__dev.session().debug.sightings().system, null, {
      timeout: 90_000,
    });
    await api.pause(2000);
  },

  async play(page, api) {
    await api.hold('KeyW', 2500);
    await sailToward(api, 3300, -1560, 4000);
    // A look out over her beam, as a captain would.
    const yaw = await api.S(() => window.__dev.session().camera.yaw);
    await api.easeLook(yaw + 0.7, 0.1, 1800);
    await watchOne(api, 'tip', 'a tip, far off');
    await watchOne(api, 'group', 'a group of arms');
    await sailToward(api, 3300, -1560, 3000);
  },
};
