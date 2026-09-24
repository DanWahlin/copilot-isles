import { expect, test, type Page } from '@playwright/test';

// CI runs Chromium without a GPU (SwiftShader, no WebGPU), so the 3D path is forced there and
// only the WebGL2 backend can be exercised. Locally (real Chrome + GPU) both backends run.
const CI = Boolean(process.env.CI);
const force = CI ? '&forceGpu' : '';

async function expectTitleRenders(page: Page, url: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url);
  await expect(page.locator('#loadTitle')).toHaveText('COPILOT ISLES');
  await page.waitForFunction(() => Boolean(window.__isles), null, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'COPILOT ISLES' })).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });

  const info = await page.evaluate(() => window.__isles!.info());
  expect(info.drawCalls).toBeGreaterThan(0);
  expect(info.programs).toBeGreaterThan(0);
  expect(info.triangles).toBeGreaterThan(0);

  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => window.__isles!.hitches())).toEqual([]);
  expect(errors).toEqual([]);
  return info;
}

test('WebGPU backend: title renders with no errors or hitches', async ({ page }) => {
  test.skip(CI, 'CI Chromium has no WebGPU adapter');
  const info = await expectTitleRenders(page, '/?debug');
  expect(info.backend).toBe('webgpu');
});

test('WebGL2 backend (fallback): the same TSL title renders', async ({ page }) => {
  const info = await expectTitleRenders(page, `/?debug&webgl${force}`);
  expect(info.backend).toBe('webgl2');
});

// PLAN §14.2: software rendering routes to the 2D fallback (a stub until Phase 1).
test('software rendering shows the fallback with a course link', async ({ page }) => {
  await page.goto('/?forceSoftware');
  await expect(page.getByText("isn't using the graphics card", { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: /Copilot app for Beginners/ })).toHaveAttribute(
    'href',
    'https://github.com/github/copilot-app-for-beginners',
  );
});
