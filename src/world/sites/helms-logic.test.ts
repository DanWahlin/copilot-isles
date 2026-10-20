import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight } from '../islands/meridian';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BERTH_APPROACH,
  HELM_ORDER,
  HELM_ORDERS,
  MERIDIAN_HELMS,
  MODE_INFO,
  SHOAL,
  helmCourse,
  helmsCourseArea,
  steerLeg,
  nextHelm,
  TAKE_RANGE,
  sampleCourse,
} from './helms-logic';
import { REVIEW_OPTIONS } from '../../game/puzzles/three-helms';

const COURSE = (short: string) =>
  readFileSync(join(__dirname, `../../../courses/copilot-app/public/course/${short}/README.md`), 'utf8');
const VOICE = JSON.parse(
  readFileSync(join(__dirname, '../../../courses/copilot-app/voice/lines.json'), 'utf8'),
) as {
  lines: { id: string; text: string }[];
};

/** Deepest point under a hull 6.6 m wide at (x, z), whichever way she's heading (a conservative disc). */
function shallowest(x: number, z: number, r = 6): number {
  let top = meridianHeight(x, z);
  for (let a = 0; a < 8; a++)
    top = Math.max(top, meridianHeight(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r));
  return top;
}

describe('the Three Helms', () => {
  it('sails the modes in the course’s order', () => {
    expect(HELM_ORDER).toEqual(['steer', 'review', 'auto']);
    expect(nextHelm([])).toBe('steer');
    expect(nextHelm(['steer'])).toBe('review');
    expect(nextHelm(['steer', 'review', 'auto'])).toBeNull();
    // The Copilot app course's modes, bound to the helms they act out.
    expect(Object.values(MODE_INFO).map((m) => m.name)).toEqual(['Interactive', 'Plan', 'Autopilot']);
  });

  it('hands you an order from the course’s use cases at each buoy, with a reason for every wrong helm', () => {
    for (const mode of HELM_ORDER) {
      const order = HELM_ORDERS[mode];
      expect(order.wrong[mode], mode).toBeNull();
      const ids = [order.line, ...HELM_ORDER.filter((m) => m !== mode).map((m) => order.wrong[m]!)];
      for (const id of ids)
        expect(
          VOICE.lines.some((l) => l.id === id),
          id,
        ).toBe(true);
    }
    // Autopilot on the reef passage stops with the spec's line (POC §6.5).
    const balk = VOICE.lines.find((l) => l.id === HELM_ORDERS.review.wrong.auto)!;
    expect(balk.text).toContain('This passage is one where the approach matters. Chart it first.');
  });

  it('names the modes and the review’s options as the course does', () => {
    const ch01 = COURSE('ch01');
    for (const m of HELM_ORDER) expect(ch01, m).toContain(`"${MODE_INFO[m].says}"`);
    const ch02 = COURSE('ch02');
    for (const o of REVIEW_OPTIONS) expect(ch02, o.id).toContain(o.label);
  });

  it('charts the review helm’s first route straight across the Shoal, and the fixed one well clear of it', () => {
    const { review } = MERIDIAN_HELMS;
    const near = (pts: { x: number; z: number }[]) =>
      Math.min(...pts.map((p) => Math.hypot(p.x - SHOAL.x, p.z - SHOAL.z)));
    expect(near(sampleCourse([review.buoy, ...review.draft!.route]))).toBeLessThan(4);
    expect(near(sampleCourse([review.buoy, ...review.route]))).toBeGreaterThan(20);
    expect(review.draft!.plan).toHaveLength(review.draft!.route.length);
    expect(review.draft!.plan.some((l) => l.includes('Shoal'))).toBe(true);
    expect(review.plan!.some((l) => l.includes('Shoal'))).toBe(true);
  });

  it('gives you two headings at every Interactive mark, each ending at the mark', () => {
    const { steer } = MERIDIAN_HELMS;
    expect(steer.headings).toHaveLength(steer.route.length);
    steer.headings!.forEach((pair, leg) => {
      expect(new Set(pair.map((h) => h.id)).size).toBe(2);
      for (const h of pair) expect(steerLeg(leg, h).at(-1)).toEqual(steer.route[leg]);
    });
  });

  it('keeps every course in deep water under the whole hull', () => {
    const { steer } = MERIDIAN_HELMS;
    const legs = steer.headings!.flatMap((pair, leg) =>
      pair.map((h) => sampleCourse([leg === 0 ? steer.buoy : steer.route[leg - 1]!, ...steerLeg(leg, h)])),
    );
    for (const course of legs)
      for (const p of course) expect(shallowest(p.x, p.z), `steer ${p.x},${p.z}`).toBeLessThan(-3.5);
    for (const run of Object.values(MERIDIAN_HELMS)) {
      const course = sampleCourse(helmCourse(run));
      // The Autopilot run's last stretch runs up beside the east arm into the berth's dredged water.
      const open = run.mode === 'auto' ? course.filter((p) => p.z > -650) : course;
      for (const p of open)
        expect(shallowest(p.x, p.z), `${run.mode} ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeLessThan(-3.5);
      for (const p of course) expect(meridianHeight(p.x, p.z), `${run.mode} centre`).toBeLessThan(-3.5);
    }
  });

  it('chains the buoys: each run finishes in reach of the next helm but clear of it, and Autopilot ends at the berth approach', () => {
    const { steer, review, auto } = MERIDIAN_HELMS;
    const end = (r: typeof steer) => r.route[r.route.length - 1]!;
    for (const [from, to] of [
      [steer, review],
      [review, auto],
    ] as const) {
      const d = Math.hypot(end(from).x - to.buoy.x, end(from).z - to.buoy.z);
      expect(d).toBeLessThan(TAKE_RANGE - 4);
      expect(d).toBeGreaterThan(18);
    }
    expect(end(auto)).toEqual({ x: BERTH_APPROACH.x, z: BERTH_APPROACH.z });
    // The approach lines up with the berth, clear of the arm's face.
    expect(Math.abs(BERTH_APPROACH.x - MERIDIAN.harbor.berth.x)).toBeLessThan(1);
    expect(review.plan).toHaveLength(review.route.length);
  });

  it('never sails a hull over a buoy', () => {
    const { steer, review, auto } = MERIDIAN_HELMS;
    const end = (r: typeof steer) => r.route[r.route.length - 1]!;
    const buoys = [...Object.values(MERIDIAN_HELMS).map((r) => r.buoy), SHOAL];
    // Each run as she really sails it: Plan and Autopilot start where the last run stopped, and each
    // Interactive leg goes the way you choose.
    const legs = steer.headings!.flatMap((pair, leg) =>
      pair.map((h) =>
        sampleCourse([leg === 0 ? steer.buoy : steer.route[leg - 1]!, ...steerLeg(leg, h)]).filter(
          (p) => Math.hypot(p.x - steer.buoy.x, p.z - steer.buoy.z) > 20,
        ),
      ),
    );
    const runs = [
      ...legs,
      sampleCourse([end(steer), ...review.route]),
      sampleCourse([end(review), ...auto.route]),
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
