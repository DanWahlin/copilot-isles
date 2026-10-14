// Sea battle 1 (the passage from Anchorage Cay to Port Meridian): out of Anchorage under sail until
// the lookout calls sails, the briefing, then both waves fought with the real controls (R brings
// her round, Space fires when a battery bears). The bosun's question after wave 1 is answered wrong
// (no reward, but the crew patches the hull), wave 2's right (a reward picked), and the win card.
// Long stretches of manoeuvring are trimmed (a fade covers each cut).
import { skipTalk } from '../lib.mjs';

const snap = (api) =>
  api.S(
    () =>
      window.__dev
        .session()
        .debug.battleRun()
        ?.battle.snapshot({ bears: [0, 0], stores: {} }) ?? null,
  );

async function waitPhase(api, phases, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await snap(api);
    if (s && phases.includes(s.phase)) return s;
    await api.pause(200);
  }
  return snap(api);
}

/** Steers for (x, z) with A/D under full sail until `done()` or `ms` runs out. */
async function sailToward(api, x, z, ms, done) {
  await api.hold('KeyW', 2500);
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms) {
    if (await done()) break;
    const st = await api.S(() => window.__dev.state().ship);
    const want = Math.atan2(x - st.x, z - st.z);
    const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
    const next = Math.abs(d) < 0.08 ? null : d > 0 ? 'KeyA' : 'KeyD';
    if (next !== key) {
      if (key) await api.page.keyboard.up(key);
      if (next) await api.page.keyboard.down(next);
      key = next;
    }
    await api.pause(150);
  }
  if (key) await api.page.keyboard.up(key);
}

export default {
  id: 'battle1',
  order: 8,
  code: 'Sea battle 1',
  title: 'Raiders on the Passage',
  island: 'Anchorage Cay → Port Meridian',
  who: 'your brigantine against the raiders',
  subtitle:
    'Two waves of raiders between the islands. Bring her round, fire when a battery bears, and answer the bosun’s question between waves.',
  chapter: 'Questions from Course Chapter 00 · Setup',
  flags: [],
  titleFrame: 12,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    // The Seal of Anchorage (Chapter 00 done), aboard, and out near the harbour mouth.
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11'])
        d.quest(q, 'done');
    });
    await skipTalk(page, 15_000);
    await api.S(() => window.__dev.session().debug.board());
    await page.waitForFunction(() => window.__dev.state().mode === 'sail', null, { timeout: 20_000 });
    await page.waitForFunction(() => !!window.__dev.session().debug.battleRun(), null, { timeout: 60_000 });
    await api.S(() => window.__dev.session().debug.sailTo(215, -360, 2.2));
    await api.pause(3000);
  },

  async play(page, api) {
    // Under sail toward Port Meridian until the lookout calls sails.
    const started = () => api.S(() => !!window.__dev.session().debug.battleRun()?.started);
    await api.cutWhile(() => sailToward(api, 747, -700, 120_000, started), { head: 9000, tail: 2500 });
    if (!(await started())) throw new Error('no lookout call on the passage');
    await api.pause(900);
    if (await api.S(() => !!document.querySelector('.bh-brief'))) {
      await api.pause(5500);
      await api.press('Enter');
    }
    await api.pause(4000);
    // Gentle seas (no break-off), as tools/battletest.mjs plays it.
    await api.S(() => window.__dev.session().debug.battleRun().battle.setCalm(true));

    const quiz = (wave) =>
      api.S(async (wi) => {
        const run = window.__dev.session().debug.battleRun();
        const { QUIZZES } = await import('/src/learn/content/index.ts');
        const q = QUIZZES.get(run.plan.waves[wi].quiz);
        return q ? q.options.findIndex((o) => o.id === q.answer) : -1;
      }, wave);

    for (let wave = 0; wave < 2; wave++) {
      await waitPhase(api, ['fight']);
      await api.pause(600);
      await api.press('KeyR');
      // The fight: keep her round and fire whenever a battery bears. The middle of a long fight
      // is trimmed; its first broadsides and the strike stay.
      await api.cutWhile(
        async () => {
          const t0 = Date.now();
          while (Date.now() - t0 < 240_000) {
            const s = await snap(api);
            if (!s || s.phase !== 'fight') break;
            if (!s.assist) await api.press('KeyR');
            if (s.bears[0] || s.bears[1]) {
              await api.press('Space');
              await api.pause(1300);
            } else await api.pause(350);
          }
        },
        { head: 28_000, tail: 14_000 },
      );
      await waitPhase(api, ['question'], 40_000);
      // The bosun's question: read it, then answer with the mouse (wave 1 wrong, wave 2 right).
      await api.pause(4500);
      const right = await quiz(wave);
      const n = await api.S(() => document.querySelectorAll('.bh-options .bh-choice').length);
      const pick = wave === 0 ? (right + 1) % n : right;
      await api.click(`.bh-options .bh-choice:nth-child(${pick + 1})`);
      await api.pause(5500);
      // Wave 1: "Make repairs and sail on". Wave 2: quick repairs.
      await api.click(wave === 0 ? '.bh-picks .bh-choice' : '.bh-picks .bh-choice:nth-of-type(2)');
      await api.pause(1500);
    }
    const won = await waitPhase(api, ['won'], 60_000);
    if (won?.phase !== 'won') api.log(`the battle ended ${won?.phase}`);
    await api.pause(7000);
  },
};
