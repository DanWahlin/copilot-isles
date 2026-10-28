export interface Interactable {
  id: string;
  /** Prompt text, e.g. "Talk to Nell". May change with state. */
  label: () => string;
  /** World position of the thing (feet level). */
  x: number;
  y: number;
  z: number;
  radius: number;
  /**
   * Metres added to this one's focus score. Townsfolk who only bark carry some, so a child running past
   * doesn't take the E from the islander you're facing.
   */
  bias?: number;
  enabled?: () => boolean;
  /** `back`: E pressed with Shift held (or the pad's run button), e.g. to turn a tile anticlockwise. */
  onInteract(back?: boolean): void;
}

/**
 * Picks the one interactable the player is focused on: within its radius, preferring things in
 * front of the player and closer. The HUD shows its prompt; `interact` fires it.
 */
export class Interactions {
  private readonly items: Interactable[] = [];
  current: Interactable | null = null;

  add(item: Interactable): Interactable {
    this.items.push(item);
    return item;
  }

  remove(id: string): void {
    const i = this.items.findIndex((it) => it.id === id);
    if (i >= 0) this.items.splice(i, 1);
    if (this.current?.id === id) this.current = null;
  }

  update(x: number, y: number, z: number, heading: number): Interactable | null {
    const fx = Math.sin(heading),
      fz = Math.cos(heading);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.x - x,
        dz = it.z - z;
      const d = Math.hypot(dx, dz);
      if (d > it.radius || Math.abs(it.y - y) > 3) continue;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      // Behind you counts as 2.5× farther. The current focus gets a fixed 0.15 m of stickiness so it
      // doesn't flicker; a percentage would grow with range and hold a neighbour you've walked past.
      const score =
        d * (facing < -0.2 ? 2.5 : 1.25 - 0.25 * facing) + (it.bias ?? 0) - (it === this.current ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    return best;
  }

  /**
   * The nearest interactable to (x, z) whose id is in `ids` (a trailing `*` matches a prefix),
   * preferring ones you can use right now. For pointing the compass at a quest's next step.
   */
  nearest(ids: readonly string[], x: number, z: number): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (!idMatches(ids, it.id)) continue;
      // Anything usable beats anything that isn't, so the marker moves on as a puzzle's parts do.
      const score = Math.hypot(it.x - x, it.z - z) + (it.enabled && !it.enabled() ? 1e6 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  /** Everything within `r` metres of (x, z), nearest first, and whether it's usable now (tests). */
  within(
    x: number,
    z: number,
    r: number,
  ): { id: string; x: number; y: number; z: number; d: number; radius: number; on: boolean }[] {
    return this.items
      .map((it) => ({
        id: it.id,
        x: it.x,
        y: it.y,
        z: it.z,
        d: Math.hypot(it.x - x, it.z - z),
        radius: it.radius,
        on: !it.enabled || it.enabled(),
      }))
      .filter((it) => it.d <= r)
      .sort((a, b) => a.d - b.d);
  }

  fire(back = false): boolean {
    if (!this.current) return false;
    this.current.onInteract(back);
    return true;
  }
}

/** Whether `id` is one of `ids` (a trailing `*` matches a prefix). Allocates nothing (the compass asks each frame). */
function idMatches(ids: readonly string[], id: string): boolean {
  for (let k = 0; k < ids.length; k++) {
    const m = ids[k]!;
    const last = m.length - 1;
    if (m.charCodeAt(last) !== 42) {
      if (id === m) return true;
      continue;
    }
    if (id.length < last) continue;
    let same = true;
    for (let i = 0; i < last && same; i++) same = id.charCodeAt(i) === m.charCodeAt(i);
    if (same) return true;
  }
  return false;
}
