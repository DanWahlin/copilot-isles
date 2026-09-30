/**
 * Whether Port Meridian can be visited yet: it opens in the dev build and with `?meridian` while it's
 * being built, and for everyone once Chapter 01 is complete. Kept free of imports so the chart and
 * menus can ask without loading the world.
 */
export function meridianOpen(): boolean {
  if (import.meta.env.DEV) return true;
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('meridian');
}
