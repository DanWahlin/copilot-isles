// "Do this in the app", then Wingman's recap at the next landfall (the learning systems,
// docs/specs/COURSE-PACKS.md §11). At Ezra's chart table the course has you fork the repository and
// add it under Sessions: each step comes as a card with I did it and Later, and the second asks what
// you saw. Then (the voyage cut short) the ship docks at Port Meridian, and once Wingman's welcome is
// over he asks two short questions from Chapter 00, one answered wrong first: no fail state.
import { skipTalk } from '../lib.mjs';
import { labelsShown, questsDone } from '../game.mjs';

const FORK = 'https://github.com/dan-sample/copilot-app-for-beginners';

export default {
  id: 'learning-handoff',
  order: 40,
  code: 'A0.2',
  title: 'Do This in the App',
  island: 'Anchorage Cay → Port Meridian',
  who: 'with Ezra, then Wingman',
  subtitle:
    'The real-app steps come as a card with I did it or Later, and a quick "what did you see?". At the next landfall, Wingman brings back earlier questions.',
  chapter: 'Course Chapter 00 · Connect to Your Repository',
  flags: [],
  cursor: true,
  titleFrame: 4,

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await labelsShown(api);
    await api.S(() => window.__dev.session().debug.quest('Q0.2', 'done'));
    await skipTalk(page, 10_000);
    this.spot = await api.approachSpot('merchant', { back: 3 });
    await api.look(this.spot.heading + 0.25, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      const s = await api.learn();
      if (s.quests['Q0.3'] === 'done' && !s.dialogue && !s.reveal && !s.quiz && !s.appTask) break;
      if (s.appTask) await api.answerCard(s, { readMs: 3600 });
      else if (s.forkForm) {
        await api.waitFor(() => !!document.querySelector('.ci-fork'), null, 5000);
        await api.pause(1000);
        await page.keyboard.type(FORK, { delay: 30 });
        await api.pause(700);
        await api.press('Enter');
        await api.pause(700);
      } else if (s.quiz && !s.quiz.answered) await api.answerQuiz({ readMs: 2200 });
      else if (s.reveal) {
        await api.pause(2200);
        await api.press('KeyE');
        await api.pause(700);
      } else if (s.dialogue) {
        // Ezra's voiced lines play on; keep the long ones short on video.
        await api.cutWhile(
          async () => {
            while ((await api.learn()).dialogue) await api.pause(250);
          },
          { head: 2600, tail: 1600 },
        );
      } else await api.pause(250);
    }
    await api.pause(1200);
    // The App checklist in the Logbook keeps both.
    await api.press('KeyJ');
    await api.pause(700);
    await api.click('.ci-logbook-tabs button:has-text("App checklist")', { ms: 700 });
    api.mark('app checklist');
    await api.pause(3200);
    await api.press('KeyJ');
    await api.pause(600);

    // Off camera: Chapter 00 done, two hours on, under sail off Port Meridian.
    await api.cut(async () => {
      await questsDone(api, ['Q0.3', 'Q0.4', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11']);
      await api.S(() => {
        const l = window.__dev.learn;
        // One answered wrong first, so it's due at once; one right, due after a while.
        l.progress.recordQuiz('T0.4', false);
        l.progress.recordQuiz('T0.4', true);
        l.progress.recordQuiz('N0.1', true);
        const later = Date.now() + 2 * 3600 * 1000;
        l.now = () => later;
      });
      await skipTalk(page, 10_000);
      await api.S(() => window.__dev.session().debug.board());
      await api.pause(1500);
      await api.S(() => window.__dev.session().debug.sailTo(744, -672, Math.PI));
      await api.S(() => window.__dev.session().battle.active && window.__dev.session().battle.skip());
      await api.pause(1800);
    });
    api.mark('dock at Port Meridian');
    await api.press('KeyE');
    await api.waitFor(
      () => window.__dev.session().island === 'meridian' && window.__dev.state().mode === 'walk',
      null,
      30_000,
    );
    // The landfall's flyover and Wingman's welcome, kept short.
    await api.cutWhile(
      async () => {
        const t1 = Date.now();
        while (Date.now() - t1 < 120_000) {
          const s = await api.learn();
          if (s.recap) return;
          await api.pause(300);
        }
      },
      { head: 5000, tail: 2500 },
    );
    api.mark('recap');
    // The recap: the first one wrong (its feedback shows), then right; the next right.
    let n = 0;
    const t2 = Date.now();
    while (Date.now() - t2 < 60_000) {
      const s = await api.learn();
      if (!s.quiz) break;
      await api.answerQuiz({ wrong: n === 0, readMs: 3000 });
      n++;
      await api.pause(600);
    }
    await api.pause(2500);
  },
};
