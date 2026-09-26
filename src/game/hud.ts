/**
 * In-game HUD (Phase 0): the interaction prompt, synced subtitles, the sailing gauge, short
 * toasts, and a terminal panel for puzzles that run commands. Plain DOM, updated only on change, so it costs nothing per frame. The React UI owns
 * menus; this stays lightweight so it can run under the canvas without re-rendering.
 */
export interface SubtitleLine {
  id: string;
  speaker: string;
  text: string;
  duration: number;
  words: { word: string; start: number; end: number }[];
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
  private readonly term: HTMLDivElement;
  private readonly termTitle: HTMLSpanElement;
  private readonly termBody: HTMLDivElement;
  private lastTerm = '';
  private lastPrompt = '';
  private toastTimer = 0;
  private subtitleTimer = 0;
  private lines = new Map<string, SubtitleLine>();

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
    this.term = el('div', 'hud-term');
    const bar = el('div', 'hud-term-bar');
    bar.append(el('i', ''), el('i', ''), el('i', ''));
    this.termTitle = text('span', 'hud-term-title', 'Terminal');
    bar.append(this.termTitle);
    this.termBody = el('div', 'hud-term-body');
    this.term.append(bar, this.termBody);
    this.root.append(this.prompt, this.subtitle, this.sail, this.toastEl, this.term, this.help, this.fadeEl);
    parent.append(this.root);
  }

  async loadSubtitles(manifestUrl: string): Promise<void> {
    try {
      const res = await fetch(manifestUrl);
      const m = (await res.json()) as { lines: SubtitleLine[] };
      for (const l of m.lines) this.lines.set(l.id, l);
    } catch {
      // Subtitles are optional in dev.
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
    // Word timings drop punctuation; show the manifest text's tokens when they line up one-to-one.
    const tokens = line.text.split(/\s+/).filter(Boolean);
    const shown = tokens.length === line.words.length ? tokens : line.words.map((w) => w.word);
    shown.forEach((w, i) => {
      body.append(text('span', i <= wordIndex ? 'spoken' : '', w), ' ');
    });
    if (!line.words.length) body.textContent = line.text;
    this.subtitle.append(body);
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
    body.querySelectorAll('span').forEach((s, i) => s.classList.toggle('spoken', i <= wordIndex));
  }

  /** Shows an unvoiced line (NPC barks, hints) for `seconds`. */
  showText(speaker: string, line: string, seconds = 4): void {
    clearTimeout(this.subtitleTimer);
    this.subtitle.replaceChildren(
      text('span', 'hud-speaker', speaker),
      text('span', 'hud-line spoken-all', line),
    );
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
    clearTimeout(this.toastTimer);
    clearTimeout(this.subtitleTimer);
    this.root.remove();
  }
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
