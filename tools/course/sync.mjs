#!/usr/bin/env node
/**
 * Course snapshot sync (PLAN §8.2, §8.4 steps 1-3). Pulls the course's root README (the chapter
 * list), GLOSSARY.md, LICENSE, each snapshotted chapter's README.md, the appendices the pack names
 * (`source.appendices`: `appendices/<name>.md`, to `course/appendices/<name>.md`), and every image
 * those files reference from raw.githubusercontent.com at one commit, copies them byte-for-byte into the course
 * pack's snapshot (`courses/<id>/public/course/**`), and writes the pack's `lock.json` with the
 * commit SHA and a hash per section and image. It never calls the GitHub REST API: the commit comes
 * from `git ls-remote`. The course's repository and chapters are the pack's `course.json` → `source`.
 *
 * Images that authored content points at (`src: 'course/…'` in the pack's chapters/*.json) are pinned:
 * hotspot rects, alt text, and captions were written against those exact files, so sync keeps the
 * bundled file and records the upstream hash beside it for the drift report. `--unpin` takes the
 * upstream file once someone has re-checked the content.
 *
 *   node tools/course/sync.mjs                     sync main (chapters already in the lock, or 00-02)
 *   node tools/course/sync.mjs --course=<id>       another course pack (default copilot-app)
 *   node tools/course/sync.mjs --chapters=00,01,02,03
 *   node tools/course/sync.mjs --ref=<sha>         sync one commit (the lock keeps following its branch)
 *   node tools/course/sync.mjs --from=<clone dir>  read files from a local clone (offline)
 *   node tools/course/sync.mjs --check             step 1: is upstream newer than the lock? (no writes)
 *   node tools/course/sync.mjs --unpin=course/ch01/app-new-page.webp[,…] | --unpin-all
 *   node tools/course/sync.mjs --report=<dir>      also save upstream copies of changed pinned images
 *
 * Writes `changed=true|false`, `sha=…` and `previous=…` to $GITHUB_OUTPUT when it's set.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

// The course pack (docs/specs/COURSE-PACKS.md): its course.json names the course's repository and
// chapters. `--check` needs only that, so it runs without installing dependencies; the TS helpers
// load after it.
const COURSE = typeof args.course === 'string' ? args.course : 'copilot-app';
if (!/^[a-z0-9-]+$/.test(COURSE)) throw new Error(`--course: "${COURSE}" isn't a course id`);
const PACK = join(root, 'courses', COURSE);
const META = JSON.parse(readFileSync(join(PACK, 'course.json'), 'utf8'));
const LOCK = join(PACK, 'lock.json');
/** The pack's served files: the snapshot is `course/**` in here, as the lock's paths say. */
const PUBLIC = join(PACK, 'public');
const COURSE_REPO = META.source.repo;
const COURSE_CHAPTERS = META.source.chapters;
const COURSE_APPENDICES = META.source.appendices ?? [];
let repoPath,
  snapshotPathIn,
  chapterLock,
  appendixLock,
  linksAppendix,
  glossaryLock,
  parseCatalog,
  HASH_LENGTH;
const snapshotPath = (path) => snapshotPathIn(COURSE_CHAPTERS, path);

async function loadHelpers() {
  const { tsImport } = await import('tsx/esm/api');
  ({ repoPath, snapshotPathIn } = await tsImport('../../src/learn/course/chapters.ts', import.meta.url));
  ({ chapterLock, appendixLock, linksAppendix, glossaryLock, parseCatalog, HASH_LENGTH } = await tsImport(
    '../../src/learn/course/lock.ts',
    import.meta.url,
  ));
}

/** Images we derived from a course image (crops, painted-out status lines). Sync never overwrites them. */
const DERIVED = {
  'course/shared/app-review-panel.webp': '03-development-workflows/assets/app-workspace-panel.webp',
};
const RASTER = /\.(webp|png|jpe?g|gif)$/i;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const short = (s) => (s ? s.slice(0, 7) : 'none');

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function upstreamSha(ref) {
  if (typeof args.from === 'string') {
    const { stdout } = await exec('git', ['-C', args.from, 'rev-parse', 'HEAD']);
    return stdout.trim();
  }
  const { stdout } = await exec('git', [
    'ls-remote',
    `https://github.com/${COURSE_REPO}.git`,
    `refs/heads/${ref}`,
  ]);
  const sha = stdout.split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git ls-remote found no branch "${ref}"`);
  return sha;
}

async function output(pairs) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(pairs)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
  );
}

/** A course file at `sha` as bytes (null when it doesn't exist). */
async function getFile(sha, path) {
  if (typeof args.from === 'string') {
    try {
      return await readFile(join(args.from, path));
    } catch {
      return null;
    }
  }
  const url = `https://raw.githubusercontent.com/${COURSE_REPO}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

/** Every `"src": "course/…"` that the pack's chapters use (their images, and hotspot quizzes' screenshots). */
async function authoredImages() {
  const dir = join(PACK, 'chapters');
  const out = new Set();
  if (!existsSync(dir)) return out;
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    const text = await readFile(join(dir, f), 'utf8');
    for (const m of text.matchAll(/"src":\s*"(course\/[^"]+)"/g)) out.add(m[1]);
  }
  return out;
}

async function writeIfChanged(file, data) {
  const old = existsSync(file) ? await readFile(file) : null;
  if (old && Buffer.compare(old, data) === 0) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  return true;
}

async function main() {
  const lock = await readJson(LOCK);
  // `--ref=<sha>` syncs that commit but keeps following the lock's branch.
  const pinned = typeof args.ref === 'string' && /^[0-9a-f]{40}$/i.test(args.ref);
  const ref = typeof args.ref === 'string' && !pinned ? args.ref : (lock?.ref ?? 'main');
  const sha = pinned ? args.ref.toLowerCase() : await upstreamSha(ref);

  if (args.check) {
    const changed = sha !== lock?.sha;
    console.log(
      changed ? `Course moved: ${short(lock?.sha)} → ${short(sha)}` : `Course unchanged at ${short(sha)}`,
    );
    await output({ changed, sha, previous: lock?.sha ?? '' });
    return;
  }

  await loadHelpers();
  const wanted =
    typeof args.chapters === 'string'
      ? args.chapters.split(',').map((n) => n.trim().padStart(2, '0'))
      : lock
        ? Object.keys(lock.chapters).map((id) => id.slice(0, 2))
        : ['00', '01', '02'];

  const rootReadme = await getFile(sha, 'README.md');
  if (!rootReadme) throw new Error('The course has no README.md at this commit');
  const catalog = parseCatalog(rootReadme.toString('utf8'));
  const written = [];
  const put = async (rel, data) => {
    if (await writeIfChanged(join(PUBLIC, rel), data)) written.push(rel);
  };
  await put('course/README.md', rootReadme);

  const chapters = {};
  const readmes = {}; // chapter id → its README's text (for the appendices' links)
  const referenced = new Map(); // snapshot path → upstream path
  for (const num of wanted) {
    const known = COURSE_CHAPTERS.find((c) => c.id.startsWith(`${num}-`));
    const listed = catalog.find((c) => c.num === num);
    const id = listed?.id ?? known?.id;
    if (!id) throw new Error(`No chapter ${num} in the course README`);
    const shortName = known?.short ?? `ch${num}`;
    const readme = await getFile(sha, `${id}/README.md`);
    if (!readme) throw new Error(`${id}/README.md is missing upstream (renamed folder?)`);
    await put(`course/${shortName}/README.md`, readme);
    const entry = chapterLock(
      readme.toString('utf8'),
      id,
      listed?.title ?? known?.title ?? id,
      shortName,
      (t) => sha256(t),
      repoPath,
    );
    chapters[id] = entry;
    readmes[id] = readme.toString('utf8');
    for (const s of Object.values(entry.sections))
      for (const p of s.images ?? []) {
        const snap = snapshotPath(p);
        if (snap && RASTER.test(p) && !DERIVED[snap]) referenced.set(snap, p);
      }
  }

  // Appendices: like a chapter's README, kept as course/appendices/<name>.md, with the chapters that link to it.
  const appendices = {};
  for (const name of COURSE_APPENDICES) {
    const path = `appendices/${name}.md`;
    const data = await getFile(sha, path);
    if (!data) throw new Error(`${path} is missing upstream (renamed?): fix course.json source.appendices`);
    await put(`course/${path}`, data);
    const text = data.toString('utf8');
    const linkedFrom = Object.keys(readmes).filter((id) => linksAppendix(readmes[id], name));
    const entry = appendixLock(text, name, linkedFrom, (t) => sha256(t), repoPath);
    appendices[name] = entry;
    for (const s of Object.values(entry.sections))
      for (const p of s.images ?? []) {
        const snap = snapshotPath(p);
        if (snap && RASTER.test(p) && !DERIVED[snap]) referenced.set(snap, p);
      }
  }

  const glossary = await getFile(sha, 'GLOSSARY.md');
  if (glossary) await put('course/GLOSSARY.md', glossary);
  const license = await getFile(sha, 'LICENSE');
  if (license) await put('course/LICENSE', license);

  const authored = await authoredImages();
  const unpin = new Set(typeof args.unpin === 'string' ? args.unpin.split(',') : []);
  const images = {};
  const changedPinned = [];

  // Authored images no snapshotted README shows (the repo's shared assets, say) are still checked:
  // at their last known path, or else where their snapshot path says they came from.
  for (const snap of authored) {
    if (referenced.has(snap) || DERIVED[snap]) continue;
    const known = lock?.images?.[snap]?.upstream;
    const m = /^course\/(shared|ch\d{2})\/(.+)$/.exec(snap);
    const dir = m && m[1] !== 'shared' ? COURSE_CHAPTERS.find((c) => c.short === m[1])?.id : '';
    const guess = m && dir !== undefined ? `${dir ? `${dir}/` : ''}assets/${m[2]}` : null;
    if (known ?? guess) referenced.set(snap, known ?? guess);
  }

  for (const [snap, upstream] of [...referenced].sort(([a], [b]) => a.localeCompare(b))) {
    const data = await getFile(sha, upstream);
    if (!data) {
      console.warn(`  missing upstream: ${upstream}`);
      continue;
    }
    const file = join(PUBLIC, snap);
    const pinned = authored.has(snap) || !!lock?.images?.[snap]?.pinned;
    const keep = pinned && existsSync(file) && !args['unpin-all'] && !unpin.has(snap);
    const up = sha256(data);
    let bundled;
    if (keep) {
      const have = sha256(await readFile(file));
      if (have !== up) {
        bundled = have;
        changedPinned.push({ snap, data });
      }
    } else await put(snap, data);
    images[snap] = {
      upstream,
      sha256: up,
      ...(bundled ? { bundled } : {}),
      ...(pinned ? { pinned: true } : {}),
      bytes: data.length,
    };
  }

  for (const [snap, from] of Object.entries(DERIVED)) {
    const file = join(PUBLIC, snap);
    if (!existsSync(file)) continue;
    const src = await getFile(sha, from);
    const bytes = await readFile(file);
    images[snap] = {
      upstream: null,
      derivedFrom: from,
      ...(src ? { sha256: sha256(src) } : {}),
      bundled: sha256(bytes),
      pinned: true,
      bytes: bytes.length,
    };
  }

  const next = {
    $comment:
      'Written by tools/course/sync.mjs (PLAN §8.2). Section hashes are the first 12 hex digits of the SHA-256 of normalizeForCompare(markdown); images keep the full SHA-256. Do not edit by hand.',
    repo: COURSE_REPO,
    ref,
    sha,
    syncedAt: lock?.sha === sha && !written.length ? lock.syncedAt : new Date().toISOString().slice(0, 10),
    catalog,
    chapters,
    ...(COURSE_APPENDICES.length ? { appendices } : {}),
    glossary: glossary ? glossaryLock(glossary.toString('utf8'), (t) => sha256(t)) : { hash: '', terms: {} },
    license: { hash: license ? sha256(license).slice(0, HASH_LENGTH) : '' },
    images,
  };

  let text = JSON.stringify(next, null, 2) + '\n';
  try {
    const prettier = await import('prettier');
    text = await prettier.format(text, { ...(await prettier.resolveConfig(LOCK)), filepath: LOCK });
  } catch {
    // Prettier is a dev dependency; plain JSON is fine without it.
  }
  const lockChanged = await writeIfChanged(LOCK, Buffer.from(text));

  if (typeof args.report === 'string' && changedPinned.length) {
    for (const { snap, data } of changedPinned) {
      const out = join(args.report, 'upstream', snap);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, data);
    }
  }

  console.log(
    `Course @ ${short(sha)} (was ${short(lock?.sha)}): ${[...Object.keys(chapters), ...COURSE_APPENDICES.map((n) => `appendix:${n}`)].join(', ')}`,
  );
  console.log(
    `  ${written.length} snapshot file(s) written${written.length ? `: ${written.join(', ')}` : ''}`,
  );
  console.log(`  lock ${lockChanged ? 'updated' : 'unchanged'}; ${Object.keys(images).length} images`);
  if (changedPinned.length)
    console.log(
      `  pinned images that differ upstream (kept): ${changedPinned.map((c) => c.snap).join(', ')}`,
    );
  await output({ changed: sha !== lock?.sha || written.length > 0, sha, previous: lock?.sha ?? '' });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
