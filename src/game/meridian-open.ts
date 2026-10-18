import { COURSE, courseIsland } from '../course/catalog';

/**
 * Whether Port Meridian can be visited yet: only in a course that teaches a chapter there, and then
 * in the dev build and with `?meridian` while it's being built, and for everyone once Chapter 01 is
 * complete. Reads only the catalog, so the chart and menus can ask without loading the world.
 */
export function meridianOpen(): boolean {
  if (!courseIsland('meridian', COURSE)) return false;
  if (import.meta.env.DEV) return true;
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('meridian');
}
