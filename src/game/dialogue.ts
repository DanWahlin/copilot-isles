import type { IslesAudio } from '../audio';
import type { Hud } from './hud';

/**
 * Plays a run of voiced lines with synced subtitles. The subtitle highlight runs on its own
 * timers from the manifest word timings, so it works before audio is unlocked (and in headless
 * shots). The voice plays alongside when audio is available. Interact skips to the next line.
 */
export class Dialogue {
  active = false;
  private timers: number[] = [];
  private wake: (() => void) | null = null;
  private token = 0;

  constructor(
    private readonly hud: Hud,
    private readonly audio: IslesAudio | null,
  ) {}

  /** `onLine` hears each line as it starts (Wingman heads back to the shoulder on his last). */
  async play(ids: readonly string[], onLine?: (id: string) => void): Promise<void> {
    const token = ++this.token;
    this.active = true;
    for (const id of ids) {
      if (token !== this.token) return;
      const line = this.hud.line(id);
      if (!line) continue;
      onLine?.(id);
      this.hud.showLine(id, -1);
      line.words.forEach((w, i) => {
        this.timers.push(window.setTimeout(() => this.hud.showSpoken(id, i), w.start * 1000));
      });
      if (this.audio) void this.audio.playVoice(id).catch(() => undefined);
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timers.push(window.setTimeout(resolve, (line.duration + 0.55) * 1000));
      });
      this.clearTimers();
      this.audio?.stopVoice();
    }
    if (token !== this.token) return;
    this.active = false;
    this.hud.hideSubtitle();
  }

  /** Skips the current line. */
  next(): void {
    this.wake?.();
  }

  /** Shows an unvoiced line with a reading-pace duration; interact skips it. */
  async say(speaker: string, text: string): Promise<void> {
    const token = ++this.token;
    this.active = true;
    const seconds = Math.min(9, 1.4 + text.split(/\s+/).length * 0.3);
    this.hud.showText(speaker, text, seconds + 1);
    await new Promise<void>((resolve) => {
      this.wake = resolve;
      this.timers.push(window.setTimeout(resolve, seconds * 1000));
    });
    this.clearTimers();
    if (token !== this.token) return;
    this.active = false;
    this.hud.hideSubtitle();
  }

  cancel(): void {
    this.token++;
    const wake = this.wake;
    this.clearTimers();
    wake?.();
    this.audio?.stopVoice();
    this.active = false;
    this.hud.hideSubtitle();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.wake = null;
  }
}
