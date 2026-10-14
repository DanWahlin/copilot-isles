import type { CameraShot } from '../follow-camera';
import type { TerminalLine } from '../hud';
import type { QuietSea } from '../../world/life/quiet-sea';
import type { HelmBuoysSite } from '../../world/sites/helm-buoys';
import {
  HELM_ORDER,
  MERIDIAN_HELMS,
  TAKE_RANGE,
  helmsCourseArea,
  nextHelm,
  type HelmMode,
} from '../../world/sites/helms-logic';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './types';

const HELMS_ID = 'P1.2';
const QUEST = 'Q1.5';
const NAME: Readonly<Record<HelmMode, string>> = {
  interactive: 'Interactive',
  plan: 'Plan',
  autopilot: 'Autopilot',
};
const FLAG: Readonly<Record<HelmMode, string>> = {
  interactive: 'blue',
  plan: 'orange',
  autopilot: 'green',
};

/** What the Three Helms needs from the session beyond a walking puzzle's host. */
export interface HelmsHost extends PuzzleHost {
  /** At the wheel with nothing else on (no dialogue, script, or menu). */
  sailing(): boolean;
  /** Aboard, under way or docking (a run is dropped if you're put ashore some other way). */
  afloat(): boolean;
  readonly ship: {
    readonly pose: { readonly x: number; readonly z: number; readonly heading: number };
    readonly autopilotComplete: boolean;
    readonly passedWaypointCount: number;
    followSpline(points: readonly { x: number; z: number }[], speed?: number): void;
    clearAutopilot(): void;
  };
  /** The crew takes the wheel (your helm input is ignored) or hands it back. */
  crewHelm(on: boolean): void;
  /** Plays voiced lines. */
  say(ids: readonly string[]): Promise<void>;
  /** Holds a camera shot (null goes back to the sailing camera). */
  frame(shot: CameraShot | null): void;
  /** Brings her alongside the island's berth and puts you ashore; resolves on the quay. */
  dockHome(): Promise<void>;
}

type Phase =
  | 'approach' // Wingman's third hint: the crew sails you up to the buoy
  | 'brief' // Rhea's taking the helm
  | 'leg' // Interactive: sailing one leg
  | 'hold' // Interactive: hove to at a mark, waiting on you
  | 'review' // Plan: the route's charted, waiting for your approval
  | 'sailing' // Plan and Autopilot: straight through
  | 'docking' // Autopilot: coming alongside
  | 'wrap'; // the run's done and Rhea's summing up

interface Run {
  mode: HelmMode;
  phase: Phase;
  leg: number;
}

/**
 * P1.2 The Three Helms (Rhea, Q1.5): the three session modes sailed in your own ship out in Port
 * Meridian's bay, in the course's order. Sail up to a buoy and press E to hand Rhea that helm.
 *
 * - Interactive: she sails one leg at a time and heaves to at each mark until you say go.
 * - Plan: the whole route's charted on the water and listed, and nothing moves until you approve.
 * - Autopilot: you give her the destination (your berth) and she sails there and moors, no stops.
 *
 * The terminal panel reads like the app's session: your ask, her steps, and where she's waiting on
 * you. The helms you've sailed are saved; a run you leave part-way starts over.
 */
export function createThreeHelms(host: HelmsHost, buoys: HelmBuoysSite, quiet?: QuietSea): Puzzle {
  const saved = host.learn?.progress.data.puzzles[HELMS_ID];
  const done: HelmMode[] = HELM_ORDER.slice(0, Math.min(3, Math.max(0, saved?.state?.[0] ?? 0)));
  let solved = saved?.solved ?? false;
  let run: Run | null = null;
  let token = 0;
  for (const m of done) buoys.setSailed(m, true);

  const active = () => host.quests()[QUEST] === 'helms';
  // While the course is on, no dolphin or flying fish leaps among the buoys (their splashes would
  // read as something the lesson put there).
  const unquiet = quiet?.add({ ...helmsCourseArea(), when: () => active() && !solved });
  const save = () => host.learn?.progress.setPuzzle(HELMS_ID, { solved, state: [done.length] });
  const pose = () => host.ship.pose;
  const here = () => ({ x: pose().x, z: pose().z });
  const distTo = (p: { x: number; z: number }) => Math.hypot(p.x - pose().x, p.z - pose().z);

  /** Rhea takes a helm: she briefs it, then the run begins. */
  async function take(mode: HelmMode): Promise<void> {
    const my = ++token;
    run = { mode, phase: 'brief', leg: 0 };
    host.crewHelm(true);
    host.ship.clearAutopilot();
    const r = MERIDIAN_HELMS[mode];
    if (mode === 'plan') {
      buoys.showRoute('plan');
      host.frame(overview(r.route));
    } else if (mode === 'interactive') buoys.showRoute('interactive', 1);
    await host.say([`mer.helm.${mode}.take`]);
    if (my !== token || !run) return;
    if (mode === 'interactive') sailLeg(0);
    else if (mode === 'plan') run.phase = 'review';
    else {
      run.phase = 'sailing';
      host.ship.followSpline([here(), ...r.route], r.speed);
    }
  }

  function sailLeg(i: number): void {
    if (!run) return;
    const r = MERIDIAN_HELMS.interactive;
    run.phase = 'leg';
    run.leg = i;
    buoys.showRoute('interactive', i + 1, i);
    host.ship.followSpline([here(), r.route[i]!], r.speed);
  }

  async function approve(): Promise<void> {
    if (!run || run.mode !== 'plan' || run.phase !== 'review') return;
    const my = token;
    run.phase = 'brief';
    host.frame(null);
    await host.say(['mer.helm.plan.go']);
    if (my !== token || !run) return;
    const r = MERIDIAN_HELMS.plan;
    run.phase = 'sailing';
    host.ship.followSpline([here(), ...r.route], r.speed);
  }

  async function finish(mode: HelmMode): Promise<void> {
    const my = token;
    if (!run) return;
    run.phase = mode === 'autopilot' ? 'docking' : 'wrap';
    if (!done.includes(mode)) done.push(mode);
    buoys.setSailed(mode, true);
    save();
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.7);
    if (mode === 'autopilot') {
      await host.dockHome();
      if (my !== token) return;
      buoys.showRoute(null);
      run = null;
      solved = true;
      save();
      host.setQuest(QUEST, 'solved');
      await host.say(['mer.helm.autopilot.done']);
      return;
    }
    await host.say([`mer.helm.${mode}.done`]);
    if (my !== token) return;
    buoys.showRoute(null);
    run = null;
    host.crewHelm(false);
    const n = nextHelm(done);
    if (n) void host.say([`mer.helm.next.${n}`]);
  }

  /** Drops a run part-way (you were put ashore): nothing's saved for it. */
  function abandon(): void {
    token++;
    run = null;
    host.frame(null);
    host.crewHelm(false);
    buoys.showRoute(null);
  }

  /** The crew sails you up to the next buoy (Wingman's third hint), then hands the wheel back. */
  function approach(mode: HelmMode): void {
    const b = MERIDIAN_HELMS[mode].buoy;
    const p = here();
    const d = distTo(b);
    const k = Math.max(0, d - 20) / (d || 1);
    token++;
    run = { mode, phase: 'approach', leg: 0 };
    host.crewHelm(true);
    host.ship.followSpline([p, { x: p.x + (b.x - p.x) * k, z: p.z + (b.z - p.z) * k }], 5);
  }

  /** A high shot over a route from behind the ship (Plan's review). */
  function overview(route: readonly { x: number; z: number }[]): CameraShot {
    const p = here();
    let cx = 0,
      cz = 0;
    for (const q of route) {
      cx += q.x / route.length;
      cz += q.z / route.length;
    }
    const dx = cx - p.x,
      dz = cz - p.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      x: p.x - (dx / len) * 30 + (dz / len) * 14,
      y: 44,
      z: p.z - (dz / len) * 30 - (dx / len) * 14,
      tx: cx,
      ty: 0,
      tz: cz,
    };
  }

  function sailAction(): SailAction | null {
    if (!active() || solved || !host.sailing()) return null;
    if (!run) {
      const n = nextHelm(done);
      if (!n || distTo(MERIDIAN_HELMS[n].buoy) > TAKE_RANGE) return null;
      return { label: `Take the ${NAME[n]} helm`, fire: () => void take(n) };
    }
    const leg = run.leg;
    if (run.phase === 'hold') return { label: 'Sail the next leg', fire: () => sailLeg(leg + 1) };
    if (run.phase === 'review') return { label: 'Approve the plan', fire: () => void approve() };
    return null;
  }

  function terminal(): PuzzleTerminal | null {
    if (!run || run.phase === 'approach') return null;
    const r = MERIDIAN_HELMS[run.mode];
    const lines: TerminalLine[] = [];
    if (run.mode === 'interactive') {
      lines.push({ tone: 'you', text: 'Sail the blue course, one mark at a time' });
      const reached = run.phase === 'hold' || run.phase === 'wrap' ? run.leg + 1 : run.leg;
      for (let i = 0; i <= Math.min(run.leg, r.route.length - 1); i++)
        lines.push(
          i < reached
            ? { tone: 'ok', text: `✓ Leg ${i + 1}: reached mark ${i + 1}` }
            : { tone: 'other', text: `→ Leg ${i + 1}: sailing to mark ${i + 1}…` },
        );
      if (run.phase === 'hold') lines.push({ tone: 'cmd', text: 'Waiting on you: sail the next leg?' });
      return { title: 'Session · Interactive', lines };
    }
    if (run.mode === 'plan') {
      const plan = r.plan ?? [];
      lines.push({ tone: 'you', text: 'Chart a course to the Autopilot buoy' });
      lines.push({ tone: 'other', text: 'Plan:' });
      const sailing = run.phase === 'sailing' || run.phase === 'wrap';
      const legsDone = run.phase === 'wrap' ? plan.length : Math.max(0, host.ship.passedWaypointCount - 1);
      plan.forEach((step, i) =>
        lines.push(
          sailing && i < legsDone
            ? { tone: 'ok', text: `✓ ${i + 1}. ${step}` }
            : { tone: 'other', text: `   ${i + 1}. ${step}` },
        ),
      );
      if (run.phase === 'review') lines.push({ tone: 'cmd', text: 'Waiting on you: approve this plan?' });
      return { title: 'Session · Plan', lines };
    }
    lines.push({ tone: 'you', text: 'Take her home to the east-arm berth' });
    if (run.phase !== 'brief') lines.push({ tone: 'other', text: 'Working through it, no check-ins…' });
    if (run.phase === 'docking' || run.phase === 'wrap')
      lines.push({ tone: 'ok', text: '✓ Moored at the east arm' });
    return { title: 'Session · Autopilot', lines };
  }

  return {
    id: HELMS_ID,
    engaged: () => active() && !solved && host.afloat(),
    hintKey: () => `${done.length}|${run?.mode ?? ''}|${run?.phase ?? ''}|${run?.leg ?? 0}`,
    hint(tier: HintTier) {
      if (!active() || solved) return null;
      const n = nextHelm(done);
      if (!n) return null;
      if (!run) {
        if (distTo(MERIDIAN_HELMS[n].buoy) <= TAKE_RANGE)
          return `We’re at the ${NAME[n]} buoy. Press E to hand Rhea the helm.`;
        if (tier === 1)
          return `Sail up to the ${NAME[n]} buoy, the one with the ${FLAG[n]} flag. The compass points the way.`;
        if (tier === 2)
          return `Follow the gold marker on the compass to the ${FLAG[n]} flag, then press E beside it.`;
        approach(n);
        return 'Here, the crew will take her up to the buoy for you.';
      }
      if (run.phase === 'hold') return 'She’s waiting on you, Captain. Press E to sail the next leg.';
      if (run.phase === 'review') return 'Look over the plan, then press E to approve it.';
      return 'Rhea’s got the helm. Watch how this mode works.';
    },
    update() {
      if (!run) return;
      if (!host.afloat() && run.phase !== 'docking' && run.phase !== 'wrap') return abandon();
      if (!host.ship.autopilotComplete) return;
      if (run.phase === 'approach') {
        run = null;
        host.crewHelm(false);
      } else if (run.phase === 'leg') {
        if (run.leg >= MERIDIAN_HELMS.interactive.route.length - 1) void finish('interactive');
        else {
          run.phase = 'hold';
          void host.say(['mer.helm.interactive.check']);
        }
      } else if (run.phase === 'sailing') void finish(run.mode);
    },
    sailAction,
    sailTarget() {
      if (!active() || solved) return null;
      if (!run || run.phase === 'approach') {
        const n = nextHelm(done);
        return n ? { ...MERIDIAN_HELMS[n].buoy, label: `${NAME[n]} buoy` } : null;
      }
      if (run.mode === 'interactive' && run.phase === 'leg')
        return { ...MERIDIAN_HELMS.interactive.route[run.leg]!, label: `Mark ${run.leg + 1}` };
      return null;
    },
    terminal,
    debug: {
      state: () => ({ done: [...done], solved, run: run ? { ...run } : null }),
      take: (mode: HelmMode) => take(mode),
      /** Finishes every helm at once (tests): all three sailed and the quest solved. */
      solve: () => {
        token++;
        run = null;
        for (const m of HELM_ORDER) {
          if (!done.includes(m)) done.push(m);
          buoys.setSailed(m, true);
        }
        buoys.showRoute(null);
        host.frame(null);
        host.crewHelm(false);
        solved = true;
        save();
        host.setQuest(QUEST, 'solved');
      },
    },
    dispose() {
      token++;
      buoys.showRoute(null);
      unquiet?.();
    },
  };
}
