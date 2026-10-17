import { COURSE_BOARDS_DATA } from '../../content/course-boards';
import type { IslandId } from '../../game/islands';
import type { CourseBoardPose } from '../sites/course-board';

/**
 * Where each island's course notice board stands (docs/specs/COURSE-BOARDS.md): one entry an island in
 * `content/course-boards.json` (docs/content-data.md).
 */
export const COURSE_BOARDS: Readonly<Record<IslandId, CourseBoardPose>> = COURSE_BOARDS_DATA.islands;
