import type { QuestState } from './cove-quests';
import type { QuestTracker, TrackerStatus } from './cove-quests';

/**
 * Port Meridian (Chapter 01: Tour the App), in the course's order: why the app, its work surfaces,
 * chats, project sessions, session modes, model and effort, settings, then the Admiral's exam.
 * Each is one short talk; the Three Helms sail from the berth and the cliff lift climbs to the rest.
 */
export const MERIDIAN_ISLAND = {
  name: 'Port Meridian',
  chapter: 'Chapter 01 · Tour the App',
  goal: 'Tour the GitHub Copilot app and earn the Seal of Meridian',
  next: 'Thousand-Bough Isle is next, and she’s still being charted. Until then these waters are yours.',
} as const;

export interface MeridianQuestDef {
  id: string;
  title: string;
  /** Where to go, in plain words, for the tracker. */
  task: string;
}

export const MERIDIAN_QUESTS: readonly MeridianQuestDef[] = [
  { id: 'Q1.1', title: 'Why use the app', task: 'Meet Tobias in the plaza' },
  { id: 'Q1.2', title: 'Find your way around', task: 'Tour the town with Mina' },
  { id: 'Q1.3', title: 'Start a chat', task: 'Hear Lyra at the tavern' },
  { id: 'Q1.4', title: 'Start a project session', task: 'See Anders at the shipyard' },
  { id: 'Q1.5', title: 'Choose a session mode', task: 'Sail the Three Helms with Rhea' },
  { id: 'Q1.6', title: 'Pick a model and effort', task: 'Ride the lift to Oren’s observatory' },
  { id: 'Q1.7', title: 'Find your settings', task: 'Find Pell in the Hall of Records' },
  { id: 'Q1.8', title: 'Pass the Admiral’s exam', task: 'Meet Admiral Vale on the terrace' },
];

/** The Meridian task list: the chapter's steps in order, the first unfinished one active. */
export function meridianTracker(q: QuestState): QuestTracker {
  const current = MERIDIAN_QUESTS.find((d) => q[d.id] !== 'done')?.id;
  return {
    island: MERIDIAN_ISLAND.name,
    chapter: MERIDIAN_ISLAND.chapter,
    goal: MERIDIAN_ISLAND.goal,
    next: MERIDIAN_ISLAND.next,
    tasks: MERIDIAN_QUESTS.map((d) => {
      const status: TrackerStatus = q[d.id] === 'done' ? 'done' : d.id === current ? 'active' : 'upcoming';
      return {
        id: d.id,
        title: d.title,
        task: d.task,
        detail: '',
        status,
        optional: false,
      };
    }),
  };
}
