import type { IslandBerth } from './islands';
import { storyHolds, type StoryIsland } from './story';

/**
 * The sea battles on the passages between islands (docs/specs/BATTLES.md §1, §2.0, §2.0b, §3): which
 * battle a passage holds, when it starts, and what the save keeps. Data and pure logic only; the
 * battle itself (ships, guns, HUD) loads lazily with `battle-run.ts`.
 */
export interface PassageBattle {
  /** The battle plan's id (`BATTLE_PLANS` in src/world/battle/battle.ts). */
  id: string;
  /** Its index in `BATTLE_PLANS`. */
  plan: number;
  /** The island you sail from: its Seal (its story's `sealed`) starts the battle. */
  from: StoryIsland;
  /** The island you sail toward: an `ISLANDS` id, or a pattern for its name until it's built. */
  to: string | RegExp;
}

export const PASSAGE_BATTLES: readonly PassageBattle[] = [
  // Battle 1: the first time you sail from Anchorage toward Port Meridian with the Seal of Anchorage.
  { id: 'passage-anchorage-meridian', plan: 0, from: 'anchorage', to: 'meridian' },
  // Battle 2: from Port Meridian toward Thousand-Bough Isle with the Seal of Meridian, once that
  // island is in the registry (Chapter 02); until then it never starts.
  {
    id: 'passage-meridian-thousand-bough',
    plan: 1,
    from: 'meridian',
    to: /thousand.?bough/i,
  },
  // Battle 3, "Trust the Evidence": from Thousand-Bough Isle toward Keelhaven with the Seal of
  // Thousand-Bough (recaps Chapter 02). Its win hands over to the passage's next morning.
  { id: 'passage-thousand-bough-keelhaven', plan: 2, from: 'thousand-bough', to: 'keelhaven' },
];

/**
 * How far (m) out from any island's waters the battle zone keeps, all round the ship. Each island's
 * waters already reach ~100 m past its coast, so this keeps the fight well clear of land and harbours
 * while still fitting the channel between Port Meridian and Thousand-Bough Isle.
 */
export const BATTLE_CLEARANCE = 80;
/** How far (m) from the berth you left before the lookout calls sails (about halfway across). */
export const BATTLE_MIN_OUT = 450;

type Islands = Readonly<Record<string, Pick<IslandBerth, 'id' | 'name' | 'mooring' | 'contains'>>>;

/** The island a battle sails toward, if it's in the registry yet. */
export function battleDestination(b: PassageBattle, islands: Islands): string | null {
  if (typeof b.to === 'string') return islands[b.to] ? b.to : null;
  for (const i of Object.values(islands)) if (b.to.test(i.id) || b.to.test(i.name)) return i.id;
  return null;
}

/**
 * The battle waiting on the passage out of `from`: its Seal earned, not fought (or skipped) yet, and
 * its destination built and open. Null when there's none.
 */
export function pendingBattle(
  from: string,
  quests: Readonly<Record<string, string>>,
  done: ReadonlySet<string>,
  islands: Islands,
  open: (id: string) => boolean = () => true,
): PassageBattle | null {
  for (const b of PASSAGE_BATTLES) {
    if (b.from !== from || done.has(b.id) || !storyHolds(b.from, 'sealed', quests)) continue;
    const to = battleDestination(b, islands);
    if (to && islands[from] && open(to)) return b;
  }
  return null;
}

/** Within this distance (m) of a berth, the raiders fall back into the fog: they never enter a harbour. */
export const HARBOUR_RADIUS = 220;

/** Whether (x, z) is within `r` m of any island's berth (its harbour). */
export function nearHarbour(x: number, z: number, islands: Islands, r = HARBOUR_RADIUS): boolean {
  for (const id in islands) {
    const m = islands[id]!.mooring;
    if (Math.hypot(x - m.x, z - m.z) < r) return true;
  }
  return false;
}

/** Whether (x, z) is inside any island's waters. */
export function inIslandWaters(x: number, z: number, islands: Islands): boolean {
  for (const id in islands) if (islands[id]!.contains(x, z)) return true;
  return false;
}

/**
 * Open water: no island's waters at (x, z) or anywhere within `clearance` m of it (eight points
 * round it, plus the centre), so the fight stays clear of harbours and terrain.
 */
export function openWater(x: number, z: number, islands: Islands, clearance = BATTLE_CLEARANCE): boolean {
  if (inIslandWaters(x, z, islands)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (inIslandWaters(x + Math.sin(a) * clearance, z + Math.cos(a) * clearance, islands)) return false;
  }
  return true;
}

/** Whether the lookout calls sails now: a battle waits, you're well out from its berth, on open water. */
export function battleStarts(
  b: PassageBattle | null,
  x: number,
  z: number,
  islands: Islands,
): b is PassageBattle {
  if (!b) return false;
  const home = islands[b.from];
  if (!home) return false;
  const out = Math.hypot(x - home.mooring.x, z - home.mooring.z);
  return out >= BATTLE_MIN_OUT && openWater(x, z, islands);
}

/** The battles a save says are done (fought or skipped); old saves have none. */
export function savedBattles(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const id of v) if (typeof id === 'string' && !out.includes(id)) out.push(id);
  return out;
}
