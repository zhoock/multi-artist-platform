import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockPatchCachedPublicArtistHeaderImages = jest.fn();
const mockSetCachedPublicArtistUserProfileHeaderImages = jest.fn();

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
  patchCachedPublicArtistHeaderImages: (slug: string, images: string[]) =>
    mockPatchCachedPublicArtistHeaderImages(slug, images),
  reloadPublicArtists: jest.fn(),
}));

jest.mock('@shared/lib/publicArtistUserProfile', () => ({
  clearPublicArtistUserProfileInflight: jest.fn(),
  invalidatePublicArtistUserProfileCache: jest.fn(),
  setCachedPublicArtistUserProfileHeaderImages: (slug: string, images: string[]) =>
    mockSetCachedPublicArtistUserProfileHeaderImages(slug, images),
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

import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';
import { executePublicSurfaceRevalidate } from '../revalidate';

const OWNER = 'af97f741-1111-4222-8333-444444444444';
const CANONICAL = `users/${OWNER}/hero/hero-36924b53-1920.jpg`;

function revalidateHeroImages(headerImages: string[]): void {
  executePublicSurfaceRevalidate({
    artistSlug: 'test-artist',
    scopes: ['heroImages'],
    albumId: null,
    previousAlbumId: null,
    broadcastArtistUpdated: false,
    broadcastStems: false,
    monetizationEnabled: null,
    displayName: null,
    headerImages,
  });
}

describe('executePublicSurfaceRevalidate — heroImages publishes browser URLs', () => {
  beforeEach(() => {
    mockPatchCachedPublicArtistHeaderImages.mockReset();
    mockSetCachedPublicArtistUserProfileHeaderImages.mockReset();
  });

  test('converts canonical storage paths before patching the public-artists cache', () => {
    revalidateHeroImages([CANONICAL]);

    // Universe3D resolves these against the page URL, so a raw `users/…` path would 404.
    expect(mockPatchCachedPublicArtistHeaderImages).toHaveBeenCalledWith('test-artist', [
      buildProxyImageUrlFromStoragePath(CANONICAL),
    ]);
  });

  test('converts canonical storage paths for the user-profile cache', () => {
    revalidateHeroImages([CANONICAL]);

    expect(mockSetCachedPublicArtistUserProfileHeaderImages).toHaveBeenCalledWith('test-artist', [
      buildProxyImageUrlFromStoragePath(CANONICAL),
    ]);
  });

  test('dispatches header-images-updated with browser URLs', () => {
    const events: string[][] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<{ images: string[] }>).detail.images);
    };
    window.addEventListener('header-images-updated', listener);

    revalidateHeroImages([CANONICAL]);

    window.removeEventListener('header-images-updated', listener);
    expect(events).toEqual([[buildProxyImageUrlFromStoragePath(CANONICAL)]]);
  });

  test('rewrites a legacy localhost URL onto the current origin', () => {
    const legacy = `http://localhost:8080/.netlify/functions/proxy-image?path=${encodeURIComponent(CANONICAL)}`;

    revalidateHeroImages([legacy]);

    expect(mockPatchCachedPublicArtistHeaderImages).toHaveBeenCalledWith('test-artist', [
      buildProxyImageUrlFromStoragePath(CANONICAL),
    ]);
  });

  test('leaves an already-usable /api/proxy-image URL alone', () => {
    const url = `/api/proxy-image?path=${encodeURIComponent(CANONICAL)}`;

    revalidateHeroImages([url]);

    expect(mockPatchCachedPublicArtistHeaderImages).toHaveBeenCalledWith('test-artist', [url]);
  });

  test('preserves order', () => {
    const second = `users/${OWNER}/hero/hero-63382ec4-1920.jpg`;

    revalidateHeroImages([second, CANONICAL]);

    expect(mockPatchCachedPublicArtistHeaderImages).toHaveBeenCalledWith('test-artist', [
      buildProxyImageUrlFromStoragePath(second),
      buildProxyImageUrlFromStoragePath(CANONICAL),
    ]);
  });
});
