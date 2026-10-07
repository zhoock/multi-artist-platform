import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EqualityFn } from 'react-redux';
import { useStore } from 'react-redux';

import {
  ensureTrackLyricsBundle,
  isTrackLyricsInflight,
} from '@entities/lyrics/lib/ensureTrackLyricsBundle';
import {
  hasNonEmptyTrackLyricsEntity,
  resolveTrackLyricsBundle,
} from '@entities/lyrics/lib/selectors';
import { describeTrackLyricsEntities } from '@entities/lyrics/lib/describeTrackLyricsEntities';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import type { SyncedLyricsLine } from '@models';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import type { RootState } from '@shared/model/appStore/types';
import { resolveLyricsSyncState } from '@shared/lib/lyrics';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

import { artistPlayTrace } from '@features/universe/lib/artistPlayTrace';

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

export type UseLyricsContentResult = {
  lyricsBundle: TrackLyricsBundle | null;
  /** True when slice already has text-only/synced lyrics for this track (any locale). */
  hasNonEmptyLyricsEntity: boolean;
  /** Remote lyrics fetch in progress for this track. */
  isLyricsHydrating: boolean;
  /** Fetch finished and track has no lyrics (not loading). */
  isLyricsConfirmedUnavailable: boolean;
};

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
 * Hydration fallback from the playlist row until trackLyricsSlice is populated.
 * Same contract as before the thin queue: embedded `track.lyrics`, else plain content.
 */
export function buildPlaylistLyricsFallback(
  albumId: string,
  track: PlayerTrack,
  lang: string
): TrackLyricsBundle | null {
  if (track.lyrics && track.lyrics.state !== 'empty') {
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

function resolveCanonicalAlbumId(
  currentTrack: PlayerTrack,
  albumIdFallback: string,
  state: RootState
): string {
  return (
    currentTrack.albumId?.trim() ||
    state.player.albumMeta?.albumId?.trim() ||
    state.player.albumId?.trim() ||
    albumIdFallback
  );
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
}: UseLyricsContentParams): UseLyricsContentResult {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const location = useEffectiveLocation();
  const fetchGenerationRef = useRef(0);
  const hydrationStartedRef = useRef(false);
  const hydrationSettledRef = useRef(true);
  const [hydrationTick, setHydrationTick] = useState(0);

  const artistSlugFromUrl = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('artist');
    return raw?.trim() || null;
  }, [location.search]);

  const artistSlugForLyrics = useAppSelector(
    (state) => state.player.albumMeta?.publicSlug?.trim() || artistSlugFromUrl || null
  );

  const canonicalAlbumId = useAppSelector((state) => {
    if (!currentTrack) return albumId;
    return resolveCanonicalAlbumId(currentTrack, albumId, state);
  });

  const hasNonEmptyLyricsEntity = useAppSelector((state) => {
    if (!currentTrack) return true;
    return hasNonEmptyTrackLyricsEntity(state, canonicalAlbumId, currentTrack.id);
  });

  const playlistFallback = useMemo(() => {
    if (!currentTrack) return null;
    return buildPlaylistLyricsFallback(canonicalAlbumId, currentTrack, lang);
  }, [canonicalAlbumId, currentTrack, lang]);

  const hasPlaylistLyricsFallback = !!playlistFallback && playlistFallback.state !== 'empty';

  const lyricsInflight = useMemo(() => {
    if (!currentTrack) return false;
    const trackId = normalizeTrackIdString(String(currentTrack.id)) || String(currentTrack.id);
    return isTrackLyricsInflight(artistSlugForLyrics, canonicalAlbumId, trackId, lang);
    // hydrationTick: re-check inflight map after fetch lifecycle
  }, [artistSlugForLyrics, canonicalAlbumId, currentTrack, lang, hydrationTick]);

  const lyricsBundle = useAppSelector(
    (state): TrackLyricsBundle | null => {
      if (!currentTrack) return null;
      const fallback = buildPlaylistLyricsFallback(canonicalAlbumId, currentTrack, lang);
      return resolveTrackLyricsBundle(state, canonicalAlbumId, currentTrack.id, fallback);
    },
    { equalityFn: areLyricsBundlesEqual }
  );

  useEffect(() => {
    if (!currentTrack || hasNonEmptyLyricsEntity || hasPlaylistLyricsFallback) {
      hydrationStartedRef.current = false;
      hydrationSettledRef.current = true;
      setIsLoadingSyncedLyrics(false);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    const trackId = String(currentTrack.id);
    const albumIdForFetch = canonicalAlbumId;

    hydrationStartedRef.current = true;
    hydrationSettledRef.current = false;
    setHydrationTick((n) => n + 1);
    setIsLoadingSyncedLyrics(true);
    artistPlayTrace('lyrics.hydration.start', {
      albumId: albumIdForFetch,
      trackId,
      lang,
      artistSlug: artistSlugForLyrics,
    });

    void (async () => {
      try {
        await ensureTrackLyricsBundle(dispatch, () => store.getState(), {
          albumId: albumIdForFetch,
          trackId,
          lang,
          artistSlug: artistSlugForLyrics,
        });
      } catch (error) {
        debugLog('useLyricsContent: failed to fetch track lyrics bundle', { error });
      } finally {
        if (fetchGenerationRef.current === generation) {
          hydrationSettledRef.current = true;
          setHydrationTick((n) => n + 1);
          setIsLoadingSyncedLyrics(false);
          artistPlayTrace('lyrics.hydration.done', {
            albumId: albumIdForFetch,
            trackId,
            lang,
          });
        }
      }
    })();

    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [
    artistSlugForLyrics,
    canonicalAlbumId,
    currentTrack,
    dispatch,
    hasNonEmptyLyricsEntity,
    hasPlaylistLyricsFallback,
    lang,
    setIsLoadingSyncedLyrics,
    store,
  ]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }
    const logicalTrackId =
      normalizeTrackIdString(String(currentTrack.id)) || String(currentTrack.id);
    const readKeyPreferred = trackLyricsEntityKey(canonicalAlbumId, logicalTrackId, lang);
    const entities = describeTrackLyricsEntities(
      store.getState(),
      canonicalAlbumId,
      logicalTrackId
    );

    if (!lyricsBundle || lyricsBundle.state === 'empty') {
      artistPlayTrace('lyrics.lookup', {
        readAlbumId: canonicalAlbumId,
        readTrackId: logicalTrackId,
        readKeyPreferred,
        uiLang: lang,
        artistSlug: artistSlugForLyrics,
        entities,
        resolvedState: lyricsBundle?.state ?? 'none',
      });
      return;
    }

    artistPlayTrace('lyrics.resolved', {
      readAlbumId: canonicalAlbumId,
      readTrackId: logicalTrackId,
      readKeyPreferred,
      bundleAlbumId: lyricsBundle.albumId,
      bundleTrackId: lyricsBundle.trackId,
      bundleLang: lyricsBundle.lang,
      state: lyricsBundle.state,
      contentLength: lyricsBundle.content?.length ?? 0,
      entities,
      source: 'useLyricsContent',
    });
  }, [artistSlugForLyrics, canonicalAlbumId, currentTrack, lang, lyricsBundle, store]);

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

    try {
      if (lyricsBundle && lyricsBundle.state !== 'empty') {
        const plain = normalize(lyricsBundle.content);
        setPlainLyricsContent(plain || null);
        setAuthorshipText(lyricsBundle.authorship?.trim() || null);
        setHasSyncedLyricsAvailable(lyricsBundle.state === 'synced');
        setSyncedLyrics(buildKaraokeLines(lyricsBundle, duration));
        setIsLoadingSyncedLyrics(false);
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

  const needsRemoteHydration =
    !!currentTrack && !hasNonEmptyLyricsEntity && !hasPlaylistLyricsFallback;

  const isLyricsHydrating =
    needsRemoteHydration &&
    (!hydrationStartedRef.current || !hydrationSettledRef.current || lyricsInflight);

  const isLyricsConfirmedUnavailable =
    needsRemoteHydration &&
    hydrationStartedRef.current &&
    hydrationSettledRef.current &&
    !lyricsInflight &&
    (!lyricsBundle || lyricsBundle.state === 'empty');

  return {
    lyricsBundle,
    hasNonEmptyLyricsEntity,
    isLyricsHydrating,
    isLyricsConfirmedUnavailable,
  } satisfies UseLyricsContentResult;
}
