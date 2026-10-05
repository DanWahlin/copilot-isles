import { DEFAULT_SAIL_PALETTE, SAIL_PALETTES } from '../../world/ship/sail-palettes';
import type { GameBridge, SubtitleSize, UiState } from '../bridge';
import { ApplyQuality, QualityPicker, RenderScaleControl } from '../components/GraphicsSettings';
import { OverlayShell } from '../components/OverlayShell';
import { Select, SettingsGroup, Slider, Toggle } from '../components/SettingsControls';

export function SettingsScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const settings = state.settings;
  return (
    <OverlayShell title="Settings" eyebrow="Ship’s instruments" onBack={bridge.back} wide>
      <div className="ci-settings-grid">
        <SettingsGroup title="Graphics" wide>
          <div className="ci-graphics">
            <QualityPicker state={state} bridge={bridge} />
            <div className="ci-graphics-side">
              <ApplyQuality state={state} bridge={bridge} />
              <RenderScaleControl state={state} bridge={bridge} />
              <Toggle
                label="Reduced motion"
                checked={settings.reducedMotion}
                onChange={(reducedMotion) => bridge.updateSettings({ reducedMotion })}
              />
            </div>
          </div>
        </SettingsGroup>
        <SettingsGroup title="Audio" tall>
          <Toggle
            label="Mute all"
            checked={settings.muted}
            onChange={(muted) => bridge.updateSettings({ muted })}
          />
          <Slider
            label="Master"
            value={settings.master}
            onChange={(master) => bridge.updateSettings({ master })}
          />
          <Slider
            label="Music"
            value={settings.music}
            onChange={(music) => bridge.updateSettings({ music })}
          />
          <Slider
            label="Ambience"
            value={settings.ambience}
            onChange={(ambience) => bridge.updateSettings({ ambience })}
          />
          <Slider label="SFX" value={settings.sfx} onChange={(sfx) => bridge.updateSettings({ sfx })} />
          <Slider
            label="Voice"
            value={settings.voice}
            onChange={(voice) => bridge.updateSettings({ voice })}
          />
        </SettingsGroup>
        <SettingsGroup title="Controls">
          <Slider
            label="Mouse sensitivity"
            value={settings.mouseSensitivity}
            min={0.4}
            max={2}
            step={0.05}
            onChange={(mouseSensitivity) => bridge.updateSettings({ mouseSensitivity })}
          />
          <Toggle
            label="Invert Y"
            checked={settings.invertY}
            onChange={(invertY) => bridge.updateSettings({ invertY })}
          />
        </SettingsGroup>
        <SettingsGroup title="Accessibility">
          <Toggle
            label="Subtitles"
            checked={settings.subtitles}
            onChange={(subtitles) => bridge.updateSettings({ subtitles })}
          />
          <Select
            label="Subtitle size"
            value={settings.subtitleSize}
            options={['s', 'm', 'l']}
            names={SUBTITLE_NAMES}
            onChange={(subtitleSize) => bridge.updateSettings({ subtitleSize: subtitleSize as SubtitleSize })}
          />
        </SettingsGroup>
        {(state.hasSave || state.returnTo === 'paused') && (
          <SettingsGroup title="Your sails" wide>
            <SailSwatches
              value={state.learn.sails ?? DEFAULT_SAIL_PALETTE}
              onChange={(id) => bridge.setSails(id)}
            />
          </SettingsGroup>
        )}
      </div>
      <footer className="ci-render-info">{state.renderInfo}</footer>
    </OverlayShell>
  );
}

function SailSwatches({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="ci-sail-swatches" role="radiogroup" aria-label="Sail palette">
      {SAIL_PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={p.id === value}
          className={`ci-sail-swatch${p.id === value ? ' on' : ''}`}
          onClick={() => onChange(p.id)}
        >
          <svg viewBox="0 0 32 32" aria-hidden>
            <path d="M16 2v28" stroke="#6b4a2b" strokeWidth="1.6" />
            <path d="M5 6h22" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" />
            <path
              d="M6 7h20q-1.6 8 0 17H6q1.6-9 0-17z"
              fill={`#${p.cloth.toString(16).padStart(6, '0')}`}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="0.8"
            />
            <path d="M6.3 19.2h19.4v2.6H6.3z" fill={`#${p.stripe.toString(16).padStart(6, '0')}`} />
          </svg>
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}

const SUBTITLE_NAMES = { s: 'Small', m: 'Medium', l: 'Large' } as const;
