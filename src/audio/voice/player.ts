export interface VoiceWordTiming {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

export interface VoiceManifestLine {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly duration: number;
  readonly files: Readonly<Record<'webm' | 'm4a', string>>;
  readonly hash: string;
  readonly words: readonly VoiceWordTiming[];
  readonly voice: string;
}

export interface VoiceManifest {
  readonly generatedAt: string;
  readonly lines: readonly VoiceManifestLine[];
}

export type WordCallback = (lineId: string, wordIndex: number) => void;

interface TimerApi {
  set(callback: () => void, ms: number): number;
  clear(id: number): void;
}

const BROWSER_TIMERS: TimerApi = {
  set: (callback, ms) => window.setTimeout(callback, ms),
  clear: (id) => window.clearTimeout(id),
};

export function chooseVoiceFormat(
  audio: Pick<HTMLAudioElement, 'canPlayType'> | null | undefined,
): 'webm' | 'm4a' {
  const canPlayWebm = audio?.canPlayType('audio/webm; codecs="opus"');
  const canPlayOgg = audio?.canPlayType('audio/ogg; codecs="opus"');
  return canPlayWebm || canPlayOgg ? 'webm' : 'm4a';
}

export class SubtitleScheduler {
  private readonly timers: number[] = [];

  constructor(private readonly timerApi: TimerApi = BROWSER_TIMERS) {}

  schedule(lineId: string, words: readonly VoiceWordTiming[], onWord: WordCallback | null): void {
    this.clear();
    if (!onWord) return;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      this.timers.push(this.timerApi.set(() => onWord(lineId, i), Math.max(0, word.start * 1000)));
    }
  }

  clear(): void {
    for (const id of this.timers) this.timerApi.clear(id);
    this.timers.length = 0;
  }
}

export class VoicePlayer {
  private manifestPromise: Promise<VoiceManifest> | null = null;
  private readonly subtitles = new SubtitleScheduler();
  private activeSource: AudioBufferSourceNode | null = null;

  constructor(
    private readonly manifestUrl: string,
    private readonly ctx: AudioContext,
    private readonly voiceBus: GainNode,
    private readonly audioElement: Pick<HTMLAudioElement, 'canPlayType'> | null,
    private readonly onDucking: (ducked: boolean) => void,
  ) {}

  async play(lineId: string, onWord: WordCallback | null): Promise<VoiceManifestLine | null> {
    this.stop();
    const manifest = await this.loadManifest();
    const line = manifest.lines.find((candidate) => candidate.id === lineId) ?? null;
    if (!line) return null;
    const format = chooseVoiceFormat(this.audioElement);
    const response = await fetch(new URL(line.files[format], this.manifestUrl).toString());
    if (!response.ok) throw new Error(`Voice line ${lineId} failed to load: HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.voiceBus);
    this.activeSource = source;
    this.onDucking(true);
    this.subtitles.schedule(lineId, line.words, onWord);
    source.onended = () => {
      if (this.activeSource === source) this.activeSource = null;
      this.subtitles.clear();
      this.onDucking(false);
    };
    source.start();
    return new Promise((resolve) => {
      source.addEventListener('ended', () => resolve(line), { once: true });
    });
  }

  stop(): void {
    this.subtitles.clear();
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // already stopped
      }
      this.activeSource = null;
    }
    this.onDucking(false);
  }

  private async loadManifest(): Promise<VoiceManifest> {
    this.manifestPromise ??= fetch(this.manifestUrl).then((response) => {
      if (!response.ok) throw new Error(`Voice manifest failed to load: HTTP ${response.status}`);
      return response.json() as Promise<VoiceManifest>;
    });
    return this.manifestPromise;
  }
}
