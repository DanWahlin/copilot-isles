// Rook's session terminal (Thousand-Bough, the Practice Bough): with Your setup filled in, walking up
// to Rook brings up the HUD terminal for the exercise's session, showing the player's own working
// branch and practice issue. Setup (off camera): the island's first six quests done, Rook's started,
// and Your setup's branch and issue saved (the values tools/lib/setup-forms.mjs enters).
import { SETUP_VALUES } from '../../lib/setup-forms.mjs';
import { questsDone, thousandBoughAshore } from '../game.mjs';

export default {
  id: 'rook-terminal',
  order: 13,
  code: 'Q2.7',
  title: 'Your Session, Your Branch',
  island: 'Thousand-Bough Isle',
  who: 'with Rook on the Practice Bough',
  subtitle:
    'Start a session from a branch: the session terminal shows your own working branch and the practice issue you attached.',
  chapter: 'Course Chapter 02 · Exercise: Start a Session from a Branch',
  flags: ['thousandbough'],
  titleFrame: 3,

  async setup(page, api) {
    await thousandBoughAshore(page, api);
    await questsDone(api, ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6']);
    await api.S(() => window.__dev.session().debug.quest('Q2.7', 'start'));
    await api.S(
      ([branch, issue]) => window.__dev.learn.saveSetup({ branch, issue }),
      [SETUP_VALUES.branch, SETUP_VALUES.issue],
    );
    // Far enough out that the terminal comes up on camera as you walk in (it shows within 6 m).
    this.spot = await api.approachSpot('rook', { back: 6.2 });
    await api.look(this.spot.heading + 0.3, 0.22);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(1200);
    api.mark('walk');
    await api.walkTo(this.spot.x, this.spot.z, { tol: 0.5 });
    const shown = await api.waitFor(() => !!document.querySelector('.hud-term.show'), null, 5000);
    if (!shown) api.log('the session terminal never showed');
    api.mark('terminal');
    await api.face(this.spot.npc.x, this.spot.npc.z);
    // Round a little, so Rook and his treehouse's branch sign show past the captain.
    const h = (await api.state()).heading;
    await api.easeLook(h + 0.5, 0.24, 1600);
    await api.pause(3600);
    const text = await api.S(() => document.querySelector('.hud-term.show')?.textContent ?? '');
    api.log(`terminal: ${text}`);
    await api.pause(1000);
  },
};
