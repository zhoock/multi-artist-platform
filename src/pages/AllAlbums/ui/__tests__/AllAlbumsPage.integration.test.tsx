import { describe, test, expect, jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AllAlbumsPage } from '../AllAlbumsPage';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { CatalogAlbum } from '@entities/album';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

jest.mock('@shared/lib/hooks/useArtistPageAccess', () => ({
  useArtistPageAccess: () => ({
    isLoading: false,
    isOwner: false,
    ownerResolved: true,
    ownerContentLoaded: true,
    ownerStillNeedsOnboarding: false,
    hasPublicReleases: true,
    showOnboarding: false,
    showOnboardingSkeleton: false,
    showNotFound: false,
    showVisitorUnderConstruction: false,
    showArtistPageSkeleton: false,
    showPublished: true,
    pageReady: true,
  }),
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

function createCatalogState(
  overrides: Partial<{
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    data: CatalogAlbum[];
    fetchContextKey: string | null;
  }> = {}
) {
  return {
    status: 'succeeded' as const,
    error: null,
    data: [] as CatalogAlbum[],
    lastUpdated: Date.now(),
    fetchContextKey: 'public:test-artist' as string | null,
    artistMissing: false,
    ...overrides,
  };
}

const mockCatalog: CatalogAlbum[] = [
  {
    albumId: 'album-1',
    slug: 'album-1',
    title: 'First Album',
    cover: 'cover1',
    releaseDate: '2024-01-01',
    trackCount: 2,
    duration: 300,
    userId: 'user-1',
    isPublished: true,
    isPublic: true,
    hasLockedTracks: false,
    hasStems: false,
  },
  {
    albumId: 'album-2',
    slug: 'album-2',
    title: 'Second Album',
    cover: 'cover2',
    releaseDate: '2023-06-01',
    trackCount: 1,
    duration: 120,
    userId: 'user-1',
    isPublished: true,
    isPublic: true,
    hasLockedTracks: false,
    hasStems: false,
  },
];

describe('AllAlbumsPage — CatalogAlbum', () => {
  test('рендерит карточки из thin catalog без AlbumEditable', () => {
    renderWithProviders(<AllAlbumsPage />, {
      initialEntries: ['/albums?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogState({ data: mockCatalog }),
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: { allAlbumsLoaded: 'All loaded' },
                titles: { albums: 'Albums', allAlbumsPageTitle: 'All albums' },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByText('Albums')).toBeInTheDocument();
    expect(screen.getByAltText(/Обложка альбома First Album/)).toBeInTheDocument();
    expect(screen.getByAltText(/Обложка альбома Second Album/)).toBeInTheDocument();
    expect(screen.getByText('All loaded')).toBeInTheDocument();
  });

  test('скрывает альбомы без треков и неопубликованные для посетителя', () => {
    renderWithProviders(<AllAlbumsPage />, {
      initialEntries: ['/albums?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogState({
          data: [
            ...mockCatalog,
            {
              albumId: 'empty',
              slug: 'empty',
              title: 'Empty',
              cover: 'c',
              releaseDate: '2024-01-01',
              trackCount: 0,
              duration: 0,
              userId: 'user-1',
              isPublished: true,
              isPublic: true,
              hasLockedTracks: false,
              hasStems: false,
            },
            {
              albumId: 'hidden',
              slug: 'hidden',
              title: 'Hidden',
              cover: 'c',
              releaseDate: '2024-01-01',
              trackCount: 1,
              duration: 10,
              userId: 'user-1',
              isPublished: true,
              isPublic: false,
              hasLockedTracks: false,
              hasStems: false,
            },
          ],
        }),
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [{ menu: {}, buttons: {}, titles: { albums: 'Albums' } }],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByAltText(/Обложка альбома First Album/)).toBeInTheDocument();
    expect(screen.queryByAltText(/Обложка альбома Empty/)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Обложка альбома Hidden/)).not.toBeInTheDocument();
  });
});
