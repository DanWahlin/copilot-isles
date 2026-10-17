import type { IslesAudio } from '../audio';
import type { Hud, SubtitleLine } from './hud';

type LineHook = (line: SubtitleLine | null) => void;

/**
 * The longest a line's caption waits for its voice to load (a slow connection). Past it the caption
 * shows on its own for its usual time, and the voice is left out rather than starting late.
 */
export const VOICE_WAIT_MS = 4000;

/**
 * Plays a run of voiced lines with synced subtitles. The subtitle highlight runs on its own
 * timers from the manifest word timings, so it works before audio is unlocked (and in headless
 * shots). The voice plays alongside when audio is available: the run's lines load as it starts, and
 * each caption waits (up to VOICE_WAIT_MS) for its voice, so they start together. Interact skips to
 * the next line.
 */
export class Dialogue {
  active = false;
  private timers: number[] = [];
  private wake: (() => void) | null = null;
  private token = 0;

  constructor(
    private readonly hud: Hud,
    private readonly audio: IslesAudio | null,
    private readonly onLine: LineHook | null = null,
  ) {}

  /** `onLine` hears each line as it starts (Wingman heads back to the shoulder on his last). */
  async play(ids: readonly string[], onLine?: (id: string) => void): Promise<void> {
    const token = ++this.token;
    this.active = true;
    this.preload(ids);
    for (const id of ids) {
      if (token !== this.token) return;
      const line = this.hud.line(id);
      if (!line) continue;
      const voiced = await this.voiceFor(id, token);
      if (token !== this.token) return;
      onLine?.(id);
      this.onLine?.(line);
      this.hud.showLine(id, -1);
      line.words.forEach((w, i) => {
        this.timers.push(window.setTimeout(() => this.hud.showSpoken(id, i), w.start * 1000));
      });
      if (voiced) void this.audio?.playVoice(id).catch(() => undefined);
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timers.push(window.setTimeout(resolve, (line.duration + 0.55) * 1000));
      });
      // A newer run took over (it owns the timers and the voice now): leave them to it.
      if (token !== this.token) return;
      this.clearTimers();
      this.onLine?.(null);
      this.audio?.stopVoice();
    }
    if (token !== this.token) return;
    this.active = false;
    this.hud.hideSubtitle();
  }

  /** Starts loading lines that are coming up (a conversation's, an island's welcome). */
  preload(ids: readonly string[]): void {
    this.audio?.preloadVoice(ids);
  }

  /** Waits for a line's voice (up to VOICE_WAIT_MS, or a press); true if it can play with its caption. */
  private async voiceFor(id: string, token: number): Promise<boolean> {
    const audio = this.audio;
    if (!audio) return false;
    if (audio.voiceReady(id)) return true;
    await new Promise<void>((resolve) => {
      this.wake = resolve;
      this.timers.push(window.setTimeout(resolve, VOICE_WAIT_MS));
      void audio.prepareVoice(id).then(() => resolve());
    });
    if (token === this.token) this.clearTimers();
    return audio.voiceReady(id);
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
    if (token !== this.token) return;
    this.clearTimers();
    this.onLine?.(null);
    this.active = false;
    this.hud.hideSubtitle();
  }

  cancel(): void {
    // The voice is shared (the opening's cabin talk uses it too), so only stop a line this started.
    const speaking = this.active;
    this.token++;
    const wake = this.wake;
    this.clearTimers();
    wake?.();
    this.onLine?.(null);
    if (speaking) this.audio?.stopVoice();
    this.active = false;
    this.hud.hideSubtitle();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.wake = null;
  }
}
