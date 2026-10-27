import type { IslandMusic, MusicTrack } from '../audio/music/tracks';
import type { PuzzleMechanic } from '../course/pack';
import type { FloraPalette } from '../world/flora/types';
import type { TerrainRegions } from '../world/terrain/terrain-regions';
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
  /**
   * Where the crew warps her as you board (behind the fade), when the way out from the berth runs too
   * close to the wind or the quay holds her: off the quay, her bow on a point of sail with the
   * compass's first leg off the wind, so she sails off as the sails fill.
   */
  departure?: Pose;
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

/** An island's Model Market stall (docs/specs/MODEL-MARKET.md §2). */
export interface IslandMarket {
  /** The stall's puzzle id; `market@<id>` when not given (Gilda's is the pack's `market`). */
  puzzle?: string;
  /** Their id in the island's cast and the name the work order calls them (and their lines' speaker). */
  keeper: { npc: string; name: string };
  /** Whose lines the keeper says: Gilda's (`gilda` in the pack's market.json) or their own (`keepers.<island>`). */
  lines: 'gilda' | 'keepers';
}

/** What the opening's 3D chart samples for an island's miniature (`ChartIslandSource`). */
export interface IslandChart {
  /** World point drawn at the island's archipelago position (the middle of its land). */
  cx: number;
  cz: number;
  /** Chart metres per world metre. */
  scale: number;
  /** The world box sampled for the miniature (land plus its shallows), and the sample spacing. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cell: number;
  /** The island's baked terrain pack (under the packs base), resampled for the miniature. */
  pack: string;
  /**
   * Its terrain functions, a dynamic import (they are the world's own, so they stay out of the
   * registry's chunk): the opening waits for them with the terrain packs.
   */
  terrain(): Promise<IslandChartTerrain>;
}

/** An island's terrain functions for its chart miniature (and the content check's ground). */
export interface IslandChartTerrain {
  height(x: number, z: number): number;
  masks(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number };
  /** Height added over the baked terrain for a landmark it doesn't hold (a raised canopy dome). */
  relief?(x: number, z: number): number;
}

/** How a streamed island's world comes in and goes out (its `IslandCode.stream`, world/islands/island-stream.ts). */
export interface IslandStreamSpec {
  /** Coming near streams it in always, or only in a course that teaches a chapter there. */
  nearLoads: 'always' | 'in-course';
  /** Whether the harbour mirror (Anchorage's) can see it, so its warm compiles for the mirror too. */
  reflected: boolean;
  /**
   * The course data its stream waits for with its terrain (`IslandStreamContext.courseData`):
   * `'chapter-part'` loads its chapter's part of the course pack (`loadIslandPart`,
   * src/course/load.ts), so its quests, scripts and puzzles are in before anything on it is made;
   * `'none'` loads nothing more (the core and the home island's part load with the voyage).
   */
  courseData: 'chapter-part' | 'none';
  /**
   * Whether it has its own floor tile for the ocean's depth colour (its shallows are outside the home
   * tile, `WATER_DEPTH_BOUNDS`): its stream builds it from its baked terrain and lends it while the
   * island is in memory (src/world/islands/depth-tile.ts).
   */
  depthTile: boolean;
}

/**
 * An island whose world is still being built (src/islands/registry.ts `ISLANDS_IN_BUILD`): only the
 * parts the shared world already draws (its terrain regions, for the dev terrain page). It isn't in
 * the game: no berth, no stream, no content. When it's done, its full entry replaces this line.
 */
export interface IslandInBuild {
  id: string;
  terrainRegions: TerrainRegions;
  /** Its grass and flower palette (the dev pages draw its flora with it), once it has one. */
  floraPalette?: FloraPalette;
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
  /**
   * Its light comes the morning after another island's (spec ISLAND-03 O3): on the passage from
   * `after`, that island's evening holds (the sky never runs back through the afternoon) until a
   * "next morning" cut, then this island's morning holds until you're in its waters.
   */
  nextMorningAfter?: IslandId;
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
  /** Its miniature on the opening's 3D chart (src/opening/chart-map.ts). */
  chart: IslandChart;
  /** Its theme: the track `music` plays (src/audio/music/tracks.ts derives `MUSIC_TRACKS` from it). */
  theme: MusicTrack;
  /**
   * Where its ground looks different (its town, hills, bluffs): masks the shared terrain material
   * combines in voyage order (src/world/islands/terrain-regions.ts).
   */
  terrainRegions: TerrainRegions;
  /** Its grass and flower colours and species, for the shared flora graphs (src/world/islands/flora-palettes.ts). */
  floraPalette: FloraPalette;
  /**
   * The puzzles on it, by the pack's file name, and the mechanic each runs. Their content goes in the
   * island's chapter part of the course pack (src/course/puzzle-islands.ts, src/course/split.ts).
   */
  puzzles: Readonly<Record<string, PuzzleMechanic>>;
  /** Its Model Market stall's keeper, if it has a stall (src/game/market/stalls.ts). */
  market?: IslandMarket;
  /** A streamed island (null: the home island, built with the world, which goes dormant instead). */
  stream: IslandStreamSpec | null;
  /**
   * The island's code (src/game/island-code.ts): its stream (world), its quests, its walks and its
   * content. A dynamic import: the flow fetches it with the world's code when a voyage starts.
   */
  code(): Promise<IslandCode>;
}
