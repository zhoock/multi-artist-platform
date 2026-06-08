// src/entities/savedMix/lib/mapMixState.ts
import type { PanelStemState, SavedMixSetting } from '../model/types';

/** UI-состояние панели (`Record<stemId, {volume,muted,soloed}>`) → массив настроек микса. */
export function panelStateToSettings(mix: Record<string, PanelStemState>): SavedMixSetting[] {
  return Object.entries(mix).map(([stemId, state]) => ({
    stemId,
    volume: state.volume,
    muted: state.muted,
    solo: state.soloed,
  }));
}

/** Массив настроек микса → UI-состояние панели (`soloed` ↔ `solo`). */
export function settingsToPanelState(settings: SavedMixSetting[]): Record<string, PanelStemState> {
  const result: Record<string, PanelStemState> = {};
  for (const item of settings) {
    result[item.stemId] = {
      volume: item.volume,
      muted: item.muted,
      soloed: item.solo,
    };
  }
  return result;
}
