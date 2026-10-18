import { useEffect, useRef } from 'react';
import type { GameBridge } from './bridge';
import { SoundButton } from './SoundButton';
import { TitleHint } from './components/TitleHint';
import { focusable, initialFocusable } from './hooks/focus';
import { useBridgeState } from './hooks/useBridgeState';
import { CaptainSelect } from './screens/CaptainSelect';
import { CourseSelect } from './screens/CourseSelect';
import { ChartScreen } from './screens/ChartScreen';
import { ControlsScreen } from './screens/ControlsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { PausedScreen } from './screens/PausedScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';
import { VoyageLoading } from './screens/VoyageLoading';

interface TitleMenuProps {
  bridge: GameBridge;
}

export function TitleMenu({ bridge }: TitleMenuProps) {
  const state = useBridgeState(bridge);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const id = window.setTimeout(() => initialFocusable(root)?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [state.screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = target?.matches('input, select, textarea') ?? false;
      // N mutes and unmutes on every screen (but not while typing a name).
      if (!editing && event.code === 'KeyN' && !event.repeat && !event.metaKey && !event.ctrlKey) {
        bridge.updateSettings({ muted: !bridge.getState().settings.muted });
      }
      // While playing, the game's input layer owns Esc (pause) and M (chart).
      if (state.screen === 'playing') return;
      if (event.key === 'Escape') {
        if (state.screen === 'paused') bridge.resume();
        else if (state.screen !== 'title' && state.screen !== 'captain' && state.screen !== 'voyage-loading')
          bridge.back();
      }
      if (event.key.toLowerCase() === 'm') {
        if (state.screen === 'chart') bridge.back();
        else if (state.screen === 'paused') bridge.openChart();
      }
      if (!editing && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && rootRef.current) {
        const focusables = focusable(rootRef.current);
        if (focusables.length === 0) return;
        event.preventDefault();
        const current =
          document.activeElement instanceof HTMLElement ? focusables.indexOf(document.activeElement) : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        focusables[(current + delta + focusables.length) % focusables.length].focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, state.screen]);

  return (
    <div ref={rootRef} className={`ci-ui ci-screen-${state.screen}`} aria-live="polite">
      {state.screen === 'title' && <TitleScreen state={state} bridge={bridge} />}
      {state.screen === 'title' && <TitleHint />}
      {state.screen === 'title' && (
        <SoundButton
          className="ci-title-sound"
          muted={state.settings.muted}
          onToggle={() => bridge.updateSettings({ muted: !state.settings.muted })}
        />
      )}
      {state.screen === 'course' && <CourseSelect state={state} bridge={bridge} />}
      {state.screen === 'captain' && (
        <CaptainSelect bridge={bridge} current={state.captain} save={state.hasSave ? state.save : null} />
      )}
      {state.screen === 'voyage-loading' && <VoyageLoading state={state} bridge={bridge} />}
      {state.screen === 'paused' && <PausedScreen state={state} bridge={bridge} />}
      {state.screen === 'chart' && <ChartScreen state={state} bridge={bridge} />}
      {state.screen === 'settings' && <SettingsScreen state={state} bridge={bridge} />}
      {state.screen === 'controls' && <ControlsScreen bridge={bridge} />}
      {state.screen === 'credits' && <CreditsScreen bridge={bridge} />}
    </div>
  );
}
