import { describe, expect, it, vi } from 'vitest';
import { RETRY_AFTER_MS, StreamLifecycle } from './stream-lifecycle';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('StreamLifecycle', () => {
  it('streams once per residency, frees, and streams again for the next load', async () => {
    let built = 0;
    let freed = 0;
    const life = new StreamLifecycle<{ n: number }>(
      async () => ({ n: ++built }),
      async () => void freed++,
    );
    const heard: number[] = [];
    life.onReady((w) => heard.push(w.n));
    const first = life.ready;
    const [a, b] = await Promise.all([life.load(), life.load()]);
    expect(a).toBe(b);
    expect(await first).toEqual({ n: 1 });
    expect(life.state).toBe('resident');
    const next = life.ready;
    await life.unload();
    expect(life.state).toBe('absent');
    expect(freed).toBe(1);
    expect(life.ready).not.toBe(next);
    const again = await life.load();
    expect(again).toEqual({ n: 2 });
    expect(life.loads).toBe(2);
    expect(heard).toEqual([1, 2]);
  });

  it('waits for a free in progress before streaming in again', async () => {
    const order: string[] = [];
    let release!: () => void;
    const life = new StreamLifecycle<string>(
      async () => (order.push('build'), 'world'),
      () => new Promise<void>((r) => (release = () => (order.push('freed'), r()))),
    );
    await life.load();
    void life.unload();
    expect(life.state).toBe('unloading');
    const back = life.load();
    await tick();
    expect(order).toEqual(['build']);
    release();
    expect(await back).toBe('world');
    expect(order).toEqual(['build', 'freed', 'build']);
    expect(life.state).toBe('resident');
  });

  it('starts resident for a world built with the scene, and ends with null for waiters', async () => {
    const life = new StreamLifecycle<string>(
      async () => 'again',
      async () => {},
    );
    life.markResident('home');
    expect(life.state).toBe('resident');
    expect(life.loads).toBe(1);
    expect(await life.ready).toBe('home');
    await life.unload();
    const waiting = life.ready;
    life.end();
    expect(await waiting).toBeNull();
    expect(await life.load()).toBeNull();
  });

  it('fails into a wait (no stream every frame), then tries again after it or when asked', async () => {
    let clock = 0;
    let builds = 0;
    let fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const life = new StreamLifecycle<string>(
      async () => {
        builds++;
        if (fail) throw new Error('404');
        return 'world';
      },
      async () => {},
      false,
      () => clock,
    );
    const waiting = life.ready;
    expect(await life.load()).toBeNull();
    expect(life.state).toBe('failed');
    expect(await waiting).toBeNull();
    for (let i = 0; i < 10; i++) expect(await life.load()).toBeNull();
    expect(builds).toBe(1);
    clock += RETRY_AFTER_MS - 1;
    await life.load();
    expect(builds).toBe(1);
    clock += 1;
    await life.load();
    expect(builds).toBe(2);
    // Asked for at once (a jump there): it doesn't wait.
    fail = false;
    expect(await life.load(true)).toBe('world');
    expect(builds).toBe(3);
    expect(life.state).toBe('resident');
    expect(life.loads).toBe(1);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
