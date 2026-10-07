import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { startUniverseArtistPlayback } from '../startUniverseArtistPlayback';

jest.mock('../fetchUniverseArtistPlayQueue', () => ({
  fetchUniverseArtistPlayQueueBootstrap: jest.fn(),
  fetchUniverseArtistPlayQueueTail: jest.fn(),
}));

jest.mock('@shared/lib/profileDisplayName', () => ({
  fetchPublicProfileForDisplay: jest.fn(async () => ({ displayName: 'Artist Name' })),
  formatAlbumDisplayFullName: (a: string, b: string) => `${a} — ${b}`,
  readStoredProfileDisplayName: () => '',
  siteArtistUiLabel: (name: string) => name.trim() || '—',
}));

jest.mock('@shared/lib/publicArtistsCache', () => ({
  getPublicArtistDisplayName: () => '',
}));

jest.mock('@entities/lyrics', () => ({
  scheduleProgressiveLyricsAfterArtistPlayStart: jest.fn(),
}));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({
    getState: () => ({
      player: {
        albumMeta: {
          albumId: 'album-1',
          album: 'One',
          artist: '—',
          fullName: '— — One',
          cover: 'c1',
          publicSlug: 'demo-artist',
          userId: 'u1',
        },
      },
      trackLyrics: { entities: {} },
    }),
  }),
}));

import {
  fetchUniverseArtistPlayQueueBootstrap,
  fetchUniverseArtistPlayQueueTail,
} from '../fetchUniverseArtistPlayQueue';

const mockBootstrap = fetchUniverseArtistPlayQueueBootstrap as jest.MockedFunction<
  typeof fetchUniverseArtistPlayQueueBootstrap
>;
const mockTail = fetchUniverseArtistPlayQueueTail as jest.MockedFunction<
  typeof fetchUniverseArtistPlayQueueTail
>;

describe('startUniverseArtistPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('dispatches playlist and requestPlay before tail fetch resolves', async () => {
    jest.useFakeTimers();
    let resolveTail!: (v: typeof bootstrap.playlist) => void;
    const tailPromise = new Promise<typeof bootstrap.playlist>((r) => {
      resolveTail = r;
    });

    const bootstrap = {
      firstAlbum: {
        albumId: 'album-1',
        slug: 'album-1',
        title: 'One',
        cover: 'c1',
        userId: 'u1',
        dbAlbumId: 'db1',
        description: '',
        details: [],
        release: { date: '2024-01-01' },
        artwork: {
          photographer: '',
          photographerURL: '',
          designer: '',
          designerURL: '',
        },
        purchase: { allowDownloadSale: '', regularPrice: '0', currency: 'RUB' },
        serviceButtons: {},
        visibility: { isPublished: true, isPublic: true },
        tracks: [],
      },
      playlist: [
        {
          id: 't1',
          title: 'T1',
          duration: 100,
          src: 't1.mp3',
          albumId: 'album-1',
          queueAlbumMeta: {
            albumId: 'album-1',
            album: 'One',
            cover: 'c1',
            userId: 'u1',
            fullName: null,
          },
        },
      ],
      tailStartIndex: 1,
      visibleAlbums: [],
      resolvedAlbums: [],
      detailsInflight: Promise.resolve(),
    };

    mockBootstrap.mockResolvedValue(bootstrap);
    mockTail.mockReturnValue(tailPromise as never);

    const store = configureStore({ reducer: { player: playerReducer } });
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    const startPromise = startUniverseArtistPlayback({
      artistSlug: 'demo-artist',
      lang: 'en',
      dispatch: store.dispatch,
      sourceLocation: { pathname: '/en', search: '?artist=demo-artist' },
    });

    await startPromise;

    expect(store.getState().player.playlist).toHaveLength(1);
    expect(store.getState().player.isPlaying).toBe(false);
    expect(dispatchSpy.mock.calls.some(([a]) => a.type === 'player/requestPlay')).toBe(true);
    expect(mockTail).not.toHaveBeenCalled();
    expect(mockBootstrap).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1200);
    expect(mockTail).toHaveBeenCalled();

    resolveTail([
      ...bootstrap.playlist,
      {
        id: 't2',
        title: 'T2',
        duration: 100,
        src: 't2.mp3',
        albumId: 'album-2',
        queueAlbumMeta: {
          albumId: 'album-2',
          album: 'Two',
          cover: 'c2',
          userId: 'u1',
          fullName: null,
        },
      },
    ]);

    await tailPromise;
    await Promise.resolve();

    expect(store.getState().player.playlist.map((t) => t.id)).toEqual(['t1', 't2']);
    jest.useRealTimers();
  });

  test('does not re-enter bootstrap or append in a loop for multi-album bootstrap', async () => {
    jest.useFakeTimers();

    const bootstrap = {
      firstAlbum: {
        albumId: 'album-1',
        slug: 'album-1',
        title: 'One',
        cover: 'c1',
        userId: 'u1',
        dbAlbumId: 'db1',
        description: '',
        details: [],
        release: { date: '2024-01-01' },
        artwork: {
          photographer: '',
          photographerURL: '',
          designer: '',
          designerURL: '',
        },
        purchase: { allowDownloadSale: '', regularPrice: '0', currency: 'RUB' },
        serviceButtons: {},
        visibility: { isPublished: true, isPublic: true },
        tracks: [],
      },
      playlist: [
        {
          id: 't1',
          title: 'T1',
          duration: 100,
          src: 't1.mp3',
          albumId: 'album-1',
          queueAlbumMeta: {
            albumId: 'album-1',
            album: 'One',
            cover: 'c1',
            userId: 'u1',
            fullName: null,
          },
        },
      ],
      tailStartIndex: 1,
      visibleAlbums: [{ albumId: 'album-1' }, { albumId: 'album-2' }] as never,
      resolvedAlbums: [],
      detailsInflight: Promise.resolve(),
    };

    mockBootstrap.mockResolvedValue(bootstrap);
    mockTail.mockResolvedValue([
      ...bootstrap.playlist,
      {
        id: 't2',
        title: 'T2',
        duration: 100,
        src: 't2.mp3',
        albumId: 'album-2',
        queueAlbumMeta: {
          albumId: 'album-2',
          album: 'Two',
          cover: 'c2',
          userId: 'u1',
          fullName: null,
        },
      },
    ]);

    const store = configureStore({ reducer: { player: playerReducer } });
    const appendSpy = jest.spyOn(store, 'dispatch');

    await startUniverseArtistPlayback({
      artistSlug: 'demo-artist',
      lang: 'en',
      dispatch: store.dispatch,
      sourceLocation: { pathname: '/en' },
    });

    await jest.advanceTimersByTimeAsync(1200);
    await Promise.resolve();

    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockTail).toHaveBeenCalledTimes(1);
    const appendActions = appendSpy.mock.calls.filter(
      ([a]) => a.type === 'player/appendArtistQueueTracks'
    );
    expect(appendActions).toHaveLength(1);
    expect(store.getState().player.playlist).toHaveLength(2);

    jest.useRealTimers();
  });
});
