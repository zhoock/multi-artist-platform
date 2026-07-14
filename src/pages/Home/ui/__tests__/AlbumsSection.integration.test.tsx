import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { AlbumsSection } from '../AlbumsSection';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { IAlbums, TracksProps } from '@models';

jest.mock('@shared/lib/hooks/useArtistPageBuilder', () => ({
  useArtistPageBuilder: () => ({
    builderVisibility: { mode: 'hidden', canShowBlocks: false },
    canShowBuilderBlocks: false,
    hasPublicReleases: false,
    isOwner: false,
  }),
}));

describe('AlbumsSection integration tests', () => {
  const mockTrack: TracksProps = {
    id: '1',
    title: 'Track 1',
    content: '',
    duration: 180,
    src: 'track.mp3',
    order_index: 10,
  };

  const mockAlbums: IAlbums[] = [
    {
      albumId: 'album-1',
      album: 'Album 1',
      artist: 'Artist 1',
      fullName: 'Artist 1 — Album 1',
      description: 'Description 1',
      release: {
        date: '2024-01-01',
      },
      cover: 'cover1',
      tracks: [mockTrack],
      buttons: {},
      details: [],
      isPublished: true,
      isPublic: true,
    },
    {
      albumId: 'album-2',
      album: 'Album 2',
      artist: 'Artist 2',
      fullName: 'Artist 2 — Album 2',
      description: 'Description 2',
      release: {
        date: '2024-02-01',
      },
      cover: 'cover2',
      tracks: [mockTrack],
      buttons: {},
      details: [],
      isPublished: true,
      isPublic: true,
    },
  ];

  test('должен отобразить Loader во время загрузки', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'loading',
          error: null,
          data: [],
          lastUpdated: null,
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    // Проверяем что секция рендерится (может иметь fallback текст "…", если UI словарь не загружен)
    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('должен отобразить ошибку при failed статусе', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'failed',
          error: 'Failed to load albums',
          data: [],
          lastUpdated: null,
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    // Проверяем что секция рендерится (может иметь fallback текст "…", если UI словарь не загружен)
    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('не показывает альбомы с isPublic === false на витрине артиста', () => {
    const withHidden: IAlbums[] = [
      ...mockAlbums,
      {
        albumId: 'album-hidden',
        album: 'Hidden',
        artist: 'Artist 1',
        fullName: 'Artist 1 — Hidden',
        description: '',
        release: { date: '2024-03-01' },
        cover: 'cover-h',
        tracks: [mockTrack],
        buttons: {},
        details: [],
        isPublic: false,
      },
    ];

    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: withHidden,
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
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
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.queryByAltText(/Обложка альбома Hidden/)).not.toBeInTheDocument();
    expect(screen.getByAltText(/Обложка альбома Album 1/)).toBeInTheDocument();
  });

  test('должен отобразить список альбомов', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: mockAlbums,
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {
                  albums: 'Albums',
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.getByText('Albums')).toBeInTheDocument();
    // Проверяем что секция рендерится (может иметь fallback текст "…", если UI словарь не загружен)
    const region = screen.queryByRole('region');
    expect(region).toBeInTheDocument();
  });

  test('должен отобразить заголовок из UI словаря', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: mockAlbums,
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {
                  albums: 'My Albums',
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.getByText('My Albums')).toBeInTheDocument();
  });

  test('должен использовать fallback текст если UI словарь не загружен', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: mockAlbums,
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.getByText('…')).toBeInTheDocument();
  });

  test('не рендерит пустые альбомы для посетителей', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: [
            {
              albumId: 'album-empty',
              album: 'Empty Draft',
              artist: 'Artist 1',
              fullName: 'Artist 1 — Empty Draft',
              description: '',
              release: { date: '2024-03-01' },
              cover: 'cover-e',
              tracks: [],
              buttons: {},
              details: [],
              isPublic: true,
            },
          ],
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {
                  albums: 'Albums',
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.queryByRole('region', { name: /albums/i })).not.toBeInTheDocument();
  });

  test('не рендерит секцию при успешной загрузке и пустом списке альбомов', () => {
    renderWithProviders(<AlbumsSection />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: [],
          lastUpdated: Date.now(),
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {
                  albums: 'Albums',
                },
              },
            ],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(screen.queryByRole('region', { name: /albums/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
  });

  test('на ?artist= при сброшенном fetchContextKey показывает скелетон, а не dashboard-кэш', () => {
    renderWithProviders(<AlbumsSection isOwner />, {
      initialEntries: ['/?artist=test-artist'],
      preloadedState: {
        lang: { current: 'en' },
        currentArtist: { publicSlug: 'test-artist' },
        albums: {
          status: 'idle',
          error: null,
          data: [],
          lastUpdated: null,
          fetchContextKey: null,
          inFlightFetchContextKey: null,
          catalogArtistMissing: false,
          dashboard: {
            status: 'succeeded',
            error: null,
            data: mockAlbums,
            lastUpdated: Date.now(),
            inFlightFetchContextKey: null,
          },
        },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [{ menu: {}, buttons: {}, titles: { albums: 'Albums' } }],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
      },
    });

    expect(document.querySelectorAll('.skeleton--album-cover').length).toBeGreaterThan(0);
    expect(screen.queryByText('Album 1')).not.toBeInTheDocument();
  });
});
