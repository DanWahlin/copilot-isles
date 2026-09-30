import { useEffect, useState } from 'react';
import type { UiState } from '../bridge';

export function VoyageLoading({ state }: { state: UiState }) {
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
