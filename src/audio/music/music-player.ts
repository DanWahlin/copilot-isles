import { audioFileFor } from '../soundscape/format';
import { trackFor, trackGain, type MusicCue } from './tracks';

/** Fade-in when music starts from silence, and the crossfade between tracks. */
const FADE_IN_S = 1.2;
const CROSSFADE_S = 3;

interface Deck {
  readonly element: HTMLAudioElement;
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  /** Context time when this deck's fade-out ends and it can pause (null while it's wanted). */
  pauseAt: number | null;
}

/**
 * Streams the looping music tracks through the music bus (so the sliders, mute, and voice duck all
 * apply) and crossfades between them. Each track gets its own `<audio>` element, created the first
 * time it's needed; a track you leave pauses where it was, so coming back picks up mid-song.
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

  setIsland(island: MusicCue): void {
    this.wanted = island;
    if (this.ctx) this.switchTo(island);
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
      deck.source.disconnect();
      deck.gain.disconnect();
    }
    this.decks.clear();
    this.ctx = null;
    this.bus = null;
    this.playing = null;
  }

  private switchTo(island: MusicCue): void {
    if (island === this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    const previous = this.playing ? this.decks.get(this.playing) : undefined;
    const fade = previous ? CROSSFADE_S : FADE_IN_S;
    if (previous) {
      ramp(previous.gain.gain, 0, now, fade);
      previous.pauseAt = now + fade;
    }
    const deck = this.decks.get(island) ?? this.createDeck(island, this.ctx);
    deck.pauseAt = null;
    ramp(deck.gain.gain, trackGain(trackFor(island)), now, fade);
    void deck.element.play().catch(() => undefined);
    this.playing = island;
  }

  private createDeck(island: MusicCue, ctx: AudioContext): Deck {
    const element = this.createElement();
    element.loop = true;
    element.preload = 'auto';
    element.src = audioFileFor(`${this.baseUrl}${trackFor(island).file}`, element);
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    if (this.bus) gain.connect(this.bus);
    const deck: Deck = { element, source, gain, pauseAt: null };
    this.decks.set(island, deck);
    return deck;
  }
}

/** A linear ramp from wherever the gain is right now (even mid-fade) to `target`. */
function ramp(param: AudioParam, target: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}
