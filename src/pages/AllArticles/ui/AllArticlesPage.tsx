// src/pages/AllArticles/ui/AllArticlesPage.tsx

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArticlePreview } from '@entities/article';
import { ErrorI18n } from '@shared/ui/error-message';
import { ArticlesSkeleton } from '@shared/ui/skeleton/ArticlesSkeleton';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { selectArticlesStatus, selectArticlesDataResolved } from '@entities/article';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { ContextNav } from '@shared/ui/contextNav';
import '@entities/article/ui/style.scss';
import './style.scss';

// Количество статей для подгрузки за раз
const BATCH_SIZE = 16;

export function AllArticlesPage() {
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist');
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const artistHubPath = withPublicArtistQuery('/', artistSlug);
  const articlesStatus = useAppSelector((state) => selectArticlesStatus(state));
  const allArticles = useAppSelector((state) => selectArticlesDataResolved(state));
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [displayedCount, setDisplayedCount] = useState(BATCH_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Сбрасываем счетчик при смене языка или данных
  useEffect(() => {
    setDisplayedCount(BATCH_SIZE);
  }, [lang, allArticles.length]);

  // Infinite scroll с Intersection Observer
  useEffect(() => {
    if (articlesStatus !== 'succeeded' || displayedCount >= allArticles.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayedCount((prev) => Math.min(prev + BATCH_SIZE, allArticles.length));
        }
      },
      {
        rootMargin: '200px', // Начинаем загрузку за 200px до конца
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [articlesStatus, displayedCount, allArticles.length]);

  const displayedArticles = allArticles.slice(0, displayedCount);
  const hasMore = displayedCount < allArticles.length;

  // SEO
  const seoTitle = ui?.titles?.allArticlesPageTitle ?? '';
  const seoDesc = ui?.titles?.allArticlesPageDesc ?? '';

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <section className="all-articles main-background" aria-label={seoTitle}>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
      </Helmet>

      <div className="wrapper">
        <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />

        <h2>{ui?.titles?.articles ?? seoTitle}</h2>

        <div className="articles__wrapper">
          {articlesStatus === 'loading' || articlesStatus === 'idle' ? (
            <ArticlesSkeleton count={BATCH_SIZE} />
          ) : articlesStatus === 'failed' ? (
            <ErrorI18n code="articlesLoadFailed" />
          ) : (
            <>
              <div className="articles__list">
                {displayedArticles.map((article) => (
                  <ArticlePreview key={article.articleId} {...article} />
                ))}
              </div>

              {/* Элемент для отслеживания скролла */}
              {hasMore && (
                <div ref={loadMoreRef} className="all-articles__load-more" aria-hidden="true">
                  <ArticlesSkeleton count={4} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default AllArticlesPage;
