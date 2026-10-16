import { describe, expect, it } from 'vitest';
import { MusicPlayer } from './music-player';
import { BATTLE_TRACK, MUSIC_TRACKS, trackGain } from './tracks';

class FakeParam {
  value = 0;
  target = 0;
  endsAt = 0;
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.target = value;
    this.endsAt = time;
  }
}

class FakeNode {
  connected = true;
  connect<T>(node: T): T {
    return node;
  }
  disconnect(): void {
    this.connected = false;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeContext {
  currentTime = 10;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeNode[] = [];
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createMediaElementSource(): FakeNode {
    const source = new FakeNode();
    this.sources.push(source);
    return source;
  }
}

class FakeElement {
  src = '';
  currentTime = 0;
  loop = false;
  preload = '';
  paused = true;
  plays = 0;
  refuse = false;
  /** HAVE_ENOUGH_DATA unless a test says the track hasn't buffered yet. */
  readyState = 4;
  private readonly listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  canPlayType(type: string): string {
    return type.includes('opus') ? 'probably' : '';
  }
  play(): Promise<void> {
    this.plays++;
    if (this.refuse) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

function setup() {
  const elements: FakeElement[] = [];
  const player = new MusicPlayer('/audio/', () => {
    const element = new FakeElement();
    elements.push(element);
    return element as unknown as HTMLAudioElement;
  });
  const ctx = new FakeContext();
  const bind = () => player.bind(ctx as unknown as AudioContext, new FakeNode() as unknown as AudioNode);
  return { player, ctx, elements, bind };
}

describe('MusicPlayer', () => {
  it('waits for the audio unlock, then fades in the wanted track as a looping stream', () => {
    const { player, ctx, elements, bind } = setup();
    player.setIsland('harbour');
    expect(elements).toHaveLength(0);
    bind();
    expect(elements).toHaveLength(1);
    expect(elements[0]!.src).toBe('/audio/music_bamboo_tide.ogg');
    expect(elements[0]!.loop).toBe(true);
    expect(elements[0]!.paused).toBe(false);
    expect(ctx.gains[0]!.gain.target).toBeCloseTo(trackGain(MUSIC_TRACKS.harbour));
  });

  it('plays the sea-battle track for the battle cue', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('battle');
    expect(elements[0]!.src).toBe('/audio/music_brass_of_the_storm.ogg');
    expect(ctx.gains[0]!.gain.target).toBeCloseTo(trackGain(BATTLE_TRACK));
  });

  it('crossfades to the island track and pauses the sea track once it has faded out', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    player.setIsland('anchorage');
    const [sea, island] = elements;
    const [seaGain, islandGain] = ctx.gains;
    expect(island!.src).toBe('/audio/music_bards_tale.ogg');
    expect(islandGain!.gain.target).toBeCloseTo(trackGain(MUSIC_TRACKS.anchorage));
    expect(seaGain!.gain.target).toBe(0);
    player.update();
    expect(sea!.paused).toBe(false);
    ctx.currentTime = seaGain!.gain.endsAt;
    player.update();
    expect(sea!.paused).toBe(true);
    expect(island!.paused).toBe(false);
  });

  it('resumes the same element when you sail back, and cancels a pending pause', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    player.setIsland('anchorage');
    player.setIsland('harbour');
    expect(elements).toHaveLength(2);
    ctx.currentTime += 60;
    player.update();
    expect(elements[0]!.paused).toBe(false);
    expect(elements[1]!.paused).toBe(true);
  });

  it('sails on from Anchorage to Port Meridian with its own track', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('anchorage');
    player.setIsland('meridian');
    const [anchorage, meridian] = elements;
    expect(meridian!.src).toBe('/audio/music_sunset_plains.ogg');
    expect(ctx.gains[1]!.gain.target).toBeCloseTo(trackGain(MUSIC_TRACKS.meridian));
    ctx.currentTime = ctx.gains[0]!.gain.endsAt;
    player.update();
    expect(anchorage!.paused).toBe(true);
    expect(meridian!.paused).toBe(false);
  });

  it('ignores a repeat request for the track that is already playing', () => {
    const { player, elements, bind } = setup();
    bind();
    player.setIsland('anchorage');
    player.setIsland('anchorage');
    expect(elements[0]!.plays).toBe(1);
  });

  it('retries playback on a later gesture if the browser refused it', () => {
    const { player, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    const element = elements[0]!;
    element.pause();
    element.refuse = true;
    player.resume();
    expect(element.paused).toBe(true);
    element.refuse = false;
    player.resume();
    expect(element.paused).toBe(false);
  });

  it('brings both tracks to the same loudness', () => {
    for (const track of [...Object.values(MUSIC_TRACKS), BATTLE_TRACK]) {
      expect(track.lufs + 20 * Math.log10(trackGain(track))).toBeCloseTo(-13.7, 6);
    }
  });

  it('stops, unloads, and disconnects every track on dispose', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    player.setIsland('anchorage');
    player.dispose();
    expect(elements.every((element) => element.paused && element.src === '')).toBe(true);
    expect([...ctx.gains, ...ctx.sources].every((node) => !node.connected)).toBe(true);
  });

  it('fades to silence, then plays the opening cue once from where it is asked to start', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    player.setIsland(null, { fade: 2.5 });
    expect(ctx.gains[0]!.gain.target).toBe(0);
    expect(ctx.gains[0]!.gain.endsAt).toBeCloseTo(ctx.currentTime + 2.5);
    expect(elements).toHaveLength(1);
    player.setIsland('opening', { at: 0, fade: 0.15 });
    const cue = elements[1]!;
    expect(cue.src).toBe('/audio/music_island_reveal.ogg');
    expect(cue.loop).toBe(false);
    expect(cue.paused).toBe(false);
    // Asking for it again at another moment restarts it there (a skip), with no second element.
    cue.currentTime = 4;
    player.setIsland('opening', { at: 9.4 });
    expect(elements).toHaveLength(2);
    expect(cue.currentTime).toBe(9.4);
  });

  it('prefetches a track before the unlock without playing it, and plays that element later', () => {
    const { player, elements, bind } = setup();
    player.prefetch('opening');
    expect(elements).toHaveLength(1);
    expect(elements[0]!.src).toBe('/audio/music_island_reveal.ogg');
    expect(elements[0]!.preload).toBe('auto');
    expect(elements[0]!.plays).toBe(0);
    player.prefetch('opening');
    bind();
    player.setIsland('opening', { at: 0 });
    expect(elements).toHaveLength(1);
    expect(elements[0]!.paused).toBe(false);
  });

  it('holds the handover until a track that has not buffered yet can play', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    player.prefetch('anchorage');
    const island = elements[1]!;
    island.readyState = 0;
    player.setIsland('anchorage');
    const [seaGain, islandGain] = ctx.gains;
    // The sea keeps playing; the island track waits at silence.
    expect(seaGain!.gain.target).toBeCloseTo(trackGain(MUSIC_TRACKS.harbour));
    expect(islandGain!.gain.target).toBe(0);
    ctx.currentTime = 20;
    island.readyState = 4;
    island.emit('playing');
    expect(seaGain!.gain.target).toBe(0);
    expect(islandGain!.gain.target).toBeCloseTo(trackGain(MUSIC_TRACKS.anchorage));
    expect(islandGain!.gain.endsAt).toBeCloseTo(23);
  });

  it('fades back in after a stall, but not after a blip', () => {
    const { player, ctx, elements, bind } = setup();
    bind();
    player.setIsland('harbour');
    const gain = ctx.gains[0]!.gain;
    const target = trackGain(MUSIC_TRACKS.harbour);
    elements[0]!.emit('waiting');
    ctx.currentTime += 0.1;
    gain.endsAt = 0;
    elements[0]!.emit('playing');
    expect(gain.endsAt).toBe(0);
    elements[0]!.emit('waiting');
    ctx.currentTime += 2;
    elements[0]!.emit('playing');
    expect(gain.value).toBe(0);
    expect(gain.target).toBeCloseTo(target);
    expect(gain.endsAt).toBeCloseTo(ctx.currentTime + 0.6);
  });

  it('waits for the whole track in one buffered range (an Ogg file loads its last page first)', async () => {
    const { player, elements } = setup();
    player.prefetch('harbour');
    const el = elements[0] as FakeElement & {
      duration: number;
      buffered: unknown;
      removeEventListener(): void;
    };
    const ranges = (r: [number, number][]) => ({
      length: r.length,
      start: (i: number) => r[i]![0],
      end: (i: number) => r[i]![1],
    });
    el.duration = 150;
    el.buffered = ranges([
      [0, 7],
      [148, 150],
    ]);
    el.removeEventListener = () => undefined;
    let done = false;
    const wait = player.whenBuffered('harbour', 60_000).then(() => (done = true));
    el.emit('progress');
    await Promise.resolve();
    expect(done).toBe(false);
    el.buffered = ranges([[0, 150]]);
    el.emit('progress');
    await wait;
    expect(done).toBe(true);
  });

  it('resolves at once for a track that is not loading', async () => {
    const { player } = setup();
    await expect(player.whenBuffered('battle', 60_000)).resolves.toBeUndefined();
  });
});
