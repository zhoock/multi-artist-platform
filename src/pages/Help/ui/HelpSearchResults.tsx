import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  filterHelpArticlesForSearch,
  selectHelpArticleSummaries,
  selectHelpCategories,
} from '@entities/help';
import { buildHelpArticlePath } from '@shared/lib/seo/publicPagePaths';
import { SearchNoResultsEmptyState } from '@shared/ui/emptyState';

import { HelpArticleListItem } from './HelpArticleListItem';

type HelpSearchResultsProps = {
  query: string;
};

export function HelpSearchResults({ query }: HelpSearchResultsProps) {
  const { lang } = useLang();
  const categories = useAppSelector((state) => selectHelpCategories(state, lang));
  const articleSummaries = useAppSelector((state) => selectHelpArticleSummaries(state, lang));

  const results = filterHelpArticlesForSearch(articleSummaries, categories, query);

  if (results.length === 0) {
    return <SearchNoResultsEmptyState variant="content" />;
  }

  return (
    <ul className="help-center__article-list help-center__article-list--search">
      {results.map((article) => (
        <HelpArticleListItem
          key={`${article.categorySlug}:${article.slug}`}
          to={buildHelpArticlePath(lang, article.categorySlug, article.slug)}
          title={article.title}
          description={article.description}
        />
      ))}
    </ul>
  );
}
