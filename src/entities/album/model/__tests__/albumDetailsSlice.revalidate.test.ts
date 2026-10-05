import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { createMockAlbumDetails } from './albumDetailsFixtures';
import { albumDetailsReducer, fetchAlbumDetailsPage } from '../albumDetailsSlice';
import { resetAlbumDetailsStaleForTests } from '../albumDetailsStale';

const mockFetchWithAuthSession = jest.fn();

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => mockFetchWithAuthSession(...args),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => null,
}));

function createStore() {
  return configureStore({
    reducer: {
      albumDetails: albumDetailsReducer,
    } as never,
  });
}

describe('fetchAlbumDetailsPage force revalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAlbumDetailsStaleForTests();
    mockFetchWithAuthSession.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, code: 'ALBUM_NOT_FOUND' }),
    } as never);
  });

  test('force refetches when slot already succeeded (SPA re-entry)', async () => {
    const store = createStore();
    const album = createMockAlbumDetails({
      albumId: 'rubber-soul',
      slug: 'rubber-soul',
      title: 'Rubber Soul',
    });
    store.dispatch({
      type: fetchAlbumDetailsPage.fulfilled.type,
      payload: {
        album,
        fetchContextKey: 'albumDetails:beatles:rubber-soul',
        artistSlug: 'beatles',
        albumId: 'rubber-soul',
        notFound: false,
        errorCode: null,
      },
    });

    await store.dispatch(
      fetchAlbumDetailsPage({
        artistSlug: 'beatles',
        albumId: 'rubber-soul',
        force: true,
      })
    );

    expect(mockFetchWithAuthSession).toHaveBeenCalledTimes(1);
    expect(store.getState().albumDetails.data).toBeNull();
    expect(store.getState().albumDetails.errorCode).toBe('ALBUM_NOT_FOUND');
  });
});
