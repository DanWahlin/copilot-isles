/**
 * A small, allow-listed markdown parser for course text (PLAN §8.2). It turns markdown into a plain
 * data tree that `CourseMarkdown` renders as React elements, so nothing is ever set as HTML. Raw
 * HTML is dropped (its text is kept) except `<img>` and `<br>`. Every link and image URL goes
 * through the caller's resolver and then `safeHref` / `safeImageSrc`: links must be http(s), and
 * images must be https on an allowed host or a bundled `course/` path.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em' | 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'img'; src: string; alt: string; path: string }
  | { t: 'br' };

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'ul'; items: Block[][] }
  | { t: 'ol'; start: number; items: Block[][] }
  | { t: 'quote'; alert?: AlertKind; c: Block[] }
  | { t: 'pre'; lang: string; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

export interface MarkdownOptions {
  /** Turns a link target as written into an absolute URL, or null to show just the text. */
  link?: (href: string) => string | null;
  /** Turns an image path as written into a URL, or null to drop the image. */
  image?: (path: string) => string | null;
  /** Reference-link definitions (`[label]: url`, keys lowercased), usually from `linkRefs` on the whole README. */
  refs?: ReadonlyMap<string, string>;
  /** Leave out `<details>` blocks (content the course keeps collapsed), e.g. for short excerpts. */
  dropDetails?: boolean;
}

/** Hosts course images may load from (the live course and GitHub's own image hosts). */
const IMAGE_HOSTS = new Set(['raw.githubusercontent.com', 'github.com', 'user-images.githubusercontent.com']);
const IMAGE_EXT = /\.(webp|png|jpe?g|gif|avif)$/i;
const BUNDLED_IMAGE = /^(?:\.?\/|\/[\w-]+\/)?course\/(?:[\w-]+\/)*[\w-]+\.\w+$/;

/** An http(s) URL as a string, or null (javascript:, data:, relative, and malformed URLs fail). */
export function safeHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** An image URL that's https on an allowed host, or a bundled `course/` image; otherwise null. */
export function safeImageSrc(src: string): string | null {
  const path = src.split(/[?#]/)[0];
  if (!IMAGE_EXT.test(path)) return null;
  if (BUNDLED_IMAGE.test(src)) return src;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && IMAGE_HOSTS.has(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rarr: '→',
  larr: '←',
  copy: '©',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Elements whose content is dropped along with the tags. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'textarea',
  'select',
]);
/** The same, or an HTML comment, starting a line outside code fences (it may run over many lines). */
const DROP_BLOCK = new RegExp(
  `^ {0,3}(?:<!--[\\s\\S]*?(?:-->|(?![\\s\\S]))|<(${[...DROP].join('|')})\\b[\\s\\S]*?(?:<\\/\\1\\s*>|(?![\\s\\S])))`,
  'gim',
);

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

// ---------------------------------------------------------------------------------------------
// Inline

export function parseInline(src: string, opts: MarkdownOptions = {}, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: decodeEntities(text) });
    text = '';
  };
  const push = (node: Inline) => {
    flush();
    out.push(node);
  };
  const inner = (s: string) =>
    depth > 8 ? [{ t: 'text' as const, v: decodeEntities(s) }] : parseInline(s, opts, depth + 1);

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    if (ch === '\\' && i + 1 < src.length && /[!-/:-@[-`{-~]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      const run = /^`+/.exec(rest)![0];
      const end = src.indexOf(run, i + run.length);
      if (end > 0) {
        push({
          t: 'code',
          v: src
            .slice(i + run.length, end)
            .replace(/\n/g, ' ')
            .trim(),
        });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }

    if (ch === '!' && src[i + 1] === '[') {
      const m = linkAt(src, i + 1, opts.refs);
      if (m) {
        const url = opts.image ? opts.image(m.target) : m.target;
        const safe = url ? safeImageSrc(url) : null;
        if (safe) push({ t: 'img', src: safe, alt: decodeEntities(stripTags(m.label)), path: m.target });
        i = m.end;
        continue;
      }
    }

    if (ch === '[') {
      const m = linkAt(src, i, opts.refs);
      if (m) {
        const url = opts.link ? opts.link(m.target) : m.target;
        const safe = url ? safeHref(url) : null;
        const label = inner(m.label);
        if (safe) push({ t: 'link', href: safe, c: label });
        else {
          flush();
          out.push(...label);
        }
        i = m.end;
        continue;
      }
    }

    if (ch === '<') {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(rest);
      if (auto) {
        const safe = safeHref(auto[1]);
        if (safe) push({ t: 'link', href: safe, c: [{ t: 'text', v: auto[1] }] });
        i += auto[0].length;
        continue;
      }
      if (rest.startsWith('<!--')) {
        const end = src.indexOf('-->', i + 4);
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      const tag = /^<\/?([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(rest);
      if (tag) {
        const name = tag[1].toLowerCase();
        if (DROP.has(name) && tag[0][1] !== '/') {
          const close = new RegExp(`</${name}\\s*>`, 'i').exec(src.slice(i + tag[0].length));
          i = close ? i + tag[0].length + close.index + close[0].length : src.length;
          continue;
        }
        if (name === 'img' && tag[0][1] !== '/') {
          const path = attr(tag[0], 'src');
          const url = path ? (opts.image ? opts.image(decodeEntities(path)) : decodeEntities(path)) : null;
          const safe = url ? safeImageSrc(url) : null;
          if (safe && path)
            push({
              t: 'img',
              src: safe,
              alt: decodeEntities(attr(tag[0], 'alt') ?? ''),
              path: decodeEntities(path),
            });
        } else if (name === 'br') push({ t: 'br' });
        i += tag[0].length;
        continue;
      }
    }

    if (ch === 'h' && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      const bare = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"*_]/.exec(rest);
      if (bare) {
        const safe = safeHref(bare[0]);
        if (safe) {
          push({ t: 'link', href: safe, c: [{ t: 'text', v: bare[0] }] });
          i += bare[0].length;
          continue;
        }
      }
    }

    if (ch === '*' || ch === '_' || ch === '~') {
      const run = /^(\*+|_+|~+)/.exec(rest)![0];
      const prev = i > 0 ? src[i - 1] : ' ';
      const next = src[i + run.length] ?? ' ';
      const intraword = ch === '_' && /[\p{L}\p{N}]/u.test(prev);
      if (!intraword && next !== ' ' && next !== '\n') {
        const n = Math.min(run.length, 2);
        const marker = ch.repeat(n);
        const close = findClose(src, i + n, marker);
        if (close > i + n && (ch !== '~' || n === 2)) {
          const kind = ch === '~' ? 'del' : n === 2 ? 'strong' : 'em';
          push({ t: kind, c: inner(src.slice(i + n, close)) });
          i = close + n;
          continue;
        }
      }
      text += run;
      i += run.length;
      continue;
    }

    if (ch === '\n') {
      text += ' ';
      i++;
      continue;
    }

    text += ch;
    i++;
  }
  flush();
  return out;
}

/** The closing emphasis marker: not after whitespace, and (for `_`) not inside a word. */
function findClose(src: string, from: number, marker: string): number {
  let j = from;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] === '`') {
      const run = /^`+/.exec(src.slice(j))![0];
      const end = src.indexOf(run, j + run.length);
      j = end > 0 ? end + run.length : j + run.length;
      continue;
    }
    if (src.startsWith(marker, j) && !/\s/.test(src[j - 1])) {
      const after = src[j + marker.length] ?? ' ';
      if (src[j + marker.length] === marker[0] && marker.length === 1) {
        j += 2;
        continue;
      }
      if (marker[0] !== '_' || !/[\p{L}\p{N}]/u.test(after)) return j;
    }
    j++;
  }
  return -1;
}

/** `[label](target "title")` starting at `at` (the `[`). Handles nested brackets in the label. */
function linkAt(
  src: string,
  at: number,
  refs?: ReadonlyMap<string, string>,
): { label: string; target: string; end: number } | null {
  let depth = 0;
  let j = at;
  for (; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === '[') depth++;
    else if (src[j] === ']' && --depth === 0) break;
  }
  if (j >= src.length) return null;
  const label = src.slice(at + 1, j);
  if (src[j + 1] !== '(') {
    // Reference links: [text][ref], [text][], and [text] with a `[text]: url` definition.
    const r = /^\[([^\]\n]*)\]/.exec(src.slice(j + 1));
    const key = (r && r[1] ? r[1] : label).trim().toLowerCase();
    const target = refs?.get(key);
    if (!target || (!r && !refs?.has(key))) return null;
    return { label, target, end: j + 1 + (r ? r[0].length : 0) };
  }
  const m = /^\(\s*(?:<([^<>\n]*)>|([^\s()]*(?:\([^\s()]*\)[^\s()]*)*))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(
    src.slice(j + 1),
  );
  if (!m) return null;
  return { label, target: (m[1] ?? m[2] ?? '').trim(), end: j + 1 + m[0].length };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

// ---------------------------------------------------------------------------------------------
// Blocks

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST = /^( *)([-*+]|(\d{1,9})[.)])(?: +|$)/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const ALERT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

const LINK_DEF = /^ {0,3}\[([^\]\n]+)\]:\s*<?([^\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;

/** A document's reference-link definitions (`[fork-repo-link]: https://…`), keyed by lowercased label. */
export function linkRefs(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = LINK_DEF.exec(line);
    if (m && !out.has(m[1].trim().toLowerCase())) out.set(m[1].trim().toLowerCase(), m[2]);
  }
  return out;
}

/** Parses course markdown into blocks (raw HTML other than `<img>`/`<br>` is removed). */
export function parseMarkdown(markdown: string, opts: MarkdownOptions = {}): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  // Drop block-level <script>, <style>, comments… outside code fences, before splitting into blocks.
  const out: string[] = [];
  let chunk: string[] = [];
  let fence = '';
  const flush = () => {
    let text = chunk.join('\n').replace(DROP_BLOCK, '');
    if (opts.dropDetails) text = text.replace(/^ {0,3}<details\b[\s\S]*?(?:<\/details>|(?![\s\S]))/gim, '');
    out.push(...text.split('\n'));
    chunk = [];
  };
  for (const line of lines) {
    const f = FENCE.exec(line);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2]) fence = '';
    } else if (f) {
      flush();
      fence = f[1];
      out.push(line);
    } else if (!LINK_DEF.test(line)) chunk.push(line);
  }
  flush();
  return blocks(out, opts, 0);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '`') {
      code = !code;
      cur += '`';
    } else if (s[i] === '|' && !code) {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    LIST.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_RULE.test(next) && next.includes('-'))
  );
}

function blocks(lines: string[], opts: MarkdownOptions, depth: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1];
      const indent = /^ */.exec(line)![0].length;
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`).test(lines[i])) {
        body.push(lines[i].slice(Math.min(indent, /^ */.exec(lines[i])![0].length)));
        i++;
      }
      i++;
      out.push({ t: 'pre', lang: fence[2] ?? '', v: body.join('\n') });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length, c: parseInline(h[2], opts) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        (QUOTE.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))
      ) {
        body.push(lines[i].replace(QUOTE, ''));
        i++;
      }
      const alert = ALERT.exec(body[0] ?? '');
      if (alert) body.shift();
      const c = depth > 6 ? [] : blocks(body, opts, depth + 1);
      out.push(alert ? { t: 'quote', alert: alert[1].toLowerCase() as AlertKind, c } : { t: 'quote', c });
      continue;
    }

    const li = LIST.exec(line);
    if (li) {
      const ordered = li[3] !== undefined;
      const baseIndent = li[1].length;
      const items: Block[][] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || m[1].length !== baseIndent || (m[3] !== undefined) !== ordered) break;
        const contentIndent = m[0].length;
        const body: string[] = [lines[i].slice(m[0].length)];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            // A blank line ends the item unless the next line is indented into it.
            const nextIdx = lines.slice(i).findIndex((x) => x.trim());
            if (nextIdx < 0) {
              i = lines.length;
              break;
            }
            const nextLine = lines[i + nextIdx];
            if (/^ */.exec(nextLine)![0].length >= Math.min(contentIndent, baseIndent + 2)) {
              for (let k = 0; k < nextIdx; k++) body.push('');
              i += nextIdx;
              continue;
            }
            break;
          }
          const ind = /^ */.exec(l)![0].length;
          if (ind >= Math.min(contentIndent, baseIndent + 2)) {
            body.push(l.slice(Math.min(ind, contentIndent)));
            i++;
            continue;
          }
          if (LIST.test(l) || startsBlock(l, lines[i + 1])) break;
          body.push(l.trim()); // lazy continuation
          i++;
        }
        items.push(depth > 6 ? [] : blocks(body, opts, depth + 1));
        if (i < lines.length && !lines[i].trim()) {
          const nextIdx = lines.slice(i).findIndex((x) => x.trim());
          const m2 = nextIdx >= 0 ? LIST.exec(lines[i + nextIdx]) : null;
          if (m2 && m2[1].length === baseIndent && (m2[3] !== undefined) === ordered) i += nextIdx;
        }
      }
      out.push(ordered ? { t: 'ol', start: Number(li[3]) || 1, items } : { t: 'ul', items });
      continue;
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_RULE.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const head = splitRow(line).map((c) => parseInline(c, opts));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]).map((c) => parseInline(c, opts)));
        i++;
      }
      out.push({ t: 'table', head, rows });
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) {
      para.push(lines[i]);
      i++;
    }
    const c = trimInline(parseInline(para.map((l) => l.trim()).join('\n'), opts));
    if (c.length) out.push({ t: 'p', c });
  }
  return out;
}

/** Trims the whitespace at a paragraph's ends (e.g. left behind by removed HTML tags). */
function trimInline(c: Inline[]): Inline[] {
  const out = [...c];
  while (out.length && out[0].t === 'text' && !out[0].v.trim()) out.shift();
  while (out.length && out[out.length - 1].t === 'text' && !(out[out.length - 1] as { v: string }).v.trim())
    out.pop();
  const first = out[0];
  if (first?.t === 'text') out[0] = { t: 'text', v: first.v.trimStart() };
  const last = out[out.length - 1];
  if (last?.t === 'text') out[out.length - 1] = { t: 'text', v: last.v.trimEnd() };
  return out;
}

/** The plain text of some inline nodes (for alt text, labels, and length checks). */
export function inlineText(c: readonly Inline[]): string {
  return c
    .map((n) => {
      if (n.t === 'text' || n.t === 'code') return n.v;
      if (n.t === 'img') return n.alt;
      if (n.t === 'br') return ' ';
      return inlineText(n.c);
    })
    .join('');
}

function blockText(b: Block): string {
  switch (b.t) {
    case 'p':
    case 'h':
      return inlineText(b.c);
    case 'ul':
    case 'ol':
      return b.items.map((it) => it.map(blockText).join(' ')).join(' ');
    case 'quote':
      return b.c.map(blockText).join(' ');
    case 'pre':
      return b.v;
    case 'table':
      return '';
    case 'hr':
      return '';
  }
}

const onlyImages = (b: Block) =>
  b.t === 'p' && b.c.every((n) => n.t === 'img' || n.t === 'br' || (n.t === 'text' && !n.v.trim()));

/**
 * A short "From the course" excerpt: the section's opening paragraphs, lists, and notes (no heading,
 * pictures, tables, or code), stopping once about `maxChars` of text is collected.
 */
export function excerptBlocks(all: readonly Block[], maxChars = 420): Block[] {
  const start = all[0]?.t === 'h' ? 1 : 0;
  const end = all.findIndex((b, k) => k >= start && b.t === 'h');
  const body = all.slice(start, end < 0 ? all.length : end);
  const usable = (b: Block) =>
    b.t !== 'pre' && b.t !== 'table' && b.t !== 'hr' && !onlyImages(b) && blockText(b).trim() !== '';
  // Notes and warnings (GitHub alerts) are asides: use them only when there's nothing else.
  const main = body.filter((b) => usable(b) && !(b.t === 'quote' && b.alert));
  const pool = main.length ? main : body.filter(usable);
  const out: Block[] = [];
  let n = 0;
  for (const b of pool) {
    const text = blockText(b);
    if (out.length && n + text.length > maxChars) break;
    out.push(stripImages(b));
    n += text.length;
    if (n >= maxChars) break;
  }
  return out;
}

function stripImages(b: Block): Block {
  const keep = (c: Inline[]) => c.filter((n) => n.t !== 'img');
  switch (b.t) {
    case 'p':
      return { ...b, c: keep(b.c) };
    case 'ul':
    case 'ol':
      return { ...b, items: b.items.map((it) => it.filter((x) => !onlyImages(x)).map(stripImages)) };
    case 'quote':
      return { ...b, c: b.c.filter((x) => !onlyImages(x)).map(stripImages) };
    default:
      return b;
  }
}
