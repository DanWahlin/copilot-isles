import { useEffect, useState } from 'react';
import type { GameBridge, UiState } from '../bridge';

export function VoyageLoading({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  if (state.progress.cinematic) return <OpeningOverlay state={state} bridge={bridge} />;
  return <LoadingCard state={state} />;
}

/**
 * Over the opening (the cabin and the living chart): a Skip button (Esc skips too), and, only while
 * it's holding for the island, a quiet line saying what's still loading. A click or tap anywhere
 * opens the chest when it's waiting (the glowing ring over the lock is its own button), and
 * otherwise skips ahead, like E, Space and gamepad A.
 */
function OpeningOverlay({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const pct = Math.round(state.progress.value * 100);
  return (
    <main
      className="ci-opening"
      aria-label={`Setting sail for ${state.progress.destination ?? 'the isles'}`}
      onPointerDown={(e) => {
        if (e.button === 0 && !(e.target instanceof HTMLButtonElement)) bridge.pressOpening();
      }}
    >
      <p className={`ci-opening-hold${state.progress.holding ? ' show' : ''}`} role="status">
        {state.progress.holding ? `${state.progress.message}… ${pct}%` : ''}
      </p>
      <button type="button" className="ci-opening-skip" onClick={() => bridge.skipOpening()}>
        Skip <span aria-hidden="true">Esc</span>
      </button>
    </main>
  );
}

function LoadingCard({ state }: { state: UiState }) {
  const [shown, setShown] = useState(state.progress.value);
  useEffect(() => {
    const id = window.setInterval(() => {
      setShown((value) => {
        const target = state.progress.value >= 1 ? 1 : Math.min(0.985, state.progress.value + 0.045);
        return value >= target ? value : Math.min(target, value + 0.012);
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [state.progress.value]);
  const pct = Math.round(shown * 100);
  return (
    <main className="ci-loading" role="status" aria-label="Loading voyage">
      <ChartMedallion progress={shown} />
      {state.progress.destination && (
        <p className="ci-loading-bound">Bound for {state.progress.destination}</p>
      )}
      <h2>{state.progress.message}</h2>
      <div className="ci-progress" aria-label={`Loading ${pct}%`}>
        <span style={{ transform: `scaleX(${shown})` }} />
      </div>
      <p>{pct}%</p>
    </main>
  );
}

function ChartMedallion({ progress }: { progress: number }) {
  return (
    <svg className="ci-medallion" viewBox="0 0 180 180" aria-hidden="true">
      <circle cx="90" cy="90" r="76" />
      <path d="M90 24v132M24 90h132M43 43l94 94M137 43l-94 94" />
      <circle cx="90" cy="90" r={28 + progress * 28} />
    </svg>
  );
}
