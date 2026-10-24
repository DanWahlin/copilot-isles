import { naturalWaterAt } from '../world/islands/fresh-water-natural';
import { meridianQuayHeight, meridianWater } from '../world/islands/meridian';
import type { MeridianTownSystem } from '../world/meridian-town';
import { meridianTownPlantColliders } from '../world/meridian-town/plantings';
import { currentQuest } from './cove-quests';
import type { IslandCode } from './island-code';
import { createMeridianStream } from '../world/islands/meridian-stream';
import { createMeridianContent } from './meridian-session';
import {
  meridianCurrent,
  meridianLog,
  meridianOptionalTargets,
  meridianTarget,
  meridianTracker,
} from './meridian-quests';

/**
 * Port Meridian's code (Chapter 01; its registry entry is src/islands/meridian.ts): its stream, its
 * quest line, its town's walks and water, and its content (src/game/meridian-session.ts).
 */
export const MERIDIAN_CODE: IslandCode = {
  stream: createMeridianStream,
  quests: {
    log: meridianLog,
    tracker: meridianTracker,
    target: meridianTarget,
    current: meridianCurrent,
    optionalTargets: meridianOptionalTargets,
    hintTask: (q) => meridianTracker(q).tasks.find((t) => t.status === 'active'),
    // Once Anchorage's quests are done, the compass points on to Port Meridian.
    sailHere: (q) => !currentQuest(q),
  },
  walk: ({ stream, tier }) => ({
    surfaces: [
      {
        heightAt: (x, z) => (stream?.world as MeridianTownSystem | null)?.walkable(x, z) ?? null,
        kind: 'stone',
      },
      { heightAt: meridianQuayHeight, kind: 'stone' },
    ],
    circles: meridianTownPlantColliders(tier.tier),
    // The tarn, cascade, brook, lake and outflow, as they're drawn over this tier's ground.
    inland: (x, z, g, out) => naturalWaterAt(meridianWater(), x, z, g, out),
  }),
  content: createMeridianContent,
};
