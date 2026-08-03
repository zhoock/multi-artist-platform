import type { HelpArticleSummary, HelpCategory } from '../model/types';

export function filterHelpArticlesForSearch(
  articles: HelpArticleSummary[],
  categories: HelpCategory[],
  query: string
): HelpArticleSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const categoryTitleBySlug = new Map(
    categories.map((category) => [category.slug, category.title])
  );

  return articles.filter((article) => {
    const categoryTitle = categoryTitleBySlug.get(article.categorySlug)?.toLowerCase() ?? '';
    const haystack = [
      article.title,
      article.description,
      categoryTitle,
      ...(article.searchKeywords ?? []),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
