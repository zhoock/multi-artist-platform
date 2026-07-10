import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
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
    expandedArticleId: null,
    articleAccessMenuArticleId: null,
    dashboardRowFlashes: {},
    ui: null,
    lang: 'en' as const,
    onToggleArticle: noop,
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

  it('renders article row as interactive DashboardCard', () => {
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
    expect(container.querySelector('.dashboard-expandable-row-trigger')).toBeTruthy();
  });

  it('renders expanded content inside unified album card body', () => {
    const { container } = renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
          expandedArticleId: 'article-1',
        })}
      />
    );

    const articleCard = container.querySelector('.user-dashboard__album-card--expanded');
    expect(articleCard).toBeTruthy();
    expect(container.querySelector('.user-dashboard__album-body')).toBeNull();
    expect(screen.getByText('Test Article')).toBeTruthy();
  });

  it('renders edit and delete icon actions in the card header', () => {
    renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit Article' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete article' })).toBeTruthy();
  });

  it('renders article excerpt preview when expanded and content exists', () => {
    const articleWithBody: IArticles = {
      ...sampleArticle,
      details: [{ type: 'text', content: 'Article excerpt for preview.' }],
    };

    const { container } = renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [articleWithBody],
          expandedArticleId: 'article-1',
        })}
      />
    );

    const expandedBody = container.querySelector(
      '.user-dashboard__album-body.user-dashboard__album-expanded--article'
    );
    expect(expandedBody).toBeTruthy();
    expect(container.querySelector('.user-dashboard__article-cover-section')).toBeNull();
    expect(container.querySelector('.user-dashboard__article-description')).toBeTruthy();
  });

  it('uses DashboardCta for footer upload action', () => {
    const { container } = render(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
        })}
      />
    );

    const cta = container.querySelector('.dashboard-cta');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Upload New Article');
  });
});
