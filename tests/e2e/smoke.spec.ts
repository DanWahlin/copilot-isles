import { expect, test, type Page } from '@playwright/test';

// CI runs Chromium without a GPU (SwiftShader, no WebGPU), so the 3D path is forced there and
// only the WebGL2 backend can be exercised. Locally (real Chrome + GPU) both backends run.
const CI = Boolean(process.env.CI);
const force = CI ? '&forceGpu' : '';
// SwiftShader on a GitHub runner draws one title frame in about 1-1.5 s, so boot (compile, the
// startup benchmark, 12 warm-up frames) took 35-47 s there and the loader fade about 5 s, right at
// the old 45 s / 5 s limits. A 1-CPU container measures the same (34 s / 7 s on Medium, 24 s / 5 s on
// Lite). These limits are about 2x the worst measured times; a real GPU finishes in a few seconds.
const BOOT_MS = CI ? 90_000 : 45_000;
const FADE_MS = CI ? 15_000 : 5_000;

async function expectTitleRenders(page: Page, url: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url);
  await expect(page.locator('#loadTitle')).toHaveText('KRAKEN ISLES');
  await page.waitForFunction(() => Boolean(window.__isles), null, { timeout: BOOT_MS });
  await expect(page.getByRole('heading', { name: 'KRAKEN ISLES' })).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: FADE_MS });

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
  if (CI) test.setTimeout(150_000);
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

// The Chart's islands sit on a map layer above a separate paper layer. A stacking change once
// painted the paper over the map, so only blank parchment showed: check that an island is on top.
test('Captain’s Chart: the islands draw above the paper', async ({ page }) => {
  if (CI) test.setTimeout(150_000);
  await page.goto(`/?debug&webgl${force}`);
  await page.waitForFunction(() => Boolean(window.__isles), null, { timeout: BOOT_MS });
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: FADE_MS });
  await page.getByRole('button', { name: 'Chart' }).click();
  const island = page.locator('.ci-arch-island').first();
  await expect(island).toBeVisible();
  const onTop = await island.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit && el.contains(hit));
  });
  expect(onTop).toBe(true);
  expect(await page.locator('.ci-arch-island').count()).toBe(8);
});
