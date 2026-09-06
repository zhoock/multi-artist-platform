import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: jest.fn(() => ({})),
}));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({ getState: () => ({}) }),
}));

jest.mock('@shared/model/currentArtist', () => ({
  selectPublicArtistSlug: () => 'test-artist',
}));

jest.mock('@shared/api/storage', () => ({
  normalizeProxyImageUrl: (url: string) => url,
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  fetchArtistHeroHeaderImages,
  getCachedArtistHeroHeaderImages,
  invalidateArtistHeroHeaderImagesCache,
} from '@shared/lib/artistHeroHeaderImages';
import {
  invalidatePublicArtistsCache,
  prefetchPublicArtists,
} from '@shared/lib/publicArtistsCache';
import {
  fetchPublicProfileForDisplay,
  invalidatePublicProfileDisplayCache,
  prefetchPublicProfileForDisplay,
} from '@shared/lib/profileDisplayName';
import { useArtistHeroHeaderImages } from '../useArtistHeroHeaderImages';
import { notifyPublicSurfaceChanged } from '@shared/lib/publicSurfaceSync';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Response>
>;

const HERO_URL = '/api/proxy-image?path=users/u1/hero/cover-1920.jpg';
const NEW_HERO_URL = '/api/proxy-image?path=users/u1/hero/cover-new-1920.jpg';
const OLD_HERO_URL = '/api/proxy-image?path=users/u1/hero/cover-old-1920.jpg';

function mockProfileResponse(headerImages: string[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        siteName: 'Test Artist',
        publicSlug: 'test-artist',
        headerImages,
      },
    }),
  } as Response);
}

function mockPublicArtistsResponse(headerImages: string[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: [
        {
          userId: 'u1',
          name: 'Test Artist',
          publicSlug: 'test-artist',
          genreCode: 'rock',
          headerImages,
        },
      ],
    }),
  } as Response);
}

describe('useArtistHeroHeaderImages', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    invalidatePublicProfileDisplayCache();
    invalidateArtistHeroHeaderImagesCache();
    invalidatePublicArtistsCache();
  });

  test('cold load with in-flight profile: exposes public-artists headerImages before profile resolves', async () => {
    let resolveProfile!: () => void;
    const profileGate = new Promise<void>((resolve) => {
      resolveProfile = resolve;
    });

    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/user-profile')) {
        return profileGate.then(
          () =>
            ({
              ok: true,
              json: async () => ({
                success: true,
                data: {
                  siteName: 'Test Artist',
                  publicSlug: 'test-artist',
                  headerImages: [HERO_URL],
                },
              }),
            }) as Response
        );
      }
      if (String(url).includes('/api/public-artists')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                userId: 'u1',
                name: 'Test Artist',
                publicSlug: 'test-artist',
                genreCode: 'rock',
                headerImages: [HERO_URL],
              },
            ],
          }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    prefetchPublicProfileForDisplay('ru', 'test-artist');
    prefetchPublicArtists();

    const { result } = renderHook(() => useArtistHeroHeaderImages('test-artist'));

    expect(result.current.isHeaderImagesReady).toBe(false);

    await waitFor(() => {
      expect(result.current.headerImages).toEqual([HERO_URL]);
    });

    resolveProfile();

    await waitFor(() => {
      expect(result.current.isHeaderImagesReady).toBe(true);
    });

    expect(getCachedArtistHeroHeaderImages('test-artist')).toEqual([HERO_URL]);

    mockFetch.mockClear();
    await fetchArtistHeroHeaderImages('test-artist');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('cache populated: returns headerImages synchronously on mount', async () => {
    mockProfileResponse([HERO_URL]);
    await fetchPublicProfileForDisplay('ru', 'test-artist');

    const { result } = renderHook(() => useArtistHeroHeaderImages('test-artist'));

    expect(result.current.isHeaderImagesReady).toBe(true);
    expect(result.current.headerImages).toEqual([HERO_URL]);
  });

  test('public-artists only path before profile cache is set', async () => {
    mockFetch.mockImplementation((url) => {
      if (String(url).includes('/api/user-profile')) {
        return Promise.resolve({ ok: false } as Response);
      }
      if (String(url).includes('/api/public-artists')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                userId: 'u1',
                name: 'Test Artist',
                publicSlug: 'test-artist',
                genreCode: 'rock',
                headerImages: [HERO_URL],
              },
            ],
          }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    prefetchPublicArtists();

    const { result } = renderHook(() => useArtistHeroHeaderImages('test-artist'));

    await waitFor(() => {
      expect(result.current.headerImages).toEqual([HERO_URL]);
    });
  });

  test('dashboard headerImages save updates open artist page without reload', async () => {
    mockProfileResponse([OLD_HERO_URL]);
    await fetchPublicProfileForDisplay('ru', 'test-artist');

    const { result } = renderHook(() => useArtistHeroHeaderImages('test-artist'));

    expect(result.current.headerImages).toEqual([OLD_HERO_URL]);

    notifyPublicSurfaceChanged(
      { type: 'profileChanged', aspects: ['headerImages'] },
      { headerImages: [NEW_HERO_URL], artistSlug: 'test-artist' }
    );

    await waitFor(() => {
      expect(result.current.headerImages).toEqual([NEW_HERO_URL]);
    });
    expect(getCachedArtistHeroHeaderImages('test-artist')).toEqual([NEW_HERO_URL]);
  });

  test('delete then upload save replaces stale hero URL without reload', async () => {
    mockProfileResponse([OLD_HERO_URL]);
    await fetchPublicProfileForDisplay('ru', 'test-artist');

    const { result } = renderHook(() => useArtistHeroHeaderImages('test-artist'));
    expect(result.current.headerImages).toEqual([OLD_HERO_URL]);

    notifyPublicSurfaceChanged(
      { type: 'profileChanged', aspects: ['headerImages'] },
      { headerImages: [], artistSlug: 'test-artist' }
    );

    await waitFor(() => {
      expect(result.current.headerImages).toEqual([]);
    });

    notifyPublicSurfaceChanged(
      { type: 'profileChanged', aspects: ['headerImages'] },
      { headerImages: [NEW_HERO_URL], artistSlug: 'test-artist' }
    );

    await waitFor(() => {
      expect(result.current.headerImages).toEqual([NEW_HERO_URL]);
    });
  });
});
