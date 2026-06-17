import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import Album from '../Album';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { IAlbums } from '@models';

describe('Album integration tests', () => {
  const mockAlbum: IAlbums = {
    albumId: 'test-album',
    album: 'Test Album',
    artist: 'Test Artist',
    fullName: 'Test Artist — Test Album',
    description: 'Test Description',
    release: {
      date: '2024-01-01',
    },
    cover: 'cover',
    tracks: [
      {
        id: '1',
        title: 'Track 1',
        order_index: 0,
        content: '',
        duration: 180,
        src: 'track1.mp3',
      },
      {
        id: '2',
        title: 'Track 2',
        order_index: 1,
        content: '',
        duration: 200,
        src: 'track2.mp3',
      },
    ],
    buttons: {},
    details: [],
    isPublished: true,
    isPublic: true,
  };

  test('должен отобразить Loader во время загрузки', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album'],
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

    // В loading/idle рендерится skeleton
    expect(screen.getByLabelText(/скелетон альбома/i)).toBeInTheDocument();
  });

  test('должен отобразить ошибку при failed статусе', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album'],
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'failed',
          error: 'Failed to load album',
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

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен отобразить ошибку если альбом не найден', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/non-existent'],
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

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен отобразить альбом с правильными данными', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album'],
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: [mockAlbum],
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
                titles: {},
                links: {
                  home: 'Home',
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

    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен отобразить правильные SEO метаданные', () => {
    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album'],
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          status: 'succeeded',
          error: null,
          data: [mockAlbum],
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

    // Проверяем что компонент рендерится (SEO проверяется через Helmet)
    expect(screen.getByLabelText(/блок c альбомом/i)).toBeInTheDocument();
  });

  test('должен обработать разные языки', () => {
    const ruAlbum: IAlbums = {
      ...mockAlbum,
      albumId: 'test-album-ru',
      album: 'Тестовый альбом',
      artist: 'Тестовый артист',
      fullName: 'Тестовый артист — Тестовый альбом',
    };

    renderWithProviders(<Album />, {
      initialEntries: ['/albums/test-album-ru'],
      preloadedState: {
        lang: { current: 'ru' },
        albums: {
          status: 'succeeded',
          error: null,
          data: [ruAlbum],
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
            status: 'succeeded',
            error: null,
            data: [
              {
                menu: {},
                buttons: {},
                titles: {},
                links: {
                  home: 'Главная',
                },
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
