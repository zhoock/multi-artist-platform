import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  fetchHelpCatalog,
  selectHelpArticlesInCategory,
  selectHelpCatalogStatus,
  selectHelpCategoryBySlug,
} from '@entities/help';
import { HelpArticleSkeleton } from '@entities/help/ui/HelpArticleSkeleton';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildHelpArticlePath, buildHelpCategoryPath } from '@shared/lib/seo/publicPagePaths';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { ErrorMessage } from '@shared/ui/error-message';

import { HelpArticleListItem } from './HelpArticleListItem';
import { HelpBreadcrumbs } from './HelpBreadcrumbs';
import { HelpCategoryEmptyState } from './HelpCategoryEmptyState';

export function HelpCategoryPage() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const { categorySlug = '' } = useParams<{ categorySlug: string }>();

  const catalogStatus = useAppSelector((state) => selectHelpCatalogStatus(state, lang));
  const category = useAppSelector((state) => selectHelpCategoryBySlug(state, lang, categorySlug));
  const articles = useAppSelector((state) =>
    selectHelpArticlesInCategory(state, lang, categorySlug)
  );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [categorySlug]);

  useEffect(() => {
    if (catalogStatus === 'idle') {
      dispatch(fetchHelpCatalog({ lang }));
    }
  }, [catalogStatus, dispatch, lang]);

  if (catalogStatus === 'loading' || catalogStatus === 'idle') {
    return <HelpArticleSkeleton />;
  }

  if (!category) {
    return <ErrorMessage error={lang === 'en' ? 'Category not found' : 'Категория не найдена'} />;
  }

  const canonical = buildPublicSiteUrl(buildHelpCategoryPath(lang, categorySlug));
  const hreflang = buildPublicPageHreflangUrls((routeLang) =>
    buildHelpCategoryPath(routeLang, categorySlug)
  );

  return (
    <>
      <Helmet>
        <title>{category.title}</title>
        {category.description ? <meta name="description" content={category.description} /> : null}
        <meta property="og:title" content={category.title} />
        {category.description ? (
          <meta property="og:description" content={category.description} />
        ) : null}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>

      <HelpBreadcrumbs categorySlug={categorySlug} />

      <header className="help-center__page-header">
        <h1 className="help-center__title">{category.title}</h1>
        {category.description ? <p className="help-center__lead">{category.description}</p> : null}
      </header>

      {articles.length === 0 ? (
        <HelpCategoryEmptyState />
      ) : (
        <ul className="help-center__article-list">
          {articles.map((article) => (
            <HelpArticleListItem
              key={article.slug}
              to={buildHelpArticlePath(lang, categorySlug, article.slug)}
              title={article.title}
              description={article.description}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export default HelpCategoryPage;
