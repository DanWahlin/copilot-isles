import { describe, expect, it } from 'vitest';
import { SubtitleScheduler, chooseVoiceFormat } from './player';

describe('subtitle word timing', () => {
  it('emits word events at the line timings', () => {
    const scheduled: { readonly id: number; readonly ms: number; readonly callback: () => void }[] = [];
    let nextId = 1;
    const scheduler = new SubtitleScheduler({
      set(callback, ms) {
        const id = nextId++;
        scheduled.push({ id, ms, callback });
        return id;
      },
      clear(id) {
        const index = scheduled.findIndex((item) => item.id === id);
        if (index >= 0) scheduled.splice(index, 1);
      },
    });
    const events: string[] = [];
    scheduler.schedule(
      'nell.papers.01',
      [
        { word: 'Morning', start: 0.12, end: 0.42 },
        { word: 'Captain', start: 0.48, end: 0.9 },
      ],
      (lineId, wordIndex) => events.push(`${lineId}:${wordIndex}`),
    );
    expect(scheduled.map((item) => item.ms)).toEqual([120, 480]);
    scheduled[0].callback();
    scheduled[1].callback();
    expect(events).toEqual(['nell.papers.01:0', 'nell.papers.01:1']);
  });
});

describe('voice format selection', () => {
  it('uses Opus WebM when supported and AAC otherwise', () => {
    const webm = {
      canPlayType: (mime: string): CanPlayTypeResult => (mime.includes('webm') ? 'probably' : ''),
    };
    const fallback = { canPlayType: (): CanPlayTypeResult => '' };
    expect(chooseVoiceFormat(webm)).toBe('webm');
    expect(chooseVoiceFormat(fallback)).toBe('m4a');
  });
});
