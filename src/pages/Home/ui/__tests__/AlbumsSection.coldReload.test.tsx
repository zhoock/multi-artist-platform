/**
 * Cold owner entry on /?artist=: dashboard may load before thin catalog settles.
 * Published albums must not leak from dashboard into AlbumsSection during catalogCacheStale.
 */
import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AlbumsSection } from '../AlbumsSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { CatalogAlbum } from '@entities/album';
import type { AlbumEditable } from '@models';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

const builderState = { canShowBlocks: true, hasPublicReleases: false };

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    builderVisibility: {
      mode: builderState.canShowBlocks ? 'active' : 'hidden',
      canShowBlocks: builderState.canShowBlocks,
    },
    hasPublicReleases: builderState.hasPublicReleases,
    isOwner: true,
  }),
}));

const rubberSoulDashboard: AlbumEditable = {
  albumId: 'rubber-soul',
  album: 'Rubber Soul',
  artistDisplayName: 'Beatles',
  fullName: 'Beatles — Rubber Soul',
  description: '',
  release: { date: '1965-12-03' },
  cover: 'rubber-soul-cover',
  tracks: [
    {
      id: 'norwegian',
      title: 'Norwegian Wood',
      content: '',
      duration: 180,
      src: '',
      order_index: 1,
      visibility: 'public',
      stemsVisibility: 'hidden',
      processingStatus: 'ready',
    },
  ],
  buttons: {},
  details: [],
  isPublished: true,
  isPublic: true,
};

const rubberSoulCatalog: CatalogAlbum = {
  albumId: 'rubber-soul',
  slug: 'rubber-soul',
  title: 'Rubber Soul',
  cover: 'rubber-soul-cover',
  releaseDate: '1965-12-03',
  trackCount: 1,
  duration: 180,
  userId: 'beatles-user',
  isPublished: true,
  isPublic: true,
  hasLockedTracks: false,
  hasStems: false,
};

function uiDictionaryState() {
  return {
    en: {
      status: 'succeeded' as const,
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
    ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
  };
}

function renderOwner(
  catalog: {
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    data: CatalogAlbum[];
    fetchContextKey: string | null;
  },
  dashboardData: AlbumEditable[] = [rubberSoulDashboard]
) {
  return renderWithProviders(<AlbumsSection isOwner />, {
    initialEntries: ['/?artist=beatles'],
    preloadedState: {
      lang: { current: 'en' },
      currentArtist: { publicSlug: 'beatles' },
      albums: createAlbumsTestState({
        dashboard: {
          status: 'succeeded',
          error: null,
          data: dashboardData,
          lastUpdated: Date.now(),
          inFlightFetchContextKey: null,
        },
      }),
      artistAlbumCatalog: {
        status: catalog.status,
        error: null,
        data: catalog.data,
        lastUpdated: catalog.status === 'succeeded' ? Date.now() : null,
        fetchContextKey: catalog.fetchContextKey,
        artistMissing: false,
      },
      uiDictionary: uiDictionaryState(),
    } as never,
  });
}

describe('AlbumsSection — cold owner reload (catalog stale)', () => {
  test('does not show Rubber Soul from dashboard while public catalog is stale/loading', () => {
    builderState.hasPublicReleases = false;
    renderOwner({ status: 'loading', data: [], fetchContextKey: null });

    expect(document.querySelectorAll('.skeleton--album-cover').length).toBeGreaterThan(0);
    expect(screen.queryByAltText(/Обложка альбома.*Rubber Soul/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Rubber Soul')).not.toBeInTheDocument();
  });

  test('after catalog settles to [] — no card, owner builder empty state', () => {
    renderOwner({ status: 'succeeded', data: [], fetchContextKey: 'public:beatles' });

    expect(screen.getByText('You have no albums yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish first album' })).toBeInTheDocument();
    expect(screen.queryByAltText(/Обложка альбома.*Rubber Soul/i)).not.toBeInTheDocument();
  });

  test('after catalog settles with trackCount=1 — Rubber Soul card from thin catalog only', () => {
    builderState.hasPublicReleases = true;
    renderOwner(
      { status: 'succeeded', data: [rubberSoulCatalog], fetchContextKey: 'public:beatles' },
      [rubberSoulDashboard]
    );
    builderState.hasPublicReleases = false;

    expect(screen.getByAltText(/Обложка альбома.*Rubber Soul/i)).toBeInTheDocument();
    expect(screen.queryByText('You have no albums yet')).not.toBeInTheDocument();
  });

  test('settled catalog (SPA re-entry) matches menu navigation — empty public catalog, builder only', () => {
    builderState.canShowBlocks = true;
    renderOwner({ status: 'succeeded', data: [], fetchContextKey: 'public:beatles' });

    expect(screen.getByText('You have no albums yet')).toBeInTheDocument();
    expect(screen.queryByAltText(/Обложка альбома.*Rubber Soul/i)).not.toBeInTheDocument();
  });
});
