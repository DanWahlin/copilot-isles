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
  readonly text: string;
  readonly hash: string;
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

const NELL_EXPRESSIONS: Record<string, Expression> = {
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
};

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
  const wanted = manifest.lines.filter((line) => line.id.startsWith('nell.'));
  const lines: Record<string, { expression: Expression; mouthCues: RhubarbCue[] }> = {};

  for (const line of wanted) {
    const wav = join(cacheDir, `${line.hash}.wav`);
    await access(wav, constants.R_OK);
    const rhubarbJson = await cuesFor(line.hash, wav, textById.get(line.id) ?? line.text);
    lines[line.id] = {
      expression: NELL_EXPRESSIONS[line.id] ?? 'neutral',
      mouthCues: compactCues(rhubarbJson.mouthCues),
    };
    console.log(`${line.id}: ${lines[line.id].mouthCues.length} cues`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    generator: 'Rhubarb Lip Sync 1.14.0',
    scope: 'Nell Tidewell voice lines',
    lines,
  };
  await writeFile(join(outDir, 'lipsync.json'), `${JSON.stringify(output)}\n`);
  const size = (await stat(join(outDir, 'lipsync.json'))).size;
  console.log(`Wrote public/voice/testcove/lipsync.json (${(size / 1024).toFixed(1)} KB).`);
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
