import { createRoot, type Root } from 'react-dom/client';
import { TitleMenu } from './TitleMenu';
import { DEFAULT_SETTINGS, type GameBridge, type UiState } from './bridge';
import './ui.css';

function fallbackBridge(): GameBridge {
  let state: UiState = {
    screen: 'title',
    returnTo: 'title',
    progress: { value: 0, message: 'Ready' },
    hasSave: false,
    save: null,
    learn: { doubloons: 0, seals: [], sails: null, captainName: null, shipName: null },
    captain: 'man',
    settings: DEFAULT_SETTINGS,
    chart: null,
    renderInfo: 'Title preview',
    bootQuality: DEFAULT_SETTINGS.quality,
  };
  const listeners = new Set<(state: UiState) => void>();
  const setState = (patch: Partial<UiState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const open = (screen: UiState['screen']) => setState({ screen, returnTo: state.screen });
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    chooseCaptain: () => open('captain'),
    newVoyage: (captain) =>
      setState({
        captain,
        screen: 'voyage-loading',
        progress: { value: 0.35, message: 'Charting the cove' },
      }),
    continueVoyage: () => setState({ screen: 'playing' }),
    resume: () => setState({ screen: 'playing' }),
    pause: () => setState({ screen: 'paused', returnTo: 'playing' }),
    openChart: () => open('chart'),
    openSettings: () => open('settings'),
    openControls: () => open('controls'),
    openCredits: () => open('credits'),
    openLogbook: () => setState({ screen: 'playing', returnTo: 'playing' }),
    back: () => setState({ screen: state.returnTo }),
    travelTo: () => setState({ screen: state.returnTo }),
    quitToTitle: () => setState({ screen: 'title', returnTo: 'title' }),
    updateSettings: (patch) => setState({ settings: { ...state.settings, ...patch } }),
    setSails: (sails) => setState({ learn: { ...state.learn, sails } }),
    skipOpening: () => setState({ screen: 'playing' }),
    pressOpening: () => setState({ screen: 'playing' }),
  };
}

export function mountUi(el: HTMLElement, bridge: GameBridge): () => void;
export function mountUi(el: HTMLElement, bridge: GameBridge = fallbackBridge()): () => void {
  const root: Root = createRoot(el);
  root.render(<TitleMenu bridge={bridge} />);
  return () => root.unmount();
}
