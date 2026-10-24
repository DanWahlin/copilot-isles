import { useEffect, useRef, type RefObject } from 'react';
import { PadEdges, standardPad } from '../../game/puzzles/pad-edges';
import { focusable } from './focus';

const A = 0;
const B = 1;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

/** Moves focus to the next (or previous) control in `root`, wrapping round. */
export function moveFocus(root: HTMLElement, step: 1 | -1): void {
  const list = focusable(root);
  if (!list.length) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
  list[next]!.focus();
}

/**
 * A gamepad on a learning card, as the keyboard works there: the d-pad moves between its buttons and
 * links, A presses the one that has focus, B goes back (Later, Skip, Close). The press that opened the
 * card doesn't count (the first look only notes what's held). The arrow keys move focus too, so the
 * keyboard and the pad move the same way.
 */
export function usePadFocus(root: RefObject<HTMLElement | null>, back: () => void, arrows = true): void {
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = root.current;
      if (!el || !arrows) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const step =
        e.key === 'ArrowDown' || e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
            ? -1
            : 0;
      if (!step) return;
      e.preventDefault();
      moveFocus(el, step);
    };
    window.addEventListener('keydown', key);
    if (typeof navigator === 'undefined' || !navigator.getGamepads)
      return () => window.removeEventListener('keydown', key);
    const edges = new PadEdges();
    edges.arm();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const gp = standardPad();
      const el = root.current;
      if (!gp || !el || !edges.look(gp)) return;
      const edge = (i: number) => edges.edge(gp, i);
      if (edge(DOWN) || edge(RIGHT)) moveFocus(el, 1);
      if (edge(UP) || edge(LEFT)) moveFocus(el, -1);
      if (edge(A)) {
        const at = document.activeElement;
        if (at instanceof HTMLElement && el.contains(at) && at !== el) at.click();
        else focusable(el)[0]?.focus();
      }
      if (edge(B)) backRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', key);
      cancelAnimationFrame(raf);
    };
  }, [root, arrows]);
}
