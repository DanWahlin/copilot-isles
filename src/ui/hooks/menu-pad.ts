import { useEffect } from 'react';

const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;
const A = 0;
const B = 1;

function pressed(): Set<number> {
  const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === 'standard');
  const out = new Set<number>();
  pad?.buttons.forEach((b, i) => b.pressed && out.add(i));
  return out;
}

function key(target: EventTarget, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

/**
 * A gamepad on a settings-style screen, as the keyboard works there: the d-pad's up and down move
 * between controls (the menu's ArrowUp/ArrowDown), left and right change the one you're on (a radio
 * group, a slider, a list), A presses it and B goes back. Buttons already held when the screen opens
 * wait for their release.
 */
export function useMenuPad(back: () => void): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let held = pressed();
    let raf = 0;
    const step = () => {
      const now = pressed();
      const edge = (b: number) => now.has(b) && !held.has(b);
      const at = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (edge(UP)) key(window, 'ArrowUp');
      if (edge(DOWN)) key(window, 'ArrowDown');
      if ((edge(LEFT) || edge(RIGHT)) && at) {
        const dir = edge(LEFT) ? -1 : 1;
        if (at instanceof HTMLSelectElement) {
          const next = Math.min(at.options.length - 1, Math.max(0, at.selectedIndex + dir));
          if (next !== at.selectedIndex) {
            at.selectedIndex = next;
            at.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else key(at, dir < 0 ? 'ArrowLeft' : 'ArrowRight');
      }
      if (edge(A) && at && at !== document.body) at.click();
      if (edge(B)) back();
      held = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [back]);
}
