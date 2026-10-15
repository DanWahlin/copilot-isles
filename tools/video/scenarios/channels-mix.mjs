// Channel Routing's mix, then the clean run (Fen, Thousand-Bough), for a highlight: Fen's demo and
// round 1 played as in `channels`, then in round 2 (all three crews live) Feature's elbow is turned
// back the way it started, so Feature's water runs east into Bug Fix's channel; the gates open and
// the colours mix. Then every gate is routed by real input and the run goes clean: each crew's water
// turns its own wheel.
import { tb } from '../game.mjs';
import channels, { playRound } from './p2-1-channels.mjs';

/** Moves the board's cursor to (row, col) with the arrow keys. */
async function cursorTo(api, row, col) {
  const st = await tb(api, 'routing.state');
  const [r0, c0] = st.cursor ?? [0, 1];
  for (let i = 0; i < Math.abs(row - r0); i++) {
    await api.page.keyboard.press(row > r0 ? 'ArrowDown' : 'ArrowUp');
    await api.pause(240);
  }
  for (let i = 0; i < Math.abs(col - c0); i++) {
    await api.page.keyboard.press(col > c0 ? 'ArrowRight' : 'ArrowLeft');
    await api.pause(240);
  }
}

export default {
  ...channels,
  id: 'channels-mix',
  order: 15,
  title: 'Channel Routing: Mixed, then Clean',
  subtitle:
    'Parallel sessions: run the crews in one channel and their work mixes; give each its own worktree and it never does.',

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    await api.waitFor(() => !!document.querySelector('.ci-cr-grid'), null, 120_000);
    await playRound(api, 1);
    // Round 2: Feature's elbow (row 1, column 2) one turn on, back to where it started.
    const open = await api.waitFor(
      () => document.querySelector('.ci-cr-eyebrow')?.textContent?.includes('Round 2'),
      null,
      90_000,
    );
    if (!open) throw new Error('the Gate Board never showed round 2');
    await api.waitFor(() => !document.querySelector('.ci-cr-go')?.disabled, null, 60_000);
    await api.pause(1800);
    await cursorTo(api, 0, 1);
    await api.pause(300);
    await api.press('KeyE');
    await api.pause(900);
    api.mark('round 2 run unrouted');
    await api.press('KeyF');
    await api.waitFor(
      () => !/gates are open/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''),
      null,
      30_000,
    );
    const msg = await api.S(() => document.querySelector('.ci-cr-message')?.textContent ?? '');
    api.mark('round 2 mixed');
    api.log(`round 2 unrouted: "${msg}"`);
    await api.pause(3500);
    await api.waitFor(() => !document.querySelector('.ci-cr-go')?.disabled, null, 30_000);
    await api.pause(600);
    await playRound(api, 2);
    await api.pause(3000);
  },
};
