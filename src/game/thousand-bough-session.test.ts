import { describe, expect, it, vi } from 'vitest';
import { createChannelRouting, type ChannelRoutingHost } from './puzzles/channel-routing/puzzle';
import type { ChannelRoutingStore } from './puzzles/channel-routing/view';
import { recordingThousandBough } from './thousand-bough-contract.stub';
import { FEN_SOLVED } from './thousand-bough-quests';
import { playSeal, SEAL_SHOT } from './thousand-bough-session';
import type { Interactable } from './interaction';

vi.useFakeTimers();

function fakeHost() {
  const quests: Record<string, string> = { 'Q2.4': 'done', 'Q2.5': 'channels' };
  const said: string[] = [];
  const frames: unknown[] = [];
  const beats: unknown[] = [];
  const interactions = new Map<string, Interactable>();
  let store: ChannelRoutingStore | null = null;
  const modal: boolean[] = [];
  const host: ChannelRoutingHost = {
    learn: null,
    hud: {} as never,
    dialogue: {} as never,
    audio: null,
    interactions: {
      add: (i: Interactable) => void interactions.set(i.id, i),
      remove: (id: string) => void interactions.delete(id),
    } as never,
    player: { x: 0, y: 0, z: 0, heading: 0 },
    quests: () => quests,
    setQuest: (id, step) => void (quests[id] = step),
    canAct: () => true,
    beat: async (steps) => {
      beats.push(steps);
      for (const s of steps) if ('quest' in s) quests[s.quest] = s.step;
      return true;
    },
    frame: (shot) => void frames.push(shot),
    say: async (ids) => void said.push(...ids),
    wingman: (t) => void said.push(`wingman:${t}`),
    project: () => null,
    setModal: (on) => void modal.push(on),
    reducedMotion: () => false,
    closing: FEN_SOLVED,
    mountUi: (s) => {
      store = s;
      return () => (store = null);
    },
  };
  return { host, quests, said, frames, beats, interactions, modal, store: () => store! };
}

/** Lets the puzzle's awaited timers and promises run. */
async function settle(ms = 20000): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(ms / 40);
  }
}

describe('Channel Routing in the session (on the recording stub)', () => {
  it('plays three rounds and the twist through the views, then Fen’s close', async () => {
    const { sys, calls } = recordingThousandBough();
    const h = fakeHost();
    const p = createChannelRouting(h.host, sys);
    expect(h.interactions.has('flume:board')).toBe(true);
    await p.open();
    expect(h.modal).toEqual([true]);
    const store = h.store();
    expect(store.get().open).toBe(true);
    expect(calls.map((c) => `${c.view}.${c.fn}`)).toContain('flume.setRound');

    // A wrong run first: Fen explains it, and the water drains.
    store.actions.openGates();
    await settle();
    expect(h.said).toContain('tb.fen.deadend');
    expect(store.get().message?.tone).toBe('bad');
    expect(calls.some((c) => c.fn === 'runFlows')).toBe(true);

    const solveRound = async () => {
      for (let i = 0; i < 60; i++) {
        const w = p.debug.wrong() as readonly [number, number] | null;
        if (!w) break;
        store.actions.turn(w[0], w[1], 1);
      }
      store.actions.openGates();
      await settle();
    };
    await solveRound();
    expect(h.quests['P2.1']).toBe('r2');
    expect(h.said).toContain('tb.fen.round1');
    await solveRound();
    expect(h.quests['P2.1']).toBe('r3');
    expect(h.said).toEqual(expect.arrayContaining(['tb.fen.round2', 'tb.fen.rain']));
    await solveRound();
    expect(h.quests['Q2.5']).toBe('twist');
    expect(calls.some((c) => c.view === 'spire' && c.fn === 'playJam')).toBe(true);
    expect(store.get().twist?.choices).toHaveLength(4);

    // A wrong answer keeps the question; a right one opens the second bridge and closes the board.
    store.actions.choose('redig');
    await settle();
    expect(h.said).toContain('tb.fen.twist.redig');
    expect(store.get().twist).not.toBeNull();
    store.actions.choose('port5174');
    await settle();
    expect(calls.some((c) => c.view === 'spire' && c.fn === 'openSecondBridge')).toBe(true);
    expect(calls.filter((c) => c.fn === 'preview').map((c) => c.args)).toContainEqual(['docs', 5174, true]);
    expect(h.said).toContain('wingman.tb.ports');
    expect(store.get().open).toBe(false);
    expect(h.modal.at(-1)).toBe(false);
    expect(h.beats).toEqual([FEN_SOLVED]);
    expect(h.quests['Q2.5']).toBe('done');
    p.dispose();
  });

  it('resumes at the saved round, and Esc leaves without losing it', async () => {
    const { sys } = recordingThousandBough();
    const h = fakeHost();
    h.quests['P2.1'] = 'r3';
    const p = createChannelRouting(h.host, sys);
    await p.open();
    expect(h.store().get().round).toBe(3);
    expect(h.store().get().board[2]![2]!.kind).toBe('rock');
    h.store().actions.turn(0, 0, 1);
    h.store().actions.leave();
    expect(h.store().get().open).toBe(false);
    await p.open();
    expect(h.store().get().board[0]![0]!.rot).toBe(1);
  });

  it('gives Wingman’s three hint tiers, the third turning a tile', async () => {
    const { sys } = recordingThousandBough();
    const h = fakeHost();
    const p = createChannelRouting(h.host, sys);
    await p.open();
    const before = p.debug.wrong();
    expect(p.hint(1)).toMatch(/Follow/);
    expect(p.hint(2)).toMatch(/row \d, column \d/);
    expect(h.store().get().pulse).toEqual(before);
    expect(p.hint(3)).toMatch(/I turned row/);
    expect(p.debug.wrong()).not.toEqual(before);
  });
});

describe('The Seal (on the recording stub)', () => {
  it('cuts to the tree, lights the lanterns, starts the Sky Basket, then comes back', async () => {
    const { sys, calls } = recordingThousandBough();
    const log: string[] = [];
    const done = playSeal(
      sys,
      {
        fade: async (on) => void log.push(`fade:${on}`),
        cut: (shot) => void log.push(shot === SEAL_SHOT ? 'cut:H8' : 'cut:?'),
        backToTalk: () => void log.push('back'),
        reducedMotion: () => true,
        audio: null,
        player: { x: 0, y: 0, z: 0 },
      },
      (ms) => new Promise((r) => setTimeout(r, ms)),
    );
    await settle(10000);
    await done;
    expect(log).toEqual(['fade:true', 'cut:H8', 'fade:false', 'fade:true', 'back', 'fade:false']);
    expect(calls.map((c) => `${c.fn}:${JSON.stringify(c.args)}`)).toEqual([
      'sealCascade:[true]',
      'skyBasketEnabled:[true]',
    ]);
  });
});
