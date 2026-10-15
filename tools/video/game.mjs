// Copilot Isles setup helpers shared by the scenarios (all off camera, before recording starts).
import fs from 'node:fs';
import { skipTalk } from './lib.mjs';

/**
 * Off camera: marks every chart label in content/labels.json as already shown in this save (the
 * game shows each once, the first time a puzzle or a battle starts, and stores the ids in the save's
 * `labels` list), so a take of a puzzle or a battle doesn't show the game's own parchment card under
 * the reel's lower third. The arrival cards in `opening` aren't touched (that take has no dev page).
 */
export async function labelsShown(api) {
  const { labels } = JSON.parse(
    fs.readFileSync(new URL('../../content/labels.json', import.meta.url), 'utf8'),
  );
  const added = await api.S((ids) => {
    const p = window.__dev.learn.progress;
    return ids.filter((id) => p.add('labels', id));
  }, Object.keys(labels));
  return added;
}

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

/**
 * Off camera: hides every page layer over the 3D view (HUD, prompts, captions, the dev page's own
 * panels) with a style tag, so a fly-by shows the island alone. No game code changes.
 */
export const hideUi = (page) =>
  page.addStyleTag({ content: 'body > :not(#gl) { visibility: hidden !important; }' });

/**
 * Flies the game camera through `keys` ({ x, y, z, tx, ty, tz, pace }, world space) over `seconds`
 * with the arrivals' own FlyoverPath (a Catmull-Rom flight eased at both ends), held through the
 * follow camera's `cut` (a shot object mutated each frame is followed exactly). Resolves at the end
 * with the last shot still held; `start: true` only cuts to the first key and holds it.
 */
export const flyCamera = (api, keys, seconds, { start = false } = {}) =>
  api.S(
    async ([keys, seconds, start]) => {
      const { FlyoverPath } = await import('/src/game/flyover.ts');
      const path = new FlyoverPath(keys, seconds);
      const cam = window.__dev.session().camera;
      const shot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
      path.sample(0, shot);
      cam.cut(shot);
      if (start) return;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          if (path.sample((performance.now() - t0) / 1000, shot)) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    [keys, seconds, start],
  );

/**
 * A fly-by scenario: `ashore` (off camera) brings the island up, then the UI is hidden, the flight
 * is flown once off camera so every part of the island it sees is streamed and its pipelines are
 * warm, and the camera waits on the first key. On camera, the flight is flown again.
 */
export function flyby({ keys, seconds, ashore, holdAfter = 1.2, ...meta }) {
  return {
    ...meta,
    keys,
    seconds,
    async setup(page, api) {
      await ashore?.(page, api);
      await skipTalk(page, 20_000);
      await labelsShown(api);
      await hideUi(page);
      await flyCamera(api, keys, seconds);
      await api.pause(1500);
      await flyCamera(api, keys, seconds, { start: true });
      await api.pause(2500);
    },
    async play(page, api) {
      await api.pause(600);
      api.mark('fly');
      await flyCamera(api, keys, seconds);
      api.mark('landed');
      // `holdAfter`: seconds on the last view (room for an end card over it).
      await api.pause(holdAfter * 1000);
    },
  };
}
