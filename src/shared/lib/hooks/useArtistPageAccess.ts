import { useEffect, useMemo, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import {
  selectAlbumsStatus,
  selectAlbumsData,
  selectAlbumsFetchContextKey,
  selectCatalogArtistMissing,
  selectDashboardAlbumsData,
  selectDashboardAlbumsStatus,
  selectPublicAlbumsDataResolvedForSurface,
  selectPublicAlbumsCacheIsStale,
  selectPublicCatalogCachedRowCount,
} from '@entities/album';
import {
  selectArticlesStatus,
  selectArticlesDataResolvedForSurface,
  selectArticlesCacheIsStale,
} from '@entities/article';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader, getUser, isAuthenticated } from '@shared/lib/auth';
import { isCachedOwnArtistSlug, writeCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';
import {
  countUniqueAlbums,
  hasVisitorVisibleArtistContent,
  profileHasPublicBodyContent,
} from '@shared/lib/artistPageContent';
import { fetchOwnArtistPageState } from '@shared/lib/ownArtistPage';

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * Доступ к странице артиста: каталог по опубликованным трекам, onboarding только для новых артистов, 404 без публичного контента.
 */
export function useArtistPageAccess(artistSlug: string) {
  const { lang } = useLang();
  const catalogArtistMissing = useAppSelector(selectCatalogArtistMissing);
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsFetchContextKey = useAppSelector(selectAlbumsFetchContextKey);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const publicAlbums = useAppSelector(selectPublicAlbumsDataResolvedForSurface);
  const catalogAlbums = useAppSelector(selectAlbumsData);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsData);
  const dashboardAlbumsStatus = useAppSelector(selectDashboardAlbumsStatus);
  const cachedPublicRowCount = useAppSelector(selectPublicCatalogCachedRowCount);
  const articlesStatus = useAppSelector(selectArticlesStatus);
  const articlesCacheStale = useAppSelector(selectArticlesCacheIsStale);
  const publicArticles = useAppSelector(selectArticlesDataResolvedForSurface);
  const hasPublicReleases = useMemo(() => hasPublishedPublicReleases(publicAlbums), [publicAlbums]);

  const desiredFetchKey = useMemo(() => buildPublicAlbumsFetchContextKey(artistSlug), [artistSlug]);

  const cachedOwner = useMemo(() => {
    if (!isAuthenticated()) return false;
    return isCachedOwnArtistSlug(artistSlug, getUser()?.id);
  }, [artistSlug]);

  const [ownerResolved, setOwnerResolved] = useState(() => {
    const normalizedArtist = normalizeSlug(artistSlug);
    if (!normalizedArtist || !isAuthenticated()) return true;
    return cachedOwner;
  });
  const [isOwner, setIsOwner] = useState(cachedOwner);
  const [ownerNeedsOnboarding, setOwnerNeedsOnboarding] = useState(false);
  const [ownerContentLoaded, setOwnerContentLoaded] = useState(false);
  const [visitorProfileHasPublicBody, setVisitorProfileHasPublicBody] = useState<boolean | null>(
    null
  );

  const ownerAlbumCount = useMemo(() => {
    if (!isOwner) return 0;
    return Math.max(countUniqueAlbums(dashboardAlbums), countUniqueAlbums(catalogAlbums));
  }, [isOwner, dashboardAlbums, catalogAlbums]);

  const ownerStillNeedsOnboarding = ownerNeedsOnboarding && ownerAlbumCount === 0;

  useEffect(() => {
    const normalizedArtist = normalizeSlug(artistSlug);
    if (!normalizedArtist) {
      setIsOwner(false);
      setOwnerResolved(true);
      return;
    }

    if (!isAuthenticated()) {
      setIsOwner(false);
      setOwnerResolved(true);
      return;
    }

    let cancelled = false;
    setIsOwner(cachedOwner);
    setOwnerResolved(cachedOwner);

    if (cachedOwner) {
      return () => {
        cancelled = true;
      };
    }

    setOwnerResolved(false);

    (async () => {
      try {
        const response = await fetchWithAuthSession(
          buildApiUrl('/api/user-profile', { lang }, { includeArtist: false }),
          {
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache',
              ...getAuthHeader(),
            },
          }
        );

        if (cancelled) return;

        if (!response.ok) {
          setIsOwner(false);
          return;
        }

        const result = (await response.json()) as {
          success?: boolean;
          data?: { publicSlug?: string | null };
        };
        const ownSlug = result.success ? normalizeSlug(result.data?.publicSlug ?? '') : '';
        const userId = getUser()?.id?.trim();
        if (ownSlug && userId) writeCachedOwnPublicSlug(userId, ownSlug);
        setIsOwner(Boolean(ownSlug) && ownSlug === normalizedArtist);
      } catch {
        if (!cancelled) setIsOwner(false);
      } finally {
        if (!cancelled) setOwnerResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistSlug, cachedOwner, lang]);

  useEffect(() => {
    if (!isOwner || !ownerResolved) {
      setOwnerContentLoaded(!isOwner);
      setOwnerNeedsOnboarding(false);
      return;
    }

    let cancelled = false;

    const refreshOwnerState = () => {
      setOwnerContentLoaded(false);
      void fetchOwnArtistPageState(lang).then((state) => {
        if (cancelled) return;
        setOwnerNeedsOnboarding(state.needsOnboarding);
        setOwnerContentLoaded(true);
      });
    };

    refreshOwnerState();

    window.addEventListener('artist:updated', refreshOwnerState);
    window.addEventListener('profile-name-updated', refreshOwnerState);

    return () => {
      cancelled = true;
      window.removeEventListener('artist:updated', refreshOwnerState);
      window.removeEventListener('profile-name-updated', refreshOwnerState);
    };
  }, [isOwner, ownerResolved, lang]);

  useEffect(() => {
    const normalizedArtist = normalizeSlug(artistSlug);
    if (isOwner || !ownerResolved || !normalizedArtist) {
      setVisitorProfileHasPublicBody(null);
      return;
    }

    let cancelled = false;
    setVisitorProfileHasPublicBody(null);

    void (async () => {
      try {
        const response = await fetchWithAuthSession(
          buildApiUrl(
            '/api/user-profile',
            { lang },
            { includeArtist: true, artistSlugOverride: normalizedArtist }
          ),
          {
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache',
              ...getAuthHeader(),
            },
          }
        );
        if (cancelled) return;

        if (!response.ok) {
          setVisitorProfileHasPublicBody(false);
          return;
        }

        const result = (await response.json()) as {
          success?: boolean;
          data?: {
            theBand?: string[];
            headerImages?: string[];
            socialLinks?: Record<string, string | undefined>;
          };
        };

        setVisitorProfileHasPublicBody(
          result.success
            ? profileHasPublicBodyContent({
                theBand: result.data?.theBand,
                headerImages: result.data?.headerImages,
                socialLinks: result.data?.socialLinks,
              })
            : false
        );
      } catch {
        if (!cancelled) setVisitorProfileHasPublicBody(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistSlug, isOwner, lang, ownerResolved]);

  const albumsPending =
    catalogCacheStale ||
    albumsStatus === 'idle' ||
    (albumsStatus === 'loading' && cachedPublicRowCount === 0) ||
    (albumsStatus === 'succeeded' &&
      albumsFetchContextKey !== desiredFetchKey &&
      cachedPublicRowCount === 0);

  const visitorProfilePending = !isOwner && visitorProfileHasPublicBody === null;

  /** 404 по контенту артиста: ждём статьи только если в каталоге ещё нет альбомов. */
  const visitorArticlesGatePending =
    !isOwner &&
    publicAlbums.length === 0 &&
    (articlesCacheStale || articlesStatus === 'idle' || articlesStatus === 'loading');

  const visitorAccessPending = visitorProfilePending || visitorArticlesGatePending;

  /**
   * Блокировка списка/страницы альбома. Не включаем `articlesStatus === 'idle'` глобально
   * (/albums/:id не грузит статьи) и не ждём owner onboarding — он только для Home.
   */
  const isLoading = !ownerResolved || albumsPending || visitorAccessPending;

  const hasVisitorVisibleContent = hasVisitorVisibleArtistContent({
    albums: publicAlbums,
    articlesCount: publicArticles.length,
    profileHasPublicBody: visitorProfileHasPublicBody === true,
  });

  /**
   * Онбординг только после fetchOwnArtistPageState — иначе при переходе «My Artist Page»
   * пустой каталог + !ownerContentLoaded кратко показывают onboarding/скелетон онбординга.
   */
  const showOnboarding =
    !catalogArtistMissing && isOwner && ownerContentLoaded && ownerStillNeedsOnboarding;

  /**
   * Дашборд-альбомы владельца уже загружены (succeeded/failed) — значит ownerAlbumCount
   * отражает реальное число альбомов, а не транзиентный 0 на старте. Без этой проверки
   * у обычного артиста (есть релизы) при холодной загрузке каталог ещё пуст, ownerAlbumCount
   * кратко равен 0 и скелетон онбординга ошибочно мигал перед страницей.
   */
  const ownerAlbumsKnown =
    dashboardAlbumsStatus === 'succeeded' || dashboardAlbumsStatus === 'failed';

  /**
   * Окно подтверждения онбординга владельца: личность подтверждена (ownerResolved),
   * дашборд достоверно сообщил об отсутствии альбомов, но fetchOwnArtistPageState ещё
   * в полёте (ownerContentLoaded === false). Без скелетона Home кратко рисует опубликованную
   * поверхность (hero + скелетон альбомов) перед экраном онбординга — «грязные» кадры при
   * переходе из дашборда «Открыть страницу артиста». Условие срабатывает только для владельца
   * без альбомов, поэтому у артистов с релизами поведение не меняется.
   */
  const ownerOnboardingResolutionPending =
    isOwner && ownerResolved && ownerAlbumsKnown && ownerAlbumCount === 0 && !ownerContentLoaded;

  const showOnboardingSkeleton = !catalogArtistMissing && ownerOnboardingResolutionPending;

  const showNotFound =
    !isLoading &&
    !visitorArticlesGatePending &&
    (catalogArtistMissing || (!isOwner && !hasVisitorVisibleContent));
  const showPublished =
    !isLoading &&
    !catalogArtistMissing &&
    !showOnboarding &&
    !showOnboardingSkeleton &&
    !showNotFound;
  const suppressPublishedArtistChrome = showOnboarding || showOnboardingSkeleton || showNotFound;

  return {
    isLoading,
    isOwner,
    hasPublicReleases,
    showOnboarding,
    showOnboardingSkeleton,
    showNotFound,
    showPublished,
    suppressPublishedArtistChrome,
  };
}
