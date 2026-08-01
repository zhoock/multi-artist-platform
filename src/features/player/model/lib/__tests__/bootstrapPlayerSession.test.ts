import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer, playerActions } from '../../slice/playerSlice';
import { playerListenerMiddleware } from '../../middleware/playerListeners';
import { initialPlayerState } from '../../types/playerSchema';
import type { PlayerTrack } from '../../types/playerSchema';
import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import {
  bootstrapPlayerSession,
  resetPlayerSessionBootstrapForTests,
} from '../bootstrapPlayerSession';

jest.mock('@features/player/model/lib/audioController', () => {
  const mockAudio = {
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    setSource: jest.fn(),
    setCurrentTime: jest.fn(),
    setVolume: jest.fn(),
    element: {
      currentTime: 0,
      duration: 180,
      readyState: 0,
      src: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as HTMLAudioElement,
  };

  return { audioController: mockAudio };
});

jest.mock('@features/player/model/lib/playerPersist', () => ({
  loadPlayerState: jest.fn(),
}));

import { audioController } from '@features/player/model/lib/audioController';
import { loadPlayerState } from '@features/player/model/lib/playerPersist';

const mockLoadPlayerState = loadPlayerState as jest.MockedFunction<typeof loadPlayerState>;
const mockAudioController = audioController as jest.Mocked<typeof audioController>;

const mockTracks: PlayerTrack[] = [
  {
    id: '1',
    title: 'Track 1',
    duration: 180,
    src: 'https://example.com/track1.mp3',
  },
  {
    id: '2',
    title: 'Track 2',
    duration: 200,
    src: 'https://example.com/track2.mp3',
  },
];

const mockAlbumMeta = {
  albumId: 'album-1',
  userId: 'user-1',
  album: 'Test Album',
  artist: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  cover: null,
};

function createTestStore(preloadedPlayer?: Partial<typeof initialPlayerState>) {
  return configureStore({
    reducer: { player: playerReducer },
    preloadedState: preloadedPlayer
      ? {
          player: {
            ...initialPlayerState,
            ...preloadedPlayer,
          },
        }
      : undefined,
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
  });
}

function bootstrapParams(store: ReturnType<typeof createTestStore>) {
  return {
    dispatch: store.dispatch as AppDispatch,
    getState: store.getState as () => RootState,
  };
}

describe('bootstrapPlayerSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPlayerSessionBootstrapForTests();
    mockLoadPlayerState.mockReturnValue(null);
    Object.defineProperty(mockAudioController.element, 'src', {
      writable: true,
      configurable: true,
      value: '',
    });
    Object.defineProperty(mockAudioController.element, 'readyState', {
      writable: true,
      configurable: true,
      value: 0,
    });
  });

  test('returns empty-storage when localStorage has no session', () => {
    const store = createTestStore();

    const result = bootstrapPlayerSession(bootstrapParams(store));

    expect(result).toEqual({ restored: false, reason: 'empty-storage' });
    expect(store.getState().player.playlist).toHaveLength(0);
  });

  test('hydrates Redux and audio from persisted session', () => {
    mockLoadPlayerState.mockReturnValue({
      albumId: 'album-1',
      albumTitle: 'Test Album',
      currentTrackIndex: 0,
      volume: 70,
      isPlaying: false,
      albumMeta: mockAlbumMeta,
      sourceLocation: { pathname: '/ru/albums/album-1', search: '?artist=test' },
      playlist: mockTracks,
      originalPlaylist: mockTracks,
      shuffle: false,
      repeat: 'none',
      time: { current: 42, duration: 180 },
      showLyrics: false,
      controlsVisible: true,
    });

    const store = createTestStore();

    const result = bootstrapPlayerSession({
      ...bootstrapParams(store),
      fallbackSourceLocation: { pathname: '/ru/', search: undefined },
    });

    expect(result).toEqual({ restored: true, reason: 'hydrated-from-storage' });
    expect(store.getState().player.playlist).toHaveLength(2);
    expect(store.getState().player.currentTrackIndex).toBe(0);
    expect(store.getState().player.volume).toBe(70);
    expect(store.getState().player.time.current).toBe(42);
    expect(mockAudioController.setVolume).toHaveBeenCalledWith(70);
    expect(mockAudioController.setSource).toHaveBeenCalledWith(
      'https://example.com/track1.mp3',
      false
    );
  });

  test('calls requestPlay when persisted session was playing', () => {
    mockLoadPlayerState.mockReturnValue({
      albumId: 'album-1',
      albumTitle: 'Test Album',
      currentTrackIndex: 0,
      volume: 50,
      isPlaying: true,
      albumMeta: mockAlbumMeta,
      playlist: mockTracks,
      originalPlaylist: mockTracks,
      shuffle: false,
      repeat: 'none',
      time: { current: 0, duration: 180 },
    });

    const store = createTestStore();
    const requestPlaySpy = jest.spyOn(playerActions, 'requestPlay');

    bootstrapPlayerSession(bootstrapParams(store));

    expect(requestPlaySpy).toHaveBeenCalled();
    requestPlaySpy.mockRestore();
  });

  test('uses fallbackSourceLocation when persisted sourceLocation is missing', () => {
    mockLoadPlayerState.mockReturnValue({
      albumId: 'album-1',
      albumTitle: 'Test Album',
      currentTrackIndex: 0,
      volume: 50,
      isPlaying: false,
      albumMeta: mockAlbumMeta,
      playlist: mockTracks,
      originalPlaylist: mockTracks,
      shuffle: false,
      repeat: 'none',
      time: { current: 0, duration: 180 },
    });

    const store = createTestStore();
    const fallback = { pathname: '/ru/albums/album-1', search: '?artist=test' };

    bootstrapPlayerSession({
      ...bootstrapParams(store),
      fallbackSourceLocation: fallback,
    });

    expect(store.getState().player.sourceLocation).toEqual(fallback);
  });

  test('rebinds audio when Redux already has a session but audio src is empty', () => {
    const store = createTestStore({
      playlist: mockTracks,
      originalPlaylist: mockTracks,
      currentTrackIndex: 0,
      albumMeta: mockAlbumMeta,
      albumId: 'album-1',
      isPlaying: true,
      time: { current: 30, duration: 180 },
    });

    const result = bootstrapPlayerSession(bootstrapParams(store));

    expect(result).toEqual({ restored: true, reason: 'rebound-audio' });
    expect(mockAudioController.setSource).toHaveBeenCalledWith(
      'https://example.com/track1.mp3',
      true
    );
  });

  test('is idempotent — second call returns already-bootstrapped', () => {
    mockLoadPlayerState.mockReturnValue({
      albumId: 'album-1',
      albumTitle: 'Test Album',
      currentTrackIndex: 0,
      volume: 50,
      isPlaying: false,
      albumMeta: mockAlbumMeta,
      playlist: mockTracks,
      originalPlaylist: mockTracks,
      shuffle: false,
      repeat: 'none',
      time: { current: 0, duration: 180 },
    });

    const store = createTestStore();
    const params = bootstrapParams(store);

    bootstrapPlayerSession(params);
    const second = bootstrapPlayerSession(params);

    expect(second).toEqual({ restored: false, reason: 'already-bootstrapped' });
    expect(mockLoadPlayerState).toHaveBeenCalledTimes(1);
  });
});
