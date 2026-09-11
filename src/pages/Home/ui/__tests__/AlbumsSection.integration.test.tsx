import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AlbumsSection } from '../AlbumsSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { CatalogAlbum } from '@entities/album';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    builderVisibility: { mode: 'hidden', canShowBlocks: false },
    hasPublicReleases: false,
    isOwner: false,
  }),
}));

function createCatalogTestState(
  overrides: Partial<{
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
    data: CatalogAlbum[];
    lastUpdated: number | null;
    fetchContextKey: string | null;
    artistMissing: boolean;
  }> = {}
) {
  return {
    status: 'idle' as const,
    error: null,
    data: [] as CatalogAlbum[],
    lastUpdated: null as number | null,
    fetchContextKey: 'public:test-artist' as string | null,
    artistMissing: false,
    ...overrides,
  };
}

describe('AlbumsSection integration tests', () => {
  const mockCatalogAlbums: CatalogAlbum[] = [
    {
      albumId: 'album-1',
      slug: 'album-1',
      title: 'Album 1',
      cover: 'cover1',
      releaseDate: '2024-01-01',
      trackCount: 1,
      duration: 180,
      userId: 'user-1',
      isPublished: true,
      isPublic: true,
      hasLockedTracks: false,
      hasStems: false,
    },
    {
      albumId: 'album-2',
      slug: 'album-2',
      title: 'Album 2',
      cover: 'cover2',
      releaseDate: '2024-02-01',
      trackCount: 1,
      duration: 200,
      userId: 'user-1',
      isPublished: true,
      isPublic: true,
      hasLockedTracks: false,
      hasStems: false,
    },
  ];

  test('должен отобразить Loader во время загрузки', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'loading',
          data: [],
          fetchContextKey: null,
        }),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('должен отобразить ошибку при failed статусе', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'failed',
          error: 'Failed to load albums',
          data: [],
        }),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('не показывает альбомы с isPublic === false на витрине артиста', () => {
    const withHidden: CatalogAlbum[] = [
      ...mockCatalogAlbums,
      {
        albumId: 'album-hidden',
        slug: 'album-hidden',
        title: 'Hidden',
        cover: 'cover-h',
        releaseDate: '2024-03-01',
        trackCount: 1,
        duration: 100,
        userId: 'user-1',
        isPublished: true,
        isPublic: false,
        hasLockedTracks: false,
        hasStems: false,
      },
    ];

    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: withHidden,
          lastUpdated: Date.now(),
        }),
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: { viewAllAlbums: 'All ({count})' },
                titles: { albums: 'Albums' },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.queryByAltText(/Обложка альбома Hidden/)).not.toBeInTheDocument();
    expect(screen.getByAltText(/Обложка альбома Album 1/)).toBeInTheDocument();
  });

  test('первой обложке альбома — eager + fetchPriority high, остальным — lazy', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: mockCatalogAlbums,
          lastUpdated: Date.now(),
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

    const covers = screen.getAllByRole('img', { name: /обложка альбома/i });
    expect(covers).toHaveLength(2);
    expect(covers[0]).toHaveAttribute('loading', 'eager');
    expect(covers[0]).toHaveAttribute('fetchpriority', 'high');
    expect(covers[1]).toHaveAttribute('loading', 'lazy');
    expect(covers[1].getAttribute('fetchpriority')).toBeNull();
  });

  test('должен отобразить список альбомов', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: mockCatalogAlbums,
          lastUpdated: Date.now(),
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

    expect(screen.getByText('Albums')).toBeInTheDocument();
    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('должен отобразить заголовок из UI словаря', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: mockCatalogAlbums,
          lastUpdated: Date.now(),
        }),
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [{ menu: {}, buttons: {}, titles: { albums: 'My Albums' } }],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByText('My Albums')).toBeInTheDocument();
  });

  test('должен использовать fallback текст если UI словарь не загружен', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: mockCatalogAlbums,
          lastUpdated: Date.now(),
        }),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByText('…')).toBeInTheDocument();
  });

  test('не рендерит пустые альбомы для посетителей', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: [
            {
              albumId: 'album-empty',
              slug: 'album-empty',
              title: 'Empty Draft',
              cover: 'cover-e',
              releaseDate: '2024-03-01',
              trackCount: 0,
              duration: 0,
              userId: 'user-1',
              isPublished: true,
              isPublic: true,
              hasLockedTracks: false,
              hasStems: false,
            },
          ],
          lastUpdated: Date.now(),
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

    expect(screen.queryByRole('region', { name: /albums/i })).not.toBeInTheDocument();
  });

  test('не рендерит секцию при успешной загрузке и пустом списке альбомов', () => {
    renderWithProviders(<AlbumsSection />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState(),
        artistAlbumCatalog: createCatalogTestState({
          status: 'succeeded',
          data: [],
          lastUpdated: Date.now(),
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

    expect(screen.queryByRole('region', { name: /albums/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
  });

  test('на ?artist= при stale thin-catalog показывает скелетон, а не dashboard-кэш', () => {
    renderWithProviders(<AlbumsSection isOwner />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: createAlbumsTestState({
          dashboard: {
            status: 'succeeded',
            error: null,
            data: [
              {
                albumId: 'album-1',
                album: 'Album 1',
                artistDisplayName: 'Artist 1',
                fullName: 'Artist 1 — Album 1',
                description: '',
                release: { date: '2024-01-01' },
                cover: 'cover1',
                tracks: [
                  {
                    id: '1',
                    title: 'Track 1',
                    content: '',
                    duration: 180,
                    src: 'track.mp3',
                    order_index: 10,
                  },
                ],
                buttons: {},
                details: [],
                isPublished: true,
                isPublic: true,
              },
            ],
            lastUpdated: Date.now(),
            inFlightFetchContextKey: null,
          },
        }),
        artistAlbumCatalog: createCatalogTestState({
          status: 'idle',
          data: [],
          fetchContextKey: null,
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

    expect(document.querySelectorAll('.skeleton--album-cover').length).toBeGreaterThan(0);
    expect(screen.queryByText('Album 1')).not.toBeInTheDocument();
  });
});
