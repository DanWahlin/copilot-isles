// The wreck from the pier, as the captain sees it: walk out along the pier with the move keys, stop
// near the end on its west edge, and turn the follow camera to the wreck out on her sand bar
// between the lighthouse point and the pier. Holds while the swell and the wash move round her.
import { skipTalk } from '../lib.mjs';

const WRECK = { x: -152, z: -124 };

export default {
  id: 'wreck-dock',
  order: 10,
  code: 'Landmark',
  title: 'The Wreck from the Pier',
  island: 'Anchorage Cay',
  who: "from the captain's point of view",
  subtitle: 'Out along the pier at golden hour to look at the raider aground on the bar.',
  chapter: 'Course Chapter 00 · Setup (Anchorage Cay)',
  flags: [],
  time: 17.6,
  titleFrame: 20,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    // At the pier's foot, facing out along it.
    await api.teleport(-108.0, -76, Math.PI);
    await api.look(Math.PI, 0.16);
    await api.pause(2500);
  },

  async play(page, api) {
    api.mark('out along the pier');
    // Up the middle (the posts line both edges, and crates stand by them), then past the first mate
    // on her west side to the end.
    await api.walkTo(-108.0, -97, { run: 99 });
    await api.walkTo(-108.6, -100.5, { run: 99, tol: 0.4 });
    await api.walkTo(-108.6, -106, { run: 99, tol: 0.4 });
    await api.walkTo(-108.8, -111.6, { run: 99, tol: 0.4 });
    api.mark('the end');
    await api.face(WRECK.x, WRECK.z);
    await api.pause(600);
    // Round behind the captain to the wreck, a little high so the shoal shows in front of her.
    const yaw = Math.atan2(WRECK.x - -108.8, WRECK.z - -111.6);
    await api.easeLook(yaw, 0.1, 3200);
    api.mark('the wreck');
    await api.pause(7000);
  },
};
