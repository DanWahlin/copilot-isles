// P0.2 The Dry-Run Crane (Pim & Pol, Anchorage): their brief (with your fork's address typed into
// the crane's form), then a Dry-Run on the berth the crane already faces (someone else's), --yes
// pulled anyway and refused, the capstan turned to your own berth, a second Dry-Run that shows your
// fork by name, and --yes for real.
import { skipTalk } from '../lib.mjs';

const crane = (api) => api.S(() => window.__dev.session().debug.puzzle('P0.2').state());
const FORK_URL = 'https://github.com/dan-sample/copilot-app-for-beginners';

/** Types the fork's address into the form at a human pace, lets the read-back show, then saves. */
async function enterFork(page, api) {
  await page.waitForSelector('.ci-fork-input');
  await api.pause(1600);
  await page.keyboard.type(FORK_URL, { delay: 45 });
  await api.pause(2200);
  await page.keyboard.press('Enter');
  await api.pause(600);
}

/** Waits out the crane job a pull just started (it can start a frame or two late). */
async function idle(api) {
  for (let k = 0; k < 8; k++) {
    const c = await crane(api);
    if (c.busy || c.running) break;
    await api.pause(200);
  }
  for (let k = 0; k < 80; k++) {
    const c = await crane(api);
    if (!c.busy && !c.running) break;
    await api.pause(250);
  }
}

export default {
  id: 'crane',
  order: 2,
  code: 'P0.2',
  title: 'The Dry-Run Crane',
  island: 'Anchorage Cay',
  who: 'with Pim and Pol on the quay',
  subtitle:
    'Preview the setup script with --dry-run, check the Repository: line is your fork, then run it for real with --yes.',
  chapter: 'Course Chapter 00 · Add the course practice items',
  flags: [],

  async setup(page, api) {
    await skipTalk(page, 15_000);
    await api.S(() => {
      const d = window.__dev.session().debug;
      for (const q of ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5']) d.quest(q, 'done');
      d.quest('Q0.7', 'start');
      // No fork given yet (skipped at Ezra's register), so Pim asks for it.
      window.__dev.learn.saveFork(null);
    });
    await skipTalk(page, 10_000);
    this.spot = await api.approachSpot('pim', { back: 3.5 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    const briefed = (s) => s.quests['Q0.7'] === 'crane' && !s.dialogue && !s.banner && !s.reveal;
    const s = await api.converse({ until: (s) => !!s.forkForm || briefed(s) });
    if (s.forkForm) {
      await enterFork(page, api);
      await api.converse({ until: briefed });
    }
    await api.pause(500);
    const cs = await api.S(() => window.__dev.session().debug.puzzle('P0.2').spots());

    /** Walks to a lever or the capstan and faces it (they're all on the quay's north side). */
    const goTo = async (p, label) => {
      await api.walkTo(p.x, p.z, { tol: 0.35 });
      await api.face(p.x, p.z - 3);
      await api.easeLook(Math.PI + 0.35, 0.3, 700);
      return api.interact(label);
    };

    // Dry-Run on the berth the crane already faces: the ghosts land on the captain's berth.
    await goTo(cs.dry, 'Pull Dry-Run');
    await idle(api);
    await api.pause(2600);
    // --yes anyway: the script refuses a repository you don't own.
    await goTo(cs.yes, 'Pull --yes');
    await api.pause(800);
    await api.converse({ idle: 1200 });
    await idle(api);
    await api.pause(600);

    // Turn the capstan round to your own berth.
    await goTo(cs.capstan, 'Turn the capstan');
    await idle(api);
    for (let k = 0; k < 4 && (await crane(api)).facing !== cs.yours; k++) {
      await api.pause(500);
      await api.interact('Turn the capstan');
      await idle(api);
    }
    await api.pause(800);

    // Preview again (your fork this time), then --yes for real.
    await goTo(cs.dry, 'Pull Dry-Run');
    await idle(api);
    await api.pause(2800);
    await goTo(cs.yes, 'Pull --yes');
    await api.pause(1200);
    await api.converse({
      until: (s) => s.quests['Q0.7'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
      timeout: 120_000,
    });
    await api.pause(2500);
  },
};
