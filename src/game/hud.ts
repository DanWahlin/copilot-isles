/**
 * In-game HUD (Phase 0): the interaction prompt, synced subtitles, the sailing gauge, and short
 * toasts. Plain DOM, updated only on change, so it costs nothing per frame. The React UI owns
 * menus; this stays lightweight so it can run under the canvas without re-rendering.
 */
export interface SubtitleLine {
  id: string;
  speaker: string;
  text: string;
  duration: number;
  words: { word: string; start: number; end: number }[];
}

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
  private readonly toastEl: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly fadeEl: HTMLDivElement;
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
    this.sail.append(trimWrap, rudWrap, this.sailSpeed);
    this.toastEl = el('div', 'hud-toast');
    this.help = el('div', 'hud-help');
    this.fadeEl = el('div', 'hud-fade');
    this.root.append(this.prompt, this.subtitle, this.sail, this.toastEl, this.help, this.fadeEl);
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

  updateSail(trim: number, rudder: number, speed: number): void {
    this.sailTrim.style.transform = `scaleX(${trim.toFixed(3)})`;
    this.sailRudder.style.left = `${(50 + rudder * 46).toFixed(1)}%`;
    this.sailSpeed.textContent = `${(speed * 1.944).toFixed(1)} kn`;
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
