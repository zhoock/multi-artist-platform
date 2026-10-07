import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerActions, playerReducer } from '../../slice/playerSlice';
import { attachAudioEvents, playerListenerMiddleware } from '../playerListeners';
import { initialPlayerState, type PlayerTrack } from '../../types/playerSchema';
import { audioController } from '../../lib/audioController';
import type { RootState } from '@shared/model/appStore/types';
import type { TracksProps } from '@models';

const mockTracks: TracksProps[] = [
  { id: '1', title: 'Track 1', order_index: 0, content: '', duration: 180, src: 'track1.mp3' },
  { id: '2', title: 'Track 2', order_index: 1, content: '', duration: 200, src: 'track2.mp3' },
  { id: '3', title: 'Track 3', order_index: 2, content: '', duration: 220, src: 'track3.mp3' },
];

describe('attachAudioEvents ended + repeat', () => {
  let rafQueue: Array<FrameRequestCallback>;

  beforeEach(() => {
    jest.clearAllMocks();
    rafQueue = [];
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    audioController.ensureElementInDocument();
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 220,
    });
    audioController.element.currentTime = 220;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const flushEndedAdvance = async () => {
    const callbacks = [...rafQueue];
    rafQueue = [];
    for (const cb of callbacks) {
      cb(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  };

  const fireEndedWithNativePause = () => {
    audioController.element.dispatchEvent(new Event('ended'));
    audioController.element.dispatchEvent(new Event('pause'));
  };

  const mockPlayWithNativeSync = () =>
    jest.spyOn(audioController, 'play').mockImplementation(() => {
      audioController.element.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });

  function createStore(player: Partial<typeof initialPlayerState>) {
    const store = configureStore({
      reducer: { player: playerReducer },
      preloadedState: {
        player: {
          ...initialPlayerState,
          ...player,
        },
      },
      middleware: (getDefaultMiddleware: any) =>
        getDefaultMiddleware().prepend(playerListenerMiddleware.middleware),
    });
    attachAudioEvents(store.dispatch, store.getState as () => RootState);
    return store;
  }

  test('A) repeat all + last track ended → first track selected and playback continues', async () => {
    const playSpy = mockPlayWithNativeSync();
    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 2,
      repeat: 'all',
      isPlaying: true,
      volume: 80,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    const state = store.getState().player;
    expect(state.currentTrackIndex).toBe(0);
    expect(state.isPlaying).toBe(true);
    expect(playSpy).toHaveBeenCalled();
  });

  test('B) repeat off + last track ended → playback does not restart', async () => {
    const playSpy = jest.spyOn(audioController, 'play').mockResolvedValue(undefined);
    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 2,
      repeat: 'none',
      isPlaying: true,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    const state = store.getState().player;
    expect(state.currentTrackIndex).toBe(2);
    expect(state.isPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
  });

  test('C) repeat one + track ended → same track plays again', async () => {
    const playSpy = jest.spyOn(audioController, 'play').mockResolvedValue(undefined);
    const setTimeSpy = jest.spyOn(audioController, 'setCurrentTime');
    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 1,
      repeat: 'one',
      isPlaying: true,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    const state = store.getState().player;
    expect(state.currentTrackIndex).toBe(1);
    expect(state.isPlaying).toBe(true);
    expect(setTimeSpy).toHaveBeenCalledWith(0);
    expect(playSpy).toHaveBeenCalled();
  });

  test('D) repeat all + multiple tracks → continuous advance through queue', async () => {
    mockPlayWithNativeSync();
    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 0,
      repeat: 'all',
      isPlaying: true,
    });

    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 180,
    });
    audioController.element.currentTime = 180;

    fireEndedWithNativePause();
    await flushEndedAdvance();
    expect(store.getState().player.currentTrackIndex).toBe(1);
    expect(store.getState().player.isPlaying).toBe(true);

    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 200,
    });
    audioController.element.currentTime = 200;

    fireEndedWithNativePause();
    await flushEndedAdvance();
    expect(store.getState().player.currentTrackIndex).toBe(2);
    expect(store.getState().player.isPlaying).toBe(true);

    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 220,
    });
    audioController.element.currentTime = 220;

    fireEndedWithNativePause();
    await flushEndedAdvance();
    expect(store.getState().player.currentTrackIndex).toBe(0);
    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('E) isPlaying stays true after last→first when audio play succeeds', async () => {
    mockPlayWithNativeSync();

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 2,
      repeat: 'all',
      isPlaying: true,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('F) repeat all + NaN element.duration + playlist metadata → wrap and play', async () => {
    const playSpy = mockPlayWithNativeSync();
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: NaN,
    });
    audioController.element.currentTime = 220;

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 2,
      repeat: 'all',
      isPlaying: true,
      volume: 80,
      time: { current: 219.8, duration: 220 },
      progress: 99.9,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    expect(store.getState().player.currentTrackIndex).toBe(0);
    expect(store.getState().player.isPlaying).toBe(true);
    expect(playSpy).toHaveBeenCalled();
  });

  test('G) repeat one + NaN element.duration + metadata → seek 0 and play', async () => {
    const playSpy = mockPlayWithNativeSync();
    const setTimeSpy = jest.spyOn(audioController, 'setCurrentTime');
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: NaN,
    });
    audioController.element.currentTime = 200;

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 1,
      repeat: 'one',
      isPlaying: true,
      time: { current: 199.6, duration: 200 },
      progress: 99.8,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    expect(store.getState().player.currentTrackIndex).toBe(1);
    expect(setTimeSpy).toHaveBeenCalledWith(0);
    expect(playSpy).toHaveBeenCalled();
    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('H) repeat one + pause before ended → still restarts on natural end', async () => {
    const playSpy = mockPlayWithNativeSync();
    const setTimeSpy = jest.spyOn(audioController, 'setCurrentTime');
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 200,
    });
    audioController.element.currentTime = 200;

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 1,
      repeat: 'one',
      isPlaying: true,
      time: { current: 199.7, duration: 200 },
      progress: 99.85,
    });

    audioController.element.dispatchEvent(new Event('pause'));
    expect(store.getState().player.isPlaying).toBe(false);

    audioController.element.dispatchEvent(new Event('ended'));
    await flushEndedAdvance();

    expect(setTimeSpy).toHaveBeenCalledWith(0);
    expect(playSpy).toHaveBeenCalled();
    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('J) repeat all + pause before ended on last track → wrap 3→1 and play', async () => {
    const playSpy = mockPlayWithNativeSync();
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 220,
    });
    audioController.element.currentTime = 220;

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 2,
      repeat: 'all',
      isPlaying: true,
      volume: 80,
      time: { current: 219.7, duration: 220 },
      progress: 99.86,
    });

    audioController.element.dispatchEvent(new Event('pause'));
    expect(store.getState().player.isPlaying).toBe(false);

    audioController.element.dispatchEvent(new Event('ended'));
    await flushEndedAdvance();

    expect(store.getState().player.currentTrackIndex).toBe(0);
    expect(playSpy).toHaveBeenCalled();
    expect(store.getState().player.isPlaying).toBe(true);
  });

  test('K) repeat none + mid-queue ended → next track auto-plays (artist queue)', async () => {
    const playSpy = mockPlayWithNativeSync();
    const playlist: PlayerTrack[] = [
      {
        id: '1',
        title: 'A1',
        duration: 180,
        src: 'a1.mp3',
        albumId: 'album-1',
        queueAlbumMeta: {
          albumId: 'album-1',
          album: 'Album One',
          cover: 'cover-1.jpg',
          userId: 'u1',
          fullName: null,
        },
      },
      {
        id: '2',
        title: 'A2',
        duration: 200,
        src: 'a2.mp3',
        albumId: 'album-2',
        queueAlbumMeta: {
          albumId: 'album-2',
          album: 'Album Two',
          cover: 'cover-2.jpg',
          userId: 'u1',
          fullName: null,
        },
      },
    ];

    const store = createStore({
      playlist,
      currentTrackIndex: 0,
      repeat: 'none',
      isPlaying: true,
      volume: 70,
      albumMeta: {
        albumId: 'album-1',
        album: 'Album One',
        artist: 'Artist',
        fullName: 'Artist — Album One',
        cover: 'cover-1.jpg',
        publicSlug: 'artist-slug',
        userId: 'u1',
      },
      time: { current: 179.8, duration: 180 },
      progress: 99.9,
    });

    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 180,
    });
    audioController.element.currentTime = 180;

    fireEndedWithNativePause();
    await flushEndedAdvance();

    const state = store.getState().player;
    expect(state.currentTrackIndex).toBe(1);
    expect(state.isPlaying).toBe(true);
    expect(state.albumMeta?.cover).toBe('cover-2.jpg');
    expect(state.albumMeta?.album).toBe('Album Two');
    expect(playSpy).toHaveBeenCalled();
  });

  test('L) repeat none + pause before ended + mid-queue → auto-plays next track', async () => {
    const playSpy = mockPlayWithNativeSync();
    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 0,
      repeat: 'none',
      isPlaying: true,
      volume: 70,
      time: { current: 179.8, duration: 180 },
      progress: 99.9,
    });

    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: 180,
    });
    audioController.element.currentTime = 180;

    audioController.element.dispatchEvent(new Event('pause'));
    expect(store.getState().player.isPlaying).toBe(false);

    audioController.element.dispatchEvent(new Event('ended'));
    await flushEndedAdvance();

    expect(store.getState().player.currentTrackIndex).toBe(1);
    expect(store.getState().player.isPlaying).toBe(true);
    expect(playSpy).toHaveBeenCalled();
  });

  test('I) spurious ended at currentTime=0 without effective duration → no repeat restart', async () => {
    const playSpy = jest.spyOn(audioController, 'play').mockResolvedValue(undefined);
    const setTimeSpy = jest.spyOn(audioController, 'setCurrentTime');
    Object.defineProperty(audioController.element, 'duration', {
      writable: true,
      configurable: true,
      value: NaN,
    });
    audioController.element.currentTime = 0;

    const store = createStore({
      playlist: mockTracks,
      currentTrackIndex: 1,
      repeat: 'one',
      isPlaying: false,
      time: { current: 0, duration: NaN },
      progress: 0,
    });

    fireEndedWithNativePause();
    await flushEndedAdvance();

    expect(playSpy).not.toHaveBeenCalled();
    expect(setTimeSpy).not.toHaveBeenCalledWith(0);
    expect(store.getState().player.currentTrackIndex).toBe(1);
  });
});
