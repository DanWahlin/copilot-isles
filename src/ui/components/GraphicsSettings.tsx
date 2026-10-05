import { useEffect, useMemo, useState } from 'react';
import { TIER_NAMES, TIER_ORDER, tierBlurbs, tierFor } from '../../engine/tier-info';
import type { Tier } from '../../world/contracts';
import type { GameBridge, QualitySetting, RenderResolution, UiState } from '../bridge';

const OPTIONS: readonly QualitySetting[] = ['auto', ...TIER_ORDER];

/** Quality list (Auto shows what it picked; every tier says what it draws and who it's for). */
export function QualityPicker({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const g = state.graphics;
  const quality = state.settings.quality;
  const blurbs = useMemo(() => tierBlurbs(g.backend), [g.backend]);
  const forWho = tierFor(g.platform);
  const autoPick = [TIER_NAMES[g.autoTier], g.gpu, g.backend === 'webgl2' ? 'WebGL2' : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="ci-quality-list" role="radiogroup" aria-labelledby="ci-quality-label">
      <span id="ci-quality-label" className="ci-quality-label">
        Quality
      </span>
      {OPTIONS.map((option) => {
        const on = option === quality;
        const auto = option === 'auto';
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            className={`ci-quality-option${on ? ' on' : ''}`}
            onClick={() => bridge.updateSettings({ quality: option })}
          >
            <span className="ci-quality-name">
              <b>{auto ? 'Auto' : TIER_NAMES[option]}</b>
              {auto && <span className="ci-quality-pick"> · {autoPick}</span>}
              {!auto && <span className="ci-quality-for">{forWho[option]}</span>}
              {auto && <span className="ci-tag">recommended</span>}
              {!auto && option === g.autoTier && <span className="ci-tag">detected</span>}
            </span>
            <small>
              {auto ? 'Picks a level from your graphics chip and a quick test at startup.' : blurbs[option]}
            </small>
          </button>
        );
      })}
    </div>
  );
}

/** Render scale: Auto (adaptive resolution) or a fixed scale, applied at once. */
export function RenderScaleControl({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const value = state.settings.renderScale;
  const max = state.graphics.maxRenderScale;
  const [res, setRes] = useState<RenderResolution>(() => bridge.renderResolution());
  useEffect(() => {
    const read = () => setRes(bridge.renderResolution());
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [bridge, value]);
  const auto = value === 'auto';
  const shown = auto ? res.scale : value;
  const set = (v: number) => bridge.updateSettings({ renderScale: clampScale(v, max) });
  const readout = `${shown.toFixed(2)}× · ${res.width}×${res.height}`;
  return (
    <div className="ci-scale" role="group" aria-labelledby="ci-scale-label">
      <div className="ci-scale-head">
        <span id="ci-scale-label">Render scale</span>
        <output aria-live="off">{readout}</output>
      </div>
      <div className="ci-scale-controls">
        <button
          type="button"
          className="ci-chip"
          aria-pressed={auto}
          onClick={() => bridge.updateSettings({ renderScale: auto ? clampScale(res.scale, max) : 'auto' })}
        >
          Auto
        </button>
        <input
          type="range"
          aria-label="Render scale"
          aria-valuetext={`${Math.round(shown * 100)}%, ${res.width} by ${res.height} pixels${auto ? ', automatic' : ''}`}
          min={0.5}
          max={max}
          step={0.05}
          value={shown}
          onChange={(e) => set(Number(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            set(shown + (e.key === 'ArrowLeft' ? -0.05 : 0.05));
          }}
        />
      </div>
      <p className="ci-scale-hint">
        {auto
          ? 'Auto lowers the resolution when a scene gets busy, then brings it back up.'
          : `Fixed at ${Math.round(value * 100)}%. Lower is faster, higher is sharper.`}
      </p>
    </div>
  );
}

/** Status line and Apply: saves, reloads into the same place, then shows the new tier. */
export function ApplyQuality({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const g = state.graphics;
  const quality = state.settings.quality;
  const target: Tier = quality === 'auto' ? g.autoTier : quality;
  const pending = target !== g.tier;
  const notice = state.qualityNotice;
  const applying = notice?.kind === 'applying';
  const now = TIER_NAMES[g.tier];
  let status: string;
  if (applying) status = 'Saving your progress and reloading…';
  else if (pending && g.urlTier)
    status = `You're on ${now}, set by the page address. Apply to switch to ${TIER_NAMES[target]}.`;
  else if (pending && quality === 'auto' && state.bootQuality === 'auto')
    status = `You're on ${now}. Auto now picks ${TIER_NAMES[target]} for this device. Apply to switch.`;
  else if (pending)
    status = `You're on ${now}. Apply to switch to ${TIER_NAMES[target]}. Your progress is saved first.`;
  else if (notice?.kind === 'applied') status = `Done. You're on ${TIER_NAMES[notice.tier]} now.`;
  else if (g.urlTier) status = `You're on ${now}, set by the page address.`;
  else status = `You're on ${now}.`;
  return (
    <div className="ci-apply">
      <p className="ci-apply-status" role="status">
        {status}
      </p>
      <button
        type="button"
        className="ci-chip ci-apply-button"
        disabled={!pending || applying}
        onClick={() => bridge.applyQuality()}
      >
        {applying ? 'Reloading…' : 'Apply and reload'}
      </button>
    </div>
  );
}

function clampScale(v: number, max: number): number {
  return Math.min(max, Math.max(0.5, Math.round(v * 20) / 20));
}
