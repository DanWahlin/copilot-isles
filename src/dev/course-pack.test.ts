import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DEV = new URL('.', import.meta.url);

// Dev pages that build the world read course content (the cove's signs, cast and sites), and a page
// that didn't activate a pack first stopped at "No course pack is active yet" (leaps.html,
// characters.html). Each one activates it first, as a voyage does (docs/specs/COURSE-PACKS.md).
describe('dev pages and course packs', () => {
  const pages = readdirSync(DEV).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const builders = pages.filter((f) =>
    /\bcreate(Cove|Session)\(/.test(readFileSync(new URL(f, DEV), 'utf8')),
  );

  it('finds the pages that build the world', () => {
    expect(builders).toEqual(
      expect.arrayContaining(['cove-page.ts', 'play.ts', 'leaps.ts', 'characters.ts']),
    );
  });

  it.each(builders)('%s activates a course pack before it builds', (file) => {
    const src = readFileSync(new URL(file, DEV), 'utf8');
    const activate = src.search(/\bawait activateCourse\(/);
    const build = src.search(/\bcreate(Cove|Session)\(/);
    expect(activate, 'awaits activateCourse()').toBeGreaterThanOrEqual(0);
    expect(activate).toBeLessThan(build);
  });
});
