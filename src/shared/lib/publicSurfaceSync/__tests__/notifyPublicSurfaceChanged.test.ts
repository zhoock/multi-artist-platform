import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockDispatch = jest.fn();
const mockFetchCatalog = jest.fn((arg: unknown) => ({ type: 'catalog', arg }));
const mockFetchArticles = jest.fn((arg: unknown) => ({ type: 'articles', arg }));
const mockFetchAlbumDetails = jest.fn((arg: unknown) => ({ type: 'albumDetails', arg }));
const mockResetAlbumDetails = jest.fn(() => ({ type: 'resetAlbumDetails' }));
const mockReloadPublicArtists = jest.fn(() => Promise.resolve([]));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({
    dispatch: mockDispatch,
    getState: () => ({
      albumDetails: {
        albumId: 'album-1',
        artistSlug: 'test-artist',
        status: 'succeeded',
        data: { albumId: 'album-1' },
      },
      currentArtist: { publicSlug: 'test-artist' },
    }),
  }),
}));

jest.mock('@entities/album', () => ({
  fetchArtistAlbumCatalog: (arg: unknown) => mockFetchCatalog(arg),
  fetchAlbumDetailsPage: (arg: unknown) => mockFetchAlbumDetails(arg),
  resetAlbumDetails: () => mockResetAlbumDetails(),
  markAlbumDetailsStaleMany: jest.fn(),
  selectAlbumDetailsState: (state: { albumDetails: unknown }) => state.albumDetails,
}));

jest.mock('@entities/article', () => ({
  fetchArticles: (arg: unknown) => mockFetchArticles(arg),
}));

jest.mock('@shared/lib/publicArtistsCache', () => ({
  reloadPublicArtists: () => mockReloadPublicArtists(),
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

jest.mock('@shared/model/currentArtist', () => ({
  selectPublicArtistSlug: () => 'test-artist',
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  readPublicArtistSlugFromDashboardModalBackground: () => undefined,
}));

import {
  flushPendingPublicSurfaceSync,
  notifyPublicSurfaceChanged,
  resetPendingPublicSurfaceSyncForTests,
} from '../index';

describe('notifyPublicSurfaceChanged', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockFetchCatalog.mockClear();
    mockFetchArticles.mockClear();
    mockFetchAlbumDetails.mockClear();
    mockReloadPublicArtists.mockClear();
    resetPendingPublicSurfaceSyncForTests();
  });

  test('revalidates catalog and albumDetails for track title/content changes', () => {
    notifyPublicSurfaceChanged({ type: 'trackContentChanged', albumId: 'album-1' });

    expect(mockFetchCatalog).toHaveBeenCalledWith({
      force: true,
      publicArtistSlug: 'test-artist',
    });
    expect(mockFetchAlbumDetails).toHaveBeenCalledWith({
      force: true,
      artistSlug: 'test-artist',
      albumId: 'album-1',
    });
  });

  test('flushPendingPublicSurfaceSync is a no-op without pending work', () => {
    flushPendingPublicSurfaceSync('test-artist');
    expect(mockFetchCatalog).not.toHaveBeenCalled();
  });
});
