import type { FaceExpression, MouthCue } from '../world/characters/facial-animation';
import { COURSE } from '../course/catalog';

/**
 * Juno's short welcome in the captain's cabin (Dan: tell the player what they'll be doing overall):
 * each island teaches a chapter of the course through quests, quests fill the Logbook and the purse,
 * then you sail on, and starfish hide on every island. It plays while the island builds behind the
 * cabin, so it mostly costs no wait; the chest waits for it, E skips a line and Esc skips it all.
 * The lines are the course's (`course.json` → `hooks.briefing`).
 */
export const BRIEFING: readonly string[] = COURSE.hooks.briefing.lines;
/** Said once the chest is ready to open. */
export const CHEST_LINE: string = COURSE.hooks.briefing.chest;
/** The cabin's lines, in the order they're fetched. */
export const BRIEFING_LINES: readonly string[] = [...BRIEFING, CHEST_LINE];

export interface BriefingLine {
  id: string;
  speaker: string;
  text: string;
  /** Seconds the line holds (its last word's end plus a breath). */
  duration: number;
  words: { word: string; start: number; end: number }[];
  mouthCues?: MouthCue[];
  expression?: FaceExpression;
}

/** A breath after each line's last word before the next one starts. */
export const LINE_GAP = 0.3;
/** Seconds after the cabin fades up before Juno starts. */
export const BRIEFING_DELAY = 1.0;
/** If the lines haven't loaded by this long after the fade, the cabin goes on without them. */
export const BRIEFING_GIVE_UP = 5;
/**
 * The longest a line waits for its voice (a slow connection) before its caption shows on its own.
 * The voice is then left out, rather than starting late against the caption and Juno's mouth.
 */
export const VOICE_WAIT = 4;

export interface BriefingHooks {
  /** A line starts (or `null`: the talk paused or ended). */
  onLine(line: BriefingLine | null): void;
  /** The spoken word moved on (index into the line's words). */
  onWord(index: number): void;
  /** Whether a line's voice can start now (default: always); a line waits up to VOICE_WAIT for it. */
  ready?(id: string): boolean;
}

/**
 * The talk's clock: plays the queued lines in order on the frame's time, so the caption, the face
 * and the chest wait all agree (the voice plays alongside when audio's unlocked).
 */
export class Briefing {
  private queue: string[] = [];
  private line: BriefingLine | null = null;
  /** The line's been announced (it may wait first for its voice). */
  private shown = false;
  private time = 0;
  private word = -1;
  private started = false;
  private stopped = false;
  private chestSaid = false;

  constructor(
    private readonly lines: ReadonlyMap<string, BriefingLine>,
    private readonly hooks: BriefingHooks,
  ) {}

  /** The welcome is under way (or over). */
  get begun(): boolean {
    return this.started;
  }

  /** The welcome's over (or was skipped); the chest line may still be playing. */
  get done(): boolean {
    return this.stopped || (this.started && !this.queue.some((id) => id !== CHEST_LINE) && !this.welcoming);
  }

  /** A line is playing now. */
  get speaking(): boolean {
    return !!this.line;
  }

  private get welcoming(): boolean {
    return !!this.line && this.line.id !== CHEST_LINE;
  }

  /** Starts the welcome (once). */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.queue = BRIEFING.filter((id) => this.lines.has(id));
    this.advance();
  }

  /** "Open the chest" once the chest is ready, if the welcome ran to its end. */
  chest(): void {
    if (this.chestSaid || this.stopped || !this.done || !this.lines.has(CHEST_LINE)) return;
    this.chestSaid = true;
    this.queue.push(CHEST_LINE);
    if (!this.line) this.advance();
  }

  /** E or a click: on to the next line. */
  next(): void {
    if (this.line) this.advance();
  }

  /** Esc, Skip, or the opening ending: silence. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queue.length = 0;
    if (this.line) {
      this.line = null;
      this.hooks.onLine(null);
    }
  }

  update(dt: number): void {
    const line = this.line;
    if (!line) return;
    this.time += dt;
    if (!this.shown) {
      if (!this.hooks.ready?.(line.id) && this.time < VOICE_WAIT) return;
      return this.show();
    }
    let w = this.word;
    while (w + 1 < line.words.length && line.words[w + 1]!.start <= this.time) w += 1;
    if (w !== this.word) {
      this.word = w;
      this.hooks.onWord(w);
    }
    if (this.time >= line.duration + LINE_GAP) this.advance();
  }

  private advance(): void {
    const id = this.queue.shift();
    this.line = id ? (this.lines.get(id) ?? null) : null;
    this.time = 0;
    this.word = -1;
    this.shown = false;
    if (!this.line || (this.hooks.ready?.(this.line.id) ?? true)) this.show();
  }

  private show(): void {
    this.shown = true;
    this.time = 0;
    this.hooks.onLine(this.line);
  }
}

/**
 * Loads the cabin's lines: each one's words (its own small JSON beside the audio) and its mouth cues
 * (the shared lipsync file the island loads later anyway). Lines that fail to load are left out.
 */
export async function loadBriefing(voiceBase: string): Promise<Map<string, BriefingLine>> {
  const base = voiceBase.endsWith('/') ? voiceBase : `${voiceBase}/`;
  const out = new Map<string, BriefingLine>();
  const [lines, lips, facial] = await Promise.all([
    Promise.all(
      BRIEFING_LINES.map((id) =>
        fetch(`${base}${id}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<Omit<BriefingLine, 'duration'>>) : null))
          .catch(() => null),
      ),
    ),
    fetch(`${base}lipsync.json`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ lines?: Record<string, { t: number[]; v: string; e?: FaceExpression }> }>)
          : null,
      )
      .catch(() => null),
    import('../world/characters/facial-animation').catch(() => null),
  ]);
  for (const l of lines) {
    if (!l?.words?.length) continue;
    const face = lips?.lines?.[l.id];
    out.set(l.id, {
      ...l,
      duration: l.words[l.words.length - 1]!.end + 0.25,
      mouthCues: face && facial ? facial.unpackMouthCues(face.t, face.v) : undefined,
      expression: face?.e,
    });
  }
  return out;
}
