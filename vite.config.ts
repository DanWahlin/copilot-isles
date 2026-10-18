/// <reference types="vitest/config" />
import {
  cpSync,
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The Credits screen reads asset authors from ASSETS.md (dev serves it from the root); ship a copy
// next to index.html so it also loads from a sub-path deploy such as GitHub Pages.
function assetCredits(): Plugin {
  return {
    name: 'asset-credits',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'ASSETS.md', source: readFileSync('ASSETS.md', 'utf8') });
    },
  };
}

const COURSES_DIR = resolve('courses');
const COURSE_TYPES: Readonly<Record<string, string>> = {
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// Course packs (docs/specs/COURSE-PACKS.md §2): each pack's `public/` folder (its course snapshot and
// voice) is served as `<base>courses/<id>/`, from the pack in dev and copied into the build.
/** Every pack's course repository (`course.json` → `source.repo`), for the service worker's allow-list. */
function courseRepos(): string[] {
  return readdirSync(COURSES_DIR)
    .filter((id) => existsSync(join(COURSES_DIR, id, 'course.json')))
    .map(
      (id) =>
        (
          JSON.parse(readFileSync(join(COURSES_DIR, id, 'course.json'), 'utf8')) as {
            source?: { repo?: string };
          }
        ).source?.repo,
    )
    .filter((r): r is string => !!r)
    .sort();
}

function coursePackAssets(): Plugin {
  const packs = () => readdirSync(COURSES_DIR).filter((id) => existsSync(join(COURSES_DIR, id, 'public')));
  return {
    name: 'course-pack-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/courses\/([a-z0-9-]+)\/([^?#]+)/.exec(req.url ?? '');
        if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        const root = join(COURSES_DIR, m[1]!, 'public');
        const file = resolve(root, decodeURIComponent(m[2]!));
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader(
          'Content-Type',
          COURSE_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        );
        res.setHeader('Content-Length', statSync(file).size);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? resolve('dist');
      for (const id of packs())
        cpSync(join(COURSES_DIR, id, 'public'), join(out, 'courses', id), { recursive: true });
      // The service worker caches live course files only from the packs' own repositories.
      const sw = join(out, 'sw.js');
      if (existsSync(sw))
        writeFileSync(
          sw,
          readFileSync(sw, 'utf8').replace(
            /(\/\* course-repos \*\/ )\[[^\]]*\]/,
            `$1${JSON.stringify(courseRepos()).replaceAll('"', "'").replaceAll(',', ', ')}`,
          ),
        );
    },
  };
}

// PLAN §13.1: boot stays tiny; three.js and React get their own long-lived hashed chunks,
// and game systems load later through dynamic import().
export default defineConfig({
  base: './',
  plugins: [react(), assetCredits(), coursePackAssets()],
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000, // size is enforced by tools/check-budgets.mjs instead
    rollupOptions: {
      output: {
        manualChunks(id) {
          // three/webgpu + three/tsl (WebGPURenderer with its WebGL2 backend) share one long-lived chunk.
          // Addons (loaders, post nodes, SkyMesh) ride with the chunks that import them.
          if (id.includes('node_modules/three/examples/')) return undefined;
          if (id.includes('node_modules/three/')) return 'vendor-three';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-ui';
          // A course pack's data (everything but its course.json, which the title reads) is one lazy
          // chunk per course (COURSE-PACKS.md §2; budget in tools/budgets.json).
          const pack = /\/courses\/([a-z0-9-]+)\/(?!course\.json$)[^?]+\.json$/.exec(id);
          if (pack) return `course-${pack[1]}`;
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/course/test-setup.ts'],
    environment: 'node',
  },
});
