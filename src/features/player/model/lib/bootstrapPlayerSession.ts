/**
 * Single entry point for restoring playback session from localStorage on cold start / F5.
 * Independent of UI mode (#player hash). Idempotent — safe to call once per page load.
 */

import type { AppDispatch } from '@shared/model/appStore/types';
import type { RootState } from '@shared/model/appStore/types';
import { playerActions } from '@features/player/model/slice/playerSlice';
import { audioController } from '@features/player/model/lib/audioController';
import { loadPlayerState } from '@features/player/model/lib/playerPersist';
import type { PlayerSourceLocation } from '@features/player/model/types/playerSchema';
import {
  isTrackPlaybackBlocked,
  resolveFirstPlayableIndex,
} from '@shared/lib/tracks/trackPlayback';

export type BootstrapPlayerSessionResult =
  | { restored: true; reason: 'hydrated-from-storage' | 'rebound-audio' }
  | { restored: false; reason: 'already-bootstrapped' | 'empty-storage' | 'invalid-storage' };

export type BootstrapPlayerSessionParams = {
  dispatch: AppDispatch;
  getState: () => RootState;
  fallbackSourceLocation?: PlayerSourceLocation;
};

let sessionBootstrapped = false;

/** Test-only reset for idempotency guard. */
export function resetPlayerSessionBootstrapForTests(): void {
  sessionBootstrapped = false;
}

function rebindAudioForExistingSession(getState: () => RootState): BootstrapPlayerSessionResult {
  const currentState = getState().player;
  const track = currentState.playlist[currentState.currentTrackIndex];
  if (track?.src && !audioController.element.src) {
    audioController.setSource(track.src, currentState.isPlaying);
    if (currentState.time?.current && currentState.time.current > 0) {
      const el = audioController.element;
      if (el.readyState >= 1) {
        setTimeout(() => {
          const duration = el.duration;
          if (Number.isFinite(duration) && duration > 0) {
            const timeToSet = Math.min(currentState.time.current, duration);
            audioController.setCurrentTime(timeToSet);
          }
        }, 50);
      }
    }
    return { restored: true, reason: 'rebound-audio' };
  }
  return { restored: false, reason: 'already-bootstrapped' };
}

function restorePlaybackTimeAfterMetadata(playbackTimeCurrent: number): void {
  const el = audioController.element;
  const restoreTime = () => {
    if (playbackTimeCurrent > 0) {
      const duration = el.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const timeToSet = Math.min(playbackTimeCurrent, duration);
        audioController.setCurrentTime(timeToSet);
      }
    }
  };

  if (el.readyState >= 1) {
    setTimeout(restoreTime, 50);
  } else {
    const onLoadedMetadata = () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      restoreTime();
    };
    el.addEventListener('loadedmetadata', onLoadedMetadata);
  }
}

/**
 * Restores playback session from localStorage into Redux and audioController.
 * Does not read location.hash or control fullscreen UI.
 */
export function bootstrapPlayerSession({
  dispatch,
  getState,
  fallbackSourceLocation,
}: BootstrapPlayerSessionParams): BootstrapPlayerSessionResult {
  if (sessionBootstrapped) {
    return { restored: false, reason: 'already-bootstrapped' };
  }

  sessionBootstrapped = true;

  const currentState = getState().player;
  if (
    currentState.playlist.length > 0 &&
    currentState.albumMeta &&
    currentState.albumMeta.albumId
  ) {
    return rebindAudioForExistingSession(getState);
  }

  const savedState = loadPlayerState();
  if (!savedState || !Array.isArray(savedState.playlist) || savedState.playlist.length === 0) {
    return { restored: false, reason: 'empty-storage' };
  }

  const playlist = savedState.playlist;
  const originalPlaylist =
    Array.isArray(savedState.originalPlaylist) && savedState.originalPlaylist.length > 0
      ? savedState.originalPlaylist
      : playlist;
  const safeIndex = Math.max(0, Math.min(savedState.currentTrackIndex ?? 0, playlist.length - 1));
  const playableIdx = resolveFirstPlayableIndex(playlist, safeIndex);
  const resolvedIndex = playableIdx !== -1 ? playableIdx : safeIndex;
  const canResumePlayback = playableIdx !== -1;

  const playbackTime = savedState.time ?? { current: 0, duration: NaN };

  dispatch(
    playerActions.hydrateFromPersistedState({
      playlist,
      originalPlaylist,
      currentTrackIndex: resolvedIndex,
      albumId: savedState.albumId ?? null,
      albumTitle:
        savedState.albumTitle ??
        savedState.albumMeta?.album ??
        savedState.albumMeta?.fullName ??
        null,
      albumMeta: savedState.albumMeta ?? null,
      sourceLocation: savedState.sourceLocation ?? fallbackSourceLocation ?? null,
      volume: savedState.volume ?? 50,
      isPlaying: canResumePlayback ? (savedState.isPlaying ?? false) : false,
      shuffle: savedState.shuffle ?? false,
      repeat: savedState.repeat ?? 'none',
      time: playbackTime,
      showLyrics: savedState.showLyrics ?? false,
      controlsVisible: savedState.controlsVisible ?? true,
    })
  );

  audioController.setVolume(savedState.volume ?? 50);

  // hydrateFromPersistedState does not trigger setCurrentTrackIndex listener — bind audio explicitly.
  const track = playlist[resolvedIndex];
  if (track?.src && !isTrackPlaybackBlocked(track)) {
    audioController.setSource(track.src, false);
    restorePlaybackTimeAfterMetadata(playbackTime.current ?? 0);
  }

  if (canResumePlayback && savedState.isPlaying) {
    dispatch(playerActions.requestPlay());
  } else {
    dispatch(playerActions.pause());
  }

  return { restored: true, reason: 'hydrated-from-storage' };
}
