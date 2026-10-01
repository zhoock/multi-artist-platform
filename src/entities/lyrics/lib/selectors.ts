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

export function hasStoredTrackLyricsEntity(
  state: RootState,
  albumId: string,
  trackId: string | number
): boolean {
  for (const locale of ['ru', 'en'] as const) {
    if (selectTrackLyricsBundle(state, albumId, trackId, locale)) {
      return true;
    }
  }
  return false;
}

/** True when slice has text-only or synced lyrics for the track (any locale). */
export function hasNonEmptyTrackLyricsEntity(
  state: RootState,
  albumId: string,
  trackId: string | number
): boolean {
  for (const locale of ['ru', 'en'] as const) {
    const bundle = selectTrackLyricsBundle(state, albumId, trackId, locale);
    if (bundle && bundle.state !== 'empty') {
      return true;
    }
  }
  return false;
}

export function createEmptyTrackLyricsBundle(
  albumId: string,
  trackId: string | number,
  lang: string
): TrackLyricsBundle {
  const content = '';
  return {
    albumId,
    trackId: String(trackId),
    lang,
    content,
    syncedLines: null,
    state: resolveLyricsSyncState({ content, syncedLines: null }),
    syncedAt: null,
  };
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
  const fromStore: TrackLyricsBundle[] = [];

  if (preferredLang) {
    const preferred = selectTrackLyricsBundle(state, albumId, trackId, preferredLang);
    if (preferred) fromStore.push(preferred);
  }

  for (const lang of ['ru', 'en'] as const) {
    if (lang === preferredLang) continue;
    const entity = selectTrackLyricsBundle(state, albumId, trackId, lang);
    if (entity) fromStore.push(entity);
  }

  const meaningful = fromStore.find((bundle) => bundle.state !== 'empty');
  if (meaningful) return meaningful;
  if (fallback && fallback.state !== 'empty') return fallback;
  if (fromStore.length > 0) return fromStore[0];

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
