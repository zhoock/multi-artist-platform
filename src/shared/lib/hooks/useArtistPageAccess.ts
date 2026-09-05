import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@app/providers/lang';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import {
  hasPublishedPublicCatalogReleases,
  albumDetailsHasPublicRelease,
} from '@entities/album/lib/catalogPublication';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import {
  fetchDashboardAlbums,
  selectDashboardAlbumsData,
  selectDashboardAlbumsStatus,
  selectArtistAlbumCatalogStatus,
  selectArtistAlbumCatalogData,
  selectArtistAlbumCatalogFetchContextKey,
  selectArtistAlbumCatalogCacheIsStale,
  selectArtistAlbumCatalogCachedRowCount,
  selectArtistAlbumCatalogArtistMissing,
  selectArtistAlbumCatalogForSurface,
  selectAlbumDetailsResolved,
  selectAlbumDetailsMatchesRoute,
} from '@entities/album';
import {
  selectArticlesStatus,
  selectArticlesDataResolvedForSurface,
  selectArticlesCacheIsStale,
  selectDashboardArticlesDataResolved,
  selectDashboardArticlesStatus,
} from '@entities/article';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { buildPublicAlbumsFetchContextKey } from '@shared/lib/publicCatalogCacheKey';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getAuthHeader, getUser, isAuthenticated } from '@shared/lib/auth';
import { isCachedOwnArtistSlug, writeCachedOwnPublicSlug } from '@shared/lib/ownPublicSlugCache';
import {
  countUniqueAlbums,
  countUniqueArticles,
  profileHasPublicBodyContent,
} from '@shared/lib/artistPageContent';
import { fetchOwnArtistPageState } from '@shared/lib/ownArtistPage';
import { fetchPublicProfileForDisplay } from '@shared/lib/profileDisplayName';
import { fetchPublicArtistUserProfile } from '@shared/lib/publicArtistUserProfile';
import { getPaymentSettings } from '@shared/api/payment/settings';
import { resolveMonetizationEnabled } from '@shared/lib/payment/artistMonetization';
import { subscribeArtistMonetizationChanged } from '@shared/lib/payment/artistMonetizationEvents';
import { loadSocialLinksFromDatabase, loadTheBandFromDatabase } from '@entities/user/lib';
import { useArtistHeroHeaderImages } from './useArtistHeroHeaderImages';
import { stripLangPrefix } from '@shared/lib/i18n/routeLang';

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function isArtistHomePath(pathname: string): boolean {
  return stripLangPrefix(pathname) === '/';
}

/** Список всех альбомов (`/albums`), не страница одного альбома (`/albums/:id`). */
function isAllAlbumsListPath(pathname: string): boolean {
  return /^\/albums\/?$/.test(stripLangPrefix(pathname));
}

/** Страница одного альбома — mid-weight AlbumDetails, не fat `/api/albums`. */
function isAlbumDetailPath(pathname: string): boolean {
  return /^\/albums\/[^/]+\/?$/.test(stripLangPrefix(pathname));
}

function readAlbumIdFromDetailPath(pathname: string): string {
  const match = stripLangPrefix(pathname).match(/^\/albums\/([^/]+)\/?$/);
  return match?.[1]?.trim() ?? '';
}

function isStemsPath(pathname: string): boolean {
  return /^\/(?:en\/)?stems(?:\/|$)/.test(pathname);
}

/** Loader/fetch альбомов: Home, /albums list, /stems* — album detail owns its own fetch. */
function routeRequiresAlbumsSurface(pathname: string): boolean {
  if (isArtistHomePath(pathname)) return true;
  if (isAllAlbumsListPath(pathname)) return true;
  if (isAlbumDetailPath(pathname)) return false;
  return isStemsPath(pathname);
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
  /** Owner page has visitor-visible body (hero, bio, social) from fetchOwnArtistPageState. */
  ownerHasPublicPageContent: boolean;
  showOnboarding: boolean;
  showOnboardingSkeleton: boolean;
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
  /** On `/albums/:id`, defer owner builder hero until route AlbumDetails is loaded. */
  albumDetailsReleaseGatePending: boolean;
  /** On `/stems` etc., defer owner builder hero until thin catalog / dashboard albums settle. */
  catalogReleaseGatePending: boolean;
  /** Artist has connected payment acceptance — gates collection / exclusive content. */
  monetizationEnabled: boolean;
  /**
   * Payment/monetization status has been resolved for the current artist slug.
   * Until true, `monetizationEnabled === false` means "unknown", not "disconnected".
   */
  paymentSurfaceReady: boolean;
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
  const { pathname } = useEffectiveLocation();
  const dispatch = useAppDispatch();
  const { lang } = useLang();
  const catalogArtistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const thinCatalogStatus = useAppSelector(selectArtistAlbumCatalogStatus);
  const thinCatalogFetchContextKey = useAppSelector(selectArtistAlbumCatalogFetchContextKey);
  const catalogCacheStale = useAppSelector(selectArtistAlbumCatalogCacheIsStale);
  const thinCatalogSurface = useAppSelector(selectArtistAlbumCatalogForSurface);
  const thinCatalogData = useAppSelector(selectArtistAlbumCatalogData);
  const dashboardAlbums = useAppSelector(selectDashboardAlbumsData);
  const dashboardAlbumsStatus = useAppSelector(selectDashboardAlbumsStatus);
  const dashboardArticles = useAppSelector(selectDashboardArticlesDataResolved);
  const dashboardArticlesStatus = useAppSelector(selectDashboardArticlesStatus);
  const cachedThinCatalogRowCount = useAppSelector(selectArtistAlbumCatalogCachedRowCount);
  const articlesStatus = useAppSelector(selectArticlesStatus);
  const articlesCacheStale = useAppSelector(selectArticlesCacheIsStale);
  const publicArticles = useAppSelector(selectArticlesDataResolvedForSurface);

  /** Public album gates use thin CatalogAlbum only — never Dashboard AlbumEditable. */
  const onAlbumDetail = isAlbumDetailPath(pathname);
  const routeAlbumId = onAlbumDetail ? readAlbumIdFromDetailPath(pathname) : '';
  const albumDetailsForRoute = useAppSelector(selectAlbumDetailsResolved);
  const albumDetailsMatchesRoute = useAppSelector((state) =>
    routeAlbumId ? selectAlbumDetailsMatchesRoute(state, artistSlug, routeAlbumId) : false
  );
  const albumDetailsReleaseGatePending =
    onAlbumDetail && Boolean(routeAlbumId) && !albumDetailsMatchesRoute;
  const onStems = isStemsPath(pathname);
  const thinCatalogHasPublicReleases = hasPublishedPublicCatalogReleases(thinCatalogSurface);
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
  const hasPublicReleases = useMemo(() => {
    if (thinCatalogHasPublicReleases) {
      return true;
    }
    // `/albums/:id` skips thin catalog prefetch; infer from loaded AlbumDetails instead.
    if (onAlbumDetail && albumDetailsMatchesRoute) {
      return albumDetailsHasPublicRelease(albumDetailsForRoute);
    }
    // Owner reload on `/stems`: dashboard albums may resolve release state before UX gates flip.
    if (
      isOwner &&
      onStems &&
      (dashboardAlbumsStatus === 'succeeded' || dashboardAlbumsStatus === 'failed')
    ) {
      return hasPublishedPublicReleases(dashboardAlbums);
    }
    return false;
  }, [
    thinCatalogHasPublicReleases,
    onAlbumDetail,
    albumDetailsMatchesRoute,
    albumDetailsForRoute,
    isOwner,
    onStems,
    dashboardAlbumsStatus,
    dashboardAlbums,
  ]);
  const [ownerNeedsOnboarding, setOwnerNeedsOnboarding] = useState(false);
  const [ownerHasPublicPageContent, setOwnerHasPublicPageContent] = useState(false);
  const [ownerContentLoaded, setOwnerContentLoaded] = useState(false);
  const [visitorProfileHasPublicBody, setVisitorProfileHasPublicBody] = useState<boolean | null>(
    null
  );
  const [aboutSurfaceReady, setAboutSurfaceReady] = useState(false);
  const [socialSurfaceReady, setSocialSurfaceReady] = useState(false);
  /** False until first resolve — do not treat monetizationEnabled as authoritative yet. */
  const [paymentSurfaceReady, setPaymentSurfaceReady] = useState(false);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [artistDisplayNameReady, setArtistDisplayNameReady] = useState(false);
  /** Slug for which profile/payment chrome gates already passed (SWR soft refresh). */
  const profileSurfacesReadyForSlugRef = useRef('');
  const paymentSurfaceReadyForSlugRef = useRef('');
  const ownerIdentityReadyForSlugRef = useRef('');
  const ownerContentReadyForSlugRef = useRef('');
  const visitorProfileReadyForSlugRef = useRef('');

  const ownerAlbumCount = useMemo(() => {
    if (!isOwner) return 0;
    const dashboardCount = countUniqueAlbums(dashboardAlbums);
    // Дашборд — источник правды для владельца; thin catalog только как fallback,
    // пока dashboard ещё не завершил fetch.
    if (dashboardAlbumsStatus === 'succeeded' || dashboardAlbumsStatus === 'failed') {
      return dashboardCount;
    }
    const thinCount = new Set(thinCatalogData.map((album) => album.albumId).filter(Boolean)).size;
    return Math.max(dashboardCount, thinCount);
  }, [isOwner, dashboardAlbums, thinCatalogData, dashboardAlbumsStatus]);

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
      ownerIdentityReadyForSlugRef.current = '';
      setIsOwner(false);
      setOwnerResolved(true);
      return;
    }

    if (!isAuthenticated()) {
      ownerIdentityReadyForSlugRef.current = '';
      setIsOwner(false);
      setOwnerResolved(true);
      return;
    }

    let cancelled = false;
    const softRefreshSameArtist = ownerIdentityReadyForSlugRef.current === normalizedArtist;

    if (!softRefreshSameArtist) {
      setIsOwner(cachedOwner);
      setOwnerResolved(cachedOwner);
    }

    if (cachedOwner) {
      if (!softRefreshSameArtist) {
        ownerIdentityReadyForSlugRef.current = normalizedArtist;
      }
      return () => {
        cancelled = true;
      };
    }

    /** Ownership does not depend on UI language — keep resolved chrome on lang-only refresh. */
    if (softRefreshSameArtist) {
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
        if (!cancelled) {
          ownerIdentityReadyForSlugRef.current = normalizedArtist;
          setOwnerResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistSlug, cachedOwner, enabled, lang]);

  useEffect(() => {
    if (!enabled) return;

    const normalizedArtist = normalizeSlug(artistSlug);

    if (!isOwner || !ownerResolved) {
      ownerContentReadyForSlugRef.current = '';
      setOwnerContentLoaded(!isOwner);
      setOwnerNeedsOnboarding(false);
      setOwnerHasPublicPageContent(false);
      return;
    }

    let cancelled = false;
    const softRefreshSameArtist =
      ownerContentReadyForSlugRef.current === normalizedArtist && normalizedArtist !== '';

    /**
     * Не сбрасываем `ownerContentLoaded` при фоновом refresh (закрытие Dashboard /
     * artist:updated / смена языка): иначе pageReady мигает и вся страница артиста уходит в skeleton.
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
        ownerContentReadyForSlugRef.current = normalizedArtist;
      });
    };

    refreshOwnerState({ keepReady: softRefreshSameArtist });

    const softRefreshOwnerState = () => refreshOwnerState({ keepReady: true });

    window.addEventListener('artist:updated', softRefreshOwnerState);
    window.addEventListener('profile-name-updated', softRefreshOwnerState);

    return () => {
      cancelled = true;
      window.removeEventListener('artist:updated', softRefreshOwnerState);
      window.removeEventListener('profile-name-updated', softRefreshOwnerState);
    };
  }, [artistSlug, enabled, isOwner, ownerResolved, lang]);

  useEffect(() => {
    if (!enabled) return;

    const normalizedArtist = normalizeSlug(artistSlug);
    if (isOwner || !ownerResolved || !normalizedArtist) {
      visitorProfileReadyForSlugRef.current = '';
      setVisitorProfileHasPublicBody(null);
      return;
    }

    let cancelled = false;
    const softRefreshSameArtist = visitorProfileReadyForSlugRef.current === normalizedArtist;
    if (!softRefreshSameArtist) {
      setVisitorProfileHasPublicBody(null);
    }

    void (async () => {
      try {
        const profile = await fetchPublicArtistUserProfile(normalizedArtist, { lang });
        if (cancelled) return;

        setVisitorProfileHasPublicBody(
          profile
            ? profileHasPublicBodyContent({
                theBand: profile.theBand,
                headerImages: profile.headerImages,
                socialLinks: profile.socialLinks,
              })
            : false
        );
        visitorProfileReadyForSlugRef.current = normalizedArtist;
      } catch {
        if (!cancelled) {
          setVisitorProfileHasPublicBody(false);
          visitorProfileReadyForSlugRef.current = normalizedArtist;
        }
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
      profileSurfacesReadyForSlugRef.current = '';
      setAboutSurfaceReady(false);
      setSocialSurfaceReady(false);
      setArtistDisplayNameReady(false);
      return;
    }

    let cancelled = false;
    /**
     * Soft revalidate (lang / ownerResolved after Dashboard): keep chrome ready for the same
     * slug so pageReady does not flicker into ArtistPageSkeleton. New slug = cold start.
     */
    const softRefreshSameArtist = profileSurfacesReadyForSlugRef.current === normalizedArtist;
    if (!softRefreshSameArtist) {
      setAboutSurfaceReady(false);
      setSocialSurfaceReady(false);
      setArtistDisplayNameReady(false);
    }

    void loadTheBandFromDatabase(lang, { artistSlugOverride: normalizedArtist })
      .catch(() => null)
      .finally(() => {
        if (cancelled) return;
        profileSurfacesReadyForSlugRef.current = normalizedArtist;
        setAboutSurfaceReady(true);
      });

    void loadSocialLinksFromDatabase({ artistSlugOverride: normalizedArtist, lang })
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
      paymentSurfaceReadyForSlugRef.current = '';
      setPaymentSurfaceReady(true);
      setMonetizationEnabled(false);
      return;
    }

    let cancelled = false;
    const softRefreshSameArtist = paymentSurfaceReadyForSlugRef.current === normalizedArtist;
    if (!softRefreshSameArtist) {
      setPaymentSurfaceReady(false);
    }

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
        if (!cancelled) {
          paymentSurfaceReadyForSlugRef.current = normalizedArtist;
          setPaymentSurfaceReady(true);
        }
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

  useEffect(() => {
    if (!enabled || !isOwner || !ownerResolved || !onStems) return;
    dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).catch(
      (error: unknown) => {
        if ((error as { name?: string })?.name === 'ConditionError') {
          return;
        }
        console.error('[useArtistPageAccess] fetch dashboard albums failed', error);
      }
    );
  }, [dispatch, enabled, isOwner, ownerResolved, onStems]);

  const albumsSurfaceRequired = routeRequiresAlbumsSurface(pathname);
  /**
   * Cold start only: block chrome when there is no last-good catalog to show.
   * Soft refresh (force / brief stale) with cached rows must not flip pageReady → skeleton.
   */
  const albumsPending =
    albumsSurfaceRequired &&
    cachedThinCatalogRowCount === 0 &&
    (catalogCacheStale ||
      thinCatalogStatus === 'idle' ||
      thinCatalogStatus === 'loading' ||
      (thinCatalogStatus === 'succeeded' && thinCatalogFetchContextKey !== desiredFetchKey));

  const ownerStemsDashboardReleaseGatePending =
    isOwner &&
    ownerResolved &&
    onStems &&
    !albumsPending &&
    !thinCatalogHasPublicReleases &&
    dashboardAlbumsStatus !== 'succeeded' &&
    dashboardAlbumsStatus !== 'failed';

  const ownerHeroContentGatePending = isOwner && ownerResolved && !ownerContentLoaded;

  /** Defer owner builder hero until thin catalog / dashboard albums settle (e.g. hard reload on `/stems`). */
  const catalogReleaseGatePending =
    (albumsSurfaceRequired && !onAlbumDetail && albumsPending) ||
    ownerStemsDashboardReleaseGatePending ||
    ownerHeroContentGatePending;

  const visitorProfilePending = !isOwner && visitorProfileHasPublicBody === null;

  const publicCatalogLength = thinCatalogSurface.length;

  /** 404 по контенту артиста: ждём статьи только если в каталоге ещё нет альбомов. */
  const visitorArticlesGatePending =
    !isOwner &&
    publicCatalogLength === 0 &&
    publicArticles.length === 0 &&
    (articlesCacheStale || articlesStatus === 'idle' || articlesStatus === 'loading');

  const visitorAccessPending = visitorProfilePending || visitorArticlesGatePending;

  /** Не блокировать pageReady ожиданием статей на маршрутах без articles surface (/stems, /albums/:id). */
  const visitorAccessBlocksPageReady =
    visitorProfilePending || (routeRequiresArticlesSurface(pathname) && visitorArticlesGatePending);

  /** Cold start only — soft refresh keeps last-good articles on screen. */
  const articlesSurfacePending =
    publicArticles.length === 0 &&
    (articlesCacheStale || articlesStatus === 'idle' || articlesStatus === 'loading');

  /**
   * Каталог/статьи блокируют chrome/pageReady только на маршрутах, где их реально грузят.
   * Иначе hard refresh `/albums/:id` (articles idle) или `/articles*` (albums idle)
   * навсегда держит Hero/Footer в скелетоне.
   */
  const albumsBlockPageReady = albumsSurfaceRequired && albumsPending;
  const articlesBlockPageReady = routeRequiresArticlesSurface(pathname) && articlesSurfacePending;

  /**
   * Блокировка списка/страницы альбома. Не включаем `articlesStatus === 'idle'` глобально
   * (/albums/:id не грузит статьи) и не ждём owner onboarding — он только для Home.
   * Album detail loads AlbumDetails itself — do not gate on thin catalog idle.
   */
  const isLoading = onAlbumDetail
    ? !ownerResolved
    : !ownerResolved || albumsPending || visitorAccessPending;

  const hasVisitorVisibleContent =
    hasPublishedPublicCatalogReleases(thinCatalogData) ||
    publicArticles.length > 0 ||
    visitorProfileHasPublicBody === true;

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

  /** Артист существует, но публичного контента ещё нет — для посетителей, не владельца. */
  const showVisitorUnderConstruction =
    !onAlbumDetail &&
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
    !onAlbumDetail &&
    !isOwner &&
    !isLoading &&
    !visitorArticlesGatePending &&
    !hasVisitorVisibleContent &&
    catalogArtistMissing;

  /**
   * Hero shell renders immediately; cover URL mounts when headerImages resolve.
   * (No full-hero skeleton while /api/user-profile is in flight.)
   */
  const showArtistPageHeroPending = false;

  const showArtistPageLayoutPending = showArtistPageSurfacePending || showArtistPageHeroPending;

  const suppressPublishedArtistChrome =
    showOnboarding || showOnboardingSkeleton || showNotFound || showVisitorUnderConstruction;

  const isArtistPublishedSurface =
    Boolean(normalizedArtistSlug) &&
    !showOnboarding &&
    !showOnboardingSkeleton &&
    !showNotFound &&
    !showVisitorUnderConstruction;

  const pageReady =
    isArtistPublishedSurface &&
    ownerResolved &&
    isHeaderImagesReady &&
    (!isOwner || ownerContentLoaded) &&
    !albumsBlockPageReady &&
    // Album detail does not wait on thin catalog / articles gates — AlbumDetails owns loading.
    (onAlbumDetail || !visitorAccessBlocksPageReady) &&
    !articlesBlockPageReady &&
    aboutSurfaceReady &&
    socialSurfaceReady &&
    paymentSurfaceReady &&
    artistDisplayNameReady;

  const showArtistPageSkeleton = isArtistPublishedSurface && !pageReady;

  const showPublished = pageReady;

  return {
    isLoading,
    isOwner,
    ownerResolved,
    ownerContentLoaded,
    ownerStillNeedsOnboarding,
    hasPublicReleases,
    ownerHasPublicPageContent,
    showOnboarding,
    showOnboardingSkeleton,
    showVisitorUnderConstruction,
    showNotFound,
    showPublished,
    pageReady,
    showArtistPageSkeleton,
    showArtistPageSurfacePending,
    showArtistPageHeroPending,
    showArtistPageLayoutPending,
    headerImages,
    isHeaderImagesReady,
    albumDetailsReleaseGatePending,
    catalogReleaseGatePending,
    suppressPublishedArtistChrome,
    monetizationEnabled,
    paymentSurfaceReady,
  } satisfies ArtistPageAccessValue;
}

export { useArtistPageAccess } from './ArtistPageAccessProvider';
