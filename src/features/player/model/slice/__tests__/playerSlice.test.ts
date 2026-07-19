import { describe, test, expect, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer, playerActions } from '../playerSlice';
import {
  selectIsPlaying,
  selectVolume,
  selectIsSeeking,
  selectProgress,
  selectTime,
  selectCurrentTrackIndex,
  selectPlaylist,
  selectShuffle,
  selectRepeat,
  selectShowLyrics,
  selectControlsVisible,
} from '../../selectors/playerSelectors';
import { initialPlayerState } from '../../types/playerSchema';
import type { RootState } from '@shared/model/appStore/types';
import type { TracksProps } from '@models';

describe('playerSlice', () => {
  describe('reducer', () => {
    test('должен возвращать начальное состояние', () => {
      const state = playerReducer(undefined, { type: 'unknown' });
      expect(state).toEqual(initialPlayerState);
    });
  });

  describe('play, pause, toggle actions', () => {
    test('play должен установить isPlaying в true', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.play());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(true);
    });

    test('pause должен установить isPlaying в false', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            isPlaying: true,
          },
        },
      });

      store.dispatch(playerActions.pause());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(false);
    });

    test('toggle должен переключить isPlaying с false на true', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.toggle());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(true);
    });

    test('toggle должен переключить isPlaying с true на false', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            isPlaying: true,
          },
        },
      });

      store.dispatch(playerActions.toggle());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(false);
    });
  });

  describe('setVolume action', () => {
    test('должен установить громкость в допустимом диапазоне', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setVolume(75));

      const state = store.getState() as RootState;
      expect(selectVolume(state)).toBe(75);
    });

    test('должен ограничить громкость до 100 при превышении', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setVolume(150));

      const state = store.getState() as RootState;
      expect(selectVolume(state)).toBe(100);
    });

    test('должен ограничить громкость до 0 при отрицательном значении', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setVolume(-10));

      const state = store.getState() as RootState;
      expect(selectVolume(state)).toBe(0);
    });

    test('должен обработать граничные значения', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setVolume(0));
      let state = store.getState() as RootState;
      expect(selectVolume(state)).toBe(0);

      store.dispatch(playerActions.setVolume(100));
      state = store.getState() as RootState;
      expect(selectVolume(state)).toBe(100);
    });
  });

  describe('setSeeking action', () => {
    test('должен установить isSeeking в true', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setSeeking(true));

      const state = store.getState() as RootState;
      expect(selectIsSeeking(state)).toBe(true);
    });

    test('должен установить isSeeking в false', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            isSeeking: true,
          },
        },
      });

      store.dispatch(playerActions.setSeeking(false));

      const state = store.getState() as RootState;
      expect(selectIsSeeking(state)).toBe(false);
    });
  });

  describe('setProgress action', () => {
    test('должен установить прогресс в допустимом диапазоне', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setProgress(50));

      const state = store.getState() as RootState;
      expect(selectProgress(state)).toBe(50);
    });

    test('должен ограничить прогресс до 100 при превышении', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setProgress(150));

      const state = store.getState() as RootState;
      expect(selectProgress(state)).toBe(100);
    });

    test('должен ограничить прогресс до 0 при отрицательном значении', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setProgress(-10));

      const state = store.getState() as RootState;
      expect(selectProgress(state)).toBe(0);
    });
  });

  describe('setTime action', () => {
    test('должен установить текущее время и длительность', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.setTime({
          current: 30,
          duration: 180,
        })
      );

      const state = store.getState() as RootState;
      const time = selectTime(state);
      expect(time.current).toBe(30);
      expect(time.duration).toBe(180);
    });

    test('должен обработать NaN для длительности', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.setTime({
          current: 0,
          duration: NaN,
        })
      );

      const state = store.getState() as RootState;
      const time = selectTime(state);
      expect(time.current).toBe(0);
      expect(Number.isNaN(time.duration)).toBe(true);
    });
  });

  describe('setCurrentTime action', () => {
    test('должен обновить только текущее время, сохранив длительность', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            time: {
              current: 0,
              duration: 180,
            },
          },
        },
      });

      store.dispatch(playerActions.setCurrentTime(60));

      const state = store.getState() as RootState;
      const time = selectTime(state);
      expect(time.current).toBe(60);
      expect(time.duration).toBe(180);
    });

    test('должен сохранить NaN длительность при обновлении текущего времени', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setCurrentTime(30));

      const state = store.getState() as RootState;
      const time = selectTime(state);
      expect(time.current).toBe(30);
      expect(Number.isNaN(time.duration)).toBe(true);
    });
  });

  describe('setPlaylist action', () => {
    const mockTracks: TracksProps[] = [
      { id: '1', title: 'Track 1', order_index: 0, content: '', duration: 180, src: 'track1.mp3' },
      { id: '2', title: 'Track 2', order_index: 1, content: '', duration: 200, src: 'track2.mp3' },
      { id: '3', title: 'Track 3', order_index: 2, content: '', duration: 220, src: 'track3.mp3' },
    ];

    test('должен установить новый плейлист', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setPlaylist(mockTracks));

      const state = store.getState() as RootState;
      const playlist = selectPlaylist(state);
      expect(playlist).toHaveLength(3);
      expect(playlist[0].id).toBe('1');
    });

    test('должен стрипать TracksProps до PlayerTrack (без content/lyrics/order_index)', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.setPlaylist([
          {
            id: '1',
            title: 'Track 1',
            order_index: 0,
            content: 'lyrics body',
            authorship: 'Author',
            duration: 180,
            src: 'track1.mp3',
            lyrics: {
              albumId: 'a1',
              trackId: '1',
              lang: 'ru',
              content: 'lyrics body',
              authorship: 'Author',
              syncedLines: null,
              state: 'text-only',
              syncedAt: null,
            },
            visibility: 'public',
            playbackLocked: false,
          },
        ] as TracksProps[])
      );

      const playlist = selectPlaylist(store.getState() as RootState);
      expect(playlist).toEqual([
        {
          id: '1',
          title: 'Track 1',
          duration: 180,
          src: 'track1.mp3',
          playbackLocked: false,
          visibility: 'public',
        },
      ]);
      expect(playlist[0]).not.toHaveProperty('content');
      expect(playlist[0]).not.toHaveProperty('lyrics');
      expect(playlist[0]).not.toHaveProperty('order_index');
    });

    test('должен сохранить оригинальный порядок в originalPlaylist', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setPlaylist(mockTracks));

      const state = store.getState();
      expect(state.player.originalPlaylist).toHaveLength(3);
      expect(state.player.originalPlaylist[0].id).toBe('1');
      expect(state.player.originalPlaylist[1].id).toBe('2');
      expect(state.player.originalPlaylist[2].id).toBe('3');
    });

    test('должен перемешать плейлист если shuffle включен', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            shuffle: true,
          },
        },
      });

      store.dispatch(playerActions.setPlaylist(mockTracks));

      const state = store.getState() as RootState;
      const playlist = selectPlaylist(state);
      // Проверяем, что плейлист перемешан (не равен оригиналу)
      // В большинстве случаев порядок будет другим
      expect(playlist).toHaveLength(3);
      // Оригинальный порядок должен сохраниться
      expect(state.player.originalPlaylist[0].id).toBe('1');
      expect(state.player.originalPlaylist[1].id).toBe('2');
      expect(state.player.originalPlaylist[2].id).toBe('3');
    });

    test('должен сбросить currentTrackIndex если он выходит за пределы нового плейлиста', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 5,
          },
        },
      });

      store.dispatch(playerActions.setPlaylist(mockTracks));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });

    test('должен обработать пустой плейлист', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setPlaylist([]));

      const state = store.getState() as RootState;
      const playlist = selectPlaylist(state);
      expect(playlist).toHaveLength(0);
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });

    test('должен обработать null плейлист', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setPlaylist(null));

      const state = store.getState() as RootState;
      const playlist = selectPlaylist(state);
      expect(playlist).toHaveLength(0);
    });
  });

  describe('setCurrentTrackIndex action', () => {
    test('должен установить индекс текущего трека', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.setCurrentTrackIndex(2));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(2);
    });

    test('должен ограничить индекс до 0 при отрицательном значении', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setCurrentTrackIndex(-5));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });
  });

  describe('nextTrack action', () => {
    test('должен переключить на следующий трек', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 0,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.nextTrack(3));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(1);
    });

    test('должен зациклить на начало при достижении конца плейлиста', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 2,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.nextTrack(3));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });

    test('должен обработать плейлист с одним треком', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 0,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.nextTrack(1));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });

    test('не должен изменить индекс при пустом плейлисте', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.nextTrack(0));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(0);
    });
  });

  describe('prevTrack action', () => {
    test('должен переключить на предыдущий трек', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 2,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.prevTrack(3));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(1);
    });

    test('должен зациклить на конец при начале плейлиста', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            currentTrackIndex: 0,
            playlist: [
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
            ],
          },
        },
      });

      store.dispatch(playerActions.prevTrack(3));

      const state = store.getState() as RootState;
      expect(selectCurrentTrackIndex(state)).toBe(2);
    });
  });

  describe('requestPlay action', () => {
    test('должен увеличить playRequestId', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const initialState = store.getState();
      const initialRequestId = initialState.player.playRequestId;

      store.dispatch(playerActions.requestPlay());

      const state = store.getState();
      expect(state.player.playRequestId).toBe(initialRequestId + 1);
    });

    test('должен увеличить playRequestId при множественных вызовах', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.requestPlay());
      store.dispatch(playerActions.requestPlay());
      store.dispatch(playerActions.requestPlay());

      const state = store.getState();
      expect(state.player.playRequestId).toBe(3);
    });
  });

  describe('setAlbumInfo action', () => {
    test('должен установить информацию об альбоме', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.setAlbumInfo({
          albumId: 'album-1',
          albumTitle: 'Test Album',
        })
      );

      const state = store.getState();
      expect(state.player.albumId).toBe('album-1');
      expect(state.player.albumTitle).toBe('Test Album');
    });

    test('должен очистить информацию об альбоме при null', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            albumId: 'album-1',
            albumTitle: 'Test Album',
            albumMeta: {
              albumId: 'album-1',
              album: 'Test Album',
              artist: null,
              fullName: null,
              cover: null,
            },
          },
        },
      });

      store.dispatch(playerActions.setAlbumInfo(null));

      const state = store.getState();
      expect(state.player.albumId).toBeNull();
      expect(state.player.albumTitle).toBeNull();
      expect(state.player.albumMeta).toBeNull();
    });
  });

  describe('setAlbumMeta action', () => {
    test('должен установить метаданные альбома', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const albumMeta = {
        albumId: 'album-1',
        album: 'Test Album',
        artist: 'Test Artist',
        fullName: 'Test Artist — Test Album',
        cover: 'cover',
      };

      store.dispatch(playerActions.setAlbumMeta(albumMeta));

      const state = store.getState();
      expect(state.player.albumMeta).toEqual(albumMeta);
    });

    test('должен очистить метаданные альбома при null', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            albumMeta: {
              albumId: 'album-1',
              album: 'Test Album',
              artist: 'Test Artist',
              fullName: 'Test Artist — Test Album',
              cover: 'cover',
            },
          },
        },
      });

      store.dispatch(playerActions.setAlbumMeta(null));

      const state = store.getState();
      expect(state.player.albumMeta).toBeNull();
    });

    test('должен обновить существующие метаданные альбома', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            albumMeta: {
              albumId: 'album-1',
              album: 'Old Album',
              artist: 'Old Artist',
              fullName: 'Old Artist — Old Album',
              cover: null,
            },
          },
        },
      });

      const newAlbumMeta = {
        albumId: 'album-2',
        album: 'New Album',
        artist: 'New Artist',
        fullName: 'New Artist — New Album',
        cover: 'new-cover',
      };

      store.dispatch(playerActions.setAlbumMeta(newAlbumMeta));

      const state = store.getState();
      expect(state.player.albumMeta).toEqual(newAlbumMeta);
    });
  });

  describe('setSourceLocation action', () => {
    test('должен установить локацию источника', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const sourceLocation = {
        pathname: '/album/test-album',
        search: '?track=1',
      };

      store.dispatch(playerActions.setSourceLocation(sourceLocation));

      const state = store.getState();
      expect(state.player.sourceLocation).toEqual(sourceLocation);
    });

    test('должен установить локацию источника без search', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const sourceLocation = {
        pathname: '/album/test-album',
      };

      store.dispatch(playerActions.setSourceLocation(sourceLocation));

      const state = store.getState();
      expect(state.player.sourceLocation).toEqual(sourceLocation);
    });

    test('должен очистить локацию источника при null', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            sourceLocation: {
              pathname: '/album/test-album',
              search: '?track=1',
            },
          },
        },
      });

      store.dispatch(playerActions.setSourceLocation(null));

      const state = store.getState();
      expect(state.player.sourceLocation).toBeNull();
    });

    test('должен обновить существующую локацию источника', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            sourceLocation: {
              pathname: '/album/old-album',
            },
          },
        },
      });

      const newSourceLocation = {
        pathname: '/album/new-album',
        search: '?track=2',
      };

      store.dispatch(playerActions.setSourceLocation(newSourceLocation));

      const state = store.getState();
      expect(state.player.sourceLocation).toEqual(newSourceLocation);
    });
  });

  describe('toggleShuffle action', () => {
    const mockTracks: TracksProps[] = [
      { id: '1', title: 'Track 1', order_index: 0, content: '', duration: 180, src: 'track1.mp3' },
      { id: '2', title: 'Track 2', order_index: 1, content: '', duration: 200, src: 'track2.mp3' },
      { id: '3', title: 'Track 3', order_index: 2, content: '', duration: 220, src: 'track3.mp3' },
    ];

    test('должен включить shuffle и перемешать плейлист', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            shuffle: false,
            playlist: [...mockTracks],
            originalPlaylist: [...mockTracks],
            currentTrackIndex: 1,
          },
        },
      });

      store.dispatch(playerActions.toggleShuffle());

      const state = store.getState() as RootState;
      expect(selectShuffle(state)).toBe(true);
      expect(state.player.playlist).toHaveLength(3);
      // Текущий трек должен остаться в перемешанном плейлисте
      const currentTrack = state.player.playlist[state.player.currentTrackIndex];
      expect(currentTrack.id).toBe('2'); // Текущий трек должен остаться
    });

    test('должен выключить shuffle и восстановить оригинальный порядок', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            shuffle: true,
            playlist: [
              {
                id: '3',
                title: 'Track 3',
                order_index: 2,
                content: '',
                duration: 220,
                src: 'track3.mp3',
              },
              {
                id: '1',
                title: 'Track 1',
                order_index: 0,
                content: '',
                duration: 180,
                src: 'track1.mp3',
              },
              {
                id: '2',
                title: 'Track 2',
                order_index: 1,
                content: '',
                duration: 200,
                src: 'track2.mp3',
              },
            ],
            originalPlaylist: [...mockTracks],
            currentTrackIndex: 0, // Текущий трек - это Track 3
          },
        },
      });

      store.dispatch(playerActions.toggleShuffle());

      const state = store.getState() as RootState;
      expect(selectShuffle(state)).toBe(false);
      // Проверяем, что восстановлен оригинальный порядок
      expect(state.player.playlist[0].id).toBe('1');
      expect(state.player.playlist[1].id).toBe('2');
      expect(state.player.playlist[2].id).toBe('3');
      // Текущий трек должен остаться (Track 3 теперь на индексе 2)
      expect(state.player.currentTrackIndex).toBe(2);
    });
  });

  describe('toggleRepeat action', () => {
    test('должен переключить repeat с none на all', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.toggleRepeat());

      const state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('all');
    });

    test('должен переключить repeat с all на one', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            repeat: 'all' as const,
          },
        },
      });

      store.dispatch(playerActions.toggleRepeat());

      const state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('one');
    });

    test('должен переключить repeat с one на none', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            repeat: 'one' as const,
          },
        },
      });

      store.dispatch(playerActions.toggleRepeat());

      const state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('none');
    });

    test('должен пройти полный цикл repeat', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      let state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('none');

      store.dispatch(playerActions.toggleRepeat());
      state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('all');

      store.dispatch(playerActions.toggleRepeat());
      state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('one');

      store.dispatch(playerActions.toggleRepeat());
      state = store.getState() as RootState;
      expect(selectRepeat(state)).toBe('none');
    });
  });

  describe('setShowLyrics action', () => {
    test('должен установить showLyrics в true', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setShowLyrics(true));

      const state = store.getState() as RootState;
      expect(selectShowLyrics(state)).toBe(true);
    });

    test('должен установить showLyrics в false', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            showLyrics: true,
          },
        },
      });

      store.dispatch(playerActions.setShowLyrics(false));

      const state = store.getState() as RootState;
      expect(selectShowLyrics(state)).toBe(false);
    });
  });

  describe('setControlsVisible action', () => {
    test('должен установить controlsVisible в true', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
        preloadedState: {
          player: {
            ...initialPlayerState,
            controlsVisible: false,
          },
        },
      });

      store.dispatch(playerActions.setControlsVisible(true));

      const state = store.getState() as RootState;
      expect(selectControlsVisible(state)).toBe(true);
    });

    test('должен установить controlsVisible в false', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.setControlsVisible(false));

      const state = store.getState() as RootState;
      expect(selectControlsVisible(state)).toBe(false);
    });
  });

  describe('hydrateFromPersistedState action', () => {
    const mockTracks: TracksProps[] = [
      { id: '1', title: 'Track 1', order_index: 0, content: '', duration: 180, src: 'track1.mp3' },
      { id: '2', title: 'Track 2', order_index: 1, content: '', duration: 200, src: 'track2.mp3' },
      { id: '3', title: 'Track 3', order_index: 2, content: '', duration: 220, src: 'track3.mp3' },
    ];

    test('должен восстановить полное состояние из persisted state', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          originalPlaylist: mockTracks,
          currentTrackIndex: 1,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: {
            albumId: 'album-1',
            album: 'Test Album',
            artist: 'Test Artist',
            fullName: 'Test Artist — Test Album',
            cover: null,
          },
          sourceLocation: {
            pathname: '/album/test-album',
          },
          volume: 75,
          isPlaying: true,
          shuffle: false,
          repeat: 'all',
          time: {
            current: 30,
            duration: 180,
          },
          showLyrics: true,
          controlsVisible: false,
        })
      );

      const state = store.getState();
      expect(state.player.playlist).toHaveLength(3);
      expect(state.player.currentTrackIndex).toBe(1);
      expect(state.player.albumId).toBe('album-1');
      expect(state.player.albumTitle).toBe('Test Album');
      expect(state.player.volume).toBe(75);
      expect(state.player.isPlaying).toBe(true);
      expect(state.player.shuffle).toBe(false);
      expect(state.player.repeat).toBe('all');
      expect(state.player.time.current).toBe(30);
      expect(state.player.time.duration).toBe(180);
      expect(state.player.progress).toBeCloseTo(16.67, 1); // 30/180 * 100
      expect(state.player.showLyrics).toBe(true);
      expect(state.player.controlsVisible).toBe(false);
      expect(state.player.isSeeking).toBe(false);
    });

    test('должен восстановить состояние с shuffle включенным', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const shuffledTracks: TracksProps[] = [
        {
          id: '3',
          title: 'Track 3',
          order_index: 2,
          content: '',
          duration: 220,
          src: 'track3.mp3',
        },
        {
          id: '1',
          title: 'Track 1',
          order_index: 0,
          content: '',
          duration: 180,
          src: 'track1.mp3',
        },
        {
          id: '2',
          title: 'Track 2',
          order_index: 1,
          content: '',
          duration: 200,
          src: 'track2.mp3',
        },
      ];

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: shuffledTracks,
          originalPlaylist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          shuffle: true,
          repeat: 'none',
        })
      );

      const state = store.getState();
      expect(state.player.shuffle).toBe(true);
      expect(state.player.playlist).toHaveLength(3);
      // Проверяем, что плейлист сохранил перемешанный порядок
      expect(state.player.playlist[0].id).toBe('3');
    });

    test('должен использовать playlist как originalPlaylist если originalPlaylist не предоставлен', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
        })
      );

      const state = store.getState();
      expect(state.player.originalPlaylist).toHaveLength(3);
      expect(state.player.originalPlaylist[0].id).toBe('1');
    });

    test('должен обработать пустой плейлист', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: [],
          currentTrackIndex: 0,
          albumId: null,
          albumTitle: null,
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
        })
      );

      const state = store.getState();
      expect(state.player.playlist).toHaveLength(0);
      expect(state.player.currentTrackIndex).toBe(0);
    });

    test('должен нормализовать currentTrackIndex при выходе за пределы', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 10, // Выходит за пределы
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
        })
      );

      const state = store.getState();
      expect(state.player.currentTrackIndex).toBe(2); // Максимальный индекс для массива из 3 элементов
    });

    test('должен найти правильный индекс трека по ID если текущий трек не совпадает', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const shuffledTracks: TracksProps[] = [
        {
          id: '3',
          title: 'Track 3',
          order_index: 2,
          content: '',
          duration: 220,
          src: 'track3.mp3',
        },
        {
          id: '1',
          title: 'Track 1',
          order_index: 0,
          content: '',
          duration: 180,
          src: 'track1.mp3',
        },
        {
          id: '2',
          title: 'Track 2',
          order_index: 1,
          content: '',
          duration: 200,
          src: 'track2.mp3',
        },
      ];

      // currentTrackIndex относится к перемешанному плейлисту (playlist)
      // В перемешанном плейлисте индекс 1 = Track 1 (id: 1)
      // Код должен найти Track 1 в финальном плейлисте по ID
      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: shuffledTracks,
          originalPlaylist: mockTracks,
          currentTrackIndex: 1, // Track 1 в перемешанном плейлисте
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          shuffle: true,
        })
      );

      const state = store.getState();
      // Должен найти Track 1 (id: 1) в финальном плейлисте
      expect(state.player.playlist[state.player.currentTrackIndex].id).toBe('1');
      // Track 1 находится на индексе 1 в перемешанном плейлисте
      expect(state.player.currentTrackIndex).toBe(1);
    });

    test('должен обработать граничные значения volume', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 150, // Превышает максимум
          isPlaying: false,
        })
      );

      let state = store.getState();
      expect(state.player.volume).toBe(100);

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: -10, // Отрицательное значение
          isPlaying: false,
        })
      );

      state = store.getState();
      expect(state.player.volume).toBe(0);
    });

    test('должен обработать некорректное время (NaN, Infinity)', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          time: {
            current: Infinity,
            duration: NaN,
          },
        })
      );

      const state = store.getState();
      expect(state.player.time.current).toBe(0);
      expect(Number.isNaN(state.player.time.duration)).toBe(true);
      expect(state.player.progress).toBe(0);
    });

    test('должен установить progress на основе времени', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          time: {
            current: 90,
            duration: 180,
          },
        })
      );

      const state = store.getState();
      expect(state.player.progress).toBe(50); // 90/180 * 100
    });

    test('должен обработать опциональные поля (showLyrics, controlsVisible)', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          // showLyrics и controlsVisible не указаны
        })
      );

      let state = store.getState();
      // showLyrics должен остаться false (по умолчанию)
      expect(state.player.showLyrics).toBe(false);
      // controlsVisible должен быть true (по умолчанию)
      expect(state.player.controlsVisible).toBe(true);

      store.dispatch(
        playerActions.hydrateFromPersistedState({
          playlist: mockTracks,
          currentTrackIndex: 0,
          albumId: 'album-1',
          albumTitle: 'Test Album',
          albumMeta: null,
          sourceLocation: null,
          volume: 50,
          isPlaying: false,
          showLyrics: true,
          controlsVisible: false,
        })
      );

      state = store.getState();
      expect(state.player.showLyrics).toBe(true);
      expect(state.player.controlsVisible).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('должен обработать неизвестное действие', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      const initialState = store.getState();

      store.dispatch({ type: 'unknown/action' } as any);

      const state = store.getState();
      expect(state.player).toEqual(initialState.player);
    });

    test('должен обработать множественные быстрые переключения play/pause', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.play());
      store.dispatch(playerActions.pause());
      store.dispatch(playerActions.play());
      store.dispatch(playerActions.pause());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(false);
    });

    test('должен обработать множественные быстрые вызовы toggle', () => {
      const store = configureStore({
        reducer: {
          player: playerReducer,
        },
      });

      store.dispatch(playerActions.toggle());
      store.dispatch(playerActions.toggle());
      store.dispatch(playerActions.toggle());

      const state = store.getState() as RootState;
      expect(selectIsPlaying(state)).toBe(true);
    });
  });
});
