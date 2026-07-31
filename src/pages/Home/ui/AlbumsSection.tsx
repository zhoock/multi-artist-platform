import { useMemo, useState, useEffect } from 'react';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { WrapperAlbumCover, AlbumCover } from '@entities/album';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumsSkeleton } from '@shared/ui/skeleton/AlbumsSkeleton';
import { ArtistSectionHeading } from '@shared/ui/artistSectionHeading';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import {
  selectDashboardAlbumsDataResolved,
  selectArtistAlbumCatalogStatus,
  selectArtistAlbumCatalogError,
  selectArtistAlbumCatalogCacheIsStale,
  selectArtistAlbumCatalogForSurface,
  selectArtistAlbumCatalogArtistMissing,
} from '@entities/album';
import { isAlbumDraft } from '@entities/album/lib/albumPublication';
import { filterCatalogAlbumsForArtistPageSurface } from '@entities/album/lib/catalogPublication';
import { filterAlbumsForArtistPageSurface } from '@shared/lib/artistPageContent';
import type { CatalogAlbum } from '@entities/album';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { buildArtistAlbumsCatalogPath } from '@shared/lib/seo/publicPagePaths';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { shouldShowAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderSectionIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { Disc3 as DiscIcon } from 'lucide-react';
import '@entities/album/ui/album-list.scss';

/** Card fields for Home albums grid — thin catalog or owner draft projection. */
type AlbumCardView = {
  albumId: string;
  title: string;
  cover: string;
  userId?: string;
  releaseDate: string;
};

function catalogToCard(album: CatalogAlbum): AlbumCardView {
  return {
    albumId: album.albumId,
    title: album.title,
    cover: album.cover,
    userId: album.userId,
    releaseDate: album.releaseDate,
  };
}

// Адаптивное количество альбомов для отображения на главной
const getInitialCount = () => {
  if (typeof window === 'undefined') return 12;
  if (window.innerWidth >= 1024) return 16; // десктоп
  if (window.innerWidth >= 768) return 12; // планшет
  return 6; // мобильный (но там карусель, так что это не критично)
};

export function AlbumsSection({ isOwner = false }: { isOwner?: boolean }) {
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const artistSlug = searchParams.get('artist');
  const { builderVisibility, hasPublicReleases } = useArtistPageBuilder(artistSlug?.trim() ?? '');
  const { openDashboard } = useArtistPageBuilderNav();
  const showAlbumBuilder = shouldShowArtistPageBuilderBlock(builderVisibility, !hasPublicReleases);
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(!!artistSlug);
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, { artistSlug });
  const catalogStatus = useAppSelector(selectArtistAlbumCatalogStatus);
  const catalogError = useAppSelector(selectArtistAlbumCatalogError);
  const catalogCacheStale = useAppSelector(selectArtistAlbumCatalogCacheIsStale);
  const catalogArtistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const publicCatalogAlbums = useAppSelector(selectArtistAlbumCatalogForSurface);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsDataResolved);

  const allAlbums = useMemo((): AlbumCardView[] => {
    if (!isOwner) {
      return filterCatalogAlbumsForArtistPageSurface(
        catalogCacheStale ? [] : publicCatalogAlbums,
        false
      ).map(catalogToCard);
    }

    const ownerDrafts = filterAlbumsForArtistPageSurface(dashboardAlbums, true)
      .filter((album) => isAlbumDraft(album))
      .map(
        (album): AlbumCardView => ({
          albumId: album.albumId ?? '',
          title: album.album,
          cover: album.cover || '',
          userId: album.userId,
          releaseDate: typeof album.release?.date === 'string' ? album.release.date : '',
        })
      )
      .filter((album) => album.albumId);

    if (catalogCacheStale) {
      const fromDashboard = filterAlbumsForArtistPageSurface(dashboardAlbums, true).map(
        (album): AlbumCardView => ({
          albumId: album.albumId ?? '',
          title: album.album,
          cover: album.cover || '',
          userId: album.userId,
          releaseDate: typeof album.release?.date === 'string' ? album.release.date : '',
        })
      );
      const cards = fromDashboard.length > 0 ? fromDashboard : ownerDrafts;
      return cards.filter((album) => album.albumId);
    }

    const draftIds = new Set(ownerDrafts.map((album) => album.albumId));
    const publicCards = filterCatalogAlbumsForArtistPageSurface(publicCatalogAlbums, true)
      .filter((album) => !isAlbumDraft(album))
      .map(catalogToCard);
    const publicIds = new Set(publicCards.map((album) => album.albumId));

    return [
      ...ownerDrafts.filter((album) => !publicIds.has(album.albumId)),
      ...publicCards.filter((album) => !draftIds.has(album.albumId)),
    ];
  }, [catalogCacheStale, dashboardAlbums, isOwner, publicCatalogAlbums]);

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const showAlbumsLoadingShell =
    !catalogArtistMissing &&
    shouldShowAlbumsLoadingShell(catalogStatus, allAlbums.length > 0, catalogCacheStale);

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
  const allAlbumsPath = buildArtistAlbumsCatalogPath(lang, artistSlug?.trim() ?? '');
  const showSectionLink = !showAlbumsLoadingShell && hasMore;

  if (hideArtistPageAfterOwnDelete) {
    return null;
  }

  if (
    !catalogCacheStale &&
    catalogStatus === 'succeeded' &&
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
        ) : catalogStatus === 'failed' || catalogError ? (
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
          </>
        )}
      </div>
    </section>
  );
}
