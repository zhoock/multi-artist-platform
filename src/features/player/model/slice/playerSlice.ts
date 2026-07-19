/**
 * Redux Toolkit Slice для управления состоянием аудиоплеера.
 * Здесь определяем все действия (actions) и как они изменяют стейт.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  PlayerState,
  initialPlayerState,
  PlayerTimeState,
  PlayerAlbumMeta,
  PlayerSourceLocation,
  PlayerTrack,
} from '@features/player/model/types/playerSchema';
import { toPlayerTracks } from '@features/player/model/lib/toPlayerTrack';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';

/**
 * Перемешивает массив треков используя алгоритм Fisher-Yates.
 * Не изменяет исходный массив, возвращает новый перемешанный массив.
 */
const shufflePlaylist = <T>(array: T[]): T[] => {
  const shuffled = [...array]; // Создаём копию массива
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Находит индекс трека в новом плейлисте по его ID.
 * Используется для обновления currentTrackIndex при перемешивании.
 */
const findTrackIndexById = (playlist: PlayerTrack[], trackId: string): number => {
  const needle = normalizeTrackIdString(trackId);
  return playlist.findIndex((track) => track.id === needle);
};

const playerSlice = createSlice({
  name: 'player',
  initialState: initialPlayerState,
  reducers: {
    /**
     * Действие play - устанавливает флаг isPlaying в true.
     * Само воспроизведение запускается в middleware (playerListeners.ts).
     */
    play(state) {
      state.isPlaying = true;
    },
    /**
     * Действие pause - устанавливает флаг isPlaying в false.
     * Остановка воспроизведения происходит в middleware.
     */
    pause(state) {
      state.isPlaying = false;
    },
    /**
     * Действие toggle - переключает isPlaying между true и false.
     */
    toggle(state) {
      state.isPlaying = !state.isPlaying;
    },
    /**
     * Устанавливает громкость (0-100).
     */
    setVolume(state, action: PayloadAction<number>) {
      state.volume = Math.max(0, Math.min(100, action.payload));
    },
    /**
     * Устанавливает флаг isSeeking (пользователь перематывает трек).
     * Нужен чтобы временно отключить автоматическое обновление прогресса.
     */
    setSeeking(state, action: PayloadAction<boolean>) {
      state.isSeeking = action.payload;
    },
    /**
     * Устанавливает прогресс воспроизведения (0-100%).
     */
    setProgress(state, action: PayloadAction<number>) {
      state.progress = Math.max(0, Math.min(100, action.payload));
    },
    /**
     * Устанавливает текущее время и длительность трека.
     */
    setTime(state, action: PayloadAction<PlayerTimeState>) {
      state.time = action.payload;
    },
    /**
     * Устанавливает только текущее время (длительность не трогаем).
     */
    setCurrentTime(state, action: PayloadAction<number>) {
      state.time = { ...state.time, current: action.payload };
    },
    /**
     * Устанавливает новый плейлист. Любой fat TracksProps[] стрипается в PlayerTrack[].
     * Сохраняет оригинальный порядок в originalPlaylist.
     * Если shuffle включен, перемешивает плейлист.
     */
    setPlaylist(state, action: PayloadAction<readonly unknown[] | null | undefined>) {
      const albumId = state.albumMeta?.albumId ?? state.albumId;
      const newPlaylist = toPlayerTracks(action.payload, albumId);

      // Сохраняем оригинальный порядок
      state.originalPlaylist = [...newPlaylist];

      // Если shuffle включен, перемешиваем плейлист
      if (state.shuffle) {
        // Сохраняем текущий трек перед перемешиванием
        const currentTrack = state.playlist[state.currentTrackIndex];
        const currentTrackId = currentTrack?.id;

        // Перемешиваем новый плейлист
        state.playlist = shufflePlaylist(newPlaylist);

        // Если был текущий трек, находим его в перемешанном списке
        if (currentTrackId !== undefined && currentTrackId !== null) {
          const newIndex = findTrackIndexById(state.playlist, currentTrackId);
          if (newIndex !== -1) {
            state.currentTrackIndex = newIndex;
          } else {
            // Если трек не найден (новый альбом), сбрасываем индекс
            state.currentTrackIndex = 0;
          }
        } else {
          state.currentTrackIndex = 0;
        }
      } else {
        // Если shuffle выключен, используем оригинальный порядок
        state.playlist = [...newPlaylist];
      }

      // Сбрасываем индекс, если он вышел за пределы
      if (state.currentTrackIndex >= state.playlist.length) {
        state.currentTrackIndex = 0;
      }
    },
    /**
     * Устанавливает индекс текущего трека в плейлисте.
     * Используется когда пользователь выбирает конкретный трек.
     */
    setCurrentTrackIndex(state, action: PayloadAction<number>) {
      const idx = Math.max(0, action.payload);
      state.currentTrackIndex = idx;
    },
    /**
     * Переключает на следующий трек в плейлисте.
     * ВАЖНО: Ручное переключение всегда работает с зацикливанием (модульная арифметика),
     * независимо от режима repeat. Режим repeat влияет только на автоматическое переключение
     * при окончании трека (ended событие).
     * @param action.payload - общее количество треков в плейлисте
     */
    nextTrack(state, action: PayloadAction<number>) {
      const total = Math.max(0, action.payload);
      if (total > 0) {
        const oldIndex = state.currentTrackIndex;
        const expectedNewIndex = (oldIndex + 1) % total;

        // КРИТИЧНО: Защита от повторных вызовов nextTrack
        // Если индекс уже изменился (не равен oldIndex), значит nextTrack уже вызывался
        // Это может произойти если ended срабатывает дважды или nextTrack вызывается из разных мест
        if (state.currentTrackIndex !== oldIndex) {
          // Проверяем, не является ли текущий индекс уже ожидаемым новым индексом
          // (это означает, что первый вызов уже успел выполниться)
          if (state.currentTrackIndex === expectedNewIndex) {
            return;
          }
          // Если индекс изменился на что-то другое, игнорируем повторный вызов
          return;
        }

        // ВСЕГДА используем модульную арифметику для ручного переключения
        // Это позволяет пользователю переключаться между треками даже при repeat: 'none'
        state.currentTrackIndex = expectedNewIndex;
      }
    },
    /**
     * Переключает на предыдущий трек в плейлисте.
     * ВАЖНО: Ручное переключение всегда работает с зацикливанием (модульная арифметика),
     * независимо от режима repeat. Режим repeat влияет только на автоматическое переключение
     * при окончании трека (ended событие).
     * @param action.payload - общее количество треков в плейлисте
     */
    prevTrack(state, action: PayloadAction<number>) {
      const total = Math.max(0, action.payload);
      if (total > 0) {
        const oldIndex = state.currentTrackIndex;

        // ВСЕГДА используем модульную арифметику для ручного переключения
        // Это позволяет пользователю переключаться между треками даже при repeat: 'none'
        state.currentTrackIndex = (oldIndex - 1 + total) % total;
      }
    },
    /**
     * Запрос на воспроизведение.
     * Просто инкрементирует playRequestId, что вызывает useEffect в компоненте,
     * который в свою очередь диспатчит play(). Используется для запуска трека при открытии плеера.
     */
    requestPlay(state) {
      state.playRequestId += 1;
    },
    /**
     * Устанавливает данные текущего альбома (для аналитики и других целей).
     * Используется когда открывается плеер с новым альбомом.
     */
    setAlbumInfo(state, action: PayloadAction<{ albumId: string; albumTitle: string } | null>) {
      if (action.payload) {
        state.albumId = action.payload.albumId;
        state.albumTitle = action.payload.albumTitle;
      } else {
        state.albumId = null;
        state.albumTitle = null;
        state.albumMeta = null;
      }
    },
    /**
     * Сохраняет минимальные данные об альбоме для отображения в UI (мини-плеер, полноэкранный плеер).
     */
    setAlbumMeta(state, action: PayloadAction<PlayerAlbumMeta | null>) {
      state.albumMeta = action.payload;
    },
    /**
     * Запоминает маршрут, на котором пользователь открыл плеер.
     * Используется для переходов из мини-плеера в полноэкранный режим.
     */
    setSourceLocation(state, action: PayloadAction<PlayerSourceLocation | null>) {
      state.sourceLocation = action.payload;
    },
    setShowLyrics(state, action: PayloadAction<boolean>) {
      state.showLyrics = action.payload;
    },
    setControlsVisible(state, action: PayloadAction<boolean>) {
      state.controlsVisible = action.payload;
    },
    /**
     * Переключает режим перемешивания треков (shuffle).
     * При включении: перемешивает плейлист, сохраняя оригинальный порядок.
     * При выключении: восстанавливает оригинальный порядок и обновляет currentTrackIndex.
     */
    toggleShuffle(state) {
      const currentTrack = state.playlist[state.currentTrackIndex];
      const currentTrackId = currentTrack?.id;

      state.shuffle = !state.shuffle;

      if (state.shuffle) {
        const sourceList =
          state.originalPlaylist.length > 0 ? state.originalPlaylist : state.playlist;
        state.playlist = shufflePlaylist(sourceList);

        if (currentTrackId !== undefined && currentTrackId !== null) {
          const newIndex = findTrackIndexById(state.playlist, currentTrackId);
          if (newIndex !== -1) {
            state.currentTrackIndex = newIndex;
          }
        }
      } else {
        // Выключаем shuffle: восстанавливаем оригинальный порядок
        // Сохраняем текущий трек перед восстановлением
        state.playlist = [...state.originalPlaylist];

        // Находим текущий трек в восстановленном плейлисте
        if (currentTrackId !== undefined && currentTrackId !== null) {
          const newIndex = findTrackIndexById(state.playlist, currentTrackId);
          if (newIndex !== -1) {
            state.currentTrackIndex = newIndex;
          } else {
            // Если трек не найден (не должно происходить, но на всякий случай)
            state.currentTrackIndex = 0;
          }
        } else {
          state.currentTrackIndex = 0;
        }
      }
    },
    /**
     * Переключает режим зацикливания треков.
     * Цикл: 'none' → 'all' → 'one' → 'none'
     */
    toggleRepeat(state) {
      if (state.repeat === 'none') {
        state.repeat = 'all';
      } else if (state.repeat === 'all') {
        state.repeat = 'one';
      } else {
        state.repeat = 'none';
      }
    },
    hydrateFromPersistedState(
      state,
      action: PayloadAction<{
        playlist: readonly unknown[];
        originalPlaylist?: readonly unknown[];
        currentTrackIndex: number;
        albumId: string | null;
        albumTitle: string | null;
        albumMeta: PlayerAlbumMeta | null;
        sourceLocation: PlayerSourceLocation | null;
        volume: number;
        isPlaying: boolean;
        shuffle?: boolean;
        repeat?: PlayerState['repeat'];
        time?: PlayerState['time'];
        showLyrics?: boolean;
        controlsVisible?: boolean;
      }>
    ) {
      const {
        playlist: incomingPlaylist,
        originalPlaylist: incomingOriginal,
        currentTrackIndex,
        albumId,
        albumTitle,
        albumMeta,
        sourceLocation,
        volume,
        isPlaying,
        shuffle,
        repeat,
        time,
        showLyrics,
        controlsVisible,
      } = action.payload;

      const resolvedAlbumId = albumMeta?.albumId ?? albumId;
      const playlist = toPlayerTracks(incomingPlaylist, resolvedAlbumId);
      const originalPlaylistNorm = toPlayerTracks(incomingOriginal, resolvedAlbumId);

      const resolvedOriginal =
        originalPlaylistNorm.length > 0
          ? [...originalPlaylistNorm]
          : playlist.length > 0
            ? [...playlist]
            : [];
      state.originalPlaylist = resolvedOriginal;

      const resolvedPlaylist = shuffle
        ? playlist && playlist.length > 0
          ? [...playlist]
          : [...resolvedOriginal]
        : [...resolvedOriginal];
      state.playlist = resolvedPlaylist;

      const maxIndex = state.playlist.length > 0 ? state.playlist.length - 1 : 0;
      let normalizedIndex = Math.max(0, Math.min(currentTrackIndex ?? 0, maxIndex));
      const targetTrack = playlist[currentTrackIndex ?? 0];
      if (targetTrack) {
        const actualIndex = state.playlist.findIndex(
          (track) => track.id === normalizeTrackIdString(targetTrack.id)
        );
        if (actualIndex >= 0) {
          normalizedIndex = actualIndex;
        }
      }
      state.currentTrackIndex = normalizedIndex;
      state.albumId = albumId;
      state.albumTitle = albumTitle;
      state.albumMeta = albumMeta ?? null;
      state.sourceLocation = sourceLocation ?? null;
      state.volume = Math.max(0, Math.min(100, volume ?? state.volume));
      state.isPlaying = !!isPlaying;
      state.shuffle = shuffle ?? false;
      state.repeat = repeat ?? 'none';

      const nextTime: PlayerState['time'] = {
        current: Number.isFinite(time?.current) ? (time?.current as number) : 0,
        duration: Number.isFinite(time?.duration) ? (time?.duration as number) : NaN,
      };
      state.time = nextTime;
      if (Number.isFinite(nextTime.duration) && nextTime.duration > 0) {
        state.progress = Math.min(100, Math.max(0, (nextTime.current / nextTime.duration) * 100));
      } else {
        state.progress = 0;
      }
      state.isSeeking = false;
      if (typeof showLyrics === 'boolean') {
        state.showLyrics = showLyrics;
      }
      if (typeof controlsVisible === 'boolean') {
        state.controlsVisible = controlsVisible;
      } else {
        state.controlsVisible = true;
      }
    },
  },
});

export const { reducer: playerReducer, actions: playerActions } = playerSlice;
