import type { ChartLabelText } from '../learn/content/labels';
import { ChartLabel } from './chart-label';
import { formatDistance, relativeBearing, type CompassTarget } from './compass';
import { alignSubtitle } from './subtitle-align';
import { unpackMouthCues, type FaceExpression, type MouthCue } from '../world/characters/facial-animation';

/**
 * In-game HUD (Phase 0): the interaction prompt, synced subtitles, the sailing gauge, the compass,
 * short toasts, and a terminal panel for puzzles that run commands. Plain DOM, updated only on change, so it costs nothing per frame. The React UI owns
 * menus; this stays lightweight so it can run under the canvas without re-rendering.
 */
export interface SubtitleLine {
  id: string;
  speaker: string;
  text: string;
  duration: number;
  words: { word: string; start: number; end: number }[];
  mouthCues?: MouthCue[];
  expression?: FaceExpression;
}

/** A terminal panel line; `tone` picks the ink (command, your fork, someone else's, success). */
export interface TerminalLine {
  text: string;
  tone?: 'cmd' | 'you' | 'other' | 'ok';
}

/** The wind as the helmsman reads it: angle off the bow (radians, + to starboard) and point of sail. */
export interface WindReading {
  angle: number;
  point: 'in-irons' | 'close-hauled' | 'beam-reach' | 'broad-reach' | 'running';
}

const POINT_LABEL: Record<WindReading['point'], string> = {
  'in-irons': 'In irons',
  'close-hauled': 'Close-hauled',
  'beam-reach': 'Beam reach',
  'broad-reach': 'Broad reach',
  running: 'Running',
};

/** A top-down telltale: the hull points up, the arrow shows where the wind comes from, and the
 * shaded wedge is the no-go zone (±40°, matching the sail model). */
const WIND_DIAL_SVG =
  '<svg viewBox="-20 -20 40 40" aria-hidden="true">' +
  '<circle r="16.5" class="ring"/>' +
  '<path d="M0 0L-10.6 -12.6A16.5 16.5 0 0 1 10.6 -12.6Z" class="nogo"/>' +
  '<path d="M0 -8.5C2.9 -4.6 3.1 3.6 2.3 8.2L-2.3 8.2C-3.1 3.6-2.9 -4.6 0 -8.5Z" class="hull"/>' +
  '<g class="arrow"><path d="M0 -19.5V-10.5M-3 -13.6L0 -10L3 -13.6"/></g>' +
  '</svg>';

/** The compass window's width in px (CSS matches) and how much of the horizon it shows. */
const COMPASS_W = 320;
const COMPASS_SPAN_DEG = 180;
const COMPASS_PX = COMPASS_W / COMPASS_SPAN_DEG;
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export class Hud {
  readonly root: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly promptLabel: HTMLSpanElement;
  private readonly promptKey: HTMLSpanElement;
  private readonly subtitle: HTMLDivElement;
  private readonly sail: HTMLDivElement;
  private readonly sailTrim: HTMLDivElement;
  private readonly sailRudder: HTMLDivElement;
  private readonly sailSpeed: HTMLSpanElement;
  private readonly windArrow: SVGGElement;
  private readonly windLabel: HTMLSpanElement;
  private lastWindDeg = NaN;
  private windShown = NaN;
  private lastPoint = '';
  private readonly toastEl: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly fadeEl: HTMLDivElement;
  private readonly dawnEl: HTMLDivElement;
  private readonly dawnCaption: HTMLDivElement;
  private dawnShown = -1;
  private readonly term: HTMLDivElement;
  private readonly termTitle: HTMLSpanElement;
  private readonly termBody: HTMLDivElement;
  private lastTerm = '';
  private lastPrompt = '';
  private toastTimer = 0;
  private subtitleTimer = 0;
  /** Moves a conversation on to its next line (the caption's button, for a text-only course). */
  onNext: (() => void) | null = null;
  private lines = new Map<string, SubtitleLine>();
  private readonly compass: HTMLDivElement;
  private readonly compassStrip: HTMLDivElement;
  private readonly compassMarker: HTMLDivElement;
  private readonly compassName: HTMLSpanElement;
  private readonly compassDist: HTMLSpanElement;
  private readonly compassLevel: HTMLSpanElement;
  /** The dimmer marker and line for an optional quest you've started. */
  private readonly compassMarker2: HTMLDivElement;
  private readonly compassSecond: HTMLDivElement;
  private compassShown = false;
  private lastStripX = NaN;
  private lastMarker = '';
  private lastMarker2 = '';
  private lastCompassLabel = '';
  private lastSecondLabel = '';
  private readonly cine: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly cardEyebrow: HTMLSpanElement;
  private readonly cardTitle: HTMLHeadingElement;
  private readonly cardLine: HTMLParagraphElement;
  /** The parchment chart label (docs/specs/LOWER-THIRDS.md): an island's arrival or a puzzle's start. */
  readonly label: ChartLabel;
  /** Called when the cinematic's Skip button is pressed. */
  onSkip: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    this.prompt = el('div', 'hud-prompt');
    this.promptKey = el('span', 'hud-key');
    this.promptLabel = el('span', 'hud-label');
    this.prompt.append(this.promptKey, this.promptLabel);
    this.subtitle = el('div', 'hud-subtitle');
    this.sail = el('div', 'hud-sail');
    const trimWrap = el('div', 'hud-gauge');
    trimWrap.append(text('span', 'hud-gauge-label', 'Sails'));
    const trimBar = el('div', 'hud-bar');
    this.sailTrim = el('div', 'hud-bar-fill');
    trimBar.append(this.sailTrim);
    trimWrap.append(trimBar);
    const rudWrap = el('div', 'hud-gauge');
    rudWrap.append(text('span', 'hud-gauge-label', 'Helm'));
    const rudBar = el('div', 'hud-bar hud-bar-centre');
    this.sailRudder = el('div', 'hud-bar-needle');
    rudBar.append(this.sailRudder);
    rudWrap.append(rudBar);
    this.sailSpeed = text('span', 'hud-speed', '0.0 kn');
    const windRow = el('div', 'hud-wind-row');
    const dial = el('div', 'hud-wind');
    dial.innerHTML = WIND_DIAL_SVG;
    this.windArrow = dial.querySelector('.arrow') as SVGGElement;
    this.windLabel = text('span', 'hud-wind-label', '');
    const readout = el('div', 'hud-readout');
    readout.append(this.sailSpeed, this.windLabel);
    windRow.append(dial, readout);
    this.sail.append(trimWrap, rudWrap, windRow);
    this.toastEl = el('div', 'hud-toast');
    this.help = el('div', 'hud-help');
    this.fadeEl = el('div', 'hud-fade');
    this.dawnEl = el('div', 'hud-dawn');
    this.dawnCaption = text('div', 'hud-dawn-caption', '');
    this.term = el('div', 'hud-term');
    const bar = el('div', 'hud-term-bar');
    bar.append(el('i', ''), el('i', ''), el('i', ''));
    this.termTitle = text('span', 'hud-term-title', 'Terminal');
    bar.append(this.termTitle);
    this.termBody = el('div', 'hud-term-body');
    this.term.append(bar, this.termBody);
    this.compass = el('div', 'hud-compass');
    const window_ = el('div', 'hud-compass-window');
    this.compassStrip = el('div', 'hud-compass-strip');
    // Two turns of ticks (-180° to 540°) so any heading's ±90° window is always covered.
    for (let deg = -180; deg <= 540; deg += 15) {
      const at = `${((deg + 180) * COMPASS_PX).toFixed(1)}px`;
      const wrapped = ((deg % 360) + 360) % 360;
      if (wrapped % 45 === 0) {
        const c = text(
          'span',
          `hud-compass-card${wrapped % 90 === 0 ? ' major' : ''}`,
          CARDINALS[wrapped / 45]!,
        );
        c.style.left = at;
        this.compassStrip.append(c);
      } else {
        const tick = el('i', 'hud-compass-tick');
        tick.style.left = at;
        this.compassStrip.append(tick);
      }
    }
    this.compassMarker = el('div', 'hud-compass-marker');
    this.compassMarker2 = el('div', 'hud-compass-marker optional');
    window_.append(
      this.compassStrip,
      el('div', 'hud-compass-lubber'),
      this.compassMarker2,
      this.compassMarker,
    );
    const label = el('div', 'hud-compass-label');
    this.compassName = text('span', 'name', '');
    this.compassDist = text('span', 'dist', '');
    this.compassLevel = text('span', 'level', '');
    label.append(this.compassName, this.compassDist, this.compassLevel);
    this.compassSecond = el('div', 'hud-compass-second');
    this.compass.append(window_, label, this.compassSecond);
    this.cine = el('div', 'hud-cine');
    this.card = el('div', 'hud-card');
    this.cardEyebrow = text('span', 'hud-card-eyebrow', '');
    this.cardTitle = text('h2', 'hud-card-title', '');
    this.cardLine = text('p', 'hud-card-line', '');
    this.card.append(this.cardEyebrow, this.cardTitle, el('i', 'hud-card-rule'), this.cardLine);
    const skip = el('button', 'hud-skip');
    skip.type = 'button';
    skip.append(text('span', 'hud-key', 'E'), text('span', '', 'Skip'));
    skip.addEventListener('click', () => this.onSkip?.());
    this.cine.append(el('div', 'hud-bar-top'), el('div', 'hud-bar-bottom'), this.card, skip);
    // While it's up, the subtitles lift clear of it (hud.css): by its top less theirs (7vh) and a gap.
    this.label = new ChartLabel((shown, top) => {
      this.root.classList.toggle('has-label', shown);
      if (shown) this.root.style.setProperty('--lt-lift', `${Math.max(0, top - innerHeight * 0.07 + 12)}px`);
    });
    this.root.append(
      this.prompt,
      this.subtitle,
      this.sail,
      this.compass,
      this.toastEl,
      this.term,
      this.help,
      this.cine,
      this.label.el,
      this.label.live,
      this.dawnEl,
      this.dawnCaption,
      this.fadeEl,
    );
    parent.append(this.root);
  }

  async loadSubtitles(manifestUrl: string): Promise<void> {
    try {
      const res = await fetch(manifestUrl);
      const m = (await res.json()) as { lines: SubtitleLine[] };
      for (const l of m.lines) this.lines.set(l.id, l);
      await this.loadLipSync(manifestUrl);
    } catch {
      // Subtitles are optional in dev.
    }
  }

  private async loadLipSync(manifestUrl: string): Promise<void> {
    try {
      const res = await fetch(new URL('lipsync.json', new URL(manifestUrl, location.href)).toString());
      if (!res.ok) return;
      const m = (await res.json()) as {
        lines?: Record<string, { t: number[]; v: string; e?: FaceExpression }>;
      };
      for (const [id, face] of Object.entries(m.lines ?? {})) {
        const line = this.lines.get(id);
        if (line) {
          line.mouthCues = unpackMouthCues(face.t, face.v);
          line.expression = face.e;
        }
      }
    } catch {
      // Lip sync is optional while voice assets are being regenerated.
    }
  }

  setPrompt(label: string | null, key = 'E'): void {
    const v = label ? `${key}|${label}` : '';
    if (v === this.lastPrompt) return;
    this.lastPrompt = v;
    this.prompt.classList.toggle('show', !!label);
    if (label) {
      this.promptKey.textContent = key;
      this.promptLabel.textContent = label;
    }
  }

  /** Hides the prompt, subtitles, gauges, toasts, and help while a menu covers the game. */
  setMenuOpen(on: boolean): void {
    this.root.classList.toggle('menu-open', on);
  }

  /** Lights the compass while Wingman points it out. */
  setCompassSpot(on: boolean): void {
    this.compass.classList.toggle('spot', on);
  }

  /** Fades the controls help while a conversation or framed shot has the screen. */
  setCalm(on: boolean): void {
    this.root.classList.toggle('calm', on);
  }

  /** Letterboxes the view and hides the rest of the HUD for a flyover. */
  setCinematic(on: boolean): void {
    this.root.classList.toggle('cinematic', on);
    if (!on) this.showCard(null);
  }

  /**
   * Shows (or with null, hides) the island title card over a flyover. An island with a chart label
   * shows the label in its place (the parchment, with what the island teaches and its chapter).
   */
  showCard(
    card: { eyebrow: string; title: string; line: string } | null,
    label?: ChartLabelText | null,
  ): void {
    if (card && label) {
      if (this.label.mode !== 'arrival') this.label.show(label, 'arrival');
      this.card.classList.remove('show');
      return;
    }
    this.label.hide('arrival');
    if (card) {
      this.cardEyebrow.textContent = card.eyebrow;
      this.cardTitle.textContent = card.title;
      this.cardLine.textContent = card.line;
    }
    this.card.classList.toggle('show', !!card);
  }

  setHelp(html: string): void {
    this.help.innerHTML = html;
  }

  /** Shows a line's subtitle; `wordIndex` highlights the spoken word (from the voice player's timings). */
  showLine(id: string, wordIndex = -1): void {
    const line = this.lines.get(id);
    if (!line) return;
    clearTimeout(this.subtitleTimer);
    this.subtitle.replaceChildren(text('span', 'hud-speaker', line.speaker));
    const body = el('span', 'hud-line');
    // Word timings drop punctuation and symbols, so the text's own tokens are lined up against them;
    // each token lights with its word. If they can't be matched, the bare words are shown.
    const aligned = alignSubtitle(
      line.text,
      line.words.map((w) => w.word),
    );
    const shown = aligned?.tokens ?? line.words.map((w) => w.word);
    shown.forEach((w, i) => {
      const at = aligned?.at[i] ?? i;
      const span = text('span', at <= wordIndex ? 'spoken' : '', w);
      span.dataset.at = String(at);
      body.append(span, ' ');
    });
    if (!line.words.length) body.textContent = line.text;
    this.subtitle.append(body);
    // A text-only course's line (no voice, no word timings): it holds for its reading time, and E,
    // the pad's A, or this button (a tap) moves it on.
    this.subtitle.classList.toggle('is-text', !line.words.length);
    if (!line.words.length && this.onNext) {
      const next = el('button', 'hud-next') as HTMLButtonElement;
      next.type = 'button';
      next.setAttribute('aria-label', 'Next line');
      next.textContent = '▸';
      next.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onNext?.();
      });
      this.subtitle.append(next);
    }
    this.subtitle.classList.add('show');
    this.subtitleTimer = window.setTimeout(
      () => this.subtitle.classList.remove('show'),
      (line.duration + 1.4) * 1000,
    );
  }

  /** Re-renders the words from the manifest text (keeps punctuation) with the spoken prefix lit. */
  showSpoken(id: string, wordIndex: number): void {
    const line = this.lines.get(id);
    if (!line) return;
    const body = this.subtitle.querySelector('.hud-line');
    if (!body) return this.showLine(id, wordIndex);
    body
      .querySelectorAll<HTMLElement>('span')
      .forEach((s) => s.classList.toggle('spoken', Number(s.dataset.at) <= wordIndex));
  }

  /** Shows an unvoiced line (NPC barks, hints) for `seconds`. */
  showText(speaker: string, line: string, seconds = 4): void {
    clearTimeout(this.subtitleTimer);
    this.subtitle.replaceChildren(
      text('span', 'hud-speaker', speaker),
      text('span', 'hud-line spoken-all', line),
    );
    this.subtitle.classList.remove('is-text');
    this.subtitle.classList.add('show');
    this.subtitleTimer = window.setTimeout(() => this.subtitle.classList.remove('show'), seconds * 1000);
  }

  hideSubtitle(): void {
    clearTimeout(this.subtitleTimer);
    this.subtitle.classList.remove('show');
  }

  line(id: string): SubtitleLine | undefined {
    return this.lines.get(id);
  }

  setSailing(on: boolean): void {
    this.sail.classList.toggle('show', on);
    // The chart label moves up clear of the gauge (hud.css).
    this.root.classList.toggle('sailing', on);
  }

  updateSail(trim: number, rudder: number, speed: number, wind?: WindReading): void {
    this.sailTrim.style.transform = `scaleX(${trim.toFixed(3)})`;
    this.sailRudder.style.left = `${(50 + rudder * 46).toFixed(1)}%`;
    this.sailSpeed.textContent = `${(speed * 1.944).toFixed(1)} kn`;
    if (!wind) return;
    const deg = Math.round((wind.angle * 180) / Math.PI / 2) * 2;
    if (deg !== this.lastWindDeg) {
      // Unwrapped so the eased arrow takes the short way round when the wind crosses the stern.
      const prev = Number.isNaN(this.windShown) ? deg : this.windShown;
      this.windShown = prev + ((((deg - prev) % 360) + 540) % 360) - 180;
      this.lastWindDeg = deg;
      this.windArrow.style.transform = `rotate(${this.windShown}deg)`;
    }
    if (wind.point !== this.lastPoint) {
      this.lastPoint = wind.point;
      this.windLabel.textContent = POINT_LABEL[wind.point];
      this.sail.classList.toggle('irons', wind.point === 'in-irons');
    }
  }

  /**
   * The compass strip, top centre: `heading` is where the camera looks (a bearing, radians clockwise
   * from north) and `target` the gold marker for what to do next. Null hides it (dialogue, overlays).
   * Only touches the DOM when something visible changes.
   */
  setCompass(
    heading: number | null,
    target: CompassTarget | null = null,
    optional: CompassTarget | null = null,
  ): void {
    const show = heading !== null;
    if (show !== this.compassShown) {
      this.compassShown = show;
      this.compass.classList.toggle('show', show);
    }
    if (heading === null) return;
    const deg = (heading * 180) / Math.PI;
    const x = Math.round((COMPASS_W / 2 - (deg + 180) * COMPASS_PX) * 2) / 2;
    if (x !== this.lastStripX) {
      this.lastStripX = x;
      this.compassStrip.style.transform = `translateX(${x}px)`;
    }
    const marker = markerAt(target, heading);
    if (marker !== this.lastMarker) {
      this.lastMarker = marker;
      placeMarker(this.compassMarker, marker);
    }
    const marker2 = markerAt(optional, heading);
    if (marker2 !== this.lastMarker2) {
      this.lastMarker2 = marker2;
      placeMarker(this.compassMarker2, marker2);
    }
    const label = target ? `${target.label}|${formatDistance(target.distance)}|${target.level ?? ''}` : '';
    if (label !== this.lastCompassLabel) {
      this.lastCompassLabel = label;
      this.compass.classList.toggle('has-target', !!target);
      this.compassName.textContent = target?.label ?? '';
      this.compassDist.textContent = target ? formatDistance(target.distance) : '';
      this.compassLevel.textContent = target?.level ? LEVEL_CUE[target.level] : '';
      this.compassLevel.title = target?.level ? LEVEL_TITLE[target.level] : '';
    }
    const second = optional
      ? `Optional: ${optional.label} · ${formatDistance(optional.distance)}${optional.level ? ` ${LEVEL_CUE[optional.level]}` : ''}`
      : '';
    if (second !== this.lastSecondLabel) {
      this.lastSecondLabel = second;
      this.compassSecond.textContent = second;
      this.compass.classList.toggle('has-second', !!optional);
    }
  }

  /** Shows (or with null, hides) the terminal panel. Only touches the DOM when the lines change. */
  setTerminal(lines: readonly TerminalLine[] | null, title = 'Terminal'): void {
    const key = lines ? `${title}\n${lines.map((l) => `${l.tone ?? ''}|${l.text}`).join('\n')}` : '';
    if (key === this.lastTerm) return;
    this.lastTerm = key;
    this.term.classList.toggle('show', !!lines);
    if (!lines) return;
    this.termTitle.textContent = title;
    this.termBody.replaceChildren(
      ...lines.map((l) => text('div', l.tone ? `t-${l.tone}` : '', l.text || '\u00a0')),
    );
  }

  /**
   * A dim dawn-coloured veil over the world (0-1, set each frame) with a small caption at its height:
   * the night passing at sea between two islands' light (not a black cut).
   */
  setDawn(amount: number, caption: string): void {
    const a = Math.round(amount * 100) / 100;
    if (a === this.dawnShown) return;
    this.dawnShown = a;
    this.dawnEl.style.opacity = String(a);
    this.dawnEl.classList.toggle('show', a > 0);
    this.dawnCaption.classList.toggle('show', a > 0);
    if (this.dawnCaption.textContent !== caption) this.dawnCaption.textContent = caption;
    this.dawnCaption.style.opacity = String(Math.max(0, Math.min(1, (a - 0.3) / 0.3)));
  }

  /** Fades the screen to (or from) black; resolves when the fade finishes. */
  fade(on: boolean, ms = 380): Promise<void> {
    this.fadeEl.style.transitionDuration = `${ms}ms`;
    this.fadeEl.classList.toggle('show', on);
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  toast(message: string, seconds = 3): void {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  dispose(): void {
    this.label.dispose();
    clearTimeout(this.toastTimer);
    clearTimeout(this.subtitleTimer);
    this.root.remove();
  }
}

/** The up/down cue beside a marker's distance, and what it means (its tooltip). */
const LEVEL_CUE = { up: '▲', down: '▼' } as const;
const LEVEL_TITLE = { up: 'Up a level from here', down: 'Down a level from here' } as const;

/** A marker's place on the strip ("left px|edge"), or 'none'. */
function markerAt(target: CompassTarget | null, heading: number): string {
  if (!target) return 'none';
  const rel = (relativeBearing(target.bearing, heading) * 180) / Math.PI;
  const half = COMPASS_SPAN_DEG / 2 - 4;
  const edge = rel < -half ? 'left' : rel > half ? 'right' : '';
  const left = Math.round(COMPASS_W / 2 + Math.max(-half, Math.min(half, rel)) * COMPASS_PX);
  return `${left}|${edge}`;
}

function placeMarker(m: HTMLDivElement, at: string): void {
  m.classList.toggle('show', at !== 'none');
  if (at === 'none') return;
  const [left, edge] = at.split('|');
  m.style.left = `${left}px`;
  m.classList.toggle('edge-left', edge === 'left');
  m.classList.toggle('edge-right', edge === 'right');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  t: string,
): HTMLElementTagNameMap[K] {
  const e = el(tag, cls);
  e.textContent = t;
  return e;
}
