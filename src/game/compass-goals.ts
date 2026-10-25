import type { QuestTarget } from '../course/pack';
import type { IslandQuests } from './island-code';
import type { QuestState } from './story';

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

/** The compass's goals on an island, from its quest line (`IslandCode.quests`) and the quest state. */
export function compassGoals(quests: IslandQuests, q: QuestState): CompassGoals {
  return {
    main: quests.target(q) ?? (quests.current(q) ? null : SHIP_TARGET),
    optional: quests.optionalTargets(q),
  };
}
