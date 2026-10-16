import { audioFileFor } from '../soundscape/format';
import { trackFor, trackGain, type IslandMusic, type MusicCue } from './tracks';

/** Fade-in when music starts from silence, and the crossfade between tracks. */
const FADE_IN_S = 1.2;
const CROSSFADE_S = 3;
/** After a stall (the track ran out of data on a slow connection), it comes back in over this. */
const RESUME_FADE_S = 0.6;
/** Shorter waits than this (a loop's seam) come back at once. */
const STALL_S = 0.25;
/** HTMLMediaElement.HAVE_FUTURE_DATA: it can play now. */
const HAVE_FUTURE_DATA = 3;

interface Deck {
  readonly element: HTMLAudioElement;
  /** Made when the track first plays (it needs the AudioContext); a prefetched track has none yet. */
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  /** Context time when this deck's fade-out ends and it can pause (null while it's wanted). */
  pauseAt: number | null;
  /** The fade to run once the track can play (it was asked for before it had data), or null. */
  pendingFade: number | null;
  /** Context time it ran out of data while playing, or null. */
  stalledAt: number | null;
}

/**
 * Streams the looping music tracks through the music bus (so the sliders, mute, and voice duck all
 * apply) and crossfades between them. Each track gets its own `<audio>` element, made when it's
 * prefetched or first needed; a track you leave pauses where it was, so coming back picks up mid-song.
 *
 * On a slow connection: a track that's asked for before it has data starts (and the old one hands
 * over) only once it can play, so it fades in instead of starting late at full level; a stall mid-song
 * fades back in when the data comes. Prefetching the next track (`prefetch`) avoids both.
 */
export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private bus: AudioNode | null = null;
  private readonly decks = new Map<MusicCue, Deck>();
  private wanted: MusicCue | null = null;
  private playing: MusicCue | null = null;

  constructor(
    private readonly baseUrl = `${import.meta.env.BASE_URL}audio/`,
    private readonly createElement: () => HTMLAudioElement = () => new Audio(),
  ) {}

  bind(ctx: AudioContext, bus: AudioNode): void {
    this.ctx = ctx;
    this.bus = bus;
    if (this.wanted) this.switchTo(this.wanted);
  }

  /**
   * Crossfades to `island`'s track (null fades to silence). `at` starts it from that many seconds
   * in (instead of picking up where it left off), and `fade` overrides the fade length.
   */
  setIsland(island: MusicCue | null, opts: { at?: number; fade?: number } = {}): void {
    this.wanted = island;
    if (this.ctx) this.switchTo(island, opts);
  }

  /** Starts buffering `cue`'s track (no sound, no gesture needed), so it can start at once later. */
  prefetch(cue: MusicCue): void {
    if (!this.decks.has(cue)) this.decks.set(cue, this.makeDeck(cue));
  }

  /**
   * Resolves once `cue`'s track has buffered to its end, or after `timeoutMs` (at once if it isn't
   * loading). Downloads that would compete with it wait for this (the title's head start on the island).
   */
  whenBuffered(cue: MusicCue, timeoutMs: number): Promise<void> {
    const el = this.decks.get(cue)?.element;
    if (!el) return Promise.resolve();
    return new Promise((resolve) => {
      const events = ['progress', 'canplaythrough', 'suspend', 'error'] as const;
      const done = () => {
        clearTimeout(timer);
        for (const e of events) el.removeEventListener?.(e, check);
        resolve();
      };
      const check = () => {
        if (bufferedToEnd(el) || el.error) done();
      };
      const timer = setTimeout(done, timeoutMs);
      for (const e of events) el.addEventListener?.(e, check);
      check();
    });
  }

  /** Seconds into `island`'s track while it's playing, or null (not playing, or it has ended). */
  position(island: IslandMusic): number | null {
    const deck = this.decks.get(island);
    if (!deck || deck.element.paused || this.playing !== island) return null;
    return deck.element.currentTime;
  }

  /** Retries playback on a later gesture if the browser refused to start the track earlier. */
  resume(): void {
    const deck = this.playing ? this.decks.get(this.playing) : undefined;
    if (deck?.element.paused) void deck.element.play().catch(() => undefined);
  }

  /** Pauses tracks whose fade-out has finished. */
  update(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const deck of this.decks.values()) {
      if (deck.pauseAt === null || now < deck.pauseAt) continue;
      deck.element.pause();
      deck.pauseAt = null;
    }
  }

  dispose(): void {
    for (const deck of this.decks.values()) {
      deck.element.pause();
      deck.element.removeAttribute('src');
      deck.element.load();
      deck.source?.disconnect();
      deck.gain?.disconnect();
    }
    this.decks.clear();
    this.ctx = null;
    this.bus = null;
    this.playing = null;
  }

  private switchTo(island: MusicCue | null, opts: { at?: number; fade?: number } = {}): void {
    if (!this.ctx || (island === this.playing && opts.at === undefined)) return;
    const now = this.ctx.currentTime;
    const fade = opts.fade ?? (this.playing && this.playing !== island ? CROSSFADE_S : FADE_IN_S);
    this.playing = island;
    if (!island) return this.fadeOthers(null, now, fade);
    const deck = this.connect(island, this.ctx);
    deck.pauseAt = null;
    deck.stalledAt = null;
    if (opts.at !== undefined) deck.element.currentTime = opts.at;
    const ready = deck.element.readyState >= HAVE_FUTURE_DATA;
    void deck.element.play().catch(() => undefined);
    // Not buffered yet: the track (and the handover) waits for its first data ('playing').
    if (ready) this.crossfadeTo(island, deck, now, fade);
    else deck.pendingFade = fade;
  }

  /** Fades `deck` up and every other sounding track down over `fade` seconds. */
  private crossfadeTo(cue: MusicCue, deck: Deck, now: number, fade: number): void {
    deck.pendingFade = null;
    if (deck.gain) ramp(deck.gain.gain, trackGain(trackFor(cue)), now, fade);
    this.fadeOthers(cue, now, fade);
  }

  private fadeOthers(keep: MusicCue | null, now: number, fade: number): void {
    for (const [cue, other] of this.decks) {
      if (cue === keep) continue;
      other.pendingFade = null;
      if (!other.gain || other.element.paused || other.pauseAt !== null) continue;
      ramp(other.gain.gain, 0, now, fade);
      other.pauseAt = now + fade;
    }
  }

  private onWaiting(cue: MusicCue): void {
    const deck = this.decks.get(cue);
    if (!deck || !this.ctx || this.playing !== cue || deck.pendingFade !== null) return;
    deck.stalledAt ??= this.ctx.currentTime;
  }

  private onPlaying(cue: MusicCue): void {
    const deck = this.decks.get(cue);
    const ctx = this.ctx;
    if (!deck || !ctx || this.playing !== cue) return;
    const now = ctx.currentTime;
    if (deck.pendingFade !== null) return this.crossfadeTo(cue, deck, now, deck.pendingFade);
    const stalledAt = deck.stalledAt;
    deck.stalledAt = null;
    if (stalledAt === null || now - stalledAt < STALL_S || !deck.gain) return;
    // Back from a stall: in over a moment, not at full level mid-phrase.
    const param = deck.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(0, now);
    param.linearRampToValueAtTime(trackGain(trackFor(cue)), now + RESUME_FADE_S);
  }

  private makeDeck(cue: MusicCue): Deck {
    const element = this.createElement();
    element.loop = !trackFor(cue).once;
    element.preload = 'auto';
    element.src = audioFileFor(`${this.baseUrl}${trackFor(cue).file}`, element);
    element.addEventListener?.('waiting', () => this.onWaiting(cue));
    element.addEventListener?.('playing', () => this.onPlaying(cue));
    return { element, source: null, gain: null, pauseAt: null, pendingFade: null, stalledAt: null };
  }

  /** The cue's deck, wired into the music bus. */
  private connect(cue: MusicCue, ctx: AudioContext): Deck {
    let deck = this.decks.get(cue);
    if (!deck) {
      deck = this.makeDeck(cue);
      this.decks.set(cue, deck);
    }
    if (!deck.source) {
      deck.source = ctx.createMediaElementSource(deck.element);
      deck.gain = ctx.createGain();
      deck.gain.gain.value = 0;
      deck.source.connect(deck.gain);
      if (this.bus) deck.gain.connect(this.bus);
    }
    return deck;
  }
}

/**
 * Whether the whole track is in the element's buffer, as one range: an Ogg file's last page loads
 * first (for its duration), so a range at the end doesn't mean the middle has arrived.
 */
function bufferedToEnd(el: HTMLAudioElement): boolean {
  const d = el.duration;
  const b = el.buffered;
  if (!b || !Number.isFinite(d) || d <= 0) return false;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= 0.5 && b.end(i) >= d - 0.5) return true;
  return false;
}

/** A linear ramp from wherever the gain is right now (even mid-fade) to `target`. */
function ramp(param: AudioParam, target: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}
