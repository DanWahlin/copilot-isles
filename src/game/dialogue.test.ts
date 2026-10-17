import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IslesAudio } from '../audio';
import { Dialogue } from './dialogue';
import type { Hud } from './hud';

function fakes() {
  const audio = {
    playVoice: vi.fn(async () => undefined),
    stopVoice: vi.fn(),
    preloadVoice: vi.fn(),
    voiceReady: vi.fn(() => true),
    prepareVoice: vi.fn(async () => true),
  };
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

  it('lets a newer run finish when an older one’s timer fires (a line said over another)', async () => {
    const { dialogue } = fakes();
    const first = dialogue.play(['l']);
    await vi.advanceTimersByTimeAsync(500);
    const second = dialogue.play(['l']);
    await vi.advanceTimersByTimeAsync(0);
    // The first line's timer fires while the second is up: it mustn't clear the second's.
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(1000);
    await second;
    expect(dialogue.active).toBe(false);
    dialogue.cancel();
    await Promise.race([first, vi.advanceTimersByTimeAsync(0)]);
  });

  it('stops its own line', async () => {
    const { audio, dialogue } = fakes();
    const done = dialogue.play(['l']);
    dialogue.cancel();
    await done;
    expect(audio.stopVoice).toHaveBeenCalled();
    expect(dialogue.active).toBe(false);
  });

  it('loads the whole run up front and starts each caption with its voice', async () => {
    const { audio, dialogue } = fakes();
    const done = dialogue.play(['l', 'l']);
    expect(audio.preloadVoice).toHaveBeenCalledWith(['l', 'l']);
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.playVoice).toHaveBeenCalledTimes(1);
    dialogue.cancel();
    await done;
  });

  it('holds a caption until its voice has loaded, then shows both together', async () => {
    const { audio, dialogue } = fakes();
    let loaded!: (ok: boolean) => void;
    let ready = false;
    audio.voiceReady.mockImplementation(() => ready);
    audio.prepareVoice.mockImplementation(() => new Promise<boolean>((r) => (loaded = r)));
    const hud = (dialogue as unknown as { hud: { showLine: ReturnType<typeof vi.fn> } }).hud;
    const done = dialogue.play(['l']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hud.showLine).not.toHaveBeenCalled();
    ready = true;
    loaded(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(hud.showLine).toHaveBeenCalled();
    expect(audio.playVoice).toHaveBeenCalledWith('l');
    dialogue.cancel();
    await done;
  });

  it("shows the caption on its own if the voice doesn't come in time (no late voice)", async () => {
    const { audio, dialogue } = fakes();
    audio.voiceReady.mockImplementation(() => false);
    audio.prepareVoice.mockImplementation(() => new Promise<boolean>(() => undefined));
    const hud = (dialogue as unknown as { hud: { showLine: ReturnType<typeof vi.fn> } }).hud;
    const done = dialogue.play(['l']);
    await vi.advanceTimersByTimeAsync(4000);
    expect(hud.showLine).toHaveBeenCalled();
    expect(audio.playVoice).not.toHaveBeenCalled();
    dialogue.cancel();
    await done;
  });
});
