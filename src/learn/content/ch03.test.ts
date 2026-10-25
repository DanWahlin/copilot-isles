import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSections } from '../course/sections';
import type { ChapterContent, Quiz } from '../types';

/*
 * Chapter 03 (Keelhaven, docs/specs/ISLAND-03-keelhaven.md §1.4, §4, §6, §11). The island is in build,
 * so the game leaves this content out of its pack (src/course/split.ts withoutIslandsAhead): these
 * checks read the pack's files from disk.
 */
const PACK = join(__dirname, '../../../courses/copilot-app');
const json = <T>(p: string) => JSON.parse(readFileSync(join(PACK, p), 'utf8')) as T;
const README = readFileSync(join(PACK, 'public/course/ch03/README.md'), 'utf8');
const CH03 = json<ChapterContent>('chapters/03-development-workflows.json');
type Step = Record<string, unknown>;
const QUESTS = json<{
  quests: { id: string; optional?: boolean; steps: Record<string, string> }[];
  targets: Record<string, unknown>;
  scripts: Record<string, Step[]>;
}>('quests/keelhaven.json');
type Station = { image?: string; caption?: string; title: string };
const PUZZLES = ['drydock-ring', 'lock-flight'].map((n) =>
  json<{ cites: Record<string, { anchor: string }>; laps: { stations: Station[] }[] }>(`puzzles/${n}.json`),
);
const LEARNING = json<{
  appTasks: {
    id: string;
    chapter: string;
    steps: string[];
    seen?: { explain: string };
    source: { anchor: string };
    check?: unknown;
  }[];
}>('learning.json');
const TASKS = LEARNING.appTasks.filter((t) => t.chapter === CH03.chapter);

/** The six screenshots from before app 1.1.30: the sidebar's heading and its More row are out of date. */
/** The six screenshots the course retook for app 1.1.30 (f24b521): hotspots may target them now. */
const RETAKEN = [
  'ch03/app-workspace-panel',
  'ch03/app-pick-and-polish',
  'ch03/app-issues-filtered',
  'ch03/app-issue-new-session',
  'ch03/app-pr-review-comment',
  'ch03/app-pr-failing-check',
];

const bold = (s: string) => [...s.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);

describe('Chapter 03 content', () => {
  it('cites sections that exist in the ch03 snapshot', () => {
    const anchors = new Set(parseSections(README).map((s) => s.anchor));
    const refs = [
      ...CH03.quizzes.map((q) => q.source),
      ...CH03.pages.map((p) => p.source),
      ...Object.values(CH03.voiced ?? {}).filter((s) => s.chapter === CH03.chapter),
      ...TASKS.map((t) => ({ chapter: CH03.chapter, anchor: t.source.anchor })),
      ...PUZZLES.flatMap((p) =>
        Object.values(p.cites).map((c) => ({ chapter: CH03.chapter, anchor: c.anchor })),
      ),
    ];
    for (const r of refs) expect(anchors.has(r.anchor), r.anchor).toBe(true);
  });

  it('measures H3.1 and H3.2 on the retaken screenshots, never on the sidebar or Ready to merge', () => {
    const ids = new Set(CH03.images.map((i) => i.id));
    for (const id of RETAKEN) expect(ids.has(id), id).toBe(true);
    const hotspots = (CH03.quizzes as Quiz[]).filter((q) => q.type === 'hotspot');
    expect(hotspots.map((q) => q.id)).toEqual(['H3.1', 'H3.2']);
    for (const q of hotspots) {
      if (q.type !== 'hotspot') continue;
      expect(RETAKEN, q.id).toContain(q.image);
      for (const t of q.targets) {
        expect(t.id, q.id).not.toBe('ready-to-merge');
        // The sidebar ends about a quarter of the way across these 1920 × 1080 pictures.
        expect(t.rect[0], `${q.id} ${t.id}`).toBeGreaterThan(0.245);
        expect(t.rect[0] + t.rect[2], `${q.id} ${t.id}`).toBeLessThanOrEqual(1);
        expect(t.rect[1] + t.rect[3], `${q.id} ${t.id}`).toBeLessThanOrEqual(1);
      }
    }
    const captions = [
      ...CH03.pages.filter((p) => p.image && RETAKEN.includes(p.image)).map((p) => p.caption),
      ...Object.values(QUESTS.scripts)
        .flat()
        .filter((s) => RETAKEN.includes(s.show as string))
        .map((s) => s.caption as string),
    ];
    for (const c of captions) expect(c).not.toMatch(/Ready to merge|older app version/);
  });

  it('names only UI the chapter names, on its cards and pages', () => {
    const texts = [
      ...TASKS.flatMap((t) => [...t.steps, t.seen?.explain ?? '']),
      ...CH03.pages.map((p) => p.caption),
      ...CH03.quizzes.flatMap((q) => ('options' in q ? q.options.map((o) => o.text) : [])),
    ];
    for (const name of new Set(texts.flatMap(bold))) expect(README, name).toContain(name);
  });

  it('has ten app cards, none with a GitHub check', () => {
    expect(TASKS.map((t) => t.id)).toEqual(Array.from({ length: 10 }, (_, i) => `A3.${i + 1}`));
    for (const t of TASKS) expect(t.check, t.id).toBeUndefined();
  });

  it('runs a ten-item scenario Trial over every key takeaway, with no answer hint', () => {
    const t = CH03.trials[0]!;
    expect(t.items).toHaveLength(10);
    const items = t.items.map((id) => CH03.quizzes.find((q) => q.id === id)!);
    for (const q of items) {
      expect(['mc', 'scenario'], q.id).toContain(q.type);
      expect(q.hints?.[2], q.id).toBe('');
    }
    const anchors = new Set(items.map((q) => q.source.anchor));
    for (const a of ['key-takeaways', 'validate-the-fix', '2-add-a-regression-test', 'fix-a-failing-check'])
      expect(anchors.has(a), a).toBe(true);
  });

  it('runs ten quests in the course’s order, with a compass target for every step', () => {
    const main = QUESTS.quests.filter((q) => !q.optional).map((q) => q.id);
    expect(main).toEqual(Array.from({ length: 10 }, (_, i) => `Q3.${i + 1}`));
    for (const q of QUESTS.quests)
      for (const step of Object.keys(q.steps))
        if (step !== 'done') expect(QUESTS.targets[`${q.id}:${step}`], `${q.id}:${step}`).toBeDefined();
  });

  it('says at most five lines at a stop before the player does something', () => {
    const talk = new Set(['say', 'show', 'hide', 'text']);
    for (const [name, steps] of Object.entries(QUESTS.scripts)) {
      let run = 0;
      for (const s of steps) {
        if (!Object.keys(s).some((k) => talk.has(k))) {
          run = 0;
          continue;
        }
        if ('say' in s) run++;
        expect(run, name).toBeLessThanOrEqual(5);
      }
    }
  });
});
