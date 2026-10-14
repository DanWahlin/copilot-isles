import { describe, expect, it } from 'vitest';
import { FrameCounters, limitGpuMs, type InfoLike } from './frame-counters';

/** Mimics three 0.186's Info: reset() clears per-frame metrics; `calls` (lifetime) is never read. */
function stubInfo(): InfoLike & { draw(n: number, tris: number): void } {
  const info = {
    autoReset: true,
    render: { drawCalls: 0, frameCalls: 0, triangles: 0, calls: 0 },
    memory: { geometries: 3, textures: 2, programs: 5, texturesSize: 2 * 1048576, total: 8 * 1048576 },
    reset() {
      info.render.drawCalls = 0;
      info.render.frameCalls = 0;
      info.render.triangles = 0;
    },
    draw(n: number, tris: number) {
      info.render.frameCalls++;
      info.render.calls++;
      info.render.drawCalls += n;
      info.render.triangles += tris;
    },
  };
  return info;
}

describe('FrameCounters', () => {
  it('turns off auto-reset and sums passes within a frame without accumulating across frames', () => {
    const info = stubInfo();
    const c = new FrameCounters({ info });
    expect(info.autoReset).toBe(false);
    for (let frame = 0; frame < 2; frame++) {
      c.beginFrame();
      info.draw(10, 1000); // scene pass
      info.draw(2, 4); // post pass
      c.endFrame(frame);
    }
    expect(c.last.drawCalls).toBe(12);
    expect(c.last.frameCalls).toBe(2);
    expect(c.last.triangles).toBe(1004);
    expect(c.last.textureMB).toBeCloseTo(2);
    expect(c.last.trackedMB).toBeCloseTo(8);
  });

  it('records a hitch only when resources grow after arming', () => {
    const info = stubInfo();
    const c = new FrameCounters({ info });
    info.memory.programs = 9;
    c.endFrame(0); // not armed yet: no hitch
    c.arm();
    c.endFrame(1);
    expect(c.hitches).toEqual([]);
    info.memory.programs = 10;
    c.endFrame(2);
    expect(c.hitches).toEqual([{ t: 2, programs: 1, geometries: 0, textures: 0 }]);
  });

  it('excuses a precompiled late addition while it loads and for a few frames after', async () => {
    const info = stubInfo();
    const c = new FrameCounters({ info });
    c.arm();
    let finish!: () => void;
    const work = c.excuse(new Promise<void>((resolve) => (finish = resolve)), 2);
    info.memory.programs = 7;
    c.endFrame(1);
    finish();
    await work;
    await Promise.resolve();
    info.memory.textures += 1;
    c.endFrame(2);
    info.memory.geometries += 1;
    c.endFrame(3);
    expect(c.hitches).toEqual([]);
    info.memory.programs = 8;
    c.endFrame(4);
    expect(c.hitches).toEqual([{ t: 4, programs: 1, geometries: 0, textures: 0 }]);
  });

  it('records frame gaps over 50 ms as stalls once armed, apart from hitches', async () => {
    const c = new FrameCounters({ info: stubInfo() });
    c.stage = () => 'playing';
    c.noteFrameGap(200, 0); // not armed yet
    c.arm();
    c.noteFrameGap(16.7, 1);
    c.noteFrameGap(50, 2);
    c.noteFrameGap(120.4, 3);
    let finish!: () => void;
    const work = c.excuse(new Promise<void>((resolve) => (finish = resolve)));
    c.noteFrameGap(80, 4);
    finish();
    await work;
    expect(c.stalls).toEqual([
      { t: 3, ms: 120, stage: 'playing' },
      { t: 4, ms: 80, stage: 'playing', excused: true },
    ]);
    expect(c.hitches).toEqual([]);
  });
});

describe('limitGpuMs', () => {
  it('limits an Apple-style pass-sum reading to the frame time', () => {
    expect(limitGpuMs(10.3, 1.8)).toBe(1.8);
    expect(limitGpuMs(143, 16.7)).toBe(16.7);
  });

  it('keeps a reading that is below the frame time', () => {
    expect(limitGpuMs(6.6, 16.7)).toBe(6.6);
    expect(limitGpuMs(16.7, 16.7)).toBe(16.7);
  });

  it('returns 0 when there is no reading', () => {
    expect(limitGpuMs(0, 16.7)).toBe(0);
    expect(limitGpuMs(-1, 16.7)).toBe(0);
    expect(limitGpuMs(Number.NaN, 16.7)).toBe(0);
  });

  it('never returns a negative value for a bad frame time', () => {
    expect(limitGpuMs(5, -2)).toBe(0);
  });
});
