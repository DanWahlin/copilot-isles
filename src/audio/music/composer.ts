import { createAnchoragePlan, type AnchorageBar, type AnchoragePlan, type MusicPalette } from './arrangement';
import {
  createReverbImpulse,
  prerenderInstruments,
  type InstrumentBuffers,
  type InstrumentName,
} from './instruments';
import { LookAheadScheduler } from './scheduler';
import { ANCHORAGE_BPM, beatDuration, humanize, midiToFrequency } from './theory';

export type MusicLayer = 'base' | 'explore' | 'puzzle' | 'trial';
export type StingerName = 'chestOpened' | 'correct' | 'puzzleSolved' | 'lighthouseLit';
export type IslandMusic = 'harbour' | 'anchorage' | 'tropical';

interface LayerState {
  readonly gain: GainNode;
  enabled: boolean;
  nextBeat: number;
}

const LAYERS: readonly MusicLayer[] = ['base', 'explore', 'puzzle', 'trial'];
const PLAN_BARS = 320;
const THEME_INPUT_GAIN = 1.05;
const HARBOUR_ROOT = 57; // A minor / A Dorian colour.
const TROPICAL_ROOT = 62; // D Mixolydian / major-pentatonic colour.
const HARBOUR_ARP: readonly (readonly number[])[] = [
  [0, 4, 7, 12, 7, 4],
  [0, 7, 12, 14, 12, 7],
  [0, 3, 7, 12, 10, 7],
  [0, 5, 7, 12, 7, 5],
];
const TROPICAL_ARP: readonly (readonly number[])[] = [
  [0, 4, 7, 9, 7, 4, 2, 4],
  [0, 7, 9, 12, 9, 7, 4, 2],
  [0, 4, 7, 12, 14, 12, 7, 4],
  [0, 2, 4, 7, 9, 7, 4, 2],
];
const HARBOUR_MELODY: readonly (readonly number[])[] = [
  [7, 8, 7, 5, 3],
  [3, 5, 7, 5, 2],
  [10, 8, 7, 5, 7],
  [5, 7, 3, 2, 0],
];
const TROPICAL_MELODY: readonly (readonly number[])[] = [
  [7, 9, 7, 4, 2],
  [4, 7, 9, 12, 9],
  [9, 7, 4, 2, 4],
  [2, 4, 7, 4, 0],
];

export class AnchorageComposer {
  private ctx: AudioContext | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private instruments: InstrumentBuffers | null = null;
  private scheduler: LookAheadScheduler | null = null;
  private layers: Record<MusicLayer, LayerState> | null = null;
  private palette: MusicPalette = 'tropical';
  private plan: AnchoragePlan = createAnchoragePlan(0x51a7c0de, PLAN_BARS, 'tropical');
  private started = false;

  async bind(ctx: AudioContext, musicBus: GainNode): Promise<void> {
    this.ctx = ctx;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.86;
    this.wet.gain.value = 0.14;
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, 1.85);
    this.dry.connect(musicBus);
    this.wet.connect(convolver).connect(musicBus);
    this.instruments = await prerenderInstruments(ctx);
    this.scheduler = new LookAheadScheduler(ctx, ANCHORAGE_BPM, 0.2);
    this.setPlan('tropical');
    this.layers = {
      base: this.createLayer(ctx, true),
      explore: this.createLayer(ctx, false),
      puzzle: this.createLayer(ctx, false),
      trial: this.createLayer(ctx, false),
    };
  }

  setIsland(island: IslandMusic): void {
    this.setPlan(island === 'harbour' ? 'harbour' : 'tropical');
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
    if (!this.ctx || !this.instruments || !this.layers || this.ctx.state !== 'running') return;
    if (!this.started) this.start();
    const horizon = this.ctx.currentTime + 0.27;
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

  private setPlan(palette: MusicPalette): void {
    if (this.palette === palette && this.started) return;
    this.palette = palette;
    this.plan = createAnchoragePlan(Math.floor(Math.random() * 0x7fffffff), PLAN_BARS, palette);
    this.resetSchedule();
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
    const beat = Math.ceil(this.currentBeat());
    for (const name of LAYERS) this.layers[name].nextBeat = beat;
    this.started = true;
  }

  private resetSchedule(): void {
    if (!this.layers || !this.ctx) {
      this.started = false;
      return;
    }
    const beat = Math.ceil(this.currentBeat());
    for (const name of LAYERS) this.layers[name].nextBeat = beat;
    this.started = true;
  }

  private scheduleBase(horizon: number): void {
    const layer = this.layers?.base;
    if (!layer) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const step = Math.round(layer.nextBeat * 2);
      const bar = this.barAtStep(step);
      const pos = this.posStep(step);
      const beat = step / 2;
      const at = this.beatTime(beat);
      if (this.palette === 'harbour') this.scheduleHarbourBase(layer.gain, bar, pos, at, beat);
      else this.scheduleTropicalBase(layer.gain, bar, pos, at);
      layer.nextBeat += 0.5;
    }
  }

  private scheduleExplore(horizon: number): void {
    const layer = this.layers?.explore;
    if (!layer) return;
    if (!this.layerActive(layer)) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const step = Math.round(layer.nextBeat * 2);
      const bar = this.barAtStep(step);
      const pos = this.posStep(step);
      const beat = step / 2;
      const at = this.beatTime(beat);
      if (this.palette === 'harbour') this.scheduleHarbourExplore(layer.gain, bar, pos, at, beat);
      else this.scheduleTropicalExplore(layer.gain, bar, pos, at, beat);
      layer.nextBeat += 0.5;
    }
  }

  private schedulePuzzle(horizon: number): void {
    const layer = this.layers?.puzzle;
    if (!layer) return;
    if (!this.layerActive(layer)) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const step = Math.round(layer.nextBeat * 2);
      const bar = this.barAtStep(step);
      const pos = this.posStep(step);
      const beat = step / 2;
      const at = this.beatTime(beat) + humanize(beat + 20, 0.012);
      if (pos === 0 || (pos === this.stepsPerBar() - 2 && !bar.rest)) {
        const tone = this.modeMidi(bar, bar.chordRoot + (pos === 0 ? 7 : 4), 12);
        this.play(
          this.palette === 'harbour' ? 'islandPluckHigh' : 'kalimbaHigh',
          layer.gain,
          at,
          tone,
          0.075,
          1.2,
        );
      }
      if (pos === Math.floor(this.stepsPerBar() / 2)) this.play('tick', layer.gain, at, 72, 0.024, 0.12);
      layer.nextBeat += 0.5;
    }
  }

  private scheduleTrial(horizon: number): void {
    const layer = this.layers?.trial;
    if (!layer) return;
    if (!this.layerActive(layer)) return;
    while (this.beatTime(layer.nextBeat) <= horizon) {
      const step = Math.round(layer.nextBeat * 2);
      const bar = this.barAtStep(step);
      const pos = this.posStep(step);
      const beat = step / 2;
      const at = this.beatTime(beat) + humanize(beat + 30, 0.009);
      if (pos === 0) {
        if (this.palette === 'tropical') this.play('conga', layer.gain, at, 48, 0.09, 0.5);
        else this.play('handDrum', layer.gain, at, 48, 0.055, 0.55);
        this.play('bass', layer.gain, at + 0.02, this.modeMidi(bar, bar.chordRoot, -24), 0.06, 0.9);
      }
      if (this.palette === 'tropical' && pos === this.stepsPerBar() - 2) {
        this.play('bongoLow', layer.gain, at, 60, 0.055, 0.35);
      }
      layer.nextBeat += 0.5;
    }
  }

  private scheduleHarbourBase(
    destination: AudioNode,
    bar: AnchorageBar,
    pos: number,
    at: number,
    beat: number,
  ): void {
    if (pos === 0) {
      const tonic = this.modeMidi(bar, bar.chordRoot, -12);
      const fifth = this.modeMidi(bar, bar.chordRoot + 4, -12);
      this.play('pad', destination, at, tonic, 0.052, 5.4);
      this.play('pad', destination, at + 0.04, fifth, 0.034, 5.2);
    }
    if (pos % 2 === 0 || (pos === 3 && !bar.rest)) {
      const arp = HARBOUR_ARP[bar.arpeggioVariant % HARBOUR_ARP.length] ?? HARBOUR_ARP[0]!;
      const degree = arp[pos % arp.length] ?? 0;
      this.play(
        'islandPluck',
        destination,
        at + this.lilt(pos),
        this.modeMidi(bar, bar.chordRoot + degree, 0),
        0.078,
        1.25,
      );
    }
    if (bar.cadence && pos === this.stepsPerBar() - 1) {
      this.play(
        'islandPluckHigh',
        destination,
        at + humanize(beat + 3, 0.012),
        this.modeMidi(bar, bar.chordRoot + 7, 12),
        0.045,
        0.8,
      );
    }
  }

  private scheduleHarbourExplore(
    destination: AudioNode,
    bar: AnchorageBar,
    pos: number,
    at: number,
    beat: number,
  ): void {
    if (bar.rest || bar.section === 'intro') return;
    if (pos === 0 || pos === 3) {
      const phrase = HARBOUR_MELODY[bar.melodyVariant % HARBOUR_MELODY.length] ?? HARBOUR_MELODY[0]!;
      const degree = phrase[(bar.sectionBar + (pos === 3 ? 2 : 0)) % phrase.length] ?? 0;
      this.playRecorder(
        destination,
        at + humanize(beat + 9, 0.018),
        this.modeMidi(bar, bar.chordRoot + degree, 12),
        0.105,
        pos === 0 ? 1.35 : 1.05,
      );
    }
    if (pos === 0 && bar.pulseVariant === 0) this.play('handDrum', destination, at + 0.015, 48, 0.035, 0.45);
  }

  private scheduleTropicalBase(destination: AudioNode, bar: AnchorageBar, pos: number, at: number): void {
    if (pos === 0) {
      this.play('bass', destination, at, this.modeMidi(bar, bar.chordRoot, -24), 0.13, 0.92);
      this.play('pad', destination, at, this.modeMidi(bar, bar.chordRoot, -12), 0.026, 4.0);
    } else if (pos === 4) {
      this.play('bass', destination, at, this.modeMidi(bar, bar.chordRoot + 4, -24), 0.075, 0.65);
    }
    if (pos === 0 || pos === 2 || pos === 5) {
      const arp = TROPICAL_ARP[bar.arpeggioVariant % TROPICAL_ARP.length] ?? TROPICAL_ARP[0]!;
      const degree = arp[pos % arp.length] ?? 0;
      const midi = this.modeMidi(bar, bar.chordRoot + degree, pos === 5 ? 12 : 0);
      this.play(this.marimbaFor(midi), destination, at + this.lilt(pos), midi, 0.075 * bar.density, 0.72);
    }
    if (!bar.rest && (pos === 1 || pos === 6)) {
      const midi = this.modeMidi(bar, bar.chordRoot + (pos === 1 ? 4 : 7), 12);
      this.play('kalimba', destination, at + 0.02, midi, 0.038, 0.9);
    }
  }

  private scheduleTropicalExplore(
    destination: AudioNode,
    bar: AnchorageBar,
    pos: number,
    at: number,
    beat: number,
  ): void {
    if (bar.section === 'intro' || bar.section === 'drone') return;
    if (pos === 1 || pos === 5) {
      const shaker = pos === 1 ? 'sampledShakerDown' : 'sampledShakerUp';
      this.play(shaker, destination, at + this.lilt(pos), 72, 0.028, 0.12);
    }
    if (!bar.rest && (pos === 0 || (pos === 4 && bar.density > 0.6))) {
      const phrase = TROPICAL_MELODY[bar.melodyVariant % TROPICAL_MELODY.length] ?? TROPICAL_MELODY[0]!;
      const degree = phrase[(bar.sectionBar + (pos === 4 ? 2 : 0)) % phrase.length] ?? 0;
      const midi = this.modeMidi(bar, bar.chordRoot + degree, 12);
      this.play(
        'steelPan',
        destination,
        at + humanize(beat + 10, 0.02),
        midi,
        0.072,
        pos === 0 ? 1.05 : 0.78,
      );
    }
  }

  private playRecorder(
    destination: AudioNode,
    time: number,
    midi: number,
    velocity: number,
    duration: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const breath = ctx.createBufferSource();
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.18;
    breath.buffer = noise;
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    const safeTime = Math.max(ctx.currentTime + 0.004, time);
    osc.type = 'sine';
    osc.frequency.value = midiToFrequency(midi);
    vibrato.frequency.value = 4.6;
    vibratoGain.gain.setValueAtTime(0, safeTime);
    vibratoGain.gain.linearRampToValueAtTime(2.8, safeTime + 0.45);
    filter.type = 'lowpass';
    filter.frequency.value = 2300;
    filter.Q.value = 0.6;
    amp.gain.setValueAtTime(0.0001, safeTime);
    amp.gain.linearRampToValueAtTime(velocity * THEME_INPUT_GAIN, safeTime + 0.11);
    amp.gain.setTargetAtTime(0.0001, safeTime + duration * 0.75, 0.18);
    vibrato.connect(vibratoGain).connect(osc.frequency);
    osc.connect(filter);
    breath.connect(filter);
    filter.connect(amp).connect(destination);
    osc.start(safeTime);
    breath.start(safeTime);
    vibrato.start(safeTime);
    osc.stop(safeTime + duration + 0.05);
    breath.stop(safeTime + duration + 0.05);
    vibrato.stop(safeTime + duration + 0.05);
  }

  private playStinger(name: StingerName, time: number): void {
    const layer = this.layers?.base.gain;
    if (!layer) return;
    const notes = this.stingerNotes(name);
    notes.forEach((midi, index) => {
      const at = time + index * 0.075;
      this.play(index === notes.length - 1 ? 'steelPan' : 'kalimbaHigh', layer, at, midi, 0.22, 0.95);
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
    const def = this.instruments?.[instrument];
    if (!ctx || !def) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    source.buffer = def.buffer;
    source.playbackRate.value = def.percussion ? 1 : 2 ** ((midi - def.rootMidi) / 12);
    filter.type = 'lowpass';
    filter.frequency.value = instrument === 'bass' || instrument === 'pad' ? 1600 : 4800;
    filter.Q.value = 0.45;
    const safeTime = Math.max(ctx.currentTime + 0.004, time);
    const maxDuration = Math.min(duration, def.duration / Math.max(0.25, source.playbackRate.value));
    gain.gain.setValueAtTime(Math.max(0.0001, velocity * THEME_INPUT_GAIN), safeTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, safeTime + Math.max(0.04, maxDuration));
    source.connect(filter).connect(gain).connect(destination);
    source.start(safeTime, def.offset, Math.max(0.03, def.duration));
    source.stop(safeTime + maxDuration + 0.04);
  }

  private modeMidi(bar: AnchorageBar, degree: number, octave = 0): number {
    const root = bar.palette === 'harbour' ? HARBOUR_ROOT : TROPICAL_ROOT;
    const mode = bar.mode;
    const length = mode.length;
    const octaveShift = Math.floor(degree / length);
    const wrapped = ((degree % length) + length) % length;
    return root + mode[wrapped]! + octaveShift * 12 + octave;
  }

  private currentBeat(): number {
    return (this.ctx?.currentTime ?? 0) / beatDuration(ANCHORAGE_BPM);
  }

  private beatTime(beat: number): number {
    return beat * beatDuration(ANCHORAGE_BPM);
  }

  private stepsPerBar(): number {
    return this.plan.beatsPerBar * 2;
  }

  private barAtStep(step: number): AnchorageBar {
    const bar = Math.floor(step / this.stepsPerBar());
    return this.plan.bars[bar % this.plan.bars.length] ?? this.plan.bars[0]!;
  }

  private posStep(step: number): number {
    const steps = this.stepsPerBar();
    return ((step % steps) + steps) % steps;
  }

  private lilt(pos: number): number {
    return pos % 2 === 1 ? 0.035 : 0;
  }

  private marimbaFor(midi: number): InstrumentName {
    if (midi < 60) return 'marimbaLow';
    if (midi > 69) return 'marimbaHigh';
    return 'marimba';
  }

  private ramp(param: AudioParam, value: number, seconds: number): void {
    if (!this.ctx) return;
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }

  private layerActive(layer: LayerState): boolean {
    if (layer.enabled || layer.gain.gain.value > 0.001) return true;
    layer.nextBeat = Math.ceil(this.currentBeat() * 2) / 2;
    return false;
  }
}
