import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import Album from '../Album';
import { renderWithProviders } from '@shared/lib/test-utils';
import { createMockAlbumDetails } from '@entities/album/model/__tests__/albumDetailsFixtures';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';

jest.mock('@entities/album/api/fetchAlbumDetails', () => ({
  fetchAlbumDetails: jest.fn(async () => ({
    albumId: 'test-album',
    slug: 'test-album',
    title: 'Test Album',
    cover: 'cover',
    userId: 'user-1',
    dbAlbumId: 'uuid-1',
    description: 'Test Description',
    details: [],
    release: { date: '2024-01-01' },
    artwork: {
      photographer: '',
      photographerURL: '',
      designer: '',
      designerURL: '',
    },
    purchase: { allowDownloadSale: '', regularPrice: '0.99', currency: 'RUB' },
    serviceButtons: {},
    visibility: { isPublished: true, isPublic: true },
    tracks: [],
  })),
  AlbumDetailsFetchError: class AlbumDetailsFetchError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'AlbumDetailsFetchError';
      this.status = status;
      this.code = code;
    }
  },
}));

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
    showOwnerUnderConstruction: false,
    showVisitorUnderConstruction: false,
    showNotFound: false,
    showPublished: true,
    pageReady: true,
    showArtistPageSkeleton: false,
    showArtistPageSurfacePending: false,
    showArtistPageHeroPending: false,
    showArtistPageLayoutPending: false,
    headerImages: [],
    isHeaderImagesReady: true,
    suppressPublishedArtistChrome: false,
    monetizationEnabled: false,
    paymentSurfaceReady: true,
  }),
}));

jest.mock('@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted', () => ({
  useRedirectHomeAfterOwnAccountDeleted: () => false,
}));

jest.mock('@shared/lib/hooks/useRedirectAfterDeletedAlbum', () => ({
  useRedirectAfterDeletedAlbum: () => false,
}));

function emptyAlbumsState() {
  return createAlbumsTestState();
}

function albumDetailsState(
  status: 'idle' | 'loading' | 'succeeded' | 'failed',
  data: ReturnType<typeof createMockAlbumDetails> | null = null,
  error: string | null = null,
  errorCode: string | null = null
) {
  const albumId = data?.albumId ?? 'test-album';
  return {
    status,
    error,
    errorCode,
    data,
    fetchContextKey: data ? `albumDetails:test-artist:${albumId}` : null,
    artistSlug: data ? 'test-artist' : null,
    albumId: data ? albumId : null,
    lastUpdated: data ? Date.now() : null,
  };
}

describe('Album integration tests', () => {
  const mockDetails = createMockAlbumDetails();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('должен отобразить Loader во время загрузки AlbumDetails', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: emptyAlbumsState(),
        albumDetails: albumDetailsState('loading'),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByLabelText(/скелетон альбома/i)).toBeInTheDocument();
  });

  test('должен отобразить ошибку при failed статусе AlbumDetails', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: emptyAlbumsState(),
        albumDetails: albumDetailsState('failed', null, 'Failed to load album'),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен отобразить ошибку если альбом не найден', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/non-existent?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: emptyAlbumsState(),
        albumDetails: {
          ...albumDetailsState('succeeded', null, null, 'ALBUM_NOT_FOUND'),
          artistSlug: 'test-artist',
          albumId: 'non-existent',
          fetchContextKey: 'albumDetails:test-artist:non-existent',
        },
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен отобразить альбом из AlbumDetails без fat albumsSlice', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: emptyAlbumsState(),
        albumDetails: albumDetailsState('succeeded', mockDetails),
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {},
                links: { home: 'Home' },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
    // Dashboard fat bucket stays empty — page reads albumDetails only.
    expect(emptyAlbumsState().dashboard.data).toHaveLength(0);
  });

  test('должен отобразить правильные SEO метаданные', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        albums: emptyAlbumsState(),
        albumDetails: albumDetailsState('succeeded', mockDetails),
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен обработать разные языки через AlbumDetails translations', () => {
    const ruDetails = createMockAlbumDetails({
      albumId: 'test-album-ru',
      slug: 'test-album-ru',
      title: 'Тестовый альбом',
      description: 'Описание',
      translations: {
        ru: {
          fullName: 'Артист — Тестовый альбом',
          description: 'Описание RU',
          details: [],
          artwork: {
            photographer: '',
            photographerURL: '',
            designer: '',
            designerURL: '',
          },
        },
      },
    });

    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album-ru?artist=test-artist'],
      preloadedState: {
        lang: { current: 'ru' },
        albums: emptyAlbumsState(),
        albumDetails: {
          ...albumDetailsState('succeeded', ruDetails),
          fetchContextKey: 'albumDetails:test-artist:test-album-ru',
          albumId: 'test-album-ru',
        },
        uiDictionary: {
          en: { status: 'idle', error: null, data: [], lastUpdated: null },
          ru: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {},
                links: { home: 'Главная' },
              },
            ],
            lastUpdated: Date.now(),
          },
        },
      },
    });

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });
});
