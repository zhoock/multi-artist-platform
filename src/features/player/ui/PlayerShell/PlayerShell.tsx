// src/features/player/ui/PlayerShell/PlayerShell.tsx
import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { useStore } from 'react-redux';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import {
  formatAlbumDisplayFullName,
  readStoredProfileDisplayName,
} from '@shared/lib/profileDisplayName';
import { Popup } from '@shared/ui/popup';
import { ModalCloseButton } from '@shared/ui/modal';
import './style.scss';
import { playerActions } from '@features/player/model/slice/playerSlice';
import * as playerSelectors from '@features/player/model/selectors/playerSelectors';
import { audioController } from '@features/player/model/lib/audioController';
import { FullScreenPlayerSkeleton } from '@features/player/ui/AudioPlayer/FullScreenPlayerSkeleton';
import { MiniPlayer } from './MiniPlayer';
import { MiniPlayerContextMenu } from './MiniPlayerContextMenu';
import type { MiniPlayerContextMenuAnchor } from '@features/player/lib/miniPlayerContextMenuPosition';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';
import type { RootState } from '@shared/model/appStore/types';
import { buildArtistMixerTrackPath } from '@shared/lib/seo/publicPagePaths';
import { savePlayerState } from '@features/player/model/lib/playerPersist';
import { bootstrapPlayerSession } from '@features/player/model/lib/bootstrapPlayerSession';
import { verifyRestoredPlayerQueue } from '@features/player/model/lib/verifyRestoredPlayerQueue';
import {
  getPlayerA11yLabels,
  selectPlayerUiForA11y,
} from '@features/player/lib/getPlayerA11yLabels';
import { getMiniPlayerContextMenuLabels } from '@features/player/lib/miniPlayerContextMenuLabels';
import { readMiniPlayerContextMenuAnchor } from '@features/player/lib/miniPlayerContextMenuPosition';
import { useSyncMiniPlayerContextMenuAnchor } from '@features/player/lib/useSyncMiniPlayerContextMenuAnchor';
import { usePlayerContentLinks } from '@features/player/lib/usePlayerContentLinks';
import { teardownPlaybackAfterAuthEnd } from '@features/artistArchive/lib/teardownPlaybackAfterAuthEnd';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';
import {
  dispatchArchiveArtistAdded,
  refreshPremiumContentForArchiveChange,
} from '@features/artistArchive/lib/refreshPremiumContent';
import { CollectionFullModal } from '@features/artistArchive/ui/CollectionFullModal';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import { useArtistPageBuilderNav } from '@shared/ui/artistPageBuilder/useArtistPageBuilderNav';
import { ArchiveApiError } from '@shared/api/archive';
import { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY } from '@/components/view/universe3dConstants';
import {
  clearFixedBottomInset,
  measureFixedElementBottomInset,
  setFixedBottomInset,
} from '@shared/lib/layout';
import {
  playerAmbientBackgroundDependencyKey,
  resolvePlayerAmbientBackgroundGradient,
} from '@features/player/lib/playerAmbientBackground';

const DEFAULT_BG = 'rgba(var(--extra-background-color-rgb) / 80%)';

const LazyAudioPlayer = lazy(() =>
  import(/* webpackChunkName: "audio-player-bootstrap" */ './loadAudioPlayerModule').then((m) =>
    m.loadAudioPlayerModule()
  )
);

function FullScreenAudioPlayer({ albumMeta }: { albumMeta: PlayerAlbumMeta }) {
  return (
    <Suspense fallback={<FullScreenPlayerSkeleton />}>
      <LazyAudioPlayer albumMeta={albumMeta} />
    </Suspense>
  );
}

// Вычисляем нижний отступ как 3vi (3% ширины viewport), чтобы он соответствовал боковым отступам
const getDefaultBottomOffset = (): number => {
  if (typeof window === 'undefined') return 24; // fallback для SSR
  return window.innerWidth * 0.03; // 3vi = 3% ширины viewport
};

export const PlayerShell: React.FC = () => {
  const dispatch = useAppDispatch();
  const liveLocation = useLocation();
  const location = useEffectiveLocation();
  const navigate = useNavigate();
  const store = useStore<RootState>();
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectPlayerUiForA11y(state, lang));
  const playerA11yLabels = useMemo(() => getPlayerA11yLabels(lang, ui), [lang, ui]);
  const contextMenuLabels = useMemo(() => getMiniPlayerContextMenuLabels(lang, ui), [lang, ui]);
  const { overlayOpen: dashboardOverlayOpen } = useDashboardModalShell();

  const albumMeta = useAppSelector(playerSelectors.selectAlbumMeta);
  const {
    artistSlugForProfileLink,
    albumPagePath,
    artistPagePath,
    albumTitle: linkAlbumTitle,
    artistTitle: linkArtistTitle,
  } = usePlayerContentLinks(albumMeta, albumMeta?.albumId ?? null);
  const playlist = useAppSelector(playerSelectors.selectPlaylist);
  const currentTrack = useAppSelector(playerSelectors.selectCurrentTrack);
  const isPlaying = useAppSelector(playerSelectors.selectIsPlaying);
  const time = useAppSelector(playerSelectors.selectTime);
  const isSeeking = useAppSelector(playerSelectors.selectIsSeeking);
  const hasPlaylist = useAppSelector(playerSelectors.selectHasPlaylist);
  const sourceLocation = useAppSelector(playerSelectors.selectSourceLocation);

  const isDashboardRoute = dashboardOverlayOpen || liveLocation.pathname.startsWith('/dashboard');
  /** Slug of the artist who owns the current playback session — never the page `?artist=` context. */
  const artistSlugForProfile = useMemo(() => {
    if (isDashboardRoute) return null;
    return albumMeta?.publicSlug?.trim() || null;
  }, [isDashboardRoute, albumMeta?.publicSlug]);

  const { displayName: siteArtistDisplayName } = useSiteArtistDisplayName(lang, {
    variant: isDashboardRoute ? 'authenticated' : 'public',
    artistSlug: artistSlugForProfile,
  });

  /** После hydrate / reload подменяем artist и fullName в albumMeta на актуальный site_name (не данные из localStorage). */
  useEffect(() => {
    const meta = albumMeta;
    if (!meta?.albumId || meta.album == null) return;
    if (!isDashboardRoute && !meta.publicSlug?.trim()) {
      return;
    }

    const resolved = siteArtistDisplayName.trim() || readStoredProfileDisplayName().trim();
    const artistLabel = resolved ? resolved : '—';
    const fullName = formatAlbumDisplayFullName(resolved, meta.album) || meta.album;

    if (meta.artist === artistLabel && meta.fullName === fullName) return;

    dispatch(
      playerActions.setAlbumMeta({
        ...meta,
        artist: artistLabel,
        fullName,
      })
    );
  }, [
    dispatch,
    isDashboardRoute,
    siteArtistDisplayName,
    albumMeta?.albumId,
    albumMeta?.album,
    albumMeta?.artist,
    albumMeta?.fullName,
    albumMeta?.publicSlug,
    albumMeta?.userId,
    albumMeta?.cover,
  ]);

  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG);

  const isFullScreen = location.hash === '#player';
  const shouldRenderMini = hasPlaylist && !!albumMeta && !!currentTrack && !isFullScreen;

  const miniPlayerRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<MiniPlayerContextMenuAnchor | null>(
    null
  );
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const artistSlugForMonetization = albumMeta?.publicSlug?.trim() ?? '';
  const { monetizationEnabled } = useArtistPageAccess(artistSlugForMonetization);
  const artistUserIdForArchive = albumMeta?.userId?.trim() || null;
  const {
    buttonState: archiveButtonState,
    addToArchive,
    activateInArchive,
  } = useArtistArchiveStatus(monetizationEnabled ? artistUserIdForArchive : null);
  const { open: openArchiveAccessModal } = useArchiveAccessModal();
  const { openDashboard } = useArtistPageBuilderNav();

  const showAddToCollectionMenuItem =
    monetizationEnabled && archiveButtonState !== 'hidden' && Boolean(artistUserIdForArchive);
  const rewindIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pressStartTimeRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const wasRewindingRef = useRef(false);
  const hasLongPressTimerRef = useRef(false);
  const shouldBlockTrackSwitchRef = useRef(false);
  const timeRef = useRef(time);
  const isSeekingRef = useRef(isSeeking);
  const seekProtectionUntilRef = useRef<number>(0);

  const stripOrphanPlayerHash = useCallback(() => {
    if (location.hash !== '#player') {
      return;
    }

    const { player } = store.getState();
    const hasSession = player.playlist.length > 0 && Boolean(player.albumMeta?.albumId);
    if (!hasSession) {
      navigate(
        {
          pathname: location.pathname,
          search: location.search || undefined,
          hash: '',
        },
        { replace: true }
      );
    }
  }, [location.hash, location.pathname, location.search, navigate, store]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let lastSerialized = '';
    let lastSavedAt = 0;
    const unsubscribe = store.subscribe(() => {
      const playerState = store.getState().player;
      if (!playerState || playerState.playlist.length === 0 || !playerState.albumMeta?.albumId) {
        return;
      }

      const serializedCandidate = JSON.stringify({
        albumId: playerState.albumId,
        currentTrackIndex: playerState.currentTrackIndex,
        playlistLength: playerState.playlist.length,
        stemsFlags: playerState.playlist.map(
          (track) => `${track.id}:${track.hasStems === true ? 1 : 0}`
        ),
        timeCurrent: Math.floor(playerState.time.current),
        timeDuration: Math.floor(
          Number.isFinite(playerState.time.duration) ? playerState.time.duration : 0
        ),
        volume: playerState.volume,
        isPlaying: playerState.isPlaying,
      });

      const now = Date.now();
      if (serializedCandidate !== lastSerialized || now - lastSavedAt > 1000) {
        lastSerialized = serializedCandidate;
        lastSavedAt = now;
        savePlayerState(playerState);
      }
    });

    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (hasPlaylist && albumMeta?.albumId) {
      audioController.ensureElementInDocument();
    }
  }, [hasPlaylist, albumMeta?.albumId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const bootstrap = bootstrapPlayerSession({
      dispatch,
      getState: store.getState,
      fallbackSourceLocation: {
        pathname: location.pathname,
        search: location.search || undefined,
      },
    });
    if (bootstrap.restored && bootstrap.reason === 'hydrated-from-storage') {
      void verifyRestoredPlayerQueue(dispatch, store.getState);
    }

    stripOrphanPlayerHash();
  }, [dispatch, location.pathname, location.search, store, stripOrphanPlayerHash]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    stripOrphanPlayerHash();
  }, [stripOrphanPlayerHash, hasPlaylist, albumMeta?.albumId]);

  const playerBgKey = playerAmbientBackgroundDependencyKey(albumMeta?.playerBackground);
  useLayoutEffect(() => {
    const gradient = resolvePlayerAmbientBackgroundGradient(albumMeta);
    setBgColor(gradient ?? DEFAULT_BG);
  }, [albumMeta?.albumId, playerBgKey]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  // Синхронизируем нижний layout-inset для fixed UI и padding footer при мини-плеере
  useLayoutEffect(() => {
    if (!shouldRenderMini) {
      clearFixedBottomInset();

      const footerEl = document.querySelector('footer[role="contentinfo"]');
      if (footerEl) {
        (footerEl as HTMLElement).style.paddingBottom = '';
      }
      return;
    }

    const updateFooterPadding = () => {
      const footerEl = document.querySelector('footer[role="contentinfo"]');
      const playerEl = miniPlayerRef.current;

      if (!playerEl) {
        clearFixedBottomInset();
        return;
      }

      const bottomInset = measureFixedElementBottomInset(playerEl);
      setFixedBottomInset(bottomInset);

      if (!footerEl) return;

      (footerEl as HTMLElement).style.paddingBottom = `${bottomInset}px`;
    };

    // Обновляем после рендера
    const frameId = requestAnimationFrame(() => {
      updateFooterPadding();
    });

    // Обновляем при изменении размера окна
    const handleResize = () => {
      updateFooterPadding();
    };

    const resizeObserver = new ResizeObserver(() => {
      updateFooterPadding();
    });

    const playerEl = miniPlayerRef.current;
    if (playerEl) {
      resizeObserver.observe(playerEl);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      clearFixedBottomInset();
      const footerEl = document.querySelector('footer[role="contentinfo"]');
      if (footerEl) {
        (footerEl as HTMLElement).style.paddingBottom = '';
      }
    };
  }, [shouldRenderMini, location.pathname, location.search]);

  const canRenderPopup = Boolean(albumMeta);

  const handleToggle = useCallback(() => {
    dispatch(playerActions.toggle());
  }, [dispatch]);

  const handleNext = useCallback(() => {
    dispatch(playerActions.nextTrack(playlist.length));
  }, [dispatch, playlist.length]);

  const handleFastForwardStart = useCallback(() => {
    const startTime = Date.now();
    pressStartTimeRef.current = startTime;
    isLongPressRef.current = false;
    wasRewindingRef.current = false;
    hasLongPressTimerRef.current = false;
    shouldBlockTrackSwitchRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    hasLongPressTimerRef.current = true;

    longPressTimerRef.current = setTimeout(() => {
      if (pressStartTimeRef.current === startTime) {
        isLongPressRef.current = true;
        wasRewindingRef.current = true;
        shouldBlockTrackSwitchRef.current = true;
        isSeekingRef.current = true;
        seekProtectionUntilRef.current = Date.now() + 2000;
        const step = 5;

        rewindIntervalRef.current = setInterval(() => {
          const currentTime = timeRef.current.current || 0;
          const duration = timeRef.current.duration || 0;
          let newTime = currentTime + step;

          newTime = Math.max(0, Math.min(duration, newTime));
          const progress = duration > 0 ? (newTime / duration) * 100 : 0;

          dispatch(playerActions.setSeeking(true));
          seekProtectionUntilRef.current = Date.now() + 2000;
          dispatch(playerActions.setCurrentTime(newTime));
          dispatch(playerActions.setTime({ current: newTime, duration }));
          dispatch(playerActions.setProgress(progress));
          audioController.setCurrentTime(newTime);
        }, 200);
      }
    }, 200);
  }, [dispatch]);

  const handleFastForwardEnd = useCallback(() => {
    const pressDuration = pressStartTimeRef.current ? Date.now() - pressStartTimeRef.current : 0;
    const isRewindingActive = shouldBlockTrackSwitchRef.current;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
      dispatch(playerActions.setSeeking(false));
      isSeekingRef.current = false;
      seekProtectionUntilRef.current = Date.now() + 1500;
      if (isPlaying) {
        dispatch(playerActions.play());
      }
    }

    if (isRewindingActive) {
      setTimeout(() => {
        pressStartTimeRef.current = null;
        isLongPressRef.current = false;
        hasLongPressTimerRef.current = false;
        wasRewindingRef.current = false;
        setTimeout(() => {
          shouldBlockTrackSwitchRef.current = false;
        }, 300);
      }, 150);
      return;
    }

    if (pressDuration > 0 && pressDuration < 150) {
      handleNext();
    }

    setTimeout(() => {
      pressStartTimeRef.current = null;
      isLongPressRef.current = false;
      hasLongPressTimerRef.current = false;
      wasRewindingRef.current = false;
    }, 150);
  }, [dispatch, handleNext, isPlaying]);

  const forwardHandlers = useMemo(
    () => ({
      onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        handleFastForwardStart();
      },
      onMouseUp: () => {
        handleFastForwardEnd();
      },
      onMouseLeave: () => {
        handleFastForwardEnd();
      },
      onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => {
        event.preventDefault();
        handleFastForwardStart();
      },
      onTouchEnd: (event: React.TouchEvent<HTMLButtonElement>) => {
        event.preventDefault();
        handleFastForwardEnd();
      },
    }),
    [handleFastForwardStart, handleFastForwardEnd]
  );

  const handleExpand = useCallback(() => {
    const currentLocation = {
      pathname: location.pathname,
      search: location.search || undefined,
    };

    dispatch(playerActions.setSourceLocation(currentLocation));

    navigate(
      {
        pathname: currentLocation.pathname,
        search: currentLocation.search,
        hash: '#player',
      },
      { replace: false }
    );
  }, [dispatch, navigate, location.pathname, location.search]);

  const mixerTarget = useMemo(() => {
    if (!currentTrack || currentTrack.hasStems !== true) return null;
    const artistSlug = albumMeta?.publicSlug?.trim() || '';
    const albumId = (currentTrack.albumId ?? albumMeta?.albumId ?? '').trim();
    const trackId = currentTrack.id.trim();
    if (!artistSlug || !albumId || !trackId) return null;
    return { artistSlug, albumId, trackId };
  }, [albumMeta?.albumId, albumMeta?.publicSlug, currentTrack]);

  const handleOpenMixer = useCallback(() => {
    if (!mixerTarget) return;
    navigate(
      buildArtistMixerTrackPath(
        lang,
        mixerTarget.artistSlug,
        mixerTarget.albumId,
        mixerTarget.trackId
      )
    );
  }, [lang, mixerTarget, navigate]);

  const closeContextMenu = useCallback(() => {
    setContextMenuOpen(false);
    setContextMenuAnchor(null);
  }, []);

  const syncContextMenuAnchor = useCallback((anchor: MiniPlayerContextMenuAnchor) => {
    setContextMenuAnchor(anchor);
  }, []);

  const handleOpenContextMenu = useCallback(() => {
    const node = miniPlayerRef.current;
    if (!node) return;
    setContextMenuAnchor(readMiniPlayerContextMenuAnchor(node));
    setContextMenuOpen(true);
  }, []);

  useSyncMiniPlayerContextMenuAnchor(miniPlayerRef, contextMenuOpen, syncContextMenuAnchor);

  useEffect(() => {
    if (!contextMenuOpen) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeContextMenu();
        return;
      }
      if (target.closest('.mini-player-context-menu') || target.closest('.mini-player')) {
        return;
      }
      closeContextMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeContextMenu, contextMenuOpen]);

  const handleContextMenuGoToAlbum = useCallback(() => {
    if (!albumPagePath) return;
    const { pathname, search } = new URL(albumPagePath, 'http://local');
    dispatch(playerActions.setSourceLocation({ pathname, search: search || undefined }));
    navigate({ pathname, search: search || undefined });
    closeContextMenu();
  }, [albumPagePath, closeContextMenu, dispatch, navigate]);

  const handleContextMenuGoToArtist = useCallback(() => {
    const slug = artistSlugForProfileLink;
    if (!slug || !artistPagePath) return;
    sessionStorage.setItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, slug);
    const { pathname, search } = new URL(artistPagePath, 'http://local');
    dispatch(playerActions.setSourceLocation({ pathname, search: search || undefined }));
    navigate({ pathname, search: search || undefined });
    closeContextMenu();
  }, [artistPagePath, artistSlugForProfileLink, closeContextMenu, dispatch, navigate]);

  const handleContextMenuAddToCollection = useCallback(async () => {
    const artistUserId = artistUserIdForArchive;
    if (!artistUserId) return;

    if (archiveButtonState === 'subscription_inactive' || archiveButtonState === 'not_premium') {
      openArchiveAccessModal({
        artistUserId,
        artistSlug: artistSlugForProfileLink ?? undefined,
      });
      closeContextMenu();
      return;
    }

    if (archiveButtonState === 'in_collection_active') {
      openDashboard('collection');
      closeContextMenu();
      return;
    }

    if (archiveButtonState === 'in_collection_inactive') {
      try {
        await activateInArchive();
        refreshPremiumContentForArchiveChange(dispatch, artistSlugForProfileLink ?? undefined);
      } catch (err) {
        if (
          err instanceof ArchiveApiError &&
          (err.code === 'ARCHIVE_SLOTS_LIMIT' || err.code === 'ARCHIVE_ACTIVATION_LIMIT')
        ) {
          setArchiveFullOpen(true);
        }
      } finally {
        closeContextMenu();
      }
      return;
    }

    if (archiveButtonState === 'archive_full') {
      setArchiveFullOpen(true);
      closeContextMenu();
      return;
    }

    if (archiveButtonState !== 'can_add') {
      closeContextMenu();
      return;
    }

    try {
      await addToArchive();
      dispatchArchiveArtistAdded(artistUserId, artistSlugForProfileLink ?? undefined);
      refreshPremiumContentForArchiveChange(dispatch, artistSlugForProfileLink ?? undefined);
    } catch (err) {
      if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
        setArchiveFullOpen(true);
      }
    } finally {
      closeContextMenu();
    }
  }, [
    activateInArchive,
    addToArchive,
    archiveButtonState,
    artistSlugForProfileLink,
    artistUserIdForArchive,
    closeContextMenu,
    dispatch,
    openArchiveAccessModal,
    openDashboard,
  ]);

  const handleHideMiniPlayer = useCallback(() => {
    closeContextMenu();
    if (location.hash === '#player') {
      if (sourceLocation) {
        navigate(
          {
            pathname: sourceLocation.pathname,
            search: sourceLocation.search,
          },
          { replace: true }
        );
      } else {
        navigate(
          {
            pathname: location.pathname,
            search: location.search || undefined,
            hash: '',
          },
          { replace: true }
        );
      }
    }
    teardownPlaybackAfterAuthEnd(dispatch);
  }, [
    closeContextMenu,
    dispatch,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    sourceLocation,
  ]);

  const handleClose = useCallback(() => {
    // Используем sourceLocation для возврата на исходную страницу
    // Если sourceLocation установлен, возвращаемся на него
    // Иначе используем navigate(-1) как fallback
    if (sourceLocation) {
      navigate(
        {
          pathname: sourceLocation.pathname,
          search: sourceLocation.search,
        },
        { replace: true }
      );
    } else {
      // Fallback: возвращаемся назад в истории браузера
      navigate(-1);
    }
  }, [navigate, sourceLocation]);

  useEffect(() => {
    if ((!albumMeta || playlist.length === 0) && isPlaying) {
      dispatch(playerActions.pause());
    }
  }, [albumMeta, playlist.length, dispatch, isPlaying]);

  useEffect(() => {
    return () => {
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
        rewindIntervalRef.current = null;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  if (!albumMeta || playlist.length === 0) {
    return null;
  }

  return (
    <>
      {shouldRenderMini && currentTrack && (
        <>
          <MiniPlayer
            title={currentTrack.title}
            artist={albumMeta.artist}
            cover={albumMeta.cover}
            userId={albumMeta.userId ?? undefined}
            isPlaying={isPlaying}
            onToggle={handleToggle}
            onExpand={handleExpand}
            forwardHandlers={forwardHandlers}
            containerRef={miniPlayerRef}
            showMixerButton={Boolean(mixerTarget)}
            onOpenMixer={handleOpenMixer}
            openMixerLabel={playerA11yLabels.openMixer}
            onOpenContextMenu={handleOpenContextMenu}
          />
          <MiniPlayerContextMenu
            open={contextMenuOpen}
            anchor={contextMenuAnchor}
            labels={contextMenuLabels}
            albumTitle={linkAlbumTitle}
            artistTitle={linkArtistTitle}
            showAddToCollection={showAddToCollectionMenuItem}
            canGoToAlbum={Boolean(albumPagePath)}
            canGoToArtist={Boolean(artistPagePath)}
            onGoToAlbum={handleContextMenuGoToAlbum}
            onGoToArtist={handleContextMenuGoToArtist}
            onAddToCollection={handleContextMenuAddToCollection}
            onHideMiniPlayer={handleHideMiniPlayer}
          />
          <CollectionFullModal
            isOpen={archiveFullOpen}
            onClose={() => setArchiveFullOpen(false)}
            onUpgradePlan={() => {
              setArchiveFullOpen(false);
              openArchiveAccessModal({
                artistUserId: artistUserIdForArchive ?? undefined,
                artistSlug: artistSlugForProfileLink ?? undefined,
              });
            }}
            onManageCollection={() => {
              setArchiveFullOpen(false);
              openDashboard('collection');
            }}
          />
        </>
      )}

      {isFullScreen && canRenderPopup && albumMeta && (
        <Popup isActive bgColor={bgColor} onClose={handleClose}>
          <ModalCloseButton
            popupClose
            className="player-fullscreen__close"
            aria-label={playerA11yLabels.closePlayer}
          />
          <FullScreenAudioPlayer albumMeta={albumMeta} />
        </Popup>
      )}
    </>
  );
};
