// P2.1 Channel Routing (Fen, Thousand-Bough): Fen's demo of the shared trough, then the Gate Board
// played with the keyboard (arrows move, E turns a gate, F runs the water) and once with the mouse.
// Round 1 is run before it's routed (the crews' water mixes), then fixed; rounds 2 and 3 go clean.
import { questsDone, tb, thousandBoughAshore } from '../game.mjs';

/** Waits for a round's board, routes every wrong gate by real input, and runs the water. */
export async function playRound(api, round, { wrongFirst = false, click = false } = {}) {
  const page = api.page;
  const open = await api.waitFor(
    (r) => document.querySelector('.ci-cr-eyebrow')?.textContent?.includes(`Round ${r}`),
    round,
    90_000,
  );
  if (!open) throw new Error(`the Gate Board never showed round ${round}`);
  await api.waitFor(() => !document.querySelector('.ci-cr-go')?.disabled, null, 60_000);
  await api.pause(2200);
  if (wrongFirst) {
    // Run it as it stands: the water mixes (or stops short) and Fen says why.
    await api.press('KeyF');
    await api.waitFor(
      () => !/gates are open/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''),
      null,
      30_000,
    );
    await api.pause(3500);
    await api.waitFor(() => !document.querySelector('.ci-cr-go')?.disabled, null, 30_000);
    await api.pause(800);
  }
  let clicked = !click;
  for (let guard = 0; guard < 60; guard++) {
    const wrong = await tb(api, 'routing.wrong');
    if (!wrong) break;
    if (!clicked) {
      clicked = true;
      await api.click(`.ci-cr-tile[data-cell="${wrong[0]},${wrong[1]}"]`);
      await api.pause(650);
      continue;
    }
    const st = await tb(api, 'routing.state');
    const [r0, c0] = st.cursor ?? [0, 1];
    for (let i = 0; i < Math.abs(wrong[0] - r0); i++) {
      await page.keyboard.press(wrong[0] > r0 ? 'ArrowDown' : 'ArrowUp');
      await api.pause(240);
    }
    for (let i = 0; i < Math.abs(wrong[1] - c0); i++) {
      await page.keyboard.press(wrong[1] > c0 ? 'ArrowRight' : 'ArrowLeft');
      await api.pause(240);
    }
    await api.pause(200);
    await page.keyboard.press('KeyE');
    await api.pause(550);
  }
  await api.pause(900);
  await api.press('KeyF');
  await api.waitFor(
    () => !/gates are open/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''),
    null,
    30_000,
  );
  const msg = await api.S(() => document.querySelector('.ci-cr-message')?.textContent ?? '');
  if (!/wheel/.test(msg)) api.log(`round ${round} didn't solve: "${msg}"`);
}

export default {
  id: 'channels',
  order: 5,
  code: 'P2.1',
  title: 'Channel Routing',
  island: 'Thousand-Bough Isle',
  who: 'with Fen at the Flume Gallery',
  subtitle:
    'Parallel sessions: each crew works in its own worktree, so their changes never mix. Route three crews’ water to their own wheels.',
  chapter: 'Course Chapter 02 · Why the app uses worktrees · Parallel sessions',
  flags: ['thousandbough'],

  async setup(page, api) {
    await thousandBoughAshore(page, api);
    await questsDone(api, ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4']);
    this.spot = await api.approachSpot('fen', { back: 3 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    // Fen's demo of the shared trough (his lines run on their own), then the board opens.
    await api.waitFor(() => !!document.querySelector('.ci-cr-grid'), null, 120_000);
    await playRound(api, 1, { wrongFirst: true, click: true });
    await playRound(api, 2);
    await playRound(api, 3);
    // The third wheel turns; hold on it until Fen moves on to the Spire.
    await api.pause(1500);
    await api.waitFor(() => !!document.querySelector('.ci-cr-twist'), null, 30_000);
    await api.pause(1200);
  },
};
