import { expect, test } from '@playwright/test';

// CI runs Chromium without a GPU (SwiftShader), so the 3D path is forced there.
const forceGpu = process.env.CI ? '&forceGpu' : '';

// Scaffold smoke test: the loader paints, the title renders with real GPU work, and nothing errors.
test('loader paints, title renders, no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`/?debug${forceGpu}`);
  await expect(page.locator('#loadTitle')).toHaveText('COPILOT ISLES');

  await page.waitForFunction(() => Boolean(window.__isles), null, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'COPILOT ISLES' })).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });

  const info = await page.evaluate(() => window.__isles!.info());
  expect(info.calls).toBeGreaterThan(0);
  expect(info.triangles).toBeGreaterThan(0);

  await page.waitForTimeout(1_000);
  const hitches = await page.evaluate(() => window.__isles!.hitches());
  expect(hitches).toEqual([]);
  expect(errors).toEqual([]);
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
