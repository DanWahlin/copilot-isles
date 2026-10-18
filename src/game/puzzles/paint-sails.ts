import type { LearnState } from '../../learn/store';
import { DEFAULT_SAIL_PALETTE } from '../../world/ship/sail-palettes';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, puzzleQuest, textOf } from '../../course/puzzles';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const PAINT_SAILS_ID = 'palette';

/** What the puzzle needs from the palette stand site. */
export interface PaintSailsStand {
  readonly spot: { x: number; y: number; z: number; heading: number };
  setPalette(id: string): void;
  setHint(on: boolean): void;
}

/** `puzzles/palette.json`: a ceremony, its scripts and words. */
interface PaletteFile extends PuzzleFile {
  scripts: {
    /** Finish on the stand the first time: Nell sends you on. */
    finished: readonly ScriptStep[];
    /** For saves from before the New view moved: Nell shows it, if that page isn't in the Logbook yet. */
    newViewLate: readonly ScriptStep[];
  };
  /** The page `newViewLate` shows: a save without it in the Logbook hears that script first. */
  latePage?: string;
}
const content = () => puzzleContent<PaletteFile>('palette');
const T = (key: string) => textOf(content(), key);

/**
 * Paint Your Sails (POC §4.4, Q0.2): the palette stand beside Nell's door. The app's theme lives in
 * Settings → Themes; here, it's your sails. Pick a palette (it previews on the stand's sample sail and
 * on your ship), then select Finish. The first time, during Q0.2, Nell sends you on to Ezra. The stand
 * stays open for repainting afterwards, and so does Settings → Your sails. Its scripts and words are
 * the course pack's (`puzzles/palette.json`).
 */
export function createPaintSails(
  host: PuzzleHost,
  stand: PaintSailsStand,
  ship: { setSails(id: string | null): void },
): Puzzle {
  let running = false;
  let hinted = false;
  let wasActive = false;
  let shown = '';

  const quest = puzzleQuest('palette');
  const active = () => host.quests()[quest] === 'palette';
  const setHint = (on: boolean) => {
    hinted = on;
    stand.setHint(on);
  };

  // The sails and the stand's sample sail follow the picker's preview, else the saved palette.
  const paint = (s: LearnState | null) => {
    const id = s?.palette?.selected ?? s?.sails ?? DEFAULT_SAIL_PALETTE;
    if (id === shown) return;
    shown = id;
    ship.setSails(id);
    stand.setPalette(id);
  };
  const unsubscribe = host.learn?.subscribe(paint);
  paint(host.learn?.getState() ?? null);

  host.interactions.add({
    id: 'palette:stand',
    label: () => (active() ? T('paint') : T('repaint')),
    x: stand.spot.x,
    y: stand.spot.y,
    z: stand.spot.z,
    radius: 1.9,
    enabled: () => host.canAct() && !!host.learn && !running,
    onInteract: () => void open(),
  });

  async function open(): Promise<void> {
    const learn = host.learn;
    if (!learn || running) return;
    running = true;
    const first = active();
    host.audio?.sfx.oneShot('step_wood', stand.spot, 0.6);
    const picked = await learn.openPalette(learn.getState().sails ?? DEFAULT_SAIL_PALETTE);
    if (picked) {
      host.audio?.sfx.oneShot('chime_solve', undefined, 0.6);
      if (first) {
        setHint(false);
        const page = content().latePage;
        const late = !!page && !learn.getState().pages.includes(page);
        await host.beat(
          late
            ? [...content().scripts.newViewLate, ...content().scripts.finished]
            : content().scripts.finished,
          'Nell',
        );
      } else host.hud.toast(T('repainted'), 2.2);
    }
    running = false;
  }

  const near = (r = 7) => Math.hypot(host.player.x - stand.spot.x, host.player.z - stand.spot.z) < r;

  return {
    id: PAINT_SAILS_ID,
    engaged: () => active() && near(),
    hintKey: () => (hinted ? 'lit' : '-'),
    hint(tier: HintTier) {
      if (!active()) return null;
      if (tier === 1) return T('hint1');
      if (tier === 2) {
        setHint(true);
        return T('hint2');
      }
      if (running || !near(4)) {
        setHint(true);
        return T('hint3Walk');
      }
      void open();
      return T('hint3');
    },
    update() {
      const on = active();
      if (on !== wasActive) {
        wasActive = on;
        setHint(on);
      }
    },
    debug: {
      state: () => ({
        quest: host.quests()[quest] ?? null,
        running,
        hinted,
        shown,
        open: !!host.learn?.getState().palette,
      }),
      open: () => open(),
      spot: () => ({ ...stand.spot }),
    },
    dispose() {
      unsubscribe?.();
      host.interactions.remove('palette:stand');
    },
  };
}
