import { courseIsland, onCourseSelected } from '../../course/catalog';
import type { IslandId } from '../../game/islands';
import type { CourseBoardPose } from '../sites/course-board';

/** Where a board stands: `y` is the ground under it, `rot` its yaw (it faces local +z). */
export interface CourseBoardPlacement extends CourseBoardPose {
  /** The course chapter it shows: the island's chapter in the course pack's `course.json`. */
  chapter: string;
  /** Where it is, in words. */
  where: string;
}

/** The game's part: where each island's board stands (the course decides what's on it). */
const SPOTS: Readonly<Record<IslandId, Omit<CourseBoardPlacement, 'chapter'>>> = {
  anchorage: {
    where:
      "East side of the street from the quay up to the village square, turned toward the pier foot, so it's in view as you come ashore.",
    x: -99.8,
    y: 2.48,
    z: -59.2,
    rot: -2.16,
  },
  meridian: {
    where:
      'Against the harbour wall at the back of the quay, between two palms, facing the water. You pass it walking from the east arm to the stair street, well clear of the plaza.',
    x: 723,
    y: 2.4,
    z: -768.6,
    rot: 0,
  },
  'thousand-bough': {
    where:
      "Bough Landing's east side, north of Lani's market booth, facing back up the wharf: you see it as you walk ashore, before the Fern Walk.",
    x: 1955.6,
    y: 2.6,
    z: -1436.2,
    rot: -1.0,
  },
};

/**
 * Where each island's course notice board stands (docs/specs/COURSE-BOARDS.md), with the chapter it
 * shows. Every island here has a board; an island the course doesn't use would show none.
 */
const placements = () =>
  Object.fromEntries(
    Object.entries(SPOTS).map(([island, spot]) => [
      island,
      { chapter: courseIsland(island)?.chapter ?? '', ...spot },
    ]),
  ) as Record<IslandId, CourseBoardPlacement>;
export let COURSE_BOARDS: Readonly<Record<IslandId, CourseBoardPlacement>> = placements();
onCourseSelected(() => {
  COURSE_BOARDS = placements();
});
