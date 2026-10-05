import type { BattleSnapshot } from '../world/battle/battle';
import { courseUrl } from '../learn/content';
import type { ChoiceQuiz } from '../learn/types';
import './battle-hud.css';

export interface BattleHudActions {
  fire(which: 'bearing' | 'port' | 'starboard'): void;
  skip(): void;
  answer(pick: 'double-shot' | 'repairs' | null): void;
  calm(on: boolean): void;
  /** "Bring her round": hand the helm to your helmsman, or take it back. */
  assist(on: boolean): void;
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
  private lastAssist = false;
  private readonly fillCache: number[][] = [[], []];
  private captionTimer = 0;
  private lastPhase = '';
  private quiz: ChoiceQuiz | null = null;
  private gunCount = 0;
  private readonly rowsReady: HTMLDivElement[];

  constructor(
    parent: HTMLElement,
    private readonly actions: BattleHudActions,
  ) {
    this.root = el('div', 'bh', parent);
    this.root.setAttribute('aria-label', 'Battle');

    const top = el('div', 'bh-top', this.root);
    const hull = el('div', 'bh-hull', top);
    el('span', 'bh-label', hull).textContent = 'Hull';
    const planks = el('div', 'bh-planks', hull);
    for (let i = 0; i < 10; i++) this.hullPlanks.push(el('div', 'bh-plank', planks));
    this.waveText = el('div', 'bh-wave', top);
    this.bonus = el('div', 'bh-bonus', top);

    const skip = el('button', 'bh-skip', this.root);
    skip.type = 'button';
    skip.textContent = 'Skip battle';
    skip.onclick = () => this.actions.skip();

    this.captionBox = el('div', 'bh-captions', this.root);
    this.captionBox.setAttribute('role', 'status');
    this.captionBox.setAttribute('aria-live', 'polite');

    // The helm bar: what to do with the helm next, and "Bring her round" (R) to let your helmsman steer.
    this.helmBar = el('div', 'bh-helm', this.root);
    this.hintText = el('span', 'bh-hint', this.helmBar);
    this.hintText.setAttribute('aria-live', 'polite');
    this.assistBtn = el('button', 'bh-assist', this.helmBar);
    this.assistBtn.type = 'button';
    this.assistBtn.setAttribute('aria-pressed', 'false');
    this.assistBtn.innerHTML = '<span>Bring her round</span><kbd>R</kbd>';
    this.assistBtn.onclick = () => this.actions.assist(!this.lastAssist);

    const guns = el('div', 'bh-guns', this.root);
    const makeRow = (sideIdx: number) => {
      const side = el('button', `bh-side ${sideIdx === 0 ? 'port' : 'starboard'}`, guns);
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
    this.fireBtn = el('button', 'bh-fire', guns);
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
    this.root.classList.toggle('show', on);
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
      this.card.innerHTML =
        '<h2>The passage is clear</h2><p>The raiders are back in the fog. Port Meridian lies ahead.</p>';
    }
  }

  private showQuestion(): void {
    const quiz = this.quiz;
    this.card.classList.add('show');
    el('h2', '', this.card).textContent = 'The bosun’s question';
    if (!quiz) {
      this.pickBonus(false);
      return;
    }
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
  }

  dispose(): void {
    window.clearTimeout(this.captionTimer);
    this.root.remove();
  }
}
