import { courseIsland, onCourseSelected } from '../../course/catalog';
import { ISLAND_LIST, type IslandId } from '../../islands/registry';
import type { CourseBoardPose } from '../sites/course-board';

/** Where a board stands: `y` is the ground under it, `rot` its yaw (it faces local +z). */
export interface CourseBoardPlacement extends CourseBoardPose {
  /** The course chapter it shows: the island's chapter in the course pack's `course.json`. */
  chapter: string;
  /** Where it is, in words. */
  where: string;
}

/**
 * Where each island's course notice board stands (docs/specs/COURSE-BOARDS.md), with the chapter it
 * shows (the game's part: its registry entry's `courseBoard`). Every island has a board; an island the course doesn't use would show none.
 */
const placements = () =>
  Object.fromEntries(
    ISLAND_LIST.map((e) => [e.id, { chapter: courseIsland(e.id)?.chapter ?? '', ...e.courseBoard }]),
  ) as Record<IslandId, CourseBoardPlacement>;
export let COURSE_BOARDS: Readonly<Record<IslandId, CourseBoardPlacement>> = placements();
onCourseSelected(() => {
  COURSE_BOARDS = placements();
});
