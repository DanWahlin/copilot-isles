import { createRoot, type Root } from 'react-dom/client';
import { TitleMenu } from './TitleMenu';
import { DEFAULT_SETTINGS, type GameBridge, type GraphicsInfo, type UiState } from './bridge';
import { DEFAULT_COURSE_ID } from '../course/catalog';
import './ui.css';

const PREVIEW_GRAPHICS: GraphicsInfo = {
  backend: 'webgpu',
  platform: 'other',
  gpu: '',
  tier: 'high',
  autoTier: 'high',
  urlTier: null,
  maxRenderScale: 1,
};

function fallbackBridge(): GameBridge {
  let state: UiState = {
    screen: 'title',
    returnTo: 'title',
    progress: { value: 0, message: 'Ready' },
    course: DEFAULT_COURSE_ID,
    hasSave: false,
    save: null,
    learn: { doubloons: 0, seals: [], sails: null, captainName: null, shipName: null },
    captain: 'man',
    settings: DEFAULT_SETTINGS,
    chart: null,
    renderInfo: 'Title preview',
    bootQuality: DEFAULT_SETTINGS.quality,
    graphics: PREVIEW_GRAPHICS,
    qualityNotice: null,
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
    chooseCourse: () => open('course'),
    pickCourse: (course) => setState({ course, screen: 'captain' }),
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
    startOver: () => setState({ screen: 'captain', returnTo: 'title', hasSave: false }),
    updateSettings: (patch) => setState({ settings: { ...state.settings, ...patch } }),
    applyQuality: () => setState({ qualityNotice: { kind: 'applying' } }),
    renderResolution: () => ({ scale: 1, width: innerWidth, height: innerHeight }),
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
