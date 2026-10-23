import type { KeyboardEvent } from 'react';
import { SEA_STATE_IDS, SEA_STATES, type SeaStateId } from '../../world/ocean/sea-state';
import type { GameBridge, UiState } from '../bridge';

/**
 * Settings → Sea state: Calm, Breeze (the default), Fresh or Gale, each with its one line. A radio
 * group of ≥ 44 px options: a click or tap picks one, and with the keyboard (or the d-pad, through
 * `useMenuPad`) the arrows move along the group and pick as they go.
 */
export function SeaStatePicker({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const value = state.settings.seaState;
  const pick = (id: SeaStateId) => bridge.updateSettings({ seaState: id });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? -at : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.min(SEA_STATE_IDS.length - 1, Math.max(0, at + step));
    pick(SEA_STATE_IDS[next]!);
    const group = event.currentTarget.parentElement;
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <>
      <div className="ci-sea-list" role="radiogroup" aria-label="Sea state">
        {SEA_STATE_IDS.map((id, i) => {
          const s = SEA_STATES[id];
          const on = id === value;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={`ci-quality-option ci-sea-option${on ? ' on' : ''}`}
              onClick={() => pick(id)}
              onKeyDown={(event) => onKeyDown(event, i)}
            >
              <span className="ci-quality-name">
                <b>{s.name}</b>
                {id === 'breeze' && <span className="ci-tag">default</span>}
              </span>
              <small>{s.blurb}</small>
            </button>
          );
        })}
      </div>
      <p className="ci-setting-note ci-sea-note">
        {state.settings.reducedMotion
          ? 'Reduced motion is on, so the waves and the ship’s roll stay no bigger than a Breeze’s. You’ll still see and hear the wind and the foam. '
          : ''}
        Sea battles and the Three Helms’ course keep their own steady sea.
      </p>
    </>
  );
}
