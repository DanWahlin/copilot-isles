import { activateCourse } from '../course/load';
import { createCove, type CoveScene } from '../world/cove-scene';
import { createDevHarness, type DevHarness } from './harness';

/**
 * Boots a dev page on the Test Cove world: the course pack its content comes from (a voyage loads it
 * the same way), the harness, and the cove (`?noveg` leaves out its plants). `coveMs`: the cove's
 * build time.
 */
export async function createCovePage(): Promise<{ h: DevHarness; cove: CoveScene; coveMs: number }> {
  await activateCourse();
  const h = await createDevHarness();
  const t0 = performance.now();
  const cove = await createCove(h.engine, { vegetation: !h.q.has('noveg') });
  return { h, cove, coveMs: performance.now() - t0 };
}
