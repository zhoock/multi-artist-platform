/**
 * Direct artist URL after the artist lost their last public track: the thin catalog returns no
 * album for visitors and `trackCount: 0` for the owner. Neither must render an album card.
 */
import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AlbumsSection } from '../AlbumsSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { CatalogAlbum } from '@entities/album';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

const builderState = { canShowBlocks: false };

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    builderVisibility: {
      mode: builderState.canShowBlocks ? 'active' : 'hidden',
      canShowBlocks: builderState.canShowBlocks,
    },
    hasPublicReleases: false,
    isOwner: builderState.canShowBlocks,
  }),
}));

const emptiedAlbum: CatalogAlbum = {
  albumId: 'rubber-soul',
  slug: 'rubber-soul',
  title: 'Rubber Soul',
  cover: 'rubber-soul-cover',
  releaseDate: '1965-12-03',
  trackCount: 0,
  duration: 0,
  userId: 'beatles-user',
  isPublished: true,
  isPublic: true,
  hasLockedTracks: false,
  hasStems: false,
};

function render(isOwner: boolean, catalog: CatalogAlbum[]) {
  builderState.canShowBlocks = isOwner;
  return renderWithProviders(<AlbumsSection isOwner={isOwner} />, {
    initialEntries: ['/?artist=beatles'],
    preloadedState: {
      lang: { current: 'en' },
      currentArtist: { publicSlug: 'beatles' },
      albums: createAlbumsTestState(),
      artistAlbumCatalog: {
        status: 'succeeded',
        error: null,
        data: catalog,
        lastUpdated: Date.now(),
        fetchContextKey: 'public:beatles',
        artistMissing: false,
      },
      uiDictionary: {
        en: {
          status: 'succeeded',
          error: null,
          data: [
            {
              menu: {},
              buttons: {},
              titles: { albums: 'Albums' },
              artistPageBuilder: {
                albums: {
                  title: 'You have no albums yet',
                  text: 'Release your first album',
                  cta: 'Publish first album',
                },
              },
            },
          ],
          lastUpdated: Date.now(),
        },
        ru: { status: 'idle', error: null, data: [], lastUpdated: null },
      },
    } as never,
  });
}

describe('AlbumsSection — artist with zero public tracks', () => {
  test('4 — visitor: no album section and no empty album card', () => {
    render(false, []);

    expect(screen.queryByRole('region', { name: /albums/i })).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Rubber Soul/)).not.toBeInTheDocument();
  });

  test('4 — owner: constructor empty state with CTA instead of the emptied album card', () => {
    render(true, [emptiedAlbum]);

    expect(screen.getByText('You have no albums yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish first album' })).toBeInTheDocument();
    expect(screen.queryByAltText(/Rubber Soul/)).not.toBeInTheDocument();
  });
});
