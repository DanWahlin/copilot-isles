import type { CameraShot } from '../follow-camera';
import type { TerminalLine } from '../hud';
import { seaState } from '../../world/ocean/sea-state';
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
  chartLines,
  steerLeg,
  nextHelm,
  type HelmHeading,
  type HelmMode,
  type HelmsFile,
  type ReviewAct,
} from '../../world/sites/helms-logic';
import { world as worldUniforms } from '../../world/uniforms';
import type { SeaChoiceOption, SeaChoiceView } from '../../ui/puzzles/SeaChoice';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './types';
import { onCourse } from '../../course/active';
import {
  lineOf,
  puzzleContent,
  puzzleMaybe,
  puzzleQuest,
  puzzleSteps,
  rekey,
  textOf,
} from '../../course/puzzles';
import { orderOptions } from '../../learn/option-order';

const HELMS_ID = 'P1.2';
const FLAG: Readonly<Record<HelmMode, string>> = {
  steer: 'blue',
  review: 'orange',
  auto: 'green',
};
type ReviewChoice = ReviewAct;

/** `puzzles/three-helms.json`: each run acts out the helm its mode is bound to (`acts`). */
interface ThreeHelmsFile extends HelmsFile {
  /** The `review` helm's options, worded as the course words them, each bound to what it does. */
  review: readonly { id: string; acts: ReviewChoice; label: string }[];
}
export const helmsContent = () => puzzleContent<ThreeHelmsFile>('three-helms');
const content = helmsContent;
const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(content(), key, v);
const L = (key: string) => lineOf(content(), key);

/** The `review` helm's options, by what they do (the dump and tests read them here). */
export let REVIEW_OPTIONS: readonly { id: ReviewChoice; label: string }[] = [];
/** Wingman's second hint on an order card, by the helm that fits: the course's use case for it. */
let ORDER_HINTS: Readonly<Record<HelmMode, string>> = {} as Record<HelmMode, string>;
onCourse(() => {
  const c = puzzleMaybe<ThreeHelmsFile>('three-helms');
  REVIEW_OPTIONS = c?.review?.map((o) => ({ id: o.acts, label: o.label })) ?? [];
  ORDER_HINTS = c?.modes ? rekey(c.modes, c.orderHints) : ({} as typeof ORDER_HINTS);
});

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
  /** The sea lanes' route from (fx, fz) to (tx, tz), goal last: round harbour walls and headlands. */
  seaPath(fx: number, fz: number, tx: number, tz: number): readonly { x: number; z: number }[];
  /** Brings her alongside the island's berth and puts you ashore; resolves on the quay. */
  dockHome(): Promise<void>;
}

type Phase =
  | 'approach' // Wingman's third hint: the crew sails you up to the buoy
  | 'brief' // Rhea's talking
  | 'order' // her order card's up: pick the helm
  | 'balk' // `auto` on the reef passage: she sets off, then stops
  | 'choose' // `steer`: at a mark, waiting on your next heading
  | 'leg' // `steer`: sailing one leg
  | 'review' // `review`: the route's charted, waiting on the review's choice
  | 'sailing' // `review` (once accepted) and `auto`: straight through
  | 'docking' // `auto`: coming alongside
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
  /** `steer`: the heading chosen for each leg so far. */
  headings: HelmHeading[];
  /** `review`: you amended the chart, and it goes round the Shoal. */
  revised: boolean;
}

type ChoiceKind = 'order' | 'heading' | 'review';

/** How far (m) outside the course the sea starts easing to its fixed state (~20 s under sail). */
const FIXED_SEA_MARGIN = 120;
/** The crew's approach stops this far (m) short of the buoy. */
const APPROACH_SHORT = 20;
/** The crew gives the wheel back if she hasn't moved this far (m) in `APPROACH_STALL` seconds… */
const APPROACH_MOVE = 3;
const APPROACH_STALL = 8;
/** …or the approach has taken this long (s). */
const APPROACH_MAX = 150;
/** The crew can't make way (wind, a wall): your wheel again (game chrome, the same on any course). */
const APPROACH_GIVE_BACK =
  'She’s not making way here, so the crew’s given you the wheel back. Steer into open water with A and D, then press Q again.';

/**
 * P1.2 The Three Helms (Rhea): three orders sailed in your own ship out in Port Meridian's
 * bay (helms-logic.ts has the lesson). Sail up to a buoy and press E: Rhea hands you an order card
 * and you pick the helm that fits, on a card beside the session panel (1-3, tap, or the d-pad and
 * A). Then the helm's run makes you use it: choose each heading (`steer`), review the chart and
 * amend it (`review`), or hand it over (`auto`).
 *
 * The terminal panel reads like a session: your ask, her steps, and where she's waiting on
 * you. The helms you've sailed are saved; a run you leave part-way starts over.
 */
export function createThreeHelms(host: HelmsHost, buoys: HelmBuoysSite, quiet?: QuietSea): Puzzle {
  const quest = puzzleQuest('three-helms');
  const S = puzzleSteps('three-helms');
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

  const active = () => host.quests()[quest] === S.helms;
  // While the course is on, no dolphin or flying fish leaps among the buoys (their splashes would
  // read as something the lesson put there).
  const unquiet = quiet?.add({ ...helmsCourseArea(), when: () => active() && !solved });
  // The course keeps its own fixed sea (Breeze) whatever the Sea state setting: it eases in as you
  // sail up to it, so the lesson's runs sail the sea they were made for.
  const seaArea = helmsCourseArea(30 + FIXED_SEA_MARGIN);
  const unholdSea = seaState.hold(() => {
    if (!active() || solved) return false;
    const p = host.ship.pose;
    return Math.hypot(p.x - seaArea.x, p.z - seaArea.z) < seaArea.r;
  });
  const save = () => host.learn?.progress.setPuzzle(HELMS_ID, { solved, state: [done.length] });
  const pose = () => host.ship.pose;
  const here = () => ({ x: pose().x, z: pose().z });
  const distTo = (p: { x: number; z: number }) => Math.hypot(p.x - pose().x, p.z - pose().z);
  const orderNo = (mode: HelmMode) => HELM_ORDER.indexOf(mode) + 1;

  /** The three helms in the app's own order (an ordered set: they don't shuffle). */
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
        eyebrow: T('orderEyebrow', { n: orderNo(run.mode) }),
        title: order.name,
        prompt: `“${order.text}”`,
        detail: [],
        options: helmOptions(run),
        focus: same ? view.focus : 0,
      });
    } else if (k === 'heading') {
      const legs = MERIDIAN_HELMS.steer.headings!;
      setView({
        ...base,
        eyebrow: T('sessionSteer'),
        title: run.leg === 0 ? T('legFirst') : T('legNext', { from: run.leg, to: run.leg + 1 }),
        prompt: T('headingPrompt'),
        detail: [],
        options: orderOptions(
          legs[run.leg]!.map((h) => ({ id: h.id, label: h.label })),
          `helms:heading:${run.leg}`,
        ),
        focus: 0,
      });
    } else {
      setView({
        ...base,
        eyebrow: T('sessionReview'),
        title: run.revised ? T('reviewRevised') : T('review'),
        prompt: T('reviewPrompt'),
        detail: chartLines(run.revised),
        options: orderOptions(
          REVIEW_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
          `helms:review:${run.revised ? 1 : 0}`,
        ),
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
    if (!r.tried.includes(pick)) r.tried.push(pick);
    const line = HELM_ORDERS[r.mode].wrong[pick]!;
    if (r.mode === 'review' && pick === 'auto') {
      // She sets off into the passage under \`auto\`, and Rhea stops her short.
      closeChoice();
      r.phase = 'balk';
      const b = MERIDIAN_HELMS.review.buoy;
      const p = here();
      const dx = p.x - b.x,
        dz = p.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      host.ship.followSpline(
        [p, { x: p.x + (dx / len) * BALK_RUN, z: p.z + (dz / len) * BALK_RUN }],
        MERIDIAN_HELMS.review.speed,
      );
      return;
    }
    return orderAgain(r, line);
  }

  /** \`auto\` stopped short of the reef passage: Rhea's line, then the order again. */
  async function balked(): Promise<void> {
    if (!run) return;
    host.ship.clearAutopilot();
    return orderAgain(run, HELM_ORDERS.review.wrong.auto!);
  }

  /** Rhea's reason a helm's wrong, over the order; then the order again (unless the run moved on). */
  async function orderAgain(r: Run, line: string): Promise<void> {
    const my = token;
    r.phase = 'brief';
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
    if (mode === 'review') {
      buoys.showRoute('draft');
      host.frame(overview(r.draft!.route));
      openChoice('review', true);
    } else if (mode === 'steer') {
      buoys.showRoute('steer', 1);
      openChoice('heading', true);
    } else {
      // \`auto\`: she's under way while Rhea says so.
      run.phase = 'sailing';
      host.ship.followSpline([here(), ...r.route], r.speed);
    }
    await host.say([L(`take.${mode}`)]);
    if (my !== token || !run) return;
    if (mode === 'steer') {
      run.phase = 'choose';
      setView({ busy: false });
    } else if (mode === 'review') {
      run.phase = 'review';
      setView({ busy: false });
    }
  }

  /** \`steer\`: you chose the next heading, so she sails the leg. */
  function pickHeading(id: string): void {
    if (!run) return;
    const h = MERIDIAN_HELMS.steer.headings![run.leg]!.find((x) => x.id === id);
    if (!h) return;
    closeChoice();
    run.headings[run.leg] = h;
    run.phase = 'leg';
    buoys.showRoute('steer', run.leg + 1, run.leg);
    host.ship.followSpline([here(), ...steerLeg(run.leg, h)], MERIDIAN_HELMS.steer.speed);
  }

  /** \`steer\`: a mark reached. She checks in, and you choose the next heading. */
  function atMark(): void {
    if (!run) return;
    run.leg += 1;
    run.phase = 'choose';
    openChoice('heading', false);
    sayOver(L('check'));
  }

  /** \`review\`: one of the review's options. */
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
    if (id === 'accept' && r.revised) {
      closeChoice();
      r.phase = 'brief';
      host.frame(null);
      await host.say([L('chartGo')]);
      if (my !== token || run !== r) return;
      const chart = MERIDIAN_HELMS.review;
      r.phase = 'sailing';
      host.ship.followSpline([here(), ...chart.route], chart.speed);
    } else if (id === 'accept') await say(L('acceptDraft'), 'bad');
    else if (id === 'takeOver') await say(r.revised ? L('takeOverRevised') : L('takeOver'), 'info');
    else if (r.revised) await say(L('amendRevised'), 'info');
    else
      await say(L('amend'), 'good', () => {
        r.revised = true;
        buoys.showRoute('review');
        host.frame(overview(MERIDIAN_HELMS.review.route));
      });
  }

  async function finish(mode: HelmMode): Promise<void> {
    const my = token;
    if (!run) return;
    run.phase = mode === 'auto' ? 'docking' : 'wrap';
    if (!done.includes(mode)) done.push(mode);
    buoys.setSailed(mode, true);
    save();
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.7);
    if (mode === 'auto') {
      await host.dockHome();
      if (my !== token) return;
      buoys.showRoute(null);
      run = null;
      solved = true;
      save();
      host.setQuest(quest, S.solved);
      await host.say([L('done.auto')]);
      return;
    }
    await host.say([L(`done.${mode}`)]);
    if (my !== token) return;
    buoys.showRoute(null);
    run = null;
    host.crewHelm(false);
    const n = nextHelm(done);
    if (n) void host.say([L(`next.${n}`)]);
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

  /** Where the crew's approach has got to: when she last moved, and how long it's been going. */
  const approachFrom = { x: 0, z: 0 };
  let approachStill = 0;
  let approachFor = 0;

  /**
   * The crew sails you up to the next buoy (Wingman's third hint) by the sea lanes, round the
   * harbour walls rather than through them, then hands the wheel back. If she can't make way (the
   * wind's dead ahead, or something's in the way) the crew gives the wheel back rather than hold her
   * there (`update`).
   */
  function approach(mode: HelmMode): void {
    const b = MERIDIAN_HELMS[mode].buoy;
    const p = here();
    const route = host.seaPath(p.x, p.z, b.x, b.z).filter((q) => Math.hypot(q.x - p.x, q.z - p.z) > 8);
    const last = route.length > 1 ? route[route.length - 2]! : p;
    const d = Math.hypot(b.x - last.x, b.z - last.z);
    const k = Math.max(0, d - APPROACH_SHORT) / (d || 1);
    const course = [
      p,
      ...route.slice(0, -1),
      { x: last.x + (b.x - last.x) * k, z: last.z + (b.z - last.z) * k },
    ];
    token++;
    run = { mode, phase: 'approach', leg: 0, taken: false, tried: [], headings: [], revised: false };
    host.crewHelm(true);
    host.ship.followSpline(course, 5);
    approachFrom.x = p.x;
    approachFrom.z = p.z;
    approachStill = 0;
    approachFor = 0;
  }

  /** The approach is stuck or too long: the wheel's yours again. */
  function giveBack(): void {
    run = null;
    host.ship.clearAutopilot();
    host.crewHelm(false);
    host.hud.toast(APPROACH_GIVE_BACK, 7);
  }

  /** A high shot over a route from behind the ship (the \`review\` helm's chart). */
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
    return { label: T('hear'), fire: () => hear(n) };
  }

  function terminal(): PuzzleTerminal | null {
    if (!run || !run.taken) return null;
    const r = MERIDIAN_HELMS[run.mode];
    const lines: TerminalLine[] = [];
    if (run.mode === 'steer') {
      lines.push({ tone: 'you', text: T('askSteer') });
      const reached = run.phase === 'wrap' ? r.route.length : run.leg;
      for (let i = 0; i < reached; i++)
        lines.push({ tone: 'ok', text: `✓ Leg ${i + 1}: ${run.headings[i]?.label ?? ''}` });
      if (run.phase === 'leg')
        lines.push({
          tone: 'other',
          text: T('leg', { n: run.leg + 1, heading: run.headings[run.leg]?.label ?? '' }),
        });
      if (run.phase === 'choose' || (run.phase === 'brief' && run.leg < r.route.length))
        lines.push({ tone: 'cmd', text: T('waitingHeading', { n: run.leg + 1 }) });
      return { title: T('sessionSteer'), lines };
    }
    if (run.mode === 'review') {
      const chart = chartLines(run.revised);
      lines.push({ tone: 'you', text: T('askReview') });
      if (run.revised) lines.push({ tone: 'you', text: T('askRevise') });
      lines.push({ tone: 'other', text: run.revised ? T('chartRevised') : T('chart') });
      const sailing = run.phase === 'sailing' || run.phase === 'wrap';
      const legsDone = run.phase === 'wrap' ? chart.length : Math.max(0, host.ship.passedWaypointCount - 1);
      chart.forEach((step, i) =>
        lines.push(
          sailing && i < legsDone
            ? { tone: 'ok', text: T('chartDone', { n: i + 1, step }) }
            : { tone: 'other', text: T('chartStep', { n: i + 1, step }) },
        ),
      );
      if (run.phase === 'review') lines.push({ tone: 'cmd', text: T('reviewWaiting') });
      // Accepting the chart sails it straight through, as \`auto\` does.
      return { title: sailing ? T('sessionAuto') : T('sessionReview'), lines };
    }
    lines.push({ tone: 'you', text: T('askAuto') });
    if (run.phase !== 'brief') lines.push({ tone: 'other', text: T('working') });
    if (run.phase === 'docking' || run.phase === 'wrap') lines.push({ tone: 'ok', text: T('moored') });
    return { title: T('sessionAuto'), lines };
  }

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
        if (distTo(MERIDIAN_HELMS[n].buoy) <= TAKE_RANGE) return T('hintAtBuoy');
        if (tier === 1) return T('hintSail1', { flag: FLAG[n] });
        if (tier === 2) return T('hintSail2', { flag: FLAG[n] });
        approach(n);
        return T('hintSail3');
      }
      if (run.phase === 'order') {
        if (tier === 1) return T('hintOrder1');
        if (tier === 2) return ORDER_HINTS[run.mode];
        void choose(run.mode);
        return T('hintOrder3', { mode: MODE_INFO[run.mode].name });
      }
      if (run.phase === 'choose') {
        if (tier < 3) return T('hintHeading');
        void choose(MERIDIAN_HELMS.steer.headings![run.leg]![0].id);
        return T('hintHeading3');
      }
      if (run.phase === 'review') {
        if (tier === 1) return T('hintReview1');
        if (tier === 2) return run.revised ? T('hintReview2Revised') : T('hintReview2');
        void choose(run.revised ? 'accept' : 'amend');
        return run.revised ? T('hintReview3Revised') : T('hintReview3');
      }
      return T('hintRun');
    },
    update(dt: number) {
      if (!run) return;
      if (!host.afloat() && run.phase !== 'docking' && run.phase !== 'wrap') return abandon();
      if (run.phase === 'approach' && !host.ship.autopilotComplete) {
        const p = pose();
        approachFor += dt;
        if (Math.hypot(p.x - approachFrom.x, p.z - approachFrom.z) > APPROACH_MOVE) {
          approachFrom.x = p.x;
          approachFrom.z = p.z;
          approachStill = 0;
        } else approachStill += dt;
        if (approachStill > APPROACH_STALL || approachFor > APPROACH_MAX) return giveBack();
      }
      if (!host.ship.autopilotComplete) return;
      if (run.phase === 'approach') {
        run = null;
        host.crewHelm(false);
      } else if (run.phase === 'balk') void balked();
      else if (run.phase === 'leg') {
        if (run.leg >= MERIDIAN_HELMS.steer.route.length - 1) void finish('steer');
        else atMark();
      } else if (run.phase === 'sailing') void finish(run.mode);
    },
    sailAction,
    sailTarget() {
      if (!active() || solved) return null;
      if (!run || run.phase === 'approach') {
        const n = nextHelm(done);
        return n
          ? { ...MERIDIAN_HELMS[n].buoy, label: T('buoyLabel', { n: orderNo(n), name: HELM_ORDERS[n].name }) }
          : null;
      }
      if (run.mode === 'steer' && run.phase === 'leg')
        return { ...MERIDIAN_HELMS.steer.route[run.leg]!, label: T('markLabel', { n: run.leg + 1 }) };
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
        host.setQuest(quest, S.solved);
      },
    },
    dispose() {
      token++;
      disposed = true;
      buoys.showRoute(null);
      unmount?.();
      unmount = null;
      unquiet?.();
      unholdSea();
    },
  };
}
