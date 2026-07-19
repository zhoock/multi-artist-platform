import { describe, expect, it } from '@jest/globals';
import type { CatalogAlbum } from '@entities/album/model/catalogAlbum';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';

/**
 * Mixer list filter contract: surface albums ∩ hasStems.
 * Mirrors useMixerCatalog mapping (no React Router / Redux).
 */
function mixerAlbumShellsFromCatalog(catalog: CatalogAlbum[]): CatalogAlbum[] {
  return filterCatalogAlbumsForArtistPageSurface(catalog, false).filter((row) => row.hasStems);
}

function catalogAlbum(
  partial: Partial<CatalogAlbum> & Pick<CatalogAlbum, 'albumId'>
): CatalogAlbum {
  return {
    albumId: partial.albumId,
    slug: partial.slug ?? partial.albumId,
    title: partial.title ?? partial.albumId,
    cover: partial.cover ?? '',
    releaseDate: partial.releaseDate ?? '',
    trackCount: partial.trackCount ?? 1,
    duration: partial.duration ?? 0,
    userId: partial.userId ?? 'user-1',
    isPublished: partial.isPublished ?? true,
    isPublic: partial.isPublic ?? true,
    hasLockedTracks: partial.hasLockedTracks ?? false,
    hasStems: partial.hasStems ?? false,
  };
}

describe('Mixer catalog hasStems filter', () => {
  it('keeps only albums with hasStems', () => {
    const result = mixerAlbumShellsFromCatalog([
      catalogAlbum({ albumId: 'with-stems', hasStems: true }),
      catalogAlbum({ albumId: 'no-stems', hasStems: false }),
      catalogAlbum({ albumId: 'also-stems', hasStems: true }),
    ]);

    expect(result.map((a) => a.albumId)).toEqual(['with-stems', 'also-stems']);
  });

  it('yields empty list when no album has stems (Empty State input)', () => {
    const result = mixerAlbumShellsFromCatalog([
      catalogAlbum({ albumId: 'a', hasStems: false }),
      catalogAlbum({ albumId: 'b', hasStems: false }),
    ]);
    expect(result).toEqual([]);
  });
});
