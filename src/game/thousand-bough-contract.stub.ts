import { createThousandBoughStub } from '../world/islands/thousand-bough';
import type { ThousandBoughSystem } from '../world/islands/thousand-bough/contract';

/**
 * Builder B's stand-in for the island's world in tests (docs/specs/ISLAND-02-thousand-bough.md §9.3,
 * §10): the contract's views, each recording its calls in order, on top of the world's own step-0 stub
 * (anchors and an empty group). The content is tested against this; the browser run uses the real one.
 */
export interface RecordedCall {
  view: 'flume' | 'spire' | 'mast' | 'fx';
  fn: string;
  args: unknown[];
}

export function recordingThousandBough(): { sys: ThousandBoughSystem; calls: RecordedCall[] } {
  const base = createThousandBoughStub();
  const calls: RecordedCall[] = [];
  const record = <T extends object>(view: RecordedCall['view'], target: T): T =>
    new Proxy(target, {
      get(t, key, recv) {
        const v = Reflect.get(t, key, recv) as unknown;
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          calls.push({ view, fn: String(key), args });
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      },
    });
  return {
    sys: {
      ...base,
      flume: record('flume', base.flume),
      spire: record('spire', base.spire),
      mast: record('mast', base.mast),
      fx: record('fx', base.fx),
    },
    calls,
  };
}
