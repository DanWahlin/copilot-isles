import { describe, expect, it } from 'vitest';
import { badgeData, courseComplete } from './badge';
import { agoText, resumeSummary } from './resume';

describe('where you left off', () => {
  const tracker = {
    island: 'Port Meridian',
    chapter: 'Chapter 01',
    next: 'The next island is open.',
    tasks: [
      { title: 'One', task: 'Do one', detail: '', status: 'done' },
      { title: 'Side', task: 'A side task', detail: 'Side step', status: 'active', optional: true },
      { title: 'Two', task: 'Do two', detail: 'Talk to someone.', status: 'active' },
    ],
  };

  it('names the island, the main task on now, its next step and what was learned last', () => {
    const now = new Date(2026, 9, 23, 18).getTime();
    const s = resumeSummary(tracker, 'A page', {
      previousSave: new Date(2026, 9, 21, 9).getTime(),
      now,
      later: 2,
    });
    expect(s).toEqual({
      island: 'Port Meridian',
      chapter: 'Chapter 01',
      task: { title: 'Two', task: 'Do two' },
      next: 'Talk to someone.',
      learned: 'A page',
      ago: '2 days ago',
      later: 2,
    });
  });

  it("says what's after the island once every task's done", () => {
    const done = { ...tracker, tasks: tracker.tasks.map((t) => ({ ...t, status: 'done' })) };
    const s = resumeSummary(done, null, { previousSave: 0, now: 1, later: 0 });
    expect(s?.task).toBeNull();
    expect(s?.next).toBe('The next island is open.');
    expect(s?.ago).toBeNull();
    expect(resumeSummary(null, null, { previousSave: 0, now: 1, later: 0 })).toBeNull();
  });

  it('counts days by the calendar', () => {
    const now = new Date(2026, 9, 23, 8).getTime();
    expect(agoText(new Date(2026, 9, 23, 1).getTime(), now)).toBe('Earlier today');
    expect(agoText(new Date(2026, 9, 22, 23).getTime(), now)).toBe('Yesterday');
    expect(agoText(new Date(2026, 9, 2).getTime(), now)).toBe('3 weeks ago');
    expect(agoText(new Date(2025, 0, 1).getTime(), now)).toBe('A while ago');
    expect(agoText(now + 1000, now)).toBeNull();
  });
});

describe('the Seal card and the certificate', () => {
  const islands = [
    { label: '00 · One', seal: 'Seal of One' },
    { label: '01 · Two', seal: 'Seal of Two' },
  ];
  const base = {
    captain: 'Robin',
    ship: 'The Gull',
    courseTitle: 'A Course',
    courseUrl: 'https://github.com/example-org/a-course',
    islands,
    date: new Date(2026, 9, 23, 12),
  };

  it('is complete once every charted Seal is held', () => {
    expect(courseComplete(islands, ['Seal of One'])).toBe(false);
    expect(courseComplete(islands, ['Seal of Two', 'Seal of One'])).toBe(true);
    expect(courseComplete([], [])).toBe(false);
  });

  it("writes a Seal card's words and its text from the course's data", () => {
    const b = badgeData({ ...base, kind: 'seal', seal: 'Seal of One', earned: ['Seal of One'] });
    expect(b.heading).toBe('Seal of One');
    expect(b.who).toBe('Captain Robin of The Gull');
    expect(b.text).toBe(
      'Captain Robin of The Gull earned the Seal of One for Chapter 00 · One of A Course in Copilot Isles (2026-10-23). https://github.com/example-org/a-course',
    );
    expect(b.seals.map((s) => s.held)).toEqual([true, false]);
  });

  it('lists every Seal on the certificate', () => {
    const b = badgeData({ ...base, captain: null, kind: 'course', earned: ['Seal of One', 'Seal of Two'] });
    expect(b.heading).toBe('Voyage complete');
    expect(b.text).toBe(
      'The captain of The Gull completed every charted chapter of A Course in Copilot Isles: Seal of One, Seal of Two (2026-10-23). https://github.com/example-org/a-course',
    );
  });
});
