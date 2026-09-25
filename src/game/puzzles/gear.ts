import type { GearRackSite } from '../../world/sites';
import {
  GEAR_IDS,
  allChecked,
  gearDef,
  gearPhase,
  gearTone,
  ledgerTerminal,
  looseLeft,
  nearestLoose,
  pickUp,
  rackAction,
  rackTerminal,
  readLedger,
  restoreGear,
  saveGear,
  signIn,
  useRack,
  type GearState,
  type LooseId,
} from '../../world/sites/gear-logic';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './types';

const GEAR_PUZZLE = 'Q0.5.gear';
const QUEST = 'Q0.5';
const TITLE = 'Terminal · copilot-app-for-beginners';

const LOOSE_NAME: Record<LooseId, string> = {
  compass: 'compass',
  lantern: 'lantern',
  rope: 'rope coil',
  spyglass: 'spyglass',
  lens: 'spyglass lens',
};

/** Bo's lines when the spyglass check fails: install what's missing, then check again. */
const BO_MISSING: readonly ScriptStep[] = [{ say: 'bo.gear.missing.01' }, { say: 'bo.gear.missing.02' }];

/** Once all four checks pass: match them up (M0.1), then the ledger. */
const BO_CHECKED: readonly ScriptStep[] = [
  { say: 'bo.gear.checked.01' },
  { quiz: 'M0.1' },
  { say: 'bo.gear.checked.02' },
];

/** The ledger shows someone else's signature: S0.1, then `gh auth login`. */
const BO_LEDGER: readonly ScriptStep[] = [{ say: 'bo.ledger.01' }, { quiz: 'S0.1' }];

const BO_SIGNED: readonly ScriptStep[] = [
  { say: 'bo.signed.01' },
  { say: 'bo.signed.02' },
  { quest: QUEST, step: 'done' },
  { quest: 'Q0.6', step: 'start' },
];

/**
 * Q0.5 Gear Check & Right Signature (POC §4.4): find Bo's four pieces of gear around the village
 * and hang them on his rack. Each hook runs its version check in the terminal panel. The spyglass
 * comes without a lens, so `gh` is "command not found" until you fetch one from the market and
 * check again. Then Bo's ledger shows `gh auth status` signed in as someone else (S0.1), and
 * `gh auth login` puts your own signature on it.
 */
export function createGearCheck(host: PuzzleHost, site: GearRackSite): Puzzle {
  const saved = host.learn?.progress.data.puzzles[GEAR_PUZZLE];
  let state: GearState = restoreGear(saved?.state, saved?.solved ?? false);
  let hint: LooseId | null = null;
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

  /** Brings the harbour in line with `state` (loose pieces only show once Bo's asked for them). */
  function sync(animate = false): void {
    for (const g of GEAR_IDS) {
      site.setLoose(g, active() && state.pieces[g] === 'loose');
      site.setHung(g, state.pieces[g] === 'hung', animate);
    }
    site.setLoose('lens', active() && state.lens === 'loose');
    site.setLensFitted(state.lens === 'fitted');
    site.setLedger(state.signed ? 'you' : 'someone-else');
    if (hint && !looseLeft(state).includes(hint)) setHint(null);
  }

  function setHint(id: LooseId | null): void {
    hint = id;
    site.setGlint(id);
  }

  // Quest state from an older save: Q0.6 already under way means the gear was checked in dialogue.
  if (!step() && host.quests()['Q0.6']) state = restoreGear(undefined, true);
  let wasActive = active();
  sync();

  for (const id of [...GEAR_IDS, 'lens'] as const) {
    const p = spots.loose[id];
    host.interactions.add({
      id: `gear:${id}`,
      label: () => `Pick up the ${LOOSE_NAME[id]}`,
      x: p.x,
      y: p.y,
      z: p.z,
      radius: 1.8,
      enabled: () => canUse() && looseLeft(state).includes(id),
      onInteract: () => pick(id),
    });
  }
  host.interactions.add({
    id: 'gear:rack',
    label: () => {
      const a = rackAction(state);
      if (!a) return 'Gear rack';
      if (a.kind === 'fit') return 'Fit the lens and check again';
      const more = GEAR_IDS.filter((g) => state.pieces[g] === 'carried').length - 1;
      return `Hang the ${gearDef(a.id).name}${more > 0 ? ` (${more} more)` : ''}`;
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

  function pick(id: LooseId): void {
    const s = pickUp(state, id);
    if (s.event.kind !== 'picked') return;
    state = s.state;
    save();
    sync();
    host.audio?.sfx.oneShot('gear_pickup', spots.loose[id], 0.4);
    const left = looseLeft(state).filter((l) => l !== 'lens').length;
    host.hud.toast(
      id === 'lens'
        ? 'Spyglass lens stowed. Fit it at the gear rack.'
        : `${cap(LOOSE_NAME[id])} stowed.${left ? ` ${left} more to find.` : ' Take it all to Bo’s gear rack.'}`,
      2.6,
    );
  }

  async function rack(): Promise<void> {
    const r = useRack(state);
    const ev = r.event;
    if (ev.kind === 'nothing') return;
    state = r.state;
    screen = 'rack';
    save();
    sync(true);
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.4);
    if (ev.kind === 'checked') {
      const g = gearDef(ev.id);
      host.hud.toast(`${g.tool} checks out: ${g.output}`, 2.6);
      return;
    }
    running = true;
    if (ev.kind === 'missing') await host.beat(BO_MISSING, 'Bo');
    else if (ev.kind === 'fitted') host.hud.toast('Lens fitted. GitHub CLI checks out.', 2.6);
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
      if (rackAction(state) && tier === 1)
        return 'You’re carrying gear. Hang it on Bo’s rack by the storehouse.';
      const target = nearestLoose(state, host.player, (id) => spots.loose[id]);
      if (!target) return 'Take what you’re carrying to the gear rack.';
      if (tier === 1)
        return ph === 'lens'
          ? 'The chandler at the market stall keeps spare lenses. Install what’s missing, then check again.'
          : 'Bo’s gear is scattered round the village: the quay, the well, the pier, and the lookout.';
      if (tier === 2) {
        setHint(target);
        return `See that glint? That’s the ${LOOSE_NAME[target]}.`;
      }
      pick(target);
      return `I fetched the ${LOOSE_NAME[target]} for you.`;
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
      state: () => ({ ...state, pieces: { ...state.pieces }, phase: phase(), running }),
      pick: (id: LooseId) => pick(id),
      rack: () => rack(),
      ledger: () => ledger(),
      spots: () => ({
        rack: site.anchors.gearRack ?? { x: spots.rack.x, z: spots.rack.z },
        ledger: site.anchors.gearLedger ?? { x: spots.ledger.x, z: spots.ledger.z },
        loose: Object.fromEntries(
          [...GEAR_IDS, 'lens'].map((id) => [
            id,
            { x: spots.loose[id as LooseId].x, z: spots.loose[id as LooseId].z },
          ]),
        ),
      }),
      /** Skips to the ledger: every piece hung and checked, no beats (they wait for E). */
      solve: () => {
        state = { ...restoreGear(undefined, true), ledgerRead: false, signed: false };
        screen = 'rack';
        save();
        sync();
        if (step() === 'gear') host.setQuest(QUEST, 'ledger');
      },
    },
    dispose() {
      for (const id of [...GEAR_IDS, 'lens']) host.interactions.remove(`gear:${id}`);
      host.interactions.remove('gear:rack');
      host.interactions.remove('gear:ledger');
    },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
