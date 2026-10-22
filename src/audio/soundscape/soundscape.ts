// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/audio/SoundScape.js@d32799f

import { BANK, type LoopName, type SliceName, type SoundName } from './bank';
import { chooseAudioFormat } from './format';
import { VoiceLimiter, type LimitedVoice } from './voice-limiter';
import { clamp } from '../../util/math';
import { seaState } from '../../world/ocean/sea-state';

export type SurfKind = 'crash' | 'wash' | 'backwash';
export type FootstepSurface = 'sand' | 'wetsand' | 'wood' | 'rock' | 'grass' | 'water';
export type BedName = Extract<
  LoopName,
  | 'wind'
  | 'palms'
  | 'surf_far'
  | 'birds_dawn'
  | 'gulls_far'
  | 'crickets'
  | 'opening_cabin'
  | 'rain_canopy'
  | 'frogs_dusk'
>;
export type SoundLoopName = Extract<
  LoopName,
  | 'stream'
  | 'waterfall_small'
  | 'wheel_creak'
  | 'waterfall_large'
  | 'booth_kalimba'
  | 'booth_flute'
  | 'booth_rainstick'
>;

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SoundBuses {
  readonly ambience: GainNode;
  readonly sfx: GainNode;
}

export interface SoundLoopHandle {
  setGain(gain: number): void;
  setPos(pos: Vec3Like): void;
  stop(): void;
}

interface ActiveVoice extends LimitedVoice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly extras: AudioNode[];
}

interface ActiveBed {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly name: BedName;
}

interface ActiveLoop {
  source: AudioBufferSourceNode | null;
  readonly gain: GainNode;
  readonly pan: PannerNode;
  stopped: boolean;
}

const BED_NAMES: readonly BedName[] = [
  'wind',
  'palms',
  'surf_far',
  'birds_dawn',
  'gulls_far',
  'crickets',
  'opening_cabin',
  'rain_canopy',
  'frogs_dusk',
];
const FOOTSTEP_BANK: Readonly<Record<FootstepSurface, SliceName>> = {
  sand: 'step_sand',
  wetsand: 'step_wetsand',
  wood: 'step_wood',
  rock: 'step_rock',
  grass: 'step_grass',
  water: 'step_water',
};
const SURF_BANK: Readonly<Record<SurfKind, SliceName>> = {
  crash: 'surf_crash',
  wash: 'surf_wash',
  backwash: 'surf_backwash',
};
const CAPS = {
  step: 3,
  crash: 7,
  wash: 5,
  backwash: 5,
  gull: 2,
  tern: 2,
  bird: 4,
  splash: 3,
  hull: 3,
  cannon: 6,
  cannon_far: 4,
  whiz: 3,
  timber: 4,
  groan: 1,
  puzzle: 4,
  opening: 5,
} as const;
const MIX = {
  step: -50,
  crash: -15,
  wash: -20,
  backwash: -23,
  gull: -21,
  tern: -25,
  bird: -31,
  dove: -34,
  splash: -30,
  hull: -24,
  cannon: -17.5,
  cannon_far: -24,
  whiz: -26,
  timber: -21,
  groan: -24,
  puzzle: -24,
  chime: -20,
  thud: -24,
  opening: -21,
} as const;
const MONO_TRIM = Math.pow(10, -3 / 20);
const DEFAULT_FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };

function dB(value: number): number {
  return Math.pow(10, value / 20);
}

function hasSlices(entry: (typeof BANK)[SoundName]): entry is (typeof BANK)[SliceName] {
  return 'slices' in entry;
}

function safeNow(ctx: AudioContext | null): number {
  return ctx?.currentTime ?? 0;
}

const NOOP_LOOP_HANDLE: SoundLoopHandle = {
  setGain: () => undefined,
  setPos: () => undefined,
  stop: () => undefined,
};

function setPannerPosition(pan: PannerNode, pos: Vec3Like): void {
  pan.positionX.value = pos.x;
  pan.positionY.value = pos.y;
  pan.positionZ.value = pos.z;
}

function isPuzzleOneShot(name: SliceName): boolean {
  return (
    name === 'stone_turn' ||
    name === 'lever' ||
    name === 'gate_lift' ||
    name === 'chime_solve' ||
    name === 'crane_ratchet' ||
    name === 'crate_thud' ||
    name === 'gear_pickup' ||
    name === 'gear_hang' ||
    name === 'quill' ||
    name === 'tube_voice' ||
    name === 'hatch_clank' ||
    name === 'bottle_pop' ||
    name === 'coconut_crack' ||
    name === 'crowd_cheer_christening' ||
    name === 'stinger_triumph' ||
    name === 'lute_strum' ||
    name === 'gondola_bell' ||
    name === 'rope_hoist' ||
    name === 'rock_tumble'
  );
}

export class IslesSoundScape {
  private ctx: AudioContext | null = null;
  private buses: SoundBuses | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Map<SoundName, Promise<void>>();
  /** Files fetched before the unlock (or still decoding), by name. */
  private readonly bytes = new Map<SoundName, Promise<ArrayBuffer | null>>();
  private readonly beds = new Map<BedName, ActiveBed>();
  private readonly positionalLoops = new Set<ActiveLoop>();
  private readonly limiter = new VoiceLimiter<ActiveVoice>(CAPS);
  private readonly bedTargets: Record<BedName, number> = {
    wind: 0,
    palms: 0,
    surf_far: 0,
    birds_dawn: 0,
    gulls_far: 0,
    crickets: 0,
    opening_cabin: 0,
    rain_canopy: 0,
    frogs_dusk: 0,
  };
  private readonly lastSlice: Partial<Record<SliceName, number>> = {};
  private baseUrl: string;
  private extension: '.ogg' | '.m4a' | null = null;
  private listenerX = 0;
  private listenerY = 1.7;
  private listenerZ = 0;
  private forwardX = DEFAULT_FORWARD.x;
  private forwardY = DEFAULT_FORWARD.y;
  private forwardZ = DEFAULT_FORWARD.z;
  private night = 0;

  constructor(baseUrl = `${import.meta.env.BASE_URL}audio/`) {
    this.baseUrl = baseUrl;
  }

  bind(
    ctx: AudioContext,
    buses: SoundBuses,
    audioElement: Pick<HTMLAudioElement, 'canPlayType'> | null,
  ): void {
    this.ctx = ctx;
    this.buses = buses;
    this.extension = chooseAudioFormat(audioElement).extension;
    // Sounds fetched before the unlock (preload) decode now.
    for (const name of this.bytes.keys()) void this.want(name);
  }

  setListener(pos: Vec3Like, forward: Vec3Like = DEFAULT_FORWARD): void {
    this.listenerX = pos.x;
    this.listenerY = pos.y;
    this.listenerZ = pos.z;
    const len = Math.hypot(forward.x, forward.y, forward.z) || 1;
    this.forwardX = forward.x / len;
    this.forwardY = forward.y / len;
    this.forwardZ = forward.z / len;
    this.placeListener();
  }

  surf(pos: Vec3Like, kind: SurfKind, intensity: number): void {
    const gain = clamp(intensity, 0, 1);
    this.oneShotAt(
      SURF_BANK[kind],
      kind,
      pos,
      MIX[kind] - (1 - gain) * 12,
      0.92 + Math.random() * 0.12,
      8,
      1.15,
    );
  }

  footstep(surface: FootstepSurface, pos: Vec3Like): void {
    this.oneShotAt(
      FOOTSTEP_BANK[surface],
      'step',
      pos,
      MIX.step + (Math.random() - 0.5) * 3,
      0.94 + Math.random() * 0.12,
      2,
      1.4,
    );
  }

  oneShot(name: SliceName, pos?: Vec3Like, gain = 1): void {
    const target = clamp(gain, 0, 4);
    const category = this.categoryFor(name);
    const lufs = this.targetFor(name) + 20 * Math.log10(Math.max(target, 0.001));
    if (pos) this.oneShotAt(name, category, pos, lufs, 0.96 + Math.random() * 0.08, 8, 1);
    else this.playSlice(name, category, this.buses?.sfx ?? null, lufs, 0.96 + Math.random() * 0.08);
  }

  loop(name: SoundLoopName, pos: Vec3Like, gain = 1): SoundLoopHandle {
    const ctx = this.ctx;
    const bus = this.buses?.sfx;
    if (!ctx || !bus) return NOOP_LOOP_HANDLE;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = name === 'waterfall_large' ? 16 : name === 'waterfall_small' ? 6 : 4;
    pan.rolloffFactor = 1.15;
    pan.maxDistance = 220;
    setPannerPosition(pan, pos);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(pan).connect(bus);
    const loop: ActiveLoop = { source: null, gain: gainNode, pan, stopped: false };
    this.positionalLoops.add(loop);
    this.ramp(gainNode.gain, clamp(gain, 0, 1.5), 0.15);
    void this.want(name).then((buffer) => {
      if (!buffer || loop.stopped || !this.ctx) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gainNode);
      source.start(this.ctx.currentTime + 0.02, Math.random() * buffer.duration);
      loop.source = source;
    });
    return {
      setGain: (value) => {
        if (loop.stopped) return;
        this.ramp(gainNode.gain, clamp(value, 0, 1.5), 0.12);
      },
      setPos: (value) => {
        if (!loop.stopped) setPannerPosition(pan, value);
      },
      stop: () => this.stopLoop(loop),
    };
  }

  setBed(name: BedName, gain: number): void {
    this.bedTargets[name] = clamp(gain, 0, 1);
    if (gain > 0) void this.want(name);
  }

  setTimeOfDay(night: number): void {
    this.night = clamp(night, 0, 1);
  }

  update(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.placeListener();
    const now = this.ctx.currentTime;
    for (const name of BED_NAMES) {
      const target = this.dayNightBedGain(name, this.bedTargets[name]);
      this.updateBed(name, target, now);
    }
  }

  dispose(): void {
    for (const bed of this.beds.values()) {
      try {
        bed.source.stop();
      } catch {
        // already stopped
      }
    }
    for (const loop of this.positionalLoops) this.stopLoop(loop);
    this.beds.clear();
    this.positionalLoops.clear();
    this.buffers.clear();
    this.loading.clear();
    this.bytes.clear();
    this.ctx = null;
    this.buses = null;
  }

  private placeListener(): void {
    const listener = this.ctx?.listener;
    if (!listener) return;
    listener.positionX.value = this.listenerX;
    listener.positionY.value = this.listenerY;
    listener.positionZ.value = this.listenerZ;
    listener.forwardX.value = this.forwardX;
    listener.forwardY.value = this.forwardY;
    listener.forwardZ.value = this.forwardZ;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  private dayNightBedGain(name: BedName, base: number): number {
    if (name === 'birds_dawn' || name === 'gulls_far') return base * (1 - this.night);
    if (name === 'crickets') return base * this.night;
    // The sea state's wind and sea (Breeze × 1): a Calm's hush, a Gale's roar.
    if (name === 'wind') return Math.min(1, base * seaState.live.windBed);
    if (name === 'surf_far') return Math.min(1, base * seaState.live.surfBed);
    return base;
  }

  /**
   * Starts loading sounds now, so their first play isn't dropped while they download (the opening's
   * cabin sounds, a battle's first broadside). Before the unlock it only fetches them; they decode
   * when the audio engine starts. Callers may ignore the promise.
   */
  preload(names: readonly SoundName[]): Promise<void> {
    return Promise.all(names.map((n) => this.want(n))).then(() => undefined);
  }

  private fetchBytes(name: SoundName): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(name);
    if (!p) {
      this.extension ??= chooseAudioFormat(
        typeof document === 'undefined' ? null : document.createElement('audio'),
      ).extension;
      // Loops (ambient beds) load at low priority, so they share the line with the music's stream
      // (an <audio> element's request is low priority) instead of starving it.
      const priority: RequestPriority = 'loop' in BANK[name] ? 'low' : 'auto';
      p = fetch(`${this.baseUrl}${BANK[name].file}${this.extension}`, { priority })
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(name, p);
    }
    return p;
  }

  private async want(name: SoundName): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) {
      void this.fetchBytes(name);
      return null;
    }
    const ready = this.buffers.get(name);
    if (ready) return ready;
    if (!this.loading.has(name)) {
      const promise = this.fetchBytes(name)
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .then((buffer) => {
          if (buffer && this.ctx === ctx) this.buffers.set(name, buffer);
        })
        .catch(() => undefined)
        .finally(() => this.bytes.delete(name));
      this.loading.set(name, promise);
    }
    await this.loading.get(name);
    return this.buffers.get(name) ?? null;
  }

  private updateBed(name: BedName, gain: number, now: number): void {
    const existing = this.beds.get(name);
    if (!existing) {
      if (gain <= 0.0001) return;
      const buffer = this.buffers.get(name);
      if (!buffer) {
        void this.want(name);
        return;
      }
      const ctx = this.ctx;
      const bus = this.buses?.ambience;
      if (!ctx || !bus) return;
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gainNode.gain.value = 0;
      source.connect(gainNode).connect(bus);
      source.start(now + 0.02, Math.random() * buffer.duration);
      this.beds.set(name, { source, gain: gainNode, name });
      this.ramp(gainNode.gain, gain, 0.8);
      return;
    }
    this.ramp(existing.gain.gain, gain, 0.35);
  }

  private oneShotAt(
    name: SliceName,
    category: string,
    pos: Vec3Like,
    targetLufs: number,
    rate: number,
    refDistance: number,
    rolloff: number,
  ): void {
    const ctx = this.ctx;
    const bus = this.buses?.sfx;
    if (!ctx || !bus) return;
    if (!this.buffers.has(name)) {
      void this.want(name);
      return;
    }
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = refDistance;
    pan.rolloffFactor = rolloff;
    pan.maxDistance = 400;
    pan.positionX.value = pos.x;
    pan.positionY.value = pos.y;
    pan.positionZ.value = pos.z;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = clamp(18000 / (1 + this.distanceTo(pos) / 45), 1500, 18000);
    air.connect(pan).connect(bus);
    this.playSlice(name, category, air, targetLufs, rate, [air, pan]);
  }

  private playSlice(
    name: SliceName,
    category: string,
    destination: AudioNode | null,
    targetLufs: number,
    rate: number,
    extras: AudioNode[] = [],
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !destination) return;
    const entry = BANK[name];
    const buffer = this.buffers.get(name);
    if (!buffer || !hasSlices(entry)) {
      void this.want(name);
      return;
    }
    let index = Math.floor(Math.random() * entry.slices.length);
    if (entry.slices.length > 1 && index === this.lastSlice[name]) index = (index + 1) % entry.slices.length;
    this.lastSlice[name] = index;
    const [start, duration] = entry.slices[index];
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value =
      dB(clamp(targetLufs - entry.lufs[index], -80, 24)) * (buffer.numberOfChannels === 1 ? MONO_TRIM : 1);
    source.connect(gain).connect(destination);
    const at = ctx.currentTime + 0.006;
    source.start(at, start, duration);
    const voice: ActiveVoice = {
      source,
      gain,
      extras,
      startedAt: at,
      fadeOut: (now) => this.fadeVoice(source, gain, now),
    };
    this.limiter.add(category, voice, ctx.currentTime);
    source.onended = () => {
      this.limiter.remove(category, voice);
      gain.disconnect();
      for (const extra of extras) extra.disconnect();
    };
  }

  private stopLoop(loop: ActiveLoop): void {
    if (loop.stopped) return;
    loop.stopped = true;
    this.positionalLoops.delete(loop);
    this.ramp(loop.gain.gain, 0, 0.08);
    const now = this.ctx?.currentTime ?? 0;
    try {
      loop.source?.stop(now + 0.25);
    } catch {
      // already stopped
    }
    globalThis.setTimeout(() => {
      loop.source?.disconnect();
      loop.gain.disconnect();
      loop.pan.disconnect();
    }, 320);
  }

  private fadeVoice(source: AudioBufferSourceNode, gain: GainNode, now: number): void {
    this.ramp(gain.gain, 0, 0.05);
    try {
      source.stop(now + 0.3);
    } catch {
      // already stopped
    }
  }

  private ramp(param: AudioParam, value: number, seconds: number): void {
    const now = safeNow(this.ctx);
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, seconds);
  }

  private distanceTo(pos: Vec3Like): number {
    return Math.hypot(pos.x - this.listenerX, pos.y - this.listenerY, pos.z - this.listenerZ);
  }

  private categoryFor(name: SliceName): string {
    if (name.startsWith('step_')) return 'step';
    if (name.startsWith('surf_')) return name.slice(5);
    if (name.startsWith('bird_') || name === 'parrot_call') return 'bird';
    if (name === 'big_splash' || name === 'splash') return 'splash';
    if (name === 'hull_slap') return 'hull';
    if (name === 'cannon_boom' || name === 'cannon_fire') return 'cannon';
    if (name === 'cannon_far') return 'cannon_far';
    if (name === 'ball_whiz') return 'whiz';
    if (name === 'timber_hit') return 'timber';
    if (name === 'timber_creak_groan') return 'groan';
    if (isPuzzleOneShot(name)) return 'puzzle';
    if (name.startsWith('opening_')) return 'opening';
    return name;
  }

  private targetFor(name: SliceName): number {
    if (name === 'gull') return MIX.gull;
    if (name === 'tern') return MIX.tern;
    if (name === 'bird_dove') return MIX.dove;
    if (name === 'bird_forest' || name === 'parrot_call') return MIX.bird;
    if (name === 'big_splash' || name === 'splash') return MIX.splash;
    if (name === 'hull_slap') return MIX.hull;
    if (name === 'cannon_boom' || name === 'cannon_fire') return MIX.cannon;
    if (name === 'cannon_far') return MIX.cannon_far;
    if (name === 'ball_whiz') return MIX.whiz;
    if (name === 'timber_hit') return MIX.timber;
    if (name === 'timber_creak_groan') return MIX.groan;
    if (name === 'chime_solve') return MIX.chime;
    if (name === 'crate_thud') return MIX.thud;
    if (isPuzzleOneShot(name)) return MIX.puzzle;
    if (name.startsWith('opening_')) return MIX.opening;
    if (name.startsWith('surf_')) return MIX.crash;
    return MIX.step;
  }
}
