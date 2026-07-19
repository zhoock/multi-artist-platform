import { describe, expect, test } from '@jest/globals';
import { normalizeCatalogAlbum, isCatalogAlbum } from '../catalogAlbum';

describe('CatalogAlbum model', () => {
  test('normalizeCatalogAlbum maps thin API payload', () => {
    const album = normalizeCatalogAlbum({
      albumId: '23-remastered',
      slug: '23-remastered',
      title: '23',
      cover: 'cover-key',
      releaseDate: '2020-01-01',
      trackCount: 12,
      duration: 3600,
      userId: 'user-1',
      isPublished: true,
      isPublic: true,
      hasLockedTracks: true,
    });

    expect(album).toEqual({
      albumId: '23-remastered',
      slug: '23-remastered',
      title: '23',
      cover: 'cover-key',
      releaseDate: '2020-01-01',
      trackCount: 12,
      duration: 3600,
      userId: 'user-1',
      isPublished: true,
      isPublic: true,
      hasLockedTracks: true,
    });
    expect(isCatalogAlbum(album)).toBe(true);
  });

  test('normalizeCatalogAlbum rejects missing albumId', () => {
    expect(normalizeCatalogAlbum({ title: 'x' })).toBeNull();
  });

  test('normalizeCatalogAlbum defaults slug to albumId', () => {
    const album = normalizeCatalogAlbum({
      albumId: 'a1',
      title: 'T',
      cover: '',
      trackCount: 1,
      userId: 'u',
    });
    expect(album?.slug).toBe('a1');
  });
});
