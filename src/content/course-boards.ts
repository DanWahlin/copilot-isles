import { onCourse } from '../course/active';

/**
 * The typed view of a course pack's `boards.json` (docs/content-data.md, docs/specs/COURSE-BOARDS.md):
 * the header and pin text, and the `##` sections that aren't topics. Which chapter an island's board
 * shows is the island's chapter in the pack's `course.json`, where it stands is the game's
 * (src/world/islands/course-boards.ts), and the topics come from the pack's `lock.json`.
 * `src/content/content.test.ts` validates it.
 */

export interface CourseBoardPinData {
  /** The chapter's README, or the course's home. */
  link: 'chapter' | 'home';
  /** The pin's first line ("This chapter"). */
  label: string;
  /** The second line on the board in the world. */
  sign: string;
  /** The second line in the overlay. */
  text: string;
  /** What a screen reader says after the label. */
  aria: string;
}

export interface CourseBoardsData {
  header: { sign: readonly string[]; kicker: string };
  pins: readonly CourseBoardPinData[];
  skip: { anchors: readonly string[]; titlePrefixes: readonly string[] };
}

/** The active course's board text (empty until a voyage loads the course pack). */
export let COURSE_BOARDS_DATA: CourseBoardsData = {
  header: { sign: [], kicker: '' },
  pins: [],
  skip: { anchors: [], titlePrefixes: [] },
};
onCourse((p) => {
  COURSE_BOARDS_DATA = p.boards;
});

/** Fills `{num}` and `{title}` in the file's text. */
export function boardText(template: string, b: { num: string; title: string }): string {
  return template.replaceAll('{num}', b.num).replaceAll('{title}', b.title);
}
