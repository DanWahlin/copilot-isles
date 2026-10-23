// Adapted from three.js © 2010-2026 three.js authors, MIT,
// src/renderers/webgpu/utils/WebGPUTimestampQueryPool.js@r186 (0.186.1); see THIRD_PARTY_NOTICES.md.
import type { WebGPURenderer } from 'three/webgpu';

/**
 * GPU time per frame from WebGPU's pass timestamps, read as the time the GPU was busy (issues.md #11).
 *
 * three r186 writes a timestamp at the start and the end of every render pass and reports a frame's
 * GPU time as the sum of its passes' durations. On Apple GPUs (Metal via Dawn) a pass's start is
 * sampled when its vertex stage starts, which is as soon as it's queued, and a pass that reads an
 * earlier pass's output then waits for it inside its own interval. The passes of a frame overlap: on
 * High at Anchorage all seven start within 0.75 ms and end in a staircase, so the sum read 19.5 ms
 * for a frame whose passes all lie within 5.0 ms (and 7.1 ms for 1.9 ms uncapped, at 227 fps, where a
 * frame can't hold more than 4.4 ms of GPU work). The sum counts the waits again for every pass.
 *
 * This pool is three's own, but it keeps each pass's start and end and reads a frame as the union of
 * its passes' intervals: the time any of them was on the GPU, overlaps and gaps between submits
 * counted once. It goes in the backend's public `timestampQueryPool` slot, so three's passes write
 * into it; `resolveTimestampsAsync('render')` returns the union, and `lastSum` keeps three's sum.
 */

/** The union of intervals [starts[i], ends[i]] (any order; sorted in place by start), and their sum. */
export function intervalUnion(
  starts: Float64Array,
  ends: Float64Array,
  n: number,
): { union: number; sum: number } {
  // Insertion sort by start: a frame has a handful of passes.
  for (let i = 1; i < n; i++) {
    const s = starts[i]!;
    const e = ends[i]!;
    let j = i - 1;
    while (j >= 0 && starts[j]! > s) {
      starts[j + 1] = starts[j]!;
      ends[j + 1] = ends[j]!;
      j--;
    }
    starts[j + 1] = s;
    ends[j + 1] = e;
  }
  let union = 0;
  let sum = 0;
  let from = 0;
  let to = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = starts[i]!;
    const e = ends[i]!;
    sum += e - s;
    if (s > to) {
      if (to > from) union += to - from;
      from = s;
      to = e;
    } else if (e > to) to = e;
  }
  if (n > 0 && to > from) union += to - from;
  return { union, sum };
}

const UID_FRAME = /:f(\d+)$/;

/** Read through a call: the map state changes across an await, which narrowing can't see. */
const isMapped = (b: GPUBuffer): boolean => b.mapState === 'mapped';

/** three's TimestampQueryPool interface (common/TimestampQueryPool.js), as its backend uses it. */
export class BusyTimestampPool {
  trackTimestamp = true;
  readonly maxQueries: number;
  currentQueryIndex = 0;
  readonly queryOffsets = new Map<string, number>();
  isDisposed = false;
  /** The last resolved frame's union of pass intervals (ms): the time the GPU was busy. */
  lastValue = 0;
  /** The last resolved frame's sum of pass durations (ms), as three reports it. */
  lastSum = 0;
  frames: number[] = [];
  pendingResolve: Promise<number> | null = null;
  /** Each pass's duration (ms) in the last resolve, by uid (three's inspector reads these). */
  readonly timestamps = new Map<string, number>();
  readonly querySet: GPUQuerySet;
  private readonly resolveBuffer: GPUBuffer;
  private readonly resultBuffer: GPUBuffer;
  private readonly starts: Float64Array;
  private readonly ends: Float64Array;
  private readonly offsets = new Map<string, number>();

  constructor(
    private readonly device: GPUDevice,
    readonly type: string,
    maxQueries = 2048,
  ) {
    this.maxQueries = maxQueries;
    this.querySet = device.createQuerySet({
      label: `queryset_global_timestamp_${type}`,
      type: 'timestamp',
      count: maxQueries,
    });
    const size = maxQueries * 8;
    this.resolveBuffer = device.createBuffer({
      label: `buffer_timestamp_resolve_${type}`,
      size,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.resultBuffer = device.createBuffer({
      label: `buffer_timestamp_result_${type}`,
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.starts = new Float64Array(maxQueries / 2);
    this.ends = new Float64Array(maxQueries / 2);
  }

  getTimestampFrames(): number[] {
    return this.frames;
  }

  getTimestamp(uid: string): number {
    return this.timestamps.get(uid) ?? 0;
  }

  hasTimestampQuery(uid: string): boolean {
    return this.timestamps.has(uid);
  }

  allocateQueriesForContext(uid: string): number | null {
    if (!this.trackTimestamp || this.isDisposed) return null;
    if (this.currentQueryIndex + 2 > this.maxQueries) {
      void this.resolveQueriesAsync();
      this.currentQueryIndex = 0;
      this.queryOffsets.clear();
    }
    const base = this.currentQueryIndex;
    this.currentQueryIndex += 2;
    this.queryOffsets.set(uid, base);
    return base;
  }

  async resolveQueriesAsync(): Promise<number> {
    if (!this.trackTimestamp || this.currentQueryIndex === 0 || this.isDisposed) return this.lastValue;
    if (this.pendingResolve) return this.pendingResolve;
    this.pendingResolve = this.resolve();
    try {
      return await this.pendingResolve;
    } finally {
      this.pendingResolve = null;
    }
  }

  private async resolve(): Promise<number> {
    if (this.isDisposed || this.resultBuffer.mapState !== 'unmapped') return this.lastValue;
    const offsets = this.offsets;
    offsets.clear();
    for (const [uid, base] of this.queryOffsets) offsets.set(uid, base);
    const count = this.currentQueryIndex;
    const bytes = count * 8;
    this.currentQueryIndex = 0;
    this.queryOffsets.clear();
    const encoder = this.device.createCommandEncoder();
    encoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.resultBuffer, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    if (this.resultBuffer.mapState !== 'unmapped') return this.lastValue;
    try {
      await this.resultBuffer.mapAsync(GPUMapMode.READ, 0, bytes);
      if (this.isDisposed) {
        if (isMapped(this.resultBuffer)) this.resultBuffer.unmap();
        return this.lastValue;
      }
      // Nanosecond ticks as two 32-bit halves: no BigInt per pass.
      const words = new Uint32Array(this.resultBuffer.getMappedRange(0, bytes));
      const at = (q: number) => words[q * 2 + 1]! * 4294967296 + words[q * 2]!;
      let last = -1;
      for (const uid of offsets.keys()) {
        const m = UID_FRAME.exec(uid);
        if (m) last = Math.max(last, Number(m[1]));
      }
      this.timestamps.clear();
      this.frames.length = 0;
      let n = 0;
      let origin = Infinity;
      for (const [uid, base] of offsets) {
        const s = at(base);
        const e = at(base + 1);
        const m = UID_FRAME.exec(uid);
        const frame = m ? Number(m[1]) : -1;
        if (!this.frames.includes(frame)) this.frames.push(frame);
        // A pass that wrote no valid pair (zero, or an end before its start) isn't counted.
        const valid = s > 0 && e >= s;
        this.timestamps.set(uid, valid ? (e - s) / 1e6 : 0);
        if (frame !== last || !valid) continue;
        this.starts[n] = s;
        this.ends[n] = e;
        origin = Math.min(origin, s);
        n++;
      }
      this.resultBuffer.unmap();
      if (n === 0) return this.lastValue;
      for (let i = 0; i < n; i++) {
        this.starts[i] = (this.starts[i]! - origin) / 1e6;
        this.ends[i] = (this.ends[i]! - origin) / 1e6;
      }
      const { union, sum } = intervalUnion(this.starts, this.ends, n);
      this.lastValue = union;
      this.lastSum = sum;
      return union;
    } catch {
      if (isMapped(this.resultBuffer)) this.resultBuffer.unmap();
      return this.lastValue;
    }
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.pendingResolve) await this.pendingResolve.catch(() => 0);
    if (isMapped(this.resultBuffer)) this.resultBuffer.unmap();
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    this.resultBuffer.destroy();
    this.queryOffsets.clear();
    this.timestamps.clear();
    this.frames.length = 0;
  }
}

interface TimestampBackend {
  isWebGPUBackend?: boolean;
  trackTimestamp?: boolean;
  device?: GPUDevice;
  timestampQueryPool?: { render: unknown };
}

/**
 * Puts a `BusyTimestampPool` in a WebGPU renderer's render timestamp slot (null on WebGL2, or without
 * timestamps). A pool three made already (a frame drawn before) is disposed and replaced.
 */
export function installBusyTimestamps(renderer: WebGPURenderer): BusyTimestampPool | null {
  const backend = renderer.backend as unknown as TimestampBackend;
  if (!backend.isWebGPUBackend || backend.trackTimestamp !== true || !backend.device) return null;
  const slots = backend.timestampQueryPool;
  if (!slots) return null;
  const old = slots.render as { dispose?: () => unknown } | null;
  const pool = new BusyTimestampPool(backend.device, 'render', 2048);
  slots.render = pool;
  void old?.dispose?.();
  return pool;
}
