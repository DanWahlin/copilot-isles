import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IslesAudio } from '../audio';
import { Dialogue } from './dialogue';
import type { Hud } from './hud';

function fakes() {
  const audio = { playVoice: vi.fn(async () => undefined), stopVoice: vi.fn() };
  const hud = {
    line: () => ({ id: 'l', speaker: 'Nell', text: 'Hi.', duration: 1, words: [] }),
    showLine: vi.fn(),
    showSpoken: vi.fn(),
    showText: vi.fn(),
    hideSubtitle: vi.fn(),
  };
  return { audio, dialogue: new Dialogue(hud as unknown as Hud, audio as unknown as IslesAudio) };
}

describe('Dialogue.cancel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves a voice it didn't start alone (the opening's cabin talk)", () => {
    const { audio, dialogue } = fakes();
    dialogue.cancel();
    expect(audio.stopVoice).not.toHaveBeenCalled();
  });

  it('stops its own line', async () => {
    const { audio, dialogue } = fakes();
    const done = dialogue.play(['l']);
    dialogue.cancel();
    await done;
    expect(audio.stopVoice).toHaveBeenCalled();
    expect(dialogue.active).toBe(false);
  });
});
