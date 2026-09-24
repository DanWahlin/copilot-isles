import { AnchorageComposer, type IslandMusic, type MusicLayer, type StingerName } from './music/composer';
import {
  IslesSoundScape,
  type BedName,
  type FootstepSurface,
  type SurfKind,
  type Vec3Like,
} from './soundscape/soundscape';
import type { SliceName } from './soundscape/bank';
import { VoicePlayer, type WordCallback } from './voice/player';

export interface IslesAudio {
  unlock(): Promise<boolean>;
  readonly music: {
    setIsland(island: IslandMusic): void;
    setLayer(name: MusicLayer, on: boolean): void;
    stinger(name: StingerName): void;
  };
  readonly sfx: {
    setListener(pos: Vec3Like, forward?: Vec3Like): void;
    surf(pos: Vec3Like, kind: SurfKind, intensity: number): void;
    footstep(surface: FootstepSurface, pos: Vec3Like): void;
    oneShot(name: SliceName, pos?: Vec3Like, gain?: number): void;
    setBed(name: BedName, gain: number): void;
    setTimeOfDay(night: number): void;
  };
  readonly volumes: VolumeControls;
  onWord: WordCallback | null;
  playVoice(lineId: string): Promise<void>;
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

  constructor(private readonly apply: (name: VolumeName, value: number) => void) {}

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
  readonly composer = new AnchorageComposer();
  readonly volumes = new VolumeControls((name) => this.applyVolume(name));
  onWord: WordCallback | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private readonly buses: Partial<Record<BusName, GainNode>> = {};
  private voicePlayer: VoicePlayer | null = null;
  private ducked = false;
  private unlocking: Promise<boolean> | null = null;

  readonly music = {
    setIsland: (island: IslandMusic) => this.composer.setIsland(island),
    setLayer: (name: MusicLayer, on: boolean) => this.composer.setLayer(name, on),
    stinger: (name: StingerName) => this.composer.stinger(name),
  };

  readonly sfx = {
    setListener: (pos: Vec3Like, forward?: Vec3Like) => this.soundscape.setListener(pos, forward),
    surf: (pos: Vec3Like, kind: SurfKind, intensity: number) => this.soundscape.surf(pos, kind, intensity),
    footstep: (surface: FootstepSurface, pos: Vec3Like) => this.soundscape.footstep(surface, pos),
    oneShot: (name: SliceName, pos?: Vec3Like, gain?: number) => this.soundscape.oneShot(name, pos, gain),
    setBed: (name: BedName, gain: number) => this.soundscape.setBed(name, gain),
    setTimeOfDay: (night: number) => this.soundscape.setTimeOfDay(night),
  };

  unlock(): Promise<boolean> {
    this.unlocking ??= this.doUnlock();
    return this.unlocking;
  }

  async playVoice(lineId: string): Promise<void> {
    if (!this.voicePlayer) return;
    await this.voicePlayer.play(lineId, this.onWord);
  }

  update(dt: number): void {
    void dt;
    this.composer.update();
    this.soundscape.update();
  }

  dispose(): void {
    this.voicePlayer?.stop();
    this.composer.dispose();
    this.soundscape.dispose();
    this.limiter?.disconnect();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.voicePlayer = null;
  }

  private async doUnlock(): Promise<boolean> {
    const ctor = this.audioCtor();
    if (!ctor) return false;
    try {
      const ctx = new ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.buildGraph(ctx);
      if (ctx.state === 'suspended') await ctx.resume();
      const audioElement = typeof document === 'undefined' ? null : document.createElement('audio');
      const ambience = this.buses.ambience;
      const sfx = this.buses.sfx;
      const music = this.buses.music;
      const voice = this.buses.voice;
      if (ambience && sfx) this.soundscape.bind(ctx, { ambience, sfx }, audioElement);
      if (music) await this.composer.bind(ctx, music);
      if (voice) {
        this.voicePlayer = new VoicePlayer(
          new URL(`${import.meta.env.BASE_URL}voice/testcove/manifest.json`, location.href).toString(),
          ctx,
          voice,
          audioElement,
          (ducked) => this.setDucked(ducked),
        );
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
    this.master.connect(this.limiter);
    for (const name of BUS_NAMES) {
      const bus = ctx.createGain();
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
    const value = this.volumes.valueOf(name) ** 2;
    if (name === 'master') {
      this.ramp(this.master?.gain, value, 0.05);
      return;
    }
    const duck = name === 'music' && this.ducked ? DUCK_GAIN : 1;
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
