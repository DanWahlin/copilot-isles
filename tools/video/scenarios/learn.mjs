// Learn as you play (Ezra, Anchorage Cay): Ezra's part of "Connect to your repository". The fork's
// address typed into his register, the hotspot quiz on the course's own Copilot app screenshot
// (H0.2: where you start adding your fork; the right spot clicked with the mouse and marked correct),
// the scenario question, and the "Add your fork" Logbook page with its course text and link, stowed
// with E. Marks name each quiz and page, so an edit (tools/video/reel.mjs) can pick them out.
import { skipTalk } from '../lib.mjs';

const FORK = 'https://github.com/dan-sample/copilot-app-for-beginners';

/** Glides the mouse to the hotspot quiz's right target and clicks it. */
async function clickHotspot(page, api) {
  const box = await api.S(() => {
    const quiz = window.__dev.learn.getState().quiz.quiz;
    const t = quiz.targets.find((x) => x.correct);
    const f = document.querySelector('.ci-hotspot-frame').getBoundingClientRect();
    return {
      x: f.left + f.width * (t.rect[0] + t.rect[2] / 2),
      y: f.top + f.height * (t.rect[1] + t.rect[3] / 2),
    };
  });
  await api.glide(box.x, box.y, 1000);
  await api.pause(300);
  await page.mouse.down();
  await api.pause(90);
  await page.mouse.up();
}

export default {
  id: 'learn',
  order: 12,
  code: 'Q0.3',
  title: 'Learn as You Play',
  island: 'Anchorage Cay',
  who: 'with Ezra at the market',
  subtitle:
    'Fork the course and add it to the app: a hotspot quiz on the app itself, then the Logbook page with the course’s own words.',
  chapter: 'Course Chapter 00 · Connect to your repository',
  flags: [],
  cursor: true,
  titleFrame: 4,

  async setup(page, api) {
    await skipTalk(page, 15_000);
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
    const seen = new Set();
    while (Date.now() - t0 < 240_000) {
      const s = await api.learn();
      if (s.quests['Q0.3'] === 'done' && !s.dialogue && !s.reveal && !s.banner && !s.quiz) break;
      if (s.forkForm) {
        // The fork's address, typed into Ezra's register (the field has focus), then Enter.
        await api.waitFor(() => !!document.querySelector('.ci-fork'), null, 5000);
        await api.pause(1200);
        await page.keyboard.type(FORK, { delay: 35 });
        await api.pause(900);
        await api.press('Enter');
        await api.pause(800);
      } else if (s.quiz && !s.quiz.answered) {
        api.mark(`quiz ${s.quiz.id}`);
        if (s.quiz.type === 'hotspot') {
          // Read the question and look over the screenshot, then click the right spot.
          const W = await api.S(() => innerWidth);
          const H = await api.S(() => innerHeight);
          await api.glide(W * 0.62, H * 0.8, 400);
          await api.pause(2200);
          await clickHotspot(page, api);
          api.mark(`quiz ${s.quiz.id} clicked`);
          await api.pause(2600);
        } else {
          await api.answerQuiz({ readMs: 3000 });
          continue;
        }
        api.mark(`quiz ${s.quiz.id} continue`);
        await api.press('KeyE');
        await api.pause(800);
      } else if (s.reveal || s.banner) {
        const key = s.reveal ?? s.banner;
        if (!seen.has(key)) {
          seen.add(key);
          api.mark(`reveal ${key}`);
          await api.pause(3600);
          // "Stow it in the Logbook", clicked.
          api.mark(`reveal ${key} stow`);
          if (!(await api.click('.ci-page-foot .ci-btn.primary', { ms: 800 }))) await api.press('KeyE');
          await api.pause(900);
        } else await api.pause(250);
      } else await api.pause(250);
    }
    await api.pause(1500);
  },
};
