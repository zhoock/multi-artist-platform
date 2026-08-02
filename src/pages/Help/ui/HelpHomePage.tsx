import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  fetchHelpCatalog,
  selectHelpCatalogError,
  selectHelpCatalogStatus,
  selectHelpCategories,
  selectHelpArticlesInCategory,
} from '@entities/help';
import { HelpArticleSkeleton } from '@entities/help/ui/HelpArticleSkeleton';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildHelpCategoryPath, buildHelpHomePath } from '@shared/lib/seo/publicPagePaths';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { ErrorMessage } from '@shared/ui/error-message';

import { HelpPageShell } from './HelpLayout';

export function HelpHomePage() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const catalogStatus = useAppSelector((state) => selectHelpCatalogStatus(state, lang));
  const catalogError = useAppSelector((state) => selectHelpCatalogError(state, lang));
  const categories = useAppSelector((state) => selectHelpCategories(state, lang));

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (catalogStatus === 'idle') {
      dispatch(fetchHelpCatalog({ lang }));
    }
  }, [catalogStatus, dispatch, lang]);

  const pageTitle = lang === 'en' ? 'Help center' : 'Справочный центр';
  const pageDescription =
    lang === 'en'
      ? 'Guides and documentation for using the platform.'
      : 'Руководства и документация по работе с платформой.';
  const canonical = buildPublicSiteUrl(buildHelpHomePath(lang));
  const hreflang = buildPublicPageHreflangUrls((routeLang) => buildHelpHomePath(routeLang));

  if (catalogStatus === 'loading' || catalogStatus === 'idle') {
    return <HelpArticleSkeleton />;
  }

  if (catalogStatus === 'failed') {
    return (
      <ErrorMessage
        error={
          catalogError ??
          (lang === 'en' ? 'Failed to load help center' : 'Не удалось загрузить справочник')
        }
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>

      <HelpPageShell title={pageTitle} description={pageDescription}>
        <ul className="help-center__category-grid">
          {categories
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((category) => (
              <CategoryCard
                key={category.slug}
                categorySlug={category.slug}
                lang={lang}
                category={category}
              />
            ))}
        </ul>
      </HelpPageShell>
    </>
  );
}

function CategoryCard({
  categorySlug,
  lang,
  category,
}: {
  categorySlug: string;
  lang: 'en' | 'ru';
  category: { title: string; description?: string };
}) {
  const articles = useAppSelector((state) =>
    selectHelpArticlesInCategory(state, lang, categorySlug)
  );
  const articleCountLabel =
    lang === 'en'
      ? `${articles.length} article${articles.length === 1 ? '' : 's'}`
      : `${articles.length} ${articles.length === 1 ? 'статья' : articles.length < 5 ? 'статьи' : 'статей'}`;

  return (
    <li className="help-center__category-card">
      <Link
        to={buildHelpCategoryPath(lang, categorySlug)}
        className="help-center__category-card-link"
      >
        <h2 className="help-center__category-card-title">{category.title}</h2>
        {category.description ? (
          <p className="help-center__category-card-description">{category.description}</p>
        ) : null}
        <p className="help-center__category-card-meta">{articleCountLabel}</p>
      </Link>
    </li>
  );
}

export default HelpHomePage;
