// Learning layer dev page: every quiz type, pages, spyglass, Logbook, and a Trial, without the 3D world.
// ?q=H0.2 opens a quiz directly; ?debug outlines hotspot targets (green = correct) and masks (yellow).
import { CHESTS, GLOSSARY, IMAGES, PAGES, QUIZZES, TRIALS } from '../learn/content/index';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import { mountLearn } from '../ui/learn/LearnLayer';
import '../ui/ui.css';
import { activateCourse } from '../course/load';
import { islandQuests } from '../course/active';

// The course pack the page's content comes from (a voyage loads it the same way).
await activateCourse();

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
// The active course's own: every quiz but its Trials' questions, its first Trial, chest, page,
// image and glossary terms, and its first two Anchorage quests in the Logbook.
const first = <T>(m: Map<string, T>) => [...m.keys()][0];
const trialItems = new Set([...TRIALS.values()].flatMap((t) => t.items));
for (const id of QUIZZES.keys()) if (!trialItems.has(id)) button(id, () => void store.ask(id));
const trial = first(TRIALS);
if (trial) button(`Trial ${trial}`, () => void store.runTrial(trial));
const chest = first(CHESTS);
if (chest) button(`Chest ${chest}`, () => void store.openChest(chest));
const page = first(PAGES);
if (page) button(`Page ${page}`, () => void store.grantPage(page));
const image = first(IMAGES);
if (image) button('Spyglass', () => store.showImage(image, IMAGES.get(image)!.alt));
button('Hide spyglass', () => store.hideImage());
button('Logbook', () => {
  for (const id of [...GLOSSARY.keys()].slice(0, 3)) store.learnTerm(id);
  store.setQuests(
    islandQuests('anchorage')
      .quests.slice(0, 2)
      .map((d, i) => ({ id: d.id, title: d.title, detail: d.steps.start ?? '', done: i === 0 })),
  );
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
