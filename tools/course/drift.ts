/**
 * Course drift report (PLAN §8.4 step 4). Compares authored content's `SourceRef`s and course images
 * against `content/course.lock.json` and lists everything the course moved underneath:
 *
 * - quizzes, Logbook pages, and voiced lines whose source section changed or disappeared,
 * - pinned screenshots (hotspot rects, captions) whose upstream file changed, with before/after
 *   montages when `sync.mjs --report=<dir>` saved the upstream copies,
 * - the UI-term check: bolded UI names the course dropped since the previous lock that authored
 *   text still uses, plus (for information) authored UI names the course doesn't mention at all.
 *
 *   npx tsx tools/course/drift.ts [--previous=<old lock.json>] [--report=<dir>] [--out=<report.md>]
 *
 * Writes `affected=true|false` to $GITHUB_OUTPUT; `affected` means a person should review the content.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, IMAGES, PAGES, QUIZZES } from '../../src/learn/content/index';
import type { CourseLock } from '../../src/learn/course/lock';
import type { SourceRef } from '../../src/learn/types';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || 'true'];
  }),
) as Record<string, string | undefined>;

const lock = JSON.parse(await readFile(join(root, 'content/course.lock.json'), 'utf8')) as CourseLock;
const previous =
  args.previous && existsSync(args.previous)
    ? (JSON.parse(await readFile(args.previous, 'utf8')) as CourseLock)
    : null;
const voice = JSON.parse(await readFile(join(root, 'tools/voice/lines.testcove.json'), 'utf8')) as {
  lines: { id: string; text: string }[];
};
const voiceText = new Map(voice.lines.map((l) => [l.id, l.text]));

interface Item {
  kind: 'quiz' | 'page' | 'voiced';
  id: string;
  ref: SourceRef;
  text: string;
}

const items: Item[] = [];
for (const q of QUIZZES.values())
  items.push({ kind: 'quiz', id: q.id, ref: q.source, text: JSON.stringify(q) });
for (const p of PAGES.values())
  items.push({ kind: 'page', id: p.id, ref: p.source, text: JSON.stringify(p) });
for (const c of CHAPTERS)
  for (const [id, ref] of Object.entries(c.voiced ?? {}))
    items.push({ kind: 'voiced', id, ref, text: voiceText.get(id) ?? '' });

const lines: string[] = [];
const say = (s = '') => lines.push(s);
const short = (s?: string) => (s ? s.slice(0, 7) : 'none');
const COURSE = 'https://github.com/github/copilot-app-for-beginners';

say(`## Course drift report`);
say();
say(
  previous && previous.sha !== lock.sha
    ? `Course moved from [\`${short(previous.sha)}\`](${COURSE}/commit/${previous.sha}) to [\`${short(lock.sha)}\`](${COURSE}/commit/${lock.sha}) ([compare](${COURSE}/compare/${previous.sha}...${lock.sha})).`
    : `Course snapshot at [\`${short(lock.sha)}\`](${COURSE}/commit/${lock.sha}).`,
);
say();

// 1 · Sections
const changed = new Map<string, Item[]>();
const missing: Item[] = [];
for (const it of items) {
  const ch = lock.chapters[it.ref.chapter];
  const sec = ch?.sections[it.ref.anchor];
  if (!sec) missing.push(it);
  else if (sec.hash !== it.ref.hash) {
    const key = `${it.ref.chapter}#${it.ref.anchor}`;
    changed.set(key, [...(changed.get(key) ?? []), it]);
  }
}
say(`### Authored content whose course section changed`);
say();
if (!changed.size && !missing.length) say('None. Every quiz, page, and voiced line matches its section.');
for (const [key, list] of changed) {
  const [chapter, anchor] = key.split('#');
  say(
    `- **[${chapter} · ${lock.chapters[chapter as SourceRef['chapter']]!.sections[anchor].title}](${COURSE}/blob/${lock.sha}/${chapter}/README.md#${anchor})** (now \`${lock.chapters[chapter as SourceRef['chapter']]!.sections[anchor].hash}\`, written against \`${list[0].ref.hash}\`)`,
  );
  say(`  - ${list.map((i) => `${i.kind} \`${i.id}\``).join(', ')}`);
}
if (missing.length) {
  say();
  say(`**Anchors that no longer exist** (players see the snapshot and a link to the chapter's top):`);
  for (const it of missing) say(`- ${it.kind} \`${it.id}\`: \`${it.ref.chapter}#${it.ref.anchor}\``);
}
say();

// 2 · Pinned images
say(`### Pinned screenshots that changed upstream`);
say();
const users = (src: string) => {
  const id = [...IMAGES.values()].find((i) => i.src === src)?.id;
  const q = [...QUIZZES.values()]
    .filter((x) => x.type === 'hotspot' && x.image === id)
    .map((x) => `hotspot \`${x.id}\``);
  const p = [...PAGES.values()].filter((x) => x.image === id).map((x) => `page \`${x.id}\``);
  return [...q, ...p].join(', ') || 'spyglass only';
};
// A derived image (our crop of a course image) drifts when its source file changes between locks.
const drifted = Object.entries(lock.images).filter(([src, i]) =>
  i.derivedFrom
    ? !!previous && previous.images[src]?.sha256 !== i.sha256
    : i.pinned && i.bundled && i.sha256 && i.bundled !== i.sha256,
);
if (!drifted.length) say('None.');
for (const [src, img] of drifted) {
  const hotspot = users(src).includes('hotspot');
  say(
    `- \`${src}\` ← \`${img.upstream ?? img.derivedFrom}\`${img.derivedFrom ? ' (we derived ours from it)' : ''}: ${users(src)}${hotspot ? ' — **re-measure the hotspot rects** before unpinning' : ''}`,
  );
}
say();

if (args.report && drifted.length) {
  try {
    const sharp = (await import('sharp')).default;
    for (const [src, img] of drifted) {
      const after = join(args.report, 'upstream', src);
      if (!img.upstream || !existsSync(after)) continue;
      const w = 900;
      const [a, b] = await Promise.all(
        [join(root, 'public', src), after].map((f) =>
          sharp(f).resize({ width: w }).png().toBuffer({ resolveWithObject: true }),
        ),
      );
      const h = Math.max(a.info.height, b.info.height);
      const out = join(args.report, 'montage', src.replace(/\.\w+$/, '.png'));
      await mkdir(dirname(out), { recursive: true });
      await sharp({ create: { width: w * 2 + 24, height: h, channels: 3, background: '#ffffff' } })
        .composite([
          { input: a.data, left: 0, top: 0 },
          { input: b.data, left: w + 24, top: 0 },
        ])
        .png()
        .toFile(out);
    }
    say(
      `Before (bundled, left) and after (course, right) montages are in the workflow's \`course-drift\` artifact.`,
    );
    say();
  } catch (err) {
    say(`(Montages skipped: ${(err as Error).message})`);
    say();
  }
}

// 3 · UI-term check
const BOLD = /\*\*(?!\s)([^*\n]+?)\*\*/g;
const termsOf = (l: CourseLock | null, chapter: string) =>
  new Set(
    Object.values(l?.chapters[chapter as SourceRef['chapter']]?.sections ?? {}).flatMap((s) => s.terms ?? []),
  );
const glossaryTerms = (l: CourseLock | null) =>
  new Set(Object.values(l?.glossary.terms ?? {}).flatMap((t) => [t.title, ...(t.terms ?? [])]));
const readme = new Map<string, string>();
for (const [id, ch] of Object.entries(lock.chapters)) {
  const f = join(root, 'public/course', ch!.short, 'README.md');
  if (existsSync(f)) readme.set(id, await readFile(f, 'utf8'));
}

const dropped: string[] = [];
if (previous)
  for (const chapter of Object.keys(lock.chapters)) {
    const now = new Set([...termsOf(lock, chapter), ...glossaryTerms(lock)]);
    for (const t of termsOf(previous, chapter)) if (!now.has(t)) dropped.push(t);
  }
const droppedHits: string[] = [];
for (const t of new Set(dropped)) {
  const re = new RegExp(`(^|[^\\w])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`);
  const hits = items.filter((it) => re.test(it.text));
  if (hits.length) droppedHits.push(`- **${t}**: ${hits.map((i) => `${i.kind} \`${i.id}\``).join(', ')}`);
}
say(`### UI-term check`);
say();
if (!previous) say('No previous lock to compare with, so dropped terms can’t be listed this run.');
else if (!dropped.length) say('The course didn’t drop or rename any bolded UI name.');
else {
  say(`UI names the course no longer bolds: ${[...new Set(dropped)].map((t) => `**${t}**`).join(', ')}.`);
  say();
  if (droppedHits.length) {
    say('Authored text that still uses them:');
    droppedHits.forEach((l) => say(l));
  } else say('No authored text uses them.');
}
say();

const unknown = new Map<string, Set<string>>();
for (const it of items) {
  if (it.kind === 'voiced') continue;
  const text = readme.get(it.ref.chapter) ?? '';
  for (const m of it.text.matchAll(BOLD)) {
    const t = m[1].replace(/`/g, '').trim();
    if (t.length < 3 || /^[+@#/&]/.test(t) || text.includes(t)) continue;
    unknown.set(t, (unknown.get(t) ?? new Set()).add(`${it.kind} \`${it.id}\``));
  }
}
if (unknown.size) {
  say('<details><summary>Authored UI names the chapter README doesn’t mention (for information)</summary>');
  say();
  for (const [t, where] of unknown)
    say(`- **${t}**: ${[...where].slice(0, 6).join(', ')}${where.size > 6 ? ', …' : ''}`);
  say();
  say('</details>');
  say();
}

const affected = changed.size > 0 || missing.length > 0 || drifted.length > 0 || droppedHits.length > 0;
say(
  affected
    ? '**Authored content is affected: this PR needs a content review.**'
    : 'No authored content is affected.',
);

const report = lines.join('\n') + '\n';
if (args.out) {
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, report);
} else process.stdout.write(report);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `affected=${affected}\n`);
