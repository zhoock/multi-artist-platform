import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { articlesReducer } from '@entities/article/model/articlesSlice';
import { albumsReducer } from '@entities/album/model/albumsSlice';
import { langReducer } from '@shared/model/lang/langSlice';
import { currentArtistReducer } from '@shared/model/currentArtist';
import { LangProvider } from '@app/providers/lang';
import { useArtistPageAccess } from '../useArtistPageAccess';
import type { IAlbums } from '@models';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => {
  const actual = jest.requireActual<typeof import('@shared/lib/auth')>('@shared/lib/auth');
  return {
    ...actual,
    isAuthenticated: jest.fn(() => false),
    getAuthHeader: jest.fn(() => ({})),
    getUser: jest.fn(() => null),
  };
});

import { fetchWithAuthSession } from '@shared/lib/authFetch';

const publishedAlbum: IAlbums = {
  albumId: 'test-album',
  album: 'Test Album',
  artist: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  description: 'Desc',
  cover: 'cover',
  release: { date: '2024-01-01' },
  tracks: [],
  buttons: {},
  details: [],
  isPublished: true,
  isPublic: true,
};

function createWrapper(preloadedState: Record<string, unknown>) {
  const store = configureStore({
    reducer: {
      lang: langReducer,
      articles: articlesReducer,
      albums: albumsReducer,
      currentArtist: currentArtistReducer,
    } as never,
    preloadedState: preloadedState as never,
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <LangProvider>{children}</LangProvider>
      </Provider>
    );
  };
}

describe('useArtistPageAccess — album surface reload', () => {
  beforeEach(() => {
    jest.mocked(fetchWithAuthSession).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          theBand: ['Artist'],
          headerImages: ['https://example.com/hero.jpg'],
          socialLinks: {},
        },
      }),
    } as Response);
  });

  test('не держит isLoading из-за articles idle, когда альбомы уже в store', async () => {
    const { result } = renderHook(() => useArtistPageAccess('test-artist'), {
      wrapper: createWrapper({
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'idle',
          error: null,
          data: [],
          lastUpdated: null,
          lastPublicArtistSlug: null,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
        albums: {
          status: 'succeeded',
          error: null,
          data: [publishedAlbum],
          lastUpdated: Date.now(),
          fetchContextKey: 'public:test-artist',
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
