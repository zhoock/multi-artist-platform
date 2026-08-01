// src/features/player/ui/PlayerShell/PlayerShell.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
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
import { Popup, PopupHamburgerToggle } from '@shared/ui/popup';
import { playerActions } from '@features/player/model/slice/playerSlice';
import * as playerSelectors from '@features/player/model/selectors/playerSelectors';
import { audioController } from '@features/player/model/lib/audioController';
import { MiniPlayer } from './MiniPlayer';
import AudioPlayer from '@features/player/ui/AudioPlayer/AudioPlayer';
import type { RootState } from '@shared/model/appStore/types';
import { savePlayerState } from '@features/player/model/lib/playerPersist';
import { bootstrapPlayerSession } from '@features/player/model/lib/bootstrapPlayerSession';

const DEFAULT_BG = 'rgba(var(--extra-background-color-rgb) / 80%)';

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
  const [searchParams] = useEffectiveSearchParams();
  const { overlayOpen: dashboardOverlayOpen } = useDashboardModalShell();

  const albumMeta = useAppSelector(playerSelectors.selectAlbumMeta);
  const playlist = useAppSelector(playerSelectors.selectPlaylist);
  const currentTrack = useAppSelector(playerSelectors.selectCurrentTrack);
  const isPlaying = useAppSelector(playerSelectors.selectIsPlaying);
  const time = useAppSelector(playerSelectors.selectTime);
  const isSeeking = useAppSelector(playerSelectors.selectIsSeeking);
  const hasPlaylist = useAppSelector(playerSelectors.selectHasPlaylist);
  const sourceLocation = useAppSelector(playerSelectors.selectSourceLocation);

  const isDashboardRoute = dashboardOverlayOpen || liveLocation.pathname.startsWith('/dashboard');
  const artistSlugForProfile = useMemo(() => {
    if (isDashboardRoute) return null;
    const u = searchParams.get('artist')?.trim() ?? '';
    const m = albumMeta?.publicSlug?.trim() ?? '';
    return u || m || null;
  }, [isDashboardRoute, searchParams, albumMeta?.publicSlug]);

  const { displayName: siteArtistDisplayName } = useSiteArtistDisplayName(lang, {
    variant: isDashboardRoute ? 'authenticated' : 'public',
    artistSlug: artistSlugForProfile,
  });

  /** После hydrate / reload подменяем artist и fullName в albumMeta на актуальный site_name (не данные из localStorage). */
  useEffect(() => {
    const meta = albumMeta;
    if (!meta?.albumId || meta.album == null) return;

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

    bootstrapPlayerSession({
      dispatch,
      getState: store.getState,
      fallbackSourceLocation: {
        pathname: location.pathname,
        search: location.search || undefined,
      },
    });

    stripOrphanPlayerHash();
  }, [dispatch, location.pathname, location.search, store, stripOrphanPlayerHash]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    stripOrphanPlayerHash();
  }, [stripOrphanPlayerHash, hasPlaylist, albumMeta?.albumId]);

  // Сбрасываем цвет фона только при смене альбома (по albumId)
  // Это нужно для начальной установки дефолтного цвета, который затем будет заменён
  // цветами из обложки альбома через setBgColor из AudioPlayer
  // Используем useRef для отслеживания предыдущего albumId, чтобы сбрасывать цвет только при реальной смене альбома
  const prevAlbumIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentAlbumId = albumMeta?.albumId;
    // Сбрасываем цвет только если альбом действительно изменился
    if (currentAlbumId && prevAlbumIdRef.current !== currentAlbumId) {
      prevAlbumIdRef.current = currentAlbumId;
      setBgColor(DEFAULT_BG);
    }
  }, [albumMeta?.albumId]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  // Добавляем padding-bottom к footer, когда мини-плеер отображается
  useLayoutEffect(() => {
    if (!shouldRenderMini) {
      const footerEl = document.querySelector('footer');
      if (footerEl) {
        (footerEl as HTMLElement).style.paddingBottom = '';
      }
      return;
    }

    const updateFooterPadding = () => {
      const footerEl = document.querySelector('footer');
      const playerEl = miniPlayerRef.current;

      if (!footerEl || !playerEl) return;

      // Используем только высоту плеера, так как отступ снизу (3vi) уже учтён в позиционировании
      const playerHeight = playerEl.offsetHeight;
      (footerEl as HTMLElement).style.paddingBottom = `${playerHeight}px`;
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
      const footerEl = document.querySelector('footer');
      if (footerEl) {
        (footerEl as HTMLElement).style.paddingBottom = '';
      }
    };
  }, [shouldRenderMini]);

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
        <MiniPlayer
          title={currentTrack.title}
          cover={albumMeta.cover}
          userId={albumMeta.userId ?? undefined}
          isPlaying={isPlaying}
          onToggle={handleToggle}
          onExpand={handleExpand}
          forwardHandlers={forwardHandlers}
          containerRef={miniPlayerRef}
        />
      )}

      {canRenderPopup && albumMeta && (
        <Popup isActive={isFullScreen} bgColor={bgColor} onClose={handleClose}>
          <PopupHamburgerToggle isActive />
          <AudioPlayer albumMeta={albumMeta} setBgColor={setBgColor} />
        </Popup>
      )}
    </>
  );
};
