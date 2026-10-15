// P1.3 The Lost Letters (Pell, Port Meridian's Hall of Records): Pell's brief on where Settings
// opens, then his bundle of lost letters filed with the number keys at his desk. The first letter
// goes in the wrong alcove (General), and the decoy (a stronger model for one task) goes in Model
// providers first, so both come back with Pell's cited reason; the rest go right, the decoy back in
// Pell's tray (N). Ends after Pell's debrief and the Settings hotspot (H1.4).
import { meridianAshore, questsDone } from '../game.mjs';

/** The letter in hand, and the key that files it where it belongs (1-9, 0 for Projects, N for the tray). */
const letters = (api) =>
  api.S(async () => {
    const L = await import('/src/game/puzzles/hall-letters.ts');
    const st = window.__dev.session().debug.puzzle('P1.3').state();
    const letter = L.LETTERS[st.index] ?? null;
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
    const i = letter ? L.DESTINATIONS.indexOf(letter.answer) : -1;
    return {
      ...st,
      view: null,
      busy: st.view.busy,
      answer: letter?.answer ?? null,
      key: i < 0 ? null : (keys[i] ?? (i === 9 ? 'Digit0' : 'KeyN')),
    };
  });

export default {
  id: 'letters',
  order: 4.5,
  code: 'P1.3',
  title: 'The Lost Letters',
  island: 'Port Meridian',
  who: 'with Pell in the Hall of Records',
  subtitle:
    'Settings opens from the gear at the bottom of the sidebar. File each problem under the area that fixes it, and pick the model below the prompt box.',
  chapter: 'Course Chapter 01 · Settings · Models and Reasoning Effort',
  flags: ['meridian'],

  async setup(page, api) {
    await meridianAshore(page, api);
    await questsDone(api, ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6']);
    await api.S(() => window.__dev.session().debug.quest('Q1.7', 'start'));
    this.spot = await api.approachSpot('pell', { back: 3.5 });
    this.desk = await api.S(() => window.__dev.session().debug.puzzle('P1.3').desk());
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    await api.converse({ until: (s) => s.quests['Q1.7'] === 'letters' && !s.dialogue && !s.reveal });
    await api.pause(600);

    // To the desk, and open the bundle.
    await api.walkTo(this.desk.x, this.desk.z, { tol: 0.4 });
    await api.face(
      this.desk.x + Math.sin(this.desk.heading) * 3,
      this.desk.z + Math.cos(this.desk.heading) * 3,
    );
    await api.pause(400);
    await api.interact('Pell’s letters', { timeout: 5000 });
    await api.pause(1800);

    let wrongFirst = true;
    let decoyWrong = true;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      const l = await letters(api);
      if (l.solved || !l.key) break;
      if (!l.open) {
        await api.interact('Pell’s letters', { timeout: 3000 });
        await api.pause(1200);
        continue;
      }
      if (l.busy) {
        await api.pause(250);
        continue;
      }
      // Read the letter, then file it.
      await api.pause(2800);
      if (wrongFirst) {
        wrongFirst = false;
        api.mark('wrong alcove: a second GitHub login in General');
        await api.press('Digit1');
        await api.pause(1500);
        continue;
      }
      if (l.answer === 'tray' && decoyWrong) {
        decoyWrong = false;
        api.mark('the decoy in Model providers');
        await api.press('Digit8');
        await api.pause(1500);
        continue;
      }
      await api.press(l.key);
      await api.pause(1200);
    }
    // Pell's debrief and the Settings hotspot.
    await api.converse({
      until: (s) => s.quests['Q1.7'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
      timeout: 120_000,
    });
    await api.pause(2000);
  },
};
