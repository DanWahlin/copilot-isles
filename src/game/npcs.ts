import { Vector3 } from 'three/webgpu';
import type { TierSettings } from '../engine/quality';
import type { Character, CharacterClip, CharacterLibrary, NpcId } from '../world/characters';
import type { CircleObstacle } from '../world/contracts';
import type { VillageAnchor } from '../world/village/kit';
import type { CollisionWorld } from './collision';
import { wrapAngle } from '../util/math';
import { onCourseSelected } from '../course/catalog';

export interface NpcSpec {
  /** Who they are in scripts and interactions (`npc:<id>`). */
  id: string;
  /** Their character body, when it isn't their id (Lyra plays on two islands). */
  body?: NpcId;
  name: string;
  anchor: string;
  /** Metres to step out along the anchor heading (doors face outward). */
  out?: number;
  /** Rotates only the NPC's facing, not the anchor placement. */
  headingOffset?: number;
  clip: CharacterClip;
  /** Walks a loop through these world xz points. */
  patrol?: [number, number][];
  /** Circles a point (anchor + orbitCenter) at this radius (the child round the well). */
  orbit?: number;
  orbitCenter?: [number, number];
  /** Where on the circle they start (radians), so two can share one without bunching up. */
  orbitPhase?: number;
  speed?: number;
  /**
   * Voice line ids for a conversation; otherwise a random unvoiced bark from the course pack
   * (`quests/<island>.json` → `barks`, by this NPC's id: src/course/active.ts `barksFor`).
   */
  voiced?: string[];
  /** Keeps the anchor's height instead of snapping to the ground (tower tops, benches). */
  keepY?: boolean;
  /** Collision radius in place of the body's, for someone standing in a narrow spot (the gallery). */
  obstacleR?: number;
  /** Visual drop from the anchor to put a seated rig's pelvis on the seat top. */
  seatDrop?: number;
  /** Optional anchor-local talk framing: +x is right of heading, +z is forward. */
  talkShot?: {
    shotLocal: readonly [x: number, y: number, z: number];
    targetLocal: readonly [x: number, y: number, z: number];
    faceLocal?: readonly [x: number, z: number];
    standLocal?: readonly [x: number, z: number];
  };
  /** Camera eye lift for generic talk framing. */
  talkEyeLift?: number;
  /** How close you need to be to talk (default 2.6 m); wider for someone up on a stage. */
  talkRadius?: number;
}

/** Test Cove folk (POC §4.3 cast, trimmed for the spike). Barks tease chapter-00 lessons. */
/**
 * The cast with the course's voiced lines for anyone who has some (`course.json` →
 * `hooks.npcVoiced`, by NPC id): they say those instead of a bark when there's no script for them.
 */
export function withCourseVoices(specs: NpcSpec[]): NpcSpec[] {
  onCourseSelected((c) => {
    for (const s of specs) {
      const v = c.hooks.npcVoiced[s.id];
      if (v) s.voiced = [...v];
      else delete s.voiced;
    }
  });
  return specs;
}

export const COVE_NPCS: NpcSpec[] = withCourseVoices([
  {
    id: 'nell',
    name: 'Nell Tidewell',
    anchor: 'harbourmasterDoor',
    // At the foot of her door stairs (they run 2.25 m out from the wall; the anchor's 0.9 out).
    out: 1.9,
    clip: 'idle',
    talkShot: {
      // Keep the door-stair view, but leave room behind the captain's shoulder.
      shotLocal: [4.5, 2.4, 4.8],
      targetLocal: [0, 1.52, 0.02],
      faceLocal: [4.5, 4.8],
      standLocal: [3.2, 2.2],
    },
  },
  {
    id: 'merchant',
    name: 'Ezra Quill',
    // At his chart table on the quay by the pier foot, facing the way you come from Nell.
    anchor: 'chartTable',
    clip: 'idle',
  },
  {
    id: 'dockhand_b',
    name: 'Bo Marlin',
    // In front of his gear rack, beside Ezra at the pier foot.
    anchor: 'boRack',
    clip: 'idle',
  },
  {
    id: 'dockhand_a',
    name: 'Dockhand',
    anchor: 'noticeBoard',
    clip: 'walk',
    // A loop along the quay, seaward of the cargo crates
    // (npcs.test.ts checks it against every village collider).
    patrol: [
      [-118, -69.0],
      [-93.5, -69.0],
      [-93.5, -69.8],
      [-119, -69.8],
    ],
    speed: 1.2,
  },
  {
    id: 'fisherman',
    name: 'Old Finn',
    anchor: 'finn',
    headingOffset: Math.PI / 2,
    clip: 'sit',
    keepY: true,
    seatDrop: 0.22,
  },
  {
    id: 'old_sailor',
    name: 'Salt',
    anchor: 'quayBenches',
    headingOffset: Math.PI,
    clip: 'sit',
    keepY: true,
    seatDrop: 0.22,
  },
  {
    id: 'child',
    name: 'Pip',
    anchor: 'plazaWell',
    clip: 'run',
    orbit: 3.4,
    orbitCenter: [-2.7, 1.2],
    speed: 2.6,
  },
  {
    id: 'suri',
    name: 'Suri Okoye',
    anchor: 'suri',
    clip: 'idle',
    keepY: true,
  },
  {
    id: 'pim',
    name: 'Pim',
    anchor: 'pim',
    clip: 'idle',
    keepY: true,
  },
  {
    id: 'pol',
    name: 'Pol',
    anchor: 'pol',
    clip: 'idle',
    keepY: true,
  },
  {
    id: 'juno',
    name: 'Juno',
    anchor: 'juno',
    clip: 'idle',
    keepY: true,
  },
  {
    id: 'lyra',
    name: 'Lyra Wren',
    anchor: 'lyra',
    clip: 'sit',
    keepY: true,
    seatDrop: 0.14,
    talkShot: {
      shotLocal: [4.5, 1.35, -3.0],
      targetLocal: [0, 1.0, 0],
      faceLocal: [0, -6],
      standLocal: [0, -1.45],
    },
  },
  {
    id: 'lookout',
    name: 'Lookout',
    anchor: 'lookout',
    clip: 'idle',
    keepY: true,
    obstacleR: 0.26,
    talkEyeLift: 2.4,
  },
]);

export interface Npc {
  spec: NpcSpec;
  character: Character;
  x: number;
  y: number;
  z: number;
  heading: number;
  home: VillageAnchor;
  obstacle: CircleObstacle;
  talking: boolean;
  lastBark: number;
  /** Faces this point instead of the player while set (Nell watching the coconut fly). */
  faceTarget: { x: number; z: number } | null;
  /** Glances (head and eyes only) toward another islander while they speak in a shared scene. */
  glance?: { x: number; y: number; z: number } | null;
  /** When they last waved hello, and whether you've wandered off since (so they'll wave again). */
  greetedAt: number;
  greetArmed: boolean;
}

/** Wave hello inside this range, once you've been at least REARM away, and not more often than GAP. */
const GREET_RANGE = 4.2;
const GREET_REARM = 7;
const GREET_GAP = 40;

const tmp = new Vector3();

/**
 * Places the cove NPCs at their village anchors and runs their idle life: patrols, the child's
 * laps round the well, and turning to face the player when you come close.
 */
export class NpcCrowd {
  readonly list: Npc[] = [];
  private t = 0;

  constructor(
    private readonly lib: CharacterLibrary,
    specs: readonly NpcSpec[],
    private readonly anchors: Record<string, VillageAnchor>,
    private readonly world: CollisionWorld,
    private readonly tier: TierSettings,
    private readonly updateTarget: Parameters<CharacterLibrary['create']>[0]['updateTarget'],
    private readonly fallback: VillageAnchor,
  ) {
    specs.forEach((spec, i) => this.place(spec, i));
  }

  /**
   * The same crowd, one character a slice (`breathe` between them): dressing a character takes
   * several milliseconds, so a whole island's cast at once stalls a frame during play. Stops early
   * when `alive()` turns false (the voyage ended mid-cast: the library may be disposed, and with no
   * slicer the rest would build in one task); the caller then disposes the partial crowd.
   */
  static async createAsync(
    lib: CharacterLibrary,
    specs: readonly NpcSpec[],
    anchors: Record<string, VillageAnchor>,
    world: CollisionWorld,
    tier: TierSettings,
    updateTarget: Parameters<CharacterLibrary['create']>[0]['updateTarget'],
    fallback: VillageAnchor,
    breathe: () => Promise<void>,
    alive: () => boolean,
  ): Promise<NpcCrowd> {
    const crowd = new NpcCrowd(lib, [], anchors, world, tier, updateTarget, fallback);
    for (let i = 0; i < specs.length; i++) {
      await breathe();
      if (!alive()) break;
      crowd.place(specs[i]!, i);
    }
    return crowd;
  }

  private place(spec: NpcSpec, i: number): void {
    const { anchors, fallback, world } = this;
    const home = anchors[spec.anchor] ?? { ...fallback, x: fallback.x + i * 1.5 };
    const out = spec.out ?? 0;
    // Patrollers start on their loop, so they never cut through props to reach it.
    const start = spec.patrol?.[0];
    const x = start ? start[0] : home.x + Math.sin(home.heading) * out;
    const z = start ? start[1] : home.z + Math.cos(home.heading) * out;
    const y = spec.keepY ? home.y : world.groundAt(x, z);
    const heading = npcHeading(spec, home);
    const character = this.lib.create({
      body: spec.body ?? (spec.id as NpcId),
      tier: this.tier,
      updateTarget: this.updateTarget,
    });
    character.group.position.set(x, y, z);
    character.group.rotation.y = heading;
    character.play(spec.patrol || spec.orbit ? 'idle' : spec.clip);
    const obstacle: CircleObstacle = { x, z, r: spec.obstacleR ?? character.capsule.radius + 0.1 };
    world.addDynamic(obstacle);
    this.list.push({
      spec,
      character,
      x,
      y,
      z,
      heading,
      home,
      obstacle,
      talking: false,
      lastBark: -99,
      faceTarget: null,
      greetedAt: -GREET_GAP,
      greetArmed: true,
    });
    this.homes.set(this.list[this.list.length - 1]!, home);
  }

  private patrolIndex = new Map<Npc, number>();
  /** Each NPC's own anchor, so `moveTo(n, null)` can send it home. */
  private readonly homes = new Map<Npc, VillageAnchor>();

  update(dt: number, player: { x: number; y: number; z: number }): void {
    this.t += dt;
    for (const n of this.list) {
      const s = n.spec;
      let moving = false;
      const dist = Math.hypot(player.x - n.x, player.z - n.z);
      const near = dist < GREET_RANGE;
      if (dist > GREET_REARM) n.greetArmed = true;
      else if (near && n.greetArmed && !n.talking && s.clip === 'idle' && !s.patrol && !s.orbit) {
        n.greetArmed = false;
        if (this.t - n.greetedAt > GREET_GAP) {
          n.greetedAt = this.t;
          n.character.greet();
        }
      }
      if (!n.talking && s.patrol) {
        const i = this.patrolIndex.get(n) ?? 0;
        const [px, pz] = s.patrol[i]!;
        const dx = px - n.x,
          dz = pz - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) this.patrolIndex.set(n, (i + 1) % s.patrol.length);
        else if (!near) {
          const v = Math.min(d, (s.speed ?? 1.2) * dt);
          n.x += (dx / d) * v;
          n.z += (dz / d) * v;
          n.heading = turn(n.heading, Math.atan2(dx, dz), dt, 6);
          moving = true;
        }
      } else if (!n.talking && s.orbit) {
        const a = this.t * ((s.speed ?? 2) / s.orbit) + (s.orbitPhase ?? 0);
        const [ox, oz] = s.orbitCenter ?? [0, 0];
        n.x = n.home.x + ox + Math.cos(a) * s.orbit;
        n.z = n.home.z + oz + Math.sin(a) * s.orbit;
        n.heading = Math.atan2(-Math.sin(a), Math.cos(a));
        moving = true;
      }
      if (n.faceTarget)
        n.heading = turn(n.heading, Math.atan2(n.faceTarget.x - n.x, n.faceTarget.z - n.z), dt, 5);
      else if (!moving && (near || n.talking))
        n.heading = turn(n.heading, Math.atan2(player.x - n.x, player.z - n.z), dt, 5);
      if (!s.keepY) n.y = this.world.groundAt(n.x, n.z);
      n.obstacle.x = n.x;
      n.obstacle.z = n.z;
      const g = n.character.group;
      g.position.set(n.x, n.y - seatedVisualDrop(s), n.z);
      g.rotation.y = n.heading;
      if (s.patrol || s.orbit) n.character.setSpeed(moving ? (s.speed ?? 1.2) : 0);
      n.character.lookAt(
        n.glance
          ? tmp.set(n.glance.x, n.glance.y, n.glance.z)
          : n.faceTarget
            ? tmp.set(n.faceTarget.x, n.y + 1.5, n.faceTarget.z)
            : near || n.talking
              ? tmp.set(player.x, player.y + 1.5, player.z)
              : null,
      );
      n.character.update(dt);
    }
  }

  /** Moves an NPC to a new standing spot (a quest beat elsewhere), or back to its anchor. */
  moveTo(n: Npc, spot: VillageAnchor | null): void {
    const home = spot ?? this.homes.get(n)!;
    if (n.home === home) return;
    n.home = home;
    const out = spot ? 0 : (n.spec.out ?? 0);
    n.x = home.x + Math.sin(home.heading) * out;
    n.z = home.z + Math.cos(home.heading) * out;
    n.y = n.spec.keepY || spot ? home.y : this.world.groundAt(n.x, n.z);
    n.heading = npcHeading(n.spec, home);
    n.obstacle.x = n.x;
    n.obstacle.z = n.z;
  }

  /**
   * Talking stops them where they stand on their idle, and the character gestures over it (no
   * looping wave). Afterwards patrollers and runners pick their clip back up.
   */
  setTalking(n: Npc, on: boolean): void {
    n.talking = on;
    if (on && n.spec.clip !== 'sit') {
      n.character.setSpeed(0);
      if (n.spec.clip !== 'idle') n.character.play('idle', 0.2);
    }
    n.character.setTalking(on);
    if (!on && n.spec.clip !== 'sit') n.character.play(n.spec.patrol || n.spec.orbit ? 'idle' : n.spec.clip);
  }

  dispose(): void {
    for (const n of this.list) {
      this.world.removeDynamic(n.obstacle);
      n.character.group.removeFromParent();
      n.character.dispose();
    }
    this.list.length = 0;
  }
}

function turn(h: number, target: number, dt: number, rate: number): number {
  return wrapAngle(h + wrapAngle(target - h) * (1 - Math.exp(-rate * dt)));
}

function seatedVisualDrop(spec: NpcSpec): number {
  return spec.clip === 'sit' ? (spec.seatDrop ?? 0.18) : 0;
}

function npcHeading(spec: NpcSpec, home: VillageAnchor): number {
  return wrapAngle(home.heading + (spec.headingOffset ?? 0));
}
