import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  fetchHelpCatalog,
  selectHelpCatalogError,
  selectHelpCatalogStatus,
  selectHelpCategories,
} from '@entities/help';
import { HelpArticleSkeleton } from '@entities/help/ui/HelpArticleSkeleton';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildHelpHomePath } from '@shared/lib/seo/publicPagePaths';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { ErrorMessage } from '@shared/ui/error-message';

import { HelpCategoryCard } from './HelpCategoryCard';

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

  const sortedCategories = categories
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>

      <h1 className="visually-hidden">{pageTitle}</h1>
      <p className="visually-hidden">{pageDescription}</p>

      <ul className="help-center__category-grid">
        {sortedCategories.map((category) => (
          <HelpCategoryCard key={category.slug} category={category} lang={lang} />
        ))}
      </ul>
    </>
  );
}

export default HelpHomePage;
