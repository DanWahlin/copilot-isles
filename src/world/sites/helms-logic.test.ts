import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight } from '../islands/meridian';
import {
  BERTH_APPROACH,
  HELM_ORDER,
  MERIDIAN_HELMS,
  helmCourse,
  helmsCourseArea,
  nextHelm,
  TAKE_RANGE,
  sampleCourse,
} from './helms-logic';

/** Deepest point under a hull 6.6 m wide at (x, z), whichever way she's heading (a conservative disc). */
function shallowest(x: number, z: number, r = 6): number {
  let top = meridianHeight(x, z);
  for (let a = 0; a < 8; a++)
    top = Math.max(top, meridianHeight(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r));
  return top;
}

describe('the Three Helms', () => {
  it('sails the modes in the course’s order', () => {
    expect(HELM_ORDER).toEqual(['interactive', 'plan', 'autopilot']);
    expect(nextHelm([])).toBe('interactive');
    expect(nextHelm(['interactive'])).toBe('plan');
    expect(nextHelm(['interactive', 'plan', 'autopilot'])).toBeNull();
  });

  it('keeps every course in deep water under the whole hull', () => {
    for (const run of Object.values(MERIDIAN_HELMS)) {
      const course = sampleCourse(helmCourse(run));
      // The Autopilot run's last stretch runs up beside the east arm into the berth's dredged water.
      const open = run.mode === 'autopilot' ? course.filter((p) => p.z > -650) : course;
      for (const p of open)
        expect(shallowest(p.x, p.z), `${run.mode} ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeLessThan(-3.5);
      for (const p of course) expect(meridianHeight(p.x, p.z), `${run.mode} centre`).toBeLessThan(-3.5);
    }
  });

  it('chains the buoys: each run finishes in reach of the next helm but clear of it, and Autopilot ends at the berth approach', () => {
    const { interactive, plan, autopilot } = MERIDIAN_HELMS;
    const end = (r: typeof interactive) => r.route[r.route.length - 1]!;
    for (const [from, to] of [
      [interactive, plan],
      [plan, autopilot],
    ] as const) {
      const d = Math.hypot(end(from).x - to.buoy.x, end(from).z - to.buoy.z);
      expect(d).toBeLessThan(TAKE_RANGE - 4);
      expect(d).toBeGreaterThan(18);
    }
    expect(end(autopilot)).toEqual({ x: BERTH_APPROACH.x, z: BERTH_APPROACH.z });
    // The approach lines up with the berth, clear of the arm's face.
    expect(Math.abs(BERTH_APPROACH.x - MERIDIAN.harbor.berth.x)).toBeLessThan(1);
    expect(plan.plan).toHaveLength(plan.route.length);
  });

  it('never sails a hull over a buoy', () => {
    const { interactive, plan, autopilot } = MERIDIAN_HELMS;
    const end = (r: typeof interactive) => r.route[r.route.length - 1]!;
    const buoys = Object.values(MERIDIAN_HELMS).map((r) => r.buoy);
    // Each run as she really sails it: Plan and Autopilot start where the last run stopped.
    const runs = [
      sampleCourse(helmCourse(interactive)).filter(
        (p) => Math.hypot(p.x - interactive.buoy.x, p.z - interactive.buoy.z) > 20,
      ),
      sampleCourse([end(interactive), ...plan.route]),
      sampleCourse([end(plan), ...autopilot.route]),
    ];
    for (const course of runs)
      for (const p of course)
        for (const b of buoys) expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(14);
  });

  it('keeps the buoys apart and outside the harbour mouth', () => {
    const buoys = Object.values(MERIDIAN_HELMS).map((r) => r.buoy);
    for (let i = 0; i < buoys.length; i++)
      for (let j = i + 1; j < buoys.length; j++)
        expect(Math.hypot(buoys[i]!.x - buoys[j]!.x, buoys[i]!.z - buoys[j]!.z)).toBeGreaterThan(40);
    for (const b of buoys) expect(b.z).toBeGreaterThan(MERIDIAN.mole.lighthouse.z + 20);
  });
});

describe('helmsCourseArea', () => {
  it('takes in every buoy and mark with sea to spare (the leaps keep out of it)', () => {
    const area = helmsCourseArea(30);
    for (const m of HELM_ORDER)
      for (const p of helmCourse(MERIDIAN_HELMS[m]))
        expect(Math.hypot(p.x - area.x, p.z - area.z)).toBeLessThanOrEqual(area.r - 30 + 1e-9);
  });
});
