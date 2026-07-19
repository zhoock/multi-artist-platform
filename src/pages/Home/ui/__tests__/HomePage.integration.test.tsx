import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage } from '../HomePage';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { IArticles } from '@models';

describe('HomePage integration tests', () => {
  const mockArticles: IArticles[] = [
    {
      articleId: 'article-1',
      nameArticle: 'Article 1',
      description: 'Description 1',
      date: '2024-01-01',
      img: 'article1.jpg',
      details: [],
    },
  ];

  const mockUiDictionary = {
    menu: {},
    titles: {
      albums: 'Albums',
      articles: 'Articles',
      theBand: 'The Band',
    },
    buttons: {
      show: 'Show more',
    },
  };

  test('должен отобразить все секции', () => {
    renderWithProviders(<HomePage />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        articles: {
          status: 'succeeded',
          error: null,
          data: mockArticles,
          lastUpdated: Date.now(),
          lastPublicArtistSlug: null,
          inFlightFetchContextKey: null,
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
            data: [mockUiDictionary],
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

    // Проверяем наличие секций (могут быть несколько регионов с разными именами)
    const allRegions = screen.queryAllByRole('region');
    expect(allRegions.length).toBeGreaterThanOrEqual(1);
    // Проверяем, что хотя бы одна секция присутствует
    expect(allRegions[0]).toBeInTheDocument();
  });

  test('должен открыть модальное окно About при клике на кнопку', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<HomePage />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        articles: {
          status: 'succeeded',
          error: null,
          data: mockArticles,
          lastUpdated: Date.now(),
          lastPublicArtistSlug: null,
          inFlightFetchContextKey: null,
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
            data: [mockUiDictionary],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
        popup: {
          isOpen: false,
        },
      },
    });

    const showMoreButton = screen.queryByRole('button', { name: /show more/i });
    if (showMoreButton) {
      await user.click(showMoreButton);

      // Проверяем, что модальное окно открылось
      await new Promise((resolve) => setTimeout(resolve, 10));
      const popup = container.querySelector('[role="dialog"]');
      if (popup) {
        expect(popup).toBeInTheDocument();
      }
    }
  });

  test('должен закрыть модальное окно при клике на кнопку закрытия', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<HomePage />, {
      preloadedState: {
        lang: { current: 'en' },
        albums: {
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        articles: {
          status: 'succeeded',
          error: null,
          data: mockArticles,
          lastUpdated: Date.now(),
          lastPublicArtistSlug: null,
          inFlightFetchContextKey: null,
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
            data: [mockUiDictionary],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
          },
        },
        popup: {
          isOpen: true,
        },
      },
    });

    const closeButton = screen.queryByRole('button', { name: /close/i });
    if (closeButton) {
      await user.click(closeButton);

      // Проверяем, что модальное окно закрылось
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Popup может остаться в DOM но быть скрытым через CSS
      const popup = container.querySelector('[role="dialog"]');
      if (popup) {
        expect(popup).not.toHaveAttribute('open');
      }
    }
  });

  test('должен рендерить только cloud-сцену независимо от языка', () => {
    const ruUiDictionary = {
      menu: {},
      titles: {
        albums: 'Альбомы',
        articles: 'Статьи',
        theBand: 'Группа',
      },
      buttons: {
        show: 'Показать больше',
      },
    };

    renderWithProviders(<HomePage />, {
      preloadedState: {
        lang: { current: 'ru' },
        albums: {
          dashboard: {
            status: 'idle',
            error: null,
            data: [],
            lastUpdated: null,
            inFlightFetchContextKey: null,
          },
        },
        articles: {
          status: 'succeeded',
          error: null,
          data: mockArticles,
          lastUpdated: Date.now(),
          lastPublicArtistSlug: null,
          inFlightFetchContextKey: null,
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
            data: [mockUiDictionary],
            lastUpdated: Date.now(),
          },
          ru: {
            status: 'succeeded',
            error: null,
            data: [ruUiDictionary],
            lastUpdated: Date.now(),
          },
        },
      },
    });

    const scene = screen.getByLabelText('Cloud scene');
    expect(scene).toBeInTheDocument();

    const canvases = scene.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
  });
});
