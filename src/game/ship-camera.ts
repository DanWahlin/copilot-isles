import type { CircleObstacle } from '../world/contracts';
import { BRIGANTINE_MASTS } from '../world/ship/brigantine-rig';
import { deckHeightAt, sheerHeightAt, waterlineHalfBeamAt } from '../world/ship/lines';
import type { CollisionWorld } from './collision';

/** Stations (ship-local z) along the keel, one round blocker each for the hull. */
const HULL_STATIONS: readonly number[] = [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.2];
/** The hull's flare over its waterline breadth, and a margin for the rails and the fenders. */
const FLARE = 1.08;
const HULL_MARGIN = 0.15;
/** Over the sheer: the rails, the guns and the fittings on deck. */
const RAIL = 0.5;
/**
 * The rig's blockers start this far over the deck: over the pivot of a captain on the gangway's top,
 * so they don't press the camera down onto the bulwarks there (the course sails' feet are higher).
 */
const RIG_CLEAR = 2.8;
/** Under the waterline (the sea's swell at the berth). */
const KEEL = 1.2;
/** Parked: out of every camera's reach. */
const AWAY = -1e4;

/**
 * Camera-only round blockers that follow the moored ship: one per hull station (the hull to its
 * rails) and one per mast (the rig and the set sails over the deck, inside the hull's breadth). The
 * follow camera keeps out of her while you're ashore, and they're parked while you sail her. The
 * circles are made once and moved in place (the frame loop doesn't allocate).
 */
export class ShipCameraBlockers {
  readonly circles: CircleObstacle[] = [];
  private readonly local: { z: number; r: number; low: number; high: number }[] = [];
  private placed = true;

  constructor(world: Pick<CollisionWorld, 'addCameraDynamic'>) {
    for (const z of HULL_STATIONS)
      this.local.push({
        z,
        r: waterlineHalfBeamAt(z) * FLARE + HULL_MARGIN,
        low: -KEEL,
        high: sheerHeightAt(z) + RAIL,
      });
    for (const m of Object.values(BRIGANTINE_MASTS))
      this.local.push({
        z: m.z,
        r: waterlineHalfBeamAt(m.z) * FLARE + HULL_MARGIN,
        low: deckHeightAt(m.z) + RIG_CLEAR,
        high: m.truck + 0.5,
      });
    for (let i = 0; i < this.local.length; i++) {
      const c: CircleObstacle = { x: 0, z: 0, r: 0, y0: AWAY, y1: AWAY };
      this.circles.push(c);
      world.addCameraDynamic(c);
    }
    this.park();
  }

  /** Puts the blockers on the ship at (x, y, z) heading `heading` (her waterline at `y`). */
  place(x: number, y: number, z: number, heading: number): void {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    for (let i = 0; i < this.local.length; i++) {
      const l = this.local[i]!;
      const o = this.circles[i]!;
      o.x = x + s * l.z;
      o.z = z + c * l.z;
      o.r = l.r;
      o.y0 = y + l.low;
      o.y1 = y + l.high;
    }
    this.placed = true;
  }

  /** Takes them off the ship (you're sailing her: the camera follows her from outside). */
  park(): void {
    if (!this.placed) return;
    for (const o of this.circles) {
      o.x = AWAY;
      o.z = AWAY;
      o.r = 0;
      o.y0 = AWAY;
      o.y1 = AWAY;
    }
    this.placed = false;
  }
}
