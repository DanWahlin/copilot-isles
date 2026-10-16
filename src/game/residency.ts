import type { IslandId } from './islands';
import type { StreamState } from '../world/stream-lifecycle';

/** A streamed island: its centre, and the distances (m) it streams in within and may be freed past. */
export interface ResidencyRule {
  id: IslandId;
  x: number;
  z: number;
  load: number;
  unload: number;
  /** Your distance to it, where its shore isn't round (`footprintDistance`); else to its centre. */
  distance?: (x: number, z: number) => number;
}

export interface ResidencyInput {
  /** Seconds (the game clock). */
  now: number;
  /** Where you are: your feet ashore, the ship at sea. */
  x: number;
  z: number;
  /** The island you're on (or last moored at, while sailing). */
  on: IslandId;
  /** The island you're sailing to, if you're aboard (the compass's berth); null ashore. */
  target: IslandId | null;
  /**
   * Something needs the world to stay as it is: a battle, a quest script or conversation, an arrival
   * flyover, a chart jump, the lift or a puzzle in progress. Nothing unloads meanwhile.
   */
  busy: boolean;
  /** Each streamed island's state, and whether a warm-up holds it. */
  state(id: IslandId): StreamState;
  held(id: IslandId): boolean;
}

export interface ResidencyDecision {
  /** Islands to stream in now: `priority` 'low' for a prefetch nothing waits on yet. */
  load: { id: IslandId; priority: 'auto' | 'low' }[];
  unload: IslandId[];
}

/**
 * Which islands stay in memory (PLAN §13.3, issue: unload islands you've left). At most the island
 * you're on and the one you're sailing to are resident, plus any you're close to; the rest are their
 * silhouettes. An island streams in when it's the one you're on or sailing to (a low-priority
 * prefetch) or within its `load` range, and is freed once it's none of those, you're past its `unload`
 * range, and you've been away `awaySeconds` in a row. Never while the world's busy, while it's still
 * streaming or warming, or for the island you're on or sailing to. Pure (no world), so it's tested.
 */
export class Residency {
  /** When each island was last wanted (on it, sailing to it, or in its load range). */
  private readonly wantedAt = new Map<IslandId, number>();

  constructor(
    readonly rules: readonly ResidencyRule[],
    readonly awaySeconds = 20,
  ) {}

  update(input: ResidencyInput, out: ResidencyDecision = { load: [], unload: [] }): ResidencyDecision {
    out.load.length = 0;
    out.unload.length = 0;
    for (const r of this.rules) {
      const d = r.distance ? r.distance(input.x, input.z) : Math.hypot(input.x - r.x, input.z - r.z);
      const here = input.on === r.id;
      const sailingTo = input.target === r.id;
      const wanted = here || sailingTo || d < r.load;
      const state = input.state(r.id);
      if (wanted) {
        this.wantedAt.set(r.id, input.now);
        // A failed stream is asked again: it only tries once its wait is over (StreamLifecycle).
        if (state === 'absent' || state === 'unloading' || state === 'failed')
          out.load.push({ id: r.id, priority: here || d < r.load ? 'auto' : 'low' });
        continue;
      }
      if (state !== 'resident' || input.busy || input.held(r.id) || d <= r.unload) continue;
      const since = this.wantedAt.get(r.id);
      // Never wanted since the voyage began (a save there): it counts from now.
      if (since === undefined) {
        this.wantedAt.set(r.id, input.now);
        continue;
      }
      if (input.now - since >= this.awaySeconds) out.unload.push(r.id);
    }
    return out;
  }
}
