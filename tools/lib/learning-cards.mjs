// The learning systems' cards in the browser tests (src/ui/learn/LearningCards.tsx): "Do this in the
// app" (I did it or Later, then "What did you see?"), the reflection before a Seal, the Seal card and
// course certificate, and "where you left off". Answered through the real UI (clicks and keys), with a
// screenshot the first time each kind shows, and checks that every target is at least 44 px.

/** What the drive loops read (add it to their state snapshot). */
export const cardState = () => {
  const l = window.__dev.learn.getState();
  return {
    appTask: l.appTask ? { id: l.appTask.task.id, phase: l.appTask.phase } : null,
    reflection: l.reflection?.chapter ?? null,
    badge: l.badge?.kind ?? null,
    resume: !!l.resume,
  };
};

/** Whether a card is open. */
export const cardOpen = (c) => !!(c.appTask || c.reflection || c.badge || c.resume);

/**
 * Answers the open card. `plan.later` lists app task ids to put off with Later (Esc); the rest are
 * confirmed with I did it (E), and "What did you see?" gets its first option. Returns what it did.
 */
export async function answerCard(page, c, { shot, fail, seen, plan = {} }) {
  const first = (key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.ci-lj-card button, .ci-lj-card a.ci-btn')]
      .map((e) => ({ t: e.textContent?.trim(), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((b) => b.h > 0 && b.h < 44),
  );
  if (small.length) fail(`learning card: targets under 44 px: ${JSON.stringify(small)}`);
  if (c.appTask) {
    const { id, phase } = c.appTask;
    if (first(`apptask-${id}-${phase}`)) {
      await page.waitForTimeout(350);
      await shot(`apptask-${id}-${phase}`);
    }
    if (phase === 'ask') {
      if ((plan.later ?? []).includes(id)) await page.keyboard.press('Escape');
      else await page.click('.ci-lj-apptask .ci-btn.primary');
    } else if (phase === 'seen') await page.click('.ci-lj-apptask .ci-lj-option');
    else await page.click('.ci-lj-apptask .ci-btn.primary');
    return `apptask ${id} ${phase}`;
  }
  if (c.reflection) {
    if (first(`reflection-${c.reflection}`)) {
      await page.waitForTimeout(350);
      await shot(`reflection-${c.reflection}`);
    }
    await page.click('.ci-lj-reflection .ci-lj-option');
    return `reflection ${c.reflection}`;
  }
  if (c.badge) {
    if (first(`badge-${c.badge}`)) {
      await page.waitForTimeout(500);
      await shot(`badge-${c.badge}`);
    }
    await page.click('.ci-lj-badge .ci-btn.primary');
    return `badge ${c.badge}`;
  }
  if (c.resume) {
    if (first('resume')) {
      await page.waitForTimeout(350);
      await shot('resume');
    }
    await page.click('.ci-lj-resume .ci-btn.primary');
    return 'resume';
  }
  return null;
}

/**
 * After a Continue on the game page (`window.__flow`): waits up to `ms` for the "where you left off"
 * card, and a recap if one follows, and moves past them through the UI (Onward, then Esc skips the
 * recap). Returns what it saw: `{ resume, recap }`.
 */
export async function passLearningPauses(page, ms = 4000) {
  const seen = { resume: false, recap: false };
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const l = window.__flow?.learn?.getState();
      return { resume: !!l?.resume, recap: !!l?.quiz?.recap };
    });
    if (s.resume) {
      seen.resume = true;
      await page.click('.ci-lj-resume .ci-btn.primary');
    } else if (s.recap) {
      seen.recap = true;
      await page.keyboard.press('Escape');
    } else if (seen.resume) {
      // A recap may follow the card at once; give it a moment, then stop.
      await page.waitForTimeout(400);
      const more = await page.evaluate(() => !!window.__flow?.learn?.getState().quiz?.recap);
      if (!more) break;
    }
    await page.waitForTimeout(150);
  }
  return seen;
}
