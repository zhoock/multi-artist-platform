import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer, playerActions } from '../../slice/playerSlice';
import { attachAudioEvents } from '../playerListeners';
import { initialPlayerState } from '../../types/playerSchema';
import { audioController } from '../../lib/audioController';
import type { RootState } from '@shared/model/appStore/types';

describe('attachAudioEvents playback state sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audioController.ensureElementInDocument();
  });

  function createStore(isPlaying: boolean) {
    const store = configureStore({
      reducer: { player: playerReducer },
      preloadedState: {
        player: {
          ...initialPlayerState,
          isPlaying,
          playlist: [
            {
              id: '1',
              title: 'Track',
              duration: 180,
              src: 'https://example.com/t.mp3',
            },
          ],
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Album',
        },
      },
    });
    attachAudioEvents(store.dispatch, store.getState as () => RootState);
    return store;
  }

  test('native pause event sets isPlaying false when Redux still thinks playing', () => {
    const store = createStore(true);
    audioController.element.dispatchEvent(new Event('pause'));
    expect(store.getState().player.isPlaying).toBe(false);
  });

  test('native play event sets isPlaying true when Redux still thinks paused', () => {
    const store = createStore(false);
    audioController.element.dispatchEvent(new Event('play'));
    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('native error event pauses Redux when playing', () => {
    const store = createStore(true);
    audioController.element.dispatchEvent(new Event('error'));
    expect(store.getState().player.isPlaying).toBe(false);
  });

  test('does not dispatch pause when already paused', () => {
    const store = createStore(false);
    const dispatchSpy = jest.spyOn(store, 'dispatch');
    audioController.element.dispatchEvent(new Event('pause'));
    expect(dispatchSpy).not.toHaveBeenCalledWith(playerActions.pause());
  });
});
