import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The game stays course-neutral (docs/specs/COURSE-PACKS.md, "Step 5 as built"): a course's ids and
 * words live in its pack, and game code acts on its own ids (`steer`, `channel`, `tavern`, `small`…)
 * that a pack binds its ids to. This scans the game's code (less tests, dev pages and comments) for
 * ids and words of the courses we have, so they can't creep back in.
 */
const ROOT = join(__dirname, '../..');

/** The credits' prose names the cloud rendering and this project (the game's, not a course's). */
const CREDITS = 'src/ui/screens/CreditsScreen.tsx';

const DENIED: readonly { what: RegExp; except?: readonly string[] }[] = [
  // Quest ids, and the chests' pages and puzzle names that used them.
  { what: /['"`]Q\d+\.\d/ },
  { what: /['"`]pg\d*\./ },
  // The Copilot app course: its id and repository (the catalog lists every pack's course.json).
  { what: /copilot-app/, except: ['src/course/catalog.ts'] },
  { what: /copilot-cli/, except: ['src/course/catalog.ts'] },
  // The concepts the puzzles act out: session modes and review options, workspaces, crews, the
  // twist's answers, ports, model categories, crate kinds, the Settings areas. Quoted in code, or a
  // word of a JSX text (`scan` quotes each one).
  { what: /['"`](interactive|autopilot)['"`]/, except: ['src/audio/index.ts', 'src/audio/early-context.ts'] },
  { what: /['"`](approve|exit|suggest)['"`]/ },
  { what: /['"`](worktree|checkout|cloud)['"`]/, except: [CREDITS] },
  { what: /['"`](feature|bugfix|docs|bug-fix)['"`]/ },
  { what: /['"`](redig|port5174|closeOne|share)['"`]/ },
  { what: /\b517[34]\b/, except: ['src/world/terrain/rock-assets.ts'] },
  { what: /['"`](Lightweight|Versatile|Powerful)['"`]/ },
  { what: /['"`](chat|project|projects)['"`]/, except: [CREDITS] },
  // Course words that used to be on signs, plates, flags, the crane's arm and the tracker.
  {
    what: /Base branch|Default branch|Repository:|PROMPT BOX|REYES|Port Meridian’s next|GitHub Copilot app|Chronicle/,
  },
];

/** Files the scan skips: tests and dev pages. */
const skip = (rel: string) =>
  /\.test\.tsx?$/.test(rel) || rel.startsWith('src/dev/') || !/\.(ts|tsx)$/.test(rel);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/**
 * The code to scan, by line (line numbers kept), from TypeScript's own parser: comments are blanked
 * (the trivia before every token, so a `/*` or `//` inside a string, a template or a regular
 * expression stays code), and each JSX text is followed by its words, quoted, so a quoted-id pattern
 * finds a word of prose as it finds a string.
 */
function code(src: string, tsx = true): string[] {
  const sf = ts.createSourceFile(
    'scan.tsx',
    src,
    ts.ScriptTarget.Latest,
    false,
    tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = src.split('');
  const jsx: { at: number; text: string }[] = [];
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
  };
  const walk = (node: ts.Node): void => {
    const kids = node.getChildren(sf);
    if (kids.length) return kids.forEach(walk);
    blank(node.pos, node.getStart(sf));
    if (node.kind === ts.SyntaxKind.JsxText) jsx.push({ at: node.getStart(sf), text: node.getText(sf) });
  };
  walk(sf);
  const lines = out.join('').split('\n');
  for (const { at, text } of jsx) {
    const words = text.split(/[^\w@#-]+/).filter(Boolean);
    if (!words.length) continue;
    const line = sf.getLineAndCharacterOfPosition(at).line;
    lines[line] += ` ${words.map((w) => `'${w}'`).join(' ')}`;
  }
  return lines;
}

describe('the game is course-neutral', () => {
  // It parses every source file (~1.3 s idle), so a busy runner needs more than the default 5 s.
  it('names no course id or course word in its code', () => {
    const found: string[] = [];
    for (const path of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, path).split('\\').join('/');
      if (skip(rel)) continue;
      code(readFileSync(path, 'utf8'), rel.endsWith('.tsx')).forEach((line, i) => {
        for (const d of DENIED)
          if (d.what.test(line) && !d.except?.includes(rel))
            found.push(`${rel}:${i + 1} ${d.what}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  }, 30_000);

  it('finds the words it looks for, in code and not in comments', () => {
    const denied = (src: string, tsx = false) =>
      code(src, tsx).some((l) => DENIED.some((d) => d.what.test(l)));
    expect(denied("const a = 'worktree';")).toBe(true);
    expect(denied('const a = "worktree";')).toBe(true);
    expect(denied('const a = `worktree`;')).toBe(true);
    expect(denied("const a = 1; // 'worktree'")).toBe(false);
    expect(denied("/* 'Q0.2' */ const b = 1;")).toBe(false);
    expect(denied("const url = 'https://example.com/a'; const q = 'Q0.2';")).toBe(true);
    // A `/*` in a string or a regular expression doesn't start a comment.
    expect(denied("const g = '../../courses/*/**/*.json'; const a = 'worktree';")).toBe(true);
    expect(denied("const r = /\\/\\*/; const a = 'worktree'; // */")).toBe(true);
    expect(denied('const t = `a ${b} /* c`; const a = "worktree";')).toBe(true);
    // JSX text: a concept word in prose, and a course phrase.
    expect(denied('const v = <p>Make a worktree first</p>;', true)).toBe(true);
    expect(denied('const v = <p>Default branch: main</p>;', true)).toBe(true);
    expect(denied('const v = <p>{/* worktree */}Branches</p>;', true)).toBe(false);
  });
});
