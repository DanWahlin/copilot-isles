import { describe, expect, it } from 'vitest';
import { FrameCounters, type InfoLike } from './frame-counters';

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
});
