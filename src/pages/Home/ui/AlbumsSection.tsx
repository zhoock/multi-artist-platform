import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WrapperAlbumCover, AlbumCover } from '@entities/album';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { ArtistSectionHeading } from '@shared/ui/artistSectionHeading';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  selectAlbumsStatus,
  selectAlbumsError,
  selectDashboardAlbumsDataResolved,
  selectPublicAlbumsCacheIsStale,
  selectPublicAlbumsDataResolvedForSurface,
} from '@entities/album';
import { isAlbumDraft } from '@entities/album/lib/albumPublication';
import type { IAlbums } from '@models';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { useShowSurfaceAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { filterAlbumsForArtistPageSurface } from '@shared/lib/artistPageContent';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { Disc3 as DiscIcon } from 'lucide-react';
import '@entities/album/ui/style.scss';

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
  const { builderVisibility, hasPublicReleases } = useArtistPageBuilder(artistSlug?.trim() ?? '');
  const { openDashboard } = useArtistPageBuilderNav();
  const showAlbumBuilder = shouldShowArtistPageBuilderBlock(builderVisibility, !hasPublicReleases);
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(!!artistSlug);
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsError = useAppSelector(selectAlbumsError);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const publicCatalogAlbums = useAppSelector(selectPublicAlbumsDataResolvedForSurface);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsDataResolved);
  const allAlbums = useMemo(() => {
    if (!isOwner) {
      return filterAlbumsForArtistPageSurface(catalogCacheStale ? [] : publicCatalogAlbums, false);
    }

    const ownerDrafts = filterAlbumsForArtistPageSurface(dashboardAlbums, true).filter((album) =>
      isAlbumDraft(album)
    );

    if (catalogCacheStale) {
      const fromDashboard = filterAlbumsForArtistPageSurface(dashboardAlbums, true);
      return fromDashboard.length > 0 ? fromDashboard : ownerDrafts;
    }

    const draftIds = new Set(ownerDrafts.map((album) => album.albumId));
    const publicIds = new Set(publicCatalogAlbums.map((album) => album.albumId));
    return [
      ...ownerDrafts.filter((album) => !publicIds.has(album.albumId)),
      ...publicCatalogAlbums.filter((album) => !draftIds.has(album.albumId)),
    ];
  }, [catalogCacheStale, dashboardAlbums, isOwner, publicCatalogAlbums]);
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
  const allAlbumsPath = withPublicArtistQuery('/albums', artistSlug);
  const showSectionLink = !showAlbumsLoadingShell && hasMore;

  // Данные загружаются через loader, не нужно загружать здесь

  if (hideArtistPageAfterOwnDelete) {
    return null;
  }

  if (
    !catalogCacheStale &&
    albumsStatus === 'succeeded' &&
    allAlbums.length === 0 &&
    !showAlbumBuilder
  ) {
    return null;
  }

  return (
    <section id="albums" className="albums main-background" aria-labelledby="home-albums-heading">
      <div className="wrapper">
        <ArtistSectionHeading
          id="home-albums-heading"
          title={ui?.titles?.albums ?? '…'}
          to={showSectionLink ? allAlbumsPath : undefined}
        />

        {showAlbumsLoadingShell ? (
          <AlbumsSkeleton count={initialCount} />
        ) : albumsStatus === 'failed' || albumsError ? (
          <ErrorI18n code="albumsLoadFailed" />
        ) : showAlbumBuilder ? (
          <ArtistPageBuilderBlock
            layout="section"
            icon={<DiscIcon {...artistPageBuilderSectionIconProps()} />}
            title={ui?.artistPageBuilder?.albums?.title ?? 'You have no albums yet'}
            description={
              ui?.artistPageBuilder?.albums?.text ??
              'Release your first album so it appears here and becomes available to listeners.'
            }
            actionLabel={ui?.artistPageBuilder?.albums?.cta ?? 'Publish first album'}
            onAction={() => openDashboard('albums')}
          />
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
          </>
        )}
      </div>
    </section>
  );
}
