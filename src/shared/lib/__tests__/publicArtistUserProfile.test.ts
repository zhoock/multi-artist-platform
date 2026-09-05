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

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { loadHeaderImagesFromDatabase } from '@entities/user/lib';
import {
  fetchPublicArtistUserProfile,
  invalidatePublicArtistUserProfileCache,
  publicArtistUserProfileCacheKey,
} from '@shared/lib/publicArtistUserProfile';
import { fetchPublicProfileForDisplay } from '@shared/lib/profileDisplayName';
import { fetchArtistHeroHeaderImages } from '@shared/lib/artistHeroHeaderImages';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Response>
>;

function mockProfileResponse() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        siteName: 'Test Artist',
        publicSlug: 'test-artist',
        headerImages: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
        theBand: ['Bio'],
        socialLinks: { instagram: 'https://instagram.com/test' },
      },
    }),
  } as Response);
}

describe('publicArtistUserProfile shared cache', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    invalidatePublicArtistUserProfileCache();
  });

  test('cache key treats missing lang as ru', () => {
    expect(publicArtistUserProfileCacheKey('test-artist')).toBe('test-artist:ru');
    expect(publicArtistUserProfileCacheKey('test-artist', 'ru')).toBe('test-artist:ru');
  });

  test('parallel consumers share one HTTP request', async () => {
    mockProfileResponse();

    const [fromDisplay, fromHeaderImages, fromEntityLoader] = await Promise.all([
      fetchPublicProfileForDisplay('ru', 'test-artist'),
      fetchArtistHeroHeaderImages('test-artist'),
      loadHeaderImagesFromDatabase(false, { artistSlugOverride: 'test-artist' }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(fromDisplay.displayName).toBe('Test Artist');
    expect(fromHeaderImages).toEqual(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);
    expect(fromEntityLoader).toEqual(['/api/proxy-image?path=users/u1/hero/cover-1920.jpg']);
  });

  test('requests with and without lang query share inflight when lang defaults to ru', async () => {
    mockProfileResponse();

    const withLang = fetchPublicArtistUserProfile('test-artist', { lang: 'ru' });
    const withoutLang = fetchPublicArtistUserProfile('test-artist');

    await Promise.all([withLang, withoutLang]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('lang=ru');
  });
});
