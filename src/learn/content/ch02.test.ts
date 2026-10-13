import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSections } from '../course/sections';
import { CH02 } from './ch02';

const README = readFileSync(join(__dirname, '../../../public/course/ch02/README.md'), 'utf8');

describe('Chapter 02 content', () => {
  it('cites sections that exist in the ch02 snapshot', () => {
    const anchors = new Set(parseSections(README).map((s) => s.anchor));
    const refs = [
      ...CH02.quizzes.map((q) => q.source),
      ...CH02.pages.map((p) => p.source),
      ...Object.values(CH02.voiced ?? {}),
    ];
    for (const r of refs) {
      expect(r.chapter).toBe('02-sessions-worktrees-context');
      expect(anchors.has(r.anchor), r.anchor).toBe(true);
    }
  });

  it('never makes a box with the course’s own highlight the right answer', () => {
    const highlighted: Record<string, string[]> = {
      'ch02/app-where-sessions-run': ['new-worktree'],
      'ch02/app-context-information': ['context'],
    };
    for (const q of CH02.quizzes) {
      if (q.type !== 'hotspot') continue;
      expect(q.image, q.id).not.toBe('ch02/app-create-from-icon');
      for (const t of q.targets)
        if ((highlighted[q.image] ?? []).includes(t.id)) expect(t.correct, `${q.id}:${t.id}`).toBeFalsy();
    }
  });

  it('has exactly one right target in every hotspot, and every distractor explains itself', () => {
    for (const q of CH02.quizzes) {
      if (q.type !== 'hotspot') continue;
      expect(
        q.targets.filter((t) => t.correct),
        q.id,
      ).toHaveLength(1);
      if (!q.id.startsWith('T'))
        for (const t of q.targets.filter((x) => !x.correct))
          expect(t.feedback, `${q.id}:${t.id}`).toBeTruthy();
    }
  });

  it('runs a nine-item Trial covering every key takeaway', () => {
    const t = CH02.trials[0]!;
    expect(t.items).toHaveLength(9);
    const anchors = new Set(t.items.map((id) => CH02.quizzes.find((q) => q.id === id)!.source.anchor));
    for (const a of ['key-takeaways', 'where-a-session-runs', 'two-previews-collided', 'context-syntax'])
      expect(anchors.has(a), a).toBe(true);
    // Trials have no third (answer) hint.
    for (const id of t.items) {
      const q = CH02.quizzes.find((x) => x.id === id)!;
      if (q.hints) expect(q.hints[2], id).toBe('');
    }
  });

  it('uses only UI names the chapter bolds (or lists in a table)', () => {
    const bold = new Set([
      ...[...README.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!),
      ...[...README.matchAll(/^\| ([^|`]+?) \|/gm)].map((m) => m[1]!),
    ]);
    const authored = [
      ...CH02.pages.map((p) => p.caption),
      ...CH02.quizzes.flatMap((q) => [q.explain.correct, q.explain.wrong]),
    ].join('\n');
    for (const m of authored.matchAll(/\*\*([^*]+)\*\*/g)) expect(bold.has(m[1]!), m[1]).toBe(true);
  });
});
