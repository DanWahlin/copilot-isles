import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SAIL_PALETTE, SAIL_PALETTES } from '../../world/ship/sail-palettes';
import { detectOs, formatKeys, OS_IDS, OS_NAMES, type OsId } from '../../learn/setup';
import type { GameBridge, SubtitleSize, UiState } from '../bridge';
import { COURSE } from '../../course/catalog';
import { Rich } from '../components/Rich';
import { ApplyQuality, QualityPicker, RenderScaleControl } from '../components/GraphicsSettings';
import { OverlayShell } from '../components/OverlayShell';
import { SeaStatePicker } from '../components/SeaStatePicker';
import { Select, SettingsGroup, Slider, Toggle } from '../components/SettingsControls';
import { useMenuPad } from '../hooks/menu-pad';

export function SettingsScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const settings = state.settings;
  useMenuPad(bridge.back);
  return (
    <OverlayShell title="Settings" eyebrow="Ship’s instruments" onBack={bridge.back} wide>
      <div className="ci-settings-grid">
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
        {bridge.setOs && <YourComputer state={state} setOs={bridge.setOs} />}
        <SettingsGroup title="GitHub checks">
          <Toggle
            label="Check my fork on GitHub"
            checked={settings.githubChecks}
            onChange={(githubChecks) => bridge.updateSettings({ githubChecks })}
          />
          <p className="ci-setting-note" id="ci-github-checks-note">
            Off unless you turn it on. Then the Logbook’s checklist can ask GitHub’s public API, without
            signing in, whether a step you did shows in your fork (the fork is there, a branch, a pull
            request). Your browser sends GitHub your fork’s public name and your IP address, nothing else, and
            only when you select Check on GitHub. If GitHub can’t answer, your own tick still counts.
          </p>
        </SettingsGroup>
        {(state.hasSave || state.returnTo === 'paused') && (
          <SettingsGroup title="Your sails" wide>
            <SailSwatches
              value={state.learn.sails ?? DEFAULT_SAIL_PALETTE}
              onChange={(id) => bridge.setSails(id)}
            />
          </SettingsGroup>
        )}
        {(state.hasSave || state.returnTo === 'paused') && (
          <SettingsGroup title="Your voyage" wide>
            <StartOver bridge={bridge} />
          </SettingsGroup>
        )}
        <SettingsGroup title="Sea state" wide>
          <SeaStatePicker state={state} bridge={bridge} />
        </SettingsGroup>
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

/**
 * The computer whose keys the game shows for the course's shortcuts (Chapter 01 · Prompts and
 * Shortcuts: Ctrl+R, or Cmd+R on macOS). The Logbook's Your setup card changes it too.
 */
function YourComputer({ state, setOs }: { state: UiState; setOs: (os: OsId | null) => void }) {
  const detected = state.learn.osDetected ?? detectOs();
  const os = state.learn.os ?? null;
  const names: Record<string, string> = { auto: `Auto (${OS_NAMES[detected]})`, ...OS_NAMES };
  // The course's shortcut line (a course without setup forms has none).
  const setup = COURSE.setup;
  return (
    <SettingsGroup title="Your computer">
      <Select
        label="Shortcuts for"
        value={os ?? 'auto'}
        options={['auto', ...OS_IDS]}
        names={names}
        onChange={(v) => setOs(v === 'auto' ? null : (v as OsId))}
      />
      {setup && (
        <p className="ci-setting-note">
          <Rich
            text={setup.os.note}
            values={{
              keys: formatKeys(setup.os.shortcut, os ?? detected),
              os: OS_NAMES[os ?? detected],
            }}
          />
        </p>
      )}
    </SettingsGroup>
  );
}

/** Start over, behind a confirm step: it can't be undone. */
function StartOver({ bridge }: { bridge: GameBridge }) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  if (!confirming)
    return (
      <div className="ci-start-over">
        <p className="ci-setting-note">Begin again from the captain's cabin, with a fresh voyage.</p>
        <button type="button" className="ci-chip" onClick={() => setConfirming(true)}>
          Start over…
        </button>
      </div>
    );
  return (
    <div className="ci-start-over confirming" role="group" aria-labelledby="ci-start-over-q">
      <p id="ci-start-over-q" className="ci-start-over-q" role="alert">
        Start over? This erases your voyage: quests, pages, doubloons, starfish, and your captain and ship
        names. Your settings stay. You can't undo this.
      </p>
      <div className="ci-start-over-actions">
        <button
          ref={confirmRef}
          type="button"
          className="ci-chip ci-danger"
          onClick={() => bridge.startOver()}
        >
          Yes, start over
        </button>
        <button type="button" className="ci-chip" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
