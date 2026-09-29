/** @jest-environment jsdom */

import { describe, test, expect, jest } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ArticlePage } from '../ui/ArticlePage';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { IArticles } from '@models';

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'Test Artist',
    isLoading: false,
  }),
}));

jest.mock('@shared/ui/image-carousel', () => ({
  ImageCarousel: ({ slides }: { slides: { caption?: string }[] }) => (
    <div data-testid="image-carousel" aria-label="mock-carousel">
      {slides.map((slide, index) => (
        <img
          key={index}
          alt={slide.caption?.trim() || `Image ${index + 1} of ${slides.length}`}
          src={`carousel-${index}.jpg`}
        />
      ))}
    </div>
  ),
}));

const baseArticle: IArticles = {
  articleId: 'test-article',
  nameArticle: 'Test Article Title',
  description: 'Test Description',
  date: '2024-01-01',
  img: 'article.jpg',
  details: [],
};

function renderArticle(article: IArticles) {
  return renderWithProviders(
    <Routes>
      <Route path="/articles/:articleId" element={<ArticlePage />} />
    </Routes>,
    {
      initialEntries: ['/articles/test-article'],
      preloadedState: {
        lang: { current: 'en' },
        articles: {
          status: 'succeeded',
          error: null,
          data: [article],
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
    }
  );
}

describe('ArticlePage content image alt', () => {
  test('uses mediaCaption as alt when caption is set', () => {
    renderArticle({
      ...baseArticle,
      details: [
        {
          id: 1,
          img: 'content.jpg',
          caption: 'Studio photo from the session',
        },
      ],
    });

    const figure = document.querySelector('.article__media-figure');
    expect(figure).not.toBeNull();
    const img = within(figure as HTMLElement).getByRole('img');
    expect(img).toHaveAttribute('alt', 'Studio photo from the session');
  });

  test('falls back to article title when mediaCaption is missing', () => {
    renderArticle({
      ...baseArticle,
      details: [
        {
          id: 1,
          img: 'content.jpg',
        },
      ],
    });

    const figure = document.querySelector('.article__media-figure');
    expect(figure).not.toBeNull();
    const img = within(figure as HTMLElement).getByRole('img');
    expect(img).toHaveAttribute('alt', 'Test Article Title');
    expect(img).not.toHaveAttribute('alt', '');
  });

  test('keeps carousel image alt behavior unchanged (not content figure)', () => {
    renderArticle({
      ...baseArticle,
      details: [
        {
          id: 1,
          type: 'carousel',
          images: [{ imageKey: 'a.jpg', caption: 'Slide one' }, { imageKey: 'b.jpg' }],
        },
      ],
    });

    expect(document.querySelector('.article__media-figure')).toBeNull();
    const carousel = screen.getByTestId('image-carousel');
    const carouselImages = within(carousel).getAllByRole('img');
    expect(carouselImages[0]).toHaveAttribute('alt', 'Slide one');
    expect(carouselImages[1]).toHaveAttribute('alt', 'Image 2 of 2');
  });
});
