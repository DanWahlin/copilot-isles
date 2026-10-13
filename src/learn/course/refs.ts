import type { ChapterId } from './chapters';
import type { SourceRef } from '../types';

/**
 * The authoring helper for `SourceRef`s (docs/course-content-authoring.md):
 *
 *   const src = courseRefs('02-sessions-worktrees-context');
 *   source: src('what-is-a-git-worktree', '1a2b3c4d5e6f'),
 *   source: src('where-a-session-runs', '…', { src: 'course/ch02/app-where-sessions-run.webp', hash: '…' }),
 *
 * The hash is the section's hash in `content/course.lock.json` (`npm run course:refs -- 02` lists
 * them). Hotspot quizzes also pass the screenshot they were measured on.
 */
export function courseRefs(chapter: ChapterId) {
  return (anchor: string, hash: string, image?: SourceRef['image']): SourceRef =>
    image ? { chapter, anchor, hash, image } : { chapter, anchor, hash };
}
