import { describe, expect, it } from 'vitest';
import { MusicPlayer } from './music-player';
import { MUSIC_TRACKS, trackGain } from './tracks';

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
  loop = false;
  preload = '';
  paused = true;
  plays = 0;
  refuse = false;
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
    for (const track of Object.values(MUSIC_TRACKS)) {
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
});
