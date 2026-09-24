export interface LimitedVoice {
  readonly startedAt: number;
  fadeOut(now: number): void;
}

export class VoiceLimiter<TVoice extends LimitedVoice> {
  private readonly active = new Map<string, TVoice[]>();

  constructor(private readonly limits: Readonly<Record<string, number>>) {}

  add(category: string, voice: TVoice, now: number): void {
    const voices = this.active.get(category) ?? [];
    voices.push(voice);
    this.active.set(category, voices);
    const limit = this.limits[category] ?? 3;
    while (voices.length > limit) {
      const old = voices.shift();
      old?.fadeOut(now);
    }
  }

  remove(category: string, voice: TVoice): void {
    const voices = this.active.get(category);
    if (!voices) return;
    const index = voices.indexOf(voice);
    if (index >= 0) voices.splice(index, 1);
  }

  count(category: string): number {
    return this.active.get(category)?.length ?? 0;
  }
}
