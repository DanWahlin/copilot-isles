import { useEffect, useRef } from 'react';
import { PLAYABLE_COURSES, courseVoiced, type CourseMeta } from '../../course/catalog';
import type { GameBridge, UiState } from '../bridge';
import { OverlayShell } from '../components/OverlayShell';

/**
 * The course list (docs/specs/COURSE-PACKS.md §8): New Voyage opens it when there's more than one
 * course. Each card is the course's `course.json` (the title loads nothing else): its title, tagline,
 * chapters and minutes on the chart, whether it's voiced, its license and its source. Keyboard (the
 * arrows, Enter, Esc), touch (a tap) and a gamepad (the d-pad, A, B) all pick.
 */
export function CourseSelect({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const root = useRef<HTMLDivElement>(null);
  usePadPicks(root, bridge.back);
  return (
    <OverlayShell title="Choose your course" eyebrow="New voyage" onBack={bridge.back} wide>
      <div ref={root} className="ci-course-list" role="list">
        {PLAYABLE_COURSES.map((c, i) => (
          <CourseCard
            key={c.id}
            course={c}
            current={c.id === state.course}
            saved={state.savedCourses?.includes(c.id) ?? false}
            initial={
              c.id === state.course || (i === 0 && !PLAYABLE_COURSES.some((x) => x.id === state.course))
            }
            onPick={() => bridge.pickCourse(c.id)}
          />
        ))}
      </div>
      <div className="ci-panel-actions">
        <button className="ci-secondary" onClick={bridge.back}>
          Back
        </button>
      </div>
    </OverlayShell>
  );
}

function CourseCard({
  course,
  current,
  saved,
  initial,
  onPick,
}: {
  course: CourseMeta;
  current: boolean;
  saved: boolean;
  initial: boolean;
  onPick: () => void;
}) {
  const charted = course.islands.length;
  const minutes = course.islands.reduce((n, i) => n + i.minutes, 0);
  const chapters = course.source.chapters.length;
  const home = `https://github.com/${course.source.repo}`;
  return (
    <div role="listitem" className={`ci-course-card${current ? ' current' : ''}`}>
      <button
        className="ci-course-pick"
        data-course={course.id}
        data-initial-focus={initial ? 'true' : undefined}
        onClick={onPick}
      >
        <span className="ci-course-title">{course.title}</span>
        <span className="ci-course-tagline">{course.tagline}</span>
        <small className="ci-course-meta">
          {`${chapters} chapters · ${charted} on the chart · about ${minutes} min`}
          {courseVoiced(course) ? ' · voiced' : ' · captions only'}
          {saved ? ' · saved voyage' : ''}
        </small>
      </button>
      <p className="ci-course-desc">{course.description}</p>
      <p className="ci-course-license">
        {`${course.source.license} License, ${course.source.copyright} `}
        <a href={home} target="_blank" rel="noreferrer">
          {`${course.source.repo} ↗`}
        </a>
      </p>
    </div>
  );
}

/** The d-pad (or stick) moves between the courses, A picks, B goes back. */
function usePadPicks(root: React.RefObject<HTMLDivElement | null>, back: () => void): void {
  useEffect(() => {
    let raf = 0;
    // Buttons already held when the list opened (the press that opened it) don't count.
    let held = new Set<number>(pressed());
    const step = () => {
      const now = new Set(pressed());
      const edge = (b: number) => now.has(b) && !held.has(b);
      const picks = [...(root.current?.querySelectorAll<HTMLButtonElement>('.ci-course-pick') ?? [])];
      const at = picks.indexOf(document.activeElement as HTMLButtonElement);
      if (picks.length && (edge(13) || edge(15))) picks[(at + 1) % picks.length]!.focus();
      if (picks.length && (edge(12) || edge(14))) picks[(at - 1 + picks.length) % picks.length]!.focus();
      if (edge(0) && at >= 0) picks[at]!.click();
      if (edge(1)) back();
      held = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [root, back]);
}

function pressed(): number[] {
  const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === 'standard');
  return pad ? pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])) : [];
}
