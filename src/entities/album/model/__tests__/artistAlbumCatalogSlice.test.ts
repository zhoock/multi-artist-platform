import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { artistAlbumCatalogReducer, fetchArtistAlbumCatalog } from '../artistAlbumCatalogSlice';
import { currentArtistReducer } from '@shared/model/currentArtist';

const mockFetchWithAuthSession = jest.fn();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => mockFetchWithAuthSession(...args),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => null,
}));

function createStore(preloaded?: Partial<ReturnType<typeof artistAlbumCatalogReducer>>) {
  return configureStore({
    reducer: {
      artistAlbumCatalog: artistAlbumCatalogReducer,
      currentArtist: currentArtistReducer,
    } as never,
    preloadedState: {
      artistAlbumCatalog: {
        status: 'idle',
        error: null,
        data: [],
        lastUpdated: null,
        fetchContextKey: null,
        artistMissing: false,
        ...preloaded,
      },
      currentArtist: { publicSlug: 'beatles' },
    } as never,
  });
}

describe('fetchArtistAlbumCatalog revalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithAuthSession.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    } as never);
  });

  test('without force, succeeded cache skips network', async () => {
    const store = createStore({
      status: 'succeeded',
      fetchContextKey: 'public:beatles',
      data: [
        {
          albumId: 'rubber-soul',
          slug: 'rubber-soul',
          title: 'Rubber Soul',
          cover: 'c',
          releaseDate: '1965',
          trackCount: 1,
          duration: 100,
          userId: 'u1',
          isPublished: true,
          isPublic: true,
          hasLockedTracks: false,
          hasStems: false,
        },
      ],
    });

    await store.dispatch(fetchArtistAlbumCatalog({ publicArtistSlug: 'beatles' }));
    expect(mockFetchWithAuthSession).not.toHaveBeenCalled();
  });

  test('force revalidates after succeeded cache (SPA re-entry)', async () => {
    const store = createStore({
      status: 'succeeded',
      fetchContextKey: 'public:beatles',
      data: [
        {
          albumId: 'rubber-soul',
          slug: 'rubber-soul',
          title: 'Rubber Soul',
          cover: 'c',
          releaseDate: '1965',
          trackCount: 1,
          duration: 100,
          userId: 'u1',
          isPublished: true,
          isPublic: true,
          hasLockedTracks: false,
          hasStems: false,
        },
      ],
    });

    await store.dispatch(fetchArtistAlbumCatalog({ publicArtistSlug: 'beatles', force: true }));
    expect(mockFetchWithAuthSession).toHaveBeenCalledTimes(1);
    expect(store.getState().artistAlbumCatalog.data).toEqual([]);
  });
});
