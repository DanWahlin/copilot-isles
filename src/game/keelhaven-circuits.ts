import { puzzleMaybe, puzzleOn, textOf } from '../course/puzzles';
import { CIRCUIT_SPOTS, FLIGHT_HULLS, HULL_REST, type FlightHull } from '../world/islands/keelhaven/circuit';
import type { KeelhavenWorld } from '../world/islands/keelhaven/index';
import type { LampLook } from '../world/islands/keelhaven/lamps';
import { toWorld } from '../world/islands/keelhaven/layout';
import { CANAL, CHAMBERS, GATES } from '../world/islands/keelhaven/works';
import { GATE_LIGHT } from '../world/islands/keelhaven/town';
import type { ChoiceAsk } from './choice-card';
import type { CameraShot } from './follow-camera';
import type { IslandContentHost } from './island-code';
import { keelhavenScript } from './keelhaven-quests';
import { createCircuit, type CircuitHost, type CircuitStage } from './puzzles/circuit/puzzle';
import type { Lamp } from './puzzles/circuit/logic';
import type { Puzzle } from './puzzles/types';
import { storyHolds } from './story';

/**
 * Keelhaven's Two Circuits in the session (docs/specs/ISLAND-03-keelhaven.md §5): the Drydock Ring and
 * the Lock Flight as `circuit` puzzles, and their stage in the world: where each station stands, its
 * lamp, the camera while it's open, and what moves (your hull down the flight, the locks' water rising
 * and falling with it, a hull heeling when its gauge is filed down). Also the Seal's lamps (§4.5):
 * the Gate Light kindles and every lock lamp turns green. The stage reads only the game's places and
 * kinds, never a course id.
 */

/** A move the stage plays over time (a hull from one pose to another, a lock's water). */
interface Move {
  kind: 'hull' | 'water';
  hull: FlightHull;
  chamber: string;
  from: { u: number; v: number; y: number };
  to: { u: number; v: number; y: number };
  /** Seconds in, and the length. */
  t: number;
  len: number;
  /** Starts after this many seconds. */
  delay: number;
  roll: number;
}

const yard = 5;
/** The water a lock stands at, by the name of the chamber (works.ts). */
const LEVEL = Object.fromEntries(CHAMBERS.map((c) => [c.name, c.water ?? 0])) as Record<string, number>;

export interface KeelhavenCircuits {
  /** Makes the circuits' puzzles on a streamed world (none if the course has them off). */
  create(world: KeelhavenWorld): Puzzle[];
  /** Lays the world out as the save says (hulls, water, the Seal's lamps). */
  settle(): void;
  update(dt: number): void;
  /** The circuit's cue: frames it and says what it is (`kh-ring`, `kh-flight`). */
  cue(kind: 'ring' | 'flight'): Promise<void>;
  /** The Seal: the Gate Light kindles and the lamps answer. */
  seal(): Promise<void>;
  teardown(): void;
  readonly debug: {
    /** Where a flight hull is (cove frame). */
    hull(id: FlightHull): { u: number; v: number; y: number } | null;
    lamp(key: string): string | null;
  };
}

export function createKeelhavenCircuits(
  host: IslandContentHost,
  o: {
    ask(a: ChoiceAsk): Promise<string>;
    card: CircuitHost['card'];
  },
): KeelhavenCircuits {
  let world: KeelhavenWorld | null = null;
  const moves: Move[] = [];
  const reduced = () => host.reducedMotion();
  const q = () => host.puzzleHost.quests();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Where each hull is now (cove frame), so a move starts from it. */
  const hullAt = {} as Record<FlightHull, { u: number; v: number; y: number }>;
  for (const id of FLIGHT_HULLS) hullAt[id] = { u: HULL_REST[id].u, v: HULL_REST[id].v, y: 0 };
  const waterAt: Record<string, number> = { lock1: LEVEL.lock1!, lock2: LEVEL.lock2! };

  const setHull = (id: FlightHull, u: number, v: number, y: number, roll = 0) => {
    hullAt[id].u = u;
    hullAt[id].v = v;
    hullAt[id].y = y;
    world?.circuit.hull(id, u, v, y, -1, 0, roll);
  };
  const setWater = (chamber: string, y: number) => {
    waterAt[chamber] = y;
    world?.circuit.water(chamber, y);
  };

  /** Queues a move; with reduced motion it jumps (water by fades in the spec; here, at once). */
  function move(
    kind: Move['kind'],
    id: FlightHull,
    chamber: string,
    to: { u: number; v: number; y: number },
    len: number,
    delay = 0,
    roll = 0,
  ): void {
    const from = kind === 'hull' ? { ...hullAt[id] } : { u: 0, v: 0, y: waterAt[chamber] ?? 0 };
    if (reduced()) len = Math.min(len, 0.4);
    moves.push({ kind, hull: id, chamber, from, to, t: 0, len: Math.max(0.05, len), delay, roll });
  }
  /** Ends every move at once (a demo skipped, a station passed early). */
  function finishMoves(): void {
    for (const m of moves) apply(m, 1);
    moves.length = 0;
  }
  function apply(m: Move, k: number): void {
    const e = k * k * (3 - 2 * k);
    const y = m.from.y + (m.to.y - m.from.y) * e;
    if (m.kind === 'water') {
      setWater(m.chamber, y);
      // A hull in the lock rides its water.
      for (const id of FLIGHT_HULLS)
        if (inChamber(hullAt[id].u, m.chamber)) setHull(id, hullAt[id].u, hullAt[id].v, y);
    } else {
      const roll = m.roll * Math.sin(Math.PI * k);
      setHull(m.hull, m.from.u + (m.to.u - m.from.u) * e, m.from.v + (m.to.v - m.from.v) * e, y, roll);
    }
  }
  const inChamber = (u: number, name: string) => {
    const c = CHAMBERS.find((x) => x.name === name);
    return !!c && u > c.u0 && u < c.u1;
  };

  // ---- Where your hull is along the flight (part 1), by the station that waits ----

  const POSE = {
    rest: { ...HULL_REST.search, y: LEVEL.basin! },
    mouth: { u: 76, v: CANAL.v, y: LEVEL.basin! },
    lockHigh: { u: 62, v: CANAL.v, y: LEVEL.basin! },
    lockLow: { u: 62, v: CANAL.v, y: LEVEL.pound! },
    wait: { u: 44, v: CANAL.v, y: LEVEL.pound! },
  };

  // ---- The stage ----

  /** A camera behind where you stand, looking at the station's piece. */
  function shotAt(u: number, v: number, y: number, look: { u: number; y: number; v: number }): CameraShot {
    const du = u - look.u;
    const dv = v - look.v;
    const d = Math.hypot(du, dv) || 1;
    // Behind you and to your right, so the station's own lamp post doesn't stand in the way.
    const back = 4.6;
    const side = 2.6;
    const e = toWorld(u + (du / d) * back - (dv / d) * side, v + (dv / d) * back + (du / d) * side);
    const t = toWorld(look.u, look.v);
    return { x: e.x, y: y + 3.6, z: e.z, tx: t.x, ty: look.y, tz: t.z };
  }
  /** Each place's spot per lap (the flight's lamps move with the lap), made once. */
  const spotCache = { ring: new Map<string, Spot[]>(), flight: new Map<string, Spot[]>() };
  type Spot = ReturnType<CircuitStage['spot']>;
  function spot(kind: 'ring' | 'flight', place: string, lap: number): Spot {
    const moving = kind === 'flight' && place === 'lamps';
    const i = moving ? Math.max(0, Math.min(lap, CIRCUIT_SPOTS.flightLamps.length - 1)) : 0;
    let list = spotCache[kind].get(place);
    if (!list) {
      list = [];
      spotCache[kind].set(place, list);
    }
    let s = list[i];
    if (s) return s;
    const sp = moving ? CIRCUIT_SPOTS.flightLamps[i]! : CIRCUIT_SPOTS[kind][place]!;
    const p = toWorld(sp.u, sp.v);
    const y = host.world.groundAt(p.x, p.z, yard + 2);
    s = { x: p.x, y, z: p.z, lamp: sp.lamp, shot: shotAt(sp.u, sp.v, y, sp.look) };
    list[i] = s;
    return s;
  }
  const look = (l: Lamp | 'blink'): LampLook => (l === 'blink' ? 'running' : l);

  function stage(kind: 'ring' | 'flight'): CircuitStage {
    return {
      spot: (place, lap) => spot(kind, place, lap),
      lamp: (key, l) => world?.circuit.lamp(key, look(l)),
      station(at, event, seconds) {
        if (kind !== 'flight') return;
        if (event === 'pass') finishMoves();
        const part1 = at.lap === 0;
        if (part1 && event === 'open' && at.place === 'bell' && at.kind === 'watch')
          move('hull', 'search', '', POSE.mouth, seconds ?? 6);
        if (part1 && event === 'pass' && at.place === 'gate1') {
          move('water', 'search', 'lock1', { u: 0, v: 0, y: LEVEL.basin! }, 1.6);
          move('hull', 'search', '', POSE.lockHigh, 3, 1.6);
        }
        if (part1 && event === 'open' && at.place === 'lamps')
          move('water', 'search', 'lock1', { u: 0, v: 0, y: LEVEL.pound! }, seconds ?? 5);
        if (part1 && event === 'open' && at.place === 'seaGate') {
          move('hull', 'search', '', POSE.wait, seconds ?? 3);
          move('water', 'search', 'lock1', { u: 0, v: 0, y: LEVEL.lock1! }, 1.5, seconds ?? 3);
        }
        // Part 2: the Stats Check hull heels when its gauge is filed down, then the barge rights her.
        if (!part1 && event === 'fail' && at.place === 'redLamp') {
          const h = hullAt.stats;
          move('hull', 'stats', '', { u: h.u, v: h.v, y: h.y }, 2.2, 0, 0.16);
        }
      },
      settle: () => settle(),
    };
  }
  /** The flight puzzle's state, for laying the world out (its waiting station and lap). */
  let flightDebug: { station(): unknown; lapIndex(): unknown } | null = null;

  function settle(): void {
    if (!world) return;
    moves.length = 0;
    const quests = q();
    const down = storyHolds('keelhaven', 'searchHullDown', quests);
    const st = (flightDebug?.station() ?? null) as { at: string } | null;
    const part1 = flightDebug?.lapIndex() === 0;
    // Your hull: down in the pound once part 1's through; along the flight by the station that waits.
    let pose: { u: number; v: number; y: number } = POSE.rest;
    let lock1 = LEVEL.lock1!;
    if (down) {
      pose = POSE.wait;
    } else if (part1 && st) {
      const order = ['ledger', 'bell', 'slate', 'gate1', 'petition', 'lamps', 'seaGate'];
      const i = order.indexOf(st.at);
      if (i >= order.indexOf('slate')) pose = POSE.mouth;
      if (i >= order.indexOf('petition')) {
        pose = POSE.lockHigh;
        lock1 = LEVEL.basin!;
      }
      if (i >= order.indexOf('seaGate')) {
        pose = POSE.lockLow;
        lock1 = LEVEL.pound!;
      }
    }
    setWater('lock1', lock1);
    setWater('lock2', LEVEL.lock2!);
    setHull('search', pose.u, pose.v, pose.y);
    for (const id of ['note', 'stats'] as const) setHull(id, HULL_REST[id].u, HULL_REST[id].v, LEVEL.lock2!);
    sealLamps(storyHolds('keelhaven', 'sealed', quests));
  }

  /** The Seal's lamps at once: the Gate Light kindled and every lock lamp green (or as built). */
  function sealLamps(on: boolean): void {
    if (!world) return;
    world.circuit.lamp('gateLight', on ? 'kindled' : 'banked');
    if (on) for (let i = 0; i < GATES.length; i++) world.circuit.lamp(`lock:${i}`, 'ready');
  }

  return {
    create(w) {
      world = w;
      spotCache.ring.clear();
      spotCache.flight.clear();
      const out: Puzzle[] = [];
      for (const [name, kind] of [
        ['drydock-ring', 'ring'],
        ['lock-flight', 'flight'],
      ] as const) {
        if (!puzzleOn(name)) continue;
        const ch: CircuitHost = {
          ...host.puzzleHost,
          ask: o.ask,
          card: o.card,
          say: host.say,
          frame: host.frame,
          reducedMotion: host.reducedMotion,
          sfx(k, at) {
            const id = (
              {
                tap: 'timber_hit',
                ring: 'gondola_bell',
                seal: 'chime_solve',
                lamp: 'lever',
                wrong: 'hatch_clank',
              } as const
            )[k];
            host.audio?.sfx.oneShot(id, at, 0.7);
          },
          script: keelhavenScript,
          image(image, caption) {
            if (image) host.learn?.showImage(image, caption ?? null);
            else host.learn?.hideImage();
          },
          stage: stage(kind),
        };
        const p = createCircuit(ch, name);
        if (kind === 'flight') flightDebug = p.debug as unknown as NonNullable<typeof flightDebug>;
        out.push(p);
      }
      settle();
      return out;
    },
    settle,
    update(dt) {
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i]!;
        if (m.delay > 0) {
          m.delay -= dt;
          continue;
        }
        m.t += dt;
        const k = Math.min(1, m.t / m.len);
        apply(m, k);
        if (k >= 1) {
          moves.splice(i, 1);
          i--;
        }
      }
    },
    async cue(kind) {
      const name = kind === 'ring' ? 'drydock-ring' : 'lock-flight';
      const file = puzzleMaybe(name);
      if (!file || !world) return;
      const first = kind === 'ring' ? CIRCUIT_SPOTS.ring.post! : CIRCUIT_SPOTS.flight.ledger!;
      const p = toWorld(first.u, first.v);
      host.frame(shotAt(first.u, first.v, host.world.groundAt(p.x, p.z, yard + 2), first.look));
      await host.text(textOf(file, 'title'), textOf(file, 'intro'));
      host.backToTalk();
    },
    async seal() {
      if (!world) return;
      const L = toWorld(GATE_LIGHT.u, GATE_LIGHT.v);
      // From over the lock flight, looking up the North Head to the light.
      const e = toWorld(40, -40);
      const shot: CameraShot = { x: e.x, y: 22, z: e.z, tx: L.x, ty: GATE_LIGHT.y + 24, tz: L.z };
      await host.showLighting(shot, () => {
        world?.circuit.lamp('gateLight', 'kindled');
        // The lamps answer, from the lowest lock up the flight to the basin (all at once, reduced).
        for (let i = GATES.length - 1; i >= 0; i--) {
          const k = `lock:${i}`;
          if (reduced()) world?.circuit.lamp(k, 'ready');
          else setTimeout(() => world?.circuit.lamp(k, 'ready'), (GATES.length - 1 - i) * 600);
        }
        for (const place of Object.keys(CIRCUIT_SPOTS.ring)) world?.circuit.lamp(`ring:${place}`, 'ready');
      });
      await wait(200);
    },
    debug: {
      hull: (id) => (world ? { ...hullAt[id] } : null),
      lamp: (key) => world?.circuit.look(key) ?? null,
    },
    teardown() {
      moves.length = 0;
      world = null;
      flightDebug = null;
      spotCache.ring.clear();
      spotCache.flight.clear();
    },
  };
}
