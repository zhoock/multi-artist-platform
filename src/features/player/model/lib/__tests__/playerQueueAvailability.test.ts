import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerActions, playerReducer } from '../../slice/playerSlice';
import { playerListenerMiddleware } from '../../middleware/playerListeners';
import { initialPlayerState, type PlayerState } from '../../types/playerSchema';
import { fetchAlbumDetailsPage } from '@entities/album/model/albumDetailsSlice';
import type { AlbumDetails } from '@entities/album/model/albumDetails';
import { resolvePlayerQueueAvailabilityUpdate } from '../playerQueueAvailability';
import { verifyRestoredPlayerQueue } from '../verifyRestoredPlayerQueue';

jest.mock('@features/player/model/lib/audioController', () => ({
  audioController: {
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    setSource: jest.fn(),
    setCurrentTime: jest.fn(),
    setVolume: jest.fn(),
    ensureElementInDocument: jest.fn(),
    element: {
      readyState: 0,
      src: '',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  },
}));

jest.mock('@shared/lib/analytics', () => ({ gaEvent: jest.fn() }));

jest.mock('@entities/album/api/fetchAlbumDetails', () => {
  const actual = jest.requireActual<typeof import('@entities/album/api/fetchAlbumDetails')>(
    '@entities/album/api/fetchAlbumDetails'
  );
  return { ...actual, fetchAlbumDetails: jest.fn() };
});

import { audioController } from '@features/player/model/lib/audioController';
import { AlbumDetailsFetchError, fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';

const mockAudio = audioController as jest.Mocked<typeof audioController>;
const mockFetchAlbumDetails = fetchAlbumDetails as jest.MockedFunction<typeof fetchAlbumDetails>;

const OWNER_ID = 'beatles-user';
const ALBUM_ID = 'rubber-soul';

const queueTrack = (id: string, title: string) => ({
  id,
  albumId: ALBUM_ID,
  title,
  duration: 120,
  src: `https://cdn.example/${id}.opus`,
});

function playingState(overrides: Partial<PlayerState> = {}): PlayerState {
  const playlist = [
    queueTrack('norwegian-wood', 'Norwegian Wood'),
    queueTrack('michelle', 'Michelle'),
  ];
  return {
    ...initialPlayerState,
    playlist,
    originalPlaylist: [...playlist],
    currentTrackIndex: 0,
    isPlaying: true,
    progress: 40,
    time: { current: 48, duration: 120 },
    albumId: ALBUM_ID,
    albumTitle: 'Rubber Soul',
    albumMeta: {
      albumId: ALBUM_ID,
      userId: OWNER_ID,
      publicSlug: 'beatles',
      album: 'Rubber Soul',
      artist: 'The Beatles',
      fullName: 'The Beatles — Rubber Soul',
      cover: 'rubber-soul-cover',
    },
    sourceLocation: { pathname: '/albums/rubber-soul', search: '?artist=beatles' },
    ...overrides,
  };
}

function albumDetails(trackIds: string[], userId = OWNER_ID): AlbumDetails {
  return {
    albumId: ALBUM_ID,
    slug: ALBUM_ID,
    userId,
    title: 'Rubber Soul',
    tracks: trackIds.map((id) => ({ id })),
  } as unknown as AlbumDetails;
}

function createStore(player: PlayerState) {
  return configureStore({
    reducer: { player: playerReducer, albumDetails: (s: unknown = null) => s } as never,
    preloadedState: { player } as never,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).prepend(playerListenerMiddleware.middleware),
  });
}

const detailsFulfilled = (album: AlbumDetails | null, extra: Record<string, unknown> = {}) =>
  fetchAlbumDetailsPage.fulfilled(
    {
      album,
      fetchContextKey: `albumDetails:beatles:${ALBUM_ID}`,
      artistSlug: 'beatles',
      albumId: ALBUM_ID,
      notFound: album === null,
      errorCode: album === null ? 'ALBUM_NOT_FOUND' : null,
      ...extra,
    },
    'request-id',
    { artistSlug: 'beatles', albumId: ALBUM_ID }
  );

describe('mini-player clears tracks that are no longer publicly available', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('5 — the only track disappears → session cleared (no title / cover / way to resume)', () => {
    const player = playerReducer(
      playingState({
        playlist: [queueTrack('norwegian-wood', 'Norwegian Wood')],
        originalPlaylist: [queueTrack('norwegian-wood', 'Norwegian Wood')],
      }),
      playerActions.removeUnavailableTracks({ albumIds: [ALBUM_ID], availableTrackIds: [] })
    );

    expect(player.playlist).toEqual([]);
    expect(player.originalPlaylist).toEqual([]);
    expect(player.isPlaying).toBe(false);
    expect(player.albumMeta).toBeNull();
    expect(player.albumId).toBeNull();
    expect(player.albumTitle).toBeNull();
    expect(player.time.current).toBe(0);
  });

  test('current track removed, siblings remain → stops and points at the next remaining track', () => {
    const player = playerReducer(
      playingState(),
      playerActions.removeUnavailableTracks({
        albumIds: [ALBUM_ID],
        availableTrackIds: ['michelle'],
      })
    );

    expect(player.playlist.map((t) => t.id)).toEqual(['michelle']);
    expect(player.currentTrackIndex).toBe(0);
    expect(player.isPlaying).toBe(false);
    expect(player.progress).toBe(0);
    expect(player.albumMeta?.albumId).toBe(ALBUM_ID);
  });

  test('a still-available current track keeps playing; only the missing sibling is dropped', () => {
    const player = playerReducer(
      playingState({ currentTrackIndex: 1 }),
      playerActions.removeUnavailableTracks({
        albumIds: [ALBUM_ID],
        availableTrackIds: ['michelle'],
      })
    );

    expect(player.playlist.map((t) => t.id)).toEqual(['michelle']);
    expect(player.currentTrackIndex).toBe(0);
    expect(player.isPlaying).toBe(true);
    expect(player.time.current).toBe(48);
  });

  test('details of another album never touch the queue', () => {
    const before = playingState();
    const after = playerReducer(
      before,
      playerActions.removeUnavailableTracks({ albumIds: ['revolver'], availableTrackIds: [] })
    );
    expect(after).toEqual(before);
  });

  test('same album slug under a different artist is ignored', () => {
    expect(
      resolvePlayerQueueAvailabilityUpdate(playingState(), {
        album: albumDetails([], 'someone-else'),
        artistSlug: 'other-artist',
        albumId: ALBUM_ID,
      })
    ).toBeNull();
  });

  test('5 — fresh album details without the playing track → audio stopped and persisted session wiped', () => {
    localStorage.setItem('playerState', '{"stale":true}');
    const store = createStore(
      playingState({
        playlist: [queueTrack('norwegian-wood', 'Norwegian Wood')],
        originalPlaylist: [queueTrack('norwegian-wood', 'Norwegian Wood')],
      })
    );

    store.dispatch(detailsFulfilled(albumDetails([])));

    const { player } = store.getState() as { player: PlayerState };
    expect(player.playlist).toEqual([]);
    expect(player.albumMeta).toBeNull();
    expect(mockAudio.pause).toHaveBeenCalled();
    expect(mockAudio.setSource).toHaveBeenCalledWith('', false);
    expect(localStorage.getItem('playerState')).toBeNull();
  });

  test('album 404 (no public tracks left) clears the queue of that album', () => {
    const store = createStore(playingState());

    store.dispatch(detailsFulfilled(null));

    expect((store.getState() as { player: PlayerState }).player.playlist).toEqual([]);
  });

  test('cold restore: persisted track that no longer exists is cleared after verification', async () => {
    mockFetchAlbumDetails.mockRejectedValueOnce(
      new AlbumDetailsFetchError('Album not found', 404, 'ALBUM_NOT_FOUND')
    );
    const store = createStore(playingState({ isPlaying: false }));

    await verifyRestoredPlayerQueue(store.dispatch as never, store.getState as never);

    expect(mockFetchAlbumDetails).toHaveBeenCalledWith('beatles', ALBUM_ID);
    expect((store.getState() as { player: PlayerState }).player.albumMeta).toBeNull();
  });

  test('cold restore: a network failure keeps the queue (no false clearing)', async () => {
    mockFetchAlbumDetails.mockRejectedValueOnce(new Error('offline'));
    const store = createStore(playingState({ isPlaying: false }));

    await verifyRestoredPlayerQueue(store.dispatch as never, store.getState as never);

    expect((store.getState() as { player: PlayerState }).player.playlist).toHaveLength(2);
  });
});
