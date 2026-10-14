/**
 * Stretches of sea the ambient life keeps out of for a while: a sea battle (the whole sea, so a
 * dolphin's splash is never taken for a ball's) or a puzzle sailed on the water (the Three Helms'
 * course). The leaping fish and dolphins don't start a leap that begins or ends in one.
 */
export interface QuietZone {
  x: number;
  z: number;
  /** Radius (m); `Infinity` quiets the whole sea. */
  r: number;
  /** Only while this holds (always, if omitted). */
  when?: () => boolean;
}

export class QuietSea {
  private readonly zones = new Set<QuietZone>();

  /** Quiets `zone` until the returned function is called. */
  add(zone: QuietZone): () => void {
    this.zones.add(zone);
    return () => {
      this.zones.delete(zone);
    };
  }

  /** True while a zone quiets the whole sea. */
  get everywhere(): boolean {
    for (const z of this.zones) if (z.r === Infinity && (!z.when || z.when())) return true;
    return false;
  }

  /** True when (x, z) lies in a zone, or within `margin` m of one. */
  blocks(x: number, z: number, margin = 0): boolean {
    for (const q of this.zones) {
      if (q.when && !q.when()) continue;
      if (q.r === Infinity) return true;
      const r = q.r + margin;
      const dx = x - q.x;
      const dz = z - q.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
}
