import type { GameBridge, UiState } from '../bridge';
import { MenuButton } from '../components/MenuButton';

export function TitleScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  return (
    <main className="ci-title-shell" aria-labelledby="title-wordmark">
      <div className="ci-wordmark-block">
        <p className="ci-kicker">A pirate island adventure</p>
        <h1 id="title-wordmark">COPILOT ISLES</h1>
        <p className="ci-subtitle">Learn the GitHub Copilot app, one island at a time</p>
      </div>
      <nav className="ci-menu-list" aria-label="Main menu">
        <MenuButton onClick={bridge.chooseCaptain} initial={!state.hasSave}>
          New Voyage
        </MenuButton>
        {state.hasSave && (
          <MenuButton
            onClick={bridge.continueVoyage}
            detail={`${state.save?.questsDone ?? 0} quests done`}
            initial
          >
            Continue · {state.save?.location ?? 'Anchorage Cay'}
          </MenuButton>
        )}
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.openCredits}>Credits</MenuButton>
      </nav>
    </main>
  );
}
