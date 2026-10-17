import type { ScriptStep } from '../game/script';
import type { CoursePack, IslandQuests } from './pack';

/**
 * The active course pack (docs/specs/COURSE-PACKS.md §2). A voyage loads it (src/course/load.ts, or
 * tools/course-pack/read.ts in Node) and activates it before anything reads course data. Modules
 * that keep data derived from the pack build it in an `onCourse` hook, which runs on activation (or at
 * once, if a pack is already active), in the order the modules registered: a module's imports always
 * register first, so their data is ready for it.
 */

let active: CoursePack | null = null;
const hooks: ((p: CoursePack) => void)[] = [];

/** Runs `build` with the active pack now (if there is one) and on every activation after. */
export function onCourse(build: (p: CoursePack) => void): void {
  hooks.push(build);
  if (active) build(active);
}

export function setActiveCourse(p: CoursePack): void {
  if (active === p) return;
  active = p;
  for (const h of hooks) h(p);
}

export function hasActiveCourse(): boolean {
  return active !== null;
}

/** The active pack; throws if none is loaded yet (a read before the voyage loaded it). */
export function coursePack(): CoursePack {
  if (!active) throw new Error('No course pack is active yet (src/course/load.ts activates it)');
  return active;
}

/** An island's quests in the active course. */
export function islandQuests(island: string): IslandQuests {
  const q = coursePack().quests[island];
  if (!q) throw new Error(`The course "${coursePack().id}" has no quests for ${island}`);
  return q;
}

/** A named script of an island's quests (`quests/<island>.json` → `scripts`). */
export function courseScript(island: string, name: string): readonly ScriptStep[] {
  const s = islandQuests(island).scripts[name];
  if (!s) throw new Error(`The course "${coursePack().id}" has no script "${name}" on ${island}`);
  return s;
}

/** What an NPC says when there's no script for them (unvoiced barks), from any island's quests. */
export function barksFor(npc: string): readonly string[] | undefined {
  if (!active) return undefined;
  for (const q of Object.values(active.quests)) {
    const b = q.barks[npc];
    if (b) return b;
  }
  return undefined;
}
