import type { IslandMusic } from '../audio/music/tracks';
import type { CourseBoardPose } from '../world/sites/course-board';
import type { IslandFootprint } from '../world/islands/footprint';
import type { StarfishSpot } from '../world/starfish/spots';
import type { IslandCode } from '../game/island-code';
import type { IslandArrival } from './arrival';
import type { IslandId } from './registry';

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

/** An island's air: haze density × `fogScale`, haze colour × `hazeTint` (spec ISLAND-02 §2.4). */
export interface IslandMood {
  fogScale: number;
  hazeTint: readonly [number, number, number];
}

/**
 * An island you can moor at: where the ship lies alongside, where you step ashore, what plays, and
 * what the compass calls it while you're sailing there.
 */
export interface IslandBerth {
  id: IslandId;
  name: string;
  /** The compass label for sailing home to it. */
  berthLabel: string;
  /** The dock prompt near the berth. */
  dockLabel: string;
  /** Where the ship moors (the dock assist target); its port side lies against the quay. */
  mooring: Pose;
  /** Which way you face after stepping ashore beside the gangway (toward the town). */
  landingHeading: number;
  /** A fast-travel spot on the quay by the berth. */
  quay: Pose;
  music: IslandMusic;
  /** The island's time of day: solar hours and the sun path's rotation (degrees). */
  sky: { hours: number; azimuth: number };
  arrival: IslandArrival;
  /** The island's air (fog and haze), blended in on the passage like the sky; identity without one. */
  mood?: IslandMood;
  /** Whether it's inside the island's waters (for saves, travel, and which island you're on). */
  contains(x: number, z: number): boolean;
}

/**
 * When an island opens (the chart, the berths, the compass): only in a course that teaches a
 * chapter there; then in the dev build, with the URL flag `?<flag>`, or for everyone once another
 * island's story holds a condition (src/islands/open.ts).
 */
export interface IslandGate {
  /** It opens once this island's story holds this condition (Thousand-Bough: Meridian's Seal). */
  after?: { island: IslandId; condition: 'sealed' };
}

/**
 * An island's distances (m, by `footprintDistance`: from its centre as if its shore were round). It
 * streams in (or wakes) within `load`, is drawn (not its silhouette) within `show`, resident or not,
 * and may be freed (or go dormant) past `unload` (game/residency.ts). Its small detail (people,
 * chests, props) is culled past `detail` of its centre.
 */
export interface IslandRanges {
  load: number;
  show: number;
  unload: number;
  detail: number;
  /** Residency measures `load` and `unload` from its centre, not its outline (the home island). */
  byCentre?: boolean;
}

/** How a streamed island's world comes in and goes out (its `IslandCode.stream`, world/islands/island-stream.ts). */
export interface IslandStreamSpec {
  /** Coming near streams it in always, or only in a course that teaches a chapter there. */
  nearLoads: 'always' | 'in-course';
  /** Whether the harbour mirror (Anchorage's) can see it, so its warm compiles for the mirror too. */
  reflected: boolean;
}

/**
 * One island in the registry (src/islands/registry.ts): what every shared system needs to know of
 * it. The data here is small and safe for the title (the chart asks about it); the island's code
 * comes in through `code`, a dynamic import, so each island is a chunk of its own.
 */
export interface IslandEntry extends IslandBerth {
  /** The URL name: `?<flag>` opens it in a built game, `?no<flag>` leaves it out of the world. */
  flag: string;
  /** The middle of its land: its light's reach and its detail range go from here. */
  center: { x: number; z: number };
  /**
   * How far its light reaches over the sea: full within `full` m of its centre, none past `reach`
   * (`passageSky`). The home island's light is the open sea's, so it has none.
   */
  skyReach?: { reach: number; full: number };
  /** When it opens; null: always (the home island). */
  open: IslandGate | null;
  ranges: IslandRanges;
  /** Its outline: the ranges go by the distance to it (`footprintDistance`). */
  footprint: IslandFootprint;
  /** The starfish to find there (the Logbook's list and the HUD's count). */
  starfish: readonly StarfishSpot[];
  /** Where its course notice board stands (docs/specs/COURSE-BOARDS.md) and where that is, in words. */
  courseBoard: CourseBoardPose & { where: string };
  /** The name's offset (px at the chart's scale) below its point on the opening's 3D chart. */
  chartLabelDy: number;
  /** A streamed island (null: the home island, built with the world, which goes dormant instead). */
  stream: IslandStreamSpec | null;
  /**
   * The island's code (src/game/island-code.ts): its stream (world), its quests, its walks and its
   * content. A dynamic import: the flow fetches it with the world's code when a voyage starts.
   */
  code(): Promise<IslandCode>;
}
