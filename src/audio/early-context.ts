/**
 * The page's AudioContext, made while the game loads instead of on the first click or key press.
 *
 * Chrome starts its audio service with the first AudioContext of a browser session: the constructor
 * blocks the main thread for 300–600 ms on an M3 Max (measured with tools/openingtest.mjs), so making
 * it in the title's first gesture froze the title for that long. Made during the loading splash, it
 * starts suspended where sound needs a gesture (the gesture only calls `resume()`), and the cost hides
 * behind the splash. Nothing plays until the audio engine unlocks.
 */
let early: AudioContext | null = null;

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/** Makes the AudioContext now, if the browser has one (call it once, while the page is loading). */
export function prepareAudioContext(): void {
  if (early || typeof window === 'undefined') return;
  const g = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  const Ctor: AudioContextCtor | undefined = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return;
  try {
    early = new Ctor({ latencyHint: 'interactive' });
  } catch {
    early = null;
  }
}

/** The context `prepareAudioContext` made (once: the audio engine owns it after), or null. */
export function takeAudioContext(): AudioContext | null {
  const ctx = early;
  early = null;
  return ctx;
}
