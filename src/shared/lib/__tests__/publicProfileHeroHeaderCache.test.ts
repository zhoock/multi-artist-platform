import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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
  selectPublicArtistSlug: () => null,
}));

jest.mock('@shared/api/storage', () => ({
  normalizeProxyImageUrl: (url: string) => url,
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  fetchPublicProfileForDisplay,
  invalidatePublicProfileDisplayCache,
  prefetchPublicProfileForDisplay,
} from '@shared/lib/profileDisplayName';
import {
  fetchArtistHeroHeaderImages,
  getCachedArtistHeroHeaderImages,
} from '@shared/lib/artistHeroHeaderImages';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Response>
>;

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

describe('profileDisplayName + hero headerImages cache', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    invalidatePublicProfileDisplayCache();
  });

  test('completed prefetch fills headerImages cache — no second user-profile for Hero', async () => {
    mockProfileResponse(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);

    await fetchPublicProfileForDisplay('ru', 'test-artist');

    expect(getCachedArtistHeroHeaderImages('test-artist')).toEqual([
      '/api/proxy-image?path=users/u1/hero/cover-1920.jpg',
    ]);

    mockFetch.mockClear();

    const headerImages = await fetchArtistHeroHeaderImages('test-artist');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(headerImages).toEqual(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);
  });

  test('in-flight loader prefetch deduplicates Hero headerImages fetch', async () => {
    mockProfileResponse(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);

    prefetchPublicProfileForDisplay('ru', 'test-artist');

    expect(getCachedArtistHeroHeaderImages('test-artist')).toBeNull();

    const headerImages = await fetchArtistHeroHeaderImages('test-artist');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(headerImages).toEqual(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);
  });
});
