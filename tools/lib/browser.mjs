// Shared plumbing for the Node tools: flag parsing, launching Chrome on the real GPU, and collecting a
// page's console errors so each script can report them in its JSON output.
import { chromium } from '@playwright/test';

/**
 * Parses `--key=value` and bare `--flag` arguments (a bare flag is `true`). Values keep any `=` they
 * contain, so `--eval="a=b"` works.
 */
export function parseFlags(argv = process.argv.slice(2)) {
  return Object.fromEntries(
    argv.map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.length ? v.join('=') : true];
    }),
  );
}

/** `'1600x900'` → `{ width: 1600, height: 900 }`, falling back per axis. */
export function parseSize(s, fallback = { width: 1600, height: 900 }) {
  const [width, height] = String(s).split('x').map(Number);
  return { width: width || fallback.width, height: height || fallback.height };
}

/** Chrome flags for the real GPU: ANGLE on Metal, no blocklist, and WebGPU on. */
export const GPU_ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'];

/**
 * Launches the installed Chrome. `gpu` adds the real-GPU flags, and `autoplay` lets audio start without
 * a gesture (for flows that unlock sound).
 */
export function launchChrome({ gpu = true, autoplay = false } = {}) {
  const args = gpu ? [...GPU_ARGS] : [];
  if (autoplay) args.push('--autoplay-policy=no-user-gesture-required');
  return chromium.launch({ channel: 'chrome', ...(args.length ? { args } : {}) });
}

/**
 * Pushes the page's console messages of the given `types` (as `[type] text`) and uncaught page errors
 * (as `[pageerror] message`) into `logs`, and returns it.
 */
export function collectLogs(page, { types = ['error', 'warning'], logs = [] } = {}) {
  page.on('console', (m) => {
    if (types.includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return logs;
}

/**
 * Waits for the game's title screen with the splash gone (it holds for a moment even on a fast load, so
 * `screen === 'title'` alone can still show it). Returns `Date.now()` from when the title was reached.
 */
export async function waitForTitle(page, timeout = 120_000) {
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout });
  const reachedAt = Date.now();
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15_000 });
  return reachedAt;
}
