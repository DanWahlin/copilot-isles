/**
 * Course README parsing (PLAN §8.2), shared by the runtime CourseSource (`source.ts`), the snapshot
 * sync and drift tools (`tools/course/*`), and the tests. Heading anchors follow GitHub's slug
 * rules so they match the "Open in the course ↗" links.
 */

export interface CourseSection {
  /** GitHub heading anchor, e.g. "connect-to-your-repository". */
  anchor: string;
  title: string;
  /** Heading level, 1-6. */
  level: number;
  /** Markdown from the heading line up to the next heading of the same or a higher level. */
  markdown: string;
  /** Image paths as written (relative to the chapter folder), in order of appearance. */
  images: string[];
  /** Bolded phrases (**New**, **My work**…), which is how the course marks the UI names it teaches. */
  terms: string[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const MD_IMAGE = /!\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g;
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const BOLD = /\*\*(?!\s)([^*\n]+?)\*\*|__(?!\s)([^_\n]+?)__/g;

/** Heading text as GitHub renders it: inline markdown and HTML tags removed. */
export function headingText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .trim();
}

/** github-slugger rules: lowercase, drop punctuation, spaces → hyphens, and -1, -2… for repeats. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-');
    let slug = base;
    let count = seen.get(base) ?? 0;
    while (count > 0 && seen.has(`${base}-${count}`)) count++;
    if (count > 0) slug = `${base}-${count}`;
    seen.set(base, count + 1);
    if (slug !== base) seen.set(slug, 1);
    return slug;
  };
}

/** Every image path in a chunk of course markdown (`![alt](path)` and `<img src>`). */
export function imagePaths(markdown: string): string[] {
  const found: { at: number; path: string }[] = [];
  for (const m of markdown.matchAll(MD_IMAGE)) found.push({ at: m.index, path: (m[1] ?? m[2])! });
  for (const m of markdown.matchAll(HTML_IMAGE)) found.push({ at: m.index, path: m[1] });
  return found.sort((a, b) => a.at - b.at).map((f) => f.path);
}

/** Every image in a chunk of course markdown with its alt text, in order of appearance. */
export function imageRefs(markdown: string): { path: string; alt: string }[] {
  const found: { at: number; path: string; alt: string }[] = [];
  for (const m of markdown.matchAll(MD_IMAGE)) {
    const alt = /^!\[([^\]]*)\]/.exec(m[0])?.[1] ?? '';
    found.push({ at: m.index, path: (m[1] ?? m[2])!, alt });
  }
  for (const m of markdown.matchAll(HTML_IMAGE)) {
    const tag = markdown.slice(m.index, markdown.indexOf('>', m.index) + 1);
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    found.push({ at: m.index, path: m[1], alt: alt ? (alt[1] ?? alt[2]) : '' });
  }
  return found.sort((a, b) => a.at - b.at).map(({ path, alt }) => ({ path, alt }));
}

/** Bolded phrases, with inline code marks removed, deduplicated in order. */
export function boldTerms(markdown: string): string[] {
  const terms = new Set<string>();
  for (const m of markdown.matchAll(BOLD)) {
    const term = (m[1] ?? m[2]).replace(/`/g, '').trim();
    if (term && term.length <= 48) terms.add(term);
  }
  return [...terms];
}

/** Splits a README into one section per heading (headings inside code fences don't count). */
export function parseSections(markdown: string): CourseSection[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const slug = createSlugger();
  const heads: { line: number; level: number; title: string; anchor: string }[] = [];
  let fence = '';
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = '';
      return;
    }
    if (fence) return;
    const h = HEADING.exec(line);
    if (!h) return;
    const title = headingText(h[2]);
    heads.push({ line: i, level: h[1].length, title, anchor: slug(title) });
  });

  return heads.map((h, i) => {
    const next = heads.slice(i + 1).find((n) => n.level <= h.level);
    const body = lines
      .slice(h.line, next ? next.line : lines.length)
      .join('\n')
      .trimEnd();
    return {
      anchor: h.anchor,
      title: h.title,
      level: h.level,
      markdown: body,
      images: imagePaths(body),
      terms: boldTerms(body),
    };
  });
}

/**
 * Whitespace-insensitive form of a section, used for change detection. A section's hash (in
 * `content/course.lock.json` and every authored `SourceRef`) is the first 12 hex digits of the
 * SHA-256 of this string.
 */
export function normalizeForCompare(markdown: string): string {
  return markdown.replace(/\s+/g, ' ').trim();
}
