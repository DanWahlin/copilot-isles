import { describe, expect, it } from 'vitest';
import {
  boldTerms,
  createSlugger,
  headingText,
  imagePaths,
  normalizeForCompare,
  parseSections,
} from './sections';

describe('headingText', () => {
  it('drops inline markdown, links, images, and HTML tags', () => {
    expect(headingText('**Step 1:** Open [the app](https://example.com) `New`')).toBe(
      'Step 1: Open the app New',
    );
    expect(headingText('<a id="x"></a>Connect ![icon](a.png) _now_')).toBe('Connect icon now');
  });
});

describe('createSlugger', () => {
  it('follows GitHub heading anchors', () => {
    const slug = createSlugger();
    expect(slug('Connect to your repository')).toBe('connect-to-your-repository');
    expect(slug('Step 1: Sign in (optional)!')).toBe('step-1-sign-in-optional');
    expect(slug("What's a worktree?")).toBe('whats-a-worktree');
    expect(slug('Modes & models')).toBe('modes--models');
  });

  it('numbers repeated headings', () => {
    const slug = createSlugger();
    expect([slug('Try it'), slug('Try it'), slug('Try it')]).toEqual(['try-it', 'try-it-1', 'try-it-2']);
  });

  it('skips a suffix that a real heading already uses', () => {
    const slug = createSlugger();
    expect([slug('Try it-1'), slug('Try it'), slug('Try it')]).toEqual(['try-it-1', 'try-it', 'try-it-2']);
  });
});

describe('imagePaths', () => {
  it('finds markdown and HTML images in order', () => {
    const md = [
      '<img src="../assets/first.webp" alt="First">',
      '![Second](images/second.webp "title")',
      '![Third](<images/third image.webp>)',
    ].join('\n');
    expect(imagePaths(md)).toEqual(['../assets/first.webp', 'images/second.webp', 'images/third image.webp']);
  });
});

describe('boldTerms', () => {
  it('returns bolded UI names once, without code marks', () => {
    expect(boldTerms('Select **New**, then **`My work`**, then **New** again. __Automations__.')).toEqual([
      'New',
      'My work',
      'Automations',
    ]);
  });

  it('ignores long bold runs', () => {
    expect(boldTerms(`**${'x'.repeat(49)}**`)).toEqual([]);
  });
});

describe('parseSections', () => {
  const readme = [
    '# Chapter 00',
    'Intro text.',
    '',
    '## Install the app',
    'Select **Download**.',
    '![App](../assets/app.webp)',
    '',
    '### Sign in',
    'Select **Sign in**.',
    '```md',
    '## Not a heading',
    '```',
    '',
    '## Install the app',
    'Second one.',
  ].join('\r\n');

  it('splits a README at each heading, ignoring headings in code fences', () => {
    const sections = parseSections(readme);
    expect(sections.map((s) => [s.level, s.anchor])).toEqual([
      [1, 'chapter-00'],
      [2, 'install-the-app'],
      [3, 'sign-in'],
      [2, 'install-the-app-1'],
    ]);
  });

  it('keeps subsections inside their parent section', () => {
    const [, install, signIn] = parseSections(readme);
    expect(install!.markdown).toContain('### Sign in');
    expect(install!.markdown).not.toContain('Second one.');
    expect(install!.images).toEqual(['../assets/app.webp']);
    expect(install!.terms).toEqual(['Download', 'Sign in']);
    expect(signIn!.markdown).toContain('## Not a heading');
    expect(signIn!.terms).toEqual(['Sign in']);
  });
});

describe('normalizeForCompare', () => {
  it('ignores whitespace changes', () => {
    expect(normalizeForCompare('  A\n\nB\tC  ')).toBe(normalizeForCompare('A B C'));
  });
});
