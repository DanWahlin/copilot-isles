import type { Group, Mesh, Object3D, PerspectiveCamera } from 'three/webgpu';
import type { IslandEntry } from '../../islands/types';
import type { CircleObstacle } from '../contracts';
import type { FarCull } from '../far-cull';
import type { IslandStreamContext } from '../island-parts';
import type { StreamState } from '../stream-lifecycle';
import type { CreatedTerrain } from '../terrain/terrain-mesh';

/**
 * What the game sees of an island in memory, streamed (Meridian, Thousand-Bough) or built with the
 * world and dormant while you're away (Anchorage): its residency (game/residency.ts), its warm-ups
 * (game/island-warm.ts) and its loads.
 */
export interface ResidentIsland {
  /** Its terrain (for the warm-up's levels of detail), once it's in. */
  readonly terrain: CreatedTerrain | null;
  /** Where it is: absent, loading, resident, unloading or failed. */
  readonly state: StreamState;
  /** How many times it has come in this voyage (each load's content is set up once). */
  readonly loads: number;
  /** True while a warm-up holds it. */
  readonly held: boolean;
  /**
   * Starts it coming in (once per residency; later calls share it). `priority` 'low' is a prefetch
   * (the likely next island); `retry` tries again at once after a failed load.
   */
  load(priority?: RequestPriority, retry?: boolean): Promise<unknown>;
  /** Frees it (or puts it to sleep) a part a frame; whoever put things on it takes them off first. */
  unload(): Promise<void>;
  /** Its own roots for a warm-up, once it's in. */
  roots(): Object3D[];
  /** Hands its visibility to a warm-up (the frame loop keeps updating but stops showing and hiding it). */
  hold(on: boolean): void;
}

/**
 * A streamed island (PLAN §13.3, issue 232): its silhouette stands on the horizon from the start,
 * and its world (terrain, water, foam, town or village, plants, birds) streams in on demand, hidden
 * until the game's flow warms it, and is freed again once you've left. `W` is the island's own world
 * (Port Meridian's town, Thousand-Bough's tree village), which its content (game side) builds on.
 */
export interface IslandStream<W = unknown> extends ResidentIsland {
  /** The far shape, drawn until the island is near. */
  readonly silhouette: Group;
  /** Resolves once the silhouette's mesh is built (a few grid rows a breath). */
  readonly silhouetteReady: Promise<void>;
  readonly foam: Mesh | null;
  /** True once its ground is in (terrain and foam), before the rest of its world. */
  readonly ready: boolean;
  /** Walkers' colliders round its trunks and big plants while its plants are in (none before). */
  readonly plantColliders: readonly CircleObstacle[];
  /** The island's world, once streamed. */
  readonly world: W | null;
  load(priority?: RequestPriority, retry?: boolean): Promise<W | null>;
  /** Resolves when the current (or next) load has finished (it doesn't start the stream). */
  readonly worldReady: Promise<W | null>;
  /** Hears every load (the first and each reload after an unload). */
  onReady(fn: (world: W) => void): () => void;
  /** Small detail (people, chests, props) culled while the camera's far from the island. */
  readonly detail: FarCull;
  /** Per frame: streams in by range, shows or hides by range, and runs the world. */
  update(camera: PerspectiveCamera, dt: number, t: number): void;
  /** Roots the harbour mirror leaves out (pushed onto `out`). */
  mirrorHidden(out: (Object3D | null | undefined)[]): void;
  dispose(): void;
}

/** What the world gives a streamed island's stream when it's made (cove-scene.ts). */
export interface IslandStreamCreateContext extends IslandStreamContext {
  /** The island's registry entry: its ranges, outline, centre and light. */
  island: IslandEntry;
  /** The sky, whose mood (haze) an island with its own air sets as you near it. */
  sky: { mood: { fogScale: number; hazeTint: [number, number, number]; fill: number; exposure: number } };
  /** Whether coming near streams the island in now. */
  nearLoads(): boolean;
}

/** A streamed island's stream maker (its `IslandCode.stream`, src/game/island-code.ts). */
export type IslandStreamFactory = (ctx: IslandStreamCreateContext) => IslandStream;
