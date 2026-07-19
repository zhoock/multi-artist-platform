import { useLayoutEffect } from 'react';
import type { EqualityFn } from 'react-redux';

import { resolveTrackLyricsBundle } from '@entities/lyrics';
import type { SyncedLyricsLine } from '@models';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

import { debugLog } from '../utils/debug';

interface UseLyricsContentParams {
  currentTrack: PlayerTrack | null;
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
  // Playlist no longer carries lyrics — only trackLyricsSlice (hydrate via albums fetch / API).
  const lyricsBundle = useAppSelector(
    (state): TrackLyricsBundle | null => {
      if (!currentTrack) return null;

      const canonicalAlbumId =
        currentTrack.albumId?.trim() ||
        state.player.albumMeta?.albumId?.trim() ||
        state.player.albumId?.trim() ||
        albumId;

      return resolveTrackLyricsBundle(state, canonicalAlbumId, currentTrack.id, null);
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
        setAuthorshipText(lyricsBundle.authorship?.trim() || null);
        setHasSyncedLyricsAvailable(lyricsBundle.state === 'synced');
        setSyncedLyrics(buildKaraokeLines(lyricsBundle, duration));
      } else {
        setPlainLyricsContent(null);
        setAuthorshipText(null);
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
