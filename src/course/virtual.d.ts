/**
 * The course packs, split for the browser (tools/course-pack/vite-plugin.mjs, src/course/split.ts):
 * course id → its core module (the lazy chunk `course-<id>`). A part is the URL of its JSON file (a
 * build or the dev server), or its files themselves (Vitest).
 */
declare module 'virtual:course-packs' {
  const packs: Readonly<
    Record<
      string,
      () => Promise<{
        core: import('./pack').PackFiles;
        parts: Readonly<Record<string, string | import('./pack').PackFiles>>;
      }>
    >
  >;
  export default packs;
}
