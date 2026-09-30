import { createAudio } from '../audio';
import type { IslandMusic } from '../audio/music/tracks';
import type { BedName, FootstepSurface, SurfKind } from '../audio/soundscape/soundscape';
import type { VoiceManifest, VoiceManifestLine } from '../audio/voice/player';

type VolumeName = 'master' | 'music' | 'ambience' | 'sfx' | 'voice' | 'ui';

const audio = createAudio();
const status = mustElement('status');
const subtitle = mustElement('subtitle');
const voiceLines = new Map<string, VoiceManifestLine>();
let currentLine: VoiceManifestLine | null = null;
let currentWord = -1;

function mustElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

mustElement('unlock').addEventListener('click', () => {
  void audio.unlock().then((ok) => {
    status.textContent = ok ? 'Unlocked' : 'Audio unavailable';
    showTrack('anchorage');
    audio.sfx.setBed('wind', 0.35);
    audio.sfx.setBed('palms', 0.45);
    audio.sfx.setBed('surf_far', 0.55);
    audio.sfx.setBed('birds_dawn', 0.45);
    audio.sfx.setBed('crickets', 0.45);
  });
});

const volumeRoot = mustElement('volumes');
for (const name of [
  'master',
  'music',
  'ambience',
  'sfx',
  'voice',
  'ui',
] as const satisfies readonly VolumeName[]) {
  const label = document.createElement('label');
  label.textContent = `${name}: `;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(audio.volumes[name]);
  input.addEventListener('input', () => {
    audio.volumes[name] = Number(input.value);
  });
  label.append(input);
  volumeRoot.append(label);
}

const trackRoot = mustElement('tracks');
const trackButtons = new Map<IslandMusic, HTMLButtonElement>();
for (const [island, label] of [
  ['harbour', 'Title & sea: Bamboo Tide'],
  ['anchorage', "Anchorage: The Bard's Tale"],
] as const satisfies readonly (readonly [IslandMusic, string])[]) {
  const trackButton = button(label, () => showTrack(island));
  trackButtons.set(island, trackButton);
  trackRoot.append(trackButton);
}

function showTrack(island: IslandMusic): void {
  audio.music.setIsland(island);
  for (const [name, trackButton] of trackButtons)
    trackButton.setAttribute('aria-pressed', String(name === island));
}

const soundRoot = mustElement('soundscape');
const listener = { x: 0, y: 1.7, z: 0 };
const forward = { x: 0, y: 0, z: -1 };
audio.sfx.setListener(listener, forward);
for (const kind of ['crash', 'wash', 'backwash'] as const satisfies readonly SurfKind[]) {
  soundRoot.append(button(`Surf ${kind}`, () => audio.sfx.surf({ x: -8, y: 0, z: -14 }, kind, 0.8)));
}
for (const surface of [
  'sand',
  'wetsand',
  'wood',
  'rock',
  'grass',
  'water',
] as const satisfies readonly FootstepSurface[]) {
  soundRoot.append(button(`Step ${surface}`, () => audio.sfx.footstep(surface, { x: 1, y: 0, z: -2 })));
}
for (const oneShot of [
  'gull',
  'tern',
  'bird_forest',
  'bird_dove',
  'splash',
  'big_splash',
  'hull_slap',
] as const) {
  soundRoot.append(
    button(`One-shot ${oneShot}`, () => audio.sfx.oneShot(oneShot, { x: 7, y: 3, z: -9 }, 0.8)),
  );
}
for (const bed of [
  'wind',
  'palms',
  'surf_far',
  'birds_dawn',
  'crickets',
] as const satisfies readonly BedName[]) {
  soundRoot.append(button(`Toggle bed ${bed}`, () => audio.sfx.setBed(bed, Math.random() > 0.5 ? 0.55 : 0)));
}
mustElement('dayNight').addEventListener('input', (event) => {
  audio.sfx.setTimeOfDay(Number((event.currentTarget as HTMLInputElement).value));
});

void loadVoiceButtons();
audio.onWord = (lineId, wordIndex) => {
  const line = voiceLines.get(lineId);
  if (!line) return;
  currentLine = line;
  currentWord = wordIndex;
  renderSubtitle();
};

function renderSubtitle(): void {
  subtitle.replaceChildren();
  if (!currentLine) {
    subtitle.textContent = 'Load a voice line to see word highlighting.';
    return;
  }
  const textWords = currentLine.text.split(/(\s+)/);
  let spokenWord = 0;
  for (const token of textWords) {
    const span = document.createElement('span');
    span.textContent = token;
    if (/\S/.test(token)) {
      if (spokenWord === currentWord) span.className = 'active';
      spokenWord++;
    }
    subtitle.append(span);
  }
}

async function loadVoiceButtons(): Promise<void> {
  const root = mustElement('voices');
  const response = await fetch('/voice/testcove/manifest.json');
  if (!response.ok) {
    root.textContent = 'Run npx tsx tools/voice/generate.ts to create voice files.';
    return;
  }
  const manifest = (await response.json()) as VoiceManifest;
  for (const line of manifest.lines) {
    voiceLines.set(line.id, line);
    root.append(
      button(`${line.speaker}: ${line.id}`, () => {
        currentLine = line;
        currentWord = -1;
        renderSubtitle();
        void audio.playVoice(line.id);
      }),
    );
  }
}

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  audio.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
