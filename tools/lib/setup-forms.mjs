// Your setup in the browser tests: answers the small setup forms (computer, practice issue, session
// branch, model) through the real UI, entering values or skipping, and checks what was saved.
// `plan` maps a form kind to 'skip' or the value to enter:
//   { os: 'linux', issue: 7, branch: 'copilot/empty-state-copy', model: { pick: 'other', name: 'Example Model 2' } }

/** The default values the tests enter. */
export const SETUP_VALUES = {
  os: 'linux',
  issue: 7,
  branch: 'copilot/empty-state-copy',
  model: { pick: 'other', name: 'Example Model 2' },
};

/** The Copilot app course's practice branch (its course.json `practice.branch`): a session's base branch. */
const PRACTICE_BRANCH = 'practice-empty-state-copy';

/** `--setup=skip` skips every form; `--setup=enter` (the default) enters `SETUP_VALUES`. */
export function setupPlan(flag) {
  if (flag === 'skip') return { os: 'skip', issue: 'skip', branch: 'skip', model: 'skip' };
  return { ...SETUP_VALUES };
}

const setupOf = (page) => page.evaluate(() => window.__dev.learn.getState().setup);

/**
 * Answers the open setup form. Returns the saved setup. `shot(name)` takes a screenshot; `fail(msg)`
 * records a failure.
 */
export async function answerSetupForm(page, form, plan, { shot, fail }) {
  const { kind } = form;
  const sel = `.ci-setup[data-kind="${kind}"]`;
  await page.waitForSelector(sel, { timeout: 5000 });
  await page.waitForTimeout(350);
  const before = await setupOf(page);
  const focused = await page.evaluate((s) => !!document.activeElement?.closest(s), sel);
  if (!focused) fail(`setup ${kind}: nothing in the form has focus`);
  const small = await page.evaluate(
    (s) =>
      [...document.querySelectorAll(`${s} button, ${s} .ci-setup-choice, ${s} input[type=text]`)]
        .map((e) => ({ t: e.textContent?.trim() || e.className, h: e.getBoundingClientRect().height }))
        .filter((b) => b.h > 0 && b.h < 44),
    sel,
  );
  if (small.length) fail(`setup ${kind}: targets under 44 px: ${JSON.stringify(small)}`);
  const want = plan[kind];
  if (want === undefined || want === 'skip') {
    await shot(`setup-${kind}-form`);
    // Esc skips (keyboard parity with the button).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const after = await setupOf(page);
    if (JSON.stringify(after[kind]) !== JSON.stringify(before[kind]))
      fail(`setup ${kind}: Skip changed the value (${JSON.stringify(after[kind])})`);
    return after;
  }
  if (kind === 'os') {
    await page.click(`${sel} .ci-setup-choice:has(input[value="${want}"])`);
    await page.waitForTimeout(200);
    await shot(`setup-${kind}-form`);
    await page.keyboard.press('Enter');
  } else if (kind === 'model') {
    await page.click(`${sel} .ci-setup-choice:has(input[value="${want.pick}"])`);
    if (want.pick === 'other' && want.name) {
      await page.fill(`${sel} input[type=text]`, want.name);
    }
    await page.waitForTimeout(200);
    await shot(`setup-${kind}-form`);
    await page.click(`${sel} button[type=submit]`);
  } else {
    // A hostile value first: it's refused with a message, and nothing is saved.
    const hostile = kind === 'issue' ? '#3; rm -rf ~' : '<img src=x onerror=alert(1)>';
    await page.fill(`${sel} input[type=text]`, hostile);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const err = await page.evaluate(
      (s) => document.querySelector(`${s} .ci-fork-error`)?.textContent ?? '',
      sel,
    );
    if (!err) fail(`setup ${kind}: no error for ${JSON.stringify(hostile)}`);
    if (!(await page.$(sel))) fail(`setup ${kind}: a hostile value closed the form`);
    await shot(`setup-${kind}-error`);
    if (kind === 'branch') {
      // The practice branch is the session's base branch, never its working branch: it's refused too.
      await page.fill(`${sel} input[type=text]`, PRACTICE_BRANCH);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
      const baseErr = await page.evaluate(
        (s) => document.querySelector(`${s} .ci-fork-error`)?.textContent ?? '',
        sel,
      );
      if (!/base branch/.test(baseErr)) fail(`setup branch: the base branch wasn't refused ("${baseErr}")`);
      if (!(await page.$(sel))) fail('setup branch: the base branch closed the form');
      await shot('setup-branch-base');
    }
    await page.fill(`${sel} input[type=text]`, '');
    await page.keyboard.type(String(want), { delay: 10 });
    await page.waitForTimeout(250);
    await shot(`setup-${kind}-form`);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(300);
  const after = await setupOf(page);
  if (JSON.stringify(after[kind]) !== JSON.stringify(want))
    fail(`setup ${kind}: saved ${JSON.stringify(after[kind])}, wanted ${JSON.stringify(want)}`);
  if (await page.$(sel)) fail(`setup ${kind}: the form didn't close after saving`);
  return after;
}

/** Opens a Logbook page, screenshots it, and returns its text (then closes the Logbook). */
export async function logbookPage(page, id, shot) {
  await page.evaluate((p) => window.__dev.learn.openLogbook('pages', p), id);
  await page.waitForTimeout(500);
  await shot(`logbook-${id}`);
  const text = await page.evaluate(() => document.querySelector('.ci-logbook-body')?.textContent ?? '');
  await page.evaluate(() => window.__dev.learn.closeLogbook());
  await page.waitForTimeout(200);
  return text;
}
