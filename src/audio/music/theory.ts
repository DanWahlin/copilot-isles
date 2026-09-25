export const ANCHORAGE_BPM = 84;
const ANCHORAGE_ROOT_MIDI = 60;
const MAJOR_PENTATONIC_STEPS = [0, 2, 4, 7, 9] as const;
export const COPILOT_LEITMOTIF = [0, 2, 4, 2, 7, 4] as const;

export function beatDuration(bpm: number): number {
  return 60 / bpm;
}

export function secondsToBeat(seconds: number, bpm: number): number {
  return seconds / beatDuration(bpm);
}

export function quantizeBeat(beat: number, grid = 1): number {
  return Math.ceil(beat / grid) * grid;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function scaleDegreeToMidi(
  degree: number,
  root = ANCHORAGE_ROOT_MIDI,
  scale = MAJOR_PENTATONIC_STEPS,
): number {
  const length = scale.length;
  const octave = Math.floor(degree / length);
  const wrapped = ((degree % length) + length) % length;
  return root + octave * 12 + scale[wrapped];
}

export function pentatonicChord(rootDegree: number, inversion = 0): readonly number[] {
  const chord = [rootDegree, rootDegree + 2, rootDegree + 4].map((degree) => scaleDegreeToMidi(degree));
  for (let i = 0; i < inversion; i++) chord[i % chord.length] += 12;
  return chord.sort((a, b) => a - b);
}

export function voiceLeadChord(previous: readonly number[], nextRootDegree: number): readonly number[] {
  const candidates = [0, 1, 2].map((inversion) => pentatonicChord(nextRootDegree, inversion));
  let best = candidates[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let cost = 0;
    for (let i = 0; i < candidate.length; i++) cost += Math.abs(candidate[i] - (previous[i] ?? candidate[i]));
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

export function humanize(seed: number, amount: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * amount;
}
