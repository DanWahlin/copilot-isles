import type { GearRackSite } from '../../world/sites';
import {
  GEAR_IDS,
  allChecked,
  gearPhase,
  gearTone,
  ledgerTerminal,
  looseLeft,
  pickUp,
  rackAction,
  rackTerminal,
  readLedger,
  restoreGear,
  saveGear,
  signIn,
  useRack,
  type GearState,
} from '../../world/sites/gear-logic';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './types';

const GEAR_PUZZLE = 'Q0.5.gear';
const QUEST = 'Q0.5';
const TITLE = 'Terminal · copilot-app-for-beginners';

/** Bo's lines when the spyglass check fails: install what's missing, then check again. */
const BO_MISSING: readonly ScriptStep[] = [{ say: 'bo.gear.missing.01' }, { say: 'bo.gear.missing.02' }];

/** Once all four checks pass: on to the ledger. */
const BO_CHECKED: readonly ScriptStep[] = [{ say: 'bo.gear.checked.01' }, { say: 'bo.gear.checked.02' }];

/** The ledger shows someone else's signature: S0.1, then `gh auth login`. */
const BO_LEDGER: readonly ScriptStep[] = [{ say: 'bo.ledger.01' }, { quiz: 'S0.1' }];

const BO_SIGNED: readonly ScriptStep[] = [
  { say: 'bo.signed.01' },
  { say: 'bo.signed.02' },
  { quest: QUEST, step: 'done' },
  { quest: 'Q0.6', step: 'start' },
];

/**
 * Q0.5 Gear Check & Right Signature (POC §4.4): Bo's gear hangs on his rack, one piece per tool, and
 * E there runs all four version checks in the terminal panel. The spyglass has no lens, so `gh` is
 * "command not found" until you fetch one from the market and check again. Then Bo's ledger shows
 * `gh auth status` signed in as someone else (S0.1), and `gh auth login` puts your own signature on it.
 */
export function createGearCheck(host: PuzzleHost, site: GearRackSite): Puzzle {
  const saved = host.learn?.progress.data.puzzles[GEAR_PUZZLE];
  let state: GearState = restoreGear(saved?.state, saved?.solved ?? false);
  let hint = false;
  let running = false;
  /** Which readout the terminal shows: the rack's checks or the ledger's sign-in. */
  let screen: 'rack' | 'ledger' = gearPhase(state) === 'ledger' || state.signed ? 'ledger' : 'rack';

  const step = () => host.quests()[QUEST];
  const active = () => {
    const q = step();
    return q === 'gear' || q === 'ledger';
  };
  const save = () =>
    host.learn?.progress.setPuzzle(GEAR_PUZZLE, { solved: state.signed, state: saveGear(state) });
  const spots = site.spots();
  const canUse = () => host.canAct() && active() && !running;

  /** Brings the harbour in line with `state`: the gear's always on the rack; the lens shows once it's needed. */
  function sync(): void {
    for (const g of GEAR_IDS) {
      site.setLoose(g, false);
      site.setHung(g, true);
    }
    site.setLoose('lens', active() && state.lens === 'loose');
    site.setLensFitted(state.lens === 'fitted');
    site.setLedger(state.signed ? 'you' : 'someone-else');
    if (hint && state.lens !== 'loose') setHint(false);
  }

  function setHint(on: boolean): void {
    hint = on;
    site.setGlint(on ? 'lens' : null);
  }

  // Quest state from an older save: Q0.6 already under way means the gear was checked in dialogue.
  if (!step() && host.quests()['Q0.6']) state = restoreGear(undefined, true);
  let wasActive = active();
  sync();

  const lensAt = spots.loose.lens;
  host.interactions.add({
    id: 'gear:lens',
    label: () => 'Pick up the spyglass lens',
    x: lensAt.x,
    y: lensAt.y,
    z: lensAt.z,
    radius: 1.8,
    enabled: () => canUse() && looseLeft(state).includes('lens'),
    onInteract: () => pick(),
  });
  host.interactions.add({
    id: 'gear:rack',
    label: () => {
      const a = rackAction(state);
      if (!a) return 'Gear rack';
      return a.kind === 'fit' ? 'Fit the lens and check again' : 'Run the version checks';
    },
    x: spots.rack.x,
    y: spots.rack.y,
    z: spots.rack.z,
    radius: 2.2,
    enabled: () => canUse() && rackAction(state) !== null,
    onInteract: () => void rack(),
  });
  host.interactions.add({
    id: 'gear:ledger',
    label: () => 'Read the ledger',
    x: spots.ledger.x,
    y: spots.ledger.y,
    z: spots.ledger.z,
    radius: 1.8,
    enabled: () => canUse() && allChecked(state) && !state.signed,
    onInteract: () => void ledger(),
  });

  function pick(): void {
    const s = pickUp(state, 'lens');
    if (s.event.kind !== 'picked') return;
    state = s.state;
    save();
    sync();
    host.audio?.sfx.oneShot('gear_pickup', lensAt, 0.4);
    host.hud.toast('Spyglass lens stowed. Fit it at the gear rack.', 2.6);
  }

  async function rack(): Promise<void> {
    const r = useRack(state);
    const ev = r.event;
    if (ev.kind === 'nothing') return;
    state = r.state;
    screen = 'rack';
    save();
    sync();
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.4);
    running = true;
    if (ev.kind === 'missing') await host.beat(BO_MISSING, 'Bo');
    else if (ev.kind === 'all-checked') {
      host.audio?.sfx.oneShot('chime_solve', undefined, 0.6);
      await host.beat(BO_CHECKED, 'Bo');
      if (step() === 'gear') host.setQuest(QUEST, 'ledger');
    }
    running = false;
  }

  async function ledger(): Promise<void> {
    const r = readLedger(state);
    if (r.event.kind === 'nothing') return;
    state = r.state;
    screen = 'ledger';
    save();
    running = true;
    const ok = await host.beat(BO_LEDGER, 'Bo');
    if (ok) {
      state = signIn(state).state;
      save();
      sync();
      host.audio?.sfx.oneShot('quill', spots.ledger, 0.45);
      await host.beat(BO_SIGNED, 'Bo');
    }
    running = false;
  }

  const near = (p: { x: number; z: number }, r: number) =>
    Math.hypot(host.player.x - p.x, host.player.z - p.z) < r;
  const phase = () => gearPhase(state);

  return {
    id: GEAR_PUZZLE,
    engaged: () => active() && !running,
    hintKey: () => `${saveGear(state).join('')}`,
    hint(tier: HintTier) {
      if (!active()) return null;
      const ph = phase();
      if (ph === 'ledger') {
        if (tier === 1) return 'Bo’s ledger is on the lectern beside the rack. Whose signature is on it?';
        return 'Read the ledger with E. The wrong account means you sign in again with gh auth login.';
      }
      if (ph === 'check') {
        if (tier < 3 || !near(spots.rack, 3))
          return 'Bo’s gear rack is by the storehouse door. Press E there to run the version checks.';
        void rack();
        return 'I ran the checks for you. Watch the terminal.';
      }
      if (state.lens === 'carried') return 'You’ve got the lens. Fit it at Bo’s rack, then check again.';
      if (tier === 1)
        return 'The chandler at the market stall keeps spare lenses. Install what’s missing, then check again.';
      if (tier === 2) {
        setHint(true);
        return 'See that glint? That’s the spyglass lens.';
      }
      pick();
      return 'I fetched the spyglass lens for you.';
    },
    terminal(): PuzzleTerminal | null {
      if (!active() && step() !== 'done') return null;
      if (step() === 'done' && !near(spots.rack, 4)) return null;
      if (!near(spots.rack, 6) && !near(spots.ledger, 6)) return null;
      const lines = screen === 'ledger' ? ledgerTerminal(state) : rackTerminal(state);
      return { title: TITLE, lines: lines.map((text) => ({ text, tone: gearTone(text) })) };
    },
    update() {
      // Bo's beat starts the quest mid-frame, so the loose pieces appear on the next update.
      const on = active();
      if (on !== wasActive) {
        wasActive = on;
        sync();
      }
    },
    debug: {
      state: () => ({ ...state, phase: phase(), running }),
      pick: () => pick(),
      rack: () => rack(),
      ledger: () => ledger(),
      spots: () => ({
        rack: site.anchors.gearRack ?? { x: spots.rack.x, z: spots.rack.z },
        ledger: site.anchors.gearLedger ?? { x: spots.ledger.x, z: spots.ledger.z },
        loose: { lens: { x: lensAt.x, z: lensAt.z } },
      }),
      /** Skips to the ledger: every piece hung and checked, no beats (they wait for E). */
      solve: () => {
        state = { ran: true, lens: 'fitted', ledgerRead: false, signed: false };
        screen = 'rack';
        save();
        sync();
        if (step() === 'gear') host.setQuest(QUEST, 'ledger');
      },
    },
    dispose() {
      host.interactions.remove('gear:lens');
      host.interactions.remove('gear:rack');
      host.interactions.remove('gear:ledger');
    },
  };
}
