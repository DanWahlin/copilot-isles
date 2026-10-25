import type { Object3D } from 'three/webgpu';
import type { CircleObstacle } from '../world/contracts';
import { naturalWaterAt } from '../world/islands/fresh-water-natural';
import { DeckIndex } from '../world/islands/keelhaven/decks';
import { keelhavenWater } from '../world/islands/keelhaven/height';
import type { KeelhavenWorld } from '../world/islands/keelhaven/index';
import { KEELHAVEN } from '../world/islands/keelhaven/layout';
import { worksWaterAt } from '../world/islands/keelhaven/works';
import type { BoxCollider, InlandWater, WalkSurface } from './collision';
import type { IslandContentHost } from './island-code';
import type { Npc } from './npcs';
import { keelhavenNpcScript } from './keelhaven-quests';
import type { ScriptStep } from './script';

/**
 * Keelhaven's content in the play session (docs/specs/ISLAND-03-keelhaven.md §4-§7): the works'
 * fences and camera boxes, its walk surfaces (the quay, the copings, the caissons, the gates' walkways,
 * the verandas, the stair up the North Head) and its water, on the island's streamed world. It talks to
 * the world only through `KeelhavenWorld` and its layout data, and to the session through the host.
 */
export interface KeelhavenContent {
  /** The island's walk surfaces, live once the world's streamed. */
  readonly surface: WalkSurface;
  /** The Keel River (wade its shallows) and the works' still water (the basin, the docks, the locks). */
  inland(x: number, z: number, ground: number, out: InlandWater): boolean;
  setup(world: KeelhavenWorld): Promise<{ roots: Object3D[]; reveal(): void }>;
  teardown(): void;
  readonly npcs: readonly Npc[];
  readonly ids: ReadonlySet<string>;
  script(id: string): { steps: readonly ScriptStep[] } | null;
  updateNpcs(dt: number, at: { x: number; y: number; z: number }, eye: { x: number; z: number }): void;
  update(dt: number, t: number): void;
  debug: Record<string, (...args: never[]) => unknown>;
  dispose(): void;
}

/** Within this distance (m) of the island's centre its cast runs. */
const NEAR = 900;

export function createKeelhavenContent(host: IslandContentHost): KeelhavenContent {
  let world: KeelhavenWorld | null = null;
  let decks: DeckIndex | null = null;
  let disposed = false;
  const ids = new Set<string>();
  const q = () => host.puzzleHost.quests();
  const water = keelhavenWater();

  const surface: WalkSurface = {
    heightAt: (x, z, y) => decks?.heightAt(x, z, y) ?? null,
    kind: (x, z) => (decks?.woodAt(x, z) ? 'wood' : 'stone'),
  };

  /** Bumped by each teardown, so a setup still building for a freed world stops. */
  let generation = 0;
  const added = { colliders: [] as (BoxCollider | CircleObstacle)[] };

  async function setup(w: KeelhavenWorld): Promise<{ roots: Object3D[]; reveal(): void }> {
    const none = { roots: [] as Object3D[], reveal() {} };
    if (disposed || world) return none;
    world = w;
    const works = w.works;
    decks = new DeckIndex(works.decks);
    for (const b of works.colliders) host.world.addBox(b);
    for (const c of works.circles) host.world.addCircle(c);
    for (const b of works.cameraBoxes) host.world.addCameraBox(b);
    added.colliders.push(...works.colliders, ...works.circles, ...works.cameraBoxes);
    void generation;
    return { roots: [], reveal() {} };
  }

  function teardown(): void {
    generation++;
    if (!world) return;
    host.world.remove(added.colliders);
    added.colliders.length = 0;
    decks = null;
    world = null;
  }

  return {
    surface,
    inland(x, z, ground, out) {
      if (!world) return false;
      const level = worksWaterAt(x, z);
      if (level !== null && level > ground) {
        out.level = level;
        out.floor = ground;
        return true;
      }
      return naturalWaterAt(water, x, z, ground, out);
    },
    setup,
    teardown,
    npcs: [],
    ids,
    script: (id) => keelhavenNpcScript(id, q()),
    updateNpcs(_dt, _at, eye) {
      if (Math.hypot(eye.x - KEELHAVEN.center.x, eye.z - KEELHAVEN.center.z) > NEAR) return;
    },
    update() {},
    debug: {
      ready: () => !!world,
      decks: () => world?.works.decks.length ?? 0,
    },
    dispose() {
      disposed = true;
      teardown();
    },
  };
}
