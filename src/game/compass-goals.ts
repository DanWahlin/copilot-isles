import type { QuestTarget } from '../course/pack';
import { currentQuest, questOptionalTargets, questTarget } from './cove-quests';
import type { IslandId } from './islands';
import { meridianCurrent, meridianOptionalTargets, meridianTarget } from './meridian-quests';
import type { QuestState } from './story';
import {
  thousandBoughCurrent,
  thousandBoughOptionalTargets,
  thousandBoughTarget,
} from './thousand-bough-quests';

/**
 * Where the compass points ashore: the gold marker on the main quest's next step, or, once the
 * island's main quests are done (the tracker then says to board and follow the compass), on your
 * ship's gangway; and a dimmer marker on each optional quest you've started.
 */
export interface CompassGoals {
  main: QuestTarget | null;
  optional: readonly QuestTarget[];
}

/** The gangway, once there's nothing left ashore (game chrome: the same on every course). */
export const SHIP_TARGET: QuestTarget = { ids: ['ship:board'], label: 'Your ship' };

export function compassGoals(island: IslandId, q: QuestState): CompassGoals {
  if (island === 'meridian')
    return {
      main: meridianTarget(q) ?? (meridianCurrent(q) ? null : SHIP_TARGET),
      optional: meridianOptionalTargets(q),
    };
  if (island === 'thousand-bough')
    return {
      main: thousandBoughTarget(q) ?? (thousandBoughCurrent(q) ? null : SHIP_TARGET),
      optional: thousandBoughOptionalTargets(q),
    };
  return {
    main: questTarget(q) ?? (currentQuest(q) ? null : SHIP_TARGET),
    optional: questOptionalTargets(q),
  };
}
