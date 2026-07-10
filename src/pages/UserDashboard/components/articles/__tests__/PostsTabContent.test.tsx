import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import type { IArticles } from '@models';
import { renderWithProviders } from '@shared/lib/test-utils';
import { PostsTabContent } from '../PostsTabContent';

const noop = () => undefined;

function createBaseProps(overrides: Partial<React.ComponentProps<typeof PostsTabContent>> = {}) {
  return {
    emailVerified: true,
    articlesStatus: 'succeeded',
    articlesError: null,
    articles: [] as IArticles[],
    articleAccessMenuArticleId: null,
    dashboardRowFlashes: {},
    ui: null,
    lang: 'en' as const,
    onArticleAccessMenuChange: noop,
    onArticleVisibilityChange: noop,
    onEditArticle: noop,
    onDeleteArticle: noop,
    onCreateArticle: noop,
    ...overrides,
  };
}

const sampleArticle: IArticles = {
  articleId: 'article-1',
  nameArticle: 'Test Article',
  img: '',
  date: '2026-01-15',
  details: [],
  description: 'Sample description',
};

describe('PostsTabContent', () => {
  it('renders tab empty state with dashboard kit classes', () => {
    const { container } = render(<PostsTabContent {...createBaseProps()} />);

    expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    expect(screen.getByText("You don't have any articles yet")).toBeTruthy();
  });

  it('renders compact interactive article card without accordion', () => {
    const { container } = renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
        })}
      />
    );

    const articleCard = container.querySelector(
      '.dashboard-card.user-dashboard__album-card.dashboard-card--interactive'
    );
    expect(articleCard).toBeTruthy();
    expect(container.querySelector('.dashboard-expandable-row-trigger')).toBeNull();
    expect(container.querySelector('.user-dashboard__expanded-track-chevron')).toBeNull();
    expect(container.querySelector('.user-dashboard__album-card--expanded')).toBeNull();
    expect(container.querySelector('.user-dashboard__album-body')).toBeNull();
    expect(screen.getByText('Test Article')).toBeTruthy();
  });

  it('opens editor when the card row is clicked', () => {
    const onEditArticle = jest.fn();

    renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
          onEditArticle,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Test Article' }));
    expect(onEditArticle).toHaveBeenCalledWith(sampleArticle);
  });

  it('renders edit and delete icon actions in the card header', () => {
    const onEditArticle = jest.fn();
    const onDeleteArticle = jest.fn();

    renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
          onEditArticle,
          onDeleteArticle,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Article' }));
    expect(onEditArticle).toHaveBeenCalledWith(sampleArticle);

    fireEvent.click(screen.getByRole('button', { name: 'Delete article' }));
    expect(onDeleteArticle).toHaveBeenCalledWith(sampleArticle);
  });

  it('uses DashboardButton primary for footer upload action', () => {
    const { container } = render(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
        })}
      />
    );

    const cta = container.querySelector('.dashboard-button--primary');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Upload New Article');
  });
});
