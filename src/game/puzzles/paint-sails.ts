import type { LearnState } from '../../learn/store';
import { DEFAULT_SAIL_PALETTE } from '../../world/ship/sail-palettes';
import type { ScriptStep } from '../script';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const PAINT_SAILS_ID = 'Q0.2.palette';
const QUEST = 'Q0.2';

/** What the puzzle needs from the palette stand site. */
export interface PaintSailsStand {
  readonly spot: { x: number; y: number; z: number; heading: number };
  setPalette(id: string): void;
  setHint(on: boolean): void;
}

/** Finish on the theme step: the New page in the spyglass and its Logbook page, then on to Ezra. */
const PALETTE_FINISHED: readonly ScriptStep[] = [
  {
    show: 'shared/github-copilot-app',
    caption: 'Select **Finish**, and the **New** page opens. New work starts here.',
  },
  { say: 'nell.settings.01' },
  { hide: true },
  { page: 'C0.3', doubloons: 20 },
  { say: 'nell.palette.02' },
  { quest: QUEST, step: 'done' },
  { quest: 'Q0.3', step: 'start' },
];

/**
 * Paint Your Sails (POC §4.4, Q0.2): the palette stand beside Nell's door mirrors the app's theme
 * step. Pick a palette (it previews on the stand's sample sail and on your ship), then select
 * Finish. The first time, during Q0.2, that shows the New page (C0.3). The stand
 * stays open for repainting afterwards, and so does Settings → Your sails.
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

  const active = () => host.quests()[QUEST] === 'palette';
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
    label: () => (active() ? 'Paint your sails' : 'Repaint your sails'),
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
        await host.beat(PALETTE_FINISHED, 'Nell');
      } else host.hud.toast('Sails repainted.', 2.2);
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
      if (tier === 1) return 'The palette stand’s by Nell’s door. Any theme will do, it’s your ship.';
      if (tier === 2) {
        setHint(true);
        return 'See the sparkle by Nell’s door? Pick a palette there, then select Finish.';
      }
      if (running || !near(4)) {
        setHint(true);
        return 'Walk up to the sparkling stand and press E.';
      }
      void open();
      return 'I’ve opened the palette stand for you. Pick one and select Finish.';
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
        quest: host.quests()[QUEST] ?? null,
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
