export interface Interactable {
  id: string;
  /** Prompt text, e.g. "Talk to Nell". May change with state. */
  label: () => string;
  /** World position of the thing (feet level). */
  x: number;
  y: number;
  z: number;
  radius: number;
  enabled?: () => boolean;
  onInteract(): void;
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
      const score = d * (facing < -0.2 ? 2.5 : 1.25 - 0.25 * facing) - (it === this.current ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    return best;
  }

  fire(): boolean {
    if (!this.current) return false;
    this.current.onInteract();
    return true;
  }
}
