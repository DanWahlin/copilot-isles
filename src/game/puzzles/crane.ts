import { COURSE_REPO, forkName } from '../../learn/fork';
import type { CraneSite } from '../../world/sites';
import {
  CRANE_CARGO,
  craneFacings,
  confirmYes,
  craneHintTarget,
  dryRun,
  restoreCrane,
  saveCrane,
  lineTone,
  SETUP_COMMAND,
  signLines,
  terminalLines,
  turnCapstan,
  YOUR_FACING,
  type CraneEvent,
  type CraneState,
} from '../../world/sites/crane-logic';
import { lineOf, puzzleQuest, puzzleSteps, textOf } from '../../course/puzzles';
import { craneContent } from '../../world/sites/crane-logic';
import { POL_SOLVED } from '../cove-quests';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const CRANE_ID = 'P0.2';
/** The crane's words and lines (`puzzles/crane.json`). */
const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(craneContent(), key, v);
const L = (key: string) => lineOf(craneContent(), key);

/**
 * P0.2 The Dry-Run Crane (POC §4.5): turn the capstan (E) to aim the crane at a berth, pull the
 * dry-run lever to preview (ghost crates land and the sign names the repository), and pull the
 * confirm lever once the preview shows your own fork. Real crates stock your ship, the stores board
 * ticks, and the banner unfurls. Guards teach rather than fail: Pol stops a confirm without a
 * preview, the script refuses a repository you don't own, the quay isn't a repository at all, and
 * until Suri's gate lever has moved the quest past its `gate` step, your fork's dry run warns and the
 * confirm fails. Every word of it is the course's (`puzzles/crane.json`).
 */
export function createCrane(host: PuzzleHost, site: CraneSite): Puzzle {
  const quest = puzzleQuest('crane');
  /** Its steps, as the course's quest calls them (`gate` is the step the mill's gate lever ends). */
  const S = puzzleSteps('crane');
  /** The gear rack's quest: the notice reads whether it's finished. */
  const gearQuest = puzzleQuest('gear-rack');
  const saved = host.learn?.progress.data.puzzles[CRANE_ID];
  let state: CraneState = restoreCrane(saved?.state, saved?.solved ?? false);
  let hintOn = false;
  let running = false;
  /** Your fork's `owner/repo` (the placeholder until you've given it), read fresh so a change shows. */
  const yours = () => forkName(host.learn?.progress.data.fork ?? null);

  const started = () => {
    const q = host.quests()[quest];
    return q === S.gate || q === S.crane || q === S.solved || q === 'done';
  };
  /** The gate's up: Suri's gate lever moves the job past its `gate` step (the sluice does). */
  const actionsOn = () => host.quests()[quest] !== S.gate;
  const save = () =>
    host.learn?.progress.setPuzzle(CRANE_ID, { solved: state.complete, state: saveCrane(state) });

  /** What the terminal panel shows while you're at the crane: the script's last output. */
  let terminal: string[] = [];
  /** The arm sign and the terminal, after `ev` (or the state alone). */
  let paintedFork = host.learn?.progress.data.fork ?? null;
  let paintedActions = actionsOn();
  const readout = (ev?: CraneEvent) => {
    paintedFork = host.learn?.progress.data.fork ?? null;
    paintedActions = actionsOn();
    site.setSign(signLines(state, ev, yours()), yours());
    terminal = terminalLines(state, ev, yours(), paintedActions);
  };

  // Restore what the harbour looked like.
  site.setFacing(state.facing, true);
  if (state.complete) {
    site.showCrates('real', YOUR_FACING, CRANE_CARGO.length);
    site.setBoard(CRANE_CARGO.length);
    site.setBanner(true, true);
  } else if (state.preview !== null) site.showCrates('ghost', state.preview, CRANE_CARGO.length);
  readout();
  if (state.complete && host.quests()[quest] === S.crane) host.setQuest(quest, S.solved);

  const spots = site.spots();
  const say = (speaker: string, line: string, s = 4.5) => host.hud.showText(speaker, line, s);
  const canUse = () => host.canAct() && started() && !state.complete && !running;

  // Before the crane job starts, the capstan explains what the crane is for and who opens it.
  host.interactions.add({
    id: 'crane:notice',
    label: () => T('noticeLabel'),
    x: spots.capstan.x,
    y: spots.capstan.y,
    z: spots.capstan.z,
    radius: 2.5,
    enabled: () => host.canAct() && !started() && !state.complete,
    onInteract: () =>
      say(T('noticeTitle'), host.quests()[gearQuest] === 'done' ? T('noticeBefore') : T('noticeAfter'), 6),
  });
  host.interactions.add({
    id: 'crane:capstan',
    label: () => T('capstan'),
    x: spots.capstan.x,
    y: spots.capstan.y,
    z: spots.capstan.z,
    radius: 2.5,
    enabled: () => canUse() && !site.busy,
    onInteract: () => turn(),
  });
  host.interactions.add({
    id: 'crane:dry',
    label: () => T('pullDry'),
    x: spots.dry.x,
    y: spots.dry.y,
    z: spots.dry.z,
    radius: 1.5,
    enabled: () => canUse(),
    onInteract: () => void preview(),
  });
  host.interactions.add({
    id: 'crane:yes',
    label: () => T('pullYes'),
    x: spots.yes.x,
    y: spots.yes.y,
    z: spots.yes.z,
    radius: 1.5,
    enabled: () => canUse(),
    onInteract: () => void confirm(),
  });

  function clearHint(): void {
    if (!hintOn) return;
    hintOn = false;
    site.setHint(false);
  }

  function turn(): void {
    const step = turnCapstan(state);
    if (step.event.kind !== 'turned') return;
    state = step.state;
    clearHint();
    site.clearCrates('ghost');
    site.setFacing(state.facing);
    readout();
    host.audio?.sfx.oneShot('crane_ratchet', spots.capstan, 0.9);
    save();
    const f = craneFacings(yours())[state.facing]!;
    host.hud.toast(f.berth ? T('swingBerth', { berth: f.berth }) : T('swingQuay'), 2.5);
  }

  async function preview(): Promise<void> {
    if (site.busy) {
      say('Pim', T('stillSwinging'), 3);
      return;
    }
    site.pullLever('dry');
    host.audio?.sfx.oneShot('lever', spots.dry, 0.9);
    const step = dryRun(state, yours());
    state = step.state;
    save();
    const ev = step.event;
    if (ev.kind === 'not-a-repo') {
      site.clearCrates('ghost');
      readout(ev);
      say('Pim', T('nothingQuay'));
      return;
    }
    if (ev.kind !== 'preview') return;
    running = true;
    site.setSign([T('signChecking1'), T('signChecking2')]);
    terminal = [T('dryRunCommand', { command: SETUP_COMMAND }), T('checking')];
    say('Pim', T('waitPreview'), 3.5);
    await site.drop('ghost', ev.facing, () => host.audio?.sfx.oneShot('crate_thud', spots.capstan, 0.25));
    running = false;
    readout();
    if (ev.owner === 'you' && !actionsOn())
      say('Pim', T('previewYoursActionsOff', { repository: ev.repository }), 6);
    else if (ev.owner === 'you') say('Pim', T('previewYours', { repository: ev.repository }), 5);
    else if (ev.owner === 'captain') {
      const who = craneFacings(yours())[ev.facing]!.captain ?? T('anotherCaptain');
      say('Pim', T('previewCaptain', { repository: ev.repository, who }), 5);
    } else say('Pim', T('previewGuild', { repository: ev.repository }), 5);
  }

  async function confirm(): Promise<void> {
    if (site.busy) {
      say('Pim', T('waitPreview'), 3.5);
      return;
    }
    site.pullLever('yes');
    host.audio?.sfx.oneShot('lever', spots.yes, 0.9);
    const step = confirmYes(state, yours(), actionsOn());
    const ev = step.event;
    state = step.state;
    switch (ev.kind) {
      case 'not-a-repo':
        readout(ev);
        say('Pol', T('yesQuay'));
        return;
      case 'preview-first':
        clearHint();
        say('Pol', T('previewFirst'));
        return;
      case 'refused':
        await refused(ev);
        return;
      case 'gate-shut':
        await actionsOff();
        return;
      case 'complete':
        await complete();
        return;
      default:
        return;
    }
  }

  async function refused(ev: Extract<CraneEvent, { kind: 'refused' }>): Promise<void> {
    site.refuse();
    readout(ev);
    host.audio?.sfx.oneShot('crane_ratchet', spots.capstan, 1);
    running = true;
    await host.beat(
      ev.owner === 'guild'
        ? [{ say: L('refuseGuild1') }, { say: L('refuseGuild2') }, { say: L('refuseGuild3') }]
        : [{ say: L('refuseCaptain') }],
      'Pol',
    );
    running = false;
    site.setSign(signLines(state, undefined, yours()), yours()); // The terminal keeps the refusal.
  }

  /** `--yes` on your fork with its workflows off: the script's "Setup failed", and Pol says why. */
  async function actionsOff(): Promise<void> {
    site.refuse();
    readout({ kind: 'gate-shut', repository: yours() });
    host.audio?.sfx.oneShot('crane_ratchet', spots.capstan, 1);
    running = true;
    await host.beat([{ say: L('refuseActions') }], 'Pol');
    running = false;
    site.setSign(signLines(state, undefined, yours()), yours()); // The terminal keeps the failure.
  }

  async function complete(): Promise<void> {
    running = true;
    clearHint();
    site.clearCrates('ghost');
    site.setSign([T('repository', { repository: yours() }), T('creating')], yours());
    terminal = [
      T('yesCommand', { command: SETUP_COMMAND }),
      T('repository', { repository: yours() }),
      T('creating'),
    ];
    await site.drop('real', YOUR_FACING, (k) => {
      host.audio?.sfx.oneShot('crate_thud', spots.capstan, 0.9);
      site.setBoard(k + 1);
      const c = CRANE_CARGO[k]!;
      host.hud.toast(T('stowed', { title: c.title, count: c.count }), 1.6);
    });
    readout();
    site.setBanner(true);
    save();
    host.setQuest(quest, S.solved);
    running = false;
    await new Promise((r) => setTimeout(r, 900));
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    const ok = await host.beat(POL_SOLVED, 'Pol');
    if (!ok) host.hud.toast(T('finishWithPol'), 3.5);
  }

  const near = (r = 14) => {
    const p = host.player;
    return Math.hypot(p.x - spots.capstan.x, p.z - (spots.capstan.z + 3)) < r;
  };

  return {
    id: CRANE_ID,
    engaged: () => started() && !state.complete && near(),
    hintKey: () => `${state.facing}:${state.preview ?? '-'}`,
    hint(tier: HintTier) {
      if (!started() || state.complete) return null;
      const aimed = state.facing === YOUR_FACING;
      if (!aimed) {
        if (tier === 1) return T('hintAim1');
        if (tier === 2) {
          hintOn = true;
          site.setHint(true);
          return T('hintAim2');
        }
        if (site.busy) return null;
        // Tier 3: swing it round to your berth.
        const { turnsNeeded } = craneHintTarget(state);
        for (let k = 0; k < turnsNeeded; k++) state = turnCapstan(state).state;
        clearHint();
        site.clearCrates('ghost');
        site.setFacing(state.facing);
        readout();
        host.audio?.sfx.oneShot('crane_ratchet', spots.capstan, 0.9);
        save();
        return T('hintAim3');
      }
      if (state.preview !== state.facing) {
        if (tier === 1) return T('hintPreview1');
        if (tier === 2) return T('hintPreview2');
        void preview();
        return T('hintPreview3');
      }
      if (!actionsOn()) {
        if (tier === 1) return T('hintActions1');
        if (tier === 2) return T('hintActions2');
        return T('hintActions3');
      }
      if (tier === 1) return T('hintYes1');
      if (tier === 2) return T('hintYes2');
      void confirm();
      return T('hintYes3');
    },
    update() {
      // The site animates itself. A fork given (or changed in the Logbook) repaints the sign.
      const stale =
        (host.learn?.progress.data.fork ?? null) !== paintedFork || actionsOn() !== paintedActions;
      if (stale && !running && !site.busy) readout();
    },
    terminal() {
      if (!started() || host.quests()[quest] === 'done' || !near(9)) return null;
      return {
        title: T('terminalTitle', { repo: host.learn?.progress.data.fork?.repo ?? COURSE_REPO }),
        lines: terminal.map((text) => ({ text, tone: lineTone(text, yours()) })),
      };
    },
    debug: {
      state: () => ({ ...state, busy: site.busy, running }),
      turn: () => turn(),
      dry: () => preview(),
      yes: () => confirm(),
      solve: async () => {
        if (state.complete) return;
        // Tests that skip the mill: the gate counts as up.
        if (!actionsOn()) host.setQuest(quest, S.crane);
        while (state.facing !== YOUR_FACING) turn();
        while (site.busy) await new Promise((r) => setTimeout(r, 100));
        await preview();
        // Resolves once the hold is stocked, not after Pol's closing lines (those wait for E).
        void confirm();
        while (!state.complete || running) await new Promise((r) => setTimeout(r, 100));
      },
      /** Where things are, so tests can walk up and press E like a player. */
      spots: () => ({
        capstan: { x: spots.capstan.x, z: spots.capstan.z + 2.0 },
        dry: { x: spots.dry.x, z: spots.dry.z + 0.8 },
        yes: { x: spots.yes.x, z: spots.yes.z + 0.8 },
        yours: YOUR_FACING,
      }),
    },
    dispose() {
      host.interactions.remove('crane:capstan');
      host.interactions.remove('crane:dry');
      host.interactions.remove('crane:yes');
    },
  };
}
