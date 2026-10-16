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

/** Decoded lines kept ready (a line is ~1 MB decoded; the next scene's few lines fit easily). */
const DECODED_KEEP = 24;
/** Fetched (still compressed) lines kept for decoding later. */
const BYTES_KEEP = 64;

/** Keeps a Map's last `keep` entries (insertion order: re-set an entry to mark it used). */
function trim<K, V>(map: Map<K, V>, keep: number): void {
  for (const key of map.keys()) {
    if (map.size <= keep) return;
    map.delete(key);
  }
}

/**
 * Plays the voiced lines. Each line is its own small file (`<id>.webm` or `<id>.m4a` beside the
 * manifest), fetched and decoded ahead of time where the game knows what's coming (`preload`: the
 * cabin's lines on the captain screen, an island's welcome as it streams in, a whole conversation as it
 * starts), so a line starts with its caption instead of a download later. Fetching needs no gesture;
 * decoding waits for the AudioContext (`bind`).
 */
export class VoicePlayer {
  private readonly subtitles = new SubtitleScheduler();
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>();
  private readonly ready = new Set<string>();
  private activeSource: AudioBufferSourceNode | null = null;
  private ctx: AudioContext | null = null;
  private voiceBus: AudioNode | null = null;
  private onDucking: (ducked: boolean) => void = () => undefined;
  /** Bumped by every play and stop, so a line that finishes loading after it was cancelled stays quiet. */
  private token = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly format: 'webm' | 'm4a',
    private readonly load: (url: string) => Promise<ArrayBuffer | null> = fetchBytes,
  ) {}

  bind(ctx: AudioContext, voiceBus: AudioNode, onDucking: (ducked: boolean) => void): void {
    this.ctx = ctx;
    this.voiceBus = voiceBus;
    this.onDucking = onDucking;
    // Lines fetched before the unlock decode now.
    for (const id of this.bytes.keys()) void this.buffer(id);
  }

  /** Starts fetching (and, once unlocked, decoding) lines that will be needed soon. */
  preload(ids: readonly string[]): void {
    for (const id of ids) {
      if (this.ctx) void this.buffer(id);
      else void this.fetch(id);
    }
  }

  /** Whether `id` can start at once (decoded). */
  isReady(id: string): boolean {
    return this.ready.has(id);
  }

  /**
   * Resolves once `id` can start at once: true when it's decoded, false if it can't load. Before the
   * unlock nothing can play, so it resolves true straight away (the caption needn't wait).
   */
  prepare(id: string): Promise<boolean> {
    if (!this.ctx) return Promise.resolve(true);
    return this.buffer(id).then((b) => !!b);
  }

  async play(
    lineId: string,
    onWord: WordCallback | null,
    words: readonly VoiceWordTiming[] = [],
  ): Promise<void> {
    this.stop();
    const token = this.token;
    const buffer = await this.buffer(lineId);
    const ctx = this.ctx;
    const bus = this.voiceBus;
    if (token !== this.token || !buffer || !ctx || !bus) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    this.activeSource = source;
    this.onDucking(true);
    this.subtitles.schedule(lineId, words, onWord);
    source.onended = () => {
      if (this.activeSource !== source) return;
      this.activeSource = null;
      this.subtitles.clear();
      this.onDucking(false);
    };
    source.start();
    await new Promise<void>((resolve) => source.addEventListener('ended', () => resolve(), { once: true }));
  }

  stop(): void {
    this.token++;
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

  private url(id: string): string {
    return new URL(`${id}.${this.format}`, this.baseUrl).toString();
  }

  private fetch(id: string): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(id);
    if (!p) {
      p = this.load(this.url(id)).catch(() => null);
      this.bytes.set(id, p);
      trim(this.bytes, BYTES_KEEP);
    }
    return p;
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return this.fetch(id).then(() => null);
    let p = this.decoded.get(id);
    if (p) {
      // Most recently used goes last, so it's trimmed last.
      this.decoded.delete(id);
      this.decoded.set(id, p);
      return p;
    }
    p = this.fetch(id)
      .then((data) => (data ? ctx.decodeAudioData(data.slice(0)) : null))
      .then((b) => {
        if (b) this.ready.add(id);
        // Decoded once: the compressed copy isn't needed again.
        this.bytes.delete(id);
        return b;
      })
      .catch(() => null);
    this.decoded.set(id, p);
    for (const key of this.decoded.keys()) {
      if (this.decoded.size <= DECODED_KEEP) break;
      this.decoded.delete(key);
      this.ready.delete(key);
    }
    return p;
  }
}

async function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.arrayBuffer();
}
