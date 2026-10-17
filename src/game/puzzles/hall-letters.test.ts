import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALCOVES,
  CITE,
  DESTINATIONS,
  HallLetters,
  LETTERS,
  TRAY,
  whyNot,
  type Destination,
} from './hall-letters';

const ROOT = join(__dirname, '../../..');
const lock = JSON.parse(readFileSync(join(ROOT, 'courses/copilot-app/lock.json'), 'utf8')) as {
  chapters: Record<string, { sections: Record<string, { hash: string }> }>;
};
const readme = readFileSync(join(ROOT, 'courses/copilot-app/public/course/ch01/README.md'), 'utf8');
const voiced = new Set(
  (
    JSON.parse(readFileSync(join(ROOT, 'courses/copilot-app/voice/lines.json'), 'utf8')) as {
      lines: { id: string }[];
    }
  ).lines.map((l) => l.id),
);

describe('The Lost Letters (P1.3)', () => {
  it('has an alcove for every Settings area in the course, in its order, with Projects last', () => {
    // The course's table: | Setting | What you can do |, one row per area.
    const table = readme.slice(readme.indexOf('| Setting | What you can do |'));
    const rows = [...table.matchAll(/^\| ([A-Z][\w ]+?) \|/gm)].map((m) => m[1]).slice(1, 11);
    expect(ALCOVES.map((a) => a.name)).toEqual(rows);
    expect(ALCOVES.at(-1)!.id).toBe('projects');
    expect(DESTINATIONS).toEqual([...ALCOVES.map((a) => a.id), TRAY.id]);
  });

  it('cites course sections that exist, with today’s hashes', () => {
    const sections = lock.chapters['01-tour-the-app']!.sections;
    for (const c of Object.values(CITE)) expect(sections[c.anchor]?.hash, c.anchor).toBe(c.hash);
    for (const l of LETTERS) expect(Object.values(CITE)).toContain(l.cite);
  });

  it('has six Settings letters, each in a different alcove, and one decoy for the tray', () => {
    const real = LETTERS.filter((l) => l.answer !== 'tray');
    expect(real).toHaveLength(6);
    expect(new Set(real.map((l) => l.answer)).size).toBe(6);
    const decoy = LETTERS.filter((l) => l.answer === 'tray');
    expect(decoy).toHaveLength(1);
    expect(decoy[0]!.cite).toBe(CITE.models);
    // It follows the Model providers letter, so the tempting alcove is fresh in your mind.
    const i = LETTERS.indexOf(decoy[0]!);
    expect(LETTERS[i - 1]!.answer).toBe('providers');
  });

  it('writes letters as problems that don’t name their area', () => {
    for (const l of LETTERS) {
      if (l.answer === 'tray') continue;
      const name = ALCOVES.find((a) => a.id === l.answer)!.name.toLowerCase();
      expect(l.text.toLowerCase(), l.id).not.toContain(name);
    }
  });

  it('gives a cited reason for every wrong filing, naming the alcove you chose', () => {
    for (const l of LETTERS)
      for (const d of DESTINATIONS) {
        if (d === l.answer) continue;
        const why = whyNot(l, d);
        expect(why.text.length, `${l.id} → ${d}`).toBeGreaterThan(20);
        expect(Object.values(CITE), `${l.id} → ${d}`).toContain(why.cite);
        if (d !== 'tray') {
          const name = ALCOVES.find((a) => a.id === d)!.name;
          expect(why.text, `${l.id} → ${d}`).toContain(`**${name}**`);
        }
      }
  });

  it('says what Model providers is for when the decoy goes there, and sends real letters back from the tray', () => {
    const decoy = LETTERS.find((l) => l.answer === 'tray')!;
    expect(whyNot(decoy, 'providers').text).toMatch(/doesn’t replace the model picker below the prompt box/);
    const real = LETTERS[0]!;
    const tray = whyNot(real, 'tray');
    expect(tray.cite).toBe(CITE.troubleshooting);
    expect(tray.text).toMatch(/closest match/);
  });

  it('files in order: a wrong alcove hands the letter back, the right one moves on', () => {
    const h = new HallLetters();
    expect(h.letter).toBe(LETTERS[0]);
    const wrong = h.file('general');
    expect(wrong.ok).toBe(false);
    expect(h.index).toBe(0);
    expect(h.misses).toBe(1);
    let last: ReturnType<HallLetters['file']> | null = null;
    for (const l of LETTERS) last = h.file(l.answer);
    expect(last).toEqual({ ok: true, done: true, letter: LETTERS.at(-1) });
    expect(h.done).toBe(true);
    expect(h.letter).toBeNull();
    // Filing after the last does nothing.
    expect(h.file('tray' as Destination).ok).toBe(true);
    expect(h.index).toBe(LETTERS.length);
  });

  it('resumes from a saved letter, clamped to the bundle', () => {
    expect(new HallLetters(3).letter).toBe(LETTERS[3]);
    expect(new HallLetters(-2).index).toBe(0);
    expect(new HallLetters(99).done).toBe(true);
    expect(new HallLetters(Number.NaN).index).toBe(0);
  });

  it('voices Pell’s lessons on the letters that teach one', () => {
    for (const l of LETTERS) if (l.ok) expect(voiced.has(l.ok), l.ok).toBe(true);
  });
});
