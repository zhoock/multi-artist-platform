import type { RootState } from '@shared/model/appStore/types';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';
import {
  getLyricsActionsForState,
  getLyricsPreviewLinesFromBundle,
  resolveLyricsSyncState,
} from '@shared/lib/lyrics';

export function selectTrackLyricsBundle(
  state: RootState,
  albumId: string,
  trackId: string | number,
  lang: string
): TrackLyricsBundle | undefined {
  return state.trackLyrics.entities[trackLyricsEntityKey(albumId, trackId, lang)];
}

export function selectLyricsSyncState(
  state: RootState,
  albumId: string,
  trackId: string | number,
  lang: string
) {
  return selectTrackLyricsBundle(state, albumId, trackId, lang)?.state ?? 'empty';
}

/**
 * Canonical dashboard/player read path: prefer `trackLyrics.entities`, fall back to an
 * embedded album/track bundle only until Redux is hydrated.
 */
export function resolveTrackLyricsBundle(
  state: RootState,
  albumId: string,
  trackId: string | number,
  fallback?: TrackLyricsBundle | null
): TrackLyricsBundle {
  const preferredLang = fallback?.lang?.trim();
  if (preferredLang) {
    const preferred = selectTrackLyricsBundle(state, albumId, trackId, preferredLang);
    if (preferred) return preferred;
  }

  for (const lang of ['ru', 'en'] as const) {
    if (lang === preferredLang) continue;
    const fromStore = selectTrackLyricsBundle(state, albumId, trackId, lang);
    if (fromStore) return fromStore;
  }

  if (fallback) return fallback;

  const content = '';
  return {
    albumId,
    trackId: String(trackId),
    lang: preferredLang || 'en',
    content,
    syncedLines: null,
    state: resolveLyricsSyncState({ content, syncedLines: null }),
    syncedAt: null,
  };
}

export { getLyricsActionsForState, getLyricsPreviewLinesFromBundle };
