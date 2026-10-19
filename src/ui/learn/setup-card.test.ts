import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { COURSE } from '../../course/catalog';
import { activateCourse } from '../../course/load';
import type { LearnStore } from '../../learn/store';
import { SetupCard } from './PageViews';

const card = () => renderToStaticMarkup(createElement(SetupCard, { store: {} as LearnStore }));

/** The Logbook's Your setup card reads its rows' labels from the course, and only asks what it has. */
describe('the Your setup card', () => {
  afterAll(async () => {
    await activateCourse('copilot-app');
  });

  it('labels its rows with the course’s words', async () => {
    await activateCourse('copilot-app');
    const html = card();
    const setup = COURSE.setup!;
    for (const label of [setup.os.label, setup.issue.label, setup.branch.label, setup.model.label])
      expect(html).toContain(`>${label}</span>`);
    expect(html).toContain(`#${COURSE.practice!.issue}`);
    expect(html).toContain(COURSE.practice!.branch);
    expect(html).toContain('Your fork');
    expect(html).not.toMatch(/Practice issue|Session branch|>Computer</);
  });

  it('leaves out the fork, issue and branch for a course without a practice repository', async () => {
    await activateCourse('copilot-app');
    const meta = COURSE as { practice?: typeof COURSE.practice };
    const practice = meta.practice;
    delete meta.practice;
    try {
      const html = card();
      expect(html).toContain(`>${COURSE.setup!.os.label}</span>`);
      expect(html).toContain(`>${COURSE.setup!.model.label}</span>`);
      expect(html).not.toContain(COURSE.setup!.issue.label);
      expect(html).not.toContain(COURSE.setup!.branch.label);
      expect(html).not.toContain('Your fork');
    } finally {
      meta.practice = practice;
    }
  });

  it('isn’t there for a course that asks for no setup', async () => {
    await activateCourse('copilot-cli');
    expect(COURSE.setup).toBeUndefined();
    expect(COURSE.practice).toBeUndefined();
    expect(card()).toBe('');
  });
});
