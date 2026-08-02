import { useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate, useParams } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  buildHelpArticleNavigation,
  fetchHelpArticle,
  fetchHelpCatalog,
  formatHelpDate,
  selectHelpArticleBySlug,
  selectHelpArticleEntry,
  selectHelpCatalogStatus,
} from '@entities/help';
import { HelpArticleSkeleton } from '@entities/help/ui/HelpArticleSkeleton';
import { HelpContentBlocks } from '@entities/help/ui/HelpContentBlocks';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { buildHelpArticlePath } from '@shared/lib/seo/publicPagePaths';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { ErrorMessage } from '@shared/ui/error-message';

export function HelpArticlePage() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const { categorySlug = '', articleSlug = '' } = useParams<{
    categorySlug: string;
    articleSlug: string;
  }>();

  const catalogStatus = useAppSelector((state) => selectHelpCatalogStatus(state, lang));
  const articleEntry = useAppSelector((state) => selectHelpArticleEntry(state, lang, articleSlug));
  const article = useAppSelector((state) => selectHelpArticleBySlug(state, lang, articleSlug));

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [categorySlug, articleSlug]);

  useEffect(() => {
    if (catalogStatus === 'idle') {
      dispatch(fetchHelpCatalog({ lang }));
    }
  }, [catalogStatus, dispatch, lang]);

  useEffect(() => {
    if (!articleSlug) return;
    const status = articleEntry?.status ?? 'idle';
    if (status === 'idle') {
      dispatch(fetchHelpArticle({ lang, slug: articleSlug }));
    }
  }, [articleEntry?.status, articleSlug, dispatch, lang]);

  const articleNavigation = useMemo(() => buildHelpArticleNavigation(article), [article]);

  const scrollToAnchor = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (!element) return;
    const offset = 80;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
  };

  if (!article) {
    const status = articleEntry?.status ?? (catalogStatus === 'loading' ? 'loading' : 'idle');
    if (status === 'loading' || status === 'idle') {
      return <HelpArticleSkeleton />;
    }
    if (status === 'failed') {
      return (
        <ErrorMessage
          error={
            articleEntry?.error ??
            (lang === 'en' ? 'Failed to load article' : 'Не удалось загрузить статью')
          }
        />
      );
    }
    return <ErrorMessage error={lang === 'en' ? 'Article not found' : 'Статья не найдена'} />;
  }

  if (article.categorySlug !== categorySlug) {
    return <Navigate to={buildHelpArticlePath(lang, article.categorySlug, article.slug)} replace />;
  }

  const seoTitle = article.title;
  const seoDesc = article.description;
  const canonical = buildPublicSiteUrl(
    buildHelpArticlePath(lang, article.categorySlug, article.slug)
  );
  const hreflang = buildPublicPageHreflangUrls((routeLang) =>
    buildHelpArticlePath(routeLang, article.categorySlug, article.slug)
  );

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {publicPageHreflangLinks(hreflang)}
      </Helmet>

      <h1 className="help-center__title">{article.title}</h1>
      <time dateTime={article.updatedAt} className="help-center__date">
        <small>
          {lang === 'en' ? 'Last updated: ' : 'Последнее обновление: '}
          {formatHelpDate(article.updatedAt, lang)}
        </small>
      </time>

      {articleNavigation.length > 0 ? (
        <nav
          className="help-center__toc"
          aria-label={lang === 'en' ? 'In this article' : 'В этой статье'}
        >
          <h2 className="help-center__toc-title">
            {lang === 'en' ? 'In this article' : 'В этой статье'}
          </h2>
          <ul className="help-center__toc-list">
            {articleNavigation.map((item) => (
              <li
                key={item.id}
                className={`help-center__toc-item help-center__toc-item--level-${item.level}`}
              >
                <button
                  type="button"
                  className="help-center__toc-link"
                  onClick={() => scrollToAnchor(item.id)}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <HelpContentBlocks article={article} />
    </>
  );
}

export default HelpArticlePage;
