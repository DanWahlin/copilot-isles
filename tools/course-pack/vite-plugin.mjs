/**
 * Splits each course pack for the browser (docs/specs/COURSE-PACKS.md §2, src/course/split.ts).
 *
 * - `virtual:course-packs`: course id → a loader of its core module (src/course/load.ts imports it).
 * - `virtual:course-pack/<id>`: the core (the lazy chunk `course-<id>`, vite.config.ts) and where each
 *   chapter's part is. A build emits each part as `assets/course-<id>-<chapter>-<hash>.json` (a file
 *   the game fetches with a request priority, which a dynamic import can't set; the hash changes with
 *   its content, so the service worker can keep it). The dev server serves each part from the pack
 *   on disk at `/__course-parts/<id>/<chapter>.json`. Vitest gets the parts in the module (no fetch).
 *
 * The split itself is the game's TypeScript (one copy), loaded through Vite's module runner: the
 * config stays plain JavaScript with no TypeScript imports.
 */
import { createHash } from 'node:crypto';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const INDEX = 'virtual:course-packs';
const PACK = 'virtual:course-pack/';
const PARTS_URL = '/__course-parts/';

/** @type {Promise<typeof import('./files.ts')> | null} */
let disk = null;
const files = () =>
  (disk ??= runnerImport(fileURLToPath(new URL('./files.ts', import.meta.url)), {
    configFile: false,
    logLevel: 'silent',
  }).then((r) => /** @type {typeof import('./files.ts')} */ (r.module)));

/**
 * @param {string} coursesDir The packs' folder (`courses/`).
 * @returns {import('vite').Plugin}
 */
export function coursePackSplit(coursesDir) {
  /** @type {'build' | 'serve' | 'test'} */
  let mode = 'serve';
  return {
    name: 'course-pack-split',
    configResolved(c) {
      mode = process.env.VITEST ? 'test' : c.command === 'build' ? 'build' : 'serve';
    },
    resolveId: {
      filter: { id: /^virtual:course-packs?(?:$|\/)/ },
      handler(id) {
        return id === INDEX || id.startsWith(PACK) ? `\0${id}` : undefined;
      },
    },
    load: {
      filter: { id: /^\0virtual:course-packs?(?:$|\/)/ },
      async handler(id) {
        if (id === `\0${INDEX}`) {
          const rows = (await files())
            .packIds(coursesDir)
            .map((c) => `  ${JSON.stringify(c)}: () => import(${JSON.stringify(PACK + c)}),`);
          return `export default {\n${rows.join('\n')}\n};\n`;
        }
        if (!id.startsWith(`\0${PACK}`)) return undefined;
        const course = id.slice(1 + PACK.length);
        const f = await files();
        if (!f.packIds(coursesDir).includes(course))
          throw new Error(`No course pack "${course}" in ${coursesDir}`);
        const { core, parts } = f.splitFromDisk(coursesDir, course);
        let head = '';
        let where;
        if (mode === 'test') where = JSON.stringify(parts);
        else if (mode === 'serve')
          where = JSON.stringify(
            Object.fromEntries(Object.keys(parts).map((c) => [c, `${PARTS_URL}${course}/${c}.json`])),
          );
        else {
          // Next to the core chunk (both in assets/), so a URL from the chunk's own finds it from any base.
          head = 'const at = (f) => new URL(f, import.meta.url).href;\n';
          const rows = Object.entries(parts).map(([c, part]) => {
            const source = JSON.stringify(part);
            const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
            const name = `course-${course}-${c}-${hash}.json`;
            this.emitFile({ type: 'asset', fileName: `assets/${name}`, source });
            return `  ${JSON.stringify(c)}: at(${JSON.stringify(`./${name}`)}),`;
          });
          where = `{\n${rows.join('\n')}\n}`;
        }
        return `${head}export const core = ${JSON.stringify(core)};\nexport const parts = ${where};\n`;
      },
    },
    configureServer(server) {
      // A pack edited on disk: its module reloads (the page with it), and its parts are read fresh.
      server.watcher.on('change', (file) => {
        if (!file.startsWith(coursesDir + sep) || !file.endsWith('.json')) return;
        const course = file.slice(coursesDir.length + 1).split(sep)[0];
        const graph = server.environments.client.moduleGraph;
        const m = graph.getModuleById(`\0${PACK}${course}`);
        if (!m) return;
        graph.invalidateModule(m);
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        const m = /^\/__course-parts\/([a-z0-9-]+)\/([a-z0-9-]+)\.json(?:[?#].*)?$/.exec(req.url ?? '');
        if (!m) return next();
        files()
          .then((f) => {
            const part = f.packIds(coursesDir).includes(m[1])
              ? f.splitFromDisk(coursesDir, m[1]).parts[m[2]]
              : null;
            if (!part) return next();
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(part));
          })
          .catch(next);
      });
    },
  };
}
