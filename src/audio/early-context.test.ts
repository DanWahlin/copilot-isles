import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareAudioContext, takeAudioContext } from './early-context';

afterEach(() => {
  takeAudioContext();
  vi.unstubAllGlobals();
});

describe('early AudioContext', () => {
  it('is made once while loading and handed over once', () => {
    let made = 0;
    vi.stubGlobal('window', {});
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          made++;
        }
      },
    );
    prepareAudioContext();
    prepareAudioContext();
    expect(made).toBe(1);
    expect(takeAudioContext()).not.toBeNull();
    expect(takeAudioContext()).toBeNull();
  });

  it('is skipped where there is no AudioContext (the engine makes its own on the gesture)', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('AudioContext', undefined);
    prepareAudioContext();
    expect(takeAudioContext()).toBeNull();
  });
});
