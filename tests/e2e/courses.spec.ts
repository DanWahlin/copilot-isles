import { expect, test, type Page } from '@playwright/test';

// Course packs (docs/specs/COURSE-PACKS.md §8): New Voyage opens the course list, and each course's
// voyage reaches Anchorage Cay with its own quest line, chapter and save. Locally this runs on WebGPU;
// CI's Chromium has no WebGPU, so it forces the WebGL2 backend on SwiftShader (slow: a whole voyage).
const CI = Boolean(process.env.CI);
const query = CI ? '/?debug&webgl&forceGpu&tier=lite' : '/?debug';

type Flow = {
  getState(): { screen: string; course: string };
  skipOpening(): void;
  learn: { getState(): { tracker: { chapter: string } | null }; progress: { course: string } };
};

const flow = (page: Page) => page.evaluate(() => (window as unknown as { __flow: Flow }).__flow.getState());

async function voyage(page: Page, course: string, chapter: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(query);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __flow?: Flow }).__flow), null, {
    timeout: CI ? 120_000 : 45_000,
  });
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: CI ? 20_000 : 8_000 });

  await page.getByRole('button', { name: /New Voyage/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose your course' })).toBeVisible();
  await expect(page.locator('[data-course]')).toHaveCount(2);
  await page.click(`[data-course="${course}"]`);
  await expect(page.getByRole('heading', { name: 'Choose your captain' })).toBeVisible();
  expect((await flow(page)).course).toBe(course);

  await page.getByRole('button', { name: 'Set sail' }).click();
  // Past the cabin and the living chart (Esc and the Skip button do this for a player).
  await page.waitForFunction(
    () => (window as unknown as { __flow: Flow }).__flow.getState().screen !== 'captain',
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { __flow: Flow }).__flow.skipOpening());
  await page.waitForFunction(
    () => (window as unknown as { __flow: Flow }).__flow.getState().screen === 'playing',
    null,
    { timeout: CI ? 300_000 : 120_000 },
  );
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

test('course list: the Copilot app course reaches Anchorage Cay', async ({ page }) => {
  test.setTimeout(CI ? 480_000 : 180_000);
  await voyage(page, 'copilot-app', 'Chapter 00 · Setup');
});

test('course list: the Copilot CLI course reaches Anchorage Cay', async ({ page }) => {
  test.setTimeout(CI ? 480_000 : 180_000);
  await voyage(page, 'copilot-cli', 'Chapter 00 · Quick Start');
});
