import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCatalog } from './lock';
import {
  courseRef,
  liveUrl,
  loadCatalog,
  loadChapter,
  loadGlossary,
  peekImage,
  repoPathForSnapshot,
  resetCourseSource,
  resolveImage,
  resolveSection,
  snapshotUrl,
} from './source';

const PUBLIC = join(__dirname, '../../../public');
const RAW = 'https://raw.githubusercontent.com/github/copilot-app-for-beginners/main/';

/** fetch() that serves the bundled snapshot from public/ and live files from `live` (or fails). */
function stubFetch(live: Record<string, string> | 'offline') {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url.startsWith(RAW)) {
      if (live === 'offline') throw new TypeError('Failed to fetch');
      const body = live[url.slice(RAW.length)];
      return new Response(body ?? 'Not Found', { status: body === undefined ? 404 : 200 });
    }
    if (url.startsWith('/course/')) return new Response(readFileSync(join(PUBLIC, url)));
    return new Response('', { status: 404 });
  });
  return calls;
}

const snap = (p: string) => readFileSync(join(PUBLIC, 'course', p), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  resetCourseSource();
});

describe('courseRef', () => {
  it('reads main by default, a pinned sha, or the snapshot', () => {
    expect(courseRef('')).toBe('main');
    expect(courseRef('?course=86BB298C')).toBe('86bb298c');
    expect(courseRef('?course=snapshot')).toBeNull();
    expect(courseRef('?course=../../evil')).toBe('main');
    expect(courseRef('?course=main;rm')).toBe('main');
  });
});

describe('CourseSource', () => {
  it('uses the live README when it’s reachable', async () => {
    const md = snap('ch00/README.md').replace('## Prerequisites', '## Prerequisites\n\nLive text.');
    const calls = stubFetch({ '00-setup/README.md': md });
    const doc = await loadChapter('00-setup');
    expect(doc.origin).toBe('live');
    expect(doc.byAnchor.get('prerequisites')!.markdown).toContain('Live text.');
    expect(calls).toEqual([`${RAW}00-setup/README.md`]);
    await loadChapter('00-setup');
    expect(calls).toHaveLength(1);
  });

  it('falls back to the snapshot quietly when offline', async () => {
    stubFetch('offline');
    const doc = await loadChapter('01-tour-the-app');
    expect(doc.origin).toBe('snapshot');
    expect(doc.byAnchor.has('modes')).toBe(true);
    expect((await loadGlossary()).origin).toBe('snapshot');
    expect(await loadCatalog()).toEqual([]);
  });

  it('falls back when the chapter folder is gone or the file no longer parses', async () => {
    stubFetch({ '00-setup/README.md': '<html>moved</html>' });
    expect((await loadChapter('00-setup')).origin).toBe('snapshot');
    expect((await loadChapter('01-tour-the-app')).origin).toBe('snapshot');
  });

  it('links a renamed section to the chapter top and shows the snapshot copy', async () => {
    const md = snap('ch01/README.md').replace('### Modes', '### Session Modes');
    stubFetch({ '01-tour-the-app/README.md': md });
    const moved = await resolveSection('01-tour-the-app', 'modes');
    expect(moved.moved).toBe(true);
    expect(moved.origin).toBe('snapshot');
    expect(moved.section?.title).toBe('Modes');
    expect(moved.href).toBe(
      'https://github.com/github/copilot-app-for-beginners/blob/main/01-tour-the-app/README.md',
    );
    const kept = await resolveSection('01-tour-the-app', 'settings');
    expect(kept).toMatchObject({ moved: false, origin: 'live' });
    expect(kept.href).toMatch(/README\.md#settings$/);
  });

  it('shows a live picture while the course still shows it, else the bundled one', async () => {
    const md = snap('ch00/README.md');
    stubFetch({ '00-setup/README.md': md });
    const img = await resolveImage('course/ch00/app-add-project.webp', ['00-setup']);
    expect(img.origin).toBe('live');
    expect(img.src).toBe(`${RAW}00-setup/assets/app-add-project.webp`);
    expect(img.alt).toMatch(/Projects menu/);
    expect(img.anchor).toBe('connect-to-your-repository');
    expect(peekImage('course/ch00/app-add-project.webp', ['00-setup'])).toEqual(img);

    resetCourseSource();
    stubFetch({ '00-setup/README.md': md.replace(/app-add-project\.webp/g, 'app-add-project-v2.webp') });
    const gone = await resolveImage('course/ch00/app-add-project.webp', ['00-setup']);
    expect(gone).toMatchObject({ origin: 'snapshot', src: '/course/ch00/app-add-project.webp' });
  });

  it('maps snapshot paths both ways', () => {
    expect(repoPathForSnapshot('course/ch02/app-where-sessions-run.webp')).toBe(
      '02-sessions-worktrees-context/assets/app-where-sessions-run.webp',
    );
    expect(repoPathForSnapshot('course/shared/x.webp')).toBe('assets/x.webp');
    expect(repoPathForSnapshot('course/ch00/../x.webp')).toBeNull();
    expect(snapshotUrl('02-sessions-worktrees-context/README.md')).toBe('/course/ch02/README.md');
    expect(snapshotUrl('assets/app-github-copilot-app.webp')).toBe(
      '/course/shared/app-github-copilot-app.webp',
    );
    expect(liveUrl('00-setup/assets/a b.webp', 'abc1234')).toBe(
      'https://raw.githubusercontent.com/github/copilot-app-for-beginners/abc1234/00-setup/assets/a%20b.webp',
    );
  });

  it('lists the course’s chapters from its README, including new ones', async () => {
    const root = snap('README.md');
    const plus = root.replace(
      /(\| 07 \|[^\n]*\n)/,
      '$1| 08 | [Fleet Ops](./08-fleet-ops/README.md) | Something new |\n',
    );
    expect(parseCatalog(root).map((c) => c.num)).toEqual(['00', '01', '02', '03', '04', '05', '06', '07']);
    stubFetch({ 'README.md': plus });
    const cat = await loadCatalog();
    expect(cat.at(-1)).toEqual({
      id: '08-fleet-ops',
      num: '08',
      title: 'Fleet Ops',
      url: 'https://github.com/github/copilot-app-for-beginners/blob/main/08-fleet-ops/README.md',
    });
  });
});
