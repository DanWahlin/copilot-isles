import type { IslandId } from '../../game/islands';
import { COVE } from '../layout';
import type { CourseBoardPose } from '../sites/course-board';
import { MERIDIAN } from './meridian';
import { THOUSAND_BOUGH } from './thousand-bough/layout';

/** Where each island's course notice board stands (docs/specs/COURSE-BOARDS.md): one line an island. */
export const COURSE_BOARDS: Readonly<Record<IslandId, CourseBoardPose>> = {
  anchorage: COVE.courseBoard,
  meridian: MERIDIAN.harbor.courseBoard,
  'thousand-bough': THOUSAND_BOUGH.harbor.courseBoard,
};
