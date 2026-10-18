import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, puzzleQuest } from '../../course/puzzles';
import { CATEGORIES, type ModelCategory } from '../market/catalog';
import {
  CATEGORY_OF,
  EFFORTS,
  GILDA,
  GILDA_TEXT,
  JOBS,
  JOB_DOUBLOONS,
  REFUND,
  feedback,
  jobById,
  marketText as T,
  price,
  retryHire,
  type Effort,
  type Hire,
  type JobId,
} from '../market/jobs';
import { firstModel, modelsIn, savedHireName } from '../market/models';
import { AUTO_HIRE } from '../../learn/progress';
import type { MarketDraft, MarketStore, MarketView } from '../../ui/puzzles/ModelMarket';
import type { ModelMarketSite, MarketShot } from '../../world/sites/model-market';
import { createViewStore } from './channel-routing/view';
import { PadEdges, standardPad } from './pad-edges';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const ID = 'market';
/** Gilda calls out once you're this close (metres from the counter), the first time in a save. */
const HELLO_RANGE = 9;
/** You're "at the market" (the chart label, Wingman's hints) this close. */
const NEAR = 6;

/** What the market needs beyond a puzzle's host: the camera, the keys while it's open, and the page. */
export interface MarketHost extends PuzzleHost {
  frame(shot: MarketShot | null): void;
  cut(shot: MarketShot): void;
  /** The overlay has the keys, the pad and Esc; you don't walk while it's open. */
  setModal(on: boolean): void;
  reducedMotion(): boolean;
  /** Puts the walker at the counter, facing it. */
  place(x: number, z: number, heading: number): void;
  /** A Logbook page, quietly (with a toast), the first time. */
  filePage(id: string): void;
}

/** A new work order: Auto, with the smallest category (and `model`) ready behind it. */
const draft = (model = ''): MarketDraft => ({
  auto: true,
  category: CATEGORY_OF.small,
  model,
  effort: 'default',
});

/**
 * The Model Market (docs/specs/MODEL-MARKET.md; Chapter 01 · Models and Reasoning Effort): an
 * optional stall on Port Meridian's plaza. Press E at Gilda's counter, pick a job from her board,
 * hire Auto or a model (bigger models cost more starfish) and set the effort dial, then sign and pay.
 * The work order comes back stamped right-sized (a starfish or two back), overspent, or fell short
 * (Retry it with a stronger model or more effort). What you've hired lives in the save (`market`),
 * so a rebuilt Meridian shows the same jobs done.
 */
export function createModelMarket(host: MarketHost, site: ModelMarketSite): Puzzle {
  const quest = puzzleQuest('market');
  const progress = host.learn?.progress ?? null;
  const pad = new PadEdges();
  let open = false;
  let openedOnce = false;
  let unmount: (() => void) | null = null;
  /** Retry starts from the last hire (session only: a reload starts the job fresh). */
  let last: Hire | null = null;

  const doneIds = (): JobId[] => JOBS.filter((j) => progress?.data.market.jobs[j.id]?.done).map((j) => j.id);
  const jobsView = () =>
    JOBS.map((j) => {
      const s = progress?.data.market.jobs[j.id];
      return { id: j.id, done: !!s?.done, last: s?.last ? savedHireName(s.last) : null };
    });
  const purse = () => host.learn?.getState().starfishPurse ?? 0;

  const view = createViewStore<MarketView>({
    open: false,
    screen: 'board',
    purse: purse(),
    jobs: jobsView(),
    job: null,
    draft: draft(),
    retry: false,
    result: null,
    focus: 0,
    more: null,
    hint: null,
    notice: null,
    says: null,
    reduced: false,
  });
  /** Wingman's second hint was given: the next work order glows on a hire that fits. */
  let glow = false;

  site.setDone(doneIds());
  // A save that finished every job (before a reload) keeps its quest done.
  if (doneIds().length === JOBS.length && host.quests()[quest] !== 'done') host.setQuest(quest, 'done');

  /** Gilda's line: voiced, and written on the work order (the HUD's captions step aside for it). */
  let speaking = 0;
  const speak = (lines: readonly string[]) => {
    const n = ++speaking;
    void host.dialogue.play(lines).finally(() => {
      if (speaking === n) speaking = 0;
    });
  };
  const say = (line: (typeof GILDA)[keyof typeof GILDA]) => {
    view.set({ says: GILDA_TEXT[line] });
    speak([line]);
  };

  host.interactions.add({
    id: 'market:counter',
    label: () => T('interact'),
    x: site.counter.x,
    y: site.counter.y,
    z: site.counter.z,
    radius: 2.6,
    // Gilda stands behind the counter: at the counter, the market wins the E.
    bias: -1,
    enabled: () => host.canAct() && !!host.learn && !open,
    onInteract: () => void openMarket(),
  });

  async function openMarket(): Promise<void> {
    if (open || !host.learn) return;
    open = true;
    // The E that opened the stall is still down: it mustn't also pick a job.
    pad.arm();
    if (!unmount) {
      const { mountModelMarket } = await import('../../ui/puzzles/ModelMarket');
      const store: MarketStore = {
        get: view.get,
        subscribe: view.subscribe,
        actions: { pickJob, focusJob, pick, model, effort, pay, retry, more, back, close },
        blocked: () => !!host.learn?.busy,
      };
      unmount = mountModelMarket(store);
    }
    host.setModal(true);
    host.place(site.stand.x, site.stand.z, site.stand.heading);
    if (host.reducedMotion()) host.cut(site.shot);
    else host.frame(site.shot);
    greet();
    view.set({
      open: true,
      screen: 'board',
      purse: purse(),
      jobs: jobsView(),
      job: null,
      result: null,
      retry: false,
      more: null,
      hint: null,
      notice: null,
      says: null,
      reduced: host.reducedMotion(),
    });
    if (purse() === 0) say(GILDA.broke);
    else if (!openedOnce) say(GILDA.open);
    openedOnce = true;
  }

  function close(): void {
    if (!open) return;
    open = false;
    // Stepping away cuts Gilda short (her line is only for the work order), so the next E is yours.
    if (speaking) {
      speaking = 0;
      host.dialogue.cancel();
    }
    view.set({ open: false, result: null, notice: null, hint: null, says: null });
    host.frame(null);
    host.setModal(false);
  }

  function back(): void {
    const v = view.get();
    if (v.screen === 'board') return close();
    view.set({
      screen: 'board',
      result: null,
      notice: null,
      says: null,
      hint: null,
      retry: false,
      jobs: jobsView(),
    });
  }

  function focusJob(i: number): void {
    view.set({ focus: ((i % JOBS.length) + JOBS.length) % JOBS.length });
  }

  function pickJob(id: JobId): void {
    if (!open || !jobById(id)) return;
    view.set({
      screen: 'hire',
      job: id,
      focus: JOBS.findIndex((j) => j.id === id),
      draft: draft(firstModel(CATEGORY_OF.small)),
      retry: false,
      result: null,
      notice: null,
      says: null,
      hint: glow ? fits(id) : null,
    });
  }

  function pick(p: 'auto' | ModelCategory): void {
    const d = view.get().draft;
    if (p === 'auto') {
      if (!d.auto) say(GILDA.auto);
      view.set({ draft: { ...d, auto: true }, notice: null });
      return;
    }
    const model = d.category === p && !d.auto ? d.model : firstModel(p);
    view.set({ draft: { ...d, auto: false, category: p, model }, notice: null });
  }

  function model(step: number | string): void {
    const d = view.get().draft;
    if (d.auto) return;
    const names = modelsIn(d.category).map((m) => m.name);
    if (typeof step === 'string') {
      if (names.includes(step)) view.set({ draft: { ...d, model: step } });
      return;
    }
    const i = Math.max(0, names.indexOf(d.model));
    view.set({ draft: { ...d, model: names[(i + step + names.length) % names.length]! } });
  }

  function effort(step: number | Effort): void {
    const d = view.get().draft;
    if (d.auto) return;
    const next =
      typeof step === 'string'
        ? step
        : EFFORTS[Math.min(EFFORTS.length - 1, Math.max(0, EFFORTS.indexOf(d.effort) + step))]!;
    view.set({ draft: { ...d, effort: next } });
  }

  function more(c: ModelCategory | null): void {
    view.set({ more: c });
  }

  const hireOf = (d: MarketDraft): Hire =>
    d.auto ? { auto: true } : { auto: false, category: d.category, model: d.model, effort: d.effort };

  function pay(): void {
    const v = view.get();
    const job = jobById(v.job ?? '');
    if (!open || v.screen !== 'hire' || !job || !host.learn) return;
    const hire = hireOf(v.draft);
    const cost = price(hire);
    // The button already says how many it needs (and the note under it what's cheaper).
    if (!host.learn.spendStarfish(cost)) {
      view.set({ purse: purse() });
      host.audio?.sfx.oneShot('crate_thud', site.counter, 0.25);
      return;
    }
    const f = feedback(job, hire);
    const was = progress?.data.market.jobs[job.id]?.done ?? false;
    const refund = f.outcome === 'right' ? REFUND[job.size] : 0;
    const doubloons = f.outcome === 'right' && !was ? JOB_DOUBLOONS[job.size] : 0;
    if (refund || doubloons) host.learn.refundStarfish(refund, doubloons);
    progress?.recordHire(job.id, {
      outcome: f.outcome,
      category: hire.auto ? AUTO_HIRE : hire.category,
      model: hire.auto ? null : hire.model,
      effort: hire.auto ? null : hire.effort,
      paid: cost,
    });
    last = hire;
    const done = doneIds();
    site.setDone(done);
    host.audio?.sfx.oneShot(f.outcome === 'right' ? 'chime_solve' : 'quill', site.counter, 0.7);
    view.set({
      screen: 'result',
      result: { job: job.id, hire, feedback: f, paid: cost, refund, doubloons },
      purse: purse(),
      jobs: jobsView(),
      notice: null,
      hint: null,
    });
    if (f.outcome === 'right' && !was) {
      const page = puzzleContent<PuzzleFile & { page?: string }>('market').page;
      if (page) host.filePage(page);
      if (host.quests()[quest] !== 'done' && done.length === JOBS.length) {
        host.setQuest(quest, 'done');
        view.set({ says: `${GILDA_TEXT[f.line]} ${GILDA_TEXT[GILDA.done]}` });
        speak([f.line, GILDA.done]);
        return;
      }
    }
    say(f.line);
  }

  function retry(kind: 'model' | 'effort'): void {
    const v = view.get();
    if (!open || v.screen !== 'result' || !v.result || v.result.feedback.outcome !== 'short') return;
    const h = retryHire(last ?? v.result.hire, kind, firstModel);
    view.set({
      screen: 'hire',
      draft: { auto: false, category: h.category, model: h.model, effort: h.effort },
      retry: true,
      result: null,
      notice: kind === 'model' ? T('retryModelNotice') : T('retryEffortNotice'),
    });
  }

  /** Gilda's hello, the first time you come near in a save; it starts the optional task. */
  function greet(): void {
    if (!progress || progress.data.market.greeted) return;
    progress.markMarketGreeted();
    if (!host.quests()[quest]) host.setQuest(quest, 'start');
    say(GILDA.hello);
  }

  const dist = () => Math.hypot(host.player.x - site.counter.x, host.player.z - site.counter.z);

  /** The pick (and effort) that fits the open job: Wingman's second hint. */
  const fits = (id: JobId): { pick: 'auto' | ModelCategory; effort: Effort | null } =>
    jobById(id)?.size === 'quick'
      ? { pick: 'auto', effort: null }
      : { pick: CATEGORY_OF.large, effort: 'default' };

  function pollPad(): void {
    const p = standardPad();
    // While a learning overlay (the Logbook, the fork form) is up, it has the pad.
    if (!p || !pad.look(p, !!host.learn?.busy)) return;
    const v = view.get();
    if (v.screen === 'board') {
      if (pad.edge(p, 13) || pad.edge(p, 15)) focusJob(v.focus + 1);
      if (pad.edge(p, 12) || pad.edge(p, 14)) focusJob(v.focus - 1);
      if (pad.edge(p, 0)) pickJob(JOBS[v.focus]!.id);
      if (pad.edge(p, 1)) close();
    } else if (v.screen === 'hire') {
      const picks: ('auto' | ModelCategory)[] = ['auto', ...CATEGORIES];
      const at = v.draft.auto ? 0 : picks.indexOf(v.draft.category);
      if (pad.edge(p, 5)) pick(picks[Math.min(picks.length - 1, at + 1)]!);
      if (pad.edge(p, 4)) pick(picks[Math.max(0, at - 1)]!);
      if (pad.edge(p, 12)) model(-1);
      if (pad.edge(p, 13)) model(1);
      if (pad.edge(p, 14)) effort(-1);
      if (pad.edge(p, 15)) effort(1);
      if (pad.edge(p, 0)) pay();
      if (pad.edge(p, 1)) back();
    } else {
      const short = v.result?.feedback.outcome === 'short';
      if (pad.edge(p, 0)) {
        if (short) retry('effort');
        else back();
      }
      if (pad.edge(p, 2) && short) retry('model');
      if (pad.edge(p, 1)) back();
    }
  }

  return {
    id: ID,
    // At the stall with the work order closed (the chart label waits for you there, not over it).
    engaged: () => !open && !!host.learn && dist() < NEAR,
    hintKey: () => {
      const v = view.get();
      return `${v.screen}:${v.job ?? ''}:${doneIds().length}`;
    },
    hint(tier: HintTier) {
      if (!host.learn || dist() > NEAR) return null;
      const v = view.get();
      const job = v.job ? jobById(v.job) : null;
      if (tier === 1) return T('hint1');
      if (tier === 2) {
        glow = true;
        if (job) view.set({ hint: fits(job.id) });
        return T('hint2');
      }
      return T('hint3');
    },
    update() {
      if (open) pollPad();
      else if (progress && !progress.data.market.greeted && dist() < HELLO_RANGE && host.canAct()) greet();
    },
    debug: {
      state: () => ({
        open,
        view: view.get(),
        purse: purse(),
        done: doneIds(),
        market: progress?.data.market,
      }),
      open: () => openMarket(),
      pickJob: (id: JobId) => pickJob(id),
      pick: (p: 'auto' | ModelCategory) => pick(p),
      effort: (e: Effort) => effort(e),
      pay: () => pay(),
      retry: (kind: 'model' | 'effort') => retry(kind),
      back: () => back(),
      close: () => close(),
      stand: () => ({ ...site.stand }),
      counter: () => ({ ...site.counter }),
      shot: () => ({ ...site.shot }),
    },
    dispose() {
      host.interactions.remove('market:counter');
      if (open) {
        host.frame(null);
        host.setModal(false);
      }
      unmount?.();
    },
  };
}
