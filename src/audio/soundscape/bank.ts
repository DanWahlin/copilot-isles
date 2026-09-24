// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, public/audio/CREDITS.md@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/audio/soundBank.js@d32799f

export interface SliceBank {
  readonly file: string;
  readonly slices: readonly (readonly [start: number, duration: number])[];
  readonly lufs: readonly number[];
}

export interface LoopBank {
  readonly file: string;
  readonly loop: true;
  readonly lufs: number;
}

export type BankEntry = SliceBank | LoopBank;

export const BANK = {
  surf_far: { file: 'surf_far', loop: true, lufs: -23 },
  wind: { file: 'wind', loop: true, lufs: -23.6 },
  palms: { file: 'palms', loop: true, lufs: -23.3 },
  crickets: { file: 'crickets', loop: true, lufs: -23 },
  birds_dawn: { file: 'birds_dawn', loop: true, lufs: -23.3 },
  boat_lap: { file: 'boat_lap', loop: true, lufs: -32.2 },
  pier_lap: { file: 'pier_lap', loop: true, lufs: -30.7 },
  stream: { file: 'stream', loop: true, lufs: -23 },
  waterfall_small: { file: 'waterfall_small', loop: true, lufs: -23 },
  wheel_creak: { file: 'wheel_creak', loop: true, lufs: -23 },
  step_sand: {
    file: 'step_sand',
    slices: [
      [0.08, 0.191],
      [0.351, 0.3153],
      [0.7463, 0.2237],
      [1.05, 0.516],
      [1.646, 0.436],
    ],
    lufs: [-25, -25.4, -27, -22.5, -19.8],
  },
  step_wetsand: {
    file: 'step_wetsand',
    slices: [
      [0.08, 0.171],
      [0.331, 0.376],
      [0.787, 0.226],
      [1.093, 0.246],
      [1.419, 0.221],
    ],
    lufs: [-27.4, -19.6, -21.7, -20.9, -20.1],
  },
  surf_crash: {
    file: 'surf_crash',
    slices: [
      [0.08, 3.254],
      [3.414, 2.504],
      [5.998, 2.554],
      [8.632, 1.304],
      [10.016, 2.804],
      [12.9, 2.204],
      [15.184, 2.7493],
    ],
    lufs: [-13, -13.4, -14.1, -17, -13, -14, -12.7],
  },
  surf_wash: {
    file: 'surf_wash',
    slices: [
      [0.08, 1.404],
      [1.564, 2.054],
      [3.698, 1.504],
      [5.282, 1.354],
      [6.716, 1.904],
      [8.7, 1.154],
    ],
    lufs: [-12.4, -11.3, -16.5, -13.7, -14.5, -22.3],
  },
  surf_backwash: {
    file: 'surf_backwash',
    slices: [
      [0.08, 1.804],
      [1.964, 1.904],
      [3.948, 3.804],
      [7.832, 2.254],
      [10.166, 2.394],
      [12.64, 2.404],
    ],
    lufs: [-13.1, -17.7, -22.1, -16.6, -14.4, -15.9],
  },
  step_wood: {
    file: 'step_wood',
    slices: [
      [0.08, 0.4267],
      [0.5867, 0.424],
      [1.0907, 0.424],
      [1.5947, 0.417],
      [2.0917, 0.4326],
    ],
    lufs: [-22.5, -20.9, -20.8, -20.2, -20.8],
  },
  step_water: {
    file: 'step_water',
    slices: [
      [0.08, 0.854],
      [1.014, 0.704],
      [1.798, 0.624],
      [2.502, 0.624],
      [3.206, 0.854],
    ],
    lufs: [-17.5, -16, -19.5, -23, -14.9],
  },
  step_grass: {
    file: 'step_grass',
    slices: [
      [0.08, 0.304],
      [0.464, 0.3553],
      [0.8993, 0.284],
      [1.2633, 0.254],
      [1.5973, 0.2473],
    ],
    lufs: [-20.7, -18, -19.3, -19.5, -18.6],
  },
  step_rock: {
    file: 'step_rock',
    slices: [
      [0.08, 0.504],
      [0.664, 0.504],
      [1.248, 0.504],
      [1.832, 0.504],
      [2.416, 0.504],
    ],
    lufs: [-27.1, -24.8, -24.7, -24.8, -25.6],
  },
  splash: {
    file: 'splash',
    slices: [
      [0.08, 1.604],
      [1.764, 2.2067],
      [4.0507, 2.2133],
      [6.344, 1.906],
    ],
    lufs: [-19, -18, -14.1, -15.5],
  },
  hull_slap: {
    file: 'hull_slap',
    slices: [
      [0.08, 0.554],
      [0.714, 0.754],
      [1.548, 0.404],
      [2.032, 0.5087],
      [2.6207, 0.406],
    ],
    lufs: [-20.7, -18.4, -20.2, -17.7, -16.4],
  },
  gull: {
    file: 'gull',
    slices: [
      [0.08, 1.001],
      [1.161, 1.404],
      [2.645, 0.904],
      [3.629, 1.114],
      [4.823, 1.044],
      [5.947, 0.5267],
    ],
    lufs: [-15.9, -16.2, -18.1, -11.8, -12.8, -12.8],
  },
  bird_forest: {
    file: 'bird_forest',
    slices: [
      [0.08, 1.47],
      [1.63, 1.45],
      [3.16, 1.23],
      [4.47, 1.59],
      [6.14, 1.55],
      [7.77, 1.38],
      [9.23, 1.16],
      [10.47, 1.3],
      [11.85, 1.12],
      [13.05, 1.45],
      [14.58, 1.99],
      [16.65, 1.2],
      [17.93, 1.06],
    ],
    lufs: [-12.8, -12, -10.9, -11.8, -12, -11.3, -11.9, -13.4, -13.7, -11.9, -7.7, -12.1, -11],
  },
  bird_dove: {
    file: 'bird_dove',
    slices: [
      [0.08, 3.12],
      [3.28, 3.18],
      [6.54, 3.13],
      [9.75, 3.36],
      [13.19, 3.31],
    ],
    lufs: [-7.7, -7.3, -7.2, -7.4, -7.6],
  },
  tern: {
    file: 'tern',
    slices: [
      [0.08, 2.1097],
      [2.2697, 1.85],
      [4.1997, 2.4098],
      [6.6894, 1.3657],
      [8.1351, 1.02],
      [9.2351, 1.99],
    ],
    lufs: [-9.8, -10.7, -12.4, -12, -9, -12.9],
  },
  big_splash: {
    file: 'big_splash',
    slices: [
      [0.08, 2.1477],
      [2.3077, 1.7777],
    ],
    lufs: [-15.6, -18.7],
  },
  stone_turn: { file: 'stone_turn', slices: [[0, 0.4865]], lufs: [-18] },
  lever: { file: 'lever', slices: [[0, 0.5565]], lufs: [-18] },
  gate_lift: { file: 'gate_lift', slices: [[0, 1.1565]], lufs: [-18] },
  chime_solve: { file: 'chime_solve', slices: [[0, 1.9065]], lufs: [-18] },
  crane_ratchet: { file: 'crane_ratchet', slices: [[0, 0.7265]], lufs: [-18] },
  crate_thud: { file: 'crate_thud', slices: [[0, 0.7065]], lufs: [-18] },
  gear_pickup: { file: 'gear_pickup', slices: [[0, 0.3465]], lufs: [-18] },
  gear_hang: { file: 'gear_hang', slices: [[0, 0.4465]], lufs: [-18] },
  quill: { file: 'quill', slices: [[0, 0.8265]], lufs: [-18] },
  tube_voice: { file: 'tube_voice', slices: [[0, 0.8665]], lufs: [-18] },
  hatch_clank: { file: 'hatch_clank', slices: [[0, 1.2265]], lufs: [-18] },
  bottle_pop: { file: 'bottle_pop', slices: [[0, 0.5465]], lufs: [-18] },
  coconut_crack: { file: 'coconut_crack', slices: [[0, 0.4265]], lufs: [-18] },
  crowd_cheer_small: { file: 'crowd_cheer_small', slices: [[0, 2.0565]], lufs: [-18] },
  lute_strum: { file: 'lute_strum', slices: [[0, 2.1665]], lufs: [-18] },
} as const satisfies Record<string, BankEntry>;

export type SoundName = keyof typeof BANK;
export type LoopName = {
  [K in SoundName]: (typeof BANK)[K] extends LoopBank ? K : never;
}[SoundName];
export type SliceName = Exclude<SoundName, LoopName>;
