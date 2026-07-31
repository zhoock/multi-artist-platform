import {
  Universe3D,
  type SceneArtist,
  UNIVERSE_FOCUS_ARTIST_STORAGE_KEY,
} from '../../../components/view/Universe3D';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ArtistNotFound } from '@shared/ui/artistNotFound';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { playerActions, toPlayerTracks } from '@features/player';
import { getUserAudioUrl } from '@shared/api/albums';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';
import { bootstrapPublicArtistPageSurfaces } from '@shared/lib/bootstrapPublicArtistPageSurfaces';
import { fetchDashboardAlbums } from '@entities/album';
import { fetchArticles } from '@entities/article';
import { generateMockArtists } from '@shared/lib/generateMockArtists';
import { fetchUniverseArtistPlayAlbum } from '@features/universe/lib/fetchUniverseArtistPlayAlbum';
import { prepareUniverseData } from '@features/universe/model/prepareUniverseData';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  fetchPublicProfileForDisplay,
  formatAlbumDisplayFullName,
  readStoredProfileDisplayName,
  siteArtistUiLabel,
} from '@shared/lib/profileDisplayName';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import {
  isTrackPlaybackBlocked,
  resolveFirstPlayableIndex,
} from '@shared/lib/tracks/trackPlayback';
import { clearPremiumCheckoutAuthIntent } from '@shared/lib/authIntent';
import { appendReturnTo } from '@shared/lib/authReturnUrl';
import { isAuthenticated } from '@shared/lib/auth';
import { ProfileAvatarMenu } from '@widgets/header';
import { UniverseFloatingSearch } from '@features/universeSearch';
import { AboutSection } from './AboutSection';
import { AlbumsSection } from './AlbumsSection';
import { ArticlesSection } from './ArticlesSection';
import { ArtistOnboarding } from './ArtistOnboarding';
import { ArtistOnboardingSkeleton } from './ArtistOnboardingSkeleton';
import { ArtistPageUnderConstruction } from './ArtistPageUnderConstruction';
import { ArtistPageBuilderPaymentBar } from './ArtistPageBuilderPaymentBar';
import { ArtistPageSkeletonMain } from './ArtistPageSkeleton';
import { ScrollToExploreHint } from './ScrollToExploreHint';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { useArtistPageSeo } from '@shared/lib/hooks/useArtistPageSeo';
import { ArtistPageSeoHelmet } from './ArtistPageSeoHelmet';
import '../../../components/view/Universe3D.style.scss';
import './homeSceneChrome.scss';

const HOME_USE_MOCKS_STORAGE_KEY = 'homeUseMocks';

export function HomePage() {
  const dispatch = useAppDispatch();
  const location = useEffectiveLocation();
  const navigate = useNavigate();
  const [searchParams] = useEffectiveSearchParams();
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const universeRef = useRef<Universe3D | null>(null);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [useMocks, setUseMocks] = useState(() => {
    try {
      return sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [universeRefreshToken, setUniverseRefreshToken] = useState(0);
  const [sceneArtists, setSceneArtists] = useState<SceneArtist[]>([]);
  const hasArtistParam = !!searchParams.get('artist');
  const artistSlug = searchParams.get('artist') || '';
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(hasArtistParam);
  const artistPageAccess = useArtistPageBuilder(artistSlug);
  const artistPageSeo = useArtistPageSeo({
    lang,
    artistSlug,
    enabled: hasArtistParam && !hideArtistPageAfterOwnDelete,
    forcePlatformFallback: artistPageAccess.showNotFound,
  });

  /**
   * `artist:updated` — сигнал для Universe / профиля / about, не для каталога.
   * Публичный catalog / albumDetails / articles после правок обновляет
   * `notifyPublicSurfaceChanged` (`@shared/lib/publicSurfaceSync`).
   */
  useEffect(() => {
    const handler = () => {
      if (!hasArtistParam) {
        setUniverseRefreshToken((n) => n + 1);
      }
    };
    window.addEventListener('artist:updated', handler);
    return () => window.removeEventListener('artist:updated', handler);
  }, [hasArtistParam]);

  /**
   * Единственный источник первичной загрузки публичного каталога на `/?artist=`.
   * Thin catalog → Artist Page cards; Universe play → catalog + AlbumDetails (не fat `/api/albums`).
   * Loader при defer не диспатчит fetch (см. shouldDeferPublicArtistCatalogToSurface).
   */
  useEffect(() => {
    if (!shouldUsePublicArtistCatalogInRedux()) return;
    if (!hasArtistParam) return;

    bootstrapPublicArtistPageSurfaces(dispatch, artistSlug);
  }, [artistSlug, dispatch, hasArtistParam, location.pathname, location.search]);

  /**
   * Owner Dashboard fat-albums (`AlbumEditable`). Не зависит от thin CatalogAlbum fetch.
   */
  useEffect(() => {
    if (!shouldUsePublicArtistCatalogInRedux()) return;
    if (!hasArtistParam) return;
    if (!artistPageAccess.isOwner || !artistPageAccess.ownerResolved) return;

    void dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true }));
    void dispatch(fetchArticles({ force: true, ownerDashboard: true }));
  }, [
    artistPageAccess.isOwner,
    artistPageAccess.ownerResolved,
    artistSlug,
    dispatch,
    hasArtistParam,
  ]);

  useEffect(() => {
    const onboardingSurface =
      artistPageAccess.showOnboarding || artistPageAccess.showOnboardingSkeleton;
    document.body.classList.toggle('page--artist-onboarding', onboardingSurface);
    return () => document.body.classList.remove('page--artist-onboarding');
  }, [artistPageAccess.showOnboarding, artistPageAccess.showOnboardingSkeleton]);

  useEffect(() => {
    const notFoundSurface = hasArtistParam && artistPageAccess.showNotFound;
    document.body.classList.toggle('page--artist-not-found', notFoundSurface);
    return () => document.body.classList.remove('page--artist-not-found');
  }, [artistPageAccess.showNotFound, hasArtistParam]);

  const handleSearchMatchesChange = useCallback((matchedSlugs: string[] | null) => {
    universeRef.current?.setSearchHighlight(matchedSlugs);
  }, []);

  const handleSearchSelectArtist = useCallback((publicSlug: string) => {
    universeRef.current?.navigateToArtistFromSearch(publicSlug);
  }, []);

  useEffect(() => {
    if (hasArtistParam) return;
    if (!sceneRef.current) return;

    setSceneArtists([]);

    let universe: Universe3D | null = null;
    let cancelled = false;

    const init = async () => {
      let apiArtists: SceneArtist[] = [];

      const [publicArtistsResult, profileRow] = await Promise.all([
        (async () => {
          try {
            const response = await fetchWithAuthSession('/api/public-artists', {
              cache: 'no-store',
            });
            const payload = (await response.json()) as { success?: boolean; data?: SceneArtist[] };
            if (response.ok && payload.success && Array.isArray(payload.data)) {
              return payload.data;
            }
          } catch (error) {
            console.warn(
              '[HomePage] Failed to fetch /api/public-artists, using fallback data',
              error
            );
          }
          return [];
        })(),
        fetchPublicProfileForDisplay(lang),
      ]);

      apiArtists = publicArtistsResult;

      let artists = prepareUniverseData(useMocks ? generateMockArtists(50) : apiArtists);
      if (
        !useMocks &&
        profileRow.publicSlug &&
        profileRow.displayName.trim() &&
        apiArtists.some((a) => a.publicSlug === profileRow.publicSlug)
      ) {
        artists = artists.map((a) =>
          a.publicSlug === profileRow.publicSlug ? { ...a, name: profileRow.displayName } : a
        );
      }

      if (cancelled || !sceneRef.current) return;
      setSceneArtists(artists);
      universe = new Universe3D(sceneRef.current, artists, {
        onNavigateToArtist: (publicSlug) => {
          sessionStorage.setItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, publicSlug);
          navigate({
            pathname: '/',
            search: `?artist=${encodeURIComponent(publicSlug)}`,
            hash: '',
          });
        },
        onPlayArtist: async (artist) => {
          if (!artist?.publicSlug) return false;

          const resolvedAlbum = await fetchUniverseArtistPlayAlbum(artist.publicSlug, lang);
          if (!resolvedAlbum) return false;

          const albumId = fallbackAlbumClientId(resolvedAlbum);
          const playlist = toPlayerTracks(
            resolvedAlbum.tracks.map((track) => {
              if (isTrackPlaybackBlocked(track)) {
                return { ...track, src: '' };
              }
              return {
                ...track,
                src: emptyStringMediaSrc(
                  getUserAudioUrl(track.src, undefined, resolvedAlbum.userId),
                  'HomePage:heroPlaylist',
                  { trackId: track.id, albumUserId: resolvedAlbum.userId }
                ),
              };
            }),
            albumId
          );

          const startIdx = resolveFirstPlayableIndex(playlist, 0);
          if (startIdx === -1) {
            return false;
          }

          dispatch(playerActions.setPlaylist(playlist));
          dispatch(playerActions.setCurrentTrackIndex(startIdx));

          dispatch(
            playerActions.setAlbumInfo({
              albumId,
              albumTitle: resolvedAlbum.title,
            })
          );

          const profileRow = await fetchPublicProfileForDisplay(lang, artist.publicSlug ?? null);
          const resolvedForTitle =
            profileRow.displayName.trim() || readStoredProfileDisplayName().trim();
          const displayArtist = siteArtistUiLabel(profileRow.displayName);
          dispatch(
            playerActions.setAlbumMeta({
              albumId,
              userId: resolvedAlbum.userId ?? null,
              publicSlug: artist.publicSlug,
              album: resolvedAlbum.title,
              artist: displayArtist,
              fullName:
                formatAlbumDisplayFullName(resolvedForTitle, resolvedAlbum.title) ||
                resolvedAlbum.title,
              cover: resolvedAlbum.cover ?? null,
            })
          );

          dispatch(
            playerActions.setSourceLocation({
              pathname: location.pathname,
              search: location.search || undefined,
            })
          );

          dispatch(playerActions.requestPlay());

          // Force mini-player mode for this flow (avoid hidden mini when URL has #player).
          navigate(
            {
              pathname: location.pathname,
              search: location.search || undefined,
              hash: '',
            },
            { replace: true }
          );
          return true;
        },
      });

      universeRef.current = universe;

      const focusSlug = sessionStorage.getItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY);
      if (focusSlug) {
        setTimeout(() => {
          universe?.focusOnArtist(focusSlug);
        }, 300);
        sessionStorage.removeItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY);
      }
    };

    void init();

    return () => {
      cancelled = true;
      setSceneArtists([]);
      universeRef.current = null;
      universe?.destroy();
      if (sceneRef.current) {
        sceneRef.current.innerHTML = '';
      }
    };
  }, [
    dispatch,
    hasArtistParam,
    lang,
    location.pathname,
    location.search,
    navigate,
    useMocks,
    universeRefreshToken,
  ]);

  if (hasArtistParam) {
    if (hideArtistPageAfterOwnDelete) {
      return null;
    }

    const artistSeoHelmet = <ArtistPageSeoHelmet seo={artistPageSeo} />;

    if (artistPageAccess.showNotFound) {
      return (
        <>
          {artistSeoHelmet}
          <ArtistNotFound />
        </>
      );
    }

    if (artistPageAccess.showOnboardingSkeleton) {
      return (
        <>
          {artistSeoHelmet}
          <ArtistOnboardingSkeleton />
        </>
      );
    }

    if (artistPageAccess.showOnboarding) {
      return (
        <>
          {artistSeoHelmet}
          <ArtistOnboarding />
        </>
      );
    }

    if (artistPageAccess.showVisitorUnderConstruction) {
      return (
        <>
          {artistSeoHelmet}
          <ArtistPageUnderConstruction />
        </>
      );
    }

    if (!artistPageAccess.pageReady) {
      return (
        <>
          {artistSeoHelmet}
          <ArtistPageSkeletonMain variant={artistPageAccess.skeletonVariant} />
        </>
      );
    }

    return (
      <>
        {artistSeoHelmet}
        <ArtistPageBuilderPaymentBar />
        <AlbumsSection isOwner={artistPageAccess.isOwner} />
        <ArticlesSection />
        <AboutSection
          isAboutModalOpen={isAboutModalOpen}
          onOpen={() => setIsAboutModalOpen(true)}
          onClose={() => setIsAboutModalOpen(false)}
        />
      </>
    );
  }

  return (
    <section
      aria-label="Cloud scene"
      className="home-scene"
      style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}
    >
      <UniverseFloatingSearch
        artists={sceneArtists}
        onSearchMatchesChange={handleSearchMatchesChange}
        onNavigateToArtist={handleSearchSelectArtist}
      />
      <div className="home-scene__actions">
        {isAuthenticated() ? (
          <ProfileAvatarMenu />
        ) : (
          <button
            type="button"
            className="home-scene__sign-in"
            onClick={() => {
              clearPremiumCheckoutAuthIntent();
              const authParams = new URLSearchParams({ mode: 'login' });
              appendReturnTo(authParams, location);
              navigate(
                { pathname: '/auth', search: `?${authParams.toString()}` },
                { state: { backgroundLocation: location } }
              );
            }}
          >
            {ui?.header?.signIn ?? 'Sign in'}
          </button>
        )}
        <button
          type="button"
          className="home-scene__dev-toggle"
          onClick={() => {
            setUseMocks((prev) => {
              const next = !prev;
              sessionStorage.setItem(HOME_USE_MOCKS_STORAGE_KEY, next ? '1' : '0');
              return next;
            });
          }}
        >
          {useMocks ? 'Mocks: ON' : 'Mocks: OFF'}
        </button>
      </div>
      <div
        ref={sceneRef}
        style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}
      />
      <ScrollToExploreHint />
    </section>
  );
}

export default HomePage;
