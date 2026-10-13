/**
 * Whether Thousand-Bough Isle can be visited yet: in the dev build, with `?thousandbough`, or once
 * the captain holds the Seal of Meridian (Chapter 01 done). The session reports the Seal with
 * `noteMeridianSeal`; this module stays free of imports so the chart and menus can ask without
 * loading the world.
 */
let meridianSealed = false;

export function thousandBoughOpen(): boolean {
  if (import.meta.env.DEV || meridianSealed) return true;
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('thousandbough');
}

/** The session calls this when the save loads and whenever Chapter 01's last quest changes. */
export function noteMeridianSeal(on: boolean): void {
  meridianSealed = on;
}
