// src/pages/AllAlbums/ui/AllAlbumsPage.tsx

import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { WrapperAlbumCover, AlbumCover } from '@entities/album';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { fetchArticles } from '@entities/article';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  selectAlbumsStatus,
  selectAlbumsResolvedForAllAlbumsPage,
  selectPublicAlbumsCacheIsStale,
} from '@entities/album';
import { ArtistNotFound } from '@shared/ui/artistNotFound';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import '@entities/album/ui/style.scss';
import './style.scss';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { useShowSurfaceAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { filterAlbumsForArtistPageSurface } from '@shared/lib/artistPageContent';

// Количество альбомов для подгрузки за раз
const BATCH_SIZE = 16;

export function AllAlbumsPage() {
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist') ?? '';
  const artistPageAccess = useArtistPageAccess(artistSlug);
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(!!artistSlug);
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const resolvedAlbums = useAppSelector((state) =>
    selectAlbumsResolvedForAllAlbumsPage(state, !artistSlug)
  );
  const allAlbums = useMemo(
    () =>
      catalogCacheStale
        ? []
        : filterAlbumsForArtistPageSurface(resolvedAlbums, artistPageAccess.isOwner),
    [artistPageAccess.isOwner, catalogCacheStale, resolvedAlbums]
  );
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const showAlbumsLoadingShell = useShowSurfaceAlbumsLoadingShell(
    albumsStatus,
    allAlbums.length > 0,
    catalogCacheStale
  );

  const [displayedCount, setDisplayedCount] = useState(BATCH_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Сбрасываем счетчик при смене языка или данных
  useEffect(() => {
    setDisplayedCount(BATCH_SIZE);
  }, [lang, allAlbums.length]);

  // Infinite scroll с Intersection Observer
  useEffect(() => {
    if (albumsStatus !== 'succeeded' || displayedCount >= allAlbums.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayedCount((prev) => Math.min(prev + BATCH_SIZE, allAlbums.length));
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
  }, [albumsStatus, displayedCount, allAlbums.length]);

  const displayedAlbums = allAlbums.slice(0, displayedCount);
  const hasMore = displayedCount < allAlbums.length;

  // SEO
  const seoTitle = ui?.titles?.allAlbumsPageTitle ?? '';
  const seoDesc = ui?.titles?.allAlbumsPageDesc ?? '';

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!artistSlug) return;
    void dispatch(fetchArticles({ publicArtistSlug: artistSlug }));
  }, [artistSlug, dispatch]);

  if (hideArtistPageAfterOwnDelete) {
    return null;
  }

  if (artistSlug && artistPageAccess.isLoading) {
    return (
      <section className="all-albums main-background" aria-label={seoTitle}>
        <div className="wrapper">
          <AlbumsSkeleton count={BATCH_SIZE} />
        </div>
      </section>
    );
  }

  if (artistSlug && artistPageAccess.showNotFound) {
    return <ArtistNotFound />;
  }

  return (
    <section className="all-albums main-background" aria-label={seoTitle}>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
      </Helmet>

      <div className="wrapper">
        <nav className="breadcrumb item-type-a" aria-label="Breadcrumb">
          <ul>
            <li>{ui?.links?.home ? <Link to="/">{ui.links.home}</Link> : null}</li>
          </ul>
        </nav>

        <h2>{ui?.titles?.albums ?? seoTitle}</h2>

        {showAlbumsLoadingShell ? (
          <AlbumsSkeleton count={BATCH_SIZE} />
        ) : albumsStatus === 'failed' ? (
          <ErrorI18n code="albumsLoadFailed" />
        ) : (
          <>
            <div className="albums__list">
              {displayedAlbums.map((album) => (
                <WrapperAlbumCover
                  key={album.albumId}
                  albumId={album.albumId}
                  album={album.album}
                  date={typeof album.release?.date === 'string' ? album.release.date : ''}
                >
                  <AlbumCover
                    img={album.cover || ''}
                    userId={album.userId}
                    fullName={formatAlbumDisplayFullName(siteArtistName, album.album)}
                  />
                </WrapperAlbumCover>
              ))}
            </div>

            {/* Элемент для отслеживания скролла */}
            {hasMore && (
              <div ref={loadMoreRef} className="all-albums__load-more" aria-hidden="true">
                <AlbumsSkeleton count={4} />
              </div>
            )}

            {/* Индикатор конца списка */}
            {!hasMore && allAlbums.length > 0 && (
              <p className="all-albums__end">{ui?.buttons?.allAlbumsLoaded ?? ''}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default AllAlbumsPage;
