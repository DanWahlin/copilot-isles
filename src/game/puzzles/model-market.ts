import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, puzzleQuest, puzzleSteps } from '../../course/puzzles';
import { CATEGORIES, type ModelCategory } from '../market/catalog';
import {
  CATEGORY_OF,
  EFFORTS,
  GILDA,
  GILDA_TEXT,
  JOBS,
  JOB_DOUBLOONS,
  effortLastTime,
  feedback,
  jobById,
  marketText as T,
  price,
  refundFor,
  retryChanges,
  retryPlan,
  usedLastTime,
  type Effort,
  type Hire,
  type JobId,
} from '../market/jobs';
import { MARKET } from '../../content/market';
import { MARKET_PUZZLE, type MarketStallSpec } from '../market/stalls';
import { firstModel, modelsIn, savedHireName } from '../market/models';
import { AUTO_HIRE } from '../../learn/progress';
import type { MarketDraft, MarketStore, MarketView } from '../../ui/puzzles/ModelMarket';
import type { ModelMarketSite, MarketShot } from '../../world/sites/model-market';
import { createViewStore } from './channel-routing/view';
import { PadEdges, standardPad } from './pad-edges';
import type { HintTier, Puzzle, PuzzleHost } from './types';

/** Gilda calls out once you're this close (metres from her counter), the first time in a save. */
const HELLO_RANGE = 9;
/**
 * The other keepers say hello only once you're at their counter: their stalls stand by the islands'
 * first conversations (Lani's is a few steps from Tamsin), and a hello from further off talked over them.
 */
const SHOP_HELLO_RANGE = 4.5;
/** You're "at the market" (the chart label, Wingman's hints, the keeper's light) this close. */
const NEAR = 6;
/** At another keeper's stall, only at the counter (Wingman's hints by Tamsin stay hers). */
const SHOP_NEAR = 3.5;

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
  /** Lights an islander for the counter's close-up (the talk shot's light), or puts it out. */
  spotlight(npc: string, on: boolean): void;
}

/** A new work order: Auto, with the smallest category (and `model`) ready behind it. */
const draft = (model = ''): MarketDraft => ({
  auto: true,
  category: CATEGORY_OF.small,
  model,
  effort: 'default',
  pending: null,
});

/**
 * The Model Market (docs/specs/MODEL-MARKET.md; Chapter 01 · Models and Reasoning Effort): an
 * optional stall on every island (`stall`, src/game/market/stalls.ts), all sharing one jobs board, one
 * purse and one save. Press E at the counter, pick a job from the board, hire Auto or a model (bigger
 * models cost more starfish) and set the effort dial, then sign and pay. The work order comes back
 * stamped right-sized (a fair price, or a starfish or two back), overspent, or fell short (Retry it:
 * the same job, and you choose a different model or more effort yourself). What you've hired lives in
 * the save (`market`), so every stall, and a rebuilt island, shows the same jobs done. The story's
 * stall (Gilda's) also runs its island's optional task; the others are shops with keepers of their own.
 */
export function createModelMarket(host: MarketHost, site: ModelMarketSite, stall: MarketStallSpec): Puzzle {
  const quest = puzzleQuest(MARKET_PUZZLE);
  const S = puzzleSteps(MARKET_PUZZLE);
  const progress = host.learn?.progress ?? null;
  const keeper = stall.keeper.name;
  /** Another stall's keeper's own hello and goodbye (voiced); Gilda's lines are their captions. */
  const own = stall.story ? null : (MARKET.keepers?.[stall.island] ?? null);
  const lineText = (id: string) =>
    GILDA_TEXT[id] ?? (id === own?.hello.voice ? own.hello.text : id === own?.bye.voice ? own.bye.text : '');
  const pad = new PadEdges();
  let open = false;
  let openedOnce = false;
  /** The keeper's lit for the counter (you're at it). */
  let spotlit = false;
  /** Another stall's keeper says hello once a session, as you come up (Gilda once a save). */
  let greetedHere = false;
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
    keeper,
    screen: 'board',
    purse: purse(),
    jobs: jobsView(),
    job: null,
    draft: draft(),
    retry: null,
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
  // A save that finished every job (before a reload, or at another stall) keeps its quest done.
  if (stall.story && doneIds().length === JOBS.length && host.quests()[quest] !== 'done')
    host.setQuest(quest, 'done');

  /**
   * The keeper's line, written on the work order. Gilda says hers; another keeper says only their own
   * hello and goodbye, and the market's lines are their captions (they're Gilda's voice).
   */
  let speaking = 0;
  const speak = (lines: readonly string[]) => {
    const n = ++speaking;
    void host.dialogue.play(lines).finally(() => {
      if (speaking === n) speaking = 0;
    });
  };
  const voiced = (line: string) => stall.story || line === own?.hello.voice || line === own?.bye.voice;
  const say = (line: string) => {
    view.set({ says: lineText(line) });
    if (voiced(line)) speak([line]);
  };

  const counterId = `${stall.puzzle}:counter`;
  host.interactions.add({
    id: counterId,
    label: () => T('interact', { keeper }),
    x: site.counter.x,
    y: site.counter.y,
    z: site.counter.z,
    radius: 2.6,
    // The keeper stands behind the counter: at the counter, the market wins the E.
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
    const hello = greet();
    view.set({
      open: true,
      screen: 'board',
      purse: purse(),
      jobs: jobsView(),
      job: null,
      result: null,
      retry: null,
      more: null,
      hint: null,
      notice: null,
      says: hello ? lineText(hello) : null,
      reduced: host.reducedMotion(),
    });
    if (purse() === 0) say(GILDA.broke);
    else if (!openedOnce && !hello) say(GILDA.open);
    openedOnce = true;
  }

  function close(): void {
    if (!open) return;
    open = false;
    // Stepping away cuts the keeper short (their line is only for the work order), so the next E is yours.
    if (speaking) {
      speaking = 0;
      host.dialogue.cancel();
    }
    view.set({ open: false, result: null, notice: null, hint: null, says: null });
    host.frame(null);
    host.setModal(false);
    if (own) speak([own.bye.voice]);
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
      retry: null,
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
      retry: null,
      result: null,
      notice: null,
      says: null,
      hint: glow ? fits(id) : null,
    });
  }

  /** A category's first model a Retry will take (not the one that fell short). */
  const firstAllowed = (c: ModelCategory): string | null => {
    const plan = view.get().retry;
    return modelsIn(c).find((m) => !plan || !usedLastTime(plan, c, m.name))?.name ?? null;
  };
  /** The picks a Retry will take, in order (Auto, then the categories). */
  const picksAllowed = (): ('auto' | ModelCategory)[] => {
    const plan = view.get().retry;
    return (['auto', ...CATEGORIES] as const).filter((p) =>
      p === 'auto' ? !plan || !usedLastTime(plan, 'auto') : firstAllowed(p) !== null,
    );
  };
  const lastTime = () => view.set({ notice: T('retryUsed') });

  function pick(p: 'auto' | ModelCategory): void {
    const v = view.get();
    const d = v.draft;
    if (p === 'auto') {
      if (v.retry && usedLastTime(v.retry, 'auto')) return lastTime();
      if (!d.auto) say(GILDA.auto);
      view.set({ draft: { ...d, auto: true, pending: null }, notice: null });
      return;
    }
    const keep = d.category === p && !d.auto && d.pending !== 'model' && d.model;
    const model = keep ? d.model : firstAllowed(p);
    if (!model) return lastTime();
    view.set({
      draft: { ...d, auto: false, category: p, model, pending: d.pending === 'model' ? null : d.pending },
      notice: null,
    });
  }

  function model(step: number | string): void {
    const v = view.get();
    const d = v.draft;
    if (d.auto) return;
    // Nothing picked yet (a Retry): the arrows wait for a size.
    if (d.pending === 'model') return view.set({ notice: T('retryPickFirst') });
    const plan = v.retry;
    const names = modelsIn(d.category)
      .map((m) => m.name)
      .filter((n) => !plan || !usedLastTime(plan, d.category, n));
    if (typeof step === 'string') {
      if (plan && usedLastTime(plan, d.category, step)) return lastTime();
      if (names.includes(step)) view.set({ draft: { ...d, model: step }, notice: null });
      return;
    }
    if (!names.length) return;
    const i = Math.max(0, names.indexOf(d.model));
    view.set({ draft: { ...d, model: names[(i + step + names.length) % names.length]! } });
  }

  function effort(step: number | Effort): void {
    const v = view.get();
    const d = v.draft;
    if (d.auto) return;
    const plan = v.retry;
    const taken = (e: Effort) => !!plan && effortLastTime(plan, d.model, e);
    let next: Effort | undefined;
    if (typeof step === 'string') {
      if (taken(step)) return view.set({ notice: T('retryEffortUsed') });
      next = step;
    } else {
      // From nothing chosen (a Retry), an arrow starts beside last time's effort.
      const from = EFFORTS.indexOf(d.effort);
      for (let i = from + step; i >= 0 && i < EFFORTS.length; i += step)
        if (!taken(EFFORTS[i]!)) {
          next = EFFORTS[i];
          break;
        }
      if (!next && d.pending !== 'effort') return;
      if (!next) return view.set({ notice: T('retryEffortUsed') });
    }
    view.set({
      draft: { ...d, effort: next, pending: d.pending === 'effort' ? null : d.pending },
      notice: null,
    });
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
    // A Retry waits for your choice (the button says so too).
    if (v.draft.pending) {
      view.set({ notice: v.draft.pending === 'model' ? T('retryChooseModel') : T('retryChooseEffort') });
      host.audio?.sfx.oneShot('crate_thud', site.counter, 0.25);
      return;
    }
    const hire = hireOf(v.draft);
    if (v.retry && !retryChanges(v.retry, hire)) return lastTime();
    const cost = price(hire);
    // The button already says how many it needs (and the note under it what's cheaper).
    if (!host.learn.spendStarfish(cost)) {
      view.set({ purse: purse() });
      host.audio?.sfx.oneShot('crate_thud', site.counter, 0.25);
      return;
    }
    const f = feedback(job, hire);
    const was = progress?.data.market.jobs[job.id]?.done ?? false;
    const refund = f.outcome === 'right' ? refundFor(job, hire) : 0;
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
      retry: null,
      notice: null,
      hint: null,
    });
    if (f.outcome === 'right' && !was) {
      const page = puzzleContent<PuzzleFile & { page?: string }>(MARKET_PUZZLE).page;
      if (page) host.filePage(page);
      if (done.length === JOBS.length) {
        if (stall.story && host.quests()[quest] !== 'done') host.setQuest(quest, 'done');
        view.set({ says: `${lineText(f.line)} ${lineText(GILDA.done)}` });
        if (stall.story) speak([f.line, GILDA.done]);
        return;
      }
    }
    say(f.line);
  }

  function retry(kind: 'model' | 'effort'): void {
    const v = view.get();
    if (!open || v.screen !== 'result' || !v.result || v.result.feedback.outcome !== 'short') return;
    const plan = retryPlan(last ?? v.result.hire, kind);
    const h = plan.last;
    // The same job, nothing chosen in the picker it's about: you choose the different model (or effort).
    const next: MarketDraft = h.auto
      ? { auto: false, category: CATEGORY_OF.small, model: '', effort: 'default', pending: 'model' }
      : plan.live === 'model'
        ? { auto: false, category: h.category, model: '', effort: h.effort, pending: 'model' }
        : { auto: false, category: h.category, model: h.model, effort: h.effort, pending: 'effort' };
    view.set({
      screen: 'hire',
      draft: next,
      retry: plan,
      result: null,
      hint: null,
      says: null,
      notice:
        plan.live === 'model'
          ? T(h.auto ? 'retryAutoNotice' : 'retryModelNotice', { model: h.auto ? T('auto') : h.model })
          : T('retryEffortNotice', { model: h.auto ? '' : h.model }),
    });
  }

  /** The keeper's hello: Gilda's the first time in a save (it starts the optional task), another's once a session. */
  function greet(): string | null {
    if (stall.story) {
      if (!progress || progress.data.market.greeted) return null;
      progress.markMarketGreeted();
      if (!host.quests()[quest]) host.setQuest(quest, S.start);
      say(GILDA.hello);
      return GILDA.hello;
    }
    if (!own || greetedHere) return null;
    greetedHere = true;
    say(own.hello.voice);
    return own.hello.voice;
  }

  const dist = () => Math.hypot(host.player.x - site.counter.x, host.player.z - site.counter.z);
  const near = stall.story ? NEAR : SHOP_NEAR;

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
      // LB and RB step through the picks a Retry will take (from nothing chosen, RB takes the first).
      const picks = picksAllowed();
      const d = v.draft;
      const at = d.pending === 'model' ? -1 : picks.indexOf(d.auto ? 'auto' : d.category);
      if (pad.edge(p, 5) && picks.length) pick(picks[Math.min(picks.length - 1, at + 1)]!);
      if (pad.edge(p, 4) && picks.length) pick(picks[Math.max(0, at - 1)]!);
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
    id: stall.puzzle,
    // Every stall's first visit shows the market's chart label (once a save).
    label: MARKET_PUZZLE,
    // At the stall with the work order closed (the chart label waits for you there, not over it).
    engaged: () => !open && !!host.learn && dist() < near,
    hintKey: () => {
      const v = view.get();
      return `${v.screen}:${v.job ?? ''}:${v.retry ? 'retry' : ''}:${doneIds().length}`;
    },
    hint(tier: HintTier) {
      if (!host.learn || dist() > near) return null;
      const v = view.get();
      // A Retry: choosing is yours (the hint says how, never what).
      if (v.screen === 'hire' && v.retry) return T('hintRetry');
      const job = v.job ? jobById(v.job) : null;
      if (tier === 1) return T('hint1');
      if (tier === 2) {
        glow = true;
        if (job) view.set({ hint: fits(job.id) });
        return T('hint2', { keeper });
      }
      return T('hint3');
    },
    update() {
      // At the counter, the keeper gets the talk shot's light (their face reads under the awning, in
      // the stall's shade), as anyone you talk to does.
      const lit = open || dist() < near;
      if (lit !== spotlit) {
        spotlit = lit;
        host.spotlight(stall.keeper.npc, lit);
      }
      if (open) pollPad();
      else if (dist() < (stall.story ? HELLO_RANGE : SHOP_HELLO_RANGE) && host.canAct() && !!host.learn) {
        if (stall.story ? progress && !progress.data.market.greeted : own && !greetedHere) greet();
      }
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
      model: (m: string) => model(m),
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
      host.interactions.remove(counterId);
      if (spotlit) host.spotlight(stall.keeper.npc, false);
      if (open) {
        host.frame(null);
        host.setModal(false);
      }
      unmount?.();
    },
  };
}
