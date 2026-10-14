// The wreck from the top of the point lighthouse: in at the ground door (the climb's fade puts you
// on the gallery), round the gallery with the move keys to the side that faces the wreck, and a
// look out at her on her sand bar, then down toward the pier and the shore.
import { skipTalk } from '../lib.mjs';

const L = { x: -167, z: -93 };
const WRECK = { x: -152, z: -124 };
/** The door faces down the ridge path to the quay (COVE.lighthouse.neck). */
const DOOR = Math.atan2(-151.2 - L.x, -69.6 - L.z);
const DECK_Y = 20.44;
/** Feet on the gallery walk this far out from the tower's axis (between the watch room and the rail). */
const WALK_R = 2.8;
const onGallery = (a) => ({ x: L.x + Math.sin(a) * WALK_R, z: L.z + Math.cos(a) * WALK_R });

export default {
  id: 'wreck-lighthouse',
  order: 11,
  code: 'Landmark',
  title: 'The Wreck from the Lighthouse',
  island: 'Anchorage Cay',
  who: 'from the point lighthouse gallery',
  subtitle:
    'Up the lighthouse at golden hour and round the gallery to look out over the wreck and the harbour.',
  chapter: 'Course Chapter 00 · Setup (Anchorage Cay)',
  flags: [],
  time: 17.6,
  titleFrame: 30,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    // On the knoll, a few steps out from the ground door, facing it.
    const r = 6.2;
    await api.teleport(L.x + Math.sin(DOOR) * r, L.z + Math.cos(DOOR) * r, DOOR + Math.PI);
    await api.look(DOOR + Math.PI, 0.14);
    await api.pause(2500);
  },

  async play(page, api) {
    api.mark('the door');
    // In through the door (W, the camera's behind you facing it): the climb fades and puts you on
    // the gallery. Let go as soon as you're up, so you don't walk on into the watch room.
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction((y) => window.__dev.session().player.y > y - 0.5, DECK_Y, {
        timeout: 15_000,
      });
    } finally {
      await page.keyboard.up('KeyW');
    }
    await api.pause(1600);
    api.mark('the gallery');
    // A moment at the watch-room door to take in the view out to sea.
    await api.pause(2500);
    // Round the gallery the short way to its north-east side: the wreck shows past the tower's
    // shoulder there, and the camera behind you has open air (looking straight out toward her from
    // the far side, it would sit in the tower).
    const start = await api.S(() => {
      const p = window.__dev.session().player;
      return Math.atan2(p.x - -167, p.z - -93);
    });
    let target = Math.atan2(WRECK.x - L.x, WRECK.z - L.z) - 0.7;
    while (target - start > Math.PI) target -= Math.PI * 2;
    while (target - start < -Math.PI) target += Math.PI * 2;
    const step = Math.sign(target - start) * 0.4;
    for (let a = start + step; Math.abs(target - a) > 0.4; a += step) {
      const p = onGallery(a);
      await api.walkTo(p.x, p.z, { tol: 0.45, run: 99, timeout: 6000 });
    }
    const end = onGallery(target);
    await api.walkTo(end.x, end.z, { tol: 0.35, run: 99, timeout: 6000 });
    api.mark('the rail');
    await api.face(WRECK.x, WRECK.z);
    const p = await api.S(() => ({ x: window.__dev.session().player.x, z: window.__dev.session().player.z }));
    const yaw = Math.atan2(WRECK.x - p.x, WRECK.z - p.z);
    // Over the rail and down at her on the bar, the camera high behind the captain's shoulder (the
    // tower on the left; further right the camera would fold in against it).
    await api.easeLook(yaw + 0.45, 0.5, 3600);
    api.mark('the wreck');
    await api.pause(6000);
    // A slow drift along her (steeper, the camera folds in against the gallery floor).
    api.mark('along her');
    await api.easeLook(yaw + 0.3, 0.5, 3500);
    await api.pause(3500);
  },
};
