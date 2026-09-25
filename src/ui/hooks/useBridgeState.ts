import { useSyncExternalStore } from 'react';
import type { GameBridge, UiState } from '../bridge';

export function useBridgeState(bridge: GameBridge): UiState {
  return useSyncExternalStore(bridge.subscribe, bridge.getState, bridge.getState);
}
