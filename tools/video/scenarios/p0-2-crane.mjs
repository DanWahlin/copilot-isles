// P0.2 The Dry-Run Crane (Pim & Pol, Anchorage): their brief (with your fork's address typed into
// the crane's form; it ends "Actions first" at Suri's gate), then a Dry-Run on the berth the crane
// already faces (someone else's), --yes pulled anyway and refused, the capstan turned to your own
// berth, a second Dry-Run that shows your fork by name and the script's warning that GitHub Actions
// isn't active, --yes refused with "Setup failed", workflows turned on (Suri's gate, off camera; the
// `sluice` scenario shows it), and --yes for real.
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
    'With workflows on, run the setup script with --dry-run. Check that its Repository: line names your fork, then use --yes.',
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
    const briefed = (s) => s.quests['Q0.7'] === 'actions' && !s.dialogue && !s.banner && !s.reveal;
    const s = await api.converse({ until: (s) => !!s.forkForm || briefed(s) });
    if (s.forkForm) {
      await enterFork(page, api);
      await api.converse({ until: briefed });
    }
    await api.pause(500);
    const cs = await api.S(() => window.__dev.session().debug.puzzle('P0.2').spots());

    /** Presses a control only when its prompt is the one we expect. */
    const interactPrompt = async (label) => {
      const prompt = await api.prompt();
      if (!prompt?.includes(label))
        throw new Error(`Expected "${label}" prompt, saw ${JSON.stringify(prompt)}`);
      if (!(await api.interact(label))) throw new Error(`Could not interact with "${label}"`);
    };

    /** Walks to a lever or the capstan, faces it, and checks the prompt before pressing E. */
    const goTo = async (p, label) => {
      await api.walkTo(p.x, p.z, { tol: 0.35 });
      await api.face(p.x, p.z - 3);
      await api.easeLook(Math.PI + 0.35, 0.3, 700);
      await interactPrompt(label);
    };

    /** The pier obstacle blocks a straight walk. Approach the yes lever from its west side. */
    const goToYes = async () => {
      await api.walkTo(cs.yes.x - 1.6, cs.yes.z - 0.2, { tol: 0.45 });
      await api.walkTo(cs.yes.x - 0.75, cs.yes.z - 0.2, { tol: 0.5 });
      await api.face(cs.yes.x, cs.yes.z);
      await api.easeLook(Math.PI + 0.35, 0.3, 700);
      await interactPrompt('Pull --yes');
    };

    // Dry-Run on the berth the crane already faces: the ghosts land on the captain's berth.
    await goTo(cs.dry, 'Pull Dry-Run');
    await idle(api);
    await api.pause(2600);
    // --yes anyway: the script refuses a repository you don't own.
    await goToYes();
    await api.pause(800);
    await api.converse({ idle: 1200 });
    await idle(api);
    const refusalShown = await api.waitFor(
      () =>
        (document.querySelector('.hud-term.show')?.textContent ?? '').includes(
          'Refusing to change shared or',
        ),
      null,
      8000,
    );
    if (!refusalShown) throw new Error('The wrong-fork --yes refusal did not appear in the terminal');
    api.mark('wrong-fork --yes refused');
    api.log('Wrong-fork --yes refusal confirmed in the terminal.');
    await api.pause(600);

    // Turn the capstan round to your own berth.
    await goTo(cs.capstan, 'Turn the capstan');
    await idle(api);
    for (let k = 0; k < 4 && (await crane(api)).facing !== cs.yours; k++) {
      await api.pause(500);
      await interactPrompt('Turn the capstan');
      await idle(api);
    }
    await api.pause(800);

    // Preview again (your fork this time): the script warns that GitHub Actions isn't active.
    await goTo(cs.dry, 'Pull Dry-Run');
    await idle(api);
    const warned = await api.waitFor(
      () =>
        (document.querySelector('.hud-term.show')?.textContent ?? '').includes(
          'GitHub Actions is not active',
        ),
      null,
      6000,
    );
    if (!warned) throw new Error('The dry run on your fork did not warn that Actions is off');
    api.mark('actions warning');
    await api.pause(3200);
    // --yes anyway: "Setup failed", and Pol sends you to Suri's gate.
    await goToYes();
    await api.pause(800);
    await api.converse({ idle: 1200 });
    await idle(api);
    const failed = await api.waitFor(
      () =>
        (document.querySelector('.hud-term.show')?.textContent ?? '').includes(
          'Setup failed: The Book app web workflow is not active.',
        ),
      null,
      8000,
    );
    if (!failed) throw new Error('The Actions-off --yes failure did not appear in the terminal');
    api.mark('actions-off --yes refused');
    await api.pause(1200);

    // Workflows on (Suri's gate lever, off camera), then --yes for real.
    api.mark('workflows on (off camera)');
    await api.S(() => window.__dev.session().debug.quest('Q0.7', 'crane'));
    await api.pause(1500);
    await goToYes();
    await api.pause(1200);
    await api.converse({
      until: (s) => s.quests['Q0.7'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
      timeout: 120_000,
    });
    const complete = await api.S(() => ({
      quest: window.__dev.learn.progress.data.quests['Q0.7'],
      crane: window.__dev.session().debug.puzzle('P0.2').state(),
    }));
    if (complete.quest !== 'done' || !complete.crane.complete)
      throw new Error('The own-fork --yes run did not complete');
    api.mark('own-fork --yes completed');
    api.log('Own-fork --yes run completed and stocked the ship.');
    await api.pause(2500);
  },
};
