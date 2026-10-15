// P2.3 The Flag Hoist (Ines, Thousand-Bough): Ines's brief on the four flags, then six orders
// answered with the number keys: four needs (never the symbol), "Pack light", and a letter from
// ashore. The first flag hoisted is the wrong one, so it drops back with her reason; then the rest
// go right. Stops as her check (K2.3) opens.
import { questsDone, tb, thousandBoughAshore } from '../game.mjs';

export default {
  id: 'hoist',
  order: 7,
  code: 'P2.3',
  title: 'The Flag Hoist',
  island: 'Thousand-Bough Isle',
  who: 'with Ines on the Signal Deck',
  subtitle:
    'Four flags for the prompt box: @ brings files, # brings issues, / runs commands, & points at another session. Pack light: less is more.',
  chapter: 'Course Chapter 02 · Context syntax · Attaching files',
  flags: ['thousandbough'],

  async setup(page, api) {
    await thousandBoughAshore(page, api);
    await questsDone(api, ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5']);
    this.spot = await api.approachSpot('ines', { back: 3 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    let wrong = false;
    let hoisted = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      const s = await api.learn();
      if (s.quiz) break;
      const open = await api.S(() => !!document.querySelector('.ci-fh-flags'));
      if (!open) {
        await api.pause(250);
        continue;
      }
      const h = await tb(api, 'hoist');
      if (h.busy || !h.open) {
        await api.pause(250);
        continue;
      }
      // Read Ines's order, then pick a flag.
      await api.pause(2600);
      if (!wrong) {
        wrong = true;
        await api.press('Digit2');
        await api.pause(1500);
        continue;
      }
      await api.press(`Digit${h.right}`);
      hoisted++;
      await api.pause(1200);
    }
    if (hoisted < 6) api.log(`only ${hoisted} orders answered`);
    await api.pause(1200);
  },
};
