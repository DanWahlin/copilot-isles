import { byActs, puzzleContent, textOf } from '../../../course/puzzles';
import type { ChoiceAsk } from '../../choice-card';
import type { CameraShot } from '../../follow-camera';
import type { Interactable } from '../../interaction';
import type { ScriptStep } from '../../script';
import type { SeaChoiceOption } from '../../../ui/puzzles/SeaChoice';
import type { HintTier, Puzzle, PuzzleHost } from '../types';
import {
  activeLap,
  gateDark,
  LapRun,
  petitionReady,
  tileSticks,
  type CircuitFile,
  type CircuitLap,
  type CircuitStation,
  type Lamp,
} from './logic';

/**
 * The circuit mechanic in play (docs/specs/ISLAND-03-keelhaven.md §5, W.6): a lap runs while its quest
 * is at its step. Its stations wait in order, each at its place (an interaction `<circuit>:<place>`,
 * usable only while it's the one that waits, so the compass points to it); E there opens the station
 * on the island's choice card. A right pick lights its lamp; a wrong one turns it red, says why (the
 * course's reason) and sends the hull back to the station that fixes it. When the last lamp is ready
 * the lap's quest moves on and its closing script plays at once. The world's side (lamps, hulls,
 * water, cameras) is the island's `CircuitStage`; every word is the pack's.
 */

/** Which station a stage moment is about: its lap's index, its place and its kind (the game's). */
export interface StationAt {
  lap: number;
  place: string;
  kind: string;
}

/** The world's side of a circuit: where its stations are and what moves when one runs. */
export interface CircuitStage {
  /** Where a place's station is for lap `lap` (world feet, its lamp's key, the camera while it's open). */
  spot(place: string, lap: number): { x: number; y: number; z: number; lamp: string; shot: CameraShot };
  /** Paints a lamp. */
  lamp(key: string, look: Lamp | 'blink'): void;
  /**
   * A station's moment in the world: `open` (a demo starts, `seconds` long), `pass` (its evidence is
   * real: a demo or a move snaps to its end), `fail` (a wrong pick), `done` (the lap's last lamp).
   * `lap` is the lap's index; `place` and `kind` are the game's.
   */
  station(at: StationAt, event: 'open' | 'pass' | 'fail' | 'done', seconds?: number): void;
  /** Lays the world out as the quests say (where the hulls are, which lamps are lit). */
  settle(): void;
}

export interface CircuitHost extends PuzzleHost {
  /** The circuit's ask on the island's choice card (it has the keys while it's up). */
  ask(a: ChoiceAsk): Promise<string>;
  card: {
    message(text: string, tone: 'good' | 'bad' | 'info'): void;
    busy(on: boolean): void;
    close(): void;
    /** Picks for the player (a demo's time is up). */
    choose(id: string): void;
  };
  say(ids: readonly string[]): Promise<void>;
  frame(shot: CameraShot | null): void;
  reducedMotion(): boolean;
  /** A sound at the station (a plank's ring, the bell). */
  sfx(kind: 'tap' | 'ring' | 'seal' | 'lamp' | 'wrong', at: { x: number; y: number; z: number }): void;
  /** The island's script by name (a lap's close). */
  script(name: string): readonly ScriptStep[];
  /** Shows a course image in the spyglass (null hides it). */
  image(image: string | null, caption?: string): void;
  stage: CircuitStage;
}

/** Ids the card uses for the game's own buttons (never a pack id: those are plain words). */
const LEAVE = '·leave';
const SKIP = '·skip';
const HOIST = '·hoist';
const SEAL = '·seal';

export function createCircuit(host: CircuitHost, name: string): Puzzle {
  const file = puzzleContent<CircuitFile>(name);
  const kind = file.circuit;
  const places = byActs(file.places);
  /** The pack's place key → the game's place. */
  const acts = (key: string) => file.places[key]?.acts ?? key;
  const T = (k: string, v?: Readonly<Record<string, string | number>>) => textOf(file, k, v);
  const saved = host.learn?.progress.data.puzzles[name];

  let lapIndex = -1;
  let run: LapRun | null = null;
  let open = false;
  let blink = 0;
  let hintKey = '';
  /** How many demos at the lamps the lap has up to station `i` (the second is a push after a fix). */
  const lampDemos = (lap: CircuitLap, i: number) => {
    let n = 0;
    for (let k = 0; k <= i; k++)
      if (lap.stations[k]!.kind === 'watch' && acts(lap.stations[k]!.at) === 'lamps') n++;
    return n;
  };

  const lapNow = (): CircuitLap | null => activeLap(file.laps, host.quests());
  /** Makes the run for the lap that's on now (from the save's station if it's the same lap). */
  const sync = () => {
    const lap = lapNow();
    const i = lap ? file.laps.indexOf(lap) : -1;
    if (i === lapIndex) return;
    lapIndex = i;
    if (!lap) {
      run = null;
    } else {
      const start = saved?.state?.[0] === i ? (saved.state[1] ?? 0) : 0;
      run = new LapRun(lap, start);
    }
    placeInteractions();
    paint();
  };
  const save = () => {
    if (run) host.learn?.progress.setPuzzle(name, { solved: false, state: [lapIndex, run.index] });
  };

  // One interaction for each place (its spot moves with the lap: the flight's lamps are at the lock
  // that runs).
  const spots = new Map<string, Interactable>();
  for (const [place, p] of Object.entries(places)) {
    const it: Interactable = {
      id: `${kind}:${place}`,
      label: () => p.name,
      x: 0,
      y: 0,
      z: 0,
      radius: 2.6,
      // The station that waits wins the prompt over a neighbour (Cass by the work-order post).
      bias: -1.2,
      enabled: () => !open && host.canAct() && !!run && !run.done && acts(run.station!.at) === place,
      onInteract: () => void openStation(),
    };
    spots.set(place, it);
    host.interactions.add(it);
  }
  function placeInteractions(): void {
    const lap = Math.max(0, lapIndex);
    for (const [place, it] of spots) {
      const s = host.stage.spot(place, lap);
      it.x = s.x;
      it.y = s.y;
      it.z = s.z;
    }
  }

  /** Paints every station lamp from the run (or all ready once every lap's done). */
  function paint(): void {
    // Between laps (and after the last), a lap that's through keeps its lamps green.
    const q = host.quests();
    const finished = !run && file.laps.some((l) => q[l.quest] === l.solved || q[l.quest] === 'done');
    for (const place of Object.keys(places)) {
      const key = host.stage.spot(place, Math.max(0, lapIndex)).lamp;
      if (!key.startsWith(`${kind}:`)) continue;
      const pk = Object.keys(file.places).find((k) => acts(k) === place);
      const look: Lamp = run && pk ? (run.lamps.get(pk) ?? 'dark') : finished ? 'ready' : 'dark';
      host.stage.lamp(key, look);
    }
    host.stage.settle();
  }
  /** The waiting station's lamp, when it's dark, blinks (the next one to walk to). */
  function blinkWaiting(dt: number): void {
    if (!run || run.done || open) return;
    const s = run.station!;
    if (run.lamps.get(s.at) !== 'dark') return;
    blink += dt;
    const key = host.stage.spot(acts(s.at), lapIndex).lamp;
    host.stage.lamp(key, blink % 1.2 < 0.6 ? 'blink' : 'dark');
  }
  function lampOf(s: CircuitStation, look: Lamp): void {
    host.stage.lamp(host.stage.spot(acts(s.at), lapIndex).lamp, look);
  }

  const at = { lap: 0, place: '', kind: '' };
  const where = (s: CircuitStation): StationAt => {
    at.lap = lapIndex;
    at.place = acts(s.at);
    at.kind = s.kind;
    return at;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, host.reducedMotion() ? ms * 0.6 : ms));
  const head = (s: CircuitStation) => ({ eyebrow: T('title'), title: s.title });
  const leave = (): SeaChoiceOption => ({ id: LEAVE, label: T('leave') });
  const nameOf = (key: string) => file.places[key]?.name ?? key;

  async function openStation(): Promise<void> {
    if (open || !run || run.done) return;
    open = true;
    const lap = run.lap;
    const place = run.station!.at;
    const spot = host.stage.spot(acts(place), lapIndex);
    host.frame(spot.shot);
    try {
      // The stations at this place run one after another (a choice, then its demo).
      while (run && !run.done && run.station!.at === place) {
        const s = run.station!;
        hintKey = `${lap.id}:${s.id}:${run.index}`;
        const ok = await station(s);
        if (!ok) return;
      }
      if (run?.done) await finishLap(lap);
      else if (run) host.card.message(T('next', { name: nameOf(run.station!.at) }), 'info');
      await wait(700);
    } finally {
      host.image(null);
      host.card.close();
      host.frame(null);
      open = false;
    }
  }

  /** Runs one station; false if the player left it. */
  async function station(s: CircuitStation): Promise<boolean> {
    lampOf(s, 'running');
    host.stage.station(where(s), 'open', s.seconds);
    if (s.image) host.image(s.image, s.caption);
    if (s.line) {
      // The card shows the station while its line plays (its buttons wait).
      void host.ask({ ...head(s), prompt: s.prompt ?? s.text ?? '', options: [] });
      host.card.busy(true);
      await host.say([s.line]);
      host.card.busy(false);
    }
    switch (s.kind) {
      case 'watch':
        return watch(s);
      case 'sound':
        return sound(s);
      case 'tiles':
        return tiles(s);
      case 'gate':
        return gate(s);
      default:
        return choose(s);
    }
  }

  async function choose(s: CircuitStation): Promise<boolean> {
    const r = run!;
    const tried = new Set<string>();
    for (;;) {
      const pick = await host.ask({
        ...head(s),
        prompt: s.prompt ?? s.text ?? '',
        options: [...s.options!.map((o) => ({ id: o.id, label: o.text, tried: tried.has(o.id) })), leave()],
      });
      if (!pick || pick === LEAVE) return leaveStation(s);
      const at = r.index;
      const res = r.choose(pick);
      const o = res.option;
      if (!o) continue;
      if (res.right) {
        host.sfx(s.kind === 'seal' ? 'seal' : 'lamp', host.player);
        host.card.message(o.result ?? T('lampReady'), 'good');
        if (o.line) {
          host.card.busy(true);
          await host.say([o.line]);
          host.card.busy(false);
        } else await wait(1300);
        lampOf(s, 'ready');
        host.stage.station(where(s), 'pass');
        host.image(null);
        save();
        return true;
      }
      tried.add(pick);
      host.sfx('wrong', host.player);
      lampOf(s, 'notReady');
      host.stage.station(where(s), 'fail');
      host.card.message(o.reason ?? T('lampNotReady'), 'bad');
      if (o.line) {
        host.card.busy(true);
        await host.say([o.line]);
        host.card.busy(false);
      } else await wait(1600);
      if (r.index !== at) {
        // Back to the station that fixes it: the compass points there now.
        for (const [k, look] of r.lamps)
          if (k !== s.at) host.stage.lamp(host.stage.spot(acts(k), lapIndex).lamp, look);
        host.card.message(T('back', { name: nameOf(r.station!.at) }), 'info');
        save();
        await wait(1200);
        return r.station!.at === s.at;
      }
    }
  }

  async function watch(s: CircuitStation): Promise<boolean> {
    const r = run!;
    const ms = (s.seconds ?? 3) * 1000;
    const asked = host.ask({ ...head(s), prompt: s.text ?? '', options: [{ id: SKIP, label: T('skip') }] });
    const timer = setTimeout(() => host.card.choose(SKIP), ms);
    const pick = await asked;
    clearTimeout(timer);
    if (!pick) return leaveStation(s);
    const second = acts(s.at) === 'lamps' && lampDemos(r.lap, r.index) === 2;
    r.pass();
    lampOf(s, 'ready');
    host.stage.station(where(s), 'pass');
    // After the second push (a demo at the lamps), the tip about a fork's workflows.
    if (second && file.lines?.actions) {
      host.card.busy(true);
      await host.say([file.lines.actions]);
      host.card.busy(false);
    }
    save();
    return true;
  }

  async function sound(s: CircuitStation): Promise<boolean> {
    const r = run!;
    const n = s.planks ?? 4;
    const rung = new Set<number>();
    while (rung.size < n) {
      const pick = await host.ask({
        ...head(s),
        prompt: s.text ?? '',
        options: [
          ...Array.from({ length: n }, (_, i) => ({
            id: String(i),
            label: `${i + 1} / ${n}`,
            tried: rung.has(i),
          })),
          leave(),
        ],
      });
      if (!pick || pick === LEAVE) return leaveStation(s);
      const i = Number(pick);
      if (rung.has(i)) {
        host.card.message(s.again ?? '', 'info');
        continue;
      }
      rung.add(i);
      host.sfx('tap', host.player);
      host.card.message(`${rung.size} / ${n}`, 'good');
    }
    r.pass();
    lampOf(s, 'ready');
    host.stage.station(where(s), 'pass');
    await wait(1400);
    save();
    return true;
  }

  async function tiles(s: CircuitStation): Promise<boolean> {
    const r = run!;
    const stuck = new Set<string>();
    const tried = new Set<string>();
    for (;;) {
      const ready = petitionReady(s, stuck);
      const options: SeaChoiceOption[] = s
        .tiles!.filter((t) => !stuck.has(t.id))
        .map((t) => ({ id: t.id, label: t.text, tried: tried.has(t.id) }));
      if (ready) options.unshift({ id: HOIST, label: T('hoist') });
      options.push(leave());
      const pick = await host.ask({
        ...head(s),
        prompt: s.prompt ?? '',
        detail: s.tiles!.filter((t) => stuck.has(t.id)).map((t) => `✓ ${t.text}`),
        options,
      });
      if (!pick || pick === LEAVE) return leaveStation(s);
      if (pick === HOIST) break;
      const t = tileSticks(s, pick);
      if (!t) continue;
      if (t.sticks) {
        stuck.add(t.id);
        host.card.message(T('sticks'), 'good');
      } else {
        tried.add(t.id);
        host.sfx('wrong', host.player);
        host.card.message(`${T('noStick')} ${t.reason ?? ''}`, 'bad');
      }
    }
    r.pass();
    lampOf(s, 'ready');
    host.stage.station(where(s), 'pass');
    host.sfx('seal', host.player);
    await wait(1200);
    save();
    return true;
  }

  async function gate(s: CircuitStation): Promise<boolean> {
    const r = run!;
    const lamps = s.lamps ?? [];
    let lit = 0;
    const detail = () => lamps.map((l, i) => `${i < lit ? T('lampReady') : T('lampDark')} · ${l.text}`);
    for (let i = 0; i < lamps.length; i++) host.stage.lamp(`gate2:${i}`, 'dark');
    // The lamps before the seal light by themselves, one after another.
    let stop = false;
    const lighting = (async () => {
      for (; lit < lamps.length - 1 && !stop;) {
        await wait(800);
        if (stop) return;
        host.stage.lamp(`gate2:${lit}`, 'ready');
        lit++;
        host.sfx('lamp', host.player);
      }
    })();
    for (;;) {
      const pick = await host.ask({
        ...head(s),
        prompt: s.prompt ?? '',
        detail: detail(),
        options: [{ id: SEAL, label: T('sealIt') }, leave()],
      });
      if (!pick || pick === LEAVE) {
        stop = true;
        return leaveStation(s);
      }
      const dark = gateDark(s, lit);
      if (dark) {
        host.card.message(T('darkLamp', { name: dark.text }), 'bad');
        await lighting;
        continue;
      }
      break;
    }
    host.stage.lamp(`gate2:${lamps.length - 1}`, 'ready');
    lit = lamps.length;
    host.sfx('seal', host.player);
    r.pass();
    lampOf(s, 'ready');
    host.stage.station(where(s), 'pass');
    host.card.message(T('lampReady'), 'good');
    await wait(1300);
    save();
    return true;
  }

  /** You stepped away: the station starts again next time (§5.4), its lamp as it was. */
  function leaveStation(s: CircuitStation): false {
    if (run) lampOf(s, run.lamps.get(s.at) ?? 'dark');
    return false;
  }

  async function finishLap(lap: CircuitLap): Promise<void> {
    host.stage.station({ lap: lapIndex, place: '', kind: '' }, 'done');
    host.setQuest(lap.quest, lap.solved);
    host.learn?.progress.setPuzzle(name, {
      solved: lapIndex === file.laps.length - 1,
      state: [lapIndex + 1, 0],
    });
    host.card.close();
    host.frame(null);
    open = false;
    sync();
    await host.beat(host.script(lap.close), T('title'));
  }

  sync();

  return {
    id: name,
    label: file.id,
    engaged: () => {
      if (open) return true;
      if (!run || run.done) return false;
      const sp = host.stage.spot(acts(run.station!.at), lapIndex);
      return Math.hypot(sp.x - host.player.x, sp.z - host.player.z) < 8;
    },
    hint(tier: HintTier) {
      const s = run?.station;
      if (!s) return null;
      return s.hints?.[tier - 1] ?? null;
    },
    hintKey: () => hintKey || `${lapIndex}:${run?.index ?? -1}`,
    update(dt) {
      sync();
      blinkWaiting(dt);
    },
    debug: {
      lap: () => (run ? run.lap.id : null),
      lapIndex: () => lapIndex,
      station: () =>
        run && !run.done ? { id: run.station!.id, at: acts(run.station!.at), kind: run.station!.kind } : null,
      lamps: () => (run ? Object.fromEntries(run.lamps) : {}),
      open: () => open,
      spots: () =>
        [...spots.values()].map((it) => ({ id: it.id, x: it.x, y: it.y, z: it.z, on: !!it.enabled?.() })),
    },
    dispose() {
      for (const it of spots.values()) host.interactions.remove(it.id);
      spots.clear();
    },
  };
}
