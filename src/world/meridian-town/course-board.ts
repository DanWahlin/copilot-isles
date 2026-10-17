import type { BufferGeometry, Group } from 'three/webgpu';
import { islandCourseBoard } from '../../learn/course-board';
import { addCourseBoardNotices, addCourseBoardTimber } from '../sites/course-board';
import { SignSet } from '../sites/sign';
import type { MaterialKey, VillageBoxCollider } from '../village/kit';
import { COURSE_BOARDS } from '../islands/course-boards';

/**
 * Port Meridian's course notice board (docs/specs/COURSE-BOARDS.md) on the quay, clear of the plaza:
 * its timber merges into the town's chunks, and its lettering is a small sign set of its own (one draw).
 * A step a board, so the town's build keeps breathing.
 */
export function* addMeridianCourseBoard(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[]; camera?: VillageBoxCollider[] },
  group: Group,
): Generator<void, { dispose(): void }, void> {
  const board = islandCourseBoard('meridian');
  if (!board) return { dispose() {} };
  const pose = COURSE_BOARDS.meridian;
  const parts = addCourseBoardTimber(buckets, pose, board);
  colliders.boxes.push(parts.box);
  colliders.camera?.push(parts.camera);
  // The lettering needs a canvas (none in the town's Node tests).
  if (typeof document === 'undefined') return { dispose() {} };
  const signs = new SignSet('meridian course board');
  addCourseBoardNotices(signs, pose, board);
  const mesh = yield* signs.finalizeSteps();
  group.add(mesh);
  return { dispose: () => signs.dispose() };
}
