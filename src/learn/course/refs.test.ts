import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, IMAGES, PAGES, QUIZZES } from '../content/index';
import type { SourceRef } from '../types';
import { COURSE_CHAPTERS, repoPath } from './chapters';
import { chapterLock, glossaryLock, HASH_LENGTH, type CourseLock } from './lock';

/**
 * PLAN §8.3-8.4 guards: the bundled snapshot matches `content/course.lock.json`, and every authored
 * `SourceRef` (quizzes, Logbook pages, voiced lines) and course image resolves against it.
 */
const ROOT = join(__dirname, '../../..');
const PUBLIC = join(ROOT, 'public');
const lock = JSON.parse(readFileSync(join(ROOT, 'content/course.lock.json'), 'utf8')) as CourseLock;
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const HASH = new RegExp(`^[0-9a-f]{${HASH_LENGTH}}$`);

function allRefs(): { where: string; ref: SourceRef }[] {
  const out: { where: string; ref: SourceRef }[] = [];
  for (const q of QUIZZES.values()) out.push({ where: `quiz ${q.id}`, ref: q.source });
  for (const p of PAGES.values()) out.push({ where: `page ${p.id}`, ref: p.source });
  for (const c of CHAPTERS)
    for (const [id, ref] of Object.entries(c.voiced ?? {})) out.push({ where: `voiced ${id}`, ref });
  return out;
}

describe('course snapshot and lock', () => {
  it('pins a commit and lists the course’s chapters', () => {
    expect(lock.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.repo).toBe('github/copilot-app-for-beginners');
    expect(lock.catalog.length).toBeGreaterThanOrEqual(8);
    for (const c of COURSE_CHAPTERS)
      expect(
        lock.catalog.map((x) => x.id),
        c.id,
      ).toContain(c.id);
  });

  it('matches the bundled READMEs and glossary section by section', () => {
    for (const [id, entry] of Object.entries(lock.chapters)) {
      const md = readFileSync(join(PUBLIC, 'course', entry!.short, 'README.md'), 'utf8');
      const again = chapterLock(md, id, entry!.title, entry!.short, sha256, repoPath);
      expect(again, id).toEqual(entry);
    }
    const glossary = readFileSync(join(PUBLIC, 'course/GLOSSARY.md'), 'utf8');
    expect(glossaryLock(glossary, sha256)).toEqual(lock.glossary);
  });

  it('snapshots Chapters 00-02', () => {
    for (const id of ['00-setup', '01-tour-the-app', '02-sessions-worktrees-context'] as const)
      expect(lock.chapters[id], id).toBeDefined();
  });

  it('holds every image byte-for-byte, except pinned ones it records separately', () => {
    for (const [path, img] of Object.entries(lock.images)) {
      const file = join(PUBLIC, path);
      expect(existsSync(file), path).toBe(true);
      const have = sha256(readFileSync(file));
      if (img.bundled) {
        expect(img.pinned, path).toBe(true);
        expect(have, path).toBe(img.bundled);
      } else expect(have, path).toBe(img.sha256);
    }
  });

  it('has every image a snapshotted section shows', () => {
    const bundled = new Set(Object.values(lock.images).map((i) => i.upstream));
    for (const [id, entry] of Object.entries(lock.chapters))
      for (const [anchor, s] of Object.entries(entry!.sections))
        for (const p of s.images ?? [])
          if (/\.(webp|png|jpe?g|gif)$/i.test(p)) expect(bundled.has(p), `${id}#${anchor}: ${p}`).toBe(true);
  });
});

describe('SourceRefs', () => {
  it('every anchor resolves against the snapshot, with a well-formed hash', () => {
    const refs = allRefs();
    expect(refs.length).toBeGreaterThan(100);
    for (const { where, ref } of refs) {
      const chapter = lock.chapters[ref.chapter];
      expect(chapter, `${where}: ${ref.chapter} isn't in the snapshot`).toBeDefined();
      expect(chapter!.sections[ref.anchor], `${where}: #${ref.anchor} isn't in ${ref.chapter}`).toBeDefined();
      expect(ref.hash, where).toMatch(HASH);
    }
  });

  it('every hotspot quiz records the bundled screenshot it was measured on', () => {
    for (const q of QUIZZES.values()) {
      if (q.type !== 'hotspot') {
        expect(q.source.image, q.id).toBeUndefined();
        continue;
      }
      const img = IMAGES.get(q.image)!;
      expect(q.source.image, q.id).toEqual({ src: img.src, hash: img.hash });
      expect(lock.images[img.src]?.pinned, `${q.id}: ${img.src} must be pinned`).toBe(true);
    }
  });

  it('every course image matches its recorded hash and is pinned in the lock', () => {
    for (const img of IMAGES.values()) {
      expect(img.hash, img.id).toMatch(HASH);
      expect(sha256(readFileSync(join(PUBLIC, img.src))).slice(0, HASH_LENGTH), img.id).toBe(img.hash);
      expect(lock.images[img.src]?.pinned, img.src).toBe(true);
    }
  });

  it('voiced refs name real voice lines', () => {
    const lines = JSON.parse(readFileSync(join(ROOT, 'tools/voice/lines.testcove.json'), 'utf8')) as {
      lines: { id: string }[];
    };
    const ids = new Set(lines.lines.map((l) => l.id));
    for (const c of CHAPTERS)
      for (const id of Object.keys(c.voiced ?? {})) expect(ids.has(id), id).toBe(true);
  });
});
