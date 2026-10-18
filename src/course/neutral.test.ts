import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The game stays course-neutral (docs/specs/COURSE-PACKS.md, "Step 5 as built"): a course's ids and
 * words live in its pack, and game code acts on its own ids (`steer`, `channel`, `tavern`, `small`…)
 * that a pack binds its ids to. This scans the game's code (less tests, dev pages and comments) for
 * ids and words of the courses we have, so they can't creep back in.
 */
const ROOT = join(__dirname, '../..');

const DENIED: readonly { what: RegExp; except?: readonly string[] }[] = [
  // Quest ids, and the chests' pages and puzzle names that used them.
  { what: /['"`]Q\d+\.\d/ },
  { what: /['"`]pg\d*\./ },
  // The Copilot app course: its id and repository (the catalog lists every pack's course.json).
  { what: /copilot-app/, except: ['src/course/catalog.ts'] },
  { what: /copilot-cli/, except: ['src/course/catalog.ts'] },
  // The concepts the puzzles act out: session modes and review options, workspaces, crews, the
  // twist's answers, ports, model categories, crate kinds, the Settings areas.
  { what: /'(interactive|autopilot)'/, except: ['src/audio/index.ts', 'src/audio/early-context.ts'] },
  { what: /'(approve|exit|suggest)'/ },
  { what: /'(worktree|checkout|cloud)'/ },
  { what: /'(feature|bugfix|docs|bug-fix)'/ },
  { what: /'(redig|port5174|closeOne|share)'/ },
  { what: /\b517[34]\b/, except: ['src/world/terrain/rock-assets.ts'] },
  { what: /'(Lightweight|Versatile|Powerful)'/ },
  { what: /'(chat|project|projects)'/ },
  // Course words that used to be on signs, plates, flags and the tracker.
  { what: /Base branch|PROMPT BOX|REYES|Port Meridian’s next|GitHub Copilot app|Chronicle/ },
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

/** The code without its comments (line numbers kept). */
function code(src: string): string[] {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .split('\n');
}

describe('the game is course-neutral', () => {
  it('names no course id or course word in its code', () => {
    const found: string[] = [];
    for (const path of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, path).split('\\').join('/');
      if (skip(rel)) continue;
      code(readFileSync(path, 'utf8')).forEach((line, i) => {
        for (const d of DENIED)
          if (d.what.test(line) && !d.except?.includes(rel))
            found.push(`${rel}:${i + 1} ${d.what}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('finds the words it looks for, in code and not in comments', () => {
    const denied = (src: string) => code(src).some((l) => DENIED.some((d) => d.what.test(l)));
    expect(denied("const a = 'worktree';")).toBe(true);
    expect(denied("const a = 1; // 'worktree'")).toBe(false);
    expect(denied("/* 'Q0.2' */ const b = 1;")).toBe(false);
    expect(denied("const url = 'https://example.com/a'; const q = 'Q0.2';")).toBe(true);
  });
});
