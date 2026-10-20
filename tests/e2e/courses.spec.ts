import { expect, test, type Page } from '@playwright/test';

// Course packs (docs/specs/COURSE-PACKS.md §8): with one listed course, New Voyage goes straight to
// captain select on it; `?courses=all` lists the unlisted CLI course too, and each course's voyage
// reaches Anchorage Cay with its own quest line, chapter and save. Locally this runs on WebGPU;
// CI's Chromium has no WebGPU, so it forces the WebGL2 backend on SwiftShader (slow: a whole voyage).
const CI = Boolean(process.env.CI);
const query = CI ? '/?debug&webgl&forceGpu&tier=lite' : '/?debug';

type Flow = {
  getState(): { screen: string; course: string };
  skipOpening(): void;
  debugOpening: { prompting: boolean; time: number } | null;
  learn: { getState(): { tracker: { chapter: string } | null }; progress: { course: string } };
};

const flow = (page: Page) => page.evaluate(() => (window as unknown as { __flow: Flow }).__flow.getState());

async function voyage(page: Page, course: string, chapter: string, all = false) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(all ? `${query}&courses=all` : query);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __flow?: Flow }).__flow), null, {
    timeout: CI ? 120_000 : 45_000,
  });
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: CI ? 20_000 : 8_000 });

  await page.getByRole('button', { name: /New Voyage/ }).click();
  if (all) {
    await expect(page.getByRole('heading', { name: 'Choose your course' })).toBeVisible();
    await expect(page.locator('[data-course]')).toHaveCount(2);
    await page.click(`[data-course="${course}"]`);
  }
  await expect(page.getByRole('heading', { name: 'Choose your captain' })).toBeVisible();
  expect((await flow(page)).course).toBe(course);

  await page.getByRole('button', { name: 'Set sail' }).click();
  // Past the cabin and the living chart (Esc and the Skip button do this for a player).
  await page.waitForFunction(
    () => (window as unknown as { __flow: Flow }).__flow.getState().screen !== 'captain',
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { __flow: Flow }).__flow.skipOpening());
  // As a player would, skip again if the cabin still waits on the chest (CI's software renderer is
  // too slow for the chest to open by itself). On a timeout, say where the opening stood.
  const deadline = Date.now() + (CI ? 300_000 : 120_000);
  for (;;) {
    const at = await page.evaluate(() => {
      const f = (window as unknown as { __flow: Flow }).__flow;
      const o = f.debugOpening;
      if (o?.prompting) f.skipOpening();
      return { screen: f.getState().screen, opening: o ? { time: o.time, prompting: o.prompting } : null };
    });
    if (at.screen === 'playing') break;
    if (Date.now() > deadline) throw new Error(`The voyage never reached Anchorage: ${JSON.stringify(at)}`);
    await page.waitForTimeout(2000);
  }
  // Anchorage's tasks are this course's chapter, and the voyage is saved under this course's keys.
  await page.waitForFunction(
    (ch) => (window as unknown as { __flow: Flow }).__flow.learn.getState().tracker?.chapter.includes(ch),
    chapter,
    { timeout: 60_000 },
  );
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain(`copilot-isles.${course}.progress.v1`);
  expect(keys).toContain('copilot-isles.course');
  expect(await page.evaluate(() => localStorage.getItem('copilot-isles.course'))).toBe(course);
  expect(errors).toEqual([]);
}

test('New Voyage: the Copilot app course (the only listed one) reaches Anchorage Cay', async ({ page }) => {
  test.setTimeout(CI ? 480_000 : 180_000);
  await voyage(page, 'copilot-app', 'Chapter 00 · Setup');
});

test('course list (?courses=all): the unlisted Copilot CLI course reaches Anchorage Cay', async ({
  page,
}) => {
  test.setTimeout(CI ? 480_000 : 180_000);
  await voyage(page, 'copilot-cli', 'Chapter 00 · Quick Start', true);
});
