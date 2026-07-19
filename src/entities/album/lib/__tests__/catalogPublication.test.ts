import { describe, expect, test } from '@jest/globals';
import type { CatalogAlbum } from '../../model/catalogAlbum';
import {
  filterCatalogAlbumsForArtistPageSurface,
  hasPublishedPublicCatalogReleases,
} from '../catalogPublication';

const base: CatalogAlbum = {
  albumId: 'a1',
  slug: 'a1',
  title: 'Album',
  cover: 'c',
  releaseDate: '2024-01-01',
  trackCount: 2,
  duration: 200,
  userId: 'u1',
  isPublished: true,
  isPublic: true,
  hasLockedTracks: false,
  hasStems: false,
};

describe('catalogPublication', () => {
  test('hasPublishedPublicCatalogReleases requires visible album with tracks', () => {
    expect(hasPublishedPublicCatalogReleases([base])).toBe(true);
    expect(hasPublishedPublicCatalogReleases([{ ...base, trackCount: 0 }])).toBe(false);
    expect(hasPublishedPublicCatalogReleases([{ ...base, isPublic: false }])).toBe(false);
  });

  test('filterCatalogAlbumsForArtistPageSurface hides empty albums for visitors', () => {
    const albums = [base, { ...base, albumId: 'a2', trackCount: 0 }];
    expect(filterCatalogAlbumsForArtistPageSurface(albums, false)).toHaveLength(1);
  });
});
