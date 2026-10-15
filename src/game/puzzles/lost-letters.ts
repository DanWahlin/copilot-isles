import type { RecordsAlcovesSite, RecordsShot } from '../../world/sites/records-alcoves';
import { createViewStore } from './channel-routing/view';
import type { LostLettersStore, LostLettersView } from '../../ui/puzzles/LostLetters';
import { PELL_LETTERS_DEBRIEF, PELL_SOLVED } from '../meridian-quests';
import { DESTINATIONS, HallLetters, LETTERS, destinationName, type Destination } from './hall-letters';
import { PadEdges, standardPad } from './pad-edges';
import type { HintTier, Puzzle, PuzzleHost } from './types';

const ID = 'P1.3';
const QUEST = 'Q1.7';

/** What the Lost Letters needs beyond a puzzle's host: the camera, and the keys while it's open. */
export interface LettersHost extends PuzzleHost {
  frame(shot: RecordsShot | null): void;
  cut(shot: RecordsShot): void;
  /** The overlay has the keys, the pad and Esc; you don't walk while it's open. */
  setModal(on: boolean): void;
  reducedMotion(): boolean;
  /** Puts the walker at the desk (so they don't stand in the shot), facing the cabinets. */
  place(x: number, z: number, heading: number): void;
}

const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1');
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * P1.3 The Lost Letters (Pell, Q1.7): press E at Pell's desk to open the bundle. Each letter goes in
 * the cubby for the Settings area that fixes it, or back in Pell's tray if it isn't a Settings job.
 * A wrong filing hands it back with Pell's cited reason. Filed letters show in the cabinets, and the
 * place you've reached is saved. A save that finished Pell before the letters existed can file them
 * for practice (the quest stays done).
 */
export function createLostLetters(host: LettersHost, site: RecordsAlcovesSite): Puzzle {
  const saved = host.learn?.progress.data.puzzles[ID];
  let solved = saved?.solved ?? false;
  const letters = new HallLetters(solved ? LETTERS.length : (saved?.state?.[0] ?? 0));
  let okSaid = false;
  let open = false;
  const pad = new PadEdges();

  const view = createViewStore<LostLettersView>({
    open: false,
    step: 0,
    of: LETTERS.length,
    letter: null,
    message: null,
    focus: 0,
    hint: -1,
    busy: false,
    reduced: false,
  });
  let unmount: (() => void) | null = null;

  const q = () => host.quests()[QUEST];
  const started = () => q() === 'letters' || q() === 'solved' || q() === 'done';
  /** Open to sort: the quest's at the letters, or an older save finished Pell without them. */
  const available = () => !solved && (q() === 'letters' || q() === 'done');
  const save = () => host.learn?.progress.setPuzzle(ID, { solved, state: [letters.index] });
  const letterView = () => {
    const l = letters.letter;
    return l ? { from: l.from, text: l.text } : null;
  };

  site.setFiled(letters.index);
  if (solved && q() === 'letters') host.setQuest(QUEST, 'solved');

  host.interactions.add({
    id: 'letters:desk',
    label: () => (letters.index > 0 ? 'Sort the rest of Pell’s letters' : 'Sort Pell’s letters'),
    x: site.deskTop.x,
    y: site.desk.y,
    z: site.deskTop.z,
    radius: 2.4,
    // Pell stands beside the desk: at the desk, the letters win the E.
    bias: -1,
    enabled: () => host.canAct() && available() && !open,
    onInteract: () => void openBundle(),
  });

  async function openBundle(): Promise<void> {
    if (open || !available()) return;
    open = true;
    // The A that opened the bundle is still down: it mustn't also file the first letter.
    pad.arm();
    if (!unmount) {
      const { mountLostLetters } = await import('../../ui/puzzles/LostLetters');
      const store: LostLettersStore = {
        get: view.get,
        subscribe: view.subscribe,
        file: (d) => void file(d),
        focus: (i) => view.set({ focus: i }),
        close: () => close(),
        blocked: () => !!host.learn?.busy,
      };
      unmount = mountLostLetters(store);
    }
    host.setModal(true);
    host.place(site.desk.x, site.desk.z, site.desk.heading);
    if (host.reducedMotion()) host.cut(site.shot);
    else host.frame(site.shot);
    view.set({
      open: true,
      step: letters.index,
      letter: letterView(),
      message: null,
      busy: false,
      reduced: host.reducedMotion(),
    });
  }

  function close(): void {
    if (!open || view.get().busy) return;
    open = false;
    view.set({ open: false, message: null });
    host.frame(null);
    host.setModal(false);
  }

  async function file(d: Destination): Promise<void> {
    if (!open || view.get().busy || !letters.letter) return;
    const r = letters.file(d);
    const at = { x: site.desk.x, y: site.desk.y + 1, z: site.desk.z };
    view.set({ busy: true, focus: DESTINATIONS.indexOf(d), hint: -1 });
    if (!r.ok) {
      host.audio?.sfx.oneShot('crate_thud', at, 0.3);
      view.set({ message: { text: r.reason, tone: 'bad', cite: r.cite.section } });
      await host.dialogue.say('Pell', plain(r.reason));
      view.set({ busy: false });
      return;
    }
    host.audio?.sfx.oneShot('quill', at, 0.8);
    site.setFiled(letters.index);
    save();
    const filed =
      d === 'tray' ? 'Back in Pell’s tray: not a Settings job.' : `Filed in **${destinationName(d)}**.`;
    view.set({ message: { text: filed, tone: 'good', cite: r.letter.ok ? r.letter.cite.section : null } });
    if (r.letter.ok) await host.dialogue.play([r.letter.ok]);
    else if (!okSaid && !r.done) {
      okSaid = true;
      await host.dialogue.play(['mer.pell.letter.ok']);
    } else await wait(host.reducedMotion() ? 300 : 800);
    if (r.done) {
      await onSolved();
      return;
    }
    view.set({ step: letters.index, letter: letterView(), message: null, busy: false });
  }

  async function onSolved(): Promise<void> {
    solved = true;
    save();
    host.audio?.sfx.oneShot('chime_solve', undefined, 0.8);
    await wait(host.reducedMotion() ? 200 : 600);
    view.set({ busy: false });
    close();
    if (q() === 'done') {
      await host.beat(PELL_LETTERS_DEBRIEF, 'Pell');
      return;
    }
    host.setQuest(QUEST, 'solved');
    const ok = await host.beat(PELL_SOLVED, 'Pell');
    if (!ok) host.hud.toast('Talk to Pell to finish up in the Hall of Records.', 3.5);
  }

  /** Wingman's third hint, or a test: files the letter in hand where it belongs. */
  function fileForYou(): void {
    const l = letters.letter;
    if (!l) return;
    if (open) {
      void file(l.answer);
      return;
    }
    const r = letters.file(l.answer);
    site.setFiled(letters.index);
    save();
    if (r.ok && r.done) void onSolved();
  }

  function pollPad(): void {
    const p = standardPad();
    // While a learning overlay (the Logbook, the fork form) is up, it has the pad.
    if (!p || !pad.look(p, !!host.learn?.busy)) return;
    const v = view.get();
    const n = DESTINATIONS.length;
    if (pad.edge(p, 13) || pad.edge(p, 15)) view.set({ focus: (v.focus + 1) % n });
    if (pad.edge(p, 12) || pad.edge(p, 14)) view.set({ focus: (v.focus + n - 1) % n });
    if (pad.edge(p, 0) && !v.busy) void file(DESTINATIONS[view.get().focus]!);
    if (pad.edge(p, 1)) close();
  }

  const near = () => Math.hypot(host.player.x - site.deskTop.x, host.player.z - site.deskTop.z) < 6;

  return {
    id: ID,
    engaged: () => available() && near(),
    hintKey: () => `${letters.index}`,
    hint(tier: HintTier) {
      if (!started() || !available()) return null;
      if (tier === 1)
        return 'Read the letter for what the captain’s trying to do, Captain. Then think where that lives in Settings.';
      if (tier === 2) {
        view.set({ hint: DESTINATIONS.indexOf(letters.letter!.answer) });
        return 'I’ve marked the right spot for this letter. Open the bundle and look for the glow.';
      }
      fileForYou();
      return 'There, I’ve filed one for you. Keep going!';
    },
    update() {
      if (open) pollPad();
    },
    debug: {
      state: () => ({ index: letters.index, misses: letters.misses, solved, open, view: view.get() }),
      open: () => openBundle(),
      file: (d: Destination) => file(d),
      solve: () => {
        if (open) {
          view.set({ busy: false });
          close();
        }
        while (letters.letter && !solved) fileForYou();
      },
      close: () => close(),
      desk: () => ({ ...site.desk }),
    },
    dispose() {
      host.interactions.remove('letters:desk');
      if (open) {
        host.frame(null);
        host.setModal(false);
      }
      unmount?.();
    },
  };
}
