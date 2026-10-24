import { afterAll, describe, expect, it } from 'vitest';
import { hasIslandQuests, islandQuests } from '../course/active';
import { activateCourse } from '../course/load';
import { compassGoals, SHIP_TARGET } from './compass-goals';
import { questTracker } from './cove-quests';
import type { IslandId } from './islands';
import { meridianTracker } from './meridian-quests';
import { thousandBoughTracker } from './thousand-bough-quests';

const ISLANDS: readonly IslandId[] = ['anchorage', 'meridian', 'thousand-bough'];
const tracker = (island: IslandId, q: Record<string, string>) =>
  island === 'meridian'
    ? meridianTracker(q)
    : island === 'thousand-bough'
      ? thousandBoughTracker(q)
      : questTracker(q);

/**
 * The tracker and the compass stay in step (wayfinding): every step of every island's quests in each
 * course pack has somewhere for the compass to point, the optional ones you've started get their
 * paler marker, and once an island's done (the tracker says to board and follow the compass) the
 * compass is on your ship.
 */
describe.each(['copilot-app', 'copilot-cli'])('compass targets in %s', (course) => {
  afterAll(async () => {
    await activateCourse();
  });

  it('every main step has a compass target, in story order, then your ship', async () => {
    await activateCourse(course);
    for (const island of ISLANDS) {
      if (!hasIslandQuests(island)) continue;
      const main = islandQuests(island).quests.filter((d) => !d.optional);
      const q: Record<string, string> = {};
      for (const d of main) {
        for (const step of Object.keys(d.steps)) {
          if (step === 'done') continue;
          q[d.id] = step;
          const goal = compassGoals(island, q).main;
          expect(goal, `${island} ${d.id}:${step} has no compass target`).not.toBeNull();
          expect(goal!.ids.length).toBeGreaterThan(0);
          for (const id of goal!.ids)
            expect(id, `${island} ${d.id}:${step}`).toMatch(/^[\w-]+(:[\w@.*-]+)?$/);
          // The tracker's current task is this step.
          const active = tracker(island, q).tasks.find((t) => t.status === 'active' && !t.optional);
          expect(active?.id, `${island} ${d.id}:${step}`).toBe(d.id);
        }
        q[d.id] = 'done';
      }
      expect(compassGoals(island, q).main, `${island}: all done`).toEqual(SHIP_TARGET);
      const t = tracker(island, q);
      expect(t.tasks.filter((x) => !x.optional).every((x) => x.status === 'done')).toBe(true);
    }
  });

  it('every optional step you can be on has a paler marker', async () => {
    await activateCourse(course);
    for (const island of ISLANDS) {
      if (!hasIslandQuests(island)) continue;
      for (const d of islandQuests(island).quests.filter((x) => x.optional)) {
        for (const step of Object.keys(d.steps)) {
          if (step === 'done') continue;
          const goals = compassGoals(island, { [d.id]: step });
          expect(goals.optional.length, `${island} ${d.id}:${step} has no marker`).toBe(1);
        }
        expect(compassGoals(island, { [d.id]: 'done' }).optional).toEqual([]);
      }
    }
  });
});
