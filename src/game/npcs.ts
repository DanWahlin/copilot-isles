import { Vector3 } from 'three/webgpu';
import type { TierSettings } from '../engine/quality';
import type { Character, CharacterClip, CharacterLibrary, NpcId } from '../world/characters';
import type { CircleObstacle } from '../world/contracts';
import type { VillageAnchor } from '../world/village';
import type { CollisionWorld } from './collision';
import { wrapAngle } from './player-controller';

export interface NpcSpec {
  id: NpcId;
  name: string;
  anchor: string;
  /** Metres to step out along the anchor heading (doors face outward). */
  out?: number;
  clip: CharacterClip;
  /** Walks a loop through these world xz points. */
  patrol?: [number, number][];
  /** Circles a point (anchor + orbitCenter) at this radius (the child round the well). */
  orbit?: number;
  orbitCenter?: [number, number];
  speed?: number;
  /** Voice line ids for a conversation; otherwise a random unvoiced bark. */
  voiced?: string[];
  barks?: string[];
  /** Keeps the anchor's height instead of snapping to the ground (tower tops, benches). */
  keepY?: boolean;
}

/** Test Cove folk (POC §4.3 cast, trimmed for the spike). Barks tease chapter-00 lessons. */
export const COVE_NPCS: NpcSpec[] = [
  {
    id: 'nell',
    name: 'Nell Tidewell',
    anchor: 'harbourmasterDoor',
    out: 1.3,
    clip: 'idle',
    voiced: ['nell.papers.01', 'nell.papers.02', 'nell.settings.01'],
  },
  {
    id: 'merchant',
    name: 'Ezra Quill',
    anchor: 'chartmakerDoor',
    out: 1.2,
    clip: 'idle',
    barks: [
      'A fork is your own copy of the master chart. Mark it up all you like.',
      'Add a project with the plus next to Projects. Then pick Add GitHub repository.',
    ],
  },
  {
    id: 'dockhand_b',
    name: 'Bo Marlin',
    anchor: 'storehouseDoor',
    out: 1.4,
    clip: 'talk',
    barks: [
      'For setup, choose Local repository, Captain. New worktrees come later.',
      'Check your gear in the Terminal tab before you sail. Install only what is missing.',
    ],
  },
  {
    id: 'dockhand_a',
    name: 'Dockhand',
    anchor: 'noticeBoard',
    clip: 'walk',
    patrol: [
      [-118, -67.5],
      [-96, -67.5],
      [-92, -65.5],
      [-120, -65.5],
    ],
    speed: 1.2,
    barks: ['Mind the bollards!', 'Tide waits for no one.', "Heard you're sailing soon. Fair winds!"],
  },
  {
    id: 'fisherman',
    name: 'Old Finn',
    anchor: 'finn',
    clip: 'sit',
    keepY: true,
    barks: ['Fish bite best when the Terminal is quiet.', 'Patience, Captain. Same as prompting.'],
  },
  {
    id: 'old_sailor',
    name: 'Salt',
    anchor: 'quayBenches',
    clip: 'sit',
    keepY: true,
    barks: [
      'Sailed with three captains. The good ones read the logbook.',
      'Aye, that lighthouse has seen things.',
    ],
  },
  {
    id: 'child',
    name: 'Pip',
    anchor: 'plazaWell',
    clip: 'run',
    orbit: 3.4,
    orbitCenter: [-2.7, 1.2],
    speed: 2.6,
    barks: ['Race you to the lighthouse!', 'Is that your ship? It is so big!'],
  },
  {
    id: 'suri',
    name: 'Suri Okoye',
    anchor: 'suri',
    clip: 'idle',
    keepY: true,
    barks: [
      'The spring never stops. Getting it to the wheel is the trick.',
      'Actions on, checks on. That’s the rule.',
    ],
  },
  {
    id: 'pim',
    name: 'Pim',
    anchor: 'pim',
    clip: 'idle',
    keepY: true,
    barks: [
      'Dry run first. Always a dry run first.',
      'Nine pennants, five notices, seven hulls, three seals.',
    ],
  },
  {
    id: 'pol',
    name: 'Pol',
    anchor: 'pol',
    clip: 'idle',
    keepY: true,
    barks: ['Preview first, always!', 'Check the Repository line. Every time.'],
  },
  {
    id: 'juno',
    name: 'Juno',
    anchor: 'juno',
    clip: 'idle',
    keepY: true,
    barks: [
      'The crew’s ready when you are, Captain. Finish your setup first.',
      'A good first mate listens more than she talks.',
    ],
  },
  {
    id: 'lyra',
    name: 'Lyra Wren',
    anchor: 'lyra',
    clip: 'sit',
    keepY: true,
    barks: ['Every island has its own tune, Captain.', 'Hush. The reef’s keeping time.'],
  },
  {
    id: 'lookout',
    name: 'Lookout',
    anchor: 'lookout',
    clip: 'idle',
    keepY: true,
    barks: ['Clear skies to the horizon, Captain.'],
  },
];

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
}

const tmp = new Vector3();

/**
 * Places the cove NPCs at their village anchors and runs their idle life: patrols, the child's
 * laps round the well, and turning to face the player when you come close.
 */
export class NpcCrowd {
  readonly list: Npc[] = [];
  private t = 0;

  constructor(
    lib: CharacterLibrary,
    specs: readonly NpcSpec[],
    anchors: Record<string, VillageAnchor>,
    private readonly world: CollisionWorld,
    tier: TierSettings,
    updateTarget: Parameters<CharacterLibrary['create']>[0]['updateTarget'],
    fallback: VillageAnchor,
  ) {
    specs.forEach((spec, i) => {
      const home = anchors[spec.anchor] ?? { ...fallback, x: fallback.x + i * 1.5 };
      const out = spec.out ?? 0;
      const x = home.x + Math.sin(home.heading) * out;
      const z = home.z + Math.cos(home.heading) * out;
      const y = spec.keepY ? home.y : world.groundAt(x, z);
      const character = lib.create({ body: spec.id, tier, updateTarget });
      character.group.position.set(x, y, z);
      character.group.rotation.y = home.heading;
      character.play(spec.patrol || spec.orbit ? 'idle' : spec.clip);
      const obstacle: CircleObstacle = { x, z, r: character.capsule.radius + 0.1 };
      world.addDynamic(obstacle);
      this.list.push({
        spec,
        character,
        x,
        y,
        z,
        heading: home.heading,
        home,
        obstacle,
        talking: false,
        lastBark: -99,
        faceTarget: null,
      });
      this.homes.set(this.list[this.list.length - 1]!, home);
    });
  }

  private patrolIndex = new Map<Npc, number>();
  /** Each NPC's own anchor, so `moveTo(n, null)` can send it home. */
  private readonly homes = new Map<Npc, VillageAnchor>();

  update(dt: number, player: { x: number; y: number; z: number }): void {
    this.t += dt;
    for (const n of this.list) {
      const s = n.spec;
      let moving = false;
      const near = Math.hypot(player.x - n.x, player.z - n.z) < 4.2;
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
        const a = this.t * ((s.speed ?? 2) / s.orbit);
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
      g.position.set(n.x, n.y, n.z);
      g.rotation.y = n.heading;
      if (s.patrol || s.orbit) n.character.setSpeed(moving ? (s.speed ?? 1.2) : 0);
      n.character.lookAt(near ? tmp.set(player.x, player.y + 1.5, player.z) : null);
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
    n.heading = home.heading;
    n.obstacle.x = n.x;
    n.obstacle.z = n.z;
  }

  setTalking(n: Npc, on: boolean): void {
    n.talking = on;
    if (on) {
      n.character.setSpeed(0);
      n.character.play('talk');
    } else n.character.play(n.spec.patrol || n.spec.orbit ? 'idle' : n.spec.clip);
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
