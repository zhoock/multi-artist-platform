// src/features/player/ui/AudioPlayer/AudioPlayer.tsx
/**
 * Компонент аудиоплеера.
 * Отвечает только за отображение UI - вся логика воспроизведения находится в Redux и middleware.
 * Компонент получает данные из стейта через селекторы и диспатчит действия для управления плеером.
 */
import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { flushSync } from 'react-dom';
import { AlbumCover } from '@entities/album';
import type { SyncedLyricsLine } from '@models';
import type { PlayerAlbumMeta } from '@features/player/model/types/playerSchema';
import './style.scss';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { playerActions, playerSelectors } from '@features/player';
import { audioController } from '@features/player/model/lib/audioController';
import { clearImageColorCache } from '@shared/lib/hooks/useImageColor';
import { useLang } from '@app/providers/lang';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import { debugLog, trackDebug } from './utils/debug';
import { formatTimerValue } from './utils/formatTime';
import { useLyricsScrollRestore } from './hooks/useLyricsScrollRestore';
import { useLyricsManualScroll } from './hooks/useLyricsManualScroll';
import { useLyricsAutoScroll } from './hooks/useLyricsAutoScroll';
import { useLyricsContent } from './hooks/useLyricsContent';
import { useRewind } from './hooks/useRewind';
import { useCurrentLineIndex } from './hooks/useCurrentLineIndex';
import { useSeek } from './hooks/useSeek';
import { usePlayerControls } from './hooks/usePlayerControls';
import { useTimeDisplay } from './hooks/useTimeDisplay';
import { useTrackNavigation } from './hooks/useTrackNavigation';
import { usePlayerToggles } from './hooks/usePlayerToggles';
import { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY } from '@/components/view/Universe3D';
import { siteArtistUiLabel } from '@shared/lib/profileDisplayName';
import { buildArtistPagePath, buildPublicAlbumPagePath } from '@shared/lib/seo/publicPagePaths';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import {
  MessageSquareQuote,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume2,
} from 'lucide-react';
import {
  playerIconProps,
  playerTransportIconProps,
  PLAYER_SECONDARY_ICON_SIZE,
  PLAYER_TRANSPORT_ICON_SIZE,
  PLAYER_TRANSPORT_PLAY_ICON_SIZE,
  PLAYER_VOLUME_ICON_SIZE,
} from '@shared/ui/icons/playerActionIcon';

export default function AudioPlayer({
  albumMeta,
  setBgColor,
}: {
  /** Минимальные данные альбома для UI (обложка, название, артист) — не AlbumEditable. */
  albumMeta: PlayerAlbumMeta;
  setBgColor: (color: string) => void; // Функция для установки фонового цвета попапа (градиент из цветов обложки)
}) {
  // Получаем функцию для диспатча действий
  const dispatch = useAppDispatch();
  const location = useEffectiveLocation();
  const navigate = useNavigate();
  const isFullScreenPlayer = location.hash === '#player';
  const [isLandscapeBlocked, setIsLandscapeBlocked] = useState(false);

  // Получаем все данные о плеере из Redux стейта через селекторы
  const isPlaying = useAppSelector(playerSelectors.selectIsPlaying); // играет ли трек
  const progress = useAppSelector(playerSelectors.selectProgress); // прогресс воспроизведения (0-100%)
  const volume = useAppSelector(playerSelectors.selectVolume); // громкость (0-100)
  const isSeeking = useAppSelector(playerSelectors.selectIsSeeking); // перематывает ли пользователь
  // Используем один селектор для получения обоих значений времени атомарно
  // Это гарантирует синхронное обновление текущего и оставшегося времени
  const time = useAppSelector(playerSelectors.selectTime);
  const currentTrackIndex = useAppSelector(playerSelectors.selectCurrentTrackIndex); // индекс текущего трека
  const playlist = useAppSelector(playerSelectors.selectPlaylist); // массив треков текущего альбома
  const currentTrack = useAppSelector(playerSelectors.selectCurrentTrack); // объект текущего трека
  const shuffle = useAppSelector(playerSelectors.selectShuffle); // включено ли перемешивание треков
  const repeat = useAppSelector(playerSelectors.selectRepeat); // режим зацикливания: 'none' | 'all' | 'one'

  const INACTIVITY_TIMEOUT = 5000;

  // Состояние для синхронизированного текста
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLyricsLine[] | null>(null);
  const [authorshipText, setAuthorshipText] = useState<string | null>(null); // текст авторства
  const [currentLineIndex, setCurrentLineIndex] = useState<number | null>(null);
  const [plainLyricsContent, setPlainLyricsContent] = useState<string | null>(null); // обычный текст (не синхронизированный)
  const [isLoadingSyncedLyrics, setIsLoadingSyncedLyrics] = useState<boolean>(false);
  const [hasSyncedLyricsAvailable, setHasSyncedLyricsAvailable] = useState<boolean>(false);
  const globalShowLyrics = useAppSelector(playerSelectors.selectShowLyrics);
  const globalControlsVisible = useAppSelector(playerSelectors.selectControlsVisible);
  const [controlsVisible, setControlsVisible] = useState<boolean>(globalControlsVisible);
  const [showLyrics, setShowLyrics] = useState<boolean>(() => globalShowLyrics); // показывать ли текст песни

  const showLyricsRef = useRef(showLyrics);
  const controlsVisibleRef = useRef<boolean>(true);
  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
    dispatch(playerActions.setControlsVisible(controlsVisible));
  }, [controlsVisible, dispatch]);

  useEffect(() => {
    setShowLyrics(globalShowLyrics);
  }, [globalShowLyrics]);

  useEffect(() => {
    setControlsVisible(globalControlsVisible);
  }, [globalControlsVisible]);

  // Refs для автоскролла синхронизированного текста
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Ref для отслеживания ручной прокрутки пользователя
  const userScrollTimestampRef = useRef<number>(0);
  const isUserScrollingRef = useRef<boolean>(false);
  const suppressActiveLineRef = useRef<boolean>(false);
  // Ref для отслеживания направления прокрутки
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const manualScrollRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number>(0);
  // Ref для отслеживания, прокрутил ли пользователь текст до конца
  const userScrolledToEndRef = useRef<boolean>(false);
  const suppressScrollHandlingUntilRef = useRef<number>(0);
  const controlsVisibilityCooldownUntilRef = useRef<number>(0);
  const lastResetTimestampRef = useRef<number>(0);
  const lastMouseMoveTimestampRef = useRef<number>(0);
  const ignoreActivityUntilRef = useRef<number>(0);
  // Ref для сохранения позиции прокрутки при скрытии текста
  const savedScrollTopRef = useRef<number>(0);
  // Флаг, указывающий что мы только что восстановили позицию прокрутки
  const justRestoredScrollRef = useRef<boolean>(false);
  // Флаг для блокировки обработки событий scroll сразу после добавления обработчика
  // Это предотвращает синхронный вызов setState при первом переключении
  const scrollListenerJustAddedRef = useRef<boolean>(false);
  // Состояние режима прозрачности текста: 'normal' | 'user-scrolling' | 'seeking'
  const [lyricsOpacityMode, setLyricsOpacityMode] = useState<
    'normal' | 'user-scrolling' | 'seeking'
  >('normal');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isFullScreenPlayer) {
      setIsLandscapeBlocked(false);
      return;
    }

    const isTouchDevice = () =>
      window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse)').matches : false;

    const updateOrientationState = () => {
      if (!isFullScreenPlayer) {
        setIsLandscapeBlocked(false);
        return;
      }

      const { innerWidth: width, innerHeight: height } = window;
      const isLandscape = width > height;

      setIsLandscapeBlocked(isLandscape && isTouchDevice());
    };

    updateOrientationState();

    window.addEventListener('resize', updateOrientationState);
    window.addEventListener('orientationchange', updateOrientationState);

    return () => {
      window.removeEventListener('resize', updateOrientationState);
      window.removeEventListener('orientationchange', updateOrientationState);
    };
  }, [isFullScreenPlayer]);

  useEffect(() => {
    trackDebug('init', {
      isCoarsePointerDevice:
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
          : null,
    });
  }, [dispatch]);

  /**
   * Вычисляем уникальный ID альбома для аналитики и ключей.
   * Мемоизируем чтобы не пересчитывать при каждом рендере.
   */
  const albumId = useMemo(
    () =>
      fallbackAlbumClientId({
        albumId: albumMeta.albumId ?? undefined,
        album: albumMeta.album ?? '',
        artist: albumMeta.artist ?? '',
        userId: albumMeta.userId ?? undefined,
      }),
    [albumMeta.albumId, albumMeta.album, albumMeta.artist, albumMeta.userId]
  );

  const coverKey = albumMeta.cover ?? '';
  const coverFullName =
    albumMeta.fullName?.trim() ||
    (albumMeta.artist && albumMeta.album
      ? `${albumMeta.artist} — ${albumMeta.album}`
      : albumMeta.album?.trim() || '');

  // Refs для работы с DOM элементами и хранения промежуточных значений
  const audioContainerRef = useRef<HTMLDivElement | null>(null); // контейнер для прикрепления audio элемента к DOM
  const progressInputRef = useRef<HTMLInputElement | null>(null); // слайдер прогресса для установки CSS переменной
  const prevIsPlayingRef = useRef<boolean | null>(null); // предыдущее состояние isPlaying (null = ещё не установлено)
  const prevTrackIndexRef = useRef<number | null>(null); // предыдущий индекс трека (null = ещё не установлено)
  const isIOSDevice = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  const isCoarsePointerDevice = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);

  const isSeekingRef = useRef<boolean>(isSeeking);
  const seekProtectionUntilRef = useRef<number>(0);
  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  const bgColorSetForAlbumRef = useRef<string | null>(null); // флаг: установлен ли уже цвет фона для текущего альбома
  const prevTrackIdRef = useRef<string | number | null>(null); // предыдущий ID трека для отслеживания смены трека
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // таймер для скрытия контролов после бездействия
  const playerContainerRef = useRef<HTMLDivElement | null>(null); // контейнер плеера для отслеживания активности
  const lastAutoScrollTimeRef = useRef<number>(0); // время последнего автоскролла для throttling
  const autoScrollRafRef = useRef<number | null>(null); // ref для requestAnimationFrame
  const smoothScrollAnimationRef = useRef<number | null>(null); // ref для плавной анимации скролла
  const smoothScrollStartRef = useRef<number>(0); // начальная позиция скролла
  const smoothScrollTargetRef = useRef<number>(0); // целевая позиция скролла
  const smoothScrollStartTimeRef = useRef<number>(0); // время начала анимации
  const previousPlaybackStateRef = useRef<boolean>(isPlaying);
  const updateLyricsReservedSpace = useCallback(() => {
    const containerEl = playerContainerRef.current;
    const lyricsEl = lyricsContainerRef.current;

    if (!containerEl || !lyricsEl) {
      return;
    }

    const playerRect = containerEl.getBoundingClientRect();
    const lyricsRect = lyricsEl.getBoundingClientRect();

    if (playerRect.width === 0 && playerRect.height === 0) {
      return;
    }

    const controlsHeight = Math.max(0, Math.ceil(playerRect.bottom - lyricsRect.bottom));
    const extraSpacing = Math.min(72, Math.max(24, Math.round(playerRect.height * 0.04)));
    const reservedSpace = controlsHeight + extraSpacing;
    const reservedSpaceValue = `${reservedSpace}px`;

    if (lyricsEl.style.getPropertyValue('--controls-reserved-space') !== reservedSpaceValue) {
      lyricsEl.style.setProperty('--controls-reserved-space', reservedSpaceValue);
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const lyricsEl = lyricsContainerRef.current;
    const containerEl = playerContainerRef.current;

    if (!showLyrics || !lyricsEl || !containerEl) {
      if (lyricsEl) {
        lyricsEl.style.removeProperty('--controls-reserved-space');
      }
      return;
    }

    let frameId: number | null = null;

    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        updateLyricsReservedSpace();
        frameId = null;
      });
    };

    scheduleUpdate();

    const observedElements: Element[] = [];
    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });

      resizeObserver.observe(containerEl);
      observedElements.push(containerEl);

      resizeObserver.observe(lyricsEl);
      observedElements.push(lyricsEl);

      const trackedSelectors = [
        '.player__controls',
        '.player__progress-container',
        '.player__secondary-controls',
        '.player__volume-control',
      ];

      trackedSelectors.forEach((selector) => {
        const element = containerEl.querySelector(selector);
        if (element) {
          resizeObserver?.observe(element);
          observedElements.push(element);
        }
      });
    } else {
      window.addEventListener('resize', scheduleUpdate);
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      if (resizeObserver) {
        observedElements.forEach((element) => {
          resizeObserver?.unobserve(element);
        });
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', scheduleUpdate);
      }

      lyricsEl.style.removeProperty('--controls-reserved-space');
    };
  }, [showLyrics, controlsVisible, updateLyricsReservedSpace]);

  // Easing функция для плавного скролла (ease-out cubic)
  const easeOutCubic = useCallback((t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  }, []);

  // Функция плавного скролла (как в Apple Music) - только для iOS
  const smoothScrollTo = useCallback(
    (container: HTMLElement, targetScrollTop: number, duration: number = 600) => {
      // Если мы только что восстановили позицию, полностью блокируем автоскролл
      if (justRestoredScrollRef.current || (container as any).__isRestoringScroll) {
        return;
      }
      // На десктопе используем нативный smooth scroll
      if (!isIOSDevice) {
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        });
        lastAutoScrollTimeRef.current = Date.now();
        return;
      }

      // На iOS используем кастомный плавный скролл
      // Отменяем предыдущую анимацию если она есть
      if (smoothScrollAnimationRef.current !== null) {
        cancelAnimationFrame(smoothScrollAnimationRef.current);
      }

      smoothScrollStartRef.current = container.scrollTop;
      smoothScrollTargetRef.current = targetScrollTop;
      smoothScrollStartTimeRef.current = performance.now();

      const animate = () => {
        const elapsed = performance.now() - smoothScrollStartTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);

        const currentScrollTop =
          smoothScrollStartRef.current +
          (smoothScrollTargetRef.current - smoothScrollStartRef.current) * easedProgress;

        // Используем scrollTo вместо прямого изменения scrollTop для стабильности маски
        container.scrollTo({
          top: currentScrollTop,
          behavior: 'auto',
        });

        if (progress < 1) {
          smoothScrollAnimationRef.current = requestAnimationFrame(animate);
        } else {
          smoothScrollAnimationRef.current = null;
          lastAutoScrollTimeRef.current = Date.now();
        }
      };

      smoothScrollAnimationRef.current = requestAnimationFrame(animate);
    },
    [easeOutCubic, isIOSDevice]
  );

  const resetLyricsViewToStart = useCallback(() => {
    const container = lyricsContainerRef.current;
    if (!container) {
      return;
    }

    suppressActiveLineRef.current = true;

    if (manualScrollRafRef.current !== null) {
      cancelAnimationFrame(manualScrollRafRef.current);
      manualScrollRafRef.current = null;
    }
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
    if (smoothScrollAnimationRef.current !== null) {
      cancelAnimationFrame(smoothScrollAnimationRef.current);
      smoothScrollAnimationRef.current = null;
    }

    userScrollTimestampRef.current = 0;
    isUserScrollingRef.current = false;
    userScrolledToEndRef.current = false;
    lastScrollTopRef.current = 0;
    pendingScrollTopRef.current = 0;
    lastScrollDirectionRef.current = null;

    if (isIOSDevice) {
      smoothScrollTo(container, 0, 450);
    } else {
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      lastAutoScrollTimeRef.current = Date.now();
    }

    setLyricsOpacityMode('normal');
  }, [isIOSDevice, smoothScrollTo]);

  /**
   * Прикрепляем глобальный audio элемент к DOM при монтировании компонента.
   * audioController.element - это единственный audio элемент на всё приложение (Singleton).
   * Нужен для работы аудио (без DOM элемента он не может воспроизводиться).
   */
  useEffect(() => {
    if (audioContainerRef.current && !audioContainerRef.current.contains(audioController.element)) {
      audioContainerRef.current.appendChild(audioController.element);
    }
  }, []);

  /**
   * Обновляем CSS переменную --progress-width для визуального отображения прогресса.
   * Обновляем только если пользователь НЕ перематывает трек вручную (isSeeking = false).
   */
  useEffect(() => {
    if (progressInputRef.current && !isSeeking) {
      progressInputRef.current.style.setProperty('--progress-width', `${progress}%`);
    }
  }, [progress, isSeeking]);

  /**
   * Управление анимацией обложки альбома при play/pause и смене трека.
   * Используем прямую работу с DOM через classList чтобы избежать ненужных ре-рендеров.
   *
   * ВАЖНО:
   * - При первом рендере или смене трека синхронизируем класс с текущим isPlaying БЕЗ анимации (синхронно)
   * - При изменении isPlaying (play/pause) обновляем класс С анимацией
   * Это предотвращает анимацию увеличения при смене трека на паузе.
   */
  const [coverAnimationClass, setCoverAnimationClass] = useState<string>(() =>
    isPlaying ? 'player__cover--playing' : 'player__cover--paused'
  );

  useEffect(() => {
    const expectedClass = isPlaying ? 'player__cover--playing' : 'player__cover--paused';
    setCoverAnimationClass(expectedClass);
    prevIsPlayingRef.current = isPlaying;
    prevTrackIndexRef.current = currentTrackIndex;
  }, [isPlaying, currentTrackIndex]);

  useEffect(() => {
    if (isPlaying) {
      suppressActiveLineRef.current = false;
    }
  }, [isPlaying]);

  useEffect(() => {
    const wasPlaying = previousPlaybackStateRef.current;
    previousPlaybackStateRef.current = isPlaying;

    if (!wasPlaying || isPlaying) {
      return;
    }

    if (repeat !== 'none') {
      return;
    }

    if (playlist.length === 0) {
      return;
    }

    const isLastTrack = currentTrackIndex === playlist.length - 1;
    if (!isLastTrack) {
      return;
    }

    const hasDuration = Number.isFinite(time.duration) && time.duration > 0;
    const reachedEnd = (hasDuration && time.current >= time.duration - 0.5) || progress >= 99.5;

    if (!reachedEnd) {
      return;
    }

    resetLyricsViewToStart();

    audioController.setCurrentTime(0);

    const timeContainer = timeDisplayRef.current;
    if (timeContainer) {
      const fragment = document.createDocumentFragment();

      const currentSpan = document.createElement('span');
      currentSpan.className = 'player__time-current';
      currentSpan.textContent = formatTimerValue(0);

      const remainingSpan = document.createElement('span');
      remainingSpan.className = 'player__time-remaining';
      remainingSpan.textContent = formatTimerValue(hasDuration ? time.duration : NaN);

      fragment.appendChild(currentSpan);
      fragment.appendChild(remainingSpan);
      timeContainer.replaceChildren(fragment);
    }

    if (hasDuration) {
      dispatch(playerActions.setTime({ current: 0, duration: time.duration }));
    } else {
      dispatch(playerActions.setTime({ current: 0, duration: NaN }));
    }
    dispatch(playerActions.setProgress(0));
  }, [
    isPlaying,
    repeat,
    playlist.length,
    currentTrackIndex,
    time,
    progress,
    resetLyricsViewToStart,
    dispatch,
  ]);

  /**
   * Форматирует время в секундах в строку вида "MM:SS".
   * Мемоизируем чтобы не создавать функцию заново при каждом рендере.
   */
  const formatTime = useCallback((time: number) => {
    return formatTimerValue(time);
  }, []);

  // Управление контролами плеера
  const { showControls, scheduleControlsHide, resetInactivityTimer } = usePlayerControls({
    isCoarsePointerDevice,
    showLyrics,
    isPlaying,
    globalShowLyrics,
    setControlsVisible,
    controlsVisibleRef,
    inactivityTimerRef,
    suppressScrollHandlingUntilRef,
    controlsVisibilityCooldownUntilRef,
    lastResetTimestampRef,
    INACTIVITY_TIMEOUT,
  });

  // Навигация по трекам
  const { togglePlayPause, nextTrack, prevTrack } = useTrackNavigation({
    playlist,
    time,
    resetInactivityTimer,
  });

  // Обработка перемотки при удержании кнопок
  const { handleRewindStart, handleRewindEnd, handleRewindClick, isRewindingActive } = useRewind({
    isPlaying,
    time,
    progressInputRef,
    isSeekingRef,
    seekProtectionUntilRef,
    showControls,
  });

  /**
   * Обработчик изменения позиции слайдера прогресса (перемотка трека).
   * Вызывается пока пользователь перетаскивает слайдер.
   *
   * Что делает:
   * 1. Преобразует процент (0-100) в секунды
   * 2. Устанавливает флаг isSeeking = true (блокирует автообновление прогресса)
   * 3. Обновляет текущее время в стейте
   * 4. Обновляет CSS переменную для визуального отображения
   */
  // Обработка перемотки трека (seek)
  const { handleLineClick, handleProgressChange, handleSeekEnd } = useSeek({
    isPlaying,
    time,
    progressInputRef,
    isSeekingRef,
    seekProtectionUntilRef,
    suppressActiveLineRef,
    userScrollTimestampRef,
    isUserScrollingRef,
    setLyricsOpacityMode,
    resetInactivityTimer,
  });

  /**
   * Обработчик изменения громкости.
   * Вызывается когда пользователь перемещает слайдер громкости.
   * Обновляет громкость в стейте и CSS переменную для визуального отображения.
   */
  const handleVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = Number(event.target.value);
      dispatch(playerActions.setVolume(newVolume));
      event.target.style.setProperty('--volume-progress-width', `${newVolume}%`);
      // Сбрасываем таймер бездействия при взаимодействии с громкостью
      resetInactivityTimer();
    },
    [dispatch, resetInactivityTimer]
  );

  /**
   * Обработчик извлечения цветов из обложки альбома.
   * Вызывается когда компонент AlbumCover извлекает доминантный цвет и палитру из изображения.
   *
   * Что делает:
   * 1. Проверяет что цвета ещё не установлены для этого альбома (предотвращает повторные вызовы)
   * 2. Устанавливает флаг что цвета установлены
   * 3. Создаёт градиент из доминантного цвета и 7-го цвета палитры и передаёт его в родительский компонент
   *    для установки фона попапа с плеером
   */
  const handleColorsExtracted = useCallback(
    ({ dominant, palette }: { dominant: string; palette: string[] }) => {
      if (bgColorSetForAlbumRef.current === albumId) {
        return;
      }

      bgColorSetForAlbumRef.current = albumId;
      const gradientColor = `linear-gradient(var(--rotate, 132deg), ${dominant}, ${palette[6] || dominant})`;
      setBgColor(gradientColor);
    },
    [albumId, setBgColor]
  );

  /**
   * Очищаем кеш изображений при смене альбома.
   * Это нужно чтобы гарантировать переизвлечение цветов для нового альбома.
   * ВАЖНО: НЕ очищаем кеш при размонтировании компонента, только при смене альбома.
   */
  useEffect(() => {
    if (coverKey) {
      clearImageColorCache(coverKey);
    }
    // Не делаем cleanup - кеш должен оставаться для следующего открытия попапа
  }, [albumId, coverKey]);

  /**
   * Мемоизируем компонент обложки альбома.
   * Это предотвращает ненужные ре-рендеры когда другие части компонента обновляются.
   * Обложка пересоздаётся только если изменяются её пропсы (img, fullName, albumId, onColorsExtracted).
   *
   * ВАЖНО: key используется только для идентификации альбома, не для пересоздания при showLyrics.
   */
  const memoizedAlbumCover = useMemo(
    () => (
      <AlbumCover
        key={`album-cover-${albumId}`}
        img={coverKey}
        userId={albumMeta.userId ?? undefined}
        fullName={coverFullName}
        onColorsExtracted={handleColorsExtracted}
      />
    ),
    [albumId, coverKey, albumMeta.userId, coverFullName, handleColorsExtracted]
  );

  /**
   * Сбрасываем флаг установки цвета фона когда меняется альбом.
   * Это нужно чтобы цвета установились заново для нового альбома.
   */
  useEffect(() => {
    // Сбрасываем флаг для нового альбома
    bgColorSetForAlbumRef.current = null;
  }, [albumId]);

  // Canonical TrackLyricsBundle from trackLyricsSlice only (playlist no longer carries lyrics)
  const lyricsBundle = useLyricsContent({
    currentTrack,
    albumId,
    lang,
    duration: time.duration,
    setSyncedLyrics,
    setPlainLyricsContent,
    setAuthorshipText,
    setCurrentLineIndex,
    setIsLoadingSyncedLyrics,
    setHasSyncedLyricsAvailable,
  });

  /**
   * Сброс состояния при смене трека.
   * Сбрасываем режим прозрачности, позицию прокрутки и другие флаги.
   * Авто-выключение текста для треков без текста выполняется отдельным эффектом по результатам useLyricsContent.
   */
  useEffect(() => {
    if (!currentTrack) {
      setShowLyrics(false);
      prevTrackIdRef.current = null;
      userScrolledToEndRef.current = false;
      setControlsVisible(true);
      showControls();
      return;
    }

    // Проверяем, изменился ли трек
    const currentTrackId = currentTrack.id;
    const trackChanged = prevTrackIdRef.current !== currentTrackId;

    // Если трек не изменился, не делаем ничего
    if (!trackChanged) {
      return;
    }

    // Обновляем ref для следующей проверки
    prevTrackIdRef.current = currentTrackId;
    // Сбрасываем режим прозрачности при смене трека
    setLyricsOpacityMode((prevMode: typeof lyricsOpacityMode) => {
      debugLog('🔍 Track changed, resetting opacity mode from:', prevMode);
      return 'normal';
    });
    // Сбрасываем сохраненную позицию прокрутки при смене трека (только при реальной смене трека)
    savedScrollTopRef.current = 0;
    // Сбрасываем флаг восстановления позиции при смене трека
    justRestoredScrollRef.current = false;
    // Сбрасываем флаг прокрутки до конца при смене трека
    userScrolledToEndRef.current = false;
    showControls();
  }, [currentTrack, albumId, lang, showControls]);

  // Авто-выключение текста для треков без текста (по результатам useLyricsContent)
  useEffect(() => {
    if (
      !isLoadingSyncedLyrics &&
      !syncedLyrics &&
      !plainLyricsContent &&
      currentTrack &&
      showLyrics
    ) {
      setShowLyrics(false);
    }
  }, [isLoadingSyncedLyrics, syncedLyrics, plainLyricsContent, currentTrack, showLyrics]);

  // Определяем текущую строку на основе времени воспроизведения
  const currentLineIndexComputed = useCurrentLineIndex({
    syncedLyrics,
    time,
    isPlaying,
    suppressActiveLineRef,
  });

  // Синхронизируем вычисленное значение с состоянием для совместимости
  useEffect(() => {
    setCurrentLineIndex(currentLineIndexComputed);
  }, [currentLineIndexComputed]);

  // Сохранение и восстановление позиции прокрутки при переключении режима отображения
  useLyricsScrollRestore({
    showLyrics,
    lyricsContainerRef,
    savedScrollTopRef,
    justRestoredScrollRef,
    userScrollTimestampRef,
    lastScrollTopRef,
    pendingScrollTopRef,
    time,
  });

  // Обработка ручной прокрутки пользователя
  useLyricsManualScroll({
    showLyrics,
    lyricsContainerRef,
    isCoarsePointerDevice,
    savedScrollTopRef,
    justRestoredScrollRef,
    userScrollTimestampRef,
    lastScrollTopRef,
    pendingScrollTopRef,
    lastScrollDirectionRef,
    manualScrollRafRef,
    userScrolledToEndRef,
    isUserScrollingRef,
    suppressScrollHandlingUntilRef,
    controlsVisibilityCooldownUntilRef,
    seekProtectionUntilRef,
    isSeekingRef,
    smoothScrollAnimationRef,
    controlsVisibleRef,
    inactivityTimerRef,
    scrollListenerJustAddedRef,
    setLyricsOpacityMode,
    setControlsVisible,
    showControls,
    resetInactivityTimer,
    scheduleControlsHide,
  });

  // Автоскролл к активной строке
  useLyricsAutoScroll({
    showLyrics,
    syncedLyrics,
    lyricsContainerRef,
    currentLineIndexComputed,
    lineRefs,
    justRestoredScrollRef,
    userScrollTimestampRef,
    userScrolledToEndRef,
    isUserScrollingRef,
    lastAutoScrollTimeRef,
    smoothScrollAnimationRef,
    autoScrollRafRef,
    isIOSDevice,
    time,
    smoothScrollTo,
  });

  /**
   * Очищаем таймеры при размонтировании компонента.
   */
  useEffect(() => {
    return () => {
      // Очищаем анимацию плавного скролла
      if (smoothScrollAnimationRef.current !== null) {
        cancelAnimationFrame(smoothScrollAnimationRef.current);
        smoothScrollAnimationRef.current = null;
      }
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      userScrolledToEndRef.current = false;
    };
  }, []);

  // Переключатели режимов плеера
  const { toggleLyrics, toggleShuffle, toggleRepeat } = usePlayerToggles({
    showLyrics,
    setShowLyrics,
    suppressScrollHandlingUntilRef,
    ignoreActivityUntilRef,
  });

  const hasPlainLyrics = !!plainLyricsContent;

  // Sync availability from canonical bundle (same source as useLyricsContent / trackLyricsSlice)
  const hasSyncedLyricsHint = lyricsBundle?.state === 'synced';

  const hasTextToShow = hasSyncedLyricsAvailable || hasSyncedLyricsHint || hasPlainLyrics;

  // Ref для прямого доступа к элементу отображения времени
  const timeDisplayRef = useRef<HTMLDivElement | null>(null);

  // Управление отображением времени трека
  const { renderTimeDisplay } = useTimeDisplay({
    time,
    timeDisplayRef,
    formatTime,
    trackMetadataDuration: currentTrack?.duration,
  });

  // Отслеживание активности пользователя (мышь, клавиатура, тач)
  // ВАЖНО: таймер работает только в режиме показа текста И только при воспроизведении
  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container) return;

    // Обработчики для различных типов активности
    const handleActivity = (event: Event) => {
      const eventType = event.type;
      const now = Date.now();

      if (now < ignoreActivityUntilRef.current) {
        trackDebug('activity:ignored', { eventType, reason: 'cooldown' });
        return;
      }

      if (eventType === 'mousemove') {
        if (isCoarsePointerDevice) {
          return;
        }
        if (now - lastMouseMoveTimestampRef.current < 400) {
          return;
        }
        lastMouseMoveTimestampRef.current = now;
      }

      if ((eventType === 'mousemove' || eventType === 'touchmove') && !controlsVisibleRef.current) {
        return;
      }

      trackDebug('activity:processed', { eventType });
      resetInactivityTimer();
    };

    // Добавляем обработчики событий только если режим текста включен
    if (showLyrics) {
      container.addEventListener('mousemove', handleActivity, { passive: true });
      container.addEventListener('mousedown', handleActivity, { passive: true });
      if (!isCoarsePointerDevice) {
        container.addEventListener('touchstart', handleActivity, { passive: true });
        container.addEventListener('touchmove', handleActivity, { passive: true });
      }
      document.addEventListener('keydown', handleActivity, { passive: true });

      // Инициализируем таймер только если трек играет
      if (isPlaying) {
        resetInactivityTimer();
      }
    }

    return () => {
      container.removeEventListener('mousemove', handleActivity);
      container.removeEventListener('mousedown', handleActivity);
      if (!isCoarsePointerDevice) {
        container.removeEventListener('touchstart', handleActivity);
        container.removeEventListener('touchmove', handleActivity);
      }
      document.removeEventListener('keydown', handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [resetInactivityTimer, showLyrics, isPlaying, isCoarsePointerDevice]);

  // Обработка изменения состояния: показываем контролы при паузе или выходе из режима текста
  useEffect(() => {
    // Если трек поставили на паузу ИЛИ вышли из режима текста — сразу показываем контролы
    if (!showLyrics || !isPlaying) {
      showControls();
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    } else if (showLyrics && isPlaying) {
      // Если вошли в режим текста И трек играет — запускаем таймер
      resetInactivityTimer();
    }
  }, [showLyrics, isPlaying, resetInactivityTimer, showControls]);

  const coverWrapperClassName = `player__cover-wrapper${showLyrics ? ' player__cover-wrapper--lyrics' : ''}`;
  const coverClassName = `player__cover ${coverAnimationClass}${showLyrics ? ' player__cover--clickable' : ''}`;
  const coverInteractiveProps = useMemo<React.HTMLAttributes<HTMLDivElement>>(() => {
    if (!showLyrics) {
      return {};
    }

    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': 'Скрыть текст',
      onClick: () => {
        toggleLyrics();
        resetInactivityTimer();
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleLyrics();
          resetInactivityTimer();
        }
      },
    };
  }, [showLyrics, toggleLyrics, resetInactivityTimer]);

  const shouldShowVolumeControl = !isCoarsePointerDevice;

  const playerClassName = [
    'player',
    showLyrics ? 'player--lyrics-visible' : '',
    !controlsVisible ? 'player--controls-hidden' : '',
    isLandscapeBlocked ? 'player--orientation-blocked' : '',
    !shouldShowVolumeControl ? 'player--no-volume' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shouldRenderSyncedLyrics = showLyrics && !!(syncedLyrics && syncedLyrics.length > 0);

  // Если есть шанс, что у трека есть синхра — предпочитаем skeleton, а не plain
  // ✅ ВАЖНО: не используем hasSyncedLyricsHint, если загрузка завершена и синхры нет
  // (иначе на проде будет показываться скелетон вместо plain текста)
  const shouldPreferSynced =
    hasSyncedLyricsAvailable || (isLoadingSyncedLyrics && hasSyncedLyricsHint);

  const shouldRenderSkeleton = showLyrics && !shouldRenderSyncedLyrics && shouldPreferSynced;

  const shouldRenderPlainLyrics =
    showLyrics && !shouldRenderSyncedLyrics && !shouldPreferSynced && !!plainLyricsContent;

  /** Slug for public profile link: album meta (e.g. Home/Universe3D) or `?artist=` on current URL (album pages). */
  const artistSlugForProfileLink = useMemo(() => {
    const fromMeta = albumMeta.publicSlug?.trim();
    if (fromMeta) return fromMeta;
    const fromSearch = new URLSearchParams(location.search).get('artist')?.trim();
    return fromSearch || null;
  }, [albumMeta.publicSlug, location.search]);

  const albumIdForLink = useMemo(() => {
    const fromMeta = albumMeta.albumId?.trim();
    if (fromMeta) return fromMeta;
    const fallback = albumId.trim();
    return fallback || null;
  }, [albumMeta.albumId, albumId]);

  const albumTitle = albumMeta.album?.trim() || '';

  const handleAlbumOpen = useCallback(() => {
    if (!albumIdForLink) return;
    const path = buildPublicAlbumPagePath(lang, albumIdForLink, artistSlugForProfileLink ?? '');
    const { pathname, search } = new URL(path, 'http://local');
    const target = { pathname, search: search || undefined };
    dispatch(playerActions.setSourceLocation(target));
    navigate(path, { replace: false });
  }, [albumIdForLink, artistSlugForProfileLink, dispatch, lang, navigate]);

  const handleArtistProfileOpen = useCallback(() => {
    const slug = artistSlugForProfileLink;
    if (!slug) return;
    const path = buildArtistPagePath(lang, slug);
    const { pathname, search } = new URL(path, 'http://local');
    const target = { pathname, search: search || undefined };
    sessionStorage.setItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, slug);
    // Keep PlayerShell close flow consistent: when dialog closes, it will navigate to sourceLocation.
    dispatch(playerActions.setSourceLocation(target));
    navigate(path, { replace: false });
  }, [artistSlugForProfileLink, dispatch, lang, navigate]);

  useEffect(() => {
    if (!isFullScreenPlayer) {
      return;
    }
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    showControls();
  }, [isFullScreenPlayer, showControls]);

  return (
    <div ref={playerContainerRef} className={playerClassName}>
      {isLandscapeBlocked && (
        <div className="player__orientation-lock" role="alert" aria-live="assertive">
          <div className="player__orientation-lock-content">
            <svg
              className="player__orientation-lock-icon"
              width="72"
              height="72"
              viewBox="0 0 64 64"
              role="img"
              aria-hidden="true"
              focusable="false"
            >
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M32 10a22 22 0 1 0 22 22" />
                <path d="M54 10h-12" />
                <path d="M54 10v12" />
              </g>
            </svg>
            <p className="player__orientation-lock-message">
              Поверните устройство в портретный режим, чтобы продолжить прослушивание.
            </p>
          </div>
        </div>
      )}
      {/* Обложка альбома и информация о треке */}
      <div className={coverWrapperClassName}>
        <div className={coverClassName.trim()} {...coverInteractiveProps}>
          {memoizedAlbumCover}
        </div>
        <div className="player__track-info">
          <h2>{currentTrack?.title || 'Unknown Track'}</h2>
          <p
            className={albumIdForLink ? 'player__album-link' : 'player__album-name'}
            role={albumIdForLink ? 'link' : undefined}
            tabIndex={albumIdForLink ? 0 : undefined}
            onClick={
              albumIdForLink
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAlbumOpen();
                  }
                : undefined
            }
            onKeyDown={
              albumIdForLink
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAlbumOpen();
                    }
                  }
                : undefined
            }
          >
            {albumTitle || 'Unknown Album'}
          </p>
          <p
            className={artistSlugForProfileLink ? 'player__artist-link' : 'player__artist-name'}
            role={artistSlugForProfileLink ? 'link' : undefined}
            tabIndex={artistSlugForProfileLink ? 0 : undefined}
            onClick={
              artistSlugForProfileLink
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleArtistProfileOpen();
                  }
                : undefined
            }
            onKeyDown={
              artistSlugForProfileLink
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleArtistProfileOpen();
                    }
                  }
                : undefined
            }
          >
            {siteArtistUiLabel(albumMeta.artist ?? '', 'Unknown Artist')}
          </p>
        </div>
      </div>

      {/* Текст песни */}
      {showLyrics &&
        (shouldRenderSyncedLyrics || shouldRenderPlainLyrics || shouldRenderSkeleton) && (
          <div
            className={`player__synced-lyrics${shouldRenderSyncedLyrics ? '' : ' player__synced-lyrics--plain'}`}
            ref={lyricsContainerRef}
            data-opacity-mode={shouldRenderSyncedLyrics ? lyricsOpacityMode : undefined}
            data-platform={shouldRenderSyncedLyrics ? (isIOSDevice ? 'ios' : 'default') : undefined}
          >
            {shouldRenderSyncedLyrics && syncedLyrics ? (
              <>
                {syncedLyrics.map((line: SyncedLyricsLine, index: number) => {
                  const isActive = currentLineIndexComputed === index;
                  const distance =
                    currentLineIndexComputed !== null
                      ? Math.abs(index - currentLineIndexComputed)
                      : null;

                  const placeholderData = (() => {
                    const timeValue = time.current;
                    const firstLine = syncedLyrics[0];

                    if (index === 0 && firstLine.startTime > 0) {
                      if (timeValue < firstLine.startTime) {
                        const normalizedTime = Math.max(0, timeValue);
                        const progress = Math.max(
                          0,
                          Math.min(1, normalizedTime / firstLine.startTime)
                        );
                        return { show: true, progress };
                      }
                      return { show: false, progress: 0 };
                    }

                    if (index > 0) {
                      const prevLine = syncedLyrics[index - 1];
                      if (prevLine.endTime !== undefined) {
                        if (prevLine.endTime === line.startTime) {
                          return { show: false, progress: 0 };
                        }

                        if (timeValue >= prevLine.endTime - 0.5 && timeValue < line.startTime) {
                          const intervalDuration = line.startTime - prevLine.endTime;
                          const elapsed = Math.max(0, timeValue - prevLine.endTime);
                          const progress =
                            intervalDuration > 0 ? Math.min(1, elapsed / intervalDuration) : 0;
                          return { show: true, progress };
                        }
                      }
                    }

                    return { show: false, progress: 0 };
                  })();

                  return (
                    <React.Fragment key={`line-fragment-${index}`}>
                      {placeholderData.show && (
                        <div
                          key={`placeholder-${index}`}
                          className="player__synced-lyrics-line player__synced-lyrics-line--placeholder"
                          style={
                            {
                              '--placeholder-progress': placeholderData.progress,
                            } as React.CSSProperties
                          }
                        >
                          <span className="player__lyrics-placeholder-dot" data-dot-index="0">
                            ·
                          </span>
                          <span className="player__lyrics-placeholder-dot" data-dot-index="1">
                            ·
                          </span>
                          <span className="player__lyrics-placeholder-dot" data-dot-index="2">
                            ·
                          </span>
                        </div>
                      )}

                      <div
                        key={index}
                        ref={(el) => {
                          if (el) {
                            lineRefs.current.set(index, el);
                          } else {
                            lineRefs.current.delete(index);
                          }
                        }}
                        className={`player__synced-lyrics-line ${isActive ? 'player__synced-lyrics-line--active' : ''} ${authorshipText && line.text === authorshipText ? 'player__synced-lyrics-line--authorship' : ''}`}
                        data-distance={
                          distance !== null && !isActive ? Math.min(distance, 10) : undefined
                        }
                        onClick={() => {
                          handleLineClick(line.startTime);
                          resetInactivityTimer();
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleLineClick(line.startTime);
                            resetInactivityTimer();
                          }
                        }}
                        aria-label={`Перемотать к ${line.text}`}
                      >
                        {authorshipText && line.text === authorshipText
                          ? `${ui?.dashboard?.authorship ?? 'Авторство: '}${line.text}`
                          : line.text}
                      </div>
                    </React.Fragment>
                  );
                })}

                {(() => {
                  const timeValue = time.current;
                  const lastLine = syncedLyrics[syncedLyrics.length - 1];
                  const showPlaceholderAfter =
                    lastLine.endTime !== undefined &&
                    timeValue >= lastLine.endTime - 0.5 &&
                    timeValue < time.duration;

                  if (!showPlaceholderAfter || lastLine.endTime === undefined) return null;

                  const intervalDuration = time.duration - lastLine.endTime;
                  const elapsed = Math.max(0, timeValue - lastLine.endTime);
                  const progress =
                    intervalDuration > 0 ? Math.min(1, elapsed / intervalDuration) : 0;

                  return (
                    <div
                      key="placeholder-after"
                      className="player__synced-lyrics-line player__synced-lyrics-line--placeholder"
                      style={
                        {
                          '--placeholder-progress': progress,
                        } as React.CSSProperties
                      }
                    >
                      <span className="player__lyrics-placeholder-dot" data-dot-index="0">
                        ·
                      </span>
                      <span className="player__lyrics-placeholder-dot" data-dot-index="1">
                        ·
                      </span>
                      <span className="player__lyrics-placeholder-dot" data-dot-index="2">
                        ·
                      </span>
                    </div>
                  );
                })()}
              </>
            ) : shouldRenderSkeleton ? (
              <div className="player__lyrics-skeleton">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div
                    key={index}
                    className="player__lyrics-skeleton-line"
                    style={{
                      width: `${Math.random() * 30 + 60}%`,
                      animationDelay: `${index * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="player__plain-lyrics">{plainLyricsContent ?? ''}</div>
            )}
          </div>
        )}

      {/* Прогресс воспроизведения: слайдер и время */}
      <div
        className={`player__progress-container ${!controlsVisible ? 'player__progress-container--hidden' : ''}`}
      >
        <div className="player__progress-bar">
          <input
            ref={progressInputRef}
            type="range"
            value={progress}
            min="0"
            max="100"
            onChange={handleProgressChange}
            onInput={handleProgressChange} // onInput срабатывает раньше onChange и мгновенно
            onMouseUp={handleSeekEnd} // для десктопа
            onTouchEnd={handleSeekEnd} // для мобильных
            onMouseDown={resetInactivityTimer} // Сбрасываем таймер при начале взаимодействия
            onTouchStart={resetInactivityTimer} // Сбрасываем таймер при начале взаимодействия
          />
        </div>
        {/* Время: текущее и оставшееся */}
        {/* ВАЖНО: используем один контейнер для обоих значений */}
        {/* Обновление через innerHTML гарантирует абсолютную атомарность - оба значения обновляются за одну операцию */}
        <div ref={timeDisplayRef} className="player__time-container"></div>
      </div>

      {/* Кнопки управления: предыдущий трек, play/pause, следующий трек */}
      <div className={`player__controls ${!controlsVisible ? 'player__controls--hidden' : ''}`}>
        <button
          type="button"
          className="player__transport-button"
          onMouseDown={(e) => {
            e.preventDefault(); // Предотвращаем focus и клик при удержании
            handleRewindStart('backward');
            resetInactivityTimer();
          }}
          onMouseUp={() => handleRewindEnd('backward', prevTrack)}
          onMouseLeave={() => handleRewindEnd('backward', prevTrack)}
          onTouchStart={(e) => {
            e.preventDefault(); // Предотвращаем клик при touch
            handleRewindStart('backward');
            resetInactivityTimer();
          }}
          onTouchEnd={(e) => {
            e.preventDefault(); // Предотвращаем двойной вызов
            handleRewindEnd('backward', prevTrack);
          }}
          onClick={(e) => {
            // ПРОСТАЯ ЛОГИКА: Если перемотка работает (флаг блокировки установлен) - блокируем клик
            // Проверяем ДО вызова handleRewindClick
            if (isRewindingActive()) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Если перемотка НЕ работает - переключаем трек
            handleRewindClick('backward', prevTrack);
          }}
        >
          <SkipBack
            {...playerTransportIconProps(PLAYER_TRANSPORT_ICON_SIZE, {
              className: 'player__transport-icon player__transport-icon--back',
            })}
          />
        </button>
        <button
          type="button"
          className="player__transport-button player__transport-button--play"
          onClick={() => {
            togglePlayPause();
            resetInactivityTimer();
          }}
        >
          {isPlaying ? (
            <Pause
              {...playerTransportIconProps(PLAYER_TRANSPORT_PLAY_ICON_SIZE, {
                className: 'player__transport-icon',
              })}
            />
          ) : (
            <Play
              {...playerTransportIconProps(PLAYER_TRANSPORT_PLAY_ICON_SIZE, {
                className: 'player__transport-icon player__transport-icon--play',
              })}
            />
          )}
        </button>
        <button
          type="button"
          className="player__transport-button"
          onMouseDown={(e) => {
            e.preventDefault(); // Предотвращаем focus и клик при удержании
            handleRewindStart('forward');
            resetInactivityTimer();
          }}
          onMouseUp={() => handleRewindEnd('forward', nextTrack)}
          onMouseLeave={() => handleRewindEnd('forward', nextTrack)}
          onTouchStart={(e) => {
            e.preventDefault(); // Предотвращаем клик при touch
            handleRewindStart('forward');
            resetInactivityTimer();
          }}
          onTouchEnd={(e) => {
            e.preventDefault(); // Предотвращаем двойной вызов
            handleRewindEnd('forward', nextTrack);
          }}
          onClick={(e) => {
            // ПРОСТАЯ ЛОГИКА: Если перемотка работает (флаг блокировки установлен) - блокируем клик
            // Проверяем ДО вызова handleRewindClick
            if (isRewindingActive()) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            // Если перемотка НЕ работает - переключаем трек
            handleRewindClick('forward', nextTrack);
          }}
        >
          <SkipForward
            {...playerTransportIconProps(PLAYER_TRANSPORT_ICON_SIZE, {
              className: 'player__transport-icon player__transport-icon--forward',
            })}
          />
        </button>
      </div>

      {/* Контрол громкости (скрыт на мобильных устройствах) */}
      {shouldShowVolumeControl ? (
        <div
          className={`player__volume-control ${!controlsVisible ? 'player__volume-control--hidden' : ''}`}
        >
          <span className="player__volume-icon" aria-hidden>
            <Volume {...playerIconProps(PLAYER_VOLUME_ICON_SIZE)} />
          </span>
          <input type="range" value={volume} min="0" max="100" onChange={handleVolumeChange} />
          <span className="player__volume-icon" aria-hidden>
            <Volume2 {...playerIconProps(PLAYER_VOLUME_ICON_SIZE)} />
          </span>
        </div>
      ) : null}

      {/* Контрол переключения текста и режимов воспроизведения */}
      <div
        className={`player__secondary-controls ${!controlsVisible ? 'player__secondary-controls--hidden' : ''}`}
      >
        {/* Кнопка перемешивания треков */}
        <button
          type="button"
          onClick={() => {
            toggleShuffle();
            resetInactivityTimer();
          }}
          className={`player__control-button ${shuffle ? 'player__control-button--active' : ''}`}
          aria-label={shuffle ? 'Выключить перемешивание' : 'Включить перемешивание'}
        >
          <span className="player__control-button-icon" aria-hidden>
            <Shuffle {...playerIconProps(PLAYER_SECONDARY_ICON_SIZE)} />
          </span>
        </button>

        {/* Кнопка зацикливания треков (три состояния: none → all → one → none) */}
        <button
          type="button"
          onClick={() => {
            toggleRepeat();
            resetInactivityTimer();
          }}
          className={`player__control-button ${repeat !== 'none' ? 'player__control-button--active' : ''}`}
          aria-label={
            repeat === 'none'
              ? 'Включить зацикливание плейлиста'
              : repeat === 'all'
                ? 'Зациклить один трек'
                : 'Выключить зацикливание'
          }
        >
          <span className="player__control-button-icon" aria-hidden>
            {repeat === 'one' ? (
              <Repeat1 {...playerIconProps(PLAYER_SECONDARY_ICON_SIZE)} />
            ) : (
              <Repeat {...playerIconProps(PLAYER_SECONDARY_ICON_SIZE)} />
            )}
          </span>
        </button>

        {/* Кнопка переключения текста */}
        <button
          type="button"
          onClick={() => {
            toggleLyrics();
            resetInactivityTimer();
          }}
          disabled={!hasTextToShow}
          className={`player__lyrics-toggle ${showLyrics ? 'player__lyrics-toggle--active' : ''}`}
          aria-label={showLyrics ? 'Скрыть текст' : 'Показать текст'}
          aria-disabled={!hasTextToShow}
        >
          <span className="player__lyrics-toggle-icon" aria-hidden>
            <MessageSquareQuote {...playerIconProps(PLAYER_SECONDARY_ICON_SIZE)} />
          </span>
        </button>
      </div>

      {/* Невидимый контейнер для прикрепления audio элемента к DOM */}
      <div ref={audioContainerRef} style={{ display: 'none' }} />
    </div>
  );
}
