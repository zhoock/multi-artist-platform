import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { WrapperAlbumCover, AlbumCover } from '@entities/album';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  selectAlbumsStatus,
  selectAlbumsError,
  selectAlbumsDataResolved,
  selectDashboardAlbumsDataResolved,
  selectPublicAlbumsCacheIsStale,
} from '@entities/album';
import type { IAlbums } from '@models';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import './AlbumsSection.scss';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { useShowSurfaceAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { filterAlbumsForArtistPageSurface } from '@shared/lib/artistPageContent';

// Адаптивное количество альбомов для отображения на главной
const getInitialCount = () => {
  if (typeof window === 'undefined') return 12;
  if (window.innerWidth >= 1024) return 16; // десктоп
  if (window.innerWidth >= 768) return 12; // планшет
  return 6; // мобильный (но там карусель, так что это не критично)
};

export function AlbumsSection({ isOwner = false }: { isOwner?: boolean }) {
  const { lang } = useLang();
  const [searchParams] = useSearchParams();
  const artistSlug = searchParams.get('artist');
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(!!artistSlug);
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsError = useAppSelector(selectAlbumsError);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const resolvedAlbums = useAppSelector(selectAlbumsDataResolved);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsDataResolved);
  const allAlbums = useMemo(() => {
    const fromCatalog = filterAlbumsForArtistPageSurface(
      catalogCacheStale ? [] : resolvedAlbums,
      isOwner
    );
    if (!isOwner) return fromCatalog;

    const fromDashboard = filterAlbumsForArtistPageSurface(dashboardAlbums, true);
    // Свежий публичный каталог — единственный источник (после удаления не показываем stale merge).
    if (!catalogCacheStale) {
      if (fromCatalog.length > 0) return fromCatalog;
      return fromDashboard;
    }
    return fromDashboard.length > 0 ? fromDashboard : fromCatalog;
  }, [catalogCacheStale, dashboardAlbums, isOwner, resolvedAlbums]);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const showAlbumsLoadingShell = useShowSurfaceAlbumsLoadingShell(
    albumsStatus,
    allAlbums.length > 0,
    catalogCacheStale
  );

  const [initialCount, setInitialCount] = useState(getInitialCount);

  // Обновляем количество при изменении размера окна
  useEffect(() => {
    const handleResize = () => {
      setInitialCount(getInitialCount());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const displayedAlbums = allAlbums.slice(0, initialCount);
  const hasMore = allAlbums.length > initialCount;

  // Данные загружаются через loader, не нужно загружать здесь

  if (hideArtistPageAfterOwnDelete) {
    return null;
  }

  if (!catalogCacheStale && albumsStatus === 'succeeded' && allAlbums.length === 0) {
    return null;
  }

  return (
    <section id="albums" className="albums main-background" aria-labelledby="home-albums-heading">
      <div className="wrapper">
        <h2 id="home-albums-heading">{ui?.titles?.albums ?? '…'}</h2>

        {showAlbumsLoadingShell ? (
          <AlbumsSkeleton count={initialCount} />
        ) : albumsStatus === 'failed' || albumsError ? (
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

            {hasMore && (
              <div className="albums__more">
                <Link to="/albums" className="albums__more-button">
                  {ui?.buttons?.viewAllAlbums?.replace('{count}', String(allAlbums.length)) ??
                    `Все альбомы (${allAlbums.length})`}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
