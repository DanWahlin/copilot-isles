import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordsAlcovesSite } from '../../world/sites/records-alcoves';
import { createLostLetters, type LettersHost } from './lost-letters';

vi.mock('../../ui/puzzles/LostLetters', () => ({ mountLostLetters: () => () => undefined }));

/** A standard-mapping pad whose buttons the test presses. */
function fakePad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0] } as unknown as Gamepad;
  return {
    pad,
    set(i: number, down: boolean) {
      buttons[i]!.pressed = down;
      buttons[i]!.value = down ? 1 : 0;
    },
  };
}

function setup() {
  const learn = {
    busy: false,
    progress: { data: { puzzles: {} }, setPuzzle: vi.fn() },
  };
  let desk: { onInteract(): void } | null = null;
  const host = {
    learn,
    hud: { toast: vi.fn() },
    dialogue: { say: vi.fn(async () => undefined), play: vi.fn(async () => undefined) },
    audio: null,
    interactions: {
      add: (i: { onInteract(): void }) => (desk = i),
      remove: vi.fn(),
    },
    player: { x: 0, y: 0, z: 0, heading: 0 },
    quests: () => ({ 'Q1.7': 'letters' }),
    setQuest: vi.fn(),
    canAct: () => true,
    beat: vi.fn(async () => true),
    frame: vi.fn(),
    cut: vi.fn(),
    setModal: vi.fn(),
    reducedMotion: () => true,
    place: vi.fn(),
  } as unknown as LettersHost;
  const site = {
    desk: { x: 0, y: 0, z: 0, heading: 0 },
    deskTop: { x: 0, z: 0 },
    shot: {},
    setFiled: vi.fn(),
  } as unknown as RecordsAlcovesSite;
  const puzzle = createLostLetters(host, site);
  const state = () => puzzle.debug.state!() as { index: number; misses: number; open: boolean };
  const tries = () => state().index + state().misses;
  return { learn, puzzle, state, tries, interact: () => desk!.onInteract() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('The Lost Letters gamepad (P1.3)', () => {
  const g = fakePad();
  beforeEach(() => {
    for (let i = 0; i < 17; i++) g.set(i, false);
    vi.stubGlobal('navigator', { getGamepads: () => [g.pad] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('doesn’t file a letter with the A that opened the bundle, and files one with the next A', async () => {
    const { puzzle, state, tries, interact } = setup();
    g.set(0, true);
    interact();
    await flush();
    expect(state().open).toBe(true);
    // A is still down for a few frames after the press that opened the bundle.
    for (let f = 0; f < 4; f++) puzzle.update(1 / 60, 0);
    expect(tries()).toBe(0);
    g.set(0, false);
    puzzle.update(1 / 60, 0);
    expect(tries()).toBe(0);
    g.set(0, true);
    puzzle.update(1 / 60, 0);
    expect(tries()).toBe(1);
  });

  it('leaves the pad to the Logbook while it’s open, and a held A isn’t a press when it closes', async () => {
    const { learn, puzzle, state, tries, interact } = setup();
    interact();
    await flush();
    puzzle.update(1 / 60, 0);
    learn.busy = true;
    g.set(0, true);
    puzzle.update(1 / 60, 0);
    g.set(1, true);
    puzzle.update(1 / 60, 0);
    expect(tries()).toBe(0);
    expect(state().open).toBe(true);
    learn.busy = false;
    puzzle.update(1 / 60, 0);
    expect(tries()).toBe(0);
    expect(state().open).toBe(true);
  });
});
