// Copilot Isles setup helpers shared by the scenarios (all off camera, before recording starts).
import { skipTalk } from './lib.mjs';

/** Travels to an island by the chart (as tools/meridiantest.mjs does), past its flyover and welcome. */
export async function ashore(page, api, island, firstNpc) {
  const q = await api.S((id) => window.__dev.session().islandQuay(id), island);
  if (!q) throw new Error(`${island} isn't open`);
  await api.S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
  await page.waitForFunction((id) => window.__dev.session().island === id, island, { timeout: 90_000 });
  await page.waitForFunction(
    (id) =>
      window.__dev
        .session()
        .debug.cast()
        .some((n) => n.id === id),
    firstNpc,
    { timeout: 120_000 },
  );
  await api.pause(1500);
  await api.S(() => window.__dev.session().debug.skipArrival());
  await api.pause(1500);
  await skipTalk(page, 40_000);
}

export const meridianAshore = (page, api) => ashore(page, api, 'meridian', 'tobias');
export const thousandBoughAshore = (page, api) => ashore(page, api, 'thousand-bough', 'tamsin');

/** Marks quests done (off camera). */
export const questsDone = (api, ids) =>
  api.S((ids) => {
    for (const id of ids) window.__dev.session().debug.quest(id, 'done');
  }, ids);

/** Calls a Thousand-Bough debug hook by path, e.g. tb(api, 'routing.wrong') (read-only use on camera). */
export const tb = (api, fn, ...args) =>
  api.S(
    ([fn, args]) => {
      const d = window.__dev.session().debug.thousandBough();
      const v = fn.split('.').reduce((o, k) => (typeof o === 'function' ? o() : o)?.[k], d);
      return typeof v === 'function' ? v(...args) : v;
    },
    [fn, args],
  );
