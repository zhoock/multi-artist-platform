import { Play } from 'lucide-react';
import {
  ALBUM_PLAY_BUTTON_ICON_SIZE,
  playerTransportIconProps,
} from '@shared/ui/icons/playerActionIcon';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from 'react-redux';
import type { RootState } from '@shared/model/appStore/types';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { playerActions, loadPlayerState, savePlayerState } from '@features/player';
import type { IAlbums, TracksProps } from '@models';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { gaEvent } from '@shared/lib/analytics';
import { TrackList } from '@entities/track/ui/TrackList';
import { getUserAudioUrl } from '@shared/api/albums';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { refreshPremiumContentForArchiveChange } from '@features/artistArchive';
import {
  formatAlbumDisplayFullName,
  readStoredProfileDisplayName,
} from '@shared/lib/profileDisplayName';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import {
  isTrackPlaybackBlocked,
  resolveFirstPlayableIndex,
} from '@shared/lib/tracks/trackPlayback';
import './style.scss';

/** Сигнатура для React.memo — иначе при смене visibility/playbackLocked без смены albumId список не обновлялся. */
function albumTracksMemoSignature(album: IAlbums): string {
  const head = `${album.albumId}\0${album.album ?? ''}\0${String((album.cover ?? '').length)}`;
  const tail = (album.tracks ?? [])
    .map(
      (t) =>
        `${String(t.id)}\t${normalizeTrackVisibility((t as { visibility?: unknown }).visibility)}\t${isTrackPlaybackBlocked(t) ? 1 : 0}\t${String((t.src ?? '').length)}`
    )
    .join('\n');
  return `${head}\n${tail}`;
}

/**
 * Преобразует треки, заменяя пути к аудио файлам на Supabase Storage URL, если это включено
 */
function transformTracksForStorage(tracks: TracksProps[], albumUserId?: string): TracksProps[] {
  return tracks.map((track) => {
    if (isTrackPlaybackBlocked(track)) {
      return { ...track, src: '' };
    }
    return {
      ...track,
      // TracksProps.src — string; пустая строка только если резолв вернул null (см. [BUG] в getUserAudioUrl + emptyStringMediaSrc)
      src: emptyStringMediaSrc(
        getUserAudioUrl(track.src, undefined, albumUserId),
        'AlbumTracks:transformTracksForStorage',
        { trackId: track.id, albumUserId }
      ),
    };
  });
}

/**
 * Компонент отображает список треков и управляет аудиоплеером.
 * Клик по треку запускает воспроизведение, меню открывает текст песни.
 */
const AlbumTracksComponent = ({ album }: { album: IAlbums }) => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const activeIndexRef = useRef(0);
  const playlistLengthRef = useRef(0);

  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const location = useLocation();
  const navigate = useNavigate();

  const artistSlugFromUrl = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('artist');
    const t = raw?.trim();
    return t || null;
  }, [location.search]);

  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, {
    artistSlug: artistSlugFromUrl,
  });

  const { requestAccess } = useArchiveAccessModal();

  const resolvedSiteArtist = useMemo(
    () => siteArtistName.trim() || readStoredProfileDisplayName().trim(),
    [siteArtistName]
  );
  const displayArtistLabel = resolvedSiteArtist ? resolvedSiteArtist : '—';
  const artistHubPath = withPublicArtistQuery('/', artistSlugFromUrl);
  const fullNameMeta = useMemo(
    () => formatAlbumDisplayFullName(resolvedSiteArtist, album.album),
    [resolvedSiteArtist, album.album]
  );

  /** Треки для страницы альбома: скрытые (visibility=hidden) не показываем, даже если стемы публичны. */
  const albumPageTracks = useMemo(
    () =>
      (album.tracks ?? []).filter(
        (t) => normalizeTrackVisibility((t as { visibility?: unknown }).visibility) !== 'hidden'
      ),
    [album.tracks]
  );

  const displayArtistLabelRef = useRef(displayArtistLabel);
  const fullNameMetaRef = useRef(fullNameMeta);
  useLayoutEffect(() => {
    displayArtistLabelRef.current = displayArtistLabel;
    fullNameMetaRef.current = fullNameMeta;
  }, [displayArtistLabel, fullNameMeta]);

  // UI словарь загружается через loader

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const state = store.getState().player;
      activeIndexRef.current = state.currentTrackIndex;
    });
    activeIndexRef.current = store.getState().player.currentTrackIndex;
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    playlistLengthRef.current = store.getState().player.playlist.length;
  }, [store]);

  useEffect(() => {
    const onArchiveChanged = () => {
      refreshPremiumContentForArchiveChange(dispatch, artistSlugFromUrl);
    };
    window.addEventListener('archive:changed', onArchiveChanged);
    return () => window.removeEventListener('archive:changed', onArchiveChanged);
  }, [artistSlugFromUrl, dispatch]);

  useEffect(() => {
    const shouldBeOpen = location.hash === '#player';
    const playlistLength = store.getState().player.playlist.length;
    if (!(shouldBeOpen && playlistLength === 0 && albumPageTracks.length > 0)) {
      return;
    }

    const savedState = loadPlayerState();
    const currentAlbumId = fallbackAlbumClientId(album);
    const currentState = store.getState().player;

    if (currentState.playlist.length !== 0) return;

    const artistForMeta = displayArtistLabelRef.current;
    const coverFullName = fullNameMetaRef.current;

    if (savedState && savedState.albumId === currentAlbumId) {
      const validTrackIndex = resolveFirstPlayableIndex(
        albumPageTracks,
        savedState.currentTrackIndex
      );
      if (validTrackIndex === -1) {
        return;
      }
      dispatch(playerActions.setPlaylist(transformTracksForStorage(albumPageTracks, album.userId)));
      dispatch(playerActions.setCurrentTrackIndex(validTrackIndex));
      dispatch(
        playerActions.setAlbumInfo({
          albumId: savedState.albumId,
          albumTitle: savedState.albumTitle ?? album.album,
        })
      );
      dispatch(
        playerActions.setAlbumMeta({
          albumId: savedState.albumId,
          userId: album.userId ?? null,
          publicSlug: artistSlugFromUrl ?? undefined,
          album: album.album,
          artist: artistForMeta,
          fullName: coverFullName,
          cover: album.cover ?? null,
        })
      );
      dispatch(
        playerActions.setSourceLocation({
          pathname: location.pathname,
          search: location.search || undefined,
        })
      );
      dispatch(playerActions.setVolume(savedState.volume));
      dispatch(playerActions.pause());
    } else {
      const startIdx = resolveFirstPlayableIndex(albumPageTracks, 0);
      if (startIdx === -1) {
        return;
      }
      dispatch(playerActions.setPlaylist(transformTracksForStorage(albumPageTracks, album.userId)));
      dispatch(playerActions.setCurrentTrackIndex(startIdx));
      dispatch(playerActions.setAlbumInfo({ albumId: currentAlbumId, albumTitle: album.album }));
      dispatch(
        playerActions.setAlbumMeta({
          albumId: currentAlbumId,
          userId: album.userId ?? null,
          publicSlug: artistSlugFromUrl ?? undefined,
          album: album.album,
          artist: artistForMeta,
          fullName: coverFullName,
          cover: album.cover ?? null,
        })
      );
      dispatch(
        playerActions.setSourceLocation({
          pathname: location.pathname,
          search: location.search || undefined,
        })
      );
      dispatch(playerActions.requestPlay());
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    album,
    albumPageTracks,
    artistSlugFromUrl,
    dispatch,
    store,
  ]);

  useEffect(() => {
    let lastSavedState = {
      albumId: store.getState().player.albumId,
      currentTrackIndex: store.getState().player.currentTrackIndex,
      playlistLength: store.getState().player.playlist.length,
    };

    const unsubscribe = store.subscribe(() => {
      const state = store.getState().player;

      if (
        state.albumId &&
        state.playlist.length > 0 &&
        (state.albumId !== lastSavedState.albumId ||
          state.currentTrackIndex !== lastSavedState.currentTrackIndex ||
          state.playlist.length !== lastSavedState.playlistLength)
      ) {
        savePlayerState(state);

        lastSavedState = {
          albumId: state.albumId,
          currentTrackIndex: state.currentTrackIndex,
          playlistLength: state.playlist.length,
        };
      }
    });

    const initialState = store.getState().player;
    if (initialState.albumId && initialState.playlist.length > 0) {
      savePlayerState(initialState);
    }

    return unsubscribe;
  }, [store]);

  const openPlayer = useCallback(
    (trackIndex: number, options?: { openFullScreen?: boolean }) => {
      const albumId = fallbackAlbumClientId(album);
      const playlist = albumPageTracks;
      const playableIndex = resolveFirstPlayableIndex(playlist, trackIndex);
      if (playableIndex === -1) {
        return;
      }
      const selectedTrack = playlist[playableIndex];

      dispatch(playerActions.setPlaylist(transformTracksForStorage(playlist, album.userId)));

      if (selectedTrack) {
        const currentState = store.getState().player;
        const actualPlaylist = currentState.playlist;
        const actualIndex = actualPlaylist.findIndex((track) => track.id === selectedTrack.id);
        if (actualIndex !== -1) {
          dispatch(playerActions.setCurrentTrackIndex(actualIndex));
        } else {
          dispatch(playerActions.setCurrentTrackIndex(playableIndex));
        }
      } else {
        dispatch(playerActions.setCurrentTrackIndex(0));
      }

      dispatch(playerActions.setAlbumInfo({ albumId, albumTitle: album.album }));
      dispatch(
        playerActions.setAlbumMeta({
          albumId,
          userId: album.userId ?? null,
          publicSlug: artistSlugFromUrl ?? undefined,
          album: album.album,
          artist: displayArtistLabel,
          fullName: fullNameMeta,
          cover: album.cover ?? null,
        })
      );
      dispatch(
        playerActions.setSourceLocation({
          pathname: location.pathname,
          search: location.search || undefined,
        })
      );
      dispatch(playerActions.requestPlay());

      if (options?.openFullScreen !== false) {
        navigate(
          {
            pathname: location.pathname,
            search: location.search || undefined,
            hash: '#player',
          },
          { replace: false }
        );
      }
    },
    [
      dispatch,
      album,
      albumPageTracks,
      location.pathname,
      location.search,
      navigate,
      store,
      displayArtistLabel,
      fullNameMeta,
      artistSlugFromUrl,
    ]
  );

  const handleTrackSelect = useCallback(
    ({
      index,
      track,
      isActive,
      isPlayingNow,
    }: {
      index: number;
      track: TracksProps;
      isActive: boolean;
      isPlayingNow: boolean;
    }) => {
      if (isTrackPlaybackBlocked(track)) {
        void requestAccess({
          artistUserId: album.userId,
          artistSlug: artistSlugFromUrl,
          onAccessGranted: () => {
            void openPlayer(index, { openFullScreen: false });
          },
        });
        return;
      }

      if (isActive) {
        if (isPlayingNow) {
          store.dispatch(playerActions.pause());
        } else {
          store.dispatch(playerActions.play());
        }
        return;
      }

      gaEvent('track_select', {
        album_id: album?.albumId,
        album_title: album?.album,
        track_id: track.id,
        track_title: track.title,
        lang,
      });

      void openPlayer(index, { openFullScreen: false });
    },
    [album, album.userId, artistSlugFromUrl, lang, openPlayer, requestAccess, store]
  );

  const renderBlock = useCallback(
    ({ tracks, playText = 'Play' }: { tracks: TracksProps[]; playText?: string }) => {
      const albumHeader = (
        <>
          <h2 className="album-title">{album?.album}</h2>

          {displayArtistLabel !== '—' && (
            <h3 className="album-artist">
              {artistSlugFromUrl ? (
                <Link to={artistHubPath}>{displayArtistLabel}</Link>
              ) : (
                displayArtistLabel
              )}
            </h3>
          )}

          <div className="wrapper-album-play">
            <button
              type="button"
              className="album-play"
              aria-label="Кнопка play"
              aria-description="Открывает плеер"
              onClick={() => {
                gaEvent('player_open', {
                  album_id: album?.albumId,
                  album_title: album?.album,
                  lang,
                });
                const firstPlayable = resolveFirstPlayableIndex(album?.tracks || [], 0);
                if (firstPlayable === -1) {
                  return;
                }
                void openPlayer(firstPlayable, {
                  openFullScreen: false,
                });
              }}
            >
              <span className="album-play__icon" aria-hidden>
                <Play
                  {...playerTransportIconProps(ALBUM_PLAY_BUTTON_ICON_SIZE, {
                    className: 'album-play__icon-svg album-play__icon-svg--play',
                  })}
                />
              </span>
              {playText}
            </button>
          </div>
        </>
      );

      return (
        <>
          {albumHeader}
          <TrackList
            tracks={tracks}
            album={album}
            onSelectTrack={handleTrackSelect}
            store={store}
          />
        </>
      );
    },
    [
      album,
      artistHubPath,
      artistSlugFromUrl,
      displayArtistLabel,
      lang,
      openPlayer,
      handleTrackSelect,
      store,
    ]
  );

  const playText = ui?.buttons?.playButton ?? 'Play';
  return renderBlock({ tracks: albumPageTracks, playText });
};

export default React.memo(AlbumTracksComponent, (prevProps, nextProps) => {
  return albumTracksMemoSignature(prevProps.album) === albumTracksMemoSignature(nextProps.album);
});
