/** The first connected gamepad with the standard mapping, or null. */
export function standardPad(): Gamepad | null {
  return navigator.getGamepads?.().find((g) => g && g.connected && g.mapping === 'standard') ?? null;
}

/**
 * Button presses for an overlay's gamepad poll. After `arm()` (the overlay just opened), the next look
 * only notes what's held: the press that opened it mustn't also act in it.
 */
export class PadEdges {
  private readonly held: boolean[] = [];
  private armed = true;

  arm(): void {
    this.armed = true;
  }

  /**
   * Takes this frame's look at the pad. False means nothing acts this frame: it's the first look
   * since `arm()`, or `hold` is set (a learning overlay has the pad), so held buttons are only noted.
   */
  look(p: Gamepad, hold = false): boolean {
    if (!this.armed && !hold) return true;
    this.armed = false;
    for (let i = 0; i < p.buttons.length; i++) this.held[i] = !!p.buttons[i]?.pressed;
    return false;
  }

  /** True on the frame button `i` goes down. */
  edge(p: Gamepad, i: number): boolean {
    const down = !!p.buttons[i]?.pressed;
    const was = this.held[i] ?? false;
    this.held[i] = down;
    return down && !was;
  }
}
