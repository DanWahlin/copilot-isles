import { smoothstep } from '../../util/math';
/**
 * Sun & moon from time of day (PLAN §6 "Time of day & sun position").
 * A simple parametric solar path (latitude, declination, hour angle) rotated by a sun-azimuth
 * setting, following Tidewater's approach (MIT, © 2026 DRG Software Solutions LLC); our own code.
 */
export interface SunState {
  /** Unit direction TOWARD the sun (world, y up). */
  sun: [number, number, number];
  /** Unit direction toward the moon. */
  moon: [number, number, number];
  /** 0 = full day, 1 = full night. */
  night: number;
  /** Which body is the key light (sun until just below the horizon, then the moon). */
  key: 'sun' | 'moon';
  /** Sun elevation, sin(altitude). */
  elevation: number;
}

const DEG = Math.PI / 180;

export interface SunParams {
  latitude: number; // degrees
  declination: number; // degrees
}

export const DEFAULT_SUN: SunParams = { latitude: 18, declination: 8 };

/**
 * @param hours Local solar time, 0-24.
 * @param azimuthDeg Rotation of the whole sun path around +y (the player-facing "sun azimuth" setting).
 */
export function sunState(hours: number, azimuthDeg = 0, p: SunParams = DEFAULT_SUN): SunState {
  const lat = p.latitude * DEG,
    dec = p.declination * DEG;
  const H = (hours - 12) * 15 * DEG;
  // East-up-north components of the sun direction.
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const east = -Math.cos(dec) * Math.sin(H);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H);
  // World: +x east, -z north. Then rotate by azimuth around +y.
  const az = azimuthDeg * DEG;
  const x0 = east,
    z0 = -north;
  const sx = x0 * Math.cos(az) - z0 * Math.sin(az);
  const sz = x0 * Math.sin(az) + z0 * Math.cos(az);
  const len = Math.hypot(sx, up, sz) || 1;
  const sun: [number, number, number] = [sx / len, up / len, sz / len];

  // Moon roughly opposite the sun, kept above the horizon at night.
  const my = Math.max(-sun[1], 0.25);
  const ml = Math.hypot(-sun[0], my, -sun[2]) || 1;
  const moon: [number, number, number] = [-sun[0] / ml, my / ml, -sun[2] / ml];

  const night = smoothstep(0.02, 0.18, -sun[1]);
  return { sun, moon, night, key: sun[1] > -0.07 ? 'sun' : 'moon', elevation: sun[1] };
}
