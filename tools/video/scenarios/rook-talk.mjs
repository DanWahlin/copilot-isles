// Rook on the Practice Bough (Thousand-Bough, Chapter 02 · Exercise: Start a Session from a Branch
// and Attach an Issue): the captain stands by Rook with the session terminal up (it shows within 6 m
// once his quest has begun), presses E to talk, and Rook's first two lines play with their captions:
// the bough is the branch, then how to start a session from it ("Point to the project, select Create
// from, open Branches and pick our branch. New worktree, every time."). The treehouse's sign shows
// the player's own branch. Setup (off camera): the island's first six quests done, Rook's started,
// Your setup's branch and issue saved (so his setup questions are skipped), and the game's own chart
// labels marked as shown, and the captions lifted above where the reel's lower third sits (a style
// tag, as the game does under its own labels). Each caption's start is marked (`line N: <text>`) for the edit.
import { SETUP_VALUES } from '../../lib/setup-forms.mjs';
import { labelsShown, questsDone, thousandBoughAshore } from '../game.mjs';

/** Each new dialogue caption (its text and when it showed), recorded in the page for the marks. */
function watchSubtitles() {
  window.__subLog = [];
  let last = '';
  const read = () => {
    const el = document.querySelector('.hud-subtitle');
    const text = el && getComputedStyle(el).opacity !== '0' ? (el.textContent?.trim() ?? '') : '';
    if (text !== last) {
      last = text;
      window.__subLog.push({ t: performance.timeOrigin + performance.now(), text });
    }
    requestAnimationFrame(read);
  };
  read();
}

export default {
  id: 'rook-talk',
  order: 16,
  code: 'Q2.7',
  title: 'Start a Session from a Branch',
  island: 'Thousand-Bough Isle',
  who: 'with Rook on the Practice Bough',
  subtitle: 'Pick your branch under Create from, and every session gets its own new worktree.',
  chapter: 'Course Chapter 02 · Exercise: Start a Session from a Branch and Attach an Issue',
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
    await labelsShown(api);
    // The reel lays its lower third over this part: lift the captions clear of it, as the game itself
    // does while one of its own chart labels is up (hud.css `.hud.has-label .hud-subtitle`).
    await page.addStyleTag({ content: '.hud-subtitle { bottom: 330px !important; }' });
    // Close in front of Rook (the talk prompt shows), the camera round to the right so the treehouse
    // and its branch sign are in the shot with him.
    this.spot = await api.approachSpot('rook', { back: 0.6 });
    await api.look(this.spot.heading + 0.55, 0.2);
    await api.pause(1500);
    await api.S(watchSubtitles);
  },

  async play(page, api) {
    api.mark('ready');
    await api.pause(1500);
    await api.walkTo(this.spot.x, this.spot.z, { tol: 0.4 });
    await api.face(this.spot.npc.x, this.spot.npc.z);
    if (!(await api.interact('Talk to'))) throw new Error('no talk prompt at Rook');
    api.mark('talk');
    // Rook's lines play on their own; stop a moment after his second line ends.
    const t0 = Date.now();
    let seen = 0;
    while (Date.now() - t0 < 60_000) {
      const log = await api.S(() => window.__subLog.filter((l) => l.text));
      if (log.length > seen) seen = log.length;
      if (seen >= 3) break;
      await api.pause(150);
    }
    await api.pause(1200);
    const log = await api.S(() => window.__subLog);
    let n = 0;
    for (const l of log) {
      if (!l.text) {
        api.rec?.marks.push({ t: l.t, label: `line end` });
        continue;
      }
      n += 1;
      api.rec?.marks.push({ t: l.t, label: `line ${n}: ${l.text}` });
    }
    api.rec?.marks.sort((a, b) => a.t - b.t);
  },
};
