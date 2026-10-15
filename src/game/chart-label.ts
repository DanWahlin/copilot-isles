import { chapterLine, spokenLabel, type ChartLabelText } from '../learn/content/labels';
import paperUrl from './chart-label/paper.webp';
import sealUrl from './chart-label/seal.webp';

/**
 * The chart label (docs/specs/LOWER-THIRDS.md): a parchment card that says what you'll learn at an
 * island or a puzzle and why, with its course chapter on a wax seal. It unrolls left to right (a clip
 * and a rolled curl), the seal stamps down, and it fades out. Plain DOM and CSS (src/game/hud.css,
 * `.hud-chart`): the parchment and the seal are baked images (tools/ui/bake-chart-label.mjs), so no
 * SVG filter runs while it animates, and nothing here runs per frame.
 *
 * Over an arrival the session shows and hides it with the flight. When a puzzle opens it dismisses
 * itself on the player's first key, click, tap, wheel or gamepad press (passive listeners: the input
 * still reaches the game), or after `PUZZLE_HOLD_MS`.
 */
export type ChartLabelMode = 'arrival' | 'puzzle';

/** The unroll and the stamp (CSS: .hud-chart), then the fade out. */
const OUT_MS = 500;
/** A puzzle's label goes by itself after this long (time to read it twice). */
const PUZZLE_HOLD_MS = 9000;
/** Input this soon after it shows doesn't dismiss it (the press that opened the puzzle, key repeat). */
const GRACE_MS = 450;
/** How often the gamepad's checked while a puzzle's label is up (gamepads have no button events). */
const PAD_POLL_MS = 100;
/** What dismisses a puzzle's label: any key, click, tap or wheel (and a gamepad press, polled). */
const INPUTS = ['keydown', 'pointerdown', 'wheel'] as const;
/** Phones and short screens (hud.css moves the label to the top centre there). */
const NARROW = '(max-width: 760px), (max-height: 560px)';
/** What the label keeps below on a phone: the HUD along the top of the screen. */
const TOP_HUD =
  '.ci-tracker, .hud-compass.show, .hud-term.show, .ci-purse, .bh.show .bh-top, .bh.show .bh-skip';
/** The screen reader's copy is cleared after this, so the same label can be announced again later. */
const SPOKEN_MS = 8000;

const COMPASS_SVG =
  '<svg class="hud-chart-rose" viewBox="-75 -75 150 150" aria-hidden="true">' +
  '<g fill="none" stroke="#5a3416" stroke-width="2"><circle r="62"/><circle r="56" stroke-width="1"/>' +
  '<g stroke-width="1"><line x1="0" y1="-66" x2="0" y2="66"/><line x1="-66" y1="0" x2="66" y2="0"/>' +
  '<line x1="-46" y1="-46" x2="46" y2="46"/><line x1="-46" y1="46" x2="46" y2="-46"/></g></g>' +
  '<g fill="#5a3416"><path d="M0,-60 L9,-9 L0,0 Z"/><path d="M0,-60 L-9,-9 L0,0 Z" fill="#b78449"/>' +
  '<path d="M60,0 L9,9 L0,0 Z"/><path d="M60,0 L9,-9 L0,0 Z" fill="#b78449"/>' +
  '<path d="M0,60 L-9,9 L0,0 Z"/><path d="M0,60 L9,9 L0,0 Z" fill="#b78449"/>' +
  '<path d="M-60,0 L-9,-9 L0,0 Z"/><path d="M-60,0 L-9,9 L0,0 Z" fill="#b78449"/>' +
  '<circle r="5" fill="#7a2e12"/>' +
  '<text y="-68" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="16" fill="#7a2e12">N</text>' +
  '</g></svg>';

export class ChartLabel {
  /** The card (hidden from screen readers: `live` speaks it). */
  readonly el: HTMLDivElement;
  /** A polite live region, visually hidden: the label's text, once per show. */
  readonly live: HTMLDivElement;
  private readonly kicker: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly chapterHead: HTMLElement;
  private readonly chapterTail: HTMLSpanElement;
  private readonly sealWord: HTMLSpanElement;
  private readonly sealNumber: HTMLElement;
  private readonly seal: HTMLDivElement;
  private shownAs: ChartLabelMode | null = null;
  private outTimer = 0;
  private holdTimer = 0;
  private graceTimer = 0;
  private padTimer = 0;
  private spokenTimer = 0;
  private listening = false;
  /** Gamepad buttons held when listening began (4 pads × 20 buttons): only a new press dismisses. */
  private readonly padHeld = new Uint8Array(80);

  /** `onChange` hears when it shows (with how far its top is above the bottom of the view) and goes. */
  constructor(private readonly onChange: (shown: boolean, topFromBottom: number) => void) {
    this.el = div('hud-chart');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.setProperty('--lt-paper', `url("${paperUrl}")`);
    this.el.style.setProperty('--lt-seal', `url("${sealUrl}")`);
    const win = div('hud-chart-win');
    const paper = div('hud-chart-paper');
    const content = div('hud-chart-body');
    content.insertAdjacentHTML('afterbegin', COMPASS_SVG);
    const words = div('hud-chart-words');
    this.kicker = div('hud-chart-k');
    this.title = div('hud-chart-t');
    this.body = div('hud-chart-b');
    const chapter = div('hud-chart-c');
    this.chapterHead = document.createElement('b');
    this.chapterTail = document.createElement('span');
    chapter.append(this.chapterHead, this.chapterTail);
    words.append(this.kicker, this.title, this.body, chapter);
    content.append(words);
    win.append(paper, content);
    const rail = div('hud-chart-rail');
    rail.append(div('hud-chart-curl'));
    const seal = (this.seal = div('hud-chart-seal'));
    this.sealWord = document.createElement('span');
    this.sealWord.textContent = 'Chapter';
    this.sealNumber = document.createElement('strong');
    seal.append(this.sealWord, this.sealNumber);
    this.el.append(win, rail, seal);
    this.live = div('hud-chart-sr');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    // Registered now, ahead of the puzzles' own window listeners (they stop their keys from going
    // further), and passive: they only note the press, which still reaches the game.
    const opts = { capture: true, passive: true } as const;
    for (const type of INPUTS) addEventListener(type, this.dismiss, opts);
    // Decode the art now, so the first label doesn't unroll before its parchment's ready.
    for (const src of [paperUrl, sealUrl]) {
      const img = new Image();
      img.src = src;
      void img.decode().catch(() => {});
    }
  }

  /** What's up now: an arrival's label, a puzzle's, or nothing. */
  get mode(): ChartLabelMode | null {
    return this.shownAs;
  }

  show(text: ChartLabelText, mode: ChartLabelMode): void {
    this.stopListening();
    clearTimeout(this.outTimer);
    clearTimeout(this.holdTimer);
    this.kicker.textContent = text.k;
    this.title.textContent = text.t;
    this.body.textContent = text.b;
    const line = chapterLine(text);
    const cut = line.indexOf(' · ');
    this.chapterHead.textContent = cut < 0 ? line : line.slice(0, cut);
    this.chapterTail.textContent = cut < 0 ? '' : line.slice(cut);
    this.sealNumber.textContent = text.ch;
    const range = text.ch.length > 2;
    this.sealWord.hidden = range;
    this.el.classList.toggle('range', range);
    this.el.classList.toggle('is-arrival', mode === 'arrival');
    // Restart the unroll: off, one layout read (which also measures it), back on.
    this.el.classList.remove('show', 'out');
    this.el.style.setProperty('--lt-top', mode === 'puzzle' ? `${this.clearBelow()}px` : '0px');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    // Its top: the seal's, which stands above the paper.
    const top = Math.min(this.el.getBoundingClientRect().top, this.seal.getBoundingClientRect().top);
    this.shownAs = mode;
    this.onChange(true, Math.max(0, innerHeight - top));
    clearTimeout(this.spokenTimer);
    this.live.textContent = spokenLabel(text);
    this.spokenTimer = window.setTimeout(() => (this.live.textContent = ''), SPOKEN_MS);
    if (mode === 'puzzle') {
      this.graceTimer = window.setTimeout(() => this.listen(), GRACE_MS);
      this.holdTimer = window.setTimeout(() => this.hide(), PUZZLE_HOLD_MS);
    }
  }

  /**
   * On a phone the label sits at the top centre: below whatever HUD is up there now (the quest list,
   * the compass, the terminal panel, the purse, a battle's hull bar and Skip button), so it never
   * covers them. Read once when it shows; 0 on wide screens.
   */
  private clearBelow(): number {
    if (!matchMedia(NARROW).matches) return 0;
    let bottom = 0;
    for (const e of document.querySelectorAll<HTMLElement>(TOP_HUD)) {
      const r = e.getBoundingClientRect();
      if (!r.height || r.top > innerHeight * 0.4) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      // The seal stands 18 px above the paper.
      bottom = Math.max(bottom, r.bottom + 24);
    }
    return bottom;
  }

  /** Fades it out (only an arrival's, when `only` says so). */
  hide(only?: ChartLabelMode): void {
    if (!this.shownAs || (only && this.shownAs !== only)) return;
    this.shownAs = null;
    this.stopListening();
    clearTimeout(this.holdTimer);
    this.el.classList.add('out');
    this.onChange(false, 0);
    this.outTimer = window.setTimeout(() => this.el.classList.remove('show', 'out'), OUT_MS);
  }

  dispose(): void {
    this.stopListening();
    for (const type of INPUTS) removeEventListener(type, this.dismiss, { capture: true });
    for (const t of [this.outTimer, this.holdTimer, this.spokenTimer]) clearTimeout(t);
    this.el.remove();
    this.live.remove();
  }

  private readonly dismiss = (e: Event): void => {
    if (!this.listening || (e instanceof KeyboardEvent && e.repeat)) return;
    this.hide('puzzle');
  };

  private listen(): void {
    if (this.listening || this.shownAs !== 'puzzle') return;
    this.listening = true;
    this.padHeld.fill(0);
    this.readPads(false);
    this.padTimer = window.setInterval(() => this.readPads(true), PAD_POLL_MS);
  }

  private stopListening(): void {
    clearTimeout(this.graceTimer);
    if (!this.listening) return;
    this.listening = false;
    clearInterval(this.padTimer);
  }

  /** Notes the held buttons (and a pushed stick as button 19); with `act`, a new press dismisses. */
  private readPads(act: boolean): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    for (let p = 0; p < 4; p++) {
      const pad = pads[p];
      for (let b = 0; b < 20; b++) {
        let down = false;
        if (pad?.connected) {
          if (b < 19) down = !!pad.buttons[b]?.pressed;
          else for (const a of pad.axes) if (Math.abs(a) > 0.5) down = true;
        }
        const i = p * 20 + b;
        if (down && !this.padHeld[i] && act) {
          this.hide('puzzle');
          return;
        }
        this.padHeld[i] = down ? 1 : 0;
      }
    }
  }
}

function div(cls: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = cls;
  return e;
}
