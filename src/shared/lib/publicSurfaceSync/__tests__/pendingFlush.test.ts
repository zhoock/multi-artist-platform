import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockDispatch = jest.fn();
const mockFetchCatalog = jest.fn((arg: unknown) => ({ type: 'catalog', arg }));
const mockFetchArticles = jest.fn((arg: unknown) => ({ type: 'articles', arg }));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({
    dispatch: mockDispatch,
    getState: () => ({
      albumDetails: { albumId: null, artistSlug: null, status: 'idle', data: null },
      currentArtist: { publicSlug: null },
    }),
  }),
}));

jest.mock('@entities/album', () => ({
  fetchArtistAlbumCatalog: (arg: unknown) => mockFetchCatalog(arg),
  fetchAlbumDetailsPage: jest.fn((arg: unknown) => ({ type: 'albumDetails', arg })),
  resetAlbumDetails: jest.fn(() => ({ type: 'resetAlbumDetails' })),
  markAlbumDetailsStaleMany: jest.fn(),
  selectAlbumDetailsState: (state: { albumDetails: unknown }) => state.albumDetails,
}));

jest.mock('@entities/article', () => ({
  fetchArticles: (arg: unknown) => mockFetchArticles(arg),
}));

jest.mock('@shared/lib/publicArtistsCache', () => ({
  reloadPublicArtists: jest.fn(() => Promise.resolve([])),
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
  selectPublicArtistSlug: () => null,
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  readPublicArtistSlugFromDashboardModalBackground: () => undefined,
}));

import {
  flushPendingPublicSurfaceSync,
  hasPendingPublicSurfaceSync,
  notifyPublicSurfaceChanged,
  resetPendingPublicSurfaceSyncForTests,
} from '../index';

describe('pending public surface sync', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockFetchCatalog.mockClear();
    mockFetchArticles.mockClear();
    resetPendingPublicSurfaceSyncForTests();
  });

  test('queues when slug cannot be resolved, then flushes on close with slug', () => {
    notifyPublicSurfaceChanged({ type: 'trackContentChanged', albumId: 'album-1' });
    expect(hasPendingPublicSurfaceSync()).toBe(true);
    expect(mockFetchCatalog).not.toHaveBeenCalled();

    flushPendingPublicSurfaceSync('test-artist');
    expect(hasPendingPublicSurfaceSync()).toBe(false);
    expect(mockFetchCatalog).toHaveBeenCalledWith({
      force: true,
      publicArtistSlug: 'test-artist',
    });
  });
});
