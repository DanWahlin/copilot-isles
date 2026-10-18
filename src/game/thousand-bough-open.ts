import { COURSE, courseIsland } from '../course/catalog';

/**
 * Whether Thousand-Bough Isle can be visited yet: in the dev build, with `?thousandbough`, or once
 * the captain holds the Seal of Meridian (Chapter 01 done). The session reports the Seal with
 * `noteMeridianSeal`; this module reads only the catalog, so the chart and menus can ask without
 * loading the world.
 */
let meridianSealed = false;

export function thousandBoughOpen(): boolean {
  // Only in a course that teaches a chapter there.
  if (!courseIsland('thousand-bough', COURSE)) return false;
  if (import.meta.env.DEV || meridianSealed) return true;
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('thousandbough');
}

/** The session calls this on load and after every quest change (the Meridian story's `sealed`). */
export function noteMeridianSeal(on: boolean): void {
  meridianSealed = on;
}
