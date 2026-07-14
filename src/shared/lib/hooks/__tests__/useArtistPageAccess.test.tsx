import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
import type { IAlbums, TracksProps } from '@models';
import { writeCachedOwnPublicSlug, clearCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('../useArtistHeroHeaderImages', () => ({
  useArtistHeroHeaderImages: jest.fn(() => ({
    headerImages: [],
    isHeaderImagesReady: true,
  })),
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
import { getUser, isAuthenticated } from '@shared/lib/auth';

const mockTrack: TracksProps = {
  id: '1',
  title: 'Track',
  content: '',
  duration: 180,
  src: 'track.mp3',
  order_index: 10,
};

const publishedAlbum: IAlbums = {
  albumId: 'test-album',
  album: 'Test Album',
  artist: 'Test Artist',
  fullName: 'Test Artist — Test Album',
  description: 'Desc',
  cover: 'cover',
  release: { date: '2024-01-01' },
  tracks: [mockTrack],
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

describe('useArtistPageAccess — published surface without releases', () => {
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

  test('показывает опубликованную страницу при публичных статьях без релизов', async () => {
    const { result } = renderHook(() => useArtistPageAccess('test-artist'), {
      wrapper: createWrapper({
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [
            {
              articleId: 'article-1',
              nameArticle: 'Untitled',
              date: '2026-06-13',
              img: '',
              description: '',
              isDraft: false,
              visibility: 'public',
            },
          ],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
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
          data: [],
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
      expect(result.current.showPublished).toBe(true);
      expect(result.current.showArtistPageSurfacePending).toBe(false);
      expect(result.current.hasPublicReleases).toBe(false);
    });
  });
});

describe('useArtistPageAccess — visitor unpublished artist', () => {
  beforeEach(() => {
    jest.mocked(isAuthenticated).mockReturnValue(false);
    jest.mocked(fetchWithAuthSession).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Artist not found',
        code: 'ARTIST_NOT_PUBLISHED',
      }),
    } as Response);
  });

  test('показывает under construction вместо 404, если slug существует без публичного контента', async () => {
    const { result } = renderHook(() => useArtistPageAccess('test-artist'), {
      wrapper: createWrapper({
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
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
          data: [],
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
      expect(result.current.showVisitorUnderConstruction).toBe(true);
      expect(result.current.showNotFound).toBe(false);
    });
  });

  test('показывает 404, если slug не существует', async () => {
    const { result } = renderHook(() => useArtistPageAccess('missing-artist'), {
      wrapper: createWrapper({
        lang: { current: 'ru' },
        currentArtist: { publicSlug: 'missing-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'missing-artist',
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
          data: [],
          lastUpdated: Date.now(),
          fetchContextKey: 'public:missing-artist',
          inFlightFetchContextKey: null,
          catalogArtistMissing: true,
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
      expect(result.current.showNotFound).toBe(true);
      expect(result.current.showVisitorUnderConstruction).toBe(false);
    });
  });
});

describe('useArtistPageAccess — owner onboarding after full content removal', () => {
  beforeEach(() => {
    jest.mocked(isAuthenticated).mockReturnValue(true);
    jest.mocked(getUser).mockReturnValue({ id: 'user-1' } as never);
    writeCachedOwnPublicSlug('user-1', 'test-artist');

    jest.mocked(fetchWithAuthSession).mockImplementation(async (input: RequestInfo | URL) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('user-profile')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { publicSlug: 'test-artist', siteName: 'Band' },
          }),
        } as Response;
      }
      if (href.includes('articles-api')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (href.includes('/api/albums')) {
        return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
  });

  afterEach(() => {
    clearCachedOwnPublicSlug();
    jest.mocked(isAuthenticated).mockReturnValue(false);
    jest.mocked(getUser).mockReturnValue(null);
  });

  test('показывает onboarding, если дашборд пуст, а публичный кэш ещё устарел', async () => {
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
            status: 'succeeded',
            error: null,
            data: [],
            lastUpdated: Date.now(),
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
            status: 'succeeded',
            error: null,
            data: [],
            lastUpdated: Date.now(),
            inFlightFetchContextKey: null,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.showOnboarding).toBe(true);
      expect(result.current.showOwnerUnderConstruction).toBe(false);
    });
  });
});

describe('useArtistPageAccess — owner builder eligibility', () => {
  beforeEach(() => {
    jest.mocked(isAuthenticated).mockReturnValue(true);
    jest.mocked(getUser).mockReturnValue({ id: 'owner-1' } as never);
    writeCachedOwnPublicSlug('owner-1', 'test-artist');
    jest.mocked(fetchWithAuthSession).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          publicSlug: 'test-artist',
          theBand: ['Bio paragraph'],
          headerImages: [],
          socialLinks: {},
        },
      }),
    } as Response);
  });

  afterEach(() => {
    clearCachedOwnPublicSlug();
  });

  test('владелец после onboarding видит builder без pending surface', async () => {
    const { result } = renderHook(() => useArtistPageAccess('test-artist'), {
      wrapper: createWrapper({
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          lastPublicArtistSlug: 'test-artist',
          dashboard: {
            status: 'succeeded',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
        albums: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          fetchContextKey: 'public:test-artist',
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'succeeded',
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
      expect(result.current.isOwner).toBe(true);
      expect(result.current.ownerStillNeedsOnboarding).toBe(false);
      expect(result.current.showArtistPageSurfacePending).toBe(false);
      expect(result.current.showPublished).toBe(true);
    });
  });
});
