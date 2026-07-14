import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorI18n } from '@shared/ui/error-message';
import { ArticlesSkeleton } from '@shared/ui/skeleton/ArticlesSkeleton';
import { ArtistSectionHeading } from '@shared/ui/artistSectionHeading';
import { ArticlePreview } from '@entities/article';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  selectArticlesStatus,
  selectArticlesDataResolvedForSurface,
  selectArticlesCacheIsStale,
} from '@entities/article';
import { useShowSurfaceArticlesLoadingShell } from '@shared/lib/hooks/useShowSurfaceArticlesLoadingShell';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { FileText as FileTextIcon } from 'lucide-react';

// Адаптивное количество статей для отображения на главной
const getInitialCount = () => {
  if (typeof window === 'undefined') return 12;
  if (window.innerWidth >= 1024) return 3; // десктоп (уменьшено для тестирования)
  if (window.innerWidth >= 768) return 3; // планшет
  return 6; // мобильный
};

export function ArticlesSection() {
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist')?.trim() ?? '';
  const allArticlesPath = withPublicArtistQuery('/articles', searchParams.get('artist'));
  const articlesStatus = useAppSelector((state) => selectArticlesStatus(state));
  const articlesCacheStale = useAppSelector(selectArticlesCacheIsStale);
  const allArticles = useAppSelector((state) => selectArticlesDataResolvedForSurface(state));
  const { builderVisibility } = useArtistPageBuilder(artistSlug);
  const { openDashboard } = useArtistPageBuilderNav();
  const showArticleBuilder = shouldShowArtistPageBuilderBlock(
    builderVisibility,
    allArticles.length === 0
  );
  const showArticlesLoadingShell = useShowSurfaceArticlesLoadingShell(
    articlesStatus,
    allArticles.length > 0,
    articlesCacheStale
  );
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [initialCount, setInitialCount] = useState(getInitialCount);

  // Обновляем количество при изменении размера окна
  useEffect(() => {
    const handleResize = () => {
      setInitialCount(getInitialCount());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const displayedArticles = allArticles.slice(0, initialCount);
  const hasMore = allArticles.length > initialCount;
  const showSectionLink = !showArticlesLoadingShell && hasMore;

  // Данные загружаются через loader, не нужно загружать здесь

  if (
    !articlesCacheStale &&
    articlesStatus === 'succeeded' &&
    allArticles.length === 0 &&
    !showArticleBuilder
  ) {
    return null;
  }

  return (
    <section
      id="articles"
      className="articles main-background"
      aria-labelledby="home-articles-heading"
    >
      <div className="wrapper articles__wrapper">
        <ArtistSectionHeading
          id="home-articles-heading"
          title={ui?.titles?.articles ?? '…'}
          to={showSectionLink ? allArticlesPath : undefined}
        />

        {showArticlesLoadingShell ? (
          <ArticlesSkeleton count={initialCount} />
        ) : articlesStatus === 'failed' ? (
          <ErrorI18n code="articlesLoadFailed" />
        ) : showArticleBuilder ? (
          <ArtistPageBuilderBlock
            layout="section"
            icon={<FileTextIcon {...artistPageBuilderSectionIconProps()} />}
            title={ui?.artistPageBuilder?.articles?.title ?? 'You have no articles yet'}
            description={
              ui?.artistPageBuilder?.articles?.text ??
              'Share stories about your music, creative journey, and news.'
            }
            actionLabel={ui?.artistPageBuilder?.articles?.cta ?? 'Write your first article'}
            onAction={() => openDashboard('posts')}
          />
        ) : (
          <>
            <div className="articles__list">
              {displayedArticles.map((article) => (
                <ArticlePreview key={article.articleId} {...article} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
