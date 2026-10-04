import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
type Expression = 'neutral' | 'happy' | 'concerned' | 'surprised';

interface VoiceLineDefinition {
  readonly id: string;
  readonly text: string;
}

interface LinesFile {
  readonly lines: readonly VoiceLineDefinition[];
}

interface ManifestLine {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly hash: string;
  readonly files: { readonly webm?: string; readonly m4a?: string };
}

interface FaceLine {
  hash?: string;
  expression: Expression;
  mouthCues: RhubarbCue[];
}

/**
 * What ships per line: the audio hash, the expression, and the cues packed as Rhubarb's contiguous
 * shapes (`v`, one letter each) with centisecond deltas (`t`: the first start, then each cue's length).
 */
interface PackedLine {
  readonly h: string;
  readonly e: Expression;
  readonly t: readonly number[];
  readonly v: string;
}

interface VoiceManifest {
  readonly lines: readonly ManifestLine[];
}

interface RhubarbCue {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

interface RhubarbOutput {
  readonly mouthCues: readonly RhubarbCue[];
}

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const cacheDir = join(root, '.tools', 'voice-cache');
const outDir = join(root, 'public', 'voice', 'testcove');
const rhubarb = join(root, '.tools', 'rhubarb', 'rhubarb');
const shapeSet = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);

/** Authored expressions; every other line falls back to `guessExpression`. */
const EXPRESSIONS: Record<string, Expression> = {
  'nell.papers.01': 'happy',
  'nell.papers.02': 'concerned',
  'nell.papers.04': 'concerned',
  'nell.papers.tools': 'surprised',
  'nell.papers.app': 'happy',
  'nell.papers.03': 'neutral',
  'nell.papers.logbook': 'happy',
  'nell.papers.signin': 'concerned',
  'nell.papers.05': 'happy',
  'nell.settings.01': 'happy',
  'nell.papers.06': 'happy',
  'nell.palette.01': 'happy',
  'nell.palette.02': 'happy',
  'nell.christen.01': 'happy',
  'nell.christen.02': 'surprised',
  'nell.christen.03': 'happy',
  'nell.done.01': 'happy',
  'nell.done.02': 'happy',
  'nell.trial.01': 'concerned',
  'nell.trial.02': 'happy',
  'suri.idle.dry': 'concerned',
  'pol.idle.waiting': 'concerned',
  'pol.crane.01': 'concerned',
  'pim.brief.02': 'concerned',
  'pol.refuse.guild.01': 'concerned',
  'pol.refuse.captain.01': 'surprised',
  'ezra.wait.01': 'neutral',
  'ezra.fork.careful': 'concerned',
  'bo.deck.02': 'concerned',
  'bo.gear.brief.03': 'concerned',
  'juno.pipes.01': 'concerned',
  'juno.hatch.01': 'concerned',
  'juno.hatch.feedback.01': 'concerned',
  'juno.reply.01': 'surprised',
  'mer.tobias.05': 'concerned',
  'mer.oren.04': 'concerned',
  'mer.oren.06': 'concerned',
  'mer.rhea.03': 'neutral',
  'mer.admiral.01': 'neutral',
  'mer.admiral.02': 'neutral',
  'mer.admiral.pass': 'happy',
  'mer.helm.interactive.check': 'neutral',
};

/** Cheerful exclamations smile; warnings look concerned; everything else is the pleasant rest face. */
export function guessExpression(text: string): Expression {
  if (/\b(careful|mind|never|don[’']t|not yet|only when|refused|missing|wrong)\b/i.test(text))
    return 'concerned';
  if (/!/.test(text) || /\b(fair winds|good work|well sailed|proud|welcome)\b/i.test(text)) return 'happy';
  return 'neutral';
}

async function main(): Promise<void> {
  await access(rhubarb, constants.X_OK).catch(() => {
    throw new Error('Rhubarb is missing. Run npm run toolchain first.');
  });
  await mkdir(cacheDir, { recursive: true });
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as VoiceManifest;
  const linesFile = JSON.parse(
    await readFile(join(root, 'tools', 'voice', 'lines.testcove.json'), 'utf8'),
  ) as LinesFile;
  const textById = new Map(linesFile.lines.map((line) => [line.id, line.text]));
  // Wingman is a parrot with a beak, not a painted face.
  const wanted = manifest.lines.filter((line) => line.speaker !== 'Wingman');
  const outPath = join(outDir, 'lipsync.json');
  const previous = (await exists(outPath))
    ? unpackAll(
        (JSON.parse(await readFile(outPath, 'utf8')) as { lines?: Record<string, FaceLine | PackedLine> })
          .lines ?? {},
      )
    : {};
  const lines: Record<string, FaceLine> = {};

  for (const line of wanted) {
    const expression = EXPRESSIONS[line.id] ?? guessExpression(line.text);
    const kept = previous[line.id];
    // Cues made from the original WAVs are kept while the line's audio hasn't changed.
    if (kept && (kept.hash ?? line.hash) === line.hash) {
      lines[line.id] = { hash: line.hash, expression, mouthCues: kept.mouthCues };
      continue;
    }
    const wav = await wavFor(line);
    const rhubarbJson = await cuesFor(line.hash, wav, textById.get(line.id) ?? line.text);
    lines[line.id] = { hash: line.hash, expression, mouthCues: compactCues(rhubarbJson.mouthCues) };
    console.log(`${line.id}: ${lines[line.id]!.mouthCues.length} cues`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    generator: 'Rhubarb Lip Sync 1.14.0',
    scope: 'Every voiced islander (not Wingman)',
    lines: Object.fromEntries(Object.entries(lines).map(([id, line]) => [id, pack(line)])),
  };
  await writeFile(outPath, `${JSON.stringify(output)}\n`);
  // Match the repo's formatting so format:check stays clean.
  await exec(join(root, 'node_modules', '.bin', 'prettier'), ['--write', outPath], { cwd: root });
  const size = (await stat(outPath)).size;
  console.log(
    `Wrote public/voice/testcove/lipsync.json (${(size / 1024).toFixed(1)} KB, ${wanted.length} lines).`,
  );
}

/** The cached synthesis WAV, or a 16 kHz mono decode of the shipped audio when the cache is cold. */
async function wavFor(line: ManifestLine): Promise<string> {
  const cached = join(cacheDir, `${line.hash}.wav`);
  if (await exists(cached)) return cached;
  const decoded = join(cacheDir, `${line.hash}.decoded.wav`);
  if (await exists(decoded)) return decoded;
  const file = line.files.webm ?? line.files.m4a;
  if (!file) throw new Error(`${line.id}: no cached WAV and no shipped audio.`);
  await exec('ffmpeg', ['-v', 'error', '-y', '-i', join(outDir, file), '-ac', '1', '-ar', '16000', decoded]);
  return decoded;
}

async function cuesFor(hash: string, wav: string, text: string): Promise<RhubarbOutput> {
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
  const dialog = join(cacheDir, `${hash}.${digest}.dialog.txt`);
  const json = join(cacheDir, `${hash}.rhubarb.json`);
  if (await exists(json)) return JSON.parse(await readFile(json, 'utf8')) as RhubarbOutput;
  await writeFile(dialog, text);
  await exec(rhubarb, ['-f', 'json', '-o', json, '--dialogFile', dialog, wav], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 8,
  });
  return JSON.parse(await readFile(json, 'utf8')) as RhubarbOutput;
}

function pack(line: FaceLine): PackedLine {
  const cs = (s: number) => Math.round(s * 100);
  const t: number[] = [];
  let at = 0;
  for (const cue of line.mouthCues) {
    if (!t.length) t.push((at = cs(cue.start)));
    t.push(cs(cue.end) - at);
    at = cs(cue.end);
  }
  return { h: line.hash ?? '', e: line.expression, t, v: line.mouthCues.map((c) => c.value).join('') };
}

function unpackAll(lines: Record<string, FaceLine | PackedLine>): Record<string, FaceLine> {
  const out: Record<string, FaceLine> = {};
  for (const [id, line] of Object.entries(lines)) {
    if ('mouthCues' in line) {
      out[id] = line;
      continue;
    }
    const mouthCues: RhubarbCue[] = [];
    let at = (line.t[0] ?? 0) / 100;
    for (let i = 0; i < line.v.length; i++) {
      const end = at + (line.t[i + 1] ?? 0) / 100;
      mouthCues.push({ start: round(at), end: round(end), value: line.v[i]! });
      at = end;
    }
    out[id] = { hash: line.h, expression: line.e, mouthCues };
  }
  return out;
}

function compactCues(cues: readonly RhubarbCue[]): RhubarbCue[] {
  return cues
    .filter((cue) => shapeSet.has(cue.value) && cue.end > cue.start)
    .map((cue) => ({
      start: round(cue.start),
      end: round(cue.end),
      value: cue.value as MouthShape,
    }));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function exists(path: string): Promise<boolean> {
  return access(path, constants.R_OK).then(
    () => true,
    () => false,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
