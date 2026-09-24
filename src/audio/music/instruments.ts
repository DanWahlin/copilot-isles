type OfflineCtor = new (options: OfflineAudioContextOptions) => OfflineAudioContext;

export type InstrumentName =
  'ukulele' | 'marimba' | 'steelPan' | 'shaker' | 'pad' | 'kalimba' | 'handDrum' | 'tick';
export type InstrumentBuffers = Readonly<Record<InstrumentName, AudioBuffer>>;

type OfflineGlobal = typeof globalThis & {
  readonly webkitOfflineAudioContext?: OfflineCtor;
};

const OFFLINE_DURATION: Readonly<Record<InstrumentName, number>> = {
  ukulele: 1.8,
  marimba: 1.4,
  steelPan: 2.2,
  shaker: 0.28,
  pad: 5.5,
  kalimba: 1.5,
  handDrum: 0.8,
  tick: 0.18,
};

export async function prerenderInstruments(sampleRate: number): Promise<InstrumentBuffers | null> {
  const ctor = offlineCtor();
  if (!ctor) return null;
  const entries = await Promise.all(
    (Object.keys(OFFLINE_DURATION) as InstrumentName[]).map(async (name) => [
      name,
      await renderInstrument(ctor, name, sampleRate),
    ]),
  );
  return Object.fromEntries(entries) as InstrumentBuffers;
}

export function createReverbImpulse(ctx: BaseAudioContext, seconds = 1.9): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const early = i < ctx.sampleRate * 0.08 ? 0.45 : 1;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.7 * early * 0.28;
    }
  }
  return impulse;
}

function offlineCtor(): OfflineCtor | null {
  const global = globalThis as OfflineGlobal;
  return global.OfflineAudioContext ?? global.webkitOfflineAudioContext ?? null;
}

async function renderInstrument(
  ctor: OfflineCtor,
  name: InstrumentName,
  sampleRate: number,
): Promise<AudioBuffer> {
  const duration = OFFLINE_DURATION[name];
  const ctx = new ctor({ numberOfChannels: 2, length: Math.ceil(sampleRate * duration), sampleRate });
  switch (name) {
    case 'ukulele':
      renderKarplusStrong(ctx, 440, duration, 0.78, 2200);
      break;
    case 'marimba':
      renderFm(ctx, 440, duration, 2.01, 620, 0.8, 0.012, 0.9);
      break;
    case 'steelPan':
      renderFm(ctx, 440, duration, 1.52, 380, 0.74, 0.02, 1.4);
      renderFm(ctx, 660, duration, 1.02, 140, 0.18, 0.04, 1.8);
      break;
    case 'shaker':
      renderNoise(ctx, duration, 'highpass', 6400, 0.2, 0.002, 0.14);
      break;
    case 'pad':
      renderPad(ctx, duration);
      break;
    case 'kalimba':
      renderFm(ctx, 440, duration, 3.03, 720, 0.58, 0.006, 1.15);
      renderKarplusStrong(ctx, 880, 0.8, 0.16, 3600);
      break;
    case 'handDrum':
      renderHandDrum(ctx, duration);
      break;
    case 'tick':
      renderNoise(ctx, duration, 'bandpass', 2600, 0.12, 0.001, 0.035);
      break;
  }
  return ctx.startRendering();
}

function renderKarplusStrong(
  ctx: OfflineAudioContext,
  frequency: number,
  duration: number,
  gain: number,
  cutoff: number,
): void {
  const delaySeconds = 1 / frequency;
  const noise = ctx.createBufferSource();
  const seedLength = Math.max(2, Math.floor(ctx.sampleRate * delaySeconds));
  const seed = ctx.createBuffer(1, seedLength, ctx.sampleRate);
  const seedData = seed.getChannelData(0);
  for (let i = 0; i < seedLength; i++) seedData[i] = Math.random() * 2 - 1;
  noise.buffer = seed;
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = delaySeconds;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.982;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const output = ctx.createGain();
  output.gain.setValueAtTime(gain, 0);
  output.gain.exponentialRampToValueAtTime(0.0001, duration);
  noise.connect(delay);
  delay.connect(filter).connect(feedback).connect(delay);
  delay.connect(output).connect(ctx.destination);
  noise.start(0);
}

function renderFm(
  ctx: OfflineAudioContext,
  carrierFrequency: number,
  duration: number,
  ratio: number,
  depth: number,
  gain: number,
  attack: number,
  release: number,
): void {
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const amp = ctx.createGain();
  carrier.type = 'sine';
  mod.type = 'sine';
  carrier.frequency.value = carrierFrequency;
  mod.frequency.value = carrierFrequency * ratio;
  modGain.gain.setValueAtTime(depth, 0);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, depth * 0.08), Math.min(duration, release));
  amp.gain.setValueAtTime(0.0001, 0);
  amp.gain.exponentialRampToValueAtTime(gain, attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, duration);
  mod.connect(modGain).connect(carrier.frequency);
  carrier.connect(amp).connect(ctx.destination);
  carrier.start(0);
  mod.start(0);
  carrier.stop(duration);
  mod.stop(duration);
}

function renderNoise(
  ctx: OfflineAudioContext,
  duration: number,
  type: BiquadFilterType,
  frequency: number,
  gain: number,
  attack: number,
  release: number,
): void {
  const source = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = 0.9;
  amp.gain.setValueAtTime(0.0001, 0);
  amp.gain.exponentialRampToValueAtTime(gain, attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, release);
  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(0);
}

function renderPad(ctx: OfflineAudioContext, duration: number): void {
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 1450;
  filter.Q.value = 0.5;
  amp.gain.setValueAtTime(0.0001, 0);
  amp.gain.linearRampToValueAtTime(0.28, 1.4);
  amp.gain.linearRampToValueAtTime(0.2, duration - 1.2);
  amp.gain.exponentialRampToValueAtTime(0.0001, duration);
  for (const [frequency, detune] of [
    [220, -7],
    [277.18, 5],
    [329.63, 0],
    [440, 3],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(0);
    osc.stop(duration);
  }
  filter.connect(amp).connect(ctx.destination);
}

function renderHandDrum(ctx: OfflineAudioContext, duration: number): void {
  const tone = ctx.createOscillator();
  const toneGain = ctx.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(155, 0);
  tone.frequency.exponentialRampToValueAtTime(58, 0.22);
  toneGain.gain.setValueAtTime(0.95, 0.001);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, duration);
  tone.connect(toneGain).connect(ctx.destination);
  tone.start(0);
  tone.stop(duration);
  renderNoise(ctx, 0.18, 'lowpass', 900, 0.18, 0.001, 0.12);
}
