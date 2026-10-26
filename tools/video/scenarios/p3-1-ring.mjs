// P3.1 The Drydock Ring (Cass, Keelhaven): Cass's work order, then lap 1 of the ring round Drydock 2,
// walked station by station. Understand (the plan), Change (the tally gear), Inspect (the slate: one
// stray plank, approved first so the ring sends you back), Test and build (the caisson), Preview (the
// lookout), then your seal at the work-order post.
import { ashore, labelsShown, questsDone } from '../game.mjs';

const RING = 'drydock-ring';
/** The ring's wrong picks, tried once before the right one (the ring sends you back to fix it). */
const WRONG_FIRST = { pry: 'approve' };

const P = (api, k) => api.S(([n, k]) => window.__dev.session().debug.puzzle(n)?.[k]?.() ?? null, [RING, k]);
const card = (api) => api.S(() => window.__dev.session().debug.island('keelhaven')?.card?.() ?? null);

/** Answers the station's card with its own keys: the wrong pick once where there is one. */
async function answerStation(api, tried) {
  for (let k = 0; k < 240 && (await P(api, 'open')); k++) {
    const v = await card(api);
    if (!v?.open || v.busy) {
      await api.pause(250);
      continue;
    }
    const ids = v.options.map((o) => o.id);
    const free = ids.filter((id) => !id.startsWith('·leave') && !id.startsWith('·skip'));
    if (!free.length) {
      // A demo station plays out by itself.
      await api.pause(300);
      continue;
    }
    let pick = free.find((id) => !v.options.find((o) => o.id === id).tried) ?? free[0];
    for (const [right, wrong] of Object.entries(WRONG_FIRST))
      if (ids.includes(right) && ids.includes(wrong) && !tried.has(wrong)) pick = wrong;
      else if (ids.includes(right) && tried.has(wrong)) pick = right;
    tried.add(pick);
    // Read the card first, as a player would.
    await api.pause(3200);
    await api.press(`Digit${ids.indexOf(pick) + 1}`);
    await api.pause(1600);
  }
}

export default {
  id: 'ring',
  order: 10,
  code: 'P3.1',
  title: 'The Drydock Ring',
  island: 'Keelhaven',
  who: 'with Cass at Drydock 2',
  subtitle:
    'The inner loop round a hull: understand, change, inspect the diff, test and build, preview, then seal it.',
  chapter: 'Course Chapter 03 · Inner loop: develop and validate on your machine',
  flags: ['keelhaven'],

  async setup(page, api) {
    await ashore(page, api, 'keelhaven', 'lyra_keel');
    await labelsShown(api);
    await questsDone(api, ['Q3.1', 'Q3.2', 'Q3.3']);
    this.spot = await api.approachSpot('cass', { back: 3 });
    await api.look(this.spot.heading + 0.3, 0.22);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    api.mark('Cass');
    await api.converse({ until: (s) => s.quests['Q3.4'] === 'ring' && !s.dialogue });
    const tried = new Set();
    for (let guard = 0; guard < 30; guard++) {
      const st = await P(api, 'station');
      if (!st) break;
      const spot = (await P(api, 'spots')).find((x) => x.id.endsWith(`:${st.at}`) && x.on);
      if (!spot) throw new Error(`the ring's ${st.at} station has no spot`);
      api.mark(`station ${st.at}`);
      // Walk there on the copings; a long way round is cut to its start and end.
      const walked = await api.cutWhile(() => api.walkTo(spot.x, spot.z, { tol: 0.6, timeout: 30_000 }), {
        head: 2500,
        tail: 2000,
      });
      // Off the station's spot (a rail or a lamp post in the way): a cut to it.
      await api.pause(400);
      if (!walked || !(await api.prompt()))
        await api.cut(async () => {
          await api.teleport(spot.x, spot.z, undefined, spot.y + 0.3);
          await api.pause(600);
        });
      if (!(await api.interact('', { timeout: 4000, beat: 350 }))) {
        api.log(`no prompt at the ring's ${st.at} station`);
        break;
      }
      await api.pause(900);
      await answerStation(api, tried);
      await api.pause(600);
    }
    api.mark('lap closes');
    await api.converse({ until: (s) => s.quests['Q3.4'] === 'done' && !s.dialogue && !s.quiz && !s.reveal });
    await api.pause(1500);
  },
};
