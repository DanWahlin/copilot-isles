/* global process */
import { mkdir, readFile, writeFile, copyFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseKeyValueEnv, redactSecretValues } from '../../src/audio/voice/env';
import { rateFactor, wordsFromAlignment, type CharacterAlignment } from '../../src/audio/voice/alignment';
import { courseArg, coursePaths } from '../course-pack/read';
import { ELEVENLABS_MODEL, lineHash, readLines, type VoiceLineDefinition } from './lines';

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
/** The course pack whose lines to make (`--course <id>`, default copilot-app; docs/voices.md). */
const course = courseArg();
const { voice: outDir } = coursePaths(course);
const requiredEnv = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] as const;
/** Azure synthesizes Riff24Khz16BitMonoPcm, and ElevenLabs lines ask for pcm_24000. */
const SAMPLE_RATE = 24000;
/** Seconds of audio kept after an ElevenLabs line's last word. */
const ELEVENLABS_TAIL = 0.45;

interface ElevenLabsResponse {
  readonly audio_base64?: string;
  readonly alignment?: CharacterAlignment;
  readonly error?: { readonly message?: string };
}

/**
 * `--only Juno,Wingman` (speakers or line IDs) regenerates just those lines and keeps every other
 * manifest entry as it is, so lines whose WAVs aren't cached on this machine aren't re-synthesized.
 */
function parseOnly(args: readonly string[]): ReadonlySet<string> | null {
  const index = args.findIndex((arg) => arg === '--only' || arg.startsWith('--only='));
  if (index < 0) return null;
  const value = args[index]!.includes('=') ? args[index]!.split('=')[1] : args[index + 1];
  const names = (value ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.length) throw new Error('--only needs speakers or line IDs, e.g. --only Juno,Wingman');
  return new Set(names);
}

/**
 * `--check` (and `--check --list-stale`): makes nothing and calls no speech service. Every line, resolved against the cast, must
 * have its audio in the manifest with the same text and speaker, under the cache key it would make
 * now (with the voice the manifest says it used). Exits 1 otherwise: those lines need generating.
 */
async function check(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as {
    lines: { id: string; speaker: string; text: string; voice: string; hash: string }[];
  };
  const made = new Map(manifest.lines.map((l) => [l.id, l]));
  const stale: string[] = [];
  const staleAzure: string[] = [];
  for (const line of readLines(course).lines) {
    const m = made.get(line.id);
    if (!m || m.text !== line.text || m.speaker !== line.speaker || lineHash(line, m.voice) !== m.hash) {
      stale.push(line.id);
      if (line.tts !== 'elevenlabs') staleAzure.push(line.id);
    }
  }
  // `--list-stale`: just the Azure lines to make again, comma-separated (the weekly refresh's step 6).
  if (process.argv.includes('--list-stale')) {
    console.log(staleAzure.join(','));
    return;
  }
  if (stale.length) {
    console.error(`${stale.length} voice lines need generating: ${stale.join(', ')}`);
    process.exitCode = 1;
  } else
    console.log(`All ${made.size} voice lines in courses/${course}/public/voice match their lines and cast.`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--check')) return check();
  const only = parseOnly(process.argv.slice(2));
  const env = await loadEnv();
  const secrets = [...env.values.values()];
  const data = readLines(course);
  const selected = only
    ? data.lines.filter((line) => only.has(line.speaker) || only.has(line.id))
    : data.lines;
  if (only && !selected.length) throw new Error(`--only matched no lines: ${[...only].join(', ')}`);
  await mkdir(cacheDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const lines: GeneratedLine[] = [];
  const fallbackSpeakers = new Set<string>();

  for (const line of selected) {
    const result = await generateLine(line, env.values, secrets);
    lines.push(result);
    if (result.usedFallback) fallbackSpeakers.add(line.speaker);
    console.log(
      `${line.id}: ${result.voice}${result.usedFallback ? ' (fallback)' : ''}, ${result.duration.toFixed(2)}s`,
    );
  }

  const entries = lines.map((line) => ({
    id: line.id,
    speaker: line.speaker,
    text: line.text,
    duration: line.duration,
    files: line.files,
    hash: line.hash,
    words: line.words,
    voice: line.voice,
  }));
  const manifestPath = join(outDir, 'manifest.json');
  let manifestLines: readonly { readonly id: string }[] = entries;
  if (only) {
    const previous = JSON.parse(await readFile(manifestPath, 'utf8')) as { lines: { id: string }[] };
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    // Lines removed from the pack's voice/lines.json drop out of the manifest too.
    const live = new Set(data.lines.map((line) => line.id));
    const kept = previous.lines
      .filter((entry) => live.has(entry.id))
      .map((entry) => byId.get(entry.id) ?? entry);
    const added = entries.filter((entry) => !previous.lines.some((old) => old.id === entry.id));
    manifestLines = [...kept, ...added];
  }
  await writeJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    set: data.set,
    lines: manifestLines,
  });
  if (fallbackSpeakers.size)
    console.log(`Primary voice failed for ${[...fallbackSpeakers].join(', ')}; used their fallback voices.`);
  console.log(`Generated ${lines.length} voice lines in courses/${course}/public/voice.`);
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
  const elevenLabs = line.tts === 'elevenlabs';
  const requestedVoice = !elevenLabs && line.voiceEnv ? env.get(line.voiceEnv) : line.voice;
  if (!requestedVoice)
    throw new Error(`Missing voice environment variable name: ${line.voiceEnv ?? 'voice'}`);
  const attempts =
    line.fallbackVoice && requestedVoice !== line.fallbackVoice
      ? [requestedVoice, line.fallbackVoice]
      : [requestedVoice];
  let lastError = '';

  for (let index = 0; index < attempts.length; index++) {
    const voice = attempts[index];
    const hash = lineHash(line, voice);
    const wavPath = join(cacheDir, `${hash}.wav`);
    const cacheJsonPath = join(cacheDir, `${hash}.json`);
    try {
      let cacheData: CacheData;
      if (!(await exists(wavPath)) || !(await exists(cacheJsonPath))) {
        const synthesized = elevenLabs
          ? await synthesizeElevenLabs(line, voice, hash)
          : await synthesize(line, voice, env, secrets);
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
    elevenLabs
      ? `Synthesis failed for ${line.id}. Check the ElevenLabs CLI sign-in (elevenlabs auth status). ${lastError}`
      : `Synthesis failed for ${line.id}. Check env variable names AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. ${lastError}`,
  );
}

/**
 * ElevenLabs speech through the signed-in `elevenlabs` CLI, as 24 kHz PCM with character timings.
 * A `prosody.rate` is applied afterwards with ffmpeg's atempo (word times scaled to match), so the
 * cached WAV that Rhubarb reads already has the final timing.
 */
async function synthesizeElevenLabs(
  line: VoiceLineDefinition,
  voice: string,
  hash: string,
): Promise<{ readonly wav: Uint8Array; readonly words: readonly WordTiming[] }> {
  const unsupported = Object.keys(line.prosody ?? {}).filter((key) => key !== 'rate');
  if (unsupported.length || line.sub)
    throw new Error(
      `${line.id}: ElevenLabs lines support only prosody.rate (not ${[...unsupported, ...(line.sub ? ['sub'] : [])].join(', ')}).`,
    );
  const tempo = rateFactor(line.prosody?.rate);
  const { stdout } = await exec(
    'elevenlabs',
    [
      'text-to-speech',
      'convert_with_timestamps',
      '--voice-id',
      voice,
      '--model-id',
      line.model ?? ELEVENLABS_MODEL,
      '--output-format',
      `pcm_${SAMPLE_RATE}`,
      '--text',
      line.text,
      '--format',
      'json',
      '--via',
      'copilot-isles-voice',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const response = JSON.parse(stdout) as ElevenLabsResponse;
  if (!response.audio_base64 || !response.alignment)
    throw new Error(response.error?.message ?? `ElevenLabs returned no audio: ${stdout.slice(0, 300)}`);

  const pcmPath = join(cacheDir, `${hash}.pcm`);
  const wavPath = join(cacheDir, `${hash}.elevenlabs.wav`);
  const words = wordsFromAlignment(response.alignment, tempo);
  // eleven_v3 can leave seconds of silence after the last word; keep a short tail and fade it out.
  const end = (words.at(-1)?.end ?? 0) + ELEVENLABS_TAIL;
  const filters = [
    ...(tempo === 1 ? [] : [`atempo=${tempo.toFixed(4)}`]),
    ...(words.length
      ? [`atrim=end=${end.toFixed(3)}`, `afade=t=out:st=${(end - 0.08).toFixed(3)}:d=0.08`]
      : []),
  ];
  await writeFile(pcmPath, Buffer.from(response.audio_base64, 'base64'));
  try {
    await exec('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      's16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      '-i',
      pcmPath,
      ...(filters.length ? ['-af', filters.join(',')] : []),
      '-c:a',
      'pcm_s16le',
      wavPath,
    ]);
    return { wav: new Uint8Array(await readFile(wavPath)), words };
  } finally {
    await rm(pcmPath, { force: true });
    await rm(wavPath, { force: true });
  }
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
      word: line.sub ? unmarkWord(event.text, Object.keys(line.sub)) : event.text,
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
  if (fx === 'wingman-bird') {
    // Up 2.5 semitones with the formants (a smaller speaker), at the same tempo so the word
    // timings still hold, then a little brighter.
    const f = 2 ** (2.5 / 12);
    filters.unshift(
      `asetrate=${Math.round(SAMPLE_RATE * f)}`,
      `aresample=${SAMPLE_RATE}`,
      `atempo=${(1 / f).toFixed(4)}`,
      'highpass=f=170',
      'treble=g=3:f=5000',
    );
  }
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
  let text = escapeXml(line.text);
  for (const [word, alias] of Object.entries(line.sub ?? {})) {
    const re = new RegExp(`(?<![\\w-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g');
    text = text.replace(re, `<sub alias="${escapeXml(alias)}">${escapeXml(word)}</sub>`);
  }
  const body = attrs ? `<prosody ${attrs}>${text}</prosody>` : text;
  const lang = /^[a-z]{2}-[a-z]{2}/i.exec(voice)?.[0] ?? 'en-US';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${escapeXml(voice)}">${body}</voice></speak>`;
}

/**
 * Word boundaries after a `<sub>` can carry the SSML around it (`">gh auth`). Strips the markup and
 * the substituted word itself, which the alias's own words ("G", "H") already stand for.
 */
function unmarkWord(text: string, subs: readonly string[]): string {
  let word = text.replace(/^[^<>]*">/, '').replace(/<\/?sub[^>]*>?/g, '');
  for (const sub of subs) if (word.startsWith(`${sub} `)) word = word.slice(sub.length + 1);
  return word;
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
