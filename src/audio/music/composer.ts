import {
  createReverbImpulse,
  prerenderInstruments,
  type InstrumentBuffers,
  type InstrumentName,
} from './instruments';
import { LookAheadScheduler } from './scheduler';
import {
  ANCHORAGE_BPM,
  COPILOT_LEITMOTIF,
  beatDuration,
  humanize,
  midiToFrequency,
  pentatonicChord,
  scaleDegreeToMidi,
  secondsToBeat,
  voiceLeadChord,
} from './theory';

export type MusicLayer = 'base' | 'explore' | 'puzzle' | 'trial';
export type StingerName = 'chestOpened' | 'correct' | 'puzzleSolved' | 'lighthouseLit';
export type IslandMusic = 'anchorage';

interface LayerState {
  readonly gain: GainNode;
  enabled: boolean;
  nextBeat: number;
}

const LAYERS: readonly MusicLayer[] = ['base', 'explore', 'puzzle', 'trial'];
const BASE_PROGRESSION = [0, 3, 4, 1] as const;

export class AnchorageComposer {
  private ctx: AudioContext | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private instruments: InstrumentBuffers | null = null;
  private scheduler: LookAheadScheduler | null = null;
  private layers: Record<MusicLayer, LayerState> | null = null;
  private started = false;
  private padChord: readonly number[] = pentatonicChord(0);
  private island: IslandMusic = 'anchorage';

  async bind(ctx: AudioContext, musicBus: GainNode): Promise<void> {
    this.ctx = ctx;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.84;
    this.wet.gain.value = 0.16;
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx);
    this.dry.connect(musicBus);
    this.wet.connect(convolver).connect(musicBus);
    this.instruments = await prerenderInstruments(ctx.sampleRate);
    this.scheduler = new LookAheadScheduler(ctx, ANCHORAGE_BPM, 0.18);
    this.layers = {
      base: this.createLayer(ctx, true),
      explore: this.createLayer(ctx, false),
      puzzle: this.createLayer(ctx, false),
      trial: this.createLayer(ctx, false),
    };
  }

  setIsland(island: IslandMusic): void {
    this.island = island;
    this.resetSchedule();
  }

  setLayer(name: MusicLayer, on: boolean): void {
    const layer = this.layers?.[name];
    if (!layer) return;
    layer.enabled = on;
    this.ramp(layer.gain.gain, on ? 1 : 0, 1.8);
  }

  stinger(name: StingerName): void {
    const scheduler = this.scheduler;
    if (!scheduler) return;
    scheduler.scheduleQuantized(`stinger:${name}`, (time) => this.playStinger(name, time), 1);
  }

  update(): void {
    if (
      !this.ctx ||
      !this.instruments ||
      !this.layers ||
      this.ctx.state !== 'running' ||
      this.island !== 'anchorage'
    )
      return;
    if (!this.started) this.start();
    const horizon = this.ctx.currentTime + 0.24;
    this.scheduleBase(horizon);
    this.scheduleExplore(horizon);
    this.schedulePuzzle(horizon);
    this.scheduleTrial(horizon);
    this.scheduler?.update();
  }

  dispose(): void {
    this.dry?.disconnect();
    this.wet?.disconnect();
    this.ctx = null;
    this.layers = null;
    this.instruments = null;
    this.scheduler = null;
    this.started = false;
  }

  private createLayer(ctx: AudioContext, enabled: boolean): LayerState {
    const gain = ctx.createGain();
    gain.gain.value = enabled ? 1 : 0;
    if (this.dry && this.wet) {
      gain.connect(this.dry);
      gain.connect(this.wet);
    }
    return { gain, enabled, nextBeat: 0 };
  }

  private start(): void {
    if (!this.ctx || !this.layers) return;
    const beat = Math.ceil(secondsToBeat(this.ctx.currentTime, ANCHORAGE_BPM));
    for (const name of LAYERS) this.layers[name].nextBeat = beat;
    this.started = true;
  }

  private resetSchedule(): void {
    this.started = false;
  }

  private scheduleBase(horizon: number): void {
    const layer = this.layers?.base;
    if (!layer) return;
    const stepSeconds = beatDuration(ANCHORAGE_BPM) / 2;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const beat = layer.nextBeat;
      const phrase = Math.floor(beat / 8) % BASE_PROGRESSION.length;
      if (beat % 8 === 0) {
        const nextChord = voiceLeadChord(this.padChord, BASE_PROGRESSION[phrase]);
        this.padChord = nextChord;
        for (const midi of nextChord) this.play('pad', layer.gain, this.beatTime(beat), midi - 12, 0.16, 7.8);
      }
      const degree = [0, 2, 4, 2, 3, 4, 7, 4][Math.floor(beat * 2) % 8];
      const t = this.beatTime(beat) + humanize(beat + 1, 0.018);
      this.play(
        'marimba',
        layer.gain,
        t,
        scaleDegreeToMidi(degree) + 12,
        0.28 + humanize(beat + 2, 0.05),
        0.7,
      );
      if (beat % 2 === 1)
        this.play('steelPan', layer.gain, t + 0.04, scaleDegreeToMidi(degree + 2) + 12, 0.12, 1.2);
      layer.nextBeat += stepSeconds / beatDuration(ANCHORAGE_BPM);
    }
  }

  private scheduleExplore(horizon: number): void {
    const layer = this.layers?.explore;
    if (!layer) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const beat = layer.nextBeat;
      const motifDegree = COPILOT_LEITMOTIF[Math.floor(beat) % COPILOT_LEITMOTIF.length];
      const octaveLift = Math.floor(beat / 6) % 2 === 0 ? 12 : 19;
      const t = this.beatTime(beat) + humanize(beat + 10, 0.028);
      this.play(
        'ukulele',
        layer.gain,
        t,
        scaleDegreeToMidi(motifDegree) + octaveLift,
        0.32 + humanize(beat + 11, 0.05),
        0.95,
      );
      layer.nextBeat += beat % 4 === 3 ? 1.5 : 1;
    }
  }

  private schedulePuzzle(horizon: number): void {
    const layer = this.layers?.puzzle;
    if (!layer) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const beat = layer.nextBeat;
      const degree = [7, 4, 2, 0][Math.floor(beat / 2) % 4];
      this.play(
        'kalimba',
        layer.gain,
        this.beatTime(beat) + humanize(beat + 20, 0.018),
        scaleDegreeToMidi(degree) + 24,
        0.2,
        1.0,
      );
      this.play('tick', layer.gain, this.beatTime(beat + 1), 72, 0.08, 0.15);
      layer.nextBeat += 2;
    }
  }

  private scheduleTrial(horizon: number): void {
    const layer = this.layers?.trial;
    if (!layer) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const beat = layer.nextBeat;
      const strong = beat % 4 === 0;
      this.play(
        'handDrum',
        layer.gain,
        this.beatTime(beat) + humanize(beat + 30, 0.012),
        48,
        strong ? 0.45 : 0.24,
        0.8,
      );
      if (beat % 2 === 1) this.play('shaker', layer.gain, this.beatTime(beat + 0.5), 72, 0.12, 0.25);
      layer.nextBeat += 1;
    }
  }

  private playStinger(name: StingerName, time: number): void {
    const layer = this.layers?.base.gain;
    if (!layer) return;
    const notes = this.stingerNotes(name);
    notes.forEach((midi, index) => {
      const at = time + index * 0.075;
      this.play(index === notes.length - 1 ? 'steelPan' : 'kalimba', layer, at, midi, 0.36, 1.1);
    });
  }

  private stingerNotes(name: StingerName): readonly number[] {
    switch (name) {
      case 'chestOpened':
        return [72, 76, 79];
      case 'correct':
        return [76, 79, 84];
      case 'puzzleSolved':
        return [72, 76, 79, 88];
      case 'lighthouseLit':
        return [67, 72, 76, 79, 88];
    }
  }

  private play(
    instrument: InstrumentName,
    destination: AudioNode,
    time: number,
    midi: number,
    velocity: number,
    duration: number,
  ): void {
    const ctx = this.ctx;
    const buffer = this.instruments?.[instrument];
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value =
      instrument === 'handDrum' || instrument === 'shaker' || instrument === 'tick'
        ? 1
        : midiToFrequency(midi) / 440;
    gain.gain.setValueAtTime(Math.max(0.0001, velocity), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.04, duration));
    source.connect(gain).connect(destination);
    source.start(Math.max(ctx.currentTime + 0.004, time));
    source.stop(Math.max(ctx.currentTime + 0.005, time + duration + 0.05));
  }

  private beatTime(beat: number): number {
    return beat * beatDuration(ANCHORAGE_BPM);
  }

  private ramp(param: AudioParam, value: number, seconds: number): void {
    if (!this.ctx) return;
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }
}
