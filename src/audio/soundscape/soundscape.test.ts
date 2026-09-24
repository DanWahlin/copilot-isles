import { describe, expect, it } from 'vitest';
import { chooseAudioFormat } from './format';
import { VoiceLimiter, type LimitedVoice } from './voice-limiter';

class FakeVoice implements LimitedVoice {
  fadedAt = -1;
  constructor(readonly startedAt: number) {}
  fadeOut(now: number): void {
    this.fadedAt = now;
  }
}

describe('audio format selection', () => {
  it('prefers Opus-capable Ogg when available', () => {
    const audio = { canPlayType: (mime: string) => (mime.includes('ogg') ? 'probably' : '') };
    expect(chooseAudioFormat(audio).format).toBe('ogg');
  });

  it('falls back to AAC m4a when Opus Ogg is unavailable', () => {
    const audio = { canPlayType: (): CanPlayTypeResult => '' };
    expect(chooseAudioFormat(audio).format).toBe('m4a');
  });
});

describe('voice caps', () => {
  it('fades oldest voices beyond the category cap', () => {
    const limiter = new VoiceLimiter<FakeVoice>({ gull: 2 });
    const first = new FakeVoice(0);
    const second = new FakeVoice(1);
    const third = new FakeVoice(2);
    limiter.add('gull', first, 0);
    limiter.add('gull', second, 1);
    limiter.add('gull', third, 2);
    expect(limiter.count('gull')).toBe(2);
    expect(first.fadedAt).toBe(2);
    expect(second.fadedAt).toBe(-1);
    expect(third.fadedAt).toBe(-1);
  });
});
