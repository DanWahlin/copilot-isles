// The wreck off Anchorage Cay: a fog raider's brigantine run up on a sand bar between the lighthouse
// point and the pier, bow up and heeled, her masts bare. Your brigantine rounds the lighthouse point
// and runs north past her on the open-sea side (her deck tilted toward you) with the wind on her
// quarter, the camera turning to keep her in view and looking back as you leave her astern. Setup
// (aboard, out west of the point) is off camera.
import { skipTalk } from '../lib.mjs';

/** Steers for (x, z) with A/D (sails set) until `done()` or `ms` runs out. */
async function sailToward(api, x, z, ms, done) {
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms) {
    const st = await api.S(() => window.__dev.state().ship);
    if (done(st)) break;
    const want = Math.atan2(x - st.x, z - st.z);
    const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
    const next = Math.abs(d) < 0.06 ? null : d > 0 ? 'KeyA' : 'KeyD';
    if (next !== key) {
      if (key) await api.page.keyboard.up(key);
      if (next) await api.page.keyboard.down(next);
      key = next;
    }
    await api.pause(120);
  }
  if (key) await api.page.keyboard.up(key);
}

export default {
  id: 'shipwreck',
  order: 9,
  code: 'Landmark',
  title: 'The Wreck off the Point',
  island: 'Anchorage Cay',
  who: 'sailing past on the open-sea side',
  subtitle: 'A raider that never made it home: aground on the bar between the lighthouse and the pier.',
  chapter: 'Course Chapter 00 · Setup (Anchorage Cay)',
  flags: [],
  titleFrame: 10,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await api.S(() => window.__dev.session().debug.board());
    await page.waitForFunction(() => window.__dev.state().mode === 'sail', null, { timeout: 20_000 });
    // West of the lighthouse point, heading north with the south-westerly on her quarter.
    await api.S(() => window.__dev.session().debug.sailTo(-189, -70, Math.PI - 0.08));
    await api.pause(1500);
    await api.look(Math.PI - 0.08, 0.14);
    // Make way before the clip starts, so she's sailing when it opens.
    await api.hold('KeyW', 1800);
    await api.pause(3000);
  },

  async play(page, api) {
    api.mark('round the point');
    await sailToward(api, -183, -104, 30_000, (st) => st.z < -100);
    // The wreck comes out from behind the point, fine on the starboard bow.
    await api.easeLook(2.55, 0.12, 2500);
    api.mark('approach');
    await sailToward(api, -174, -136, 30_000, (st) => st.z < -114);
    api.mark('abeam');
    // Up over her own rigging (looking across her deck she'd hide the wreck), then astern.
    await api.easeLook(1.75, 0.45, 3000);
    await sailToward(api, -178, -180, 12_000, (st) => st.z < -146);
    api.mark('look back');
    await api.easeLook(0.85, 0.5, 3000);
    await api.pause(4000);
  },
};
