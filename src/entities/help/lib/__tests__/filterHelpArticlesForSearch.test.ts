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

  test('returns empty when nothing matches', () => {
    expect(filterHelpArticlesForSearch(articles, categories, 'смирлдой')).toEqual([]);
  });
});
