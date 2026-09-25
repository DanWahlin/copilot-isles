/* global process */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseKeyValueEnv, redactSecretValues } from '../../src/audio/voice/env';

interface VoiceLineDefinition {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly voice?: string;
  readonly voiceEnv?: string;
  readonly fallbackVoice?: string;
  readonly prosody?: Readonly<Record<string, string>>;
  readonly fx?: 'wingman-bright';
}

interface LinesFile {
  readonly set: string;
  readonly lines: readonly VoiceLineDefinition[];
}

interface WordTiming {
  readonly word: string;
  readonly start: number;
  readonly end: number;
}

interface CacheData {
  readonly voice: string;
  readonly words: readonly WordTiming[];
  readonly usedFallback: boolean;
}

interface GeneratedLine {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly duration: number;
  readonly files: Readonly<Record<'webm' | 'm4a', string>>;
  readonly hash: string;
  readonly words: readonly WordTiming[];
  readonly voice: string;
  readonly usedFallback: boolean;
}

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../..', import.meta.url));
const cacheDir = join(root, '.tools', 'voice-cache');
const outDir = join(root, 'public', 'voice', 'testcove');
const linesPath = join(root, 'tools', 'voice', 'lines.testcove.json');
const requiredEnv = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] as const;

async function main(): Promise<void> {
  const env = await loadEnv();
  const secrets = [...env.values.values()];
  const data = JSON.parse(await readFile(linesPath, 'utf8')) as LinesFile;
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const lines: GeneratedLine[] = [];
  const fallbackSpeakers = new Set<string>();

  for (const line of data.lines) {
    const result = await generateLine(line, env.values, secrets);
    lines.push(result);
    if (result.usedFallback) fallbackSpeakers.add(line.speaker);
    console.log(
      `${line.id}: ${result.voice}${result.usedFallback ? ' (fallback)' : ''}, ${result.duration.toFixed(2)}s`,
    );
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    set: data.set,
    lines: lines.map((line) => ({
      id: line.id,
      speaker: line.speaker,
      text: line.text,
      duration: line.duration,
      files: line.files,
      hash: line.hash,
      words: line.words,
      voice: line.voice,
    })),
  };
  await writeJson(join(outDir, 'manifest.json'), manifest);
  if (fallbackSpeakers.size)
    console.log(`Primary voice failed for ${[...fallbackSpeakers].join(', ')}; used their fallback voices.`);
  console.log(`Generated ${lines.length} voice lines in public/voice/testcove.`);
}

async function loadEnv(): Promise<ReturnType<typeof parseKeyValueEnv>> {
  const home = process.env.HOME;
  if (!home) throw new Error('Missing HOME; cannot read environment variable file name ~/.env');
  const text = await readFile(join(home, '.env'), 'utf8');
  return parseKeyValueEnv(text, requiredEnv);
}

async function generateLine(
  line: VoiceLineDefinition,
  env: ReadonlyMap<string, string>,
  secrets: readonly string[],
): Promise<GeneratedLine> {
  const requestedVoice = line.voiceEnv ? env.get(line.voiceEnv) : line.voice;
  if (!requestedVoice)
    throw new Error(`Missing voice environment variable name: ${line.voiceEnv ?? 'voice'}`);
  const attempts =
    line.fallbackVoice && requestedVoice !== line.fallbackVoice
      ? [requestedVoice, line.fallbackVoice]
      : [requestedVoice];
  let lastError = '';

  for (let index = 0; index < attempts.length; index++) {
    const voice = attempts[index];
    const hash = hashLine(line, voice);
    const wavPath = join(cacheDir, `${hash}.wav`);
    const cacheJsonPath = join(cacheDir, `${hash}.json`);
    try {
      let cacheData: CacheData;
      if (!(await exists(wavPath)) || !(await exists(cacheJsonPath))) {
        const synthesized = await synthesize(line, voice, env, secrets);
        await writeFile(wavPath, synthesized.wav);
        cacheData = { voice, words: synthesized.words, usedFallback: index > 0 };
        await writeJson(cacheJsonPath, cacheData);
      } else {
        cacheData = JSON.parse(await readFile(cacheJsonPath, 'utf8')) as CacheData;
      }
      const output = await encodeOutputs(line, hash, wavPath);
      const words = closeWordEnds(cacheData.words, output.duration);
      await writeJson(join(outDir, `${line.id}.json`), {
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        words,
      });
      return {
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        duration: output.duration,
        files: { webm: `${line.id}.webm`, m4a: `${line.id}.m4a` },
        hash,
        words,
        voice: cacheData.voice,
        usedFallback: cacheData.usedFallback || index > 0,
      };
    } catch (error) {
      lastError = redactSecretValues(error, secrets);
      if (index + 1 < attempts.length)
        console.log(`${line.id}: primary voice failed; trying fallback voice.`);
    }
  }

  throw new Error(
    `Synthesis failed for ${line.id}. Check env variable names AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. ${lastError}`,
  );
}

async function synthesize(
  line: VoiceLineDefinition,
  voice: string,
  env: ReadonlyMap<string, string>,
  secrets: readonly string[],
): Promise<{ readonly wav: Uint8Array; readonly words: readonly WordTiming[] }> {
  const SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk');
  const key = env.get('AZURE_SPEECH_KEY') ?? '';
  const region = env.get('AZURE_SPEECH_REGION') ?? '';
  const endpoint = env.get('AZURE_SPEECH_ENDPOINT');
  const speechConfig = endpoint
    ? SpeechSDK.SpeechConfig.fromEndpoint(new URL(endpoint), key)
    : SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);
  const words: WordTiming[] = [];
  synthesizer.wordBoundary = (_sender, event) => {
    words.push({
      word: event.text,
      start: Number(event.audioOffset) / 10_000_000,
      end: Number(event.audioOffset) / 10_000_000,
    });
  };

  return new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml(line, voice),
      (result) => {
        synthesizer.close();
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          resolve({ wav: new Uint8Array(result.audioData), words });
        } else {
          reject(new Error(redactSecretValues(result.errorDetails || 'speech synthesis canceled', secrets)));
        }
      },
      (error) => {
        synthesizer.close();
        reject(new Error(redactSecretValues(error, secrets)));
      },
    );
  });
}

async function encodeOutputs(
  line: VoiceLineDefinition,
  hash: string,
  wavPath: string,
): Promise<{ readonly duration: number }> {
  const webm = join(outDir, `${line.id}.webm`);
  const m4a = join(outDir, `${line.id}.m4a`);
  const cacheWebm = join(cacheDir, `${hash}.webm`);
  const cacheM4a = join(cacheDir, `${hash}.m4a`);
  if (!(await exists(cacheWebm))) {
    await ffmpeg(wavPath, cacheWebm, ['-c:a', 'libopus', '-b:a', '32k', '-application', 'audio'], line.fx);
  }
  if (!(await exists(cacheM4a))) {
    await ffmpeg(wavPath, cacheM4a, ['-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart'], line.fx);
  }
  await copyFile(cacheWebm, webm);
  await copyFile(cacheM4a, m4a);
  return { duration: await durationOf(webm) };
}

async function ffmpeg(
  input: string,
  output: string,
  codec: readonly string[],
  fx?: VoiceLineDefinition['fx'],
): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  const filters = ['loudnorm=I=-18:TP=-1.5:LRA=11'];
  if (fx === 'wingman-bright') filters.push('highpass=f=420', 'treble=g=4:f=6000');
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-af',
    filters.join(','),
    '-ac',
    '1',
    '-ar',
    '24000',
    ...codec,
    output,
  ]);
}

async function durationOf(path: string): Promise<number> {
  const { stdout } = await exec('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  return Number.parseFloat(stdout.trim());
}

function ssml(line: VoiceLineDefinition, voice: string): string {
  const prosody = line.prosody ?? {};
  const attrs = Object.entries(prosody)
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(' ');
  const body = attrs ? `<prosody ${attrs}>${escapeXml(line.text)}</prosody>` : escapeXml(line.text);
  const lang = /^[a-z]{2}-[a-z]{2}/i.exec(voice)?.[0] ?? 'en-US';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${escapeXml(voice)}">${body}</voice></speak>`;
}

function hashLine(line: VoiceLineDefinition, voice: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ text: line.text, voice, prosody: line.prosody ?? {}, fx: line.fx ?? '' }))
    .digest('hex')
    .slice(0, 16);
}

function closeWordEnds(words: readonly WordTiming[], duration: number): readonly WordTiming[] {
  const spokenWords = words.filter((word) => /[\p{L}\p{N}]/u.test(word.word));
  return spokenWords.map((word, index) => ({
    word: word.word,
    start: word.start,
    end: Math.min(duration, spokenWords[index + 1]?.start ?? word.start + 0.25),
  }));
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(redactSecretValues(error, []));
  process.exitCode = 1;
});
