import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CourseBlocks } from '../../ui/learn/CourseMarkdown';
import {
  excerptBlocks,
  inlineText,
  linkRefs,
  parseInline,
  parseMarkdown,
  safeHref,
  safeImageSrc,
  type Block,
  type MarkdownOptions,
} from './markdown';
import { chapterResolvers } from './source';

const html = (md: string, opts: MarkdownOptions = chapterResolvers('00-setup', 'live')) =>
  renderToStaticMarkup(createElement(CourseBlocks, { blocks: parseMarkdown(md, opts) }));

describe('course markdown', () => {
  it('renders the course’s inline marks', () => {
    expect(html('Select **New**, then *Chat*, and run `gh auth status`.')).toBe(
      '<p>Select <strong>New</strong>, then <em>Chat</em>, and run <code>gh auth status</code>.</p>',
    );
    expect(html('snake_case_name stays as is')).toBe('<p>snake_case_name stays as is</p>');
    expect(html('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>');
  });

  it('opens links in a new tab and resolves them against the course repo', () => {
    const out = html('See [Chapter 01](../01-tour-the-app/README.md#modes) and [this](#prerequisites).');
    expect(out).toContain(
      'href="https://github.com/github/copilot-app-for-beginners/blob/main/01-tour-the-app/README.md#modes" target="_blank" rel="noopener noreferrer"',
    );
    expect(out).toContain(
      'href="https://github.com/github/copilot-app-for-beginners/blob/main/00-setup/README.md#prerequisites"',
    );
    expect(html('[samples](../samples/book-app-web)')).toContain(
      'href="https://github.com/github/copilot-app-for-beginners/tree/main/samples/book-app-web"',
    );
  });

  it('resolves images to the live course or the snapshot and keeps their alt text', () => {
    const md =
      '![Projects menu](assets/app-add-project.webp)\n\n<img src="../assets/app-github-copilot-app.webp" alt="The app" width="800" />';
    expect(html(md)).toContain(
      '<img src="https://raw.githubusercontent.com/github/copilot-app-for-beginners/main/00-setup/assets/app-add-project.webp" alt="Projects menu"',
    );
    const snap = html(md, chapterResolvers('00-setup', 'snapshot'));
    expect(snap).toContain('src="/courses/copilot-app/course/ch00/app-add-project.webp" alt="Projects menu"');
    expect(snap).toContain(
      'src="/courses/copilot-app/course/shared/app-github-copilot-app.webp" alt="The app"',
    );
  });

  it('parses lists, nested content, notes, tables, and code', () => {
    const md = [
      '1. Open the app.',
      '2. Select **Sign in**.',
      '',
      '    <img src="assets/app-sign-in.webp" alt="Sign in" />',
      '',
      '3. Done.',
      '',
      '- a',
      '  - nested',
      '',
      '> [!TIP]',
      '> Keep it short.',
      '',
      '| Mode | Use |',
      '|---|---|',
      '| Plan | First <br> then go |',
      '',
      '```bash',
      'node -v',
      '```',
    ].join('\n');
    const blocks = parseMarkdown(md, chapterResolvers('00-setup', 'live'));
    expect(blocks.map((b) => b.t)).toEqual(['ol', 'ul', 'quote', 'table', 'pre']);
    const ol = blocks[0] as Extract<Block, { t: 'ol' }>;
    expect(ol.items).toHaveLength(3);
    expect(ol.items[1].some((b) => b.t === 'p' && b.c.some((n) => n.t === 'img'))).toBe(true);
    expect((blocks[2] as Extract<Block, { t: 'quote' }>).alert).toBe('tip');
    const out = html(md);
    expect(out).toContain('<td>First <br/> then go</td>');
    expect(out).toContain('<pre class="ci-page-code"><code>node -v</code></pre>');
    expect(out).toContain('<ul><li><p>a</p><ul><li><p>nested</p></li></ul></li></ul>');
  });

  it('resolves reference links from the whole README', () => {
    const readme =
      '## A\n\n1. [Fork it][fork-repo-link] and see [Docs][] or [docs].\n\n[fork-repo-link]: https://github.com/github/copilot-app-for-beginners/fork\n[docs]: https://docs.github.com/x "Title"\n';
    const refs = linkRefs(readme);
    expect(refs.get('fork-repo-link')).toBe('https://github.com/github/copilot-app-for-beginners/fork');
    const out = html(readme, { ...chapterResolvers('00-setup', 'live'), refs });
    expect(out).toContain(
      '<a class="ci-rich-link" href="https://github.com/github/copilot-app-for-beginners/fork"',
    );
    expect(out.match(/href="https:\/\/docs\.github\.com\/x"/g)).toHaveLength(2);
    expect(out).not.toContain('fork-repo-link');
    expect(html('[not a ref] and [!NOTE]')).toBe('<p>[not a ref] and [!NOTE]</p>');
  });

  it('drops raw HTML except images and line breaks', () => {
    const out = html(
      '<details>\n<summary>Settings reference</summary>\n\n<div align="center">Hi <b>there</b></div>\n</details>',
    );
    expect(out).toBe('<p>Settings reference</p><p>Hi there</p>');
  });

  it('can leave out collapsed <details> blocks', () => {
    const md =
      'Before.\n\n<details>\n<summary>Reference</summary>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n</details>\n\nAfter.';
    expect(
      renderToStaticMarkup(createElement(CourseBlocks, { blocks: parseMarkdown(md, { dropDetails: true }) })),
    ).toBe('<p>Before.</p><p>After.</p>');
  });
});

describe('course markdown with hostile input', () => {
  const HOSTILE = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//evil.example/x.js></SCRIPT>',
    '<img src=x onerror=alert(1)>',
    '<img src="javascript:alert(1)//.png">',
    '<img src="https://evil.example/x.png" onload="alert(1)">',
    '<img src="data:image/png;base64,AAAA" alt="x.png">',
    '<img src="assets/x.webp" alt="x" onerror="alert(1)" style="background:url(javascript:alert(1))">',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD4=)',
    '[click](vbscript:msgbox)',
    '[x](&#106;avascript:alert(1))',
    '![x](javascript:alert(1))',
    '<a href="javascript:alert(1)">a</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)><circle/></svg>',
    '<style>body{display:none}</style>',
    '<form action="https://evil.example"><input name=x></form>',
    '<object data="x.swf"></object><embed src="x.swf">',
    '<!-- <script>alert(1)</script> -->',
    '<<script>script>alert(1)<</script>/script>',
    '<img src="https://raw.githubusercontent.com/github/copilot-app-for-beginners/main/x.webp" alt=\'" onerror="alert(1)\'>',
    '<p onclick="alert(1)">tap</p>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    '<base href="https://evil.example/">',
    '<link rel="stylesheet" href="https://evil.example/x.css">',
    '**<script>alert(1)</script>**',
    '`<script>alert(1)</script>`',
    '| <script>x</script> | b |\n|---|---|\n| <img src=x onerror=alert(1)> | c |',
    '> <iframe srcdoc="<script>alert(1)</script>"></iframe>',
  ].join('\n\n');

  it('never produces script, event handlers, or dangerous URLs', () => {
    const out = html(HOSTILE);
    expect(out).not.toMatch(/<script|<iframe|<svg|<style|<object|<embed|<form|<input|<meta|<base|<link/i);
    // Attribute values are escaped text, so look at attribute names only.
    const tags = out.replace(/"[^"]*"/g, '""');
    expect(tags).not.toMatch(/\son[a-z]+=/i);
    expect(out).not.toMatch(/javascript:|vbscript:|data:/i);
    expect(out).not.toMatch(/evil\.example/);
    expect(tags).not.toMatch(/style=/i);
    // Only course-hosted or bundled images get through.
    for (const m of out.matchAll(/<img [^>]*src="([^"]*)"/g))
      expect(m[1]).toMatch(
        /^(https:\/\/raw\.githubusercontent\.com\/github\/copilot-app-for-beginners\/|\/course\/)/,
      );
    // Every link is an http(s) URL that opens in a new tab.
    for (const m of out.matchAll(/<a ([^>]*)>/g)) {
      expect(m[1]).toMatch(/href="https?:\/\//);
      expect(m[1]).toContain('target="_blank"');
      expect(m[1]).toContain('rel="noopener noreferrer"');
    }
  });

  it('drops multi-line script, style, and comment blocks entirely', () => {
    const md =
      'A.\n\n<style>\nbody { display: none }\n\n.x {}\n</style>\n\n<script>\nalert(1)\n\nalert(2)\n</script>\n\n<!--\nhidden\n\nnote\n-->\n\nB.';
    expect(html(md)).toBe('<p>A.</p><p>B.</p>');
    expect(html('```html\n<script>shown as code</script>\n```')).toContain('&lt;script&gt;shown as code');
  });

  it('keeps code spans as text', () => {
    expect(html('`<script>alert(1)</script>`')).toBe(
      '<p><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></p>',
    );
  });

  it('survives pathological nesting and unclosed markers', () => {
    const deep = '>'.repeat(200) + ' deep';
    const brackets = '['.repeat(5000) + 'x' + ']'.repeat(5000);
    const stars = '*'.repeat(10000);
    const t = Date.now();
    for (const md of [deep, brackets, stars, '- '.repeat(500) + 'x', '**a *b **c'])
      expect(() => html(md)).not.toThrow();
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it('checks URLs strictly', () => {
    expect(safeHref('https://github.com/x')).toBe('https://github.com/x');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(' javascript:alert(1)')).toBeNull();
    expect(safeHref('/relative')).toBeNull();
    expect(safeImageSrc('/course/ch00/a.webp')).toBe('/course/ch00/a.webp');
    expect(safeImageSrc('./course/ch00/a.webp')).toBe('./course/ch00/a.webp');
    expect(safeImageSrc('/course/../secret.webp')).toBeNull();
    expect(safeImageSrc('/courses/copilot-app/course/ch00/a.webp')).toBe(
      '/courses/copilot-app/course/ch00/a.webp',
    );
    expect(safeImageSrc('./courses/copilot-app/course/ch00/a.webp')).toBe(
      './courses/copilot-app/course/ch00/a.webp',
    );
    expect(safeImageSrc('/kraken-isles/courses/copilot-app/course/a.webp')).toBe(
      '/kraken-isles/courses/copilot-app/course/a.webp',
    );
    expect(safeImageSrc('/courses/../course/a.webp')).toBeNull();
    expect(safeImageSrc('/courses/copilot-app/voice/a.webp')).toBeNull();
    expect(safeImageSrc('http://raw.githubusercontent.com/a.webp')).toBeNull();
    expect(safeImageSrc('https://raw.githubusercontent.com/a.svg')).toBeNull();
    expect(safeImageSrc('https://evil.example/a.webp')).toBeNull();
  });
});

describe('excerptBlocks', () => {
  it('takes the opening text of a section and skips pictures, tables, and code', () => {
    const md = [
      '## Installation',
      '',
      '![pic](assets/a.webp)',
      '',
      'First paragraph about **installing**.',
      '',
      '```',
      'code',
      '```',
      '',
      '1. Step one.',
      '',
      '### Sub',
      '',
      'Not included.',
    ].join('\n');
    const blocks = excerptBlocks(parseMarkdown(md), 1000);
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ol']);
    expect(inlineText((blocks[0] as Extract<Block, { t: 'p' }>).c)).toBe('First paragraph about installing.');
  });

  it('uses notes only when the section has nothing else', () => {
    const md = '## A\n\n> [!NOTE]\n> An aside.\n\n1. The real steps.';
    expect(excerptBlocks(parseMarkdown(md)).map((b) => b.t)).toEqual(['ol']);
    expect(excerptBlocks(parseMarkdown('## A\n\n> [!TIP]\n> Only this.')).map((b) => b.t)).toEqual(['quote']);
  });

  it('stops near the length limit but always keeps the first block', () => {
    const md = `## A\n\n${'word '.repeat(200)}\n\nSecond.`;
    expect(excerptBlocks(parseMarkdown(md), 100)).toHaveLength(1);
  });

  it('parses inline text without options', () => {
    expect(parseInline('a &amp; b')).toEqual([{ t: 'text', v: 'a & b' }]);
  });
});
