// Learning layer dev page: every quiz type, pages, spyglass, Logbook, and a Trial, without the 3D world.
// ?q=H0.2 opens a quiz directly; ?debug outlines hotspot targets (green = correct) and masks (yellow).
import { QUIZZES } from '../learn/content/index';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import { mountLearn } from '../ui/learn/LearnLayer';
import '../ui/ui.css';

const q = new URLSearchParams(location.search);
const memory = new Map<string, string>();
const progress = new Progress({
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
});
const store = new LearnStore(progress);
mountLearn(document.body, store, { subscribe: () => () => {}, get: () => true });

const bar = document.getElementById('bar')!;
const button = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  bar.append(b);
};
for (const id of QUIZZES.keys()) if (!id.startsWith('T0.')) button(id, () => void store.ask(id));
button('Trial T0', () => void store.runTrial('T0'));
button('Chest C0.1', () => void store.openChest('C0.1'));
button('Page P0.S', () => void store.grantPage('P0.S'));
button('Spyglass', () => store.showImage('ch00/app-sign-in', 'Select **Sign in to GitHub**.'));
button('Hide spyglass', () => store.hideImage());
button('Logbook', () => {
  for (const id of ['fork', 'worktree', 'dry-run']) store.learnTerm(id);
  store.setQuests([
    {
      id: 'q0.2',
      title: 'Captain’s Papers',
      detail: 'Talk to Nell at the harbourmaster’s office.',
      done: true,
    },
    {
      id: 'q0.3',
      title: 'Copy the Master Chart',
      detail: 'Find Ezra in the chartmaker’s loft.',
      done: false,
    },
  ]);
  store.openLogbook();
});

// ?debug: outline hotspot targets and masks over the quiz image for calibration.
if (q.has('debug')) {
  store.subscribe((s) => {
    requestAnimationFrame(() => {
      const frame = document.querySelector('.ci-hotspot-frame');
      if (!frame || !s.quiz || s.quiz.quiz.type !== 'hotspot') return;
      frame.querySelectorAll('.debug-rect').forEach((e) => e.remove());
      const add = (r: readonly number[], cls: string) => {
        const d = document.createElement('div');
        d.className = `debug-rect ${cls}`;
        Object.assign(d.style, {
          left: `${r[0]! * 100}%`,
          top: `${r[1]! * 100}%`,
          width: `${r[2]! * 100}%`,
          height: `${r[3]! * 100}%`,
        });
        frame.append(d);
      };
      for (const t of s.quiz.quiz.targets) add(t.rect, t.correct ? 'good' : '');
      for (const m of s.quiz.quiz.mask) add(m, 'mask');
    });
  });
}

const start = q.get('q');
if (start === 'T0') void store.runTrial('T0');
else if (start && QUIZZES.has(start)) void store.ask(start);
else if (q.get('show') === 'logbook')
  bar.querySelectorAll('button')[bar.childElementCount - 1]?.dispatchEvent(new MouseEvent('click'));

(window as unknown as { __dev: object }).__dev = { ready: true, store };
