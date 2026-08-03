import { useCallback, useRef } from 'react';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { playerActions } from '@features/player';
import { audioController } from '@features/player/model/lib/audioController';
import type { PlayerTimeState } from '@features/player/model/types/playerSchema';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { trackDebug } from '../utils/debug';

interface UseTrackNavigationParams {
  playlist: PlayerTrack[];
  time: PlayerTimeState;
  resetInactivityTimer: () => void;
}

/**
 * Хук для навигации по трекам (nextTrack, prevTrack, togglePlayPause)
 */
export function useTrackNavigation({
  playlist,
  time,
  resetInactivityTimer,
}: UseTrackNavigationParams) {
  const dispatch = useAppDispatch();

  // Флаг для предотвращения повторных вызовов nextTrack
  const nextTrackCallRef = useRef<string | null>(null);

  /**
   * Переключает воспроизведение (play ↔ pause)
   */
  const togglePlayPause = useCallback(() => {
    dispatch(playerActions.toggle());
  }, [dispatch]);

  /**
   * Переключает на следующий трек в плейлисте
   */
  const nextTrack = useCallback(() => {
    if (playlist.length === 0) return;

    // Генерируем уникальный ID для этого вызова
    const callId = `${Date.now()}-${Math.random()}`;

    // Проверяем, не был ли уже вызов в течение последних 500мс
    if (nextTrackCallRef.current !== null) {
      return;
    }

    // Сохраняем ID вызова
    nextTrackCallRef.current = callId;

    dispatch(playerActions.nextTrack(playlist.length));

    // Сбрасываем ID через 500мс
    setTimeout(() => {
      if (nextTrackCallRef.current === callId) {
        nextTrackCallRef.current = null;
      }
    }, 500);
  }, [dispatch, playlist.length]);

  // Флаг для предотвращения повторных вызовов prevTrack
  const prevTrackCallRef = useRef<string | null>(null);

  /**
   * Переключает на предыдущий трек в плейлисте или начинает текущий трек с начала
   */
  const prevTrack = useCallback(() => {
    if (playlist.length === 0) return;

    // Генерируем уникальный ID для этого вызова
    const callId = `${Date.now()}-${Math.random()}`;

    // Проверяем, не был ли уже вызов в течение последних 500мс
    if (prevTrackCallRef.current !== null) {
      return;
    }

    // Сохраняем ID вызова
    prevTrackCallRef.current = callId;

    // Порог времени: если трек проигрывается меньше 3 секунд, переключаем на предыдущий
    const TIME_THRESHOLD = 3; // секунды
    const currentTimeValue = time.current;

    if (currentTimeValue < TIME_THRESHOLD) {
      // Трек только начал проигрываться → переключаем на предыдущий трек
      dispatch(playerActions.prevTrack(playlist.length));
    } else {
      // Трек уже проигрывается какое-то время → начинаем с начала
      dispatch(playerActions.setCurrentTime(0));
      audioController.setCurrentTime(0);
      dispatch(playerActions.setProgress(0));
    }

    // Сбрасываем ID через 500мс
    setTimeout(() => {
      if (prevTrackCallRef.current === callId) {
        prevTrackCallRef.current = null;
      }
    }, 500);
  }, [dispatch, playlist.length, time]);

  return {
    togglePlayPause,
    nextTrack,
    prevTrack,
  };
}
