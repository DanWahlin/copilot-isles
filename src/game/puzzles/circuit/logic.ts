import type { PuzzleFile } from '../../../course/pack';
import type { CircuitKind, StationKind } from './places';

/**
 * The circuit mechanic's rules (docs/specs/ISLAND-03-keelhaven.md §5.4, §5.6), pure: a lap's stations
 * run in a fixed order; a station's lamp is ready only when its evidence is real; a wrong pick turns
 * its lamp to not ready and sends the hull back to the station that fixes it. There's no fail state,
 * no move limit and no timer. The pack holds every word; this reads only ids, kinds and order.
 */

/** A station's lamp: waiting (dark), running, ready, or not ready. */
export type Lamp = 'dark' | 'running' | 'ready' | 'notReady';

export interface CircuitOption {
  id: string;
  text: string;
  right?: boolean;
  result?: string;
  reason?: string;
  /** The place (the pack's key) the hull goes back to. */
  backTo?: string;
  cite?: string;
  line?: string;
}

export interface CircuitTile {
  id: string;
  text: string;
  sticks: boolean;
  reason?: string;
  cite?: string;
}

export interface CircuitStation {
  id: string;
  /** The place (the pack's key) it's at. */
  at: string;
  kind: StationKind;
  title: string;
  prompt?: string;
  text?: string;
  line?: string;
  options?: readonly CircuitOption[];
  tiles?: readonly CircuitTile[];
  lamps?: readonly { id: string; text: string }[];
  planks?: number;
  seconds?: number;
  again?: string;
  image?: string;
  caption?: string;
  hints?: readonly string[];
  cite: string;
}

export interface CircuitLap {
  id: string;
  quest: string;
  step: string;
  solved: string;
  /** The island's script that closes the lap (played at once when its last lamp is ready). */
  close: string;
  title: string;
  order: string;
  stations: readonly CircuitStation[];
}

export interface CircuitFile extends PuzzleFile {
  circuit: CircuitKind;
  places: Readonly<Record<string, { acts: string; name: string; means: string }>>;
  laps: readonly CircuitLap[];
}

/** What a pick did: the option, whether it was right, and the station the hull goes back to. */
export interface PickResult {
  option: CircuitOption | null;
  right: boolean;
  /** The station index the hull goes back to (a wrong pick), else null. */
  back: number | null;
}

/** One lap under way: the station that waits for the player and each place's lamp. */
export class LapRun {
  /** The station that waits for the player (`stations.length` once the lap's done). */
  index: number;
  /** Each place's lamp, by the pack's place key. */
  readonly lamps = new Map<string, Lamp>();
  private readonly result: PickResult = { option: null, right: false, back: null };

  constructor(
    readonly lap: CircuitLap,
    start = 0,
  ) {
    this.index = Math.max(0, Math.min(start, lap.stations.length));
    for (const s of lap.stations) this.lamps.set(s.at, 'dark');
    for (let i = 0; i < this.index; i++) this.lamps.set(lap.stations[i]!.at, 'ready');
  }

  get station(): CircuitStation | null {
    return this.lap.stations[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= this.lap.stations.length;
  }

  /** The station's evidence is real: its lamp is ready and the next station waits. */
  pass(): void {
    const s = this.station;
    if (!s) return;
    this.lamps.set(s.at, 'ready');
    this.index++;
  }

  /**
   * A pick at a `choose` or `seal` station. Right: the station passes. Wrong: its lamp is not ready and
   * the hull goes back to the latest station at `backTo` (the one that fixes it); the lamps of the
   * stations between go dark again. A `backTo` with no station before this one (the repair barge)
   * leaves the hull here, to choose again. The result is reused: read it before the next pick.
   */
  choose(id: string): PickResult {
    const r = this.result;
    const s = this.station;
    const option = s?.options?.find((o) => o.id === id) ?? null;
    r.option = option;
    r.right = !!option?.right;
    r.back = null;
    if (!s || !option) return r;
    if (option.right) {
      this.pass();
      return r;
    }
    this.lamps.set(s.at, 'notReady');
    const back = this.backTo(option.backTo ?? s.at);
    for (let i = back; i < this.index; i++) {
      const at = this.lap.stations[i]!.at;
      if (at !== s.at) this.lamps.set(at, 'dark');
    }
    this.index = back;
    r.back = back;
    return r;
  }

  /** The latest station at or before the current one that's at `place`, else the current one. */
  backTo(place: string): number {
    for (let i = this.index; i >= 0; i--) if (this.lap.stations[i]?.at === place) return i;
    return this.index;
  }
}

/** Whether a claim tile sticks on the petition (the station's tiles, by id). */
export function tileSticks(s: CircuitStation, id: string): CircuitTile | null {
  return s.tiles?.find((t) => t.id === id) ?? null;
}

/** Whether every claim that sticks is on the mast. */
export function petitionReady(s: CircuitStation, stuck: ReadonlySet<string>): boolean {
  for (const t of s.tiles ?? []) if (t.sticks && !stuck.has(t.id)) return false;
  return true;
}

/**
 * Gate 2's lamps (a `gate` station): the first ones light by themselves, in order; the last is the
 * player's seal, and it's only possible once every lamp before it is lit. Returns the first lamp
 * still dark before the seal, or null when the seal may go on.
 */
export function gateDark(s: CircuitStation, lit: number): { id: string; text: string } | null {
  const lamps = s.lamps ?? [];
  for (let i = 0; i < lamps.length - 1; i++) if (i >= lit) return lamps[i]!;
  return null;
}

/** The lap whose quest is at its step now (a circuit runs one lap at a time), or null. */
export function activeLap(
  laps: readonly CircuitLap[],
  quests: Readonly<Record<string, string>>,
): CircuitLap | null {
  for (const l of laps) if (quests[l.quest] === l.step) return l;
  return null;
}
