import { useEffect, useRef, useState } from 'react';
import paperUrl from '../../game/chart-label/paper.webp';
import { PadEdges, standardPad } from '../../game/puzzles/pad-edges';
import { courseBoard } from '../../learn/course-board';
import type { ChapterId } from '../../learn/course/chapters';
import type { LearnStore } from '../../learn/store';
import { isTyping } from '../typing';
import './course-board.css';

const NEW_TAB = 'opens the course on GitHub in a new tab';
const BLOCKED = 'Your browser kept the new tab closed. Press Enter or tap the topic instead.';

/** Opens a course link from a gamepad press (not a click, so the browser may block it). */
function openInNewTab(url: string): boolean {
  const tab = window.open(url, '_blank');
  if (!tab) return false;
  tab.opener = null;
  return true;
}

/**
 * An island's course notice board, read up close (docs/specs/COURSE-BOARDS.md): the chapter's topics
 * as links into the course on GitHub, each opening in a new tab, with ✓ on the ones the player has met
 * in the game, and pins to the chapter's README and the course's home. Real links, so a click, a tap
 * or Enter opens them as the browser always does; the arrows (or the d-pad) move between them, A
 * opens one, and Esc (or B) goes back to the island.
 */
export function CourseBoardPanel({
  store,
  chapter,
  covered,
}: {
  store: LearnStore;
  chapter: ChapterId;
  covered: readonly string[];
}) {
  const board = courseBoard(chapter);
  const list = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    list.current?.querySelector<HTMLAnchorElement>('a[data-cb]')?.focus();
  }, []);

  useEffect(() => {
    const links = () => [...(list.current?.querySelectorAll<HTMLAnchorElement>('a[data-cb]') ?? [])];
    const move = (step: number) => {
      const all = links();
      if (!all.length) return;
      const i = all.indexOf(document.activeElement as HTMLAnchorElement);
      const next = i < 0 ? 0 : Math.min(all.length - 1, Math.max(0, i + step));
      all[next]!.focus();
    };
    const key = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const step =
        e.key === 'ArrowDown' || e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
            ? -1
            : 0;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        store.closeCourseBoard();
      } else if (step) {
        e.preventDefault();
        e.stopImmediatePropagation();
        move(step);
      }
    };
    window.addEventListener('keydown', key, true);
    // The gamepad: the d-pad moves, A opens the topic, B goes back. The press that opened the board
    // mustn't also pick: the first look only notes what's held.
    const edges = new PadEdges();
    edges.arm();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const gp = standardPad();
      if (!gp || !edges.look(gp)) return;
      const edge = (i: number) => edges.edge(gp, i);
      if (edge(13) || edge(15)) move(1);
      if (edge(12) || edge(14)) move(-1);
      if (edge(0)) {
        const a = document.activeElement as HTMLAnchorElement | null;
        if (a?.dataset.cb !== undefined && a.href) setNote(openInNewTab(a.href) ? null : BLOCKED);
      }
      if (edge(1)) store.closeCourseBoard();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', key, true);
      cancelAnimationFrame(raf);
    };
  }, [store]);

  if (!board) return null;
  const done = new Set(covered);
  const ticked = board.topics.filter((t) => done.has(t.anchor)).length;
  return (
    <div className="ci-learn-backdrop">
      <div
        className="ci-cb"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-cb-title"
        aria-describedby="ci-cb-intro"
        style={{ ['--cb-paper' as string]: `url("${paperUrl}")` }}
      >
        <div className="ci-cb-paper" aria-hidden />
        <div className="ci-cb-body">
          <p className="ci-cb-kicker">Course notices · Chapter {board.num}</p>
          <h2 id="ci-cb-title">{board.title}</h2>
          <p id="ci-cb-intro" className="ci-cb-intro">
            Pick a topic to read it in the course. Each one opens the course on GitHub in a new tab, so your
            voyage stays right here.{' '}
            <span className="ci-cb-legend">
              <span className="ci-cb-tick" aria-hidden>
                ✓
              </span>{' '}
              {ticked > 0
                ? `marks the ${ticked === 1 ? 'topic' : `${ticked} topics`} you’ve already met in the game.`
                : 'will mark the topics you meet in the game.'}
            </span>
          </p>
          <div className="ci-cb-lists" ref={list}>
            <ul className="ci-cb-topics" aria-label={`Chapter ${board.num} topics`}>
              {board.topics.map((t) => {
                const met = done.has(t.anchor);
                return (
                  <li key={t.anchor}>
                    <a
                      data-cb=""
                      className={`ci-cb-link${met ? ' met' : ''}`}
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t.title}${met ? ', met in the game' : ''} (${NEW_TAB})`}
                    >
                      <span className="ci-cb-tick" aria-hidden>
                        {met ? '✓' : ''}
                      </span>
                      <span className="ci-cb-text">{t.title}</span>
                      <ExternalIcon />
                    </a>
                  </li>
                );
              })}
            </ul>
            <ul className="ci-cb-pins" aria-label="More of the course">
              <li>
                <a
                  data-cb=""
                  className="ci-cb-link pin"
                  href={board.chapterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`This chapter: Chapter ${board.num}, ${board.title} (${NEW_TAB})`}
                >
                  <span className="ci-cb-text">
                    <small>This chapter</small>
                    {board.num} · {board.title}
                  </span>
                  <ExternalIcon />
                </a>
              </li>
              <li>
                <a
                  data-cb=""
                  className="ci-cb-link pin"
                  href={board.homeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`The whole course: GitHub Copilot app for Beginners (${NEW_TAB})`}
                >
                  <span className="ci-cb-text">
                    <small>The whole course</small>
                    GitHub Copilot app for Beginners
                  </span>
                  <ExternalIcon />
                </a>
              </li>
            </ul>
          </div>
          <p className="ci-cb-note" role="status" aria-live="polite">
            {note ?? ''}
          </p>
          <div className="ci-cb-actions">
            <p className="ci-cb-help" aria-hidden>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move · <kbd>↵</kbd> open in a new tab
            </p>
            <button type="button" className="ci-btn ghost ci-cb-back" onClick={store.closeCourseBoard}>
              Back to the island <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A box with an arrow leaving it: the link opens somewhere else. */
function ExternalIcon() {
  return (
    <svg className="ci-cb-out" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
