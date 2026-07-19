// src/pages/AllAlbums/ui/AllAlbumsPage.tsx

import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  WrapperAlbumCover,
  AlbumCover,
  fetchArtistAlbumCatalog,
  selectArtistAlbumCatalogStatus,
  selectArtistAlbumCatalogCacheIsStale,
  selectArtistAlbumCatalogData,
  selectArtistAlbumCatalogArtistMissing,
} from '@entities/album';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { fetchArticles } from '@entities/article';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { ArtistNotFound } from '@shared/ui/artistNotFound';
import { ArtistPageUnderConstruction } from '@pages/Home/ui/ArtistPageUnderConstruction';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import '@entities/album/ui/style.scss';
import './style.scss';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { shouldShowAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { ContextNav } from '@shared/ui/contextNav';

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
  const catalogStatus = useAppSelector(selectArtistAlbumCatalogStatus);
  const catalogCacheStale = useAppSelector(selectArtistAlbumCatalogCacheIsStale);
  const catalogArtistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const catalogAlbums = useAppSelector(selectArtistAlbumCatalogData);
  const allAlbums = useMemo(
    () =>
      filterCatalogAlbumsForArtistPageSurface(
        catalogCacheStale ? [] : catalogAlbums,
        artistPageAccess.isOwner
      ),
    [artistPageAccess.isOwner, catalogAlbums, catalogCacheStale]
  );
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const showAlbumsLoadingShell =
    !catalogArtistMissing &&
    shouldShowAlbumsLoadingShell(catalogStatus, allAlbums.length > 0, catalogCacheStale);

  const [displayedCount, setDisplayedCount] = useState(BATCH_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  /**
   * Thin catalog for `/albums?artist=` — same source as Home AlbumsSection.
   * Reuses cache after Home; fetches on cold load. Fat `/api/albums` stays for Album/Mixer/Dashboard.
   */
  useEffect(() => {
    if (!artistSlug.trim()) return;
    void dispatch(fetchArtistAlbumCatalog({ publicArtistSlug: artistSlug }));
  }, [artistSlug, dispatch]);

  // Сбрасываем счетчик при смене языка или данных
  useEffect(() => {
    setDisplayedCount(BATCH_SIZE);
  }, [lang, allAlbums.length]);

  // Infinite scroll с Intersection Observer
  useEffect(() => {
    if (catalogStatus !== 'succeeded' || displayedCount >= allAlbums.length) {
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
  }, [catalogStatus, displayedCount, allAlbums.length]);

  const displayedAlbums = allAlbums.slice(0, displayedCount);
  const hasMore = displayedCount < allAlbums.length;

  // SEO
  const seoTitle = ui?.titles?.allAlbumsPageTitle ?? '';
  const seoDesc = ui?.titles?.allAlbumsPageDesc ?? '';
  const artistHubPath = withPublicArtistQuery('/', artistSlug);

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
          <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />
          <AlbumsSkeleton count={BATCH_SIZE} />
        </div>
      </section>
    );
  }

  if (artistSlug && artistPageAccess.showNotFound) {
    return <ArtistNotFound />;
  }

  if (artistSlug && artistPageAccess.showVisitorUnderConstruction) {
    return <ArtistPageUnderConstruction variant="visitor" />;
  }

  return (
    <section className="all-albums main-background" aria-label={seoTitle}>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
      </Helmet>

      <div className="wrapper">
        <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />

        <h2>{ui?.titles?.albums ?? seoTitle}</h2>

        {showAlbumsLoadingShell ? (
          <AlbumsSkeleton count={BATCH_SIZE} />
        ) : catalogStatus === 'failed' ? (
          <ErrorI18n code="albumsLoadFailed" />
        ) : (
          <>
            <div className="albums__list">
              {displayedAlbums.map((album) => (
                <WrapperAlbumCover
                  key={album.albumId}
                  albumId={album.albumId}
                  album={album.title}
                  date={album.releaseDate}
                >
                  <AlbumCover
                    img={album.cover || ''}
                    userId={album.userId}
                    fullName={formatAlbumDisplayFullName(siteArtistName, album.title)}
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
