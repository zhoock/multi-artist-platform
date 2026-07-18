import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  selectDashboardArticlesDataResolved,
  selectDashboardArticlesStatus,
} from '@entities/article';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader, getUser, isAuthenticated } from '@shared/lib/auth';
import { isCachedOwnArtistSlug, writeCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';
import {
  countUniqueAlbums,
  countUniqueArticles,
  hasVisitorVisibleArtistContent,
  profileHasPublicBodyContent,
} from '@shared/lib/artistPageContent';
import { fetchOwnArtistPageState } from '@shared/lib/ownArtistPage';
import { fetchPublicProfileForDisplay } from '@shared/lib/profileDisplayName';
import { getPaymentSettings } from '@shared/api/payment/settings';
import { resolveMonetizationEnabled } from '@shared/lib/payment/artistMonetization';
import { subscribeArtistMonetizationChanged } from '@shared/lib/payment/artistMonetizationEvents';
import { loadSocialLinksFromDatabase, loadTheBandFromDatabase } from '@entities/user/lib';
import { useArtistHeroHeaderImages } from './useArtistHeroHeaderImages';

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function isArtistHomePath(pathname: string): boolean {
  return pathname === '/' || pathname === '/en' || pathname === '/en/';
}

/** Loader/fetch альбомов: Home, /albums*, /stems* — на /articles* каталог остаётся idle. */
function routeRequiresAlbumsSurface(pathname: string): boolean {
  if (isArtistHomePath(pathname)) return true;
  if (/^\/(?:en\/)?albums(?:\/|$)/.test(pathname)) return true;
  return /^\/(?:en\/)?stems(?:\/|$)/.test(pathname);
}

/** Loader/fetch статей: Home и /articles* — на /albums/:id они остаются idle. */
function routeRequiresArticlesSurface(pathname: string): boolean {
  if (isArtistHomePath(pathname)) return true;
  return /^\/(?:en\/)?articles(?:\/|$)/.test(pathname);
}

export type ArtistPageAccessValue = {
  isLoading: boolean;
  isOwner: boolean;
  ownerResolved: boolean;
  ownerContentLoaded: boolean;
  ownerStillNeedsOnboarding: boolean;
  hasPublicReleases: boolean;
  showOnboarding: boolean;
  showOnboardingSkeleton: boolean;
  showOwnerUnderConstruction: boolean;
  showVisitorUnderConstruction: boolean;
  showNotFound: boolean;
  showPublished: boolean;
  pageReady: boolean;
  showArtistPageSkeleton: boolean;
  showArtistPageSurfacePending: boolean;
  showArtistPageHeroPending: boolean;
  showArtistPageLayoutPending: boolean;
  headerImages: string[];
  isHeaderImagesReady: boolean;
  suppressPublishedArtistChrome: boolean;
  /** Artist has connected payment acceptance — gates collection / exclusive content. */
  monetizationEnabled: boolean;
};

type UseArtistPageAccessStateOptions = {
  enabled?: boolean;
};

/**
 * Доступ к странице артиста: каталог по опубликованным трекам, onboarding только для новых артистов, 404 без публичного контента.
 */
export function useArtistPageAccessState(
  artistSlug: string,
  options: UseArtistPageAccessStateOptions = {}
) {
  const enabled = options.enabled ?? true;
  const { pathname } = useLocation();
  const { lang } = useLang();
  const catalogArtistMissing = useAppSelector(selectCatalogArtistMissing);
  const albumsStatus = useAppSelector(selectAlbumsStatus);
  const albumsFetchContextKey = useAppSelector(selectAlbumsFetchContextKey);
  const catalogCacheStale = useAppSelector(selectPublicAlbumsCacheIsStale);
  const publicAlbums = useAppSelector(selectPublicAlbumsDataResolvedForSurface);
  const catalogAlbums = useAppSelector(selectAlbumsData);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsData);
  const dashboardAlbumsStatus = useAppSelector(selectDashboardAlbumsStatus);
  const dashboardArticles = useAppSelector(selectDashboardArticlesDataResolved);
  const dashboardArticlesStatus = useAppSelector(selectDashboardArticlesStatus);
  const cachedPublicRowCount = useAppSelector(selectPublicCatalogCachedRowCount);
  const articlesStatus = useAppSelector(selectArticlesStatus);
  const articlesCacheStale = useAppSelector(selectArticlesCacheIsStale);
  const publicArticles = useAppSelector(selectArticlesDataResolvedForSurface);
  const hasPublicReleases = useMemo(() => hasPublishedPublicReleases(publicAlbums), [publicAlbums]);
  const { headerImages, isHeaderImagesReady } = useArtistHeroHeaderImages(
    enabled ? artistSlug : ''
  );

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
  const [ownerHasPublicPageContent, setOwnerHasPublicPageContent] = useState(false);
  const [ownerContentLoaded, setOwnerContentLoaded] = useState(false);
  const [visitorProfileHasPublicBody, setVisitorProfileHasPublicBody] = useState<boolean | null>(
    null
  );
  const [aboutSurfaceReady, setAboutSurfaceReady] = useState(false);
  const [socialSurfaceReady, setSocialSurfaceReady] = useState(false);
  const [paymentSurfaceReady, setPaymentSurfaceReady] = useState(true);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [artistDisplayNameReady, setArtistDisplayNameReady] = useState(false);

  const ownerAlbumCount = useMemo(() => {
    if (!isOwner) return 0;
    const dashboardCount = countUniqueAlbums(dashboardAlbums);
    // Дашборд — источник правды для владельца; устаревший публичный кэш (например,
    // опубликованный альбом до delete track → delete album) не должен блокировать онбординг.
    if (dashboardAlbumsStatus === 'succeeded' || dashboardAlbumsStatus === 'failed') {
      return dashboardCount;
    }
    return Math.max(dashboardCount, countUniqueAlbums(catalogAlbums));
  }, [isOwner, dashboardAlbums, catalogAlbums, dashboardAlbumsStatus]);

  const ownerArticleCount = useMemo(() => {
    if (!isOwner) return 0;
    return countUniqueArticles(dashboardArticles);
  }, [isOwner, dashboardArticles]);

  const ownerStillNeedsOnboarding =
    ownerNeedsOnboarding && ownerAlbumCount === 0 && ownerArticleCount === 0;

  useEffect(() => {
    if (!enabled) return;

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
  }, [artistSlug, cachedOwner, enabled, lang]);

  useEffect(() => {
    if (!enabled) return;

    if (!isOwner || !ownerResolved) {
      setOwnerContentLoaded(!isOwner);
      setOwnerNeedsOnboarding(false);
      setOwnerHasPublicPageContent(false);
      return;
    }

    let cancelled = false;

    /**
     * Не сбрасываем `ownerContentLoaded` при фоновом refresh (закрытие Dashboard /
     * artist:updated): иначе pageReady мигает и вся страница артиста уходит в skeleton.
     * Первый load по-прежнему ждёт ready=false → true.
     */
    const refreshOwnerState = (options?: { keepReady?: boolean }) => {
      const keepReady = options?.keepReady === true;
      if (!keepReady) {
        setOwnerContentLoaded(false);
      }
      void fetchOwnArtistPageState(lang).then((state) => {
        if (cancelled) return;
        setOwnerNeedsOnboarding(state.needsOnboarding);
        setOwnerHasPublicPageContent(state.hasPublicPageContent);
        setOwnerContentLoaded(true);
      });
    };

    refreshOwnerState();

    const softRefreshOwnerState = () => refreshOwnerState({ keepReady: true });

    window.addEventListener('artist:updated', softRefreshOwnerState);
    window.addEventListener('profile-name-updated', softRefreshOwnerState);

    return () => {
      cancelled = true;
      window.removeEventListener('artist:updated', softRefreshOwnerState);
      window.removeEventListener('profile-name-updated', softRefreshOwnerState);
    };
  }, [enabled, isOwner, ownerResolved, lang]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [artistSlug, enabled, isOwner, lang, ownerResolved]);

  useEffect(() => {
    if (!enabled) return;

    const normalizedArtist = normalizeSlug(artistSlug);
    if (!normalizedArtist || !ownerResolved) {
      setAboutSurfaceReady(false);
      setSocialSurfaceReady(false);
      setArtistDisplayNameReady(false);
      return;
    }

    let cancelled = false;
    setAboutSurfaceReady(false);
    setSocialSurfaceReady(false);
    setArtistDisplayNameReady(false);

    void loadTheBandFromDatabase(lang, { artistSlugOverride: normalizedArtist })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setAboutSurfaceReady(true);
      });

    void loadSocialLinksFromDatabase({ artistSlugOverride: normalizedArtist })
      .catch(() => ({}))
      .finally(() => {
        if (!cancelled) setSocialSurfaceReady(true);
      });

    void fetchPublicProfileForDisplay(lang, normalizedArtist)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setArtistDisplayNameReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [artistSlug, enabled, lang, ownerResolved]);

  useEffect(() => {
    if (!enabled) return;

    const normalizedArtist = normalizeSlug(artistSlug);
    if (!normalizedArtist || !ownerResolved) {
      setPaymentSurfaceReady(true);
      setMonetizationEnabled(false);
      return;
    }

    let cancelled = false;
    setPaymentSurfaceReady(false);

    const loadMonetization = async () => {
      try {
        if (isOwner && isAuthenticated()) {
          const res = await getPaymentSettings({ provider: 'yookassa' }).catch(() => ({
            success: false as const,
            settings: undefined,
          }));
          if (cancelled) return;
          setMonetizationEnabled(
            Boolean(res.success && resolveMonetizationEnabled(res.settings ?? null))
          );
          return;
        }

        const response = await fetchWithAuthSession('/api/public-artists');
        const payload = (await response.json()) as {
          success?: boolean;
          data?: Array<{ publicSlug?: string; monetizationEnabled?: boolean }>;
        };
        if (cancelled) return;
        if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
          setMonetizationEnabled(false);
          return;
        }
        const match = payload.data.find(
          (artist) => normalizeSlug(artist.publicSlug ?? '') === normalizedArtist
        );
        setMonetizationEnabled(Boolean(match?.monetizationEnabled));
      } catch {
        if (!cancelled) setMonetizationEnabled(false);
      } finally {
        if (!cancelled) setPaymentSurfaceReady(true);
      }
    };

    void loadMonetization();

    const unsubscribe = isOwner
      ? subscribeArtistMonetizationChanged((enabled) => {
          if (cancelled) return;
          setMonetizationEnabled(enabled);
          setPaymentSurfaceReady(true);
        })
      : () => {};

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [artistSlug, enabled, isOwner, ownerResolved]);

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

  /** Как `shouldShowSurfaceArticlesLoadingShell`: idle/loading без данных в store. */
  const articlesSurfacePending =
    articlesCacheStale ||
    ((articlesStatus === 'idle' || articlesStatus === 'loading') && publicArticles.length === 0);

  /**
   * Каталог/статьи блокируют chrome/pageReady только на маршрутах, где их реально грузят.
   * Иначе hard refresh `/albums/:id` (articles idle) или `/articles*` (albums idle)
   * навсегда держит Hero/Footer в скелетоне.
   */
  const albumsBlockPageReady = routeRequiresAlbumsSurface(pathname) && albumsPending;
  const articlesBlockPageReady = routeRequiresArticlesSurface(pathname) && articlesSurfacePending;

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

  const ownerArticlesKnown =
    dashboardArticlesStatus === 'succeeded' || dashboardArticlesStatus === 'failed';

  /**
   * Окно подтверждения онбординга владельца: личность подтверждена (ownerResolved),
   * дашборд достоверно сообщил об отсутствии альбомов и статей, но fetchOwnArtistPageState ещё
   * в полёте (ownerContentLoaded === false). Без скелетона Home кратко рисует опубликованную
   * поверхность (hero + скелетон альбомов) перед экраном онбординга — «грязные» кадры при
   * переходе из дашборда «Открыть страницу артиста». Условие срабатывает только для владельца
   * без альбомов и статей, поэтому у артистов с релизами поведение не меняется.
   */
  const ownerOnboardingResolutionPending =
    isOwner &&
    ownerResolved &&
    ownerAlbumsKnown &&
    ownerArticlesKnown &&
    ownerAlbumCount === 0 &&
    ownerArticleCount === 0 &&
    !ownerContentLoaded;

  const showOnboardingSkeleton = !catalogArtistMissing && ownerOnboardingResolutionPending;

  /** Владелец после onboarding видит реальную страницу с builder-блоками, не under construction. */
  const showOwnerUnderConstruction = false;

  /** Артист существует, но публичного контента ещё нет — для посетителей, не владельца. */
  const showVisitorUnderConstruction =
    !catalogArtistMissing &&
    !isOwner &&
    !isLoading &&
    !visitorArticlesGatePending &&
    !hasVisitorVisibleContent;

  const normalizedArtistSlug = normalizeSlug(artistSlug);
  const showOwnerIdentityPending =
    Boolean(normalizedArtistSlug) && isAuthenticated() && !ownerResolved;
  const showOwnerBuilderResolutionPending =
    isOwner && ownerResolved && !ownerContentLoaded && !ownerStillNeedsOnboarding;
  /** Не рисовать visitor/builder UI, пока не подтверждена роль владельца или builder-state. */
  const showArtistPageSurfacePending =
    showOwnerIdentityPending || showOwnerBuilderResolutionPending;

  const showNotFound =
    !isOwner &&
    !isLoading &&
    !visitorArticlesGatePending &&
    !hasVisitorVisibleContent &&
    catalogArtistMissing;

  /**
   * Hero зависит от headerImages: до ответа API не показываем страницу с Hero,
   * чтобы не мигать upload-slot ↔ cover после первого рендера.
   */
  const showArtistPageHeroPending =
    Boolean(normalizedArtistSlug) &&
    !showOnboarding &&
    !showOnboardingSkeleton &&
    !showNotFound &&
    !showOwnerUnderConstruction &&
    !showVisitorUnderConstruction &&
    !showArtistPageSurfacePending &&
    !isHeaderImagesReady;

  const showArtistPageLayoutPending = showArtistPageSurfacePending || showArtistPageHeroPending;

  const suppressPublishedArtistChrome =
    showOnboarding ||
    showOnboardingSkeleton ||
    showNotFound ||
    showOwnerUnderConstruction ||
    showVisitorUnderConstruction;

  const isArtistPublishedSurface =
    Boolean(normalizedArtistSlug) &&
    !showOnboarding &&
    !showOnboardingSkeleton &&
    !showNotFound &&
    !showOwnerUnderConstruction &&
    !showVisitorUnderConstruction;

  const pageReady =
    isArtistPublishedSurface &&
    ownerResolved &&
    isHeaderImagesReady &&
    (!isOwner || ownerContentLoaded) &&
    !albumsBlockPageReady &&
    !visitorAccessPending &&
    !articlesBlockPageReady &&
    aboutSurfaceReady &&
    socialSurfaceReady &&
    paymentSurfaceReady &&
    artistDisplayNameReady;

  const showArtistPageSkeleton = isArtistPublishedSurface && !pageReady;

  const showPublished = pageReady;
  /** @deprecated Prefer `showArtistPageSkeleton`. */
  const showArtistPageLayoutPendingLegacy = showArtistPageLayoutPending || showArtistPageSkeleton;

  return {
    isLoading,
    isOwner,
    ownerResolved,
    ownerContentLoaded,
    ownerStillNeedsOnboarding,
    hasPublicReleases,
    showOnboarding,
    showOnboardingSkeleton,
    showOwnerUnderConstruction,
    showVisitorUnderConstruction,
    showNotFound,
    showPublished,
    pageReady,
    showArtistPageSkeleton,
    showArtistPageSurfacePending,
    showArtistPageHeroPending,
    showArtistPageLayoutPending: showArtistPageLayoutPendingLegacy,
    headerImages,
    isHeaderImagesReady,
    suppressPublishedArtistChrome,
    monetizationEnabled,
  } satisfies ArtistPageAccessValue;
}

export { useArtistPageAccess } from './ArtistPageAccessProvider';
