/**
 * The Model Market's catalog helpers for tools/models/sync.mjs, with a course pack active: the
 * categories and the board rule's numbers are the pack's `market.json` (src/game/market/catalog.ts).
 * One `tsImport` of this file loads both, so they share one module graph.
 */
import { activateCourseFromDisk, coursePaths } from '../course-pack/read';

export * from '../../src/game/market/catalog';

/** Activates the course pack and returns where its models file is. */
export function useCourse(id: string): { modelsFile: string } {
  activateCourseFromDisk(id);
  return { modelsFile: coursePaths(id).models };
}
