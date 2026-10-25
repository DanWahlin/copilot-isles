import { COURSE, courseIsland } from '../course/catalog';
import { ISLAND_LIST, ISLAND_REGISTRY, type IslandId } from './registry';

/** The story conditions that open an island (`IslandGate.after`) and hold now, as `island:condition`. */
const held = new Set<string>();

/**
 * Whether an island can be visited yet (its `open` gate, src/islands/types.ts): the home island
 * always; any other only in a course that teaches a chapter there, and then in the dev build, once
 * its `after` condition holds, or with its URL flag. Reads only the catalog and the registry, so the
 * chart and menus can ask without loading the world.
 */
export function islandOpen(id: IslandId): boolean {
  const gate = ISLAND_REGISTRY[id].open;
  if (!gate) return true;
  if (!courseIsland(id, COURSE)) return false;
  if (import.meta.env.DEV) return true;
  if (gate.after && held.has(`${gate.after.island}:${gate.after.condition}`)) return true;
  return (
    typeof location !== 'undefined' && new URLSearchParams(location.search).has(ISLAND_REGISTRY[id].flag)
  );
}

/**
 * The session reports the story conditions that open islands, on load and after every quest change
 * (`holds` asks the island's story, src/game/story.ts).
 */
export function noteIslandStory(holds: (island: IslandId, condition: 'sealed') => boolean): void {
  for (const e of ISLAND_LIST) {
    const after = e.open?.after;
    if (!after) continue;
    const key = `${after.island}:${after.condition}`;
    if (holds(after.island, after.condition)) held.add(key);
    else held.delete(key);
  }
}
