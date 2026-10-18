import { courseVoiceBase, courseVoiced } from '../course/catalog';
import { MusicPlayer } from './music/music-player';
import type { IslandMusic, MusicCue } from './music/tracks';
import {
  IslesSoundScape,
  type BedName,
  type FootstepSurface,
  type SoundLoopHandle,
  type SoundLoopName,
  type SurfKind,
  type Vec3Like,
} from './soundscape/soundscape';
import type { SliceName, SoundName } from './soundscape/bank';
import { VoicePlayer, chooseVoiceFormat, type VoiceWordTiming, type WordCallback } from './voice/player';
import { MUSIC_TRIM } from './beds';
import { takeAudioContext } from './early-context';

export { AMBIENT_BEDS } from './beds';

export interface IslesAudio {
  unlock(): Promise<boolean>;
  readonly music: {
    /**
     * Crossfades to the track for where you are (the title and open sea, ashore, or the opening's
     * cue); null fades to silence. `at` starts it from that many seconds in; `fade` sets the fade.
     */
    setIsland(island: MusicCue | null, opts?: { at?: number; fade?: number }): void;
    /** Seconds into `island`'s track while it's playing, or null (not playing, or it has ended). */
    position(island: IslandMusic): number | null;
    /**
     * Starts buffering a track that's coming up (the title's on the title, the opening's on the
     * captain screen, an island's as it streams in, the battle's when one's set), so it starts at once.
     */
    prefetch(cue: MusicCue): void;
    /** Resolves once a prefetched track has buffered to its end, or after `timeoutMs`. */
    whenBuffered(cue: MusicCue, timeoutMs: number): Promise<void>;
  };
  readonly sfx: {
    setListener(pos: Vec3Like, forward?: Vec3Like): void;
    surf(pos: Vec3Like, kind: SurfKind, intensity: number): void;
    footstep(surface: FootstepSurface, pos: Vec3Like): void;
    oneShot(name: SliceName, pos?: Vec3Like, gain?: number): void;
    loop(name: SoundLoopName, pos: Vec3Like, gain?: number): SoundLoopHandle;
    setBed(name: BedName, gain: number): void;
    setTimeOfDay(night: number): void;
    /** Starts loading sounds ahead of their first play, so it isn't dropped while they download. */
    preload(names: readonly SoundName[]): Promise<void>;
  };
  readonly volumes: VolumeControls;
  onWord: WordCallback | null;
  /** Plays a voice line (`words` drive `onWord`, for the dev page). */
  playVoice(lineId: string, words?: readonly VoiceWordTiming[]): Promise<void>;
  /** Starts fetching (and, once unlocked, decoding) voice lines that will be needed soon. */
  preloadVoice(ids: readonly string[]): void;
  /** Resolves once a line can start at once (true), or false if it can't load. */
  prepareVoice(lineId: string): Promise<boolean>;
  /** Whether a line can start at once (also true while sound is locked: there's nothing to wait for). */
  voiceReady(lineId: string): boolean;
  /** Stops the current voice line (skip) and releases the music duck. */
  stopVoice(): void;
  update(dt: number): void;
  dispose(): void;
}

type VolumeName = 'master' | 'music' | 'ambience' | 'sfx' | 'voice' | 'ui';
type BusName = Exclude<VolumeName, 'master'>;

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;
type AudioGlobal = typeof globalThis & {
  readonly webkitAudioContext?: AudioContextCtor;
};

const BUS_NAMES: readonly BusName[] = ['music', 'ambience', 'sfx', 'voice', 'ui'];
const DUCK_GAIN = 10 ** (-8 / 20);

export class VolumeControls {
  private readonly values: Record<VolumeName, number> = {
    master: 0.85,
    music: 0.82,
    ambience: 0.8,
    sfx: 0.86,
    voice: 1,
    ui: 0.82,
  };

  private mutedValue = false;

  constructor(private readonly apply: (name: VolumeName, value: number) => void) {}

  /** Silences everything without touching the levels, so unmuting restores the mix. */
  get muted(): boolean {
    return this.mutedValue;
  }
  set muted(value: boolean) {
    if (value === this.mutedValue) return;
    this.mutedValue = value;
    this.apply('master', this.values.master);
  }

  /** The master gain to apply right now (0 while muted). */
  get masterGain(): number {
    return this.mutedValue ? 0 : this.values.master ** 2;
  }

  get master(): number {
    return this.values.master;
  }
  set master(value: number) {
    this.set('master', value);
  }

  get music(): number {
    return this.values.music;
  }
  set music(value: number) {
    this.set('music', value);
  }

  get ambience(): number {
    return this.values.ambience;
  }
  set ambience(value: number) {
    this.set('ambience', value);
  }

  get sfx(): number {
    return this.values.sfx;
  }
  set sfx(value: number) {
    this.set('sfx', value);
  }

  get voice(): number {
    return this.values.voice;
  }
  set voice(value: number) {
    this.set('voice', value);
  }

  get ui(): number {
    return this.values.ui;
  }
  set ui(value: number) {
    this.set('ui', value);
  }

  valueOf(name: VolumeName): number {
    return this.values[name];
  }

  private set(name: VolumeName, value: number): void {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : this.values[name]));
    this.values[name] = clamped;
    this.apply(name, clamped);
  }
}

class IslesAudioImpl implements IslesAudio {
  readonly soundscape = new IslesSoundScape();
  readonly musicPlayer = new MusicPlayer();
  readonly volumes = new VolumeControls((name) => this.applyVolume(name));
  onWord: WordCallback | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private readonly buses: Partial<Record<BusName, GainNode>> = {};
  private voicePlayer: VoicePlayer | null = null;
  private voiceBound = false;
  /** The folder the voice player reads (the course's). */
  private voiceBase = '';
  /** Binds a voice player to the unlocked graph (a course picked later gets its own player). */
  private bindVoice: ((p: VoicePlayer) => void) | null = null;
  private ducked = false;
  private unlocking: Promise<boolean> | null = null;

  readonly music = {
    setIsland: (island: MusicCue | null, opts?: { at?: number; fade?: number }) =>
      this.musicPlayer.setIsland(island, opts),
    position: (island: IslandMusic) => this.musicPlayer.position(island),
    prefetch: (cue: MusicCue) => this.musicPlayer.prefetch(cue),
    whenBuffered: (cue: MusicCue, timeoutMs: number) => this.musicPlayer.whenBuffered(cue, timeoutMs),
  };

  readonly sfx = {
    setListener: (pos: Vec3Like, forward?: Vec3Like) => this.soundscape.setListener(pos, forward),
    surf: (pos: Vec3Like, kind: SurfKind, intensity: number) => this.soundscape.surf(pos, kind, intensity),
    footstep: (surface: FootstepSurface, pos: Vec3Like) => this.soundscape.footstep(surface, pos),
    oneShot: (name: SliceName, pos?: Vec3Like, gain?: number) => this.soundscape.oneShot(name, pos, gain),
    loop: (name: SoundLoopName, pos: Vec3Like, gain?: number) => this.soundscape.loop(name, pos, gain),
    setBed: (name: BedName, gain: number) => this.soundscape.setBed(name, gain),
    preload: (names: readonly SoundName[]) => this.soundscape.preload(names),
    setTimeOfDay: (night: number) => this.soundscape.setTimeOfDay(night),
  };

  unlock(): Promise<boolean> {
    // A context that started before the page had a gesture stays suspended; each later gesture resumes it.
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    this.musicPlayer.resume();
    this.unlocking ??= this.doUnlock();
    return this.unlocking;
  }

  async playVoice(lineId: string, words?: readonly VoiceWordTiming[]): Promise<void> {
    if (!this.voiceBound) return;
    await this.voice()?.play(lineId, this.onWord, words);
  }

  preloadVoice(ids: readonly string[]): void {
    this.voice()?.preload(ids);
  }

  prepareVoice(lineId: string): Promise<boolean> {
    if (!this.voiceBound) return Promise.resolve(true);
    return this.voice()?.prepare(lineId) ?? Promise.resolve(true);
  }

  voiceReady(lineId: string): boolean {
    return !this.voiceBound || (this.voice()?.isReady(lineId) ?? true);
  }

  stopVoice(): void {
    this.voicePlayer?.stop();
  }

  update(dt: number): void {
    void dt;
    this.musicPlayer.update();
    this.soundscape.update();
  }

  dispose(): void {
    this.voicePlayer?.stop();
    this.musicPlayer.dispose();
    this.soundscape.dispose();
    this.limiter?.disconnect();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.voicePlayer = null;
    this.voiceBound = false;
    this.bindVoice = null;
  }

  /**
   * The current course's voice player (made on first use: it only fetches until the unlock binds it).
   * A text-only course has none: its lines are captions, so nothing's fetched or waited for.
   */
  private voice(): VoicePlayer | null {
    if (typeof document === 'undefined' || !courseVoiced()) return null;
    const base = new URL(courseVoiceBase(), location.href).toString();
    if (this.voicePlayer && this.voiceBase === base) return this.voicePlayer;
    // Another course was picked: its lines come from its own folder.
    this.voicePlayer?.stop();
    this.voiceBase = base;
    this.voicePlayer = new VoicePlayer(base, chooseVoiceFormat(document.createElement('audio')));
    if (this.voiceBound) this.bindVoice?.(this.voicePlayer);
    return this.voicePlayer;
  }

  private async doUnlock(): Promise<boolean> {
    const ctor = this.audioCtor();
    if (!ctor) return false;
    try {
      // Made while the page loaded (early-context.ts), so the gesture only resumes it.
      const ctx = takeAudioContext() ?? new ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.buildGraph(ctx);
      if (ctx.state === 'suspended') await ctx.resume();
      const audioElement = typeof document === 'undefined' ? null : document.createElement('audio');
      const ambience = this.buses.ambience;
      const sfx = this.buses.sfx;
      const music = this.buses.music;
      const voice = this.buses.voice;
      if (ambience && sfx) this.soundscape.bind(ctx, { ambience, sfx }, audioElement);
      if (music) this.musicPlayer.bind(ctx, music);
      if (voice) {
        this.bindVoice = (p) => p.bind(ctx, voice, (ducked) => this.setDucked(ducked));
        const player = this.voice();
        if (player) this.bindVoice(player);
        this.voiceBound = true;
      }
      this.applyAllVolumes();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  private buildGraph(ctx: AudioContext): void {
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    // Start at the real levels (0 if muted), not the node default of 1, so nothing blips on unlock.
    this.master.gain.value = this.volumes.masterGain;
    this.master.connect(this.limiter);
    for (const name of BUS_NAMES) {
      const bus = ctx.createGain();
      bus.gain.value = this.volumes.valueOf(name) ** 2 * (name === 'music' ? MUSIC_TRIM : 1);
      bus.connect(this.master);
      this.buses[name] = bus;
    }
  }

  private applyAllVolumes(): void {
    this.applyVolume('master');
    for (const name of BUS_NAMES) this.applyVolume(name);
  }

  private applyVolume(name: VolumeName): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (name === 'master') {
      this.ramp(this.master?.gain, this.volumes.masterGain, 0.05);
      return;
    }
    const value = this.volumes.valueOf(name) ** 2;
    const duck = name === 'music' ? MUSIC_TRIM * (this.ducked ? DUCK_GAIN : 1) : 1;
    this.ramp(this.buses[name]?.gain, value * duck, 0.08);
  }

  private setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyVolume('music');
  }

  private ramp(param: AudioParam | undefined, value: number, seconds: number): void {
    if (!param || !this.ctx) return;
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }

  private audioCtor(): AudioContextCtor | null {
    const global = globalThis as AudioGlobal;
    return global.AudioContext ?? global.webkitAudioContext ?? null;
  }
}

export function createAudio(): IslesAudio {
  return new IslesAudioImpl();
}
