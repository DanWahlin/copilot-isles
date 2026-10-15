import type { CameraShot } from '../follow-camera';
import type { TerminalLine } from '../hud';
import type { QuietSea } from '../../world/life/quiet-sea';
import type { HelmBuoysSite } from '../../world/sites/helm-buoys';
import {
  BALK_RUN,
  HELM_ORDER,
  HELM_ORDERS,
  MERIDIAN_HELMS,
  MODE_INFO,
  TAKE_RANGE,
  helmsCourseArea,
  interactiveLeg,
  nextHelm,
  type HelmHeading,
  type HelmMode,
} from '../../world/sites/helms-logic';
import { world as worldUniforms } from '../../world/uniforms';
import type { SeaChoiceOption, SeaChoiceView } from '../../ui/puzzles/SeaChoice';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './types';

const HELMS_ID = 'P1.2';
const QUEST = 'Q1.5';
const FLAG: Readonly<Record<HelmMode, string>> = {
  interactive: 'blue',
  plan: 'orange',
  autopilot: 'green',
};
/** The Plan review's options, worded as the app words them (02 §Exercise: Start a Session from a Branch). */
export const REVIEW_OPTIONS = [
  { id: 'approve', label: 'Approve and implement this plan' },
  { id: 'exit', label: 'Exit plan mode and I will prompt myself' },
  { id: 'suggest', label: 'Suggest changes to the plan' },
] as const;
type ReviewChoice = (typeof REVIEW_OPTIONS)[number]['id'];

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
  | 'brief' // Rhea's talking
  | 'order' // her order card's up: pick the helm
  | 'balk' // Autopilot on the reef passage: she sets off, then stops
  | 'choose' // Interactive: at a mark, waiting on your next heading
  | 'leg' // Interactive: sailing one leg
  | 'review' // Plan: the route's charted, waiting on the review's choice
  | 'sailing' // Plan (in Autopilot, once approved) and Autopilot: straight through
  | 'docking' // Autopilot: coming alongside
  | 'wrap'; // the run's done and Rhea's summing up

interface Run {
  /** The order's helm: the mode that fits it. */
  mode: HelmMode;
  phase: Phase;
  leg: number;
  /** You picked the right helm and the run's begun. */
  taken: boolean;
  /** Wrong helms tried on this order. */
  tried: HelmMode[];
  /** Interactive: the heading chosen for each leg so far. */
  headings: HelmHeading[];
  /** Plan: you suggested the change, and the plan goes round the Shoal. */
  revised: boolean;
}

type ChoiceKind = 'order' | 'heading' | 'review';

/**
 * P1.2 The Three Helms (Rhea, Q1.5): three orders sailed in your own ship out in Port Meridian's
 * bay (helms-logic.ts has the lesson). Sail up to a buoy and press E: Rhea hands you an order card
 * and you pick the helm that fits, on a card beside the session panel (1-3, tap, or the d-pad and
 * A). Then the helm's run makes you use the mode: choose each heading (Interactive), review the plan
 * and fix it (Plan), or hand it over (Autopilot).
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

  // ---- The choice card (src/ui/puzzles/SeaChoice.tsx), mounted the first time it's needed ----
  let view: SeaChoiceView = {
    open: false,
    eyebrow: '',
    title: '',
    prompt: '',
    detail: [],
    options: [],
    message: null,
    focus: 0,
    busy: false,
    reduced: false,
  };
  const subs = new Set<() => void>();
  const setView = (patch: Partial<SeaChoiceView>) => {
    view = { ...view, ...patch };
    for (const fn of subs) fn();
  };
  let kind: ChoiceKind | null = null;
  let unmount: (() => void) | null = null;
  let mounting = false;
  const mount = () => {
    if (unmount || mounting || typeof document === 'undefined') return;
    mounting = true;
    void import('../../ui/puzzles/SeaChoice').then(({ mountSeaChoice }) => {
      mounting = false;
      if (disposed) return;
      unmount = mountSeaChoice({
        get: () => view,
        subscribe: (fn) => {
          subs.add(fn);
          return () => subs.delete(fn);
        },
        choose: (id) => void choose(id),
        setFocus: (i) => setView({ focus: i }),
        blocked: () => !!host.learn?.busy,
      });
    });
  };
  let disposed = false;
  const lineText = (id: string) => host.hud.line(id)?.text ?? '';
  /**
   * A line Rhea says while the card already takes a pick (her order, her check-in at a mark): a pick
   * skips the rest of it, as E would, so you can answer as soon as you've read the card.
   */
  let speaking: Promise<void> | null = null;
  const sayOver = (id: string) => {
    const p: Promise<void> = host.say([id]).then(() => {
      if (speaking === p) speaking = null;
    });
    speaking = p;
  };
  const hush = async () => {
    const p = speaking;
    if (!p) return;
    speaking = null;
    host.dialogue.next();
    await p;
  };

  const active = () => host.quests()[QUEST] === 'helms';
  // While the course is on, no dolphin or flying fish leaps among the buoys (their splashes would
  // read as something the lesson put there).
  const unquiet = quiet?.add({ ...helmsCourseArea(), when: () => active() && !solved });
  const save = () => host.learn?.progress.setPuzzle(HELMS_ID, { solved, state: [done.length] });
  const pose = () => host.ship.pose;
  const here = () => ({ x: pose().x, z: pose().z });
  const distTo = (p: { x: number; z: number }) => Math.hypot(p.x - pose().x, p.z - pose().z);
  const orderNo = (mode: HelmMode) => HELM_ORDER.indexOf(mode) + 1;

  function helmOptions(r: Run): SeaChoiceOption[] {
    return HELM_ORDER.map((m) => ({
      id: m,
      label: MODE_INFO[m].name,
      sub: MODE_INFO[m].says,
      tried: r.tried.includes(m),
    }));
  }

  /** Opens (or refreshes) the card for what the run's waiting on. */
  function openChoice(k: ChoiceKind, busy: boolean, message: SeaChoiceView['message'] = null): void {
    if (!run) return;
    const same = view.open && kind === k;
    kind = k;
    mount();
    const base = { open: true, busy, message, reduced: worldUniforms.reducedMotion.value > 0.5 };
    if (k === 'order') {
      const order = HELM_ORDERS[run.mode];
      setView({
        ...base,
        eyebrow: `Rhea’s order · ${orderNo(run.mode)} of 3`,
        title: order.name,
        prompt: `“${order.text}”`,
        detail: [],
        options: helmOptions(run),
        focus: same ? view.focus : 0,
      });
    } else if (k === 'heading') {
      const legs = MERIDIAN_HELMS.interactive.headings!;
      setView({
        ...base,
        eyebrow: 'Session · Interactive',
        title: run.leg === 0 ? 'To mark 1' : `Mark ${run.leg} → mark ${run.leg + 1}`,
        prompt: 'Which way, Captain? You choose the heading.',
        detail: [],
        options: legs[run.leg]!.map((h) => ({ id: h.id, label: h.label })),
        focus: 0,
      });
    } else {
      const r = MERIDIAN_HELMS.plan;
      setView({
        ...base,
        eyebrow: 'Session · Plan',
        title: run.revised ? 'Review plan (revised)' : 'Review plan',
        prompt: 'Read Rhea’s plan, then choose:',
        detail: run.revised ? r.plan! : r.draft!.plan,
        options: REVIEW_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
        focus: same ? view.focus : 0,
      });
    }
  }
  function closeChoice(): void {
    kind = null;
    if (view.open) setView({ open: false, busy: false, message: null });
  }

  /** What a pick on the card does, by the card that's up. */
  async function choose(id: string): Promise<void> {
    if (!run || view.busy || !view.open) return;
    const r = run;
    if (speaking) {
      setView({ busy: true });
      await hush();
      if (run !== r) return;
      setView({ busy: false });
    }
    if (kind === 'order' && run.phase === 'order') void pickHelm(id as HelmMode);
    else if (kind === 'heading' && run.phase === 'choose') pickHeading(id);
    else if (kind === 'review' && run.phase === 'review') void review(id as ReviewChoice);
  }

  /** Rhea hands you the order at a buoy; she heaves to while you pick the helm. */
  function hear(mode: HelmMode): void {
    ++token;
    run = { mode, phase: 'order', leg: 0, taken: false, tried: [], headings: [], revised: false };
    host.crewHelm(true);
    host.ship.clearAutopilot();
    openChoice('order', false);
    sayOver(HELM_ORDERS[mode].line);
  }

  /** A helm picked for the order: the right one starts the run, a wrong one gets Rhea's reason. */
  async function pickHelm(pick: HelmMode): Promise<void> {
    if (!run) return;
    const r = run;
    if (pick === r.mode) {
      closeChoice();
      return take(r.mode);
    }
    const my = token;
    if (!r.tried.includes(pick)) r.tried.push(pick);
    const line = HELM_ORDERS[r.mode].wrong[pick]!;
    if (r.mode === 'plan' && pick === 'autopilot') {
      // She sets off into the passage under Autopilot, and Rhea stops her short.
      closeChoice();
      r.phase = 'balk';
      const b = MERIDIAN_HELMS.plan.buoy;
      const p = here();
      const dx = p.x - b.x,
        dz = p.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      host.ship.followSpline(
        [p, { x: p.x + (dx / len) * BALK_RUN, z: p.z + (dz / len) * BALK_RUN }],
        MERIDIAN_HELMS.plan.speed,
      );
      return;
    }
    r.phase = 'brief';
    openChoice('order', true, { text: lineText(line), tone: 'bad' });
    await host.say([line]);
    if (my !== token || run !== r) return;
    r.phase = 'order';
    setView({ busy: false });
  }

  /** Autopilot's stopped short of the reef passage: Rhea's line, then the order again. */
  async function balked(): Promise<void> {
    if (!run) return;
    const my = token;
    const r = run;
    r.phase = 'brief';
    host.ship.clearAutopilot();
    const line = HELM_ORDERS.plan.wrong.autopilot!;
    openChoice('order', true, { text: lineText(line), tone: 'bad' });
    await host.say([line]);
    if (my !== token || run !== r) return;
    r.phase = 'order';
    setView({ busy: false });
  }

  /** The right helm: Rhea briefs it, then the run begins. */
  async function take(mode: HelmMode): Promise<void> {
    if (!run) return;
    const my = token;
    run.phase = 'brief';
    run.taken = true;
    const r = MERIDIAN_HELMS[mode];
    if (mode === 'plan') {
      buoys.showRoute('draft');
      host.frame(overview(r.draft!.route));
      openChoice('review', true);
    } else if (mode === 'interactive') {
      buoys.showRoute('interactive', 1);
      openChoice('heading', true);
    } else {
      // Autopilot: she's under way while Rhea says so.
      run.phase = 'sailing';
      host.ship.followSpline([here(), ...r.route], r.speed);
    }
    await host.say([`mer.helm.${mode}.take`]);
    if (my !== token || !run) return;
    if (mode === 'interactive') {
      run.phase = 'choose';
      setView({ busy: false });
    } else if (mode === 'plan') {
      run.phase = 'review';
      setView({ busy: false });
    }
  }

  /** Interactive: you chose the next heading, so she sails the leg. */
  function pickHeading(id: string): void {
    if (!run) return;
    const h = MERIDIAN_HELMS.interactive.headings![run.leg]!.find((x) => x.id === id);
    if (!h) return;
    closeChoice();
    run.headings[run.leg] = h;
    run.phase = 'leg';
    buoys.showRoute('interactive', run.leg + 1, run.leg);
    host.ship.followSpline([here(), ...interactiveLeg(run.leg, h)], MERIDIAN_HELMS.interactive.speed);
  }

  /** Interactive: a mark reached. She checks in, and you choose the next heading. */
  function atMark(): void {
    if (!run) return;
    run.leg += 1;
    run.phase = 'choose';
    openChoice('heading', false);
    sayOver('mer.helm.interactive.check');
  }

  /** Plan: one of the review's options. */
  async function review(id: ReviewChoice): Promise<void> {
    if (!run) return;
    const my = token;
    const r = run;
    const say = async (line: string, tone: 'good' | 'bad' | 'info', after?: () => void) => {
      r.phase = 'brief';
      after?.();
      openChoice('review', true, { text: lineText(line), tone });
      await host.say([line]);
      if (my !== token || run !== r) return;
      r.phase = 'review';
      setView({ busy: false });
    };
    if (id === 'approve' && r.revised) {
      closeChoice();
      r.phase = 'brief';
      host.frame(null);
      await host.say(['mer.helm.plan.go']);
      if (my !== token || run !== r) return;
      const plan = MERIDIAN_HELMS.plan;
      r.phase = 'sailing';
      host.ship.followSpline([here(), ...plan.route], plan.speed);
    } else if (id === 'approve') await say('mer.helm.plan.approve.draft', 'bad');
    else if (id === 'exit')
      await say(r.revised ? 'mer.helm.plan.exit.revised' : 'mer.helm.plan.exit', 'info');
    else if (r.revised) await say('mer.helm.plan.suggest.revised', 'info');
    else
      await say('mer.helm.plan.suggest', 'good', () => {
        r.revised = true;
        buoys.showRoute('plan');
        host.frame(overview(MERIDIAN_HELMS.plan.route));
      });
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
    closeChoice();
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
    run = { mode, phase: 'approach', leg: 0, taken: false, tried: [], headings: [], revised: false };
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
    if (!active() || solved || !host.sailing() || run) return null;
    const n = nextHelm(done);
    if (!n || distTo(MERIDIAN_HELMS[n].buoy) > TAKE_RANGE) return null;
    return { label: 'Hear Rhea’s order', fire: () => hear(n) };
  }

  function terminal(): PuzzleTerminal | null {
    if (!run || !run.taken) return null;
    const r = MERIDIAN_HELMS[run.mode];
    const lines: TerminalLine[] = [];
    if (run.mode === 'interactive') {
      lines.push({ tone: 'you', text: 'Thread the blue marks with me, one mark at a time' });
      const reached = run.phase === 'wrap' ? r.route.length : run.leg;
      for (let i = 0; i < reached; i++)
        lines.push({ tone: 'ok', text: `✓ Leg ${i + 1}: ${run.headings[i]?.label ?? ''}` });
      if (run.phase === 'leg')
        lines.push({ tone: 'other', text: `→ Leg ${run.leg + 1}: ${run.headings[run.leg]?.label ?? ''}…` });
      if (run.phase === 'choose' || (run.phase === 'brief' && run.leg < r.route.length))
        lines.push({ tone: 'cmd', text: `Waiting on you: which way to mark ${run.leg + 1}?` });
      return { title: 'Session · Interactive', lines };
    }
    if (run.mode === 'plan') {
      const plan = run.revised ? r.plan! : r.draft!.plan;
      lines.push({ tone: 'you', text: 'Chart a course through the reef passage' });
      if (run.revised) lines.push({ tone: 'you', text: 'Suggest changes: keep her clear of the Shoal' });
      lines.push({ tone: 'other', text: run.revised ? 'Plan (revised):' : 'Plan:' });
      const sailing = run.phase === 'sailing' || run.phase === 'wrap';
      const legsDone = run.phase === 'wrap' ? plan.length : Math.max(0, host.ship.passedWaypointCount - 1);
      plan.forEach((step, i) =>
        lines.push(
          sailing && i < legsDone
            ? { tone: 'ok', text: `✓ ${i + 1}. ${step}` }
            : { tone: 'other', text: `   ${i + 1}. ${step}` },
        ),
      );
      if (run.phase === 'review') lines.push({ tone: 'cmd', text: 'Review plan: waiting on you' });
      // Approve and implement sails the plan in Autopilot.
      return { title: sailing ? 'Session · Autopilot' : 'Session · Plan', lines };
    }
    lines.push({ tone: 'you', text: 'Take her home to the east-arm berth' });
    if (run.phase !== 'brief') lines.push({ tone: 'other', text: 'Working through it, no check-ins…' });
    if (run.phase === 'docking' || run.phase === 'wrap')
      lines.push({ tone: 'ok', text: '✓ Moored at the east arm' });
    return { title: 'Session · Autopilot', lines };
  }

  const ORDER_HINT: Readonly<Record<HelmMode, string>> = {
    interactive:
      '“Involved the whole way” is the course’s use case for the mode that works with you step by step.',
    plan: '“The approach matters” is the course’s use case for the mode that plans first.',
    autopilot: '“Well defined, with a clear outcome” is the use case for the mode that runs end to end.',
  };

  return {
    id: HELMS_ID,
    engaged: () => active() && !solved && host.afloat(),
    hintKey: () =>
      `${done.length}|${run?.mode ?? ''}|${run?.phase ?? ''}|${run?.leg ?? 0}|${run?.tried.length ?? 0}|${run?.revised ?? ''}`,
    hint(tier: HintTier) {
      if (!active() || solved) return null;
      const n = nextHelm(done);
      if (!n) return null;
      if (!run) {
        if (distTo(MERIDIAN_HELMS[n].buoy) <= TAKE_RANGE)
          return 'We’re at the buoy. Press E to hear Rhea’s order.';
        if (tier === 1)
          return `Sail up to the buoy with the ${FLAG[n]} flag, Captain. The compass points the way.`;
        if (tier === 2)
          return `Follow the gold marker on the compass to the ${FLAG[n]} flag, then press E beside it.`;
        approach(n);
        return 'Here, the crew will take her up to the buoy for you.';
      }
      if (run.phase === 'order') {
        if (tier === 1)
          return 'Read Rhea’s order. Do you want a say at every step, a plan to review first, or a clear job to hand over?';
        if (tier === 2) return ORDER_HINT[run.mode];
        void choose(run.mode);
        return `There: the ${MODE_INFO[run.mode].name} helm.`;
      }
      if (run.phase === 'choose') {
        if (tier < 3)
          return 'Your call, Captain: either heading works. In Interactive, you direct each step.';
        void choose(MERIDIAN_HELMS.interactive.headings![run.leg]![0].id);
        return 'Straight on, then.';
      }
      if (run.phase === 'review') {
        if (tier === 1) return 'Read the plan line by line before you choose. Is any leg risky?';
        if (tier === 2)
          return run.revised
            ? 'The plan’s clear of the Shoal now. Which option sails it?'
            : 'Leg 2 crosses the Shoal. Which option lets you fix the plan?';
        void choose(run.revised ? 'approve' : 'suggest');
        return run.revised ? 'Approved. Off she goes.' : 'I’ve asked her to steer round the Shoal.';
      }
      return 'Rhea’s got the helm. Watch how this mode works.';
    },
    update() {
      if (!run) return;
      if (!host.afloat() && run.phase !== 'docking' && run.phase !== 'wrap') return abandon();
      if (!host.ship.autopilotComplete) return;
      if (run.phase === 'approach') {
        run = null;
        host.crewHelm(false);
      } else if (run.phase === 'balk') void balked();
      else if (run.phase === 'leg') {
        if (run.leg >= MERIDIAN_HELMS.interactive.route.length - 1) void finish('interactive');
        else atMark();
      } else if (run.phase === 'sailing') void finish(run.mode);
    },
    sailAction,
    sailTarget() {
      if (!active() || solved) return null;
      if (!run || run.phase === 'approach') {
        const n = nextHelm(done);
        return n ? { ...MERIDIAN_HELMS[n].buoy, label: `Order ${orderNo(n)}: ${HELM_ORDERS[n].name}` } : null;
      }
      if (run.mode === 'interactive' && run.phase === 'leg')
        return { ...MERIDIAN_HELMS.interactive.route[run.leg]!, label: `Mark ${run.leg + 1}` };
      return null;
    },
    terminal,
    debug: {
      state: () => ({
        done: [...done],
        solved,
        run: run
          ? {
              mode: run.mode,
              phase: run.phase,
              leg: run.leg,
              taken: run.taken,
              tried: [...run.tried],
              revised: run.revised,
              headings: run.headings.map((h) => h.id),
            }
          : null,
        choice: view.open
          ? {
              kind,
              busy: view.busy,
              options: view.options.map((o) => o.id),
              message: view.message?.text ?? null,
            }
          : null,
      }),
      /** Hears the next order at once (tests), wherever she is. */
      hear: (mode: HelmMode) => hear(mode),
      /** Picks on the open card (tests), as a tap would. */
      choose: (id: string) => void choose(id),
      /** Finishes every helm at once (tests): all three sailed and the quest solved. */
      solve: () => {
        token++;
        run = null;
        closeChoice();
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
      disposed = true;
      buoys.showRoute(null);
      unmount?.();
      unmount = null;
      unquiet?.();
    },
  };
}
