import { useLayoutEffect } from 'react';
import type { EqualityFn } from 'react-redux';

import { resolveTrackLyricsBundle } from '@entities/lyrics';
import type { SyncedLyricsLine, TracksProps } from '@models';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { resolveLyricsSyncState } from '@shared/lib/lyrics';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

import { debugLog } from '../utils/debug';

interface UseLyricsContentParams {
  currentTrack: TracksProps | null;
  albumId: string;
  lang: string;
  duration: number;
  setSyncedLyrics: React.Dispatch<React.SetStateAction<SyncedLyricsLine[] | null>>;
  setPlainLyricsContent: React.Dispatch<React.SetStateAction<string | null>>;
  setAuthorshipText: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentLineIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setIsLoadingSyncedLyrics: React.Dispatch<React.SetStateAction<boolean>>;
  setHasSyncedLyricsAvailable: React.Dispatch<React.SetStateAction<boolean>>;
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();

function lyricsBundlesEqual(a: TrackLyricsBundle | null, b: TrackLyricsBundle | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.state === b.state &&
    a.content === b.content &&
    a.authorship === b.authorship &&
    a.syncedAt === b.syncedAt &&
    a.lang === b.lang &&
    a.albumId === b.albumId &&
    a.trackId === b.trackId &&
    a.syncedLines === b.syncedLines
  );
}

const areLyricsBundlesEqual: EqualityFn<TrackLyricsBundle | null> = lyricsBundlesEqual;

function buildKaraokeLines(bundle: TrackLyricsBundle, duration: number): SyncedLyricsLine[] | null {
  if (bundle.state !== 'synced' || !bundle.syncedLines?.length) {
    return null;
  }

  const synced = [...bundle.syncedLines];
  const authorship = bundle.authorship?.trim() || '';

  if (authorship) {
    const last = synced[synced.length - 1];
    if (!last || last.text !== authorship) {
      const lastEnd = last?.endTime;
      const authStart =
        typeof lastEnd === 'number' && Number.isFinite(lastEnd) && lastEnd > 0
          ? lastEnd
          : Number.isFinite(duration) && duration > 0
            ? duration
            : 0;
      synced.push({
        text: authorship,
        startTime: authStart,
        endTime: undefined,
      });
    }
  }

  return synced;
}

/**
 * Build a hydration-only fallback from the playlist track until trackLyricsSlice is populated.
 * Prefer embedded `track.lyrics`; otherwise synthesize from legacy `content` / `authorship`.
 */
function buildPlaylistLyricsFallback(
  albumId: string,
  track: TracksProps,
  lang: string
): TrackLyricsBundle | null {
  if (track.lyrics) {
    return track.lyrics;
  }

  const content = track.content?.trim() ? track.content : '';
  if (!content && !track.authorship?.trim()) {
    return null;
  }

  const state = resolveLyricsSyncState({ content, syncedLines: null });
  return {
    albumId: albumId || '',
    trackId: String(track.id),
    lang: lang === 'ru' ? 'ru' : 'en',
    content,
    authorship: track.authorship,
    syncedLines: null,
    state,
    syncedAt: null,
  };
}

export function useLyricsContent({
  currentTrack,
  albumId,
  lang,
  duration,
  setSyncedLyrics,
  setPlainLyricsContent,
  setAuthorshipText,
  setCurrentLineIndex,
  setIsLoadingSyncedLyrics,
  setHasSyncedLyricsAvailable,
}: UseLyricsContentParams): TrackLyricsBundle | null {
  // Prefer trackLyricsSlice; use playlist-embedded lyrics only as hydration fallback.
  const lyricsBundle = useAppSelector(
    (state): TrackLyricsBundle | null => {
      if (!currentTrack) return null;

      const canonicalAlbumId =
        currentTrack.lyrics?.albumId?.trim() ||
        state.player.albumMeta?.albumId?.trim() ||
        state.player.albumId?.trim() ||
        albumId;

      const fallback = buildPlaylistLyricsFallback(canonicalAlbumId, currentTrack, lang);
      return resolveTrackLyricsBundle(state, canonicalAlbumId, currentTrack.id, fallback);
    },
    { equalityFn: areLyricsBundlesEqual }
  );

  useLayoutEffect(() => {
    setCurrentLineIndex(null);

    if (!currentTrack) {
      setSyncedLyrics(null);
      setAuthorshipText(null);
      setPlainLyricsContent(null);
      setHasSyncedLyricsAvailable(false);
      setIsLoadingSyncedLyrics(false);
      return;
    }

    setIsLoadingSyncedLyrics(true);

    try {
      if (lyricsBundle && lyricsBundle.state !== 'empty') {
        const plain = normalize(lyricsBundle.content);
        setPlainLyricsContent(plain || null);
        setAuthorshipText(
          lyricsBundle.authorship?.trim() || currentTrack.authorship?.trim() || null
        );
        setHasSyncedLyricsAvailable(lyricsBundle.state === 'synced');
        setSyncedLyrics(buildKaraokeLines(lyricsBundle, duration));
      } else {
        setPlainLyricsContent(null);
        setAuthorshipText(currentTrack.authorship?.trim() || null);
        setHasSyncedLyricsAvailable(false);
        setSyncedLyrics(null);
      }
    } catch (error) {
      debugLog('useLyricsContent: failed to resolve lyrics bundle', { error });
      setSyncedLyrics(null);
      setPlainLyricsContent(null);
      setAuthorshipText(null);
      setHasSyncedLyricsAvailable(false);
    } finally {
      setIsLoadingSyncedLyrics(false);
    }
  }, [
    currentTrack,
    lyricsBundle,
    albumId,
    lang,
    duration,
    setSyncedLyrics,
    setAuthorshipText,
    setCurrentLineIndex,
    setPlainLyricsContent,
    setIsLoadingSyncedLyrics,
    setHasSyncedLyricsAvailable,
  ]);

  return lyricsBundle;
}
