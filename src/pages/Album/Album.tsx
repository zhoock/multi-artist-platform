// src/pages/Album/Album.tsx

import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

import {
  AlbumCover,
  AlbumDetails,
  fetchAlbumDetailsPage,
  mapAlbumEditableToAlbumDetails,
  resolveAlbumDetailsForRoute,
  selectAlbumDetailsResolved,
  selectAlbumDetailsStatus,
  selectAlbumDetailsErrorCode,
  selectAlbumDetailsState,
  selectDashboardAlbumByIdResolved,
  type AlbumDetailsData,
} from '@entities/album';
import { AlbumTracks } from '@widgets/albumTracks';
import { Share } from '@features/share';
import {
  ServiceButtons,
  hasAlbumStreamSectionContent,
  isAlbumViewerOwner,
  useShowAlbumPurchaseSection,
} from '@entities/service';
import { ErrorI18n } from '@shared/ui/error-message';
import { AlbumSkeleton } from '@shared/ui/skeleton';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { ArtistNotFound } from '@shared/ui/artistNotFound';
import { ArtistPageUnderConstruction } from '@pages/Home/ui/ArtistPageUnderConstruction';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { useRedirectAfterDeletedAlbum } from '@shared/lib/hooks/useRedirectAfterDeletedAlbum';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { formatAlbumDisplayFullName } from '@shared/lib/profileDisplayName';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { shouldShowAlbumsLoadingShell } from '@shared/lib/hooks/useShowAlbumsLoadingShell';
import { resolveChildContextNavMode, useNavigationOrigin } from '@shared/lib/navigationContext';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { ContextNav } from '@shared/ui/contextNav';

export default function Album() {
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const location = useEffectiveLocation();
  const artistParam = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('artist');
  }, [location.search]);
  const artistSlug = artistParam ?? '';
  const artistPageAccess = useArtistPageAccess(artistSlug);
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, {
    artistSlug: artistParam,
  });
  const navigate = useNavigate();
  const { albumId = '' } = useParams<{ albumId: string }>();
  const albumDetailsStatus = useAppSelector(selectAlbumDetailsStatus);
  const albumDetailsErrorCode = useAppSelector(selectAlbumDetailsErrorCode);
  const albumDetailsState = useAppSelector(selectAlbumDetailsState);
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(!!artistParam);
  const hideDeletedAlbumPage = useRedirectAfterDeletedAlbum(albumId, artistSlug);
  const resolvedDetails = useAppSelector(selectAlbumDetailsResolved);
  const dashboardAlbum = useAppSelector((state) =>
    selectDashboardAlbumByIdResolved(state, albumId)
  );

  const albumFromDetails: AlbumDetailsData | undefined = resolveAlbumDetailsForRoute({
    resolvedDetails,
    routeAlbumId: albumId,
    artistSlug: artistParam,
    slotArtistSlug: albumDetailsState.artistSlug,
    slotAlbumId: albumDetailsState.albumId,
  });
  const detailsMatchRoute = albumFromDetails != null;

  /**
   * Public path: AlbumDetails from mid-weight API.
   * Owner unpublished draft: map dashboard AlbumEditable → AlbumDetails (Dashboard CRUD untouched).
   * Same-album SWR (refetch / rename after adoptAlbumDetailsAlbumId) when payload slug matches route.
   */
  const albumFromOwnerDashboard: AlbumDetailsData | undefined =
    !albumFromDetails && artistPageAccess.isOwner && dashboardAlbum
      ? mapAlbumEditableToAlbumDetails(dashboardAlbum)
      : undefined;
  const album: AlbumDetailsData | undefined = albumFromDetails ?? albumFromOwnerDashboard;

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const viewer = useAuthSessionUser();
  const showPurchaseSection = useShowAlbumPurchaseSection(album);
  const showAlbumLoadingShell = shouldShowAlbumsLoadingShell(
    albumDetailsStatus,
    Boolean(albumFromDetails)
  );

  useEffect(() => {
    const slug = artistParam?.trim();
    if (!slug || !albumId) return;
    void dispatch(fetchAlbumDetailsPage({ artistSlug: slug, albumId }));
  }, [artistParam, albumId, dispatch]);

  const navigationOrigin = useNavigationOrigin();
  const contextNavMode = resolveChildContextNavMode(navigationOrigin);
  const artistHubPath = withPublicArtistQuery('/', artistParam);
  const albumsListLink = withPublicArtistQuery('/albums', artistParam);

  useEffect(() => {
    // Direct URL without ?artist=: resolve owner slug and redirect.
    if (!albumId || artistParam) return;

    let isCancelled = false;

    const resolveOwnerAndRedirect = async () => {
      try {
        const response = await fetchWithAuthSession(
          `/api/albums?resolveOwnerByAlbumId=true&albumId=${encodeURIComponent(albumId)}`
        );
        if (!response.ok) return;

        const result = await response.json();
        const resolvedSlug = result?.success ? result?.data?.artistSlug : null;
        if (!resolvedSlug || isCancelled) return;

        navigate(`/albums/${albumId}?artist=${encodeURIComponent(resolvedSlug)}`, {
          replace: true,
        });
      } catch {
        // noop: keep standard "album not found" behavior if resolve fails
      }
    };

    void resolveOwnerAndRedirect();

    return () => {
      isCancelled = true;
    };
  }, [albumId, artistParam, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [albumId]);

  if (hideArtistPageAfterOwnDelete || hideDeletedAlbumPage) {
    return null;
  }

  if (artistParam && artistPageAccess.isLoading) {
    return <AlbumSkeleton />;
  }

  if (artistParam && artistPageAccess.showNotFound) {
    return <ArtistNotFound />;
  }

  if (artistParam && artistPageAccess.showVisitorUnderConstruction) {
    return <ArtistPageUnderConstruction />;
  }

  if (artistParam && showAlbumLoadingShell) {
    return <AlbumSkeleton />;
  }

  if (artistParam && albumDetailsStatus === 'failed') {
    return (
      <section className="album main-background" aria-label="Блок c альбомом">
        <div className="wrapper album__wrapper">
          <ErrorI18n code="albumLoadFailed" />
        </div>
      </section>
    );
  }

  if (
    artistParam &&
    albumDetailsStatus === 'succeeded' &&
    !album &&
    (albumDetailsErrorCode === 'ARTIST_NOT_FOUND' ||
      albumDetailsErrorCode === 'ALBUM_NOT_FOUND' ||
      !detailsMatchRoute)
  ) {
    if (albumDetailsErrorCode === 'ARTIST_NOT_FOUND') {
      return <ArtistNotFound />;
    }
    return (
      <section className="album main-background" aria-label="Блок c альбомом">
        <div className="wrapper album__wrapper">
          <ErrorI18n code="albumNotFound" />
        </div>
      </section>
    );
  }

  if (!album) {
    // Waiting for ?artist= resolve, or owner dashboard still empty.
    if (!artistParam || albumDetailsStatus === 'loading' || albumDetailsStatus === 'idle') {
      return <AlbumSkeleton />;
    }
    return (
      <section className="album main-background" aria-label="Блок c альбомом">
        <div className="wrapper album__wrapper">
          <ErrorI18n code="albumNotFound" />
        </div>
      </section>
    );
  }

  const isAlbumOwner = isAlbumViewerOwner(album, viewer?.id);
  const inArtistPublicContext = Boolean(artistParam?.trim());
  if (!album.visibility.isPublished && !isAlbumOwner) {
    return (
      <section className="album main-background" aria-label="Блок c альбомом">
        <div className="wrapper album__wrapper">
          <ErrorI18n code="albumNotFound" />
        </div>
      </section>
    );
  }
  if (!album.visibility.isPublic && !isAlbumOwner && !inArtistPublicContext) {
    return (
      <section className="album main-background" aria-label="Блок c альбомом">
        <div className="wrapper album__wrapper">
          <ErrorI18n code="albumNotFound" />
        </div>
      </section>
    );
  }

  const seoTitle = formatAlbumDisplayFullName(siteArtistName, album.title);
  const seoDesc = album.description;

  const canonical = buildPublicSiteUrl(`/albums/${encodeURIComponent(albumId)}`);

  return (
    <section className="album main-background" aria-label="Блок c альбомом">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta property="og:type" content="music.album" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Helmet>

      <div className="wrapper album__wrapper">
        <ContextNav
          mode={contextNavMode}
          artistName={siteArtistName}
          artistTo={artistHubPath}
          listLabel={ui?.titles?.albums}
          listTo={albumsListLink}
        />

        <div className="item">
          <AlbumCover
            img={album.cover || ''}
            userId={album.userId}
            fullName={formatAlbumDisplayFullName(siteArtistName, album.title)}
          />
          <Share />
        </div>

        <div className="item">
          <AlbumTracks album={album} />
        </div>

        {showPurchaseSection === true && (
          <div className="item">
            <ServiceButtons album={album} section="Купить" />
          </div>
        )}

        {hasAlbumStreamSectionContent(album) && (
          <div className="item">
            <ServiceButtons album={album} section="Слушать" />
          </div>
        )}
      </div>

      <AlbumDetails album={album} />
    </section>
  );
}
