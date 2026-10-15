import type { Group, Vector3 } from 'three/webgpu';
import type { BoxCollider, SurfaceKind } from '../../../game/collision';
import type { CircleObstacle } from '../../contracts';
import type { CameraBlockerBox } from '../../terrain/camera-blockers';
import type { VillageAnchor } from '../../village/kit';

/**
 * The seam between Thousand-Bough's world (builder A) and its content (builder B): spec §9.3. The
 * content calls these views and reads these anchors; it never reads the world's geometry directly.
 * Frozen after step 0: change it only with both builders' agreement.
 */

/**
 * The Channel Routing puzzle's state (spec §5.7). The logic (`src/game/puzzles/channel-routing/`)
 * owns it; it's declared here so the world's views can take it without importing game code. The
 * logic's `types.ts` re-exports these (or declares the same shapes).
 */
export type Crew = 'feature' | 'bugfix' | 'docs';
export type TileKind = 'straight' | 'elbow' | 'rock';
export type Rot = 0 | 1 | 2 | 3;
export interface Tile {
  kind: TileKind;
  rot: Rot;
}
export type FlowEnd = 'wheel' | 'wrongWheel' | 'mixed' | 'mainHall' | 'deadEnd';
export interface Flow {
  crew: Crew;
  /** In order from the gate. */
  cells: readonly (readonly [row: number, col: number])[];
  end: FlowEnd;
  /** Where it went wrong. */
  at?: readonly [row: number, col: number];
  /** Whose wheel it reached. */
  wheel?: Crew;
}
export interface ChannelRoutingState {
  round: 1 | 2 | 3;
  phase: 'demo' | 'routing' | 'running' | 'solved' | 'twist' | 'done';
  /** 4 rows × 5 columns. */
  board: readonly (readonly Tile[])[];
  live: Readonly<Record<Crew, boolean>>;
  cursor: readonly [number, number] | null;
  /** Empty until the gates open. */
  flows: readonly Flow[];
  twistChoice?: 'redig' | 'port5174' | 'closeOne' | 'share';
}

export type TbAnchorName =
  | 'tamsin'
  | 'lyra'
  | 'saffi'
  | 'oak'
  | 'fen'
  | 'ines'
  | 'rook'
  | 'pip'
  | 'elder'
  | 'gateBoard'
  | 'puzzleCam'
  | 'twistCam'
  | 'flagMast'
  | 'skyBasketBottom'
  | 'skyBasketTop'
  | 'lanternHouse'
  | 'gondolaBell'
  | 'boothA'
  | 'boothB'
  | 'boothC'
  | 'extraSwing'
  | 'extraWeaver'
  | 'extraLift'
  | 'extraFisher'
  | 'extraLook';

/** Interaction ids the compass and prompts use. */
export type TbInteractionId =
  | `npc:${'tamsin' | 'lyra_bough' | 'saffi' | 'oak' | 'fen' | 'ines' | 'rook' | 'pip' | 'elder'}`
  | 'flume:board'
  | 'flag:@'
  | 'flag:#'
  | 'flag:/'
  | 'flag:&'
  | 'gondola:bell'
  | 'basket:bottom'
  | 'basket:top'
  | 'lantern:lever'
  | 'booth:a'
  | 'booth:b'
  | 'booth:c';

export interface FlumeTerraceView {
  /** A round starts (every round plays on the same board; round 3's channels are dug already). */
  setRound(round: 1 | 2 | 3): Promise<void>;
  setBoard(board: ChannelRoutingState['board'], animate: boolean): void;
  setCursor(cell: readonly [number, number] | null): void;
  /** A tile's centre in the world (for touch hit areas), written to `out`. */
  tileCenter(row: number, col: number, out: Vector3): Vector3;
  /** The old shared trough stands over the board (before Fen's demo) or is stacked beside it. */
  showSharedTrough(on: boolean): void;
  /**
   * Fen's demo, the old way: the three gates open into one shared trough over the board and their
   * water mixes into mud on the way down. Resolves once the mud pours into every crew's chute; the
   * water keeps running until `drainSharedTrough`.
   */
  demoSharedTrough(): Promise<void>;
  /** The gates shut and the trough's water runs out over its lip. */
  drainSharedTrough(): Promise<void>;
  /** At once (behind a fade): the trough's taken apart and stacked beside the terrace, the board shows. */
  clearSharedTrough(): void;
  /** Animates water, mud, floats, wheels and lifts. */
  runFlows(flows: readonly Flow[]): Promise<void>;
  resetWater(): void;
}

export interface SpireView {
  playJam(): Promise<void>;
  /** R3 unrolls, then it's walkable. */
  openSecondBridge(): Promise<void>;
  preview(crew: Crew, lookout: 5173 | 5174, on: boolean): void;
}

export interface SignalMastView {
  hoist(flag: '@' | '#' | '/' | '&', ok: boolean): Promise<void>;
  lowerAll(): void;
}

export interface TreeVillageFx {
  sealCascade(reducedMotion: boolean): Promise<void>;
  gondolaSend(): Promise<void>;
  lanternHouse(mode: 'day' | 'night'): void;
  skyBasketEnabled(on: boolean): void;
}

export interface ThousandBoughSystem {
  group: Group;
  anchors: Readonly<Record<TbAnchorName, VillageAnchor>>;
  /** The walk height at (x, z) for feet at `y` (stacked decks and the stair), or null off them. */
  walkable(x: number, z: number, y?: number): number | null;
  surfaceKind(x: number, z: number, y?: number): SurfaceKind;
  colliders(): readonly BoxCollider[];
  circles(): readonly CircleObstacle[];
  cameraBoxes(): readonly CameraBlockerBox[];
  /** Pools and streams: the water's surface at (x, z), or null where there's none. */
  inland(x: number, z: number): number | null;
  flume: FlumeTerraceView;
  spire: SpireView;
  mast: SignalMastView;
  fx: TreeVillageFx;
  /**
   * The Practice Bough house's sign shows this branch (the player's practice session, from Your
   * setup), or the course's `practice-empty-state-copy` for null. It repaints the sign atlas only when
   * the name changes: call it when the island streams in and when the player changes the branch.
   */
  setPracticeBranch(name: string | null): void;
  /** No allocation. */
  update(dt: number, t: number): void;
  dispose(): void;
}
