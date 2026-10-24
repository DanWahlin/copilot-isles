import type { ScriptStep } from '../game/script';
import { selectCourse } from './catalog';
import type { CoursePack, IslandQuests, PuzzleFile } from './pack';
import { islandChapter, puzzleChapter } from './split';

/**
 * The active course pack (docs/specs/COURSE-PACKS.md §2). A voyage loads it (src/course/load.ts, or
 * tools/course-pack/read.ts in Node) and activates it before anything reads course data. Modules
 * that keep data derived from the pack build it in an `onCourse` hook, which runs on activation (or at
 * once, if a pack is already active), in the order the modules registered: a module's imports always
 * register first, so their data is ready for it.
 *
 * A voyage activates the pack with only some chapters' parts in (src/course/split.ts): the rest load
 * as their islands stream in. The accessors here note when a hook reads a chapter part that isn't in
 * yet (it gets the island's or puzzle's core only), and when that part arrives (`addCoursePart`), only
 * the hooks that missed it run again, in the order they registered.
 */

interface Hook {
  build: (p: CoursePack) => void;
}

let active: CoursePack | null = null;
const hooks: Hook[] = [];
/** The chapters whose part the active pack hasn't got yet. */
let pending = new Set<string>();
/** The hook running now (a read that misses a part is noted against it). */
let running: Hook | null = null;
/** Hook → the chapter parts it read before they were in. */
const missed = new Map<Hook, Set<string>>();
/** Chapter parts read outside a hook before they were in (each reported once, as an error: the play tests fail on it). */
const warned = new Set<string>();
const partListeners = new Set<(chapter: string) => void>();

function run(h: Hook): void {
  const prev = running;
  running = h;
  try {
    h.build(active!);
  } finally {
    running = prev;
  }
}

/** A read that needed `chapter`'s part: true (and noted) when it isn't in yet. */
function missing(chapter: string | null): boolean {
  if (!chapter || !pending.has(chapter)) return false;
  if (running) {
    let m = missed.get(running);
    if (!m) missed.set(running, (m = new Set()));
    m.add(chapter);
  } else if (!warned.has(chapter)) {
    warned.add(chapter);
    console.error(`[course] chapter ${chapter}'s part was read before it loaded (src/course/load.ts)`);
  }
  return true;
}

/**
 * Runs `build` with the active pack now (if there is one) and on every activation after, and again
 * when a chapter part it read before it loaded arrives. Returns a call that stops it (for something
 * built in the world, which can be freed: its words repaint).
 */
export function onCourse(build: (p: CoursePack) => void): () => void {
  const h: Hook = { build };
  hooks.push(h);
  if (active) run(h);
  return () => {
    const i = hooks.indexOf(h);
    if (i >= 0) hooks.splice(i, 1);
    missed.delete(h);
  };
}

/**
 * Makes `p` the active pack and runs every hook. `waiting` lists the chapters whose part isn't in
 * `p` yet (none for a pack read whole, as in the tools and tests).
 */
export function setActiveCourse(p: CoursePack, waiting: Iterable<string> = []): void {
  if (active === p) return;
  active = p;
  pending = new Set(waiting);
  missed.clear();
  warned.clear();
  selectCourse(p.id);
  for (const h of [...hooks]) run(h);
}

/**
 * A chapter's part has arrived: `p` is the active course's pack with it merged in. The hooks that read
 * the part before it was in run again (in the order they registered); the rest keep what they built.
 */
export function addCoursePart(p: CoursePack, chapter: string): void {
  if (!active || active.id !== p.id) return;
  active = p;
  pending.delete(chapter);
  for (const h of [...hooks]) {
    const m = missed.get(h);
    if (!m?.has(chapter)) continue;
    m.delete(chapter);
    if (!m.size) missed.delete(h);
    if (hooks.includes(h)) run(h);
  }
  for (const fn of partListeners) fn(chapter);
}

/** Hears each chapter part as it arrives (the Logbook repaints a page that was loading). */
export function onCoursePart(fn: (chapter: string) => void): () => void {
  partListeners.add(fn);
  return () => partListeners.delete(fn);
}

/** Whether the active pack has `chapter`'s part (a chapter without one counts as in). */
export function coursePartIn(chapter: string): boolean {
  return !!active && !pending.has(chapter);
}

/**
 * For a hook that reads every chapter's part (the content index): it runs again as each one arrives.
 * Returns whether any is still to come.
 */
export function everyCoursePart(): boolean {
  let any = false;
  for (const c of [...pending]) any = missing(c) || any;
  return any;
}

export function hasActiveCourse(): boolean {
  return active !== null;
}

/** The active pack; throws if none is loaded yet (a read before the voyage loaded it). */
export function coursePack(): CoursePack {
  if (!active) throw new Error('No course pack is active yet (src/course/load.ts activates it)');
  return active;
}

/** Whether the active course has quests on an island (a course may use only some islands). */
export function hasIslandQuests(island: string): boolean {
  return !!active?.quests[island];
}

/**
 * An island's quests in the active course. Before its chapter part is in, its compass targets,
 * beats, scripts and barks are empty (a hook that reads them runs again when the part arrives).
 */
export function islandQuests(island: string): IslandQuests {
  const q = coursePack().quests[island];
  if (!q) throw new Error(`The course "${coursePack().id}" has no quests for ${island}`);
  missing(islandChapter(coursePack().meta, island));
  return q;
}

/** An island's quest list (its titles, tasks and steps): in the core, so it's there before the island. */
export function islandQuestList(island: string): IslandQuests['quests'] {
  return coursePack().quests[island]?.quests ?? [];
}

/**
 * A named script of an island's quests (`quests/<island>.json` → `scripts`). Empty before the
 * island's chapter part is in.
 */
export function courseScript(island: string, name: string): readonly ScriptStep[] {
  const s = islandQuests(island).scripts[name];
  if (!s && pending.has(islandChapter(coursePack().meta, island) ?? '')) return [];
  if (!s) throw new Error(`The course "${coursePack().id}" has no script "${name}" on ${island}`);
  return s;
}

/**
 * A puzzle's file as the pack has it now: its whole content once its chapter part is in, else only
 * its core (mechanic, quest, steps, disabled) and null from `whole`.
 */
export function coursePuzzle(name: string, whole: boolean): PuzzleFile | null {
  const p = coursePack().puzzles[name];
  if (!p) return null;
  if (whole && missing(puzzleChapter(coursePack().meta, name))) return null;
  return p;
}

/** One of an island's signs (`quests/<island>.json` → `signs`), blank without a course or the sign. */
export function islandSign(island: string, name: string): string {
  return active?.quests[island]?.signs?.[name] ?? '';
}

/** What an NPC says when there's no script for them (unvoiced barks), from any island's quests. */
export function barksFor(npc: string): readonly string[] | undefined {
  if (!active) return undefined;
  for (const [island, q] of Object.entries(active.quests)) {
    if (pending.has(islandChapter(active.meta, island) ?? '')) continue;
    const b = q.barks[npc];
    if (b) return b;
  }
  return undefined;
}
