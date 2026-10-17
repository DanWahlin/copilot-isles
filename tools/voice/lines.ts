/**
 * A course pack's voice lines as the generator reads them (docs/voices.md, COURSE-PACKS.md §5): each
 * line in `voice/lines.json` on top of its speaker's entry in `voice/cast.json` (the service, voice,
 * fallback, prosody and effect), so a course can recast a character in one place. A line's own fields
 * override its speaker's.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coursePaths } from '../course-pack/read';

export interface VoiceLineDefinition {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  /**
   * The speech service (default Azure). ElevenLabs lines take a voice ID in `voice` and call the
   * `elevenlabs` CLI, which uses its own sign-in (`elevenlabs auth login`), so no key is read here.
   */
  readonly tts?: 'azure' | 'elevenlabs';
  /** ElevenLabs model ID (default `eleven_v3`). */
  readonly model?: string;
  readonly voice?: string;
  readonly voiceEnv?: string;
  readonly fallbackVoice?: string;
  readonly prosody?: Readonly<Record<string, string>>;
  readonly fx?: 'wingman-bright' | 'wingman-bird';
  /** Whole words to say differently, e.g. `{ "gh": "G H" }` (an SSML `<sub>`; subtitles keep the word). */
  readonly sub?: Readonly<Record<string, string>>;
}

/** A speaker's voice: any of a line's voice fields. */
export type CastEntry = Pick<
  VoiceLineDefinition,
  'tts' | 'model' | 'voice' | 'voiceEnv' | 'fallbackVoice' | 'prosody' | 'fx'
>;

export interface LinesFile {
  readonly set: string;
  readonly lines: readonly VoiceLineDefinition[];
}

/** ElevenLabs' default model (the hash names it, so a default change makes new audio). */
export const ELEVENLABS_MODEL = 'eleven_v3';

/** A line on top of its speaker's cast entry. */
export function resolveLine(
  line: VoiceLineDefinition,
  cast: Readonly<Record<string, CastEntry>>,
): VoiceLineDefinition {
  return { ...cast[line.speaker], ...line };
}

/** The pack's lines file with every line resolved against the cast. */
export function readLines(course: string): LinesFile {
  const paths = coursePaths(course);
  const data = JSON.parse(readFileSync(paths.lines, 'utf8')) as LinesFile;
  const castFile = join(paths.dir, 'voice', 'cast.json');
  const cast = existsSync(castFile)
    ? (JSON.parse(readFileSync(castFile, 'utf8')) as { speakers: Record<string, CastEntry> }).speakers
    : {};
  return { set: data.set, lines: data.lines.map((l) => resolveLine(l, cast)) };
}

export const resolvedLines = (course: string): readonly VoiceLineDefinition[] => readLines(course).lines;

/** The generator's cache key for a line in a voice: the same key is the same audio. */
export function lineHash(line: VoiceLineDefinition, voice: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        text: line.text,
        voice,
        prosody: line.prosody ?? {},
        fx: line.fx ?? '',
        ...(line.sub ? { sub: line.sub } : {}),
        // Only ElevenLabs lines add these, so Azure lines keep their cached hashes.
        ...(line.tts === 'elevenlabs' ? { tts: line.tts, model: line.model ?? ELEVENLABS_MODEL } : {}),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}
