/** World axes: +x is east and -z is north (see world/sky/sun.ts). */
const TAU = Math.PI * 2;

/** The compass bearing of a world-space direction: radians clockwise from north, in [0, 2π). */
export function bearingOf(dx: number, dz: number): number {
  const b = Math.atan2(dx, -dz);
  return b < 0 ? b + TAU : b;
}

/** The signed turn from `heading` to `target` (both bearings), in (-π, π]; positive is to the right. */
export function relativeBearing(target: number, heading: number): number {
  let d = (target - heading) % TAU;
  if (d <= -Math.PI) d += TAU;
  else if (d > Math.PI) d -= TAU;
  return d;
}

/** What the compass marker points at: a bearing from where you are, a name, and how far. */
export interface CompassTarget {
  bearing: number;
  label: string;
  /** Metres along the route there (not the straight line). */
  distance: number;
  /** The target's a level above or below you: an up or down cue beside the distance. */
  level?: 'up' | 'down' | null;
}

/** A short distance for the marker's label ("8 m", "240 m", "1.2 km"). */
export function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.max(1, Math.round(metres))} m`;
}
