import { COURSE_REPO, type ForkRef } from '../../learn/fork';
import type { GearRackSite } from '../../world/sites';
import { puzzleQuest, puzzleSteps, textOf } from '../../course/puzzles';
import {
  GEAR_START,
  gearContent,
  gearReadout,
  gearTone,
  runGearCheck,
  signInLines,
  YOUR_HANDLE,
  type GearRun,
} from '../../world/sites/gear-logic';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './types';

const ID = 'gear.rack';
/** Who talks at the rack: its keeper. */
const KEEPER = 'Bo';

/**
 * Bo's gear rack (POC §4.4), a checklist you run yourself. While its quest is at its `checks` step,
 * the first E plays the course's `intro` script (where Terminal is), then each E runs the next check
 * and Terminal prints what it says. A check with a `stale` output prints that first and plays its
 * script (the course's rule for an out-of-date version), and the next run prints the right one. Once
 * every check has passed, GitHub CLI's sign-in joins the readout and the `checked` script plays (it
 * moves the quests on). A check's `notes` show as the keeper's caption on that kind of computer.
 * Before the checks, the rack is scenery; after them, E prints the whole readout again. Its content is
 * the course pack's `puzzles/gear-rack.json`.
 */
export function createGearRack(host: PuzzleHost, site: GearRackSite): Puzzle & { cue(): void } {
  const spots = site.spots();
  const quest = puzzleQuest('gear-rack');
  const S = puzzleSteps('gear-rack');
  const scripts = (): Readonly<Record<string, readonly ScriptStep[]>> => gearContent().scripts ?? {};
  const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(gearContent(), key, v);

  const fork = (): ForkRef | null => host.learn?.progress.data.fork ?? null;
  const handle = () => fork()?.owner ?? YOUR_HANDLE;
  let run: GearRun = GEAR_START;
  let intro = false;
  /** The checks have all passed and GitHub CLI's sign-in is in the readout. */
  let signedIn = false;
  let busy = false;
  /** What E last showed: the checks you're running, or (after them, or the legacy cue) the full readout. */
  let shown: 'run' | 'all' | null = null;

  const atChecks = () => host.quests()[quest] === S.checks;
  const finished = () => host.quests()[quest] === 'done';
  const near = (r: number) => Math.hypot(host.player.x - spots.rack.x, host.player.z - spots.rack.z) < r;
  const checks = () => gearContent().checks;

  const showAll = () => {
    shown = 'all';
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.35);
  };

  async function press(): Promise<void> {
    if (busy) return;
    if (!atChecks()) {
      if (finished()) showAll();
      return;
    }
    shown = 'run';
    if (!intro && scripts().intro) {
      busy = true;
      intro = await host.beat(scripts().intro!, KEEPER);
      busy = false;
      return;
    }
    intro = true;
    if (run.next >= checks().length) {
      await closing();
      return;
    }
    const r = runGearCheck(run, checks());
    run = r.run;
    host.audio?.sfx.oneShot('gear_hang', spots.rack, 0.35);
    const note = r.check?.notes?.[host.learn?.os ?? 'mac'];
    if (note) host.hud.showText(KEEPER, note, 7);
    if (r.stale && r.check?.stale) {
      busy = true;
      const ok = await host.beat(scripts()[r.check.stale.script] ?? [], KEEPER);
      busy = false;
      // Left mid-way (a quiz abandoned): the next run prints the old version again.
      if (!ok) run = { ...run, staleShown: false };
      else host.hud.toast(T('rerun', { command: r.check.command, tool: r.check.tool }), 4.5);
      return;
    }
    if (r.done) await closing();
  }

  /** Every check has passed: GitHub CLI's own sign-in, then the course's closing script. */
  async function closing(): Promise<void> {
    signedIn = true;
    busy = true;
    const ok = await host.beat(scripts().checked ?? [], KEEPER);
    busy = false;
    if (!ok) host.hud.toast(T('finish'), 3.5);
  }

  host.interactions.add({
    id: 'gear:rack',
    label: () => {
      if (!atChecks()) return T('interact');
      if (!intro && scripts().intro) return T('open');
      const c = checks()[run.next];
      return c ? T('run', { name: c.name, command: c.command }) : T('closing');
    },
    x: spots.rack.x,
    y: spots.rack.y,
    z: spots.rack.z,
    radius: 2.2,
    enabled: () => host.canAct() && !busy && (atChecks() || finished()),
    onInteract: () => void press(),
  });

  let painted: { key: string; readout: PuzzleTerminal } | null = null;
  const readout = (): PuzzleTerminal => {
    const f = fork();
    const lines =
      shown === 'all'
        ? gearReadout(handle(), f?.host)
        : [...run.lines, ...(signedIn ? signInLines(handle(), f?.host) : [])];
    const key = `${f?.owner}/${f?.repo}@${f?.host}|${lines.join('\n')}`;
    if (painted?.key !== key)
      painted = {
        key,
        readout: {
          title: T('title', { repo: f?.repo ?? COURSE_REPO }),
          lines: lines.map((text) => ({ text, tone: gearTone(text, handle()) })),
        },
      };
    return painted.readout;
  };

  return {
    id: ID,
    engaged: () => atChecks() && near(8),
    hintKey: () => `${intro}:${run.next}:${run.staleShown}`,
    hint(tier: HintTier) {
      if (!atChecks()) return null;
      if (tier === 1) return T('hint1');
      if (tier === 2) return T('hint2');
      if (busy || !host.canAct()) return null;
      void press();
      return T('hint3');
    },
    cue: showAll,
    terminal(): PuzzleTerminal | null {
      if (!shown) return null;
      if (!near(7)) {
        // Walked off: the checks you've run stay run, but the panel closes.
        shown = null;
        return null;
      }
      return readout();
    },
    update() {},
    debug: {
      state: () => ({
        shown: !!shown,
        mode: shown,
        intro,
        next: run.next,
        staleShown: run.staleShown,
        signedIn,
        busy,
      }),
      run: () => press(),
      spots: () => ({ rack: site.anchors.gearRack ?? { x: spots.rack.x, z: spots.rack.z } }),
    },
    dispose() {
      host.interactions.remove('gear:rack');
    },
  };
}
