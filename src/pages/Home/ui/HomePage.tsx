import {
  Universe3D,
  type SceneArtist,
  UNIVERSE_FOCUS_ARTIST_STORAGE_KEY,
} from '../../../components/view/Universe3D';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { ArtistNotFound } from '@shared/ui/artistNotFound';
import { useRedirectHomeAfterOwnAccountDeleted } from '@shared/lib/hooks/useRedirectHomeAfterOwnAccountDeleted';
import { playerActions } from '@features/player';
import { getUserAudioUrl } from '@shared/api/albums';
import { emptyStringMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import type { IAlbums, TracksProps } from '@models';
import { isDashboardPathname } from '@shared/lib/publicArtistContext';
import { resolveAlbumForDisplay } from '@entities/album/lib/resolveAlbumDisplay';
import { fetchAlbums, selectAlbumsStatus, selectPublicAlbumsCacheIsStale } from '@entities/album';
import { fetchArticles } from '@entities/article';
import { generateMockArtists } from '@shared/lib/generateMockArtists';
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
import { ScrollToExploreHint } from './ScrollToExploreHint';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import '../../../components/view/Universe3D.style.scss';

const HOME_USE_MOCKS_STORAGE_KEY = 'homeUseMocks';

export function HomePage() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const hideArtistPageAfterOwnDelete = useRedirectHomeAfterOwnAccountDeleted(hasArtistParam);
  const artistPageAccess = useArtistPageAccess(artistSlug);

  useEffect(() => {
    const handler = () => {
      if (!hasArtistParam) {
        setUniverseRefreshToken((n) => n + 1);
      }
      if (hasArtistParam && !isDashboardPathname()) {
        void dispatch(fetchAlbums({ force: true }));
      }
    };
    window.addEventListener('artist:updated', handler);
    return () => window.removeEventListener('artist:updated', handler);
  }, [dispatch, hasArtistParam]);

  useEffect(() => {
    if (isDashboardPathname()) return;
    if (!hasArtistParam) return;
    if (!catalogCacheStale && albumsStatus !== 'idle') return;
    void dispatch(fetchAlbums({ force: true }));
  }, [albumsStatus, artistSlug, catalogCacheStale, dispatch, hasArtistParam]);

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

  useEffect(() => {
    const underConstructionSurface = hasArtistParam && artistPageAccess.showOwnerUnderConstruction;
    document.body.classList.toggle('page--artist-under-construction', underConstructionSurface);
    return () => document.body.classList.remove('page--artist-under-construction');
  }, [artistPageAccess.showOwnerUnderConstruction, hasArtistParam]);

  useEffect(() => {
    // Каталог грузит root albumsLoader; force здесь давал повторные loading-циклы
    // (в т.ч. каждые 15s при опросе email verification → AUTH_SESSION_CHANGED).
    if (isDashboardPathname()) return;
    if (!hasArtistParam) return;
    void dispatch(fetchArticles({ publicArtistSlug: artistSlug }));
  }, [dispatch, hasArtistParam, artistSlug]);

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

          const url = `/api/albums?artist=${encodeURIComponent(artist.publicSlug)}`;
          const response = await fetchWithAuthSession(url);
          const payload = (await response.json()) as { success?: boolean; data?: IAlbums[] };

          if (
            !response.ok ||
            !payload.success ||
            !Array.isArray(payload.data) ||
            payload.data.length === 0
          ) {
            return false;
          }

          const firstAlbum = payload.data.find(
            (album) => Array.isArray(album.tracks) && album.tracks.length > 0
          );
          if (!firstAlbum) return false;

          const resolvedAlbum = resolveAlbumForDisplay(firstAlbum as IAlbums, lang);

          const playlist: TracksProps[] = resolvedAlbum.tracks.map((track) => {
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
          });

          const startIdx = resolveFirstPlayableIndex(playlist, 0);
          if (startIdx === -1) {
            return false;
          }

          dispatch(playerActions.setPlaylist(playlist));
          dispatch(playerActions.setCurrentTrackIndex(startIdx));

          const albumId = fallbackAlbumClientId(resolvedAlbum);

          dispatch(
            playerActions.setAlbumInfo({
              albumId,
              albumTitle: resolvedAlbum.album,
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
              album: resolvedAlbum.album,
              artist: displayArtist,
              fullName:
                formatAlbumDisplayFullName(resolvedForTitle, resolvedAlbum.album) ||
                resolvedAlbum.album,
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

    if (artistPageAccess.showNotFound) {
      return <ArtistNotFound />;
    }

    if (artistPageAccess.showOnboardingSkeleton) {
      return <ArtistOnboardingSkeleton />;
    }

    if (artistPageAccess.showOnboarding) {
      return <ArtistOnboarding />;
    }

    if (artistPageAccess.showOwnerUnderConstruction) {
      return <ArtistPageUnderConstruction />;
    }

    return (
      <>
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
      <div
        className="home-scene__actions"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 20,
        }}
      >
        {isAuthenticated() ? (
          <ProfileAvatarMenu avatarImgClassName="header__profile-avatar--home" />
        ) : (
          <button
            type="button"
            onClick={() => {
              clearPremiumCheckoutAuthIntent();
              const authParams = new URLSearchParams({ mode: 'login' });
              appendReturnTo(authParams, location);
              navigate(
                { pathname: '/auth', search: `?${authParams.toString()}` },
                { state: { backgroundLocation: location } }
              );
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'rgba(12,12,14,0.72)',
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {ui?.header?.signIn ?? 'Sign in'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setUseMocks((prev) => {
              const next = !prev;
              sessionStorage.setItem(HOME_USE_MOCKS_STORAGE_KEY, next ? '1' : '0');
              return next;
            });
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.35)',
            background: 'rgba(12,12,14,0.72)',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
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
