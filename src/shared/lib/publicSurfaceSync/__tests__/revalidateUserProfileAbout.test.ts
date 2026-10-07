import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({ dispatch: jest.fn(), getState: () => ({}) }),
}));

jest.mock('@entities/album', () => ({
  fetchArtistAlbumCatalog: jest.fn(),
  fetchAlbumDetailsPage: jest.fn(),
  markAlbumDetailsStaleMany: jest.fn(),
  selectAlbumDetailsState: () => ({ status: 'idle' }),
}));

jest.mock('@entities/article', () => ({
  fetchArticles: jest.fn(),
}));

jest.mock('@shared/lib/publicArtistsCache', () => ({
  reloadPublicArtists: jest.fn(),
}));

jest.mock('@shared/lib/artistHeroHeaderImages', () => ({
  invalidateArtistHeroHeaderImagesCache: jest.fn(),
}));

jest.mock('@shared/lib/profileDisplayName', () => ({
  invalidatePublicProfileDisplayCache: jest.fn(),
}));

jest.mock('@shared/lib/payment/artistMonetizationEvents', () => ({
  dispatchArtistMonetizationChanged: jest.fn(),
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: jest.fn(() => ({})),
}));

jest.mock('@shared/model/currentArtist', () => ({
  selectPublicArtistSlug: () => 'test-artist',
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  readPublicArtistSlugFromDashboardModalBackground: () => undefined,
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { loadTheBandFromDatabase } from '@entities/user/lib';
import {
  fetchPublicArtistUserProfile,
  invalidatePublicArtistUserProfileCache,
} from '@shared/lib/publicArtistUserProfile';
import { notifyPublicSurfaceChanged } from '../index';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Response>
>;

function mockTheBandResponse(theBand: string[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        publicSlug: 'test-artist',
        theBand,
      },
    }),
  } as Response);
}

describe('about save → userProfile cache invalidation → public AboutSection data', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    invalidatePublicArtistUserProfileCache();
  });

  test('notifyPublicSurfaceChanged(about) drops stale cache so theBand reload fetches fresh text', async () => {
    mockTheBandResponse(['Старый текст о группе']);
    await fetchPublicArtistUserProfile('test-artist', { lang: 'ru' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    notifyPublicSurfaceChanged({ type: 'profileChanged', aspects: ['about'] });

    mockTheBandResponse(['Новый текст о группе']);
    const paragraphs = await loadTheBandFromDatabase('ru', {
      artistSlugOverride: 'test-artist',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(paragraphs).toEqual(['Новый текст о группе']);
  });
});
