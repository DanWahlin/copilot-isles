# How to author a chapter against CourseSource

This page is for anyone who writes an island's teaching content (`src/learn/content/chNN.ts`). It
explains how authored content points at the course, so the game can show live course text and the
weekly refresh can tell you when the course changed under your content. The design is in
`.plans/PLAN.md` §8.

## What is live and what you author

- **Live (you don't write it):** "From the course" excerpts on Logbook pages and chest scrolls, the
  course's own caption under spyglass pictures, the course glossary entries in the Logbook, and the
  pictures on Logbook pages. `CourseSource` (`src/learn/course/source.ts`) reads them from
  `raw.githubusercontent.com` and falls back to the bundled snapshot in `public/course/**`.
- **Authored (you write it):** dialogue, voiced lines, quizzes, hotspot rects, Logbook page titles
  and captions, glossary terms, and quests. Paraphrase the course in the game's voice. Don't copy
  course text: the live excerpt shows the course's exact words beside your caption.

## 1. Get the chapter into the snapshot

Chapters 00, 01 and 02 are in the snapshot. For another chapter:

```bash
node tools/course/sync.mjs --chapters=00,01,02,03
```

This copies the chapter's `README.md` and every image it shows into `public/course/chNN/`
(byte-for-byte), and adds the chapter to `content/course.lock.json`. It never calls the GitHub REST
API.

## 2. List the anchors and hashes

```bash
npm run course:refs -- 02
```

The output has one line per README heading, ready to paste:

```text
const src = courseRefs('02-sessions-worktrees-context');

src('what-is-a-git-worktree', '4ccaddd0c3f4')  // What Is a Git Worktree?
...
Images the chapter shows (src · hash):
  course/ch02/app-where-sessions-run.webp · d975962f610a
```

## 3. Write the content with `SourceRef`s

```ts
import { courseRefs } from '../course/refs';
import type { ChapterContent } from '../types';

const ch = '02-sessions-worktrees-context' as const;
const src = courseRefs(ch);

export const CH02: ChapterContent = {
  chapter: ch,
  images: [
    {
      id: 'ch02/app-where-sessions-run',
      src: 'course/ch02/app-where-sessions-run.webp',
      hash: 'd975962f610a', // from course:refs: the file your alt text and rects describe
      width: 1920,
      height: 1080,
      alt: '…',
    },
  ],
  quizzes: [
    {
      id: 'M2.1',
      type: 'mc',
      // …
      source: src('what-is-a-git-worktree', '4ccaddd0c3f4'),
    },
    {
      id: 'H2.1',
      type: 'hotspot',
      image: 'ch02/app-where-sessions-run',
      // …
      // Hotspot quizzes also record the screenshot they were measured on.
      source: src('where-a-session-runs', 'a55a83c1ff55', {
        src: 'course/ch02/app-where-sessions-run.webp',
        hash: 'd975962f610a',
      }),
    },
  ],
  pages: [
    // A page's `source` picks its "From the course" excerpt and its "Open in the course ↗" link.
    { id: 'pg2.worktree', title: '…', image: 'ch02/…', caption: '…', source: src('what-is-a-git-worktree', '4ccaddd0c3f4') },
  ],
  // The course section each voiced teaching line paraphrases (ids from tools/voice/lines.*.json).
  // Leave out banter and directions.
  voiced: {
    'thb.guide.01': src('what-is-a-git-worktree', '4ccaddd0c3f4'),
  },
  // …chests, glossary, trials
};
```

Then add the chapter to `CHAPTERS` in `src/learn/content/index.ts`.

Rules:

- **Use the hash that `course:refs` prints today.** It records which version of the section you
  wrote against. Don't update a hash unless you've re-read the section and your content still fits.
- **Every image that authored content uses is pinned.** Sync never overwrites it, because your rects,
  alt text and captions describe that exact file. Hotspot quizzes always show the pinned file;
  Logbook pages and spyglass views show the live picture while the course still shows it.
- **Anchors must exist.** `src/learn/course/refs.test.ts` checks every `SourceRef` anchor against the
  snapshot, every image hash against its file, and every `voiced` id against the voice lines.
- **Teaching accuracy still applies:** paraphrase, keep the course's UI names exactly (**New**,
  **Current checkout**…), and don't invent app UI names.

## 4. When the course changes

The weekly refresh (`.github/workflows/weekly-refresh.yml`) runs `tools/course/sync.mjs` and
`npm run course:drift`, which lists:

- quizzes, pages and voiced lines whose section hash changed or whose anchor disappeared,
- pinned screenshots whose upstream file changed (with before/after montages), and
- bolded UI names the course dropped that authored text still uses.

To fix an item, re-read the section, update the content, and paste the new hash from
`npm run course:refs`. For a changed screenshot, re-measure the hotspot rects and alt text against
the new file, then take it with `node tools/course/sync.mjs --unpin=course/ch02/<file>.webp` and
update the image's `hash`.

## Useful switches

- `?course=<sha>` pins the game to a course commit, and `?course=snapshot` skips the network.
- In Playwright, `page.route(/raw\.githubusercontent\.com/, (r) => r.abort())` shows the snapshot
  fallback.
