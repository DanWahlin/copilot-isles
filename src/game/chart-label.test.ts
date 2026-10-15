import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartLabel } from './chart-label';

function makeLabel() {
  const onChange = vi.fn();
  const el = {
    classList: { add: vi.fn(), remove: vi.fn() },
    remove: vi.fn(),
  };
  const live = { remove: vi.fn() };
  const label = Object.assign(Object.create(ChartLabel.prototype), {
    el,
    live,
    shownAs: 'puzzle',
    outTimer: 0,
    holdTimer: 0,
    graceTimer: 0,
    padTimer: 0,
    spokenTimer: 0,
    listening: false,
    padHeld: new Uint8Array(80),
    onChange,
  }) as ChartLabel;
  return { label, onChange, el, live };
}

function beginPolling(label: ChartLabel): void {
  (label as unknown as { listen: () => void }).listen();
}

describe('ChartLabel gamepad dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('removeEventListener', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores a button held before listening and dismisses on a new press', () => {
    const button = { pressed: true };
    const pad = { connected: true, buttons: [button], axes: [] } as unknown as Gamepad;
    const getGamepads = vi.fn((): ReturnType<typeof navigator.getGamepads> => [pad]);
    vi.stubGlobal('navigator', { getGamepads });
    const { label, onChange } = makeLabel();

    beginPolling(label);
    expect(getGamepads).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(label.mode).toBe('puzzle');

    button.pressed = false;
    vi.advanceTimersByTime(100);
    button.pressed = true;
    vi.advanceTimersByTime(100);

    expect(label.mode).toBeNull();
    expect(onChange).toHaveBeenCalledWith(false, 0);
    const callsAfterHide = getGamepads.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(getGamepads).toHaveBeenCalledTimes(callsAfterHide);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops polling and clears its interval when disposed', () => {
    const getGamepads = vi.fn((): ReturnType<typeof navigator.getGamepads> => []);
    vi.stubGlobal('navigator', { getGamepads });
    const { label, el, live } = makeLabel();

    beginPolling(label);
    expect(getGamepads).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    label.dispose();

    expect(el.remove).toHaveBeenCalledOnce();
    expect(live.remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(getGamepads).toHaveBeenCalledTimes(1);
  });
});
