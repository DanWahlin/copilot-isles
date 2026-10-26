import type { BattleSnapshot } from '../world/battle/battle';
import { courseUrl } from '../learn/content';
import type { ChoiceQuiz, SourceRef } from '../learn/types';
import './battle-hud.css';

export interface BattleHudActions {
  fire(which: 'bearing' | 'port' | 'starboard'): void;
  skip(): void;
  answer(pick: 'double-shot' | 'repairs' | null): void;
  calm(on: boolean): void;
  /** "Bring her round": hand the helm to your helmsman, or take it back. */
  assist(on: boolean): void;
  /** Skips a mid-battle event (the kraken's beat) while it plays. */
  skipEvent?(): void;
}

/** What the HUD asks the battle for readiness (no arrays built per update). */
export interface ReadinessSource {
  gunCount(): number;
  readiness(side: number, gun: number): number;
}

function md(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/** The briefing rows: a small diagram, a title, and one line. Your ship points up in every diagram. */
const SHIP =
  '<path d="M30 14 L35 26 L35 44 L30 48 L25 44 L25 26 Z" fill="#2a1d14" stroke="#e8c88a" stroke-width="1.2"/>';
const BRIEFING: readonly (readonly [string, string, string])[] = [
  [
    `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M35 31 L58 14 A30 30 0 0 1 58 48 Z" fill="rgba(255,224,150,0.22)" stroke="#f2d08a" stroke-width="1.6"/><path d="M25 31 L2 14 A30 30 0 0 0 2 48 Z" fill="rgba(255,224,150,0.08)" stroke="rgba(242,208,138,0.55)" stroke-width="1.2"/>${SHIP}</svg>`,
    'Gold arcs: where your guns reach',
    'Your guns fire out of the sides. Turn so a raider sits inside a gold arc; it glows when they bear. Then fire!',
  ],
  [
    `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M44 30 L8 14 A40 40 0 0 0 8 46 Z" fill="rgba(255,90,40,0.16)" stroke="#ff6a36" stroke-width="1.3"/><path d="M30 24 l-6 6 l6 6 M21 24 l-6 6 l6 6" stroke="#ff9a6a" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M46 20 L51 26 L51 36 L46 40 L41 36 L41 26 Z" fill="#3b4a56" stroke="#9aa0a6" stroke-width="1.1"/><g transform="translate(-22 2) scale(0.9)">${SHIP}</g></svg>`,
    'Red chevrons: a raider is about to fire',
    'They point at you and fill up while her crew lays the guns. Turn away, or fire first.',
  ],
  [
    '<svg viewBox="0 0 60 60" aria-hidden="true"><g fill="#e7dcc2" stroke="#8c6a32"><rect x="6" y="18" width="9" height="26" rx="3"/><rect x="18" y="18" width="9" height="26" rx="3"/><rect x="30" y="18" width="9" height="26" rx="3"/><rect x="42" y="18" width="9" height="26" rx="3"/></g><g fill="#f2a83a"><rect x="6" y="18" width="9" height="26" rx="3"/><rect x="18" y="18" width="9" height="26" rx="3"/><rect x="30" y="30" width="9" height="14" rx="3"/></g></svg>',
    'Cartridges: your guns reloading',
    'Each bag fills with powder as a gun reloads. Space fires every side that bears; Z and C fire one side.',
  ],
  [
    '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="17" fill="none" stroke="#e8c88a" stroke-width="2.4"/><circle cx="30" cy="30" r="4" fill="#e8c88a"/><g stroke="#e8c88a" stroke-width="2.4" stroke-linecap="round"><path d="M30 13 V4 M30 47 V56 M13 30 H4 M47 30 H56 M18 18 L12 12 M42 42 L48 48 M42 18 L48 12 M18 42 L12 48"/></g></svg>',
    'Bring her round (R)',
    'Too much to do at once? Your helmsman steers to the best broadside, and you just fire. Any helm key takes the helm back.',
  ],
];

/** "Chapter 00 · Add the course practice items": where a question's answer is in the course. */
export function sourceLabel(s: SourceRef): string {
  const words = s.anchor.replace(/-/g, ' ');
  return `Chapter ${s.chapter.slice(0, 2)} · ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Buttons you press with the mouse or a finger don't keep focus (Space would press them again). */
function noFocus(b: HTMLButtonElement): HTMLButtonElement {
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * The battle HUD (docs/specs/BATTLES.md §5, #204): two rows of powder cartridges that fill with amber as
 * each gun reloads, a "Bears" pennant and a glowing rail when a side bears, the Fire buttons (touch
 * targets ≥ 44 px), the hull and the wave, captions, and the between-wave question. Shown only in
 * battle. Plain DOM, updated at ~10 Hz by `update`, nothing per frame.
 */
export class BattleHud {
  readonly root: HTMLDivElement;
  private readonly rows: { side: HTMLButtonElement; fills: HTMLDivElement[]; carts: HTMLDivElement[] }[] = [];
  private readonly hullPlanks: HTMLDivElement[] = [];
  private readonly waveText: HTMLDivElement;
  private readonly captionBox: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly fireBtn: HTMLButtonElement;
  private readonly bonus: HTMLDivElement;
  private readonly helmBar: HTMLDivElement;
  private readonly hintText: HTMLSpanElement;
  private readonly assistBtn: HTMLButtonElement;
  private lastHint = '';
  private wonText = 'The raiders are back in the fog.';
  private briefing: HTMLDivElement | null = null;
  private lastAssist = false;
  private readonly fillCache: number[][] = [[], []];
  private captionTimer = 0;
  private lastPhase = '';
  private quiz: ChoiceQuiz | null = null;
  private gunCount = 0;
  private readonly rowsReady: HTMLDivElement[];
  /** When a button in the HUD was last clicked (Enter clicks the focused one and is also "interact"). */
  private clickedAt = -1e9;
  /** True while the question card waits for a choice. */
  private asking = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: BattleHudActions,
  ) {
    this.root = el('div', 'bh', parent);
    this.root.setAttribute('aria-label', 'Battle');
    this.root.addEventListener('click', () => (this.clickedAt = performance.now()), true);

    const top = el('div', 'bh-top', this.root);
    const hull = el('div', 'bh-hull', top);
    el('span', 'bh-label', hull).textContent = 'Hull';
    const planks = el('div', 'bh-planks', hull);
    for (let i = 0; i < 10; i++) this.hullPlanks.push(el('div', 'bh-plank', planks));
    this.waveText = el('div', 'bh-wave', top);
    this.bonus = el('div', 'bh-bonus', top);

    const skip = noFocus(el('button', 'bh-skip', this.root));
    skip.type = 'button';
    skip.textContent = 'Skip battle';
    skip.onclick = () => this.actions.skip();

    // Skip a mid-battle event (shown only while one plays): E or the gamepad's A, too.
    const skipEvent = noFocus(el('button', 'bh-skip-event', this.root));
    skipEvent.type = 'button';
    skipEvent.innerHTML = '<span>Skip</span><kbd>E</kbd>';
    skipEvent.setAttribute('aria-label', 'Skip this scene');
    skipEvent.onclick = () => this.actions.skipEvent?.();

    this.captionBox = el('div', 'bh-captions', this.root);
    this.captionBox.setAttribute('role', 'status');
    this.captionBox.setAttribute('aria-live', 'polite');

    // The helm bar: what to do with the helm next, and "Bring her round" (R) to let your helmsman steer.
    this.helmBar = el('div', 'bh-helm', this.root);
    this.hintText = el('span', 'bh-hint', this.helmBar);
    this.hintText.setAttribute('aria-live', 'polite');
    this.assistBtn = noFocus(el('button', 'bh-assist', this.helmBar));
    this.assistBtn.type = 'button';
    this.assistBtn.setAttribute('aria-pressed', 'false');
    this.assistBtn.innerHTML = '<span>Bring her round</span><kbd>R</kbd>';
    this.assistBtn.onclick = () => this.actions.assist(!this.lastAssist);

    const guns = el('div', 'bh-guns', this.root);
    const makeRow = (sideIdx: number) => {
      const side = noFocus(el('button', `bh-side ${sideIdx === 0 ? 'port' : 'starboard'}`, guns));
      side.type = 'button';
      side.setAttribute('aria-label', sideIdx === 0 ? 'Fire port battery' : 'Fire starboard battery');
      const head = el('div', 'bh-side-head', side);
      el('span', 'bh-side-name', head).textContent = sideIdx === 0 ? 'Port' : 'Starboard';
      el('kbd', 'bh-key', head).textContent = sideIdx === 0 ? 'Z' : 'C';
      el('span', 'bh-pennant', side).textContent = 'Bears';
      const row = el('div', 'bh-row', side);
      el('div', 'bh-rail', side);
      side.onclick = () => this.actions.fire(sideIdx === 0 ? 'port' : 'starboard');
      this.rows.push({ side, fills: [], carts: [] });
      return row;
    };
    const portRow = makeRow(0);
    this.fireBtn = noFocus(el('button', 'bh-fire', guns));
    this.fireBtn.type = 'button';
    this.fireBtn.innerHTML = '<span>Fire</span><kbd>Space</kbd>';
    this.fireBtn.setAttribute('aria-label', 'Fire every battery that bears');
    this.fireBtn.onclick = () => this.actions.fire('bearing');
    const starRow = makeRow(1);
    this.rowsReady = [portRow, starRow];

    el('div', 'bh-veil', this.root);
    this.card = el('div', 'bh-card', this.root);
    this.card.setAttribute('role', 'dialog');
  }

  private buildCartridges(count: number): void {
    this.gunCount = count;
    for (let s = 0; s < 2; s++) {
      const row = this.rowsReady[s]!;
      row.textContent = '';
      this.rows[s]!.fills.length = 0;
      this.rows[s]!.carts.length = 0;
      this.fillCache[s]!.length = 0;
      for (let g = 0; g < count; g++) {
        const cart = el('div', 'bh-cart', row);
        el('div', 'bh-cap', cart);
        const bag = el('div', 'bh-bag', cart);
        const fill = el('div', 'bh-fill', bag);
        this.rows[s]!.fills.push(fill);
        this.rows[s]!.carts.push(cart);
        this.fillCache[s]!.push(-1);
      }
    }
  }

  show(on: boolean): void {
    this.root.classList.toggle('show', on || this.briefing !== null);
  }

  /** True while the pre-battle briefing is open. */
  get briefingOpen(): boolean {
    return this.briefing !== null;
  }

  /** True while the briefing or the bosun's question waits for you (the helm keys move between its buttons). */
  get choosing(): boolean {
    return this.briefing !== null || this.asking;
  }

  /** The buttons you can choose between now (the briefing's, or the card's). */
  private choices(): HTMLButtonElement[] {
    const box = this.briefing ?? this.card;
    return [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  }

  /** Gamepad and keyboard parity: moves the focus to the next (`dir` 1) or previous (−1) choice. */
  nav(dir: number): void {
    const list = this.choices();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? 0 : (at + dir + list.length) % list.length;
    list[next]!.focus({ preventScroll: true });
  }

  /** E or the gamepad's A: presses the focused choice (or focuses the first one). */
  press(): void {
    // Enter has already clicked the focused button by itself.
    if (performance.now() - this.clickedAt < 300) return;
    const list = this.choices();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at >= 0) list[at]!.click();
    else list[0]?.focus({ preventScroll: true });
  }

  /**
   * The pre-battle briefing (battle-plan.md §6): what the marks on the water mean, the cartridges, and
   * "Bring her round", in one short card. "Set sail" (Enter, Space, Esc) or "Skip" both close it;
   * `done(hide)` says whether you ticked "Don't show this again".
   */
  showBriefing(done: (hideNextTime: boolean) => void): void {
    if (this.briefing) return;
    const box = el('div', 'bh-brief', this.root);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'bh-brief-title');
    const h = el('h2', '', box);
    h.id = 'bh-brief-title';
    h.textContent = 'Before the fog lifts';
    const list = el('div', 'bh-brief-list', box);
    for (const [art, title, body] of BRIEFING) {
      const row = el('div', 'bh-brief-row', list);
      el('div', 'bh-brief-art', row).innerHTML = art;
      const text = el('div', 'bh-brief-text', row);
      el('strong', '', text).textContent = title;
      el('span', '', text).textContent = body;
    }
    const foot = el('div', 'bh-brief-foot', box);
    const label = el('label', 'bh-brief-hide', foot);
    const check = el('input', '', label);
    check.type = 'checkbox';
    label.append(' Don’t show this again');
    const skip = el('button', 'bh-brief-skip', foot);
    skip.type = 'button';
    skip.textContent = 'Skip';
    const go = el('button', 'bh-brief-go', foot);
    go.type = 'button';
    go.innerHTML = 'Set sail <kbd>Enter</kbd>';
    this.briefing = box;
    this.root.classList.add('briefing', 'show');
    const close = () => {
      if (this.briefing !== box) return;
      removeEventListener('keydown', onKey, true);
      box.remove();
      this.briefing = null;
      this.root.classList.remove('briefing');
      done(check.checked);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'Escape' && e.code !== 'NumpadEnter') return;
      // Leave Space to the checkbox when it has focus.
      if (e.code === 'Space' && document.activeElement === check) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    addEventListener('keydown', onKey, true);
    go.onclick = close;
    skip.onclick = close;
    go.focus();
  }

  /** The win card's line for this battle (BattlePlan.won). */
  setWonText(text: string): void {
    this.wonText = text;
  }

  setQuiz(quiz: ChoiceQuiz | null): void {
    this.quiz = quiz;
  }

  caption(text: string): void {
    // A repeat of the last line counts up ("Hit! ×3") rather than stacking.
    const last = this.captionBox.lastElementChild as HTMLDivElement | null;
    if (last && last.dataset.text === text) {
      const n = Number(last.dataset.n ?? '1') + 1;
      last.dataset.n = String(n);
      last.textContent = `${text} ×${n}`;
    } else {
      const line = el('div', 'bh-caption', this.captionBox);
      line.dataset.text = text;
      line.textContent = text;
    }
    while (this.captionBox.childElementCount > 3) this.captionBox.firstElementChild!.remove();
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => (this.captionBox.textContent = ''), 4200);
  }

  /** Reads the battle at ~10 Hz. Cartridge order runs from the Fire button outward, bow guns first. */
  update(s: BattleSnapshot, guns: ReadinessSource): void {
    if (s.hint !== this.lastHint) {
      this.lastHint = s.hint;
      this.hintText.textContent = s.hint;
      this.helmBar.classList.toggle('fire', s.hint.endsWith('fire!'));
    }
    this.helmBar.classList.toggle('show', s.phase === 'fight');
    if (s.assist !== this.lastAssist) {
      this.lastAssist = s.assist;
      this.assistBtn.classList.toggle('on', s.assist);
      this.assistBtn.setAttribute('aria-pressed', String(s.assist));
      this.assistBtn.firstElementChild!.textContent = s.assist ? 'Helmsman steering' : 'Bring her round';
    }
    const count = guns.gunCount();
    if (count !== this.gunCount) this.buildCartridges(count);
    for (let side = 0; side < 2; side++) {
      const row = this.rows[side]!;
      for (let k = 0; k < count; k++) {
        // Port's row reads right to left from the Fire button, starboard's left to right.
        const gun = count - 1 - k;
        const slot = side === 0 ? count - 1 - k : k;
        const r = Math.round(guns.readiness(side, gun) * 20) / 20;
        if (this.fillCache[side]![slot] === r) continue;
        this.fillCache[side]![slot] = r;
        row.fills[slot]!.style.transform = `scaleY(${r})`;
        row.carts[slot]!.classList.toggle('full', r >= 1);
      }
      row.side.classList.toggle('bears', s.bears[side]!);
    }
    this.fireBtn.classList.toggle('ready', s.bears[0] || s.bears[1]);
    const lit = Math.ceil(s.hull * 10);
    for (let i = 0; i < 10; i++) this.hullPlanks[i]!.classList.toggle('lost', i >= lit);
    this.root.classList.toggle('low-hull', s.hull < 0.35);
    this.waveText.textContent =
      s.phase === 'won'
        ? 'The passage is clear'
        : s.phase === 'event'
          ? `Wave ${s.wave} of ${s.waves} beaten`
          : s.phase === 'lull' || s.phase === 'question'
            ? `Wave ${s.wave + 1} of ${s.waves} beaten`
            : `Wave ${s.wave + 1} of ${s.waves} · ${s.raidersLeft} ${s.raidersLeft === 1 ? 'raider' : 'raiders'} left`;
    const bits: string[] = [];
    if (s.doubleShot) bits.push('Double-shotted');
    if (s.stores.powder) bits.push('Dry powder');
    if (s.stores.timber) bits.push(`Timber ×${s.stores.timber}`);
    if (s.calm) bits.push('Calm seas');
    // After the win there's nothing left to fire, so the bonuses go.
    this.bonus.textContent = s.phase === 'won' ? '' : bits.join(' · ');
    if (s.phase !== this.lastPhase) this.enterPhase(s);
    if (s.phase === 'lull') this.card.querySelector('.bh-lull-time')!.textContent = `${Math.ceil(s.lull)} s`;
  }

  private enterPhase(s: BattleSnapshot): void {
    this.lastPhase = s.phase;
    this.root.dataset.phase = s.phase;
    this.asking = false;
    if (this.card.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.card.textContent = '';
    this.card.className = 'bh-card';
    if (s.phase === 'intro') {
      // A title band, not a card: it fades by itself while the raiders come out of the fog.
      this.card.classList.add('show', 'slim', 'banner');
      const [wave, names] = s.title.split(': ');
      el('h2', '', this.card).textContent = wave ?? '';
      el('p', '', this.card).textContent = names ?? '';
    } else if (s.phase === 'lull') {
      this.card.classList.add('show', 'slim');
      this.card.innerHTML =
        '<h2>Wave beaten</h2><p>Sail through the floating stores before they sink: timber for repairs, dry powder for faster reloads. <span class="bh-lull-time"></span></p>';
    } else if (s.phase === 'question') this.showQuestion();
    else if (s.phase === 'breakoff') {
      this.card.classList.add('show');
      this.card.innerHTML =
        '<h2>Break off!</h2><p>Your crew pulls back to patch the hull. You’ll start this wave again, and the waves you’ve beaten stay beaten.</p>';
      if (s.breakOffs >= 2 && !s.calm) {
        const calm = el('button', 'bh-choice', this.card);
        calm.type = 'button';
        calm.textContent = 'Try calm seas for this wave';
        calm.onclick = () => {
          this.actions.calm(true);
          calm.disabled = true;
          calm.textContent = 'Calm seas it is';
        };
      }
    } else if (s.phase === 'won') {
      this.card.classList.add('show', 'slim');
      this.card.innerHTML = '<h2>The passage is clear</h2><p></p>';
      this.card.querySelector('p')!.textContent = this.wonText;
    }
  }

  private showQuestion(): void {
    const quiz = this.quiz;
    this.card.classList.add('show');
    this.asking = true;
    el('h2', '', this.card).textContent = 'The bosun’s question';
    if (!quiz) {
      this.pickBonus(false);
      return;
    }
    el('p', 'bh-cite', this.card).textContent = sourceLabel(quiz.source);
    if (quiz.situation) el('p', 'bh-situation', this.card).innerHTML = md(quiz.situation);
    el('p', 'bh-prompt', this.card).innerHTML = md(quiz.prompt);
    const list = el('div', 'bh-options', this.card);
    const feedback = el('p', 'bh-feedback', this.card);
    for (const option of quiz.options) {
      const b = el('button', 'bh-choice', list);
      b.type = 'button';
      b.innerHTML = md(option.text);
      b.onclick = () => {
        const right = option.id === quiz.answer;
        for (const other of list.querySelectorAll('button')) other.disabled = true;
        b.classList.add(right ? 'right' : 'wrong');
        b.insertAdjacentHTML(
          'afterbegin',
          right ? '<i aria-hidden="true">✓</i>' : '<i aria-hidden="true">✗</i>',
        );
        feedback.innerHTML = md(right ? quiz.explain.correct : (option.feedback ?? quiz.explain.wrong));
        const link = el('a', 'bh-source', feedback);
        link.href = courseUrl(quiz.source);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = ' Open in the course ↗';
        this.pickBonus(right);
      };
    }
    const skip = el('button', 'bh-link', this.card);
    skip.type = 'button';
    skip.textContent = 'Skip the question (base repairs only)';
    skip.onclick = () => this.actions.answer(null);
    list.querySelector('button')?.focus({ preventScroll: true });
  }

  private pickBonus(right: boolean): void {
    for (const b of this.card.querySelectorAll('.bh-link')) b.remove();
    const picks = el('div', 'bh-picks', this.card);
    if (right) {
      el('p', 'bh-pick-head', picks).textContent = 'Well answered! Pick your reward:';
      const ds = el('button', 'bh-choice pick', picks);
      ds.type = 'button';
      ds.innerHTML = '<b>Double-shotted volley</b><span>Your next broadside hits half as hard again</span>';
      ds.onclick = () => this.actions.answer('double-shot');
      const rp = el('button', 'bh-choice pick', picks);
      rp.type = 'button';
      rp.innerHTML = '<b>Quick repairs</b><span>+30 hull on top of the usual repairs</span>';
      rp.onclick = () => this.actions.answer('repairs');
    } else {
      const go = el('button', 'bh-choice pick', picks);
      go.type = 'button';
      go.innerHTML = '<b>Make repairs and sail on</b><span>The crew patches the hull from the stores</span>';
      go.onclick = () => this.actions.answer(null);
    }
    picks.querySelector('button')?.focus({ preventScroll: true });
  }

  dispose(): void {
    window.clearTimeout(this.captionTimer);
    this.root.remove();
  }
}
