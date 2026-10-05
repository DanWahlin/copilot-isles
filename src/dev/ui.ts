import {
  DEFAULT_SETTINGS,
  type CaptainBody,
  type GameBridge,
  type Screen,
  type Settings,
  type UiState,
} from '../ui/bridge';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { mountUi } from '../ui/mount';

class MockBridge implements GameBridge {
  private listeners = new Set<(state: UiState) => void>();
  private state: UiState = {
    screen: 'title',
    returnTo: 'title',
    progress: { value: 0.58, message: 'Planting palms' },
    hasSave: true,
    save: { location: 'Anchorage Cay', questsDone: 3 },
    learn: {
      doubloons: 155,
      seals: ['Seal of Anchorage'],
      sails: 'noctis-azureus',
      captainName: 'Anne',
      shipName: 'Anne’s Brigantine',
    },
    captain: 'man',
    settings: DEFAULT_SETTINGS,
    chart: {
      islands: ARCHIPELAGO,
      island: {
        id: 'anchorage',
        name: 'Anchorage Cay',
        coast: [
          [
            [0.19, 0.59],
            [0.25, 0.42],
            [0.4, 0.27],
            [0.62, 0.26],
            [0.79, 0.39],
            [0.74, 0.6],
            [0.55, 0.73],
            [0.34, 0.72],
          ],
          [
            [0.36, 0.55],
            [0.43, 0.45],
            [0.57, 0.43],
            [0.64, 0.53],
            [0.56, 0.61],
            [0.43, 0.62],
          ],
        ],
        reef: [
          [
            [0.12, 0.64],
            [0.21, 0.34],
            [0.48, 0.16],
            [0.83, 0.31],
            [0.85, 0.66],
            [0.55, 0.84],
            [0.24, 0.78],
          ],
        ],
        points: [
          { id: 'harbor', label: 'Driftwood Landing', x: 0.27, y: 0.54, kind: 'harbor' },
          { id: 'nell', label: 'Harbormaster Nell', x: 0.35, y: 0.48, kind: 'quest' },
          { id: 'beach', label: 'Lagoon Beach', x: 0.46, y: 0.72, kind: 'beach' },
          { id: 'lighthouse', label: 'Point Lighthouse', x: 0.75, y: 0.36, kind: 'landmark' },
        ],
      },
      player: { x: 0.29, y: 0.55, heading: Math.PI * 0.84, onShip: false },
    },
    renderInfo: 'WebGPU · High · 60 fps target',
    bootQuality: 'auto',
    graphics: {
      backend: 'webgpu',
      platform: 'mac',
      gpu: 'Apple M3 Max',
      tier: 'high',
      autoTier: 'high',
      urlTier: null,
      maxRenderScale: 1,
    },
    qualityNotice: null,
  };

  getState = () => this.state;

  subscribe = (listener: (state: UiState) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  newVoyage = (captain: CaptainBody) => this.set({ captain, screen: 'voyage-loading', returnTo: 'title' });
  continueVoyage = () => this.set({ screen: 'playing', returnTo: 'playing' });
  chooseCaptain = () => this.open('captain');
  resume = () => this.set({ screen: 'playing', returnTo: 'playing' });
  pause = () => this.set({ screen: 'paused', returnTo: 'playing' });
  openChart = () => this.open('chart');
  openSettings = () => this.open('settings');
  openControls = () => this.open('controls');
  openCredits = () => this.open('credits');
  openLogbook = () => this.set({ screen: 'playing', returnTo: 'playing' });
  back = () => this.set({ screen: this.state.returnTo });
  travelTo = () => this.set({ screen: this.state.returnTo });
  quitToTitle = () => this.set({ screen: 'title', returnTo: 'title' });
  updateSettings = (patch: Partial<Settings>) => this.set({ settings: { ...this.state.settings, ...patch } });
  applyQuality = () => this.set({ qualityNotice: { kind: 'applying' } });
  renderResolution = () => ({ scale: 1, width: innerWidth, height: innerHeight });
  setSails = (sails: string) => this.set({ learn: { ...this.state.learn, sails } });
  skipOpening = () => this.set({ screen: 'playing' });
  pressOpening = () => this.set({ screen: 'playing' });

  show(screen: Screen): void {
    this.set({ screen, returnTo: screen === 'paused' ? 'playing' : 'title' });
  }

  private open(screen: Screen): void {
    this.set({ screen, returnTo: this.state.screen === 'playing' ? 'playing' : this.state.screen });
  }

  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}

const bridge = new MockBridge();
mountUi(document.getElementById('ui')!, bridge);

(window as unknown as { __dev: { ready: boolean; show(screen: Screen): void; stats(): object } }).__dev = {
  ready: true,
  show: (screen) => bridge.show(screen),
  stats: () => ({ screen: bridge.getState().screen }),
};
