import type { CraneSite } from '../../world/sites';
import {
  CRANE_CARGO,
  CRANE_FACINGS,
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
import { POL_SOLVED } from '../cove-quests';
import type { HintTier, Puzzle, PuzzleHost } from './types';

export const CRANE_ID = 'P0.2';
const QUEST = 'Q0.7';

/**
 * P0.2 The Dry-Run Crane (POC §4.5): turn the capstan (E) to aim the crane at a berth, pull
 * Dry-Run to preview (ghost crates land and the sign shows `Repository:`), and pull `--yes` once
 * the preview shows your own fork. Real crates stock your ship, the stores board ticks, and the
 * "Setup complete." banner unfurls. Guards teach rather than fail: Pol stops a `--yes` without a
 * preview, the script refuses a repository you don't own, and the quay isn't a repository at all.
 */
export function createCrane(host: PuzzleHost, site: CraneSite): Puzzle {
  const saved = host.learn?.progress.data.puzzles[CRANE_ID];
  let state: CraneState = restoreCrane(saved?.state, saved?.solved ?? false);
  let hintOn = false;
  let running = false;

  const started = () => {
    const q = host.quests()[QUEST];
    return q === 'crane' || q === 'solved' || q === 'done';
  };
  const save = () =>
    host.learn?.progress.setPuzzle(CRANE_ID, { solved: state.complete, state: saveCrane(state) });

  /** What the terminal panel shows while you're at the crane: the script's last output. */
  let terminal: string[] = [];
  /** The arm sign and the terminal, after `ev` (or the state alone). */
  const readout = (ev?: CraneEvent) => {
    site.setSign(signLines(state, ev));
    terminal = terminalLines(state, ev);
  };

  // Restore what the harbour looked like.
  site.setFacing(state.facing, true);
  if (state.complete) {
    site.showCrates('real', YOUR_FACING, CRANE_CARGO.length);
    site.setBoard(CRANE_CARGO.length);
    site.setBanner(true, true);
  } else if (state.preview !== null) site.showCrates('ghost', state.preview, CRANE_CARGO.length);
  readout();
  if (state.complete && host.quests()[QUEST] === 'crane') host.setQuest(QUEST, 'solved');

  const spots = site.spots();
  const say = (speaker: string, line: string, s = 4.5) => host.hud.showText(speaker, line, s);
  const canUse = () => host.canAct() && started() && !state.complete && !running;

  host.interactions.add({
    id: 'crane:capstan',
    label: () => 'Turn the capstan',
    x: spots.capstan.x,
    y: spots.capstan.y,
    z: spots.capstan.z,
    radius: 2.5,
    enabled: () => canUse() && !site.busy,
    onInteract: () => turn(),
  });
  host.interactions.add({
    id: 'crane:dry',
    label: () => 'Pull Dry-Run',
    x: spots.dry.x,
    y: spots.dry.y,
    z: spots.dry.z,
    radius: 1.5,
    enabled: () => canUse(),
    onInteract: () => void preview(),
  });
  host.interactions.add({
    id: 'crane:yes',
    label: () => 'Pull --yes',
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
    const f = CRANE_FACINGS[state.facing]!;
    host.hud.toast(
      f.berth ? `The crane swings to Berth ${f.berth}.` : 'The crane swings back over the quay.',
      2.5,
    );
  }

  async function preview(): Promise<void> {
    if (site.busy) {
      say('Pim', 'Let her finish swinging first, Captain.', 3);
      return;
    }
    site.pullLever('dry');
    host.audio?.sfx.oneShot('lever', spots.dry, 0.9);
    const step = dryRun(state);
    state = step.state;
    save();
    const ev = step.event;
    if (ev.kind === 'not-a-repo') {
      site.clearCrates('ghost');
      readout(ev);
      say(
        'Pim',
        'Nothing to preview over the quay. The script only runs from the root of a cloned Git repository.',
      );
      return;
    }
    if (ev.kind !== 'preview') return;
    running = true;
    site.setSign(['Repository: …', '[dry-run] would create…']);
    terminal = [`${SETUP_COMMAND} --dry-run`, 'Checking the repository…'];
    say('Pim', 'Wait for the preview to finish, then check the Repository line.', 3.5);
    await site.drop('ghost', ev.facing, () => host.audio?.sfx.oneShot('crate_thud', spots.capstan, 0.25));
    running = false;
    readout();
    if (ev.owner === 'you')
      say('Pim', `Repository: ${ev.repository}. That’s your fork. Now you can pull --yes.`, 5);
    else if (ev.owner === 'captain')
      say('Pim', `Repository: ${ev.repository}. That’s M. Reyes’s fork, not yours. Turn the capstan.`, 5);
    else say('Pim', `Repository: ${ev.repository}. That one belongs to an organization, Captain.`, 5);
  }

  async function confirm(): Promise<void> {
    if (site.busy) {
      say('Pim', 'Wait for the preview to finish, then check the Repository line.', 3.5);
      return;
    }
    site.pullLever('yes');
    host.audio?.sfx.oneShot('lever', spots.yes, 0.9);
    const step = confirmYes(state);
    const ev = step.event;
    state = step.state;
    switch (ev.kind) {
      case 'not-a-repo':
        readout(ev);
        say('Pol', 'That’s the quay! Run it from the root of a cloned Git repository.');
        return;
      case 'preview-first':
        clearHint();
        say('Pol', 'Preview first, always! Pull Dry-Run and check the Repository line.');
        return;
      case 'refused':
        await refused(ev);
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
        ? [{ say: 'pol.refuse.guild.01' }, { say: 'pim.refuse.guild.01' }, { say: 'pol.refuse.guild.02' }]
        : [{ say: 'pol.refuse.captain.01' }],
      'Pol',
    );
    running = false;
    site.setSign(signLines(state)); // The terminal keeps the refusal.
  }

  async function complete(): Promise<void> {
    running = true;
    clearHint();
    site.clearCrates('ghost');
    site.setSign([`Repository: ${CRANE_FACINGS[YOUR_FACING]!.repository}`, 'Creating practice items…']);
    terminal = [
      `${SETUP_COMMAND} --yes`,
      `Repository: ${CRANE_FACINGS[YOUR_FACING]!.repository}`,
      'Creating practice items…',
    ];
    await site.drop('real', YOUR_FACING, (k) => {
      host.audio?.sfx.oneShot('crate_thud', spots.capstan, 0.9);
      site.setBoard(k + 1);
      const c = CRANE_CARGO[k]!;
      host.hud.toast(`${c.title} ×${c.count} stowed.`, 1.6);
    });
    readout();
    site.setBanner(true);
    save();
    host.setQuest(QUEST, 'solved');
    running = false;
    await new Promise((r) => setTimeout(r, 900));
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    const ok = await host.beat(POL_SOLVED, 'Pol');
    if (!ok) host.hud.toast('Talk to Pol to finish up at the crane.', 3.5);
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
        if (tier === 1) return 'What does the sign say? Pull Dry-Run and read the Repository line.';
        if (tier === 2) {
          hintOn = true;
          site.setHint(true);
          return 'Turn the capstan until the crane points at your own ship, Berth 1.';
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
        return 'I’ve swung her round to your ship. Now preview it with Dry-Run.';
      }
      if (state.preview !== state.facing) {
        if (tier === 1)
          return 'She’s aimed at your ship. What does a dry run show before you change anything?';
        if (tier === 2) return 'Pull the Dry-Run lever, the pale blue one on the left.';
        void preview();
        return 'There’s your preview. Check the Repository line.';
      }
      if (tier === 1) return 'The Repository line shows your fork. What runs it for real?';
      if (tier === 2) return 'Pull the red --yes lever on the right.';
      void confirm();
      return 'Pulled it for you. Watch the hold fill.';
    },
    update() {
      // The site animates itself; this just shows the terminal while you're at the crane.
      const show = started() && host.quests()[QUEST] !== 'done' && near(9);
      host.hud.setTerminal(
        show ? terminal.map((text) => ({ text, tone: lineTone(text) })) : null,
        'Terminal · copilot-app-for-beginners',
      );
    },
    debug: {
      state: () => ({ ...state, busy: site.busy, running }),
      turn: () => turn(),
      dry: () => preview(),
      yes: () => confirm(),
      solve: async () => {
        if (state.complete) return;
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
      host.hud.setTerminal(null);
      host.interactions.remove('crane:capstan');
      host.interactions.remove('crane:dry');
      host.interactions.remove('crane:yes');
    },
  };
}
