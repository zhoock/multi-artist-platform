import { filterHelpArticlesForSearch } from '../filterHelpArticlesForSearch';
import type { HelpArticleSummary, HelpCategory } from '../../model/types';

const categories: HelpCategory[] = [
  { slug: 'payments', title: 'Payments', sortOrder: 1 },
  { slug: 'publish', title: 'Publication', sortOrder: 2 },
];

const articles: HelpArticleSummary[] = [
  {
    slug: 'yookassa',
    categorySlug: 'payments',
    title: 'YooKassa setup',
    description: 'Connect payments',
    updatedAt: '2026-01-01',
  },
  {
    slug: 'albums',
    categorySlug: 'publish',
    title: 'Album publication',
    description: 'Publish your first album',
    updatedAt: '2026-01-02',
    searchKeywords: ['release'],
  },
];

describe('filterHelpArticlesForSearch', () => {
  test('returns empty array for blank query', () => {
    expect(filterHelpArticlesForSearch(articles, categories, '   ')).toEqual([]);
  });

  test('matches article title', () => {
    expect(filterHelpArticlesForSearch(articles, categories, 'yookassa')).toHaveLength(1);
  });

  test('matches category title', () => {
    expect(filterHelpArticlesForSearch(articles, categories, 'publication')).toHaveLength(1);
  });

  test('matches search keywords', () => {
    expect(filterHelpArticlesForSearch(articles, categories, 'release')).toHaveLength(1);
  });

  test('matches search keywords for artist analytics article', () => {
    const analyticsArticles: HelpArticleSummary[] = [
      {
        slug: 'artist-analytics',
        categorySlug: 'publishing',
        title: 'Аналитика артиста',
        description: 'Статистика прослушиваний, слушателей, поддерживающих и доходов артиста.',
        updatedAt: '2026-11-01',
        searchKeywords: ['аналитика', 'слушатели', 'доходы'],
      },
    ];
    const publishingCategories: HelpCategory[] = [
      { slug: 'publishing', title: 'Кабинет артиста', sortOrder: 2 },
    ];

    expect(
      filterHelpArticlesForSearch(analyticsArticles, publishingCategories, 'аналитика')
    ).toHaveLength(1);
    expect(
      filterHelpArticlesForSearch(analyticsArticles, publishingCategories, 'слушатели')
    ).toHaveLength(1);
    expect(
      filterHelpArticlesForSearch(analyticsArticles, publishingCategories, 'доходы')
    ).toHaveLength(1);
  });
});
