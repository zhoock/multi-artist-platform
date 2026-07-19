import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerActions, playerReducer } from '../../slice/playerSlice';
import { playerListenerMiddleware } from '../playerListeners';
import { initialPlayerState } from '../../types/playerSchema';
import type { RootState } from '@shared/model/appStore/types';
import type { TracksProps } from '@models';
import type { SupportedLang } from '@shared/model/lang';

// Мокируем audioController
jest.mock('@features/player/model/lib/audioController', () => {
  const mockAudio = {
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    setSource: jest.fn(),
    setCurrentTime: jest.fn(),
    setVolume: jest.fn(),
    element: {
      currentTime: 0,
      duration: 0,
      readyState: 0,
      src: '',
      load: jest.fn(),
      pause: jest.fn(),
      play: jest.fn(() => Promise.resolve()),
      volume: 1,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as HTMLAudioElement,
  };

  return {
    audioController: mockAudio,
  };
});

// Мокируем gaEvent
jest.mock('@shared/lib/analytics', () => ({
  gaEvent: jest.fn(),
}));

import { audioController } from '@features/player/model/lib/audioController';
import { gaEvent } from '@shared/lib/analytics';

const mockAudioController = audioController as jest.Mocked<typeof audioController>;
const mockGaEvent = gaEvent as jest.MockedFunction<typeof gaEvent>;

describe('playerListeners middleware', () => {
  const mockTracks: TracksProps[] = [
    { id: '1', title: 'Track 1', order_index: 0, content: '', duration: 180, src: 'track1.mp3' },
    { id: '2', title: 'Track 2', order_index: 1, content: '', duration: 200, src: 'track2.mp3' },
    { id: '3', title: 'Track 3', order_index: 2, content: '', duration: 220, src: 'track3.mp3' },
  ];

  const stateWithPlaylistAt0 = {
    ...initialPlayerState,
    playlist: mockTracks,
    currentTrackIndex: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Сбрасываем состояние audio элемента
    mockAudioController.element.currentTime = 0;
    // Используем Object.defineProperty для свойств только для чтения
    Object.defineProperty(mockAudioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 0,
    });
    Object.defineProperty(mockAudioController.element, 'readyState', {
      writable: true,
      configurable: true,
      value: 0,
    });
    Object.defineProperty(mockAudioController.element, 'src', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createTestStore = (preloadedState?: { player?: Partial<typeof initialPlayerState> }) => {
    return configureStore({
      reducer: {
        player: playerReducer,
        lang: () => ({ current: 'en' as SupportedLang }),
        popup: () => ({ isOpen: false }),
        articles: () => ({
          status: 'idle' as const,
          error: null,
          data: [],
          lastUpdated: null,
          lastPublicArtistSlug: null,
        }),
        albums: () => ({
          dashboard: {
            status: 'idle' as const,
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        }),
        uiDictionary: () => ({
          en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
          ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
        }),
      } as any,
      ...(preloadedState && {
        preloadedState: {
          player: {
            ...initialPlayerState,
            ...preloadedState.player,
          },
        } as any,
      }),
      middleware: (getDefaultMiddleware: any) =>
        getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
    });
  };

  describe('play action listener', () => {
    test('должен вызвать audioController.play() при действии play', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });

      store.dispatch(playerActions.play());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setVolume).toHaveBeenCalled();
      expect(mockAudioController.play).toHaveBeenCalled();
    });

    test('должен установить громкость перед воспроизведением', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });

      store.dispatch(playerActions.setVolume(75));
      store.dispatch(playerActions.play());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setVolume).toHaveBeenCalledWith(75);
      expect(mockAudioController.play).toHaveBeenCalled();
    });

    test('должен диспатчить pause если play() отклонился', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });
      mockAudioController.play.mockRejectedValueOnce(new Error('Autoplay blocked'));

      store.dispatch(playerActions.play());

      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = store.getState() as RootState;
      expect(state.player.isPlaying).toBe(false);
    });
  });

  describe('pause action listener', () => {
    test('должен вызвать audioController.pause() при действии pause', () => {
      const store = createTestStore();

      store.dispatch(playerActions.pause());

      expect(mockAudioController.pause).toHaveBeenCalledTimes(1);
    });

    test('должен обработать множественные вызовы pause', () => {
      const store = createTestStore();

      store.dispatch(playerActions.pause());
      store.dispatch(playerActions.pause());
      store.dispatch(playerActions.pause());

      expect(mockAudioController.pause).toHaveBeenCalledTimes(3);
    });
  });

  describe('toggle action listener', () => {
    test('должен вызвать play если isPlaying false', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });

      store.dispatch(playerActions.toggle());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setVolume).toHaveBeenCalled();
      expect(mockAudioController.play).toHaveBeenCalled();
    });

    test('должен вызвать pause если isPlaying true', () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          isPlaying: true,
        },
      });

      store.dispatch(playerActions.toggle());

      expect(mockAudioController.pause).toHaveBeenCalled();
    });
  });

  describe('setVolume action listener', () => {
    test('должен вызвать audioController.setVolume() при действии setVolume', () => {
      const store = createTestStore();

      store.dispatch(playerActions.setVolume(50));

      expect(mockAudioController.setVolume).toHaveBeenCalledWith(50);
    });

    test('должен обработать граничные значения volume', () => {
      const store = createTestStore();

      store.dispatch(playerActions.setVolume(0));
      expect(mockAudioController.setVolume).toHaveBeenCalledWith(0);

      store.dispatch(playerActions.setVolume(100));
      expect(mockAudioController.setVolume).toHaveBeenCalledWith(100);
    });
  });

  describe('setCurrentTime action listener', () => {
    test('должен вызвать audioController.setCurrentTime() при действии setCurrentTime', () => {
      const store = createTestStore();

      store.dispatch(playerActions.setCurrentTime(30));

      expect(mockAudioController.setCurrentTime).toHaveBeenCalledWith(30);
    });

    test('должен обработать различные значения времени', () => {
      const store = createTestStore();

      store.dispatch(playerActions.setCurrentTime(0));
      expect(mockAudioController.setCurrentTime).toHaveBeenCalledWith(0);

      store.dispatch(playerActions.setCurrentTime(60));
      expect(mockAudioController.setCurrentTime).toHaveBeenCalledWith(60);

      store.dispatch(playerActions.setCurrentTime(180));
      expect(mockAudioController.setCurrentTime).toHaveBeenCalledWith(180);
    });
  });

  describe('setCurrentTrackIndex action listener', () => {
    test('должен установить источник трека при изменении индекса', () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
        },
      });

      store.dispatch(playerActions.setCurrentTrackIndex(1));

      expect(mockAudioController.setSource).toHaveBeenCalledWith('track2.mp3', false);
    });

    test('должен сбросить прогресс при изменении трека', () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
          progress: 50,
          time: { current: 90, duration: 180 },
        },
      });

      store.dispatch(playerActions.setCurrentTrackIndex(1));

      const state = store.getState() as RootState;
      expect(state.player.progress).toBe(0);
      expect(state.player.time.current).toBe(0);
      expect(Number.isNaN(state.player.time.duration)).toBe(true);
    });

    test('должен обработать пустой плейлист', () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: [],
          currentTrackIndex: 0,
        },
      });

      store.dispatch(playerActions.setCurrentTrackIndex(0));

      expect(mockAudioController.setSource).toHaveBeenCalledWith('', false);
    });
  });

  describe('nextTrack/prevTrack action listener', () => {
    test('должен установить новый источник при nextTrack', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
          isPlaying: false,
        },
      });

      store.dispatch(playerActions.nextTrack(3));

      await new Promise((resolve) => setTimeout(resolve, 150)); // Ждем setTimeout(100)

      expect(mockAudioController.pause).toHaveBeenCalled();
      expect(mockAudioController.setSource).toHaveBeenCalledWith('track2.mp3', false);
    });

    test('должен продолжить воспроизведение если wasPlaying true', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
          isPlaying: true,
          volume: 50,
        },
      });

      store.dispatch(playerActions.nextTrack(3));

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockAudioController.setSource).toHaveBeenCalledWith('track2.mp3', true);
      expect(mockAudioController.setVolume).toHaveBeenCalledWith(50);
    });

    test('должен обработать prevTrack', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 2,
          isPlaying: false,
        },
      });

      store.dispatch(playerActions.prevTrack(3));

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockAudioController.pause).toHaveBeenCalled();
      expect(mockAudioController.setSource).toHaveBeenCalledWith('track2.mp3', false);
    });

    test('должен обработать отсутствие источника трека', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: [],
          currentTrackIndex: 0,
          isPlaying: false,
        },
      });

      store.dispatch(playerActions.nextTrack(0));

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockAudioController.setSource).toHaveBeenCalledWith('', false);
      expect(mockAudioController.pause).toHaveBeenCalled();
    });
  });

  describe('requestPlay action listener', () => {
    test('должен установить источник и запустить воспроизведение', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
        },
      });

      // Устанавливаем readyState >= 2 чтобы пропустить ожидание
      Object.defineProperty(mockAudioController.element, 'readyState', {
        writable: true,
        configurable: true,
        value: 2,
      });
      Object.defineProperty(mockAudioController.element, 'src', {
        writable: true,
        configurable: true,
        value: 'track1.mp3',
      });

      store.dispatch(playerActions.requestPlay());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setSource).not.toHaveBeenCalled(); // Источник уже установлен
      expect(mockAudioController.setVolume).toHaveBeenCalled();
      expect(mockAudioController.play).toHaveBeenCalled();
    });

    test('должен установить источник если он еще не установлен', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
        },
      });

      Object.defineProperty(mockAudioController.element, 'readyState', {
        writable: true,
        configurable: true,
        value: 2,
      });
      Object.defineProperty(mockAudioController.element, 'src', {
        writable: true,
        configurable: true,
        value: '', // Источник не установлен
      });

      store.dispatch(playerActions.requestPlay());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setSource).toHaveBeenCalledWith('track1.mp3', true);
      expect(mockAudioController.setVolume).toHaveBeenCalled();
      expect(mockAudioController.play).toHaveBeenCalled();
    });

    test('не должен обработать requestPlay если плейлист пуст', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: [],
          currentTrackIndex: 0,
        },
      });

      store.dispatch(playerActions.requestPlay());

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.setSource).not.toHaveBeenCalled();
      expect(mockAudioController.play).not.toHaveBeenCalled();
    });
  });

  describe('setPlaylist action listener', () => {
    test('должен отменить активные слушатели при смене плейлиста', () => {
      const store = createTestStore();

      // Этот тест в основном проверяет, что не происходит ошибок
      store.dispatch(playerActions.setPlaylist(mockTracks));

      // Проверяем, что действие обработалось без ошибок
      const state = store.getState() as RootState;
      expect(state.player.playlist).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    test('должен обработать последовательные вызовы play/pause', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });

      store.dispatch(playerActions.play());
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.dispatch(playerActions.pause());
      expect(mockAudioController.pause).toHaveBeenCalled();

      store.dispatch(playerActions.play());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockAudioController.play).toHaveBeenCalledTimes(2);
    });

    test('должен обработать множественные вызовы toggle', async () => {
      const store = createTestStore({
        player: stateWithPlaylistAt0,
      });

      store.dispatch(playerActions.toggle());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioController.play).toHaveBeenCalled();

      store.dispatch(playerActions.toggle());
      expect(mockAudioController.pause).toHaveBeenCalled();
    });

    test('должен обработать переключение треков с разной громкостью', async () => {
      const store = createTestStore({
        player: {
          ...initialPlayerState,
          playlist: mockTracks,
          currentTrackIndex: 0,
          isPlaying: true,
          volume: 75,
        },
      });

      store.dispatch(playerActions.setVolume(50));
      store.dispatch(playerActions.nextTrack(3));

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockAudioController.setVolume).toHaveBeenCalledWith(50);
    });
  });
});
