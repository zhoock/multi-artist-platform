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
    articleCoverUpload: {},
    dashboardRowFlashes: {},
    ui: null,
    lang: 'en' as const,
    onToggleArticle: noop,
    onArticleAccessMenuChange: noop,
    onArticleVisibilityChange: noop,
    onArticleCoverDrag: noop,
    onArticleCoverDrop: noop,
    onArticleCoverFileInput: noop,
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

    expect(container.querySelector('.user-dashboard__expandable-row-trigger')).toBeTruthy();
    expect(
      container.querySelector(
        '.dashboard-card.user-dashboard__album-item.dashboard-card--interactive'
      )
    ).toBeTruthy();
  });

  it('renders expanded panel as DashboardCard with kit modifier', () => {
    const { container } = renderWithProviders(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
          expandedArticleId: 'article-1',
        })}
      />
    );

    const expanded = container.querySelector(
      '.dashboard-card.user-dashboard__album-expanded.user-dashboard__album-expanded--kit'
    );
    expect(expanded).toBeTruthy();
    expect(screen.getByText('Test Article')).toBeTruthy();
  });

  it('renders excerpt before secondary cover section when expanded', () => {
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

    const expanded = container.querySelector(
      '.user-dashboard__album-expanded.user-dashboard__album-expanded--article'
    );
    expect(expanded).toBeTruthy();
    expect(container.querySelector('.dashboard-row')).toBeNull();
    expect(screen.getByText('Article Cover')).toBeTruthy();
    expect(container.querySelector('.user-dashboard__article-cover-file-input')).toBeTruthy();

    const description = container.querySelector('.user-dashboard__article-description');
    const coverSection = container.querySelector('.user-dashboard__article-cover-section');
    expect(description).toBeTruthy();
    expect(coverSection).toBeTruthy();
    expect(
      description!.compareDocumentPosition(coverSection!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('uses dashboard-empty-state__cta for footer upload action', () => {
    const { container } = render(
      <PostsTabContent
        {...createBaseProps({
          articles: [sampleArticle],
        })}
      />
    );

    const cta = container.querySelector('.dashboard-empty-state__cta');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Upload New Article');
  });
});
