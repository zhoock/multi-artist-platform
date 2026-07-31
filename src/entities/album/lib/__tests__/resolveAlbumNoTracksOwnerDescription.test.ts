import { resolveAlbumNoTracksOwnerDescription } from '../resolveAlbumNoTracksOwnerDescription';

describe('resolveAlbumNoTracksOwnerDescription', () => {
  test('uses catalog onboarding copy for artists not yet in the public catalog', () => {
    expect(resolveAlbumNoTracksOwnerDescription(null, { artistInCatalog: false, lang: 'en' })).toBe(
      'After publishing, your artist profile will appear in the catalog and search.'
    );
  });

  test('uses neutral upload copy once the artist is already in the catalog', () => {
    expect(resolveAlbumNoTracksOwnerDescription(null, { artistInCatalog: true, lang: 'en' })).toBe(
      'Upload tracks to publish this album.'
    );
  });

  test('prefers dictionary strings when provided', () => {
    const ui = {
      dashboard: {
        albumNoTracksOwnerDescription: 'Onboarding copy',
        albumNoTracksOwnerDescriptionNeutral: 'Neutral copy',
      },
    } as const;

    expect(resolveAlbumNoTracksOwnerDescription(ui, { artistInCatalog: false, lang: 'en' })).toBe(
      'Onboarding copy'
    );
    expect(resolveAlbumNoTracksOwnerDescription(ui, { artistInCatalog: true, lang: 'en' })).toBe(
      'Neutral copy'
    );
  });
});
