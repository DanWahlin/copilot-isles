import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  CHESTS,
  GLOSSARY,
  IMAGES,
  PAGES,
  QUIZZES,
  TRIALS,
  rectArea,
  rectOverlap,
} from './content/index';
import type { Rect } from './types';

const PUBLIC = join(__dirname, '../../public');

/** Reads a WebP's canvas size from its header (VP8X / VP8 / VP8L). */
function webpSize(file: string): [number, number] {
  const d = readFileSync(file);
  const kind = d.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + d.readUIntLE(24, 3), 1 + d.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [d.readUInt16LE(26) & 0x3fff, d.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const b = d.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  throw new Error(`not a webp: ${file}`);
}

const validRect = (r: Rect) =>
  r.every((v) => Number.isFinite(v)) &&
  r[0] >= 0 &&
  r[1] >= 0 &&
  r[2] > 0 &&
  r[3] > 0 &&
  r[0] + r[2] <= 1.0001 &&
  r[1] + r[3] <= 1.0001;

describe('learning content', () => {
  it('has unique ids across chapters', () => {
    for (const pick of ['images', 'quizzes', 'pages', 'chests', 'glossary', 'trials'] as const) {
      const ids = CHAPTERS.flatMap((c) => c[pick].map((x) => x.id));
      expect(new Set(ids).size, pick).toBe(ids.length);
    }
  });

  it('points at course images that exist with the declared size', () => {
    for (const img of IMAGES.values()) {
      const file = join(PUBLIC, img.src);
      expect(existsSync(file), img.src).toBe(true);
      expect(webpSize(file), img.src).toEqual([img.width, img.height]);
      expect(img.alt.length, img.id).toBeGreaterThan(10);
    }
  });

  it('references only known images, pages, and quizzes', () => {
    for (const q of QUIZZES.values()) if (q.type === 'hotspot') expect(IMAGES.has(q.image), q.id).toBe(true);
    for (const p of PAGES.values()) if (p.image) expect(IMAGES.has(p.image), p.id).toBe(true);
    for (const c of CHESTS.values()) expect(PAGES.has(c.page), c.id).toBe(true);
    for (const t of TRIALS.values())
      for (const id of t.items) expect(QUIZZES.has(id), `${t.id}:${id}`).toBe(true);
    expect(GLOSSARY.size).toBeGreaterThan(0);
  });

  it('has exactly one right answer where one is expected, and valid option ids', () => {
    for (const q of QUIZZES.values()) {
      if (q.type === 'mc' || q.type === 'scenario') {
        expect(
          q.options.some((o) => o.id === q.answer),
          q.id,
        ).toBe(true);
        expect(new Set(q.options.map((o) => o.id)).size, q.id).toBe(q.options.length);
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      } else if (q.type === 'multi') {
        for (const a of q.answers)
          expect(
            q.options.some((o) => o.id === a),
            `${q.id}:${a}`,
          ).toBe(true);
        expect(q.answers.length, q.id).toBeLessThan(q.options.length);
      } else if (q.type === 'hotspot') {
        expect(q.targets.filter((t) => t.correct).length, q.id).toBeGreaterThanOrEqual(1);
        expect(q.targets.length, q.id).toBeGreaterThanOrEqual(2);
      } else if (q.type === 'ordering') {
        expect(q.items.length, q.id).toBeGreaterThanOrEqual(3);
      } else if (q.type === 'matching') {
        expect(q.pairs.length, q.id).toBeGreaterThanOrEqual(3);
      }
      expect(q.explain.correct.length && q.explain.wrong.length, q.id).toBeTruthy();
    }
  });

  it('keeps hotspot rects on the image, and masks never hide an answer', () => {
    for (const q of QUIZZES.values()) {
      if (q.type !== 'hotspot') continue;
      for (const t of q.targets) expect(validRect(t.rect), `${q.id}:${t.id}`).toBe(true);
      for (const m of q.mask) {
        expect(validRect(m), `${q.id} mask`).toBe(true);
        // POC §3.6: a mask may sit on a target's empty edge (a callout badge) but mustn't cover it.
        for (const t of q.targets) {
          expect(rectOverlap(m, t.rect) / rectArea(t.rect), `${q.id} mask over ${t.id}`).toBeLessThan(0.2);
        }
      }
      // Correct targets don't overlap distractors, so a click can't be both right and wrong.
      const right = q.targets.filter((t) => t.correct);
      const wrong = q.targets.filter((t) => !t.correct);
      for (const r of right)
        for (const w of wrong) expect(rectOverlap(r.rect, w.rect), `${q.id}:${r.id}/${w.id}`).toBe(0);
    }
  });
});
