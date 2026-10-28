import { CylinderGeometry, TorusGeometry, type BufferGeometry } from 'three/webgpu';
import { paint } from './kit';

/**
 * The hanger every hanging lantern hangs by: an iron ring standing on the lantern's top and a short
 * link from the ring up into what holds it (an arm, a beam, an eave). Without it a lantern hung below
 * its arm with sky between them (Anchorage's quay lamps, issue 363).
 */

/** The ring's radius and its iron's thickness, and the link's radius (m, at scale 1). */
export const HANGER = { ring: 0.032, tube: 0.008, link: 0.01 } as const;
/** How far the ring sinks into the lantern's top, and the link into its support (no gap, no seam). */
const SEAT = 0.004;
const GRIP = 0.008;

/**
 * Pushes the ring and the link into `target` (one metal bucket, so no new material or shader): the
 * ring's foot on the lantern's top at (x, `top`, z), the link up to `under`, the underside of the
 * support. If the support is lower than the ring's top, only the ring is built. 30 triangles (Low Keelhaven's town is at its budget).
 * Returns the parts (the ring first) for the joins test.
 */
export function lampHanger(
  target: BufferGeometry[],
  x: number,
  z: number,
  top: number,
  under: number,
  colour: number,
  scale = 1,
  yaw = 0,
): BufferGeometry[] {
  const r = HANGER.ring * scale;
  const t = HANGER.tube * scale;
  const cy = top - SEAT * scale + r + t;
  // TorusGeometry lies in its xy plane: it stands upright as built, then turns with the lantern.
  const ring = new TorusGeometry(r, t, 3, 4);
  // A diamond: a corner straight down on the lantern and one straight up (its sides start on x).
  ring.rotateZ(Math.PI / 2);
  ring.rotateY(yaw);
  ring.translate(x, cy, z);
  paint(ring, colour);
  target.push(ring);
  const from = cy + r;
  const to = under + GRIP * scale;
  if (to - from < 0.005) return [ring];
  const link = new CylinderGeometry(HANGER.link * scale, HANGER.link * scale, to - from, 3, 1, true);
  link.rotateY(yaw);
  link.translate(x, (from + to) / 2, z);
  paint(link, colour);
  target.push(link);
  return [ring, link];
}

/** The ring's top over the lantern's top: a support this far up needs no link. */
export function hangerHeight(scale = 1): number {
  return (2 * (HANGER.ring + HANGER.tube) - SEAT) * scale;
}
