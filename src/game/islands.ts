import { islandOpen } from '../islands/open';
import {
  HOME_ISLAND,
  ISLAND_LIST,
  ISLAND_REGISTRY,
  STREAMED_ISLANDS,
  type IslandId,
} from '../islands/registry';
import type { IslandBerth, IslandEntry } from '../islands/types';

export type { IslandId };
export type { IslandBerth, IslandMood } from '../islands/types';

/** Every island's berth, music, sky and arrival (src/islands/registry.ts), by id. */
export const ISLANDS: Readonly<Record<IslandId, IslandEntry>> = ISLAND_REGISTRY;

/** How each island's light reaches out over the sea: full within `full` m of its centre, none past `reach`. */
const SKY_REACH: readonly { id: IslandId; x: number; z: number; reach: number; full: number }[] =
  ISLAND_LIST.flatMap((e) => (e.skyReach ? [{ id: e.id, x: e.center.x, z: e.center.z, ...e.skyReach }] : []));

/**
 * The sky at sea: Anchorage's afternoon until you're well out, easing into each island's own light
 * as its waters come up (Meridian's golden hour, Thousand-Bough's dusk). Between two islands it blends
 * by how close each is (hours and azimuth written to `out`).
 */
export function passageSky(
  x: number,
  z: number,
  out: { hours: number; azimuth: number },
  hold: PassageHold | null = null,
): void {
  const a = ISLANDS[HOME_ISLAND].sky;
  let sum = 0,
    most = 0,
    hours = 0,
    azimuth = 0;
  for (const r of SKY_REACH) {
    const t = Math.min(1, Math.max(0, (r.reach - Math.hypot(x - r.x, z - r.z)) / (r.reach - r.full)));
    const k = t * t * (3 - 2 * t);
    if (k <= 0) continue;
    // A held passage: its two islands' light is the held one's (unless a third island's is here too).
    if (hold && (r.id === hold.hold || r.id === hold.skip)) continue;
    const s = ISLANDS[r.id].sky;
    sum += k;
    most = Math.max(most, k);
    hours += s.hours * k;
    azimuth += s.azimuth * k;
  }
  if (hold && sum <= 0) {
    const h = ISLANDS[hold.hold].sky;
    out.hours = h.hours;
    out.azimuth = h.azimuth;
    return;
  }
  if (sum <= 0) {
    out.hours = a.hours;
    out.azimuth = a.azimuth;
    return;
  }
  out.hours = a.hours + (hours / sum - a.hours) * most;
  out.azimuth = a.azimuth + (azimuth / sum - a.azimuth) * most;
}

/**
 * A passage whose light holds one island's sky (spec ISLAND-03 O3): out of `skip`'s evening toward an
 * island whose light is the next morning (`IslandEntry.nextMorningAfter`), the evening (`hold` the
 * island you left) holds until the "next morning" cut; after it, the morning (`hold` the island ahead)
 * holds until you're there. Any third island's light on the way ends the hold.
 */
export interface PassageHold {
  hold: IslandId;
  skip: IslandId;
}

/** The island whose light is the next morning after `from`'s, if any (`nextMorningAfter`). */
export function nextMorningFrom(from: IslandId): IslandId | null {
  return ISLAND_LIST.find((e) => e.nextMorningAfter === from)?.id ?? null;
}

/** How far into an island's light (0 outside its reach, 1 within its full light) (x, z) is. */
export function islandLight(id: IslandId, x: number, z: number): number {
  const r = SKY_REACH.find((s) => s.id === id);
  if (!r) return 0;
  const t = Math.min(1, Math.max(0, (r.reach - Math.hypot(x - r.x, z - r.z)) / (r.reach - r.full)));
  return t * t * (3 - 2 * t);
}

/** Whether a third island's light (neither of the held passage's two) reaches (x, z). */
export function otherLight(hold: PassageHold, x: number, z: number): boolean {
  for (const r of SKY_REACH)
    if (r.id !== hold.hold && r.id !== hold.skip && islandLight(r.id, x, z) > 0) return true;
  return false;
}

/**
 * The air at sea: each island's mood eases in with its light (the same reach as `passageSky`), from
 * the identity mood (Anchorage, Meridian) at sea. Writes into `out` (no allocation).
 */
export function passageMood(
  x: number,
  z: number,
  out: { fogScale: number; hazeTint: [number, number, number] },
): void {
  let sum = 0,
    most = 0,
    fog = 0,
    r = 0,
    g = 0,
    b = 0;
  for (const reach of SKY_REACH) {
    const t = Math.min(
      1,
      Math.max(0, (reach.reach - Math.hypot(x - reach.x, z - reach.z)) / (reach.reach - reach.full)),
    );
    const k = t * t * (3 - 2 * t);
    if (k <= 0) continue;
    const m = ISLANDS[reach.id].mood;
    sum += k;
    most = Math.max(most, k);
    fog += (m?.fogScale ?? 1) * k;
    r += (m?.hazeTint[0] ?? 1) * k;
    g += (m?.hazeTint[1] ?? 1) * k;
    b += (m?.hazeTint[2] ?? 1) * k;
  }
  const mix = (v: number) => (sum > 0 ? 1 + (v / sum - 1) * most : 1);
  out.fogScale = mix(fog);
  out.hazeTint[0] = mix(r);
  out.hazeTint[1] = mix(g);
  out.hazeTint[2] = mix(b);
}

/** The island whose waters (x, z) are in, falling back to the home island (Anchorage) for the open sea. */
export function islandAt(x: number, z: number): IslandId {
  for (const e of STREAMED_ISLANDS) if (e.contains(x, z)) return e.id;
  return HOME_ISLAND;
}

/** The islands you can dock at right now, in voyage order. */
export function openIslands(): IslandBerth[] {
  return ISLAND_LIST.filter((e) => islandOpen(e.id));
}
