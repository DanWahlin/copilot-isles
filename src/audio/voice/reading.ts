/**
 * How long a text-only course's caption holds (COURSE-PACKS.md §5): a reading pace for its words,
 * in seconds. `tools/voice/generate.ts` writes it into the course's caption manifest, and a press
 * moves the line on sooner.
 */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(14, 1.6 + words * 0.32) * 100) / 100;
}
