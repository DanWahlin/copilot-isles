import { afterAll, describe, expect, it, vi } from 'vitest';
import { readCoursePack, ROOT } from '../../tools/course-pack/read';
import { packFiles, packMeta } from '../../tools/course-pack/files';
import { addCoursePart, courseScript, coursePartIn, islandQuests, onCourse, setActiveCourse } from './active';
import { activateCourse } from './load';
import { assemblePack, type CoursePack, type PackFiles } from './pack';
import { puzzleMaybe, puzzleOn, puzzleQuest } from './puzzles';
import { islandChapter, mergePackPart, puzzleChapter, splitPack } from './split';
import { PUZZLE_ISLANDS } from './puzzle-islands';
import { join } from 'node:path';

const read = (id: string) => {
  const dir = join(ROOT, 'courses', id);
  return { meta: packMeta(dir), files: packFiles(dir) };
};

const mergeAll = (core: PackFiles, parts: Readonly<Record<string, PackFiles>>) =>
  Object.values(parts).reduce<PackFiles>((f, p) => mergePackPart(f, p), core);

describe('course pack split (src/course/split.ts)', () => {
  for (const id of ['copilot-app', 'copilot-cli']) {
    it(`${id}: the core with every part merged in is the whole pack`, () => {
      const { meta, files } = read(id);
      const { core, parts } = splitPack(meta, files);
      expect(assemblePack(meta, mergeAll(core, parts))).toEqual(readCoursePack(id));
      // Any order of parts gives the same pack.
      const reversed = Object.fromEntries(Object.entries(parts).reverse());
      expect(assemblePack(meta, mergeAll(core, reversed))).toEqual(readCoursePack(id));
    });

    it(`${id}: the core alone has every index, quest list and puzzle core`, () => {
      const { meta, files } = read(id);
      const whole = readCoursePack(id);
      const core = assemblePack(meta, splitPack(meta, files, { trim: true }).core);
      expect(core.index).toEqual(whole.index);
      expect(core.chapters.map((c) => [c.chapter, c.images, c.chests, c.glossary, c.trials])).toEqual(
        whole.chapters.map((c) => [c.chapter, c.images, c.chests, c.glossary, c.trials]),
      );
      for (const c of core.chapters) expect([c.quizzes, c.pages]).toEqual([[], []]);
      for (const [island, q] of Object.entries(whole.quests)) {
        const k = core.quests[island]!;
        expect([k.tracker, k.quests, k.story, k.signs]).toEqual([q.tracker, q.quests, q.story, q.signs]);
        if (islandChapter(meta, island)) expect([k.targets, k.beats, k.scripts]).toEqual([{}, [], {}]);
      }
      for (const [name, p] of Object.entries(whole.puzzles))
        expect(core.puzzles[name]).toEqual(
          Object.fromEntries(
            Object.entries(p).filter(([k]) =>
              puzzleChapter(meta, name)
                ? ['id', 'mechanic', 'chapter', 'disabled', 'quest', 'steps'].includes(k)
                : true,
            ),
          ),
        );
      expect(core.labels).toEqual(whole.labels);
      expect(core.learning).toEqual(whole.learning);
      expect(core.market).toEqual(whole.market);
      expect(core.boards).toEqual(whole.boards);
    });

    it(`${id}: each part is one chapter's, with its island's quests and puzzles`, () => {
      const { meta, files } = read(id);
      const { parts } = splitPack(meta, files);
      for (const [chapter, part] of Object.entries(parts)) {
        for (const path of Object.keys(part)) {
          const puzzle = /^puzzles\/(.+)\.json$/.exec(path)?.[1];
          const quests = /^quests\/(.+)\.json$/.exec(path)?.[1];
          if (puzzle) expect(islandChapter(meta, PUZZLE_ISLANDS[puzzle]!), path).toBe(chapter);
          else if (quests) expect(islandChapter(meta, quests), path).toBe(chapter);
          else expect(path).toBe(`chapters/${chapter}.json`);
        }
      }
    });
  }
});

describe('a voyage with some chapter parts in (src/course/active.ts)', () => {
  afterAll(async () => {
    await activateCourse();
  });

  it('runs again only the hooks that read a part before it arrived', async () => {
    const { meta, files } = read('copilot-app');
    const { core, parts } = splitPack(meta, files, { trim: true });
    const home = islandChapter(meta, 'anchorage')!;
    const far = islandChapter(meta, 'meridian')!;
    const withHome = mergePackPart(core, parts[home]!);
    const pending = Object.keys(parts).filter((c) => c !== home);
    setActiveCourse(assemblePack(meta, withHome), pending);
    expect(coursePartIn(home)).toBe(true);
    expect(coursePartIn(far)).toBe(false);

    const farReads = vi.fn(() => islandQuests('meridian').beats.length);
    const homeReads = vi.fn(() => islandQuests('anchorage').beats.length);
    const coreReads = vi.fn(() => puzzleOn('crate-yard') && puzzleQuest('crate-yard'));
    const offFar = onCourse(farReads);
    const offHome = onCourse(homeReads);
    const offCore = onCourse(coreReads);
    expect(farReads).toHaveLastReturnedWith(0);
    expect(homeReads.mock.results[0]!.value).toBeGreaterThan(0);
    // Before the part: the core only (no beats, no scripts, no puzzle content), with no throw.
    expect(courseScript('meridian', 'anders.solved')).toEqual([]);
    expect(puzzleMaybe('crate-yard')).toBeNull();
    expect(coreReads).toHaveLastReturnedWith(puzzleQuest('crate-yard'));

    const counts = () => [
      farReads.mock.calls.length,
      homeReads.mock.calls.length,
      coreReads.mock.calls.length,
    ];
    expect(counts()).toEqual([1, 1, 1]);
    addCoursePart(assemblePack(meta, mergePackPart(withHome, parts[far]!)), far);
    expect(counts()).toEqual([2, 1, 1]);
    expect(farReads.mock.results[1]!.value).toBeGreaterThan(0);
    expect(coursePartIn(far)).toBe(true);
    expect(courseScript('meridian', 'anders.solved').length).toBeGreaterThan(0);
    expect(puzzleMaybe('crate-yard')).not.toBeNull();
    // Another part: nobody read it, nobody runs again.
    const third = pending.find((c) => c !== far)!;
    addCoursePart(
      assemblePack(meta, mergePackPart(mergePackPart(withHome, parts[far]!), parts[third]!)),
      third,
    );
    expect(counts()).toEqual([2, 1, 1]);
    offFar();
    offHome();
    offCore();
  });

  it('loads a part on demand through load.ts, and merges it into the active pack', async () => {
    // A fresh load.ts (and active pack): the one the tests share has every part in already.
    vi.resetModules();
    const load = await import('./load');
    const active = await import('./active');
    await load.activateCourse('copilot-app', { islands: ['anchorage'] });
    const pack = () => active.coursePack();
    const far = islandChapter(pack().meta, 'thousand-bough')!;
    expect(active.coursePartIn(far)).toBe(false);
    const quiz = pack().index.find((c) => c.chapter === far)!.quizzes[0]!.id;
    expect(pack().chapters.find((c) => c.chapter === far)!.quizzes).toEqual([]);
    const heard: string[] = [];
    const off = active.onCoursePart((c) => heard.push(c));
    await load.loadQuizParts([quiz]);
    off();
    expect(heard).toEqual([far]);
    expect(active.coursePartIn(far)).toBe(true);
    expect(
      pack()
        .chapters.find((c) => c.chapter === far)!
        .quizzes.some((q) => q.id === quiz),
    ).toBe(true);
    // Already in: at once, and nothing heard.
    await load.loadIslandPart('thousand-bough');
    const whole: CoursePack = readCoursePack('copilot-app');
    expect(pack().quests['thousand-bough']!.scripts).toEqual(whole.quests['thousand-bough']!.scripts);
  });
});
