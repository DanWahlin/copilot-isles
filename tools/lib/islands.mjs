// The islands for the tools (tools/lib/islands.json): the same ids, URL flags and names as the game's
// registry (src/islands/registry.ts; src/islands/registry.test.ts keeps them in step). Tools read
// these instead of their own island lists, so a new island is one line in each.
import { readFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(new URL('./islands.json', import.meta.url), 'utf8'));

/** Every island, in voyage order: { id, flag, name, home, terrain, silhouette }. */
export const ISLANDS = DATA.islands;
/** Every island id, in voyage order. */
export const ISLAND_IDS = ISLANDS.map((i) => i.id);
/** The home island (built with the world; a new voyage starts there). */
export const HOME = ISLANDS.find((i) => i.home).id;
/** The islands that stream in and out, in voyage order. */
export const STREAMED = ISLANDS.filter((i) => !i.home).map((i) => i.id);
/** An island by id. */
export const island = (id) => {
  const i = ISLANDS.find((x) => x.id === id);
  if (!i) throw new Error(`unknown island "${id}" (tools/lib/islands.json: ${ISLAND_IDS.join(', ')})`);
  return i;
};
/** The URL flags that open every streamed island in a built game (`&meridian&thousandbough`). */
export const OPEN_FLAGS = STREAMED.map((id) => `&${island(id).flag}`).join('');
