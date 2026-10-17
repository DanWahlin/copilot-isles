import data from '../../content/course-boards.json';
import type { IslandId } from '../game/arrivals';
import type { ChapterId } from '../learn/course/chapters';

/**
 * The typed view of `content/course-boards.json` (docs/content-data.md, docs/specs/COURSE-BOARDS.md):
 * each island's board (its chapter and where it stands), the header and pin text, and the `##`
 * sections that aren't topics. The topics come from content/course.lock.json. It's part of the build,
 * so a merged edit ships with the next deploy; `src/content/content.test.ts` validates it.
 */

/** Where a board stands: `y` is the ground under it, `rot` its yaw (it faces local +z). */
export interface CourseBoardPlacement {
  chapter: ChapterId;
  /** Where it is, in words (for people editing the file). */
  where: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

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
  islands: Readonly<Record<IslandId, CourseBoardPlacement>>;
}

export const COURSE_BOARDS_DATA = data as unknown as CourseBoardsData;

/** Fills `{num}` and `{title}` in the file's text. */
export function boardText(template: string, b: { num: string; title: string }): string {
  return template.replaceAll('{num}', b.num).replaceAll('{title}', b.title);
}
