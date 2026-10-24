import type { GameBridge, UiState } from '../bridge';
import { MenuButton } from '../components/MenuButton';
import { OverlayShell } from '../components/OverlayShell';

export function PausedScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const seals = state.learn.seals.length ? state.learn.seals.join(' · ') : 'No seal yet';
  const who = [state.learn.captainName && `Captain ${state.learn.captainName}`, state.learn.shipName]
    .filter(Boolean)
    .join(' · ');
  return (
    <OverlayShell title="Paused" eyebrow={who || 'Voyage menu'} className="ci-pause" hideBack>
      <p className="ci-pause-progress">
        {state.learn.doubloons} doubloons · {seals}
      </p>
      <nav className="ci-menu-list compact" aria-label="Pause menu">
        <MenuButton onClick={bridge.resume}>Resume</MenuButton>
        {state.battle && bridge.skipBattle && (
          <MenuButton onClick={bridge.skipBattle}>Skip battle</MenuButton>
        )}
        {!state.battle && bridge.unstuck && <MenuButton onClick={bridge.unstuck}>Unstuck</MenuButton>}
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openLogbook}>Logbook</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.quitToTitle}>Quit to title</MenuButton>
      </nav>
    </OverlayShell>
  );
}
