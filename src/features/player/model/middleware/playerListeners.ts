// src/features/player/model/middleware/playerListeners.ts
/**
 * Middleware для обработки побочных эффектов плеера.
 * Здесь мы "слушаем" действия Redux и выполняем соответствующие операции с аудио-элементом.
 * Это позволяет вынести всю логику управления аудио из компонентов в слой модели.
 */
import {
  createListenerMiddleware,
  isAnyOf,
  type ListenerEffectAPI,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { audioController } from '@features/player/model/lib/audioController';
import { playerActions } from '@features/player/model/slice/playerSlice';
import type { RootState, AppDispatch } from '@shared/model/appStore/types';
import { gaEvent } from '@shared/lib/analytics';
import {
  findAdjacentPlayableIndex,
  isTrackPlaybackBlocked,
} from '@shared/lib/tracks/trackPlayback';

const isUsableMediaDuration = (d: number): boolean => Number.isFinite(d) && d > 0 && d !== Infinity;

/**
 * HTMLAudioElement.duration иногда NaN/Infinity до полной декодировки потока.
 * Используем длительность из метаданных плейлиста (API), когда элемент ещё не отдаёт валидное значение.
 */
const getEffectiveTrackDuration = (
  el: HTMLAudioElement,
  playlistTrackDurationSeconds?: number
): number => {
  if (isUsableMediaDuration(el.duration)) {
    return el.duration;
  }
  if (
    playlistTrackDurationSeconds !== undefined &&
    isUsableMediaDuration(playlistTrackDurationSeconds)
  ) {
    return playlistTrackDurationSeconds;
  }
  return NaN;
};

const ENDED_POSITION_TOLERANCE_SECONDS = 0.5;

/** Same duration sources as timeupdate, plus Redux time when the element has not decoded duration yet. */
const resolveEndedTrackDuration = (
  el: HTMLAudioElement,
  playlistTrackDurationSeconds?: number,
  reduxDuration?: number
): number => {
  const effective = getEffectiveTrackDuration(el, playlistTrackDurationSeconds);
  if (isUsableMediaDuration(effective)) {
    return effective;
  }
  if (reduxDuration !== undefined && isUsableMediaDuration(reduxDuration)) {
    return reduxDuration;
  }
  return NaN;
};

/**
 * True when playback reached the natural end (not a spurious ended at t≈0).
 * Uses element time, Redux time/progress, and effective duration from metadata when needed.
 */
const isNaturalTrackEnd = (
  el: HTMLAudioElement,
  playlistTrackDurationSeconds: number | undefined,
  reduxTime: { current: number; duration: number } | undefined,
  progress: number | undefined
): boolean => {
  const duration = resolveEndedTrackDuration(el, playlistTrackDurationSeconds, reduxTime?.duration);
  if (!isUsableMediaDuration(duration)) {
    return false;
  }

  const { currentTime } = el;
  const reduxCurrent = reduxTime?.current ?? NaN;
  const atEndByElement =
    Number.isFinite(currentTime) && currentTime >= duration - ENDED_POSITION_TOLERANCE_SECONDS;
  const atEndByRedux =
    Number.isFinite(reduxCurrent) && reduxCurrent >= duration - ENDED_POSITION_TOLERANCE_SECONDS;
  const atEndByProgress =
    typeof progress === 'number' && Number.isFinite(progress) && progress >= 99.5;

  if (!atEndByElement && !atEndByRedux && !atEndByProgress) {
    return false;
  }

  if (
    Number.isFinite(currentTime) &&
    currentTime <= ENDED_POSITION_TOLERANCE_SECONDS &&
    !atEndByRedux &&
    !atEndByProgress
  ) {
    return false;
  }

  return true;
};

// Создаём middleware для слушателей
type PlayerListenerApi = ListenerEffectAPI<RootState, AppDispatch>;

export const playerListenerMiddleware = createListenerMiddleware<RootState, AppDispatch>();

/**
 * Вспомогательная функция: устанавливает громкость и запускает воспроизведение.
 * Игнорирует ошибки autoplay (когда браузер блокирует автозапуск).
 */
const tryPlayWithVolume = async (volume: number): Promise<boolean> => {
  audioController.setVolume(volume);
  try {
    await audioController.play();
    return true;
  } catch {
    return false;
  }
};

/**
 * Вспомогательная функция: сбрасывает прогресс и время трека в стейте.
 * Используется при смене трека или плейлиста.
 */
const resetProgress = (api: ListenerEffectAPI<RootState, AppDispatch>) => {
  api.dispatch(playerActions.setProgress(0));
  api.dispatch(playerActions.setTime({ current: 0, duration: NaN }));
};

/**
 * Слушатель для действия play (воспроизведение).
 * Когда диспатчится playerActions.play(), этот код запускает воспроизведение аудио.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.play,
  effect: async (_action, api: PlayerListenerApi) => {
    const state = api.getState();
    const track = state.player.playlist?.[state.player.currentTrackIndex];
    if (isTrackPlaybackBlocked(track) || !String(track?.src ?? '').trim()) {
      api.dispatch(playerActions.pause());
      audioController.pause();
      return;
    }
    const played = await tryPlayWithVolume(state.player.volume);
    if (!played) {
      api.dispatch(playerActions.pause());
    }
  },
});

/**
 * Слушатель для действия pause (пауза).
 * Когда диспатчится playerActions.pause(), останавливает воспроизведение.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.pause,
  effect: () => {
    audioController.pause();
  },
});

/**
 * Слушатель для действия toggle (переключение play/pause).
 * Проверяет текущее состояние и либо запускает, либо останавливает воспроизведение.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.toggle,
  effect: async (_action, api: PlayerListenerApi) => {
    const state = api.getState();
    if (state.player.isPlaying) {
      const played = await tryPlayWithVolume(state.player.volume);
      if (!played) {
        api.dispatch(playerActions.pause());
      }
    } else {
      audioController.pause();
    }
  },
});

/**
 * Слушатель для изменения громкости.
 * При вызове playerActions.setVolume() обновляет громкость аудио-элемента.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.setVolume,
  effect: ({ payload }: PayloadAction<number>) => {
    audioController.setVolume(payload);
  },
});

/**
 * Слушатель для перемотки (seek).
 * При вызове playerActions.setCurrentTime() перематывает трек на указанное время.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.setCurrentTime,
  effect: ({ payload }: PayloadAction<number>) => {
    audioController.setCurrentTime(payload);
  },
});

/**
 * Слушатель для смены текущего трека (по индексу).
 * Загружает новый трек в аудио-элемент, но НЕ запускает его автоматически.
 * Используется когда пользователь просто выбирает трек (например, кликает в списке).
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.setCurrentTrackIndex,
  effect: (_action, api: PlayerListenerApi) => {
    const state = api.getState();
    const track = state.player.playlist?.[state.player.currentTrackIndex];
    const src = track?.src;

    resetProgress(api);

    if (isTrackPlaybackBlocked(track) || !src) {
      audioController.pause();
      audioController.setSource('', false);
      if (state.player.isPlaying) {
        api.dispatch(playerActions.pause());
      }
      return;
    }

    // setSource сам проверит, нужно ли загружать файл
    // Для пустого плейлиста всё равно вызываем, чтобы сбросить источник
    audioController.setSource(src, !!src && state.player.isPlaying);
  },
});

/**
 * Слушатель для переключения на следующий/предыдущий трек.
 * Использует matcher чтобы обработать оба действия (nextTrack и prevTrack) одним кодом.
 * ВАЖНО: если трек играл, то после переключения он продолжит играть.
 * Если трек был на паузе, то новый трек тоже будет на паузе.
 */
playerListenerMiddleware.startListening({
  matcher: isAnyOf(playerActions.nextTrack, playerActions.prevTrack),
  effect: async (action, api: PlayerListenerApi) => {
    const state = api.getState();
    let { playlist = [], currentTrackIndex, isPlaying: wasPlaying, volume } = state.player;
    const shouldContinuePlayback = wasPlaying || autoContinuePlaybackOnAdvance;
    if (autoContinuePlaybackOnAdvance) {
      autoContinuePlaybackOnAdvance = false;
    }
    const delta: 1 | -1 = playerActions.nextTrack.match(action) ? 1 : -1;

    const current = playlist[currentTrackIndex];
    if (isTrackPlaybackBlocked(current)) {
      const nextIdx = findAdjacentPlayableIndex(playlist, currentTrackIndex, delta);
      if (nextIdx === -1) {
        resetProgress(api);
        audioController.pause();
        audioController.setSource('', false);
        api.dispatch(playerActions.pause());
        return;
      }
      api.dispatch(playerActions.setCurrentTrackIndex(nextIdx));
      return;
    }

    const trackSrc = playlist[currentTrackIndex]?.src;

    if (!trackSrc || isTrackPlaybackBlocked(playlist[currentTrackIndex])) {
      resetProgress(api);
      audioController.pause();
      audioController.setSource('', false);
      api.dispatch(playerActions.pause());
      return;
    }

    // ВАЖНО: Сбрасываем флаги при переключении трека через nextTrack/prevTrack
    // Это нужно, чтобы событие ended нового трека могло корректно обработаться
    // Сбрасываем флаги через небольшую задержку, чтобы дать время старому ended событию завершиться
    setTimeout(() => {
      isProcessingEnded = false;
      endedTrackIndex = null;
      isNextTrackPending = false;
      lastNextTrackCallId = null;
    }, 100);

    resetProgress(api);
    audioController.pause();
    audioController.setSource(trackSrc, shouldContinuePlayback);

    if (shouldContinuePlayback) {
      const played = await tryPlayWithVolume(volume);
      if (!played) {
        api.dispatch(playerActions.pause());
      }
    }
  },
});

/**
 * Слушатель для запроса воспроизведения.
 * requestPlay() используется когда нужно запустить трек (например, при открытии плеера).
 * Убеждается что трек загружен и метаданные готовы перед запуском воспроизведения.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.requestPlay,
  effect: async (_action, api: PlayerListenerApi) => {
    const state = api.getState();
    const track = state.player.playlist?.[state.player.currentTrackIndex];

    if (!track?.src || isTrackPlaybackBlocked(track)) return;

    const el = audioController.element;

    // Если источник ещё не установлен (например, только что открыли плеер) — ставим его
    if (!el.src) {
      audioController.setSource(track.src, true);
    }

    // Ждём загрузки метаданных если они еще не загружены
    // readyState: 0 = HAVE_NOTHING, 1 = HAVE_METADATA, 2 = HAVE_CURRENT_DATA, 3 = HAVE_FUTURE_DATA, 4 = HAVE_ENOUGH_DATA
    if (el.readyState < 2) {
      // Ждём загрузки метаданных или хотя бы части данных
      await new Promise<void>((resolve) => {
        let resolved = false;
        const resolveOnce = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        // Слушаем событие loadedmetadata или canplay (когда можно начать воспроизведение)
        const onLoadedMetadata = () => {
          el.removeEventListener('loadedmetadata', onLoadedMetadata);
          el.removeEventListener('canplay', onCanPlay);
          resolveOnce();
        };
        const onCanPlay = () => {
          el.removeEventListener('loadedmetadata', onLoadedMetadata);
          el.removeEventListener('canplay', onCanPlay);
          resolveOnce();
        };

        el.addEventListener('loadedmetadata', onLoadedMetadata);
        el.addEventListener('canplay', onCanPlay);

        // Если событие уже произошло, проверяем готовность
        if (el.readyState >= 2) {
          resolveOnce();
        } else {
          // Таймаут на случай если события не сработают
          setTimeout(resolveOnce, 2000);
        }
      });
    }

    // Теперь запускаем воспроизведение
    api.dispatch(playerActions.play());
  },
});

/**
 * Слушатель для смены плейлиста.
 * Когда диспатчится playerActions.setPlaylist(), сбрасывает прогресс и время трека.
 */
playerListenerMiddleware.startListening({
  actionCreator: playerActions.setPlaylist,
  effect: (_action, api: PlayerListenerApi) => {
    api.cancelActiveListeners();
  },
});

/**
 * Привязывает события HTMLAudioElement к обновлениям Redux стейта.
 * Эта функция вызывается один раз при создании store.
 *
 * События браузера → Redux actions:
 * - timeupdate → обновление времени и прогресса
 * - loadedmetadata → сброс времени при загрузке нового трека
 * - ended → автоматический переход на следующий трек
 * - playing → отправка GA события audio_start
 * - pause → отправка GA события audio_pause
 */
// Храним обработчики событий для возможности их удаления при повторном вызове
let endedHandler: (() => void) | null = null;
let timeupdateHandler: (() => void) | null = null;
let loadedmetadataHandler: (() => void) | null = null;
let durationchangeHandler: (() => void) | null = null;
let playingHandler: (() => void) | null = null;
let pauseHandler: (() => void) | null = null;
let playSyncHandler: (() => void) | null = null;
let nativePauseSyncHandler: (() => void) | null = null;
let errorHandler: (() => void) | null = null;

// Флаг для предотвращения множественных вызовов ended подряд
// Вынесен на уровень модуля, чтобы был доступен и в middleware, и в attachAudioEvents
let isProcessingEnded = false;
// Сохраняем индекс трека, для которого обрабатывается ended, чтобы предотвратить обработку ended для другого трека
let endedTrackIndex: number | null = null;
// Флаг для предотвращения повторного вызова nextTrack из ended
let isNextTrackPending = false;
// Уникальный ID для каждого вызова nextTrack из ended - используется для отслеживания дубликатов
let lastNextTrackCallId: string | null = null;
/**
 * Браузер часто шлёт native `pause` сразу после `ended`, до nextTrack listener.
 * Redux isPlaying успевает стать false, хотя пользователь слушал альбом — сохраняем intent здесь.
 */
let autoContinuePlaybackOnAdvance = false;

export const attachAudioEvents = (dispatch: AppDispatch, getState: () => RootState): void => {
  audioController.ensureElementInDocument();
  const el = audioController.element;

  // Удаляем старые обработчики, если они есть (защита от повторного вызова при hot reload)
  if (endedHandler) {
    el.removeEventListener('ended', endedHandler);
    endedHandler = null;
  }
  if (timeupdateHandler) {
    el.removeEventListener('timeupdate', timeupdateHandler);
    timeupdateHandler = null;
  }
  if (loadedmetadataHandler) {
    el.removeEventListener('loadedmetadata', loadedmetadataHandler);
    loadedmetadataHandler = null;
  }
  if (durationchangeHandler) {
    el.removeEventListener('durationchange', durationchangeHandler);
    durationchangeHandler = null;
  }
  if (playingHandler) {
    el.removeEventListener('playing', playingHandler);
    playingHandler = null;
  }
  if (pauseHandler) {
    el.removeEventListener('pause', pauseHandler);
    pauseHandler = null;
  }
  if (playSyncHandler) {
    el.removeEventListener('play', playSyncHandler);
    playSyncHandler = null;
  }
  if (nativePauseSyncHandler) {
    el.removeEventListener('pause', nativePauseSyncHandler);
    nativePauseSyncHandler = null;
  }
  if (errorHandler) {
    el.removeEventListener('error', errorHandler);
    errorHandler = null;
  }

  // Устанавливаем начальную громкость из стейта
  audioController.setVolume(getState().player.volume);

  // Храним ключ последнего отправленного события audio_start для предотвращения дубликатов
  let lastStartedKey: string | null = null;

  // Флаг для предотвращения множественных вызовов ended подряд
  let isProcessingEnded = false;

  /**
   * Событие timeupdate срабатывает постоянно во время воспроизведения.
   * Обновляет текущее время и прогресс в стейте.
   * НО: не обновляет, если пользователь перематывает трек вручную (isSeeking = true).
   *
   * ВАЖНО: Используем throttling для уменьшения частоты обновлений UI.
   * Для плавной синхронизации текста обновляем каждые 100ms (10 раз в секунду).
   * Это обеспечивает точную синхронизацию без излишней нагрузки на производительность.
   */
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL = 100; // Обновляем 10 раз в секунду (100мс) для плавной синхронизации текста

  timeupdateHandler = () => {
    const state = getState();
    if (state.player.isSeeking) return;

    const now = Date.now();
    // Throttling: обновляем только если прошло достаточно времени с последнего обновления
    if (now - lastUpdateTime < UPDATE_INTERVAL) {
      return;
    }
    lastUpdateTime = now;

    const { currentTime } = el;
    const { playlist = [], currentTrackIndex } = state.player;
    const metaDuration = playlist[currentTrackIndex]?.duration;
    const duration = getEffectiveTrackDuration(el, metaDuration);
    if (!isUsableMediaDuration(duration)) return;

    const progress = (currentTime / duration) * 100;
    dispatch(playerActions.setTime({ current: currentTime, duration }));
    dispatch(playerActions.setProgress(progress));
  };
  el.addEventListener('timeupdate', timeupdateHandler);

  /**
   * Событие loadedmetadata срабатывает когда загружены метаданные трека (длительность и т.д.).
   * Сбрасываем время и прогресс, чтобы UI показал начало трека.
   */
  loadedmetadataHandler = () => {
    const state = getState().player;
    const persistedTime = state.time?.current ?? 0;
    const { playlist = [], currentTrackIndex } = state;
    const metaDuration = playlist[currentTrackIndex]?.duration;
    const duration = getEffectiveTrackDuration(el, metaDuration);
    const hasDuration = isUsableMediaDuration(duration);
    const shouldRestorePosition =
      Number.isFinite(persistedTime) && persistedTime > 0 && hasDuration;
    const restoredCurrent = shouldRestorePosition ? Math.min(persistedTime, duration) : 0;

    dispatch(
      playerActions.setTime({
        current: restoredCurrent,
        duration,
      })
    );
    dispatch(
      playerActions.setProgress(
        shouldRestorePosition && hasDuration
          ? Math.min(100, Math.max(0, (restoredCurrent / duration) * 100))
          : 0
      )
    );

    if (shouldRestorePosition) {
      audioController.setCurrentTime(restoredCurrent);
    }
    // Сбрасываем ключ для audio_start, чтобы событие отправилось для нового трека
    lastStartedKey = null;
    // Сбрасываем флаги обработки ended при загрузке нового трека
    isProcessingEnded = false;
    endedTrackIndex = null;
    isNextTrackPending = false;
    lastNextTrackCallId = null;
    autoContinuePlaybackOnAdvance = false;
  };
  el.addEventListener('loadedmetadata', loadedmetadataHandler);

  /**
   * Когда браузер позже выставляет реальную длительность, пересчитываем прогресс без сброса позиции.
   */
  durationchangeHandler = () => {
    const state = getState();
    if (state.player.isSeeking) return;

    const { playlist = [], currentTrackIndex } = state.player;
    const metaDuration = playlist[currentTrackIndex]?.duration;
    const duration = getEffectiveTrackDuration(el, metaDuration);
    if (!isUsableMediaDuration(duration)) return;

    const currentTime = el.currentTime;
    dispatch(playerActions.setTime({ current: currentTime, duration }));
    dispatch(playerActions.setProgress((currentTime / duration) * 100));
  };
  el.addEventListener('durationchange', durationchangeHandler);

  /**
   * Событие ended срабатывает когда трек доиграл до конца.
   * Автоматически переключаем на следующий трек, если плейлист не пуст.
   * ВАЖНО: защита от множественных вызовов подряд (может происходить при hot reload или багах браузера).
   */
  endedHandler = () => {
    // КРИТИЧНО: Устанавливаем флаги В САМОМ НАЧАЛЕ, до любых проверок
    // Это гарантирует, что если ended сработает дважды синхронно, второй вызов будет проигнорирован
    if (isProcessingEnded || isNextTrackPending) {
      return;
    }

    // Устанавливаем флаги сразу, чтобы заблокировать повторные вызовы
    isProcessingEnded = true;
    isNextTrackPending = true;

    const state = getState().player;
    const {
      playlist = [],
      currentTrackIndex,
      isPlaying: wasPlayingWhenEnded,
      time: reduxTime,
      progress: reduxProgress,
    } = state;

    // Сохраняем индекс трека
    endedTrackIndex = currentTrackIndex;

    // КРИТИЧНО: Проверяем, что индекс трека не изменился с момента начала обработки
    // Если endedTrackIndex уже установлен и отличается от currentTrackIndex,
    // значит трек уже переключился, и это событие ended относится к старому треку
    if (endedTrackIndex !== null && endedTrackIndex !== currentTrackIndex) {
      // Сбрасываем флаги, если индекс изменился
      isProcessingEnded = false;
      isNextTrackPending = false;
      endedTrackIndex = null;
      return;
    }

    const metaDuration = playlist[currentTrackIndex]?.duration;
    const isActuallyEnded = isNaturalTrackEnd(el, metaDuration, reduxTime, reduxProgress);

    if (!isActuallyEnded) {
      // Сбрасываем флаги, если трек не доиграл
      isProcessingEnded = false;
      isNextTrackPending = false;
      endedTrackIndex = null;
      return;
    }

    // КРИТИЧНО: Генерируем уникальный ID для этого вызова nextTrack СИНХРОННО
    // Это гарантирует, что если ended сработает дважды синхронно, второй вызов будет проигнорирован
    const callId = `${Date.now()}-${Math.random()}`;

    // Проверяем, не был ли уже запланирован вызов nextTrack
    if (lastNextTrackCallId !== null) {
      // Сбрасываем флаги, если игнорируем
      isProcessingEnded = false;
      isNextTrackPending = false;
      endedTrackIndex = null;
      return;
    }

    // Сохраняем ID вызова СИНХРОННО, до любых асинхронных операций
    lastNextTrackCallId = callId;

    // Используем requestAnimationFrame для асинхронного вызова nextTrack
    // Это гарантирует, что Redux успеет обновить состояние перед вызовом
    requestAnimationFrame(() => {
      // Проверяем, что это всё ещё наш вызов (ID не изменился)
      if (lastNextTrackCallId !== callId) {
        return;
      }

      // Проверяем, что индекс всё ещё тот же (не изменился из-за другого вызова)
      const currentState = getState().player;
      if (currentState.currentTrackIndex === endedTrackIndex && playlist.length > 0) {
        // КРИТИЧНО: Сбрасываем флаги ПЕРЕД вызовом dispatch
        isProcessingEnded = false;
        isNextTrackPending = false;
        endedTrackIndex = null;
        lastNextTrackCallId = null; // Сбрасываем ID сразу, чтобы предотвратить повторные вызовы

        // Обрабатываем зацикливание в зависимости от режима repeat
        const { repeat, currentTrackIndex } = currentState;
        const isLastTrack = currentTrackIndex === playlist.length - 1;

        if (repeat === 'one' || (repeat === 'all' && playlist.length === 1)) {
          // Зацикливание одного трека (или альбом из одного трека с repeat all)
          resetProgress({ dispatch, getState } as ListenerEffectAPI<RootState, AppDispatch>);
          audioController.setCurrentTime(0);
          // Natural end: restart even if native pause already synced isPlaying to false
          dispatch(playerActions.play());
        } else if (repeat === 'all') {
          // Natural end (isActuallyEnded): continue album even if native pause synced isPlaying first
          autoContinuePlaybackOnAdvance = wasPlayingWhenEnded || isActuallyEnded;
          dispatch(playerActions.nextTrack(playlist.length));
        } else {
          // repeat === 'none': переключаем на следующий трек, если он есть
          if (isLastTrack) {
            dispatch(playerActions.pause());
          } else {
            autoContinuePlaybackOnAdvance = wasPlayingWhenEnded;
            dispatch(playerActions.nextTrack(playlist.length));
          }
        }
      } else {
        // Сбрасываем флаги, если отменяем вызов
        isProcessingEnded = false;
        isNextTrackPending = false;
        endedTrackIndex = null;
        lastNextTrackCallId = null;
      }
    });

    // Сбрасываем флаг через небольшую задержку, чтобы предотвратить повторные вызовы
    // Увеличиваем задержку до 1000мс, чтобы дать время новому треку загрузиться
    setTimeout(() => {
      isProcessingEnded = false;
      endedTrackIndex = null;
      isNextTrackPending = false; // Дополнительный сброс на случай, если что-то пошло не так
    }, 1000);
  };
  el.addEventListener('ended', endedHandler);

  /**
   * Событие playing срабатывает когда трек начинает воспроизводиться.
   * Отправляем GA событие audio_start (только один раз для каждого трека).
   */
  playingHandler = () => {
    const state = getState();
    const { albumId, albumTitle, currentTrackIndex, playlist } = state.player;
    const track = playlist[currentTrackIndex];

    if (!albumId || !albumTitle) return; // нет данных об альбоме

    const key = `${albumId}:${currentTrackIndex}`;
    // Если событие уже отправлено для этого трека, не отправляем повторно
    if (lastStartedKey === key) return;

    gaEvent('audio_start', {
      album_id: albumId,
      album_title: albumTitle,
      track_id: track?.id ?? String(currentTrackIndex),
      track_title: track?.title ?? 'Unknown Track',
      position_seconds: Math.floor(el.currentTime),
    });

    lastStartedKey = key;
  };
  el.addEventListener('playing', playingHandler);

  /**
   * Синхронизация Redux isPlaying с фактическим состоянием HTMLAudioElement.
   * Отдельные обработчики от GA pause — тот же тип события, разная ответственность.
   */
  playSyncHandler = () => {
    const state = getState();
    if (!state.player.isPlaying) {
      dispatch(playerActions.play());
    }
  };
  el.addEventListener('play', playSyncHandler);

  nativePauseSyncHandler = () => {
    const state = getState();
    if (state.player.isPlaying) {
      dispatch(playerActions.pause());
    }
  };
  el.addEventListener('pause', nativePauseSyncHandler);

  errorHandler = () => {
    const state = getState();
    if (state.player.isPlaying) {
      dispatch(playerActions.pause());
    }
  };
  el.addEventListener('error', errorHandler);

  /**
   * Событие pause срабатывает когда трек ставится на паузу.
   * Отправляем GA событие audio_pause.
   */
  pauseHandler = () => {
    const state = getState();
    const { albumId, albumTitle, currentTrackIndex, playlist } = state.player;
    const track = playlist[currentTrackIndex];

    if (!albumId || !albumTitle) return; // нет данных об альбоме

    gaEvent('audio_pause', {
      album_id: albumId,
      album_title: albumTitle,
      track_id: track?.id ?? String(currentTrackIndex),
      track_title: track?.title ?? 'Unknown Track',
      position_seconds: Math.floor(el.currentTime),
    });
  };
  el.addEventListener('pause', pauseHandler);
};
