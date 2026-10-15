import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARRIVALS, THOUSAND_BOUGH_ARRIVAL } from '../../game/arrivals';
import { PASSAGE_BATTLES } from '../../game/battles';
import { BATTLE_PLANS } from '../../world/battle/battle';
import type { CourseLock } from '../course/lock';
import { COURSE_CHAPTERS } from '../course/chapters';
import { parseProgress, Progress, type ProgressStorage } from '../progress';
import { QUIZZES } from './index';
import {
  CHART_LABELS,
  chapterLine,
  chartLabel,
  firstShowing,
  spokenLabel,
  type ChartLabelId,
} from './labels';

const ROOT = join(__dirname, '../../..');
const lock = JSON.parse(readFileSync(join(ROOT, 'content/course.lock.json'), 'utf8')) as CourseLock;
const entries = Object.entries(CHART_LABELS) as [ChartLabelId, (typeof CHART_LABELS)[ChartLabelId]][];

class MemStorage implements ProgressStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

describe('chart labels (docs/specs/LOWER-THIRDS.md)', () => {
  it('have the reel’s shape: a place · activity label, a headline, a line, a chapter and a section', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, l] of entries) {
      expect(l.k, id).toMatch(/^\S.* · \S/);
      expect(l.t.length, id).toBeGreaterThan(5);
      expect(l.b.length, id).toBeGreaterThan(20);
      expect(l.ch, id).toMatch(/^\d\d$/);
      expect(l.c.length, id).toBeGreaterThan(2);
      expect([null, 'arrival', 'puzzle', 'battle'], id).toContain(l.game);
      expect(id.startsWith(`${l.game}:`), `${id} is shown as ${l.game}`).toBe(true);
      // Player-facing copy: curly apostrophes, no em dashes, and short enough for the card.
      for (const s of [l.k, l.t, l.b, l.c]) {
        expect(s, id).not.toMatch(/['—]/);
        expect(s, id).toBe(s.trim());
      }
      expect(l.t.length, id).toBeLessThanOrEqual(40);
      expect(l.b.length, id).toBeLessThanOrEqual(130);
    }
  });

  it('cite a course section that the lock knows, at the hash it was written against', () => {
    for (const [id, l] of entries) {
      const chapter = COURSE_CHAPTERS.find((c) => c.id === l.source.chapter);
      expect(chapter, id).toBeDefined();
      expect(l.source.chapter.slice(0, 2), `${id}: the seal's chapter`).toBe(l.ch);
      const section = lock.chapters[l.source.chapter]?.sections[l.source.anchor];
      expect(section, `${id}: #${l.source.anchor}`).toBeDefined();
      expect(section!.hash, `${id}: #${l.source.anchor} moved on; re-check the label's text`).toBe(
        l.source.hash,
      );
    }
  });

  it('read the same from the JSON file the reel can load with plain Node', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'content/labels.json'), 'utf8')) as {
      labels: Record<string, { k: string; t: string; b: string; ch: string; c: string }>;
    };
    expect(raw.labels).toEqual(CHART_LABELS);
    for (const l of Object.values(raw.labels))
      expect(Object.keys(l)).toEqual(expect.arrayContaining(['k', 't', 'b', 'ch', 'c']));
  });

  it('cover Thousand-Bough’s arrival and its three puzzles', () => {
    expect(THOUSAND_BOUGH_ARRIVAL.label).toBe('arrival:thousand-bough');
    expect(CHART_LABELS['arrival:thousand-bough'].game).toBe('arrival');
    for (const id of ['puzzle:P2.1', 'puzzle:P2.2', 'puzzle:P2.3'] as const) {
      expect(CHART_LABELS[id].game, id).toBe('puzzle');
      expect(CHART_LABELS[id].k, id).toMatch(/^Thousand-Bough Isle · /);
      expect(CHART_LABELS[id].ch, id).toBe('02');
    }
  });

  it('give every island’s arrival a label with the chapter its card names', () => {
    for (const a of Object.values(ARRIVALS)) {
      expect(a.label, a.id).toBe(`arrival:${a.id}`);
      const l = CHART_LABELS[a.label!];
      expect(a.card.eyebrow, a.id).toContain(`Chapter ${l.ch}`);
      expect(l.k, a.id).toContain(a.card.title);
    }
  });

  it('cover every puzzle the islands build (POC §4.5, §6.5; ISLAND-02 §5-§7)', () => {
    for (const id of ['P0.1', 'P0.2', 'P1.1', 'P1.2', 'P1.3', 'P2.1', 'P2.2', 'P2.3'])
      expect(chartLabel(`puzzle:${id}`)?.game, id).toBe('puzzle');
    expect(chartLabel('puzzle:Q0.8.pipes')).toBeNull();
  });

  it('give each sea battle a label citing the chapter its questions come from', () => {
    for (const b of PASSAGE_BATTLES) {
      const l = chartLabel(`battle:${b.id}`);
      expect(l?.game, b.id).toBe('battle');
      const plan = BATTLE_PLANS[b.plan]!;
      expect(plan.id).toBe(b.id);
      expect(l!.ch, b.id).toBe(plan.chapter);
      expect(l!.chLine, b.id).toBe(`Questions from Course Chapter ${plan.chapter}`);
      for (const w of plan.waves)
        expect(QUIZZES.get(w.quiz)?.source.chapter.slice(0, 2), `${b.id} ${w.quiz}`).toBe(plan.chapter);
    }
  });

  it('don’t give away the Spire twist’s answer (ports) before Fen asks', () => {
    const l = CHART_LABELS['puzzle:P2.2'];
    expect(`${l.t} ${l.b}`).not.toMatch(/port|5174/i);
  });

  it('build the chapter line and a spoken version without separators', () => {
    expect(chapterLine(CHART_LABELS['puzzle:P2.3'])).toBe('Course Chapter 02 · Context syntax');
    expect(chapterLine(CHART_LABELS['battle:passage-anchorage-meridian'])).toBe(
      'Questions from Course Chapter 00 · Add the course practice items',
    );
    const spoken = spokenLabel(CHART_LABELS['puzzle:P2.1']);
    expect(spoken).not.toContain('·');
    expect(spoken).toContain('Parallel sessions with worktrees.');
    expect(spoken).toContain('Course Chapter 02, Why the app uses worktrees.');
  });
});

describe('chart labels once per save', () => {
  it('shows a puzzle’s label the first time, then never again in that save', () => {
    const store = new MemStorage();
    const p = new Progress(store);
    const shown = new Set<string>();
    expect(firstShowing(p, shown, 'puzzle:P2.1')).toBe(true);
    expect(firstShowing(p, shown, 'puzzle:P2.1')).toBe(false);
    expect(firstShowing(p, shown, 'puzzle:P2.3')).toBe(true);
    // Saved: a reload remembers it, and a new voyage forgets it.
    const again = new Progress(store);
    expect(again.data.labels).toEqual(['puzzle:P2.1', 'puzzle:P2.3']);
    expect(firstShowing(again, shown, 'puzzle:P2.1')).toBe(false);
    again.reset();
    expect(firstShowing(again, shown, 'puzzle:P2.1')).toBe(true);
    expect(shown.size).toBe(0);
  });

  it('without a save (dev pages), once per session', () => {
    const shown = new Set<string>();
    expect(firstShowing(null, shown, 'puzzle:P2.2')).toBe(true);
    expect(firstShowing(null, shown, 'puzzle:P2.2')).toBe(false);
  });

  it('loads saves from before labels with none shown, and keeps the rest', () => {
    const old = parseProgress(
      JSON.stringify({
        v: 1,
        pages: ['C0.1'],
        quests: { 'Q2.5': 'channels' },
        puzzles: { 'P2.1': { solved: false } },
        arrivals: ['anchorage', 'thousand-bough'],
        doubloons: 30,
      }),
    );
    expect(old.labels).toEqual([]);
    expect(old).toMatchObject({
      pages: ['C0.1'],
      quests: { 'Q2.5': 'channels' },
      arrivals: ['anchorage', 'thousand-bough'],
      doubloons: 30,
    });
    expect(parseProgress('{"v":1,"labels":["puzzle:P2.1",4,null]}').labels).toEqual(['puzzle:P2.1']);
    expect(parseProgress('{"v":1,"labels":"puzzle:P2.1"}').labels).toEqual([]);
  });
});
