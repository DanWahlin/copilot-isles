/**
 * Dev page: listen to Thousand-Bough Isle's voice lines, grouped by conversation in the order of the
 * chapter's stops (docs/specs/ISLAND-02-thousand-bough.md §4), plus each speaker's voice auditions.
 * Open /devpages/voices.html on the dev server.
 */
import { courseVoiceBase } from '../course/catalog';

interface ManifestLine {
  id: string;
  speaker: string;
  text: string;
  duration: number;
  files: { webm: string; m4a: string };
  voice?: string;
}

interface Conversation {
  title: string;
  where: string;
  match: (id: string) => boolean;
}

const VOICE_BASE = courseVoiceBase();
// Auditions live in the git-ignored tool cache, which the dev server serves from the repo root.
const AUDITIONS = '/tools/.cache/voice-auditions/thousand-bough/';

const CONVERSATIONS: readonly Conversation[] = [
  {
    title: 'Arrival',
    where: 'Juno on deck, then Wingman at the Root Wharf',
    match: (id) =>
      id === 'juno.tb.arrive' || /^wingman\.tb\.0\d$/.test(id) || id === 'wingman.starfish.thousand-bough',
  },
  {
    title: '1 · Tamsin Reed',
    where: 'Bough Landing: what a session holds',
    match: (id) => id.startsWith('tb.tamsin.'),
  },
  {
    title: '2 · Lyra',
    where: 'Booth Pools: the recording-booth comparison',
    match: (id) => id.startsWith('tb.lyra.'),
  },
  {
    title: '3 · Saffi Rootwell',
    where: 'Root Hall: what a worktree is',
    match: (id) => id.startsWith('tb.saffi.'),
  },
  {
    title: '4 · Bosun "Oak" Okoro',
    where: 'Three Landings: where a session runs',
    match: (id) => id.startsWith('tb.oak.'),
  },
  {
    title: '5 · Fen Marrow: Channel Routing',
    where: 'Flume Gallery: parallel crews, separate channels',
    match: (id) => id.startsWith('tb.fen.') && !id.startsWith('tb.fen.twist'),
  },
  {
    title: '5b · Fen Marrow: the Spire twist',
    where: 'The Spire: worktrees don’t separate ports',
    match: (id) => id.startsWith('tb.fen.twist') || id === 'wingman.tb.ports',
  },
  {
    title: '6 · Ines Calloway: Four Flags',
    where: 'Signal Deck: @ # / &',
    match: (id) => id.startsWith('tb.ines.'),
  },
  { title: '7 · Rook Tallow', where: 'Practice Bough: Exercise 1', match: (id) => id.startsWith('tb.rook.') },
  { title: '8 · Pip Hollow', where: 'Chronicle Loft: Exercise 2', match: (id) => id.startsWith('tb.pip.') },
  {
    title: '9 · Elder Maren Ashgrove',
    where: 'Crown Deck: the Canopy Trial and the Seal',
    match: (id) => id.startsWith('tb.elder.'),
  },
];

/** The audition voices per speaker, in the order tried; the game uses the one in the manifest. */
const AUDITION_VOICES: Readonly<Record<string, readonly string[]>> = {
  Tamsin: ['L4so9SudEsIYzE9j4qlR', 'dVoi15NNDJligFBwnVO0', 'Nk0iUG137ZABNEQYgAMl'],
  Saffi: ['kkPJzQOWz2Oz9cUaEaQd', 'RILOU7YmBhvwJGDGjNmP', 'kBag1HOZlaVBH7ICPE8x'],
  Oak: ['LEvd0YiWkwZ6hTZOmdVE', '77aEIu0qStu8Jwv1EdhX', 'zwbf3iHXH6YGoTCPStfx'],
  Fen: ['y6p0SvBlfEe2MH4XN7BP', 'aMdQCEO9kwP77QH1DiFy', 'csXxiUN2BUFflsCaDxPM'],
  Ines: ['EoMKQ1XHxZPJ6KVTvPL3', '73fZMjboCm1aBVyxTbBp', 'X5gGKB97vhrZhE6AgMYI'],
  Rook: ['j57KDF72L6gxbLk4sOo5', 'poHOO1m3tBNm4Ywmzcaq', '0CoxwbC90B8N0Fa3LDCH'],
  Pip: ['gwU7DXdLrTvWCiUTPZG8', 'L1aJrPa7pLJEyYlh3Ilq', 'qxePw1S1QmBgjlU3GIy5', '0lp4RIz96WD1RUtvEu3Q'],
  Maren: ['2qQJWjw5XdG80GreshqG', '7dEuJHhweR5AFXA4INkB', 'jv41DhCf464zw0TI7I1w'],
};

const audio = new Audio();
const useWebm = audio.canPlayType('audio/webm; codecs="opus"') !== '';
const status = document.querySelector<HTMLElement>('#status')!;
let queue: { url: string; row: HTMLElement | null }[] = [];
let playingRow: HTMLElement | null = null;

function lineUrl(line: ManifestLine): string {
  return VOICE_BASE + (useWebm ? line.files.webm : line.files.m4a);
}

function setPlaying(row: HTMLElement | null): void {
  playingRow?.classList.remove('playing');
  playingRow = row;
  row?.classList.add('playing');
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function playNext(): void {
  const next = queue.shift();
  if (!next) {
    setPlaying(null);
    return;
  }
  setPlaying(next.row);
  audio.src = next.url;
  void audio.play().catch((err: unknown) => {
    status.textContent = `Can't play ${next.url}: ${String(err)}`;
  });
}

function play(items: { url: string; row: HTMLElement | null }[]): void {
  audio.pause();
  queue = [...items];
  playNext();
}

audio.addEventListener('ended', () => {
  // A short breath between lines, like the dialogue system's gap.
  window.setTimeout(playNext, 350);
});

document.querySelector('#stop')!.addEventListener('click', () => {
  queue = [];
  audio.pause();
  setPlaying(null);
});

function button(label: string, aria: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

function renderConversations(lines: readonly ManifestLine[]): number {
  const root = document.querySelector('#conversations')!;
  let total = 0;
  for (const conv of CONVERSATIONS) {
    const items = lines.filter((l) => conv.match(l.id));
    if (items.length === 0) continue;
    total += items.length;
    const section = document.createElement('section');
    const h = document.createElement('h2');
    h.textContent = conv.title;
    const where = document.createElement('p');
    where.className = 'note';
    const seconds = items.reduce((s, l) => s + l.duration, 0);
    where.textContent = `${conv.where} · ${items.length} lines · ${Math.round(seconds)} s`;
    const list = document.createElement('ol');
    list.className = 'lines';
    const rows: { url: string; row: HTMLElement }[] = [];
    for (const line of items) {
      const li = document.createElement('li');
      const url = lineUrl(line);
      li.append(button('▶', `Play ${line.speaker}: ${line.text}`, () => play([{ url, row: li }])));
      const who = document.createElement('span');
      who.className = 'speaker';
      who.textContent = line.speaker;
      const text = document.createElement('span');
      text.textContent = line.text;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${line.id} · ${line.duration.toFixed(1)} s`;
      li.append(who, text, meta);
      list.append(li);
      rows.push({ url, row: li });
    }
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.append(button('▶ Play all', `Play all of ${conv.title}`, () => play(rows)));
    section.append(h, where, toolbar, list);
    root.append(section);
  }
  return total;
}

function renderCast(lines: readonly ManifestLine[]): void {
  const root = document.querySelector('#cast')!;
  for (const [speaker, voices] of Object.entries(AUDITION_VOICES)) {
    const chosen = lines.find((l) => l.speaker === speaker && l.id.startsWith('tb.'))?.voice;
    const card = document.createElement('article');
    const h = document.createElement('h3');
    h.textContent = speaker;
    const picks = document.createElement('div');
    picks.className = 'picks';
    voices.forEach((voice, i) => {
      const url = `${AUDITIONS}${speaker.toLowerCase()}-${voice}.mp3`;
      const isChosen = voice === chosen;
      const b = button(
        `${isChosen ? '★ In game' : `Option ${i + 1}`}`,
        `${speaker} audition ${i + 1}${isChosen ? ' (the voice in the game)' : ''}, voice ${voice}`,
        () => play([{ url, row: null }]),
      );
      if (isChosen) b.classList.add('chosen');
      b.title = voice;
      picks.append(b);
    });
    card.append(h, picks);
    root.append(card);
  }
}

async function main(): Promise<void> {
  const res = await fetch(`${VOICE_BASE}manifest.json`);
  const manifest = (await res.json()) as { lines: ManifestLine[] };
  const total = renderConversations(manifest.lines);
  renderCast(manifest.lines);
  status.textContent = `${total} lines, playing ${useWebm ? 'WebM/Opus' : 'AAC'} files.`;
}

void main().catch((err: unknown) => {
  status.textContent = `Couldn't load the voice manifest: ${String(err)}`;
});
