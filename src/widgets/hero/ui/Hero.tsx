// src/widgets/hero/ui/Hero.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import {
  buildHeroVisualKey,
  filterValidHeroHeaderImages,
  heroHeaderImagesSignature,
} from '@shared/lib/artistHeroHeaderImages';
import { ensurePublicArtistsLoaded } from '@shared/lib/publicArtistsCache';
import { shouldShowArtistPageBuilderBlock } from '@shared/lib/artistPageBuilder';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderHeroImageIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import { ImagePlus as ImagePlusIcon } from 'lucide-react';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { selectArtistAlbumCatalogArtistMissing } from '@entities/album';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';
import type { SceneArtist } from '@/components/view/universe3dTypes';
import { UNIVERSE_FOCUS_ARTIST_STORAGE_KEY } from '@/components/view/universe3dConstants';
import { loadUniverse3DModule } from '@/components/view/loadUniverse3DModule';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { ArtistArchiveButton } from '@features/artistArchive';
import { readStoredProfileDisplayName } from '@shared/lib/profileDisplayName';
import { ArtistPageSkeletonHero } from '@pages/Home/ui/ArtistPageSkeleton';
import { usePrefersReducedMotion } from '@shared/lib/motion/prefersReducedMotion';
import { HeroCoverImage } from './HeroCoverImage';
import { logHeroCanvasLifecycle } from './heroCanvasLifecycleDiagnostics';
import { markHeroCanvasInit } from './heroCanvasInitDiagnostics';
import './style.scss';

const HERO_CLUSTER_PALETTE = [0x4d80ff, 0xff8a47, 0x53d8a2, 0xb086ff, 0xf2cd5d, 0x5ec9f5] as const;

const defaultArtistName = '';

type HeroUniverseHandle = {
  destroy: () => void;
  isArtistCardTarget: (target: Element) => boolean;
};

/** One frame so `.hero__canvas` has layout dimensions before WebGL init. */
function scheduleHeroUniverseInit(onReady: () => void): () => void {
  let cancelled = false;
  const rafId = requestAnimationFrame(() => {
    if (!cancelled) onReady();
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}

export function Hero() {
  const [artistPageMeta, setArtistPageMeta] = useState<{
    userId: string;
  } | null>(null);
  const [heroCoverVisible, setHeroCoverVisible] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const heroCanvasRef = useRef<HTMLDivElement | null>(null);
  const universeRef = useRef<HeroUniverseHandle | null>(null);
  const universeArtistSlugRef = useRef<string | null>(null);
  const { overlayOpen: dashboardOverlayOpen, surfaceLocation } = useDashboardModalShell();
  const isDashboardRoute = location.pathname.startsWith('/dashboard') && !dashboardOverlayOpen;
  const authOverlayBackground = useMemo<Location | null>(() => {
    if (!isAuthOverlayPathname(location.pathname)) return null;
    const bg = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
    return bg ?? null;
  }, [location.pathname, location.state]);
  const heroPathname =
    dashboardOverlayOpen && surfaceLocation?.pathname
      ? surfaceLocation.pathname
      : (authOverlayBackground?.pathname ?? location.pathname);
  const heroSearchString = useMemo(() => {
    if (dashboardOverlayOpen && surfaceLocation?.search !== undefined) {
      return surfaceLocation.search;
    }
    if (authOverlayBackground?.search !== undefined) {
      return authOverlayBackground.search;
    }
    return location.search;
  }, [
    dashboardOverlayOpen,
    surfaceLocation?.search,
    authOverlayBackground?.search,
    location.search,
  ]);
  const heroUrlParams = useMemo(
    () => new URLSearchParams(heroSearchString.replace(/^\?/, '')),
    [heroSearchString]
  );
  const hasArtistParam = !!heroUrlParams.get('artist');
  const artistParamKey = heroUrlParams.get('artist')?.trim() ?? '';
  const artistPageAccess = useArtistPageBuilder(artistParamKey);
  const {
    builderVisibility,
    hasPublicReleases,
    ownerHasPublicPageContent,
    showArtistPageHeroPending,
    headerImages,
    isHeaderImagesReady,
    monetizationEnabled,
    albumDetailsReleaseGatePending,
    catalogReleaseGatePending,
  } = artistPageAccess;
  const heroReleaseGatePending = albumDetailsReleaseGatePending || catalogReleaseGatePending;
  const ownerShowsPublishedHero =
    artistPageAccess.isOwner &&
    artistPageAccess.ownerContentLoaded &&
    (hasPublicReleases || ownerHasPublicPageContent);
  const showHeroImageBuilder =
    hasArtistParam &&
    shouldShowArtistPageBuilderBlock(builderVisibility, headerImages.length === 0);
  const showOwnerBuilderHero =
    hasArtistParam &&
    builderVisibility.canShowBlocks &&
    !ownerShowsPublishedHero &&
    !heroReleaseGatePending;
  const showPageBuilderPreReleaseShell = showOwnerBuilderHero && headerImages.length === 0;
  const showOwnerPreReleaseHeroImage = showOwnerBuilderHero && headerImages.length > 0;
  const showPublishedHeroChrome = hasArtistParam && !showOwnerBuilderHero;
  const { openDashboard } = useArtistPageBuilderNav();
  const hideHeroForArtistOnboarding =
    hasArtistParam && artistPageAccess.suppressPublishedArtistChrome;
  const heroPublicArtistSlug = (artistParamKey || publicArtistSlug || '').trim();
  const { displayName: profileDisplayName, isLoading: isProfileLoading } = useSiteArtistDisplayName(
    lang,
    {
      variant: isDashboardRoute ? 'authenticated' : 'public',
      artistSlug: isDashboardRoute ? undefined : heroPublicArtistSlug || undefined,
    }
  );

  const heroVisualKey = buildHeroVisualKey(heroPathname, heroPublicArtistSlug);
  const headerImagesSignature = useMemo(
    () => heroHeaderImagesSignature(headerImages),
    [headerImages]
  );
  const heroCoverCandidateCount = useMemo(
    () => filterValidHeroHeaderImages(headerImages).length,
    [headerImages]
  );
  const showHeroCoverImage =
    heroCoverCandidateCount > 0 && !showHeroImageBuilder && heroCoverVisible;
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleHeroCoverUnavailable = useCallback(() => {
    setHeroCoverVisible(false);
    markHeroCanvasInit('cover-unavailable');
  }, []);

  useEffect(() => {
    setHeroCoverVisible(true);
  }, [headerImagesSignature]);

  const showHeroLoadingShell = showArtistPageHeroPending;

  useEffect(() => {
    if (!hasArtistParam || !artistParamKey) {
      setArtistPageMeta(null);
      return;
    }

    let cancelled = false;

    void ensurePublicArtistsLoaded().then((artists) => {
      if (cancelled) return;

      const match = artists.find((artist) => artist.publicSlug?.trim() === artistParamKey) ?? null;
      if (match?.userId) {
        setArtistPageMeta({ userId: match.userId });
      } else {
        setArtistPageMeta(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [artistParamKey, hasArtistParam]);

  const artistAlbumCatalogState = useAppSelector((s) => s.artistAlbumCatalog);
  const catalogArtistMissing = useAppSelector(selectArtistAlbumCatalogArtistMissing);
  const isTitlePending =
    hasArtistParam && !catalogArtistMissing && isProfileLoading && !profileDisplayName.trim();
  const displayName = isTitlePending
    ? ''
    : catalogArtistMissing
      ? ''
      : profileDisplayName.trim() ||
        (hasArtistParam ? readStoredProfileDisplayName() : '') ||
        defaultArtistName;

  const profileNameForCanvasRef = useRef(profileDisplayName);
  const headerImagesForCanvasRef = useRef(headerImages);
  profileNameForCanvasRef.current = profileDisplayName;
  headerImagesForCanvasRef.current = headerImages;

  const langForCanvasRef = useRef(lang);
  langForCanvasRef.current = lang;

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const builderCopy = ui?.artistPageBuilder;

  const showHeroUniverse =
    hasArtistParam &&
    !!artistParamKey &&
    !hideHeroForArtistOnboarding &&
    showPublishedHeroChrome &&
    !prefersReducedMotion;

  const heroLifecycleSnapshot = useMemo(
    () => ({
      headerImagesCount: headerImages.length,
      isHeaderImagesReady,
      showHeroCoverImage,
      universeMountedFor: universeArtistSlugRef.current,
      catalogStatus: artistAlbumCatalogState.status,
    }),
    [artistAlbumCatalogState.status, headerImages.length, isHeaderImagesReady, showHeroCoverImage]
  );

  useEffect(() => {
    logHeroCanvasLifecycle('state', heroLifecycleSnapshot);
  }, [heroLifecycleSnapshot]);

  useEffect(() => {
    if (artistAlbumCatalogState.status === 'succeeded') {
      logHeroCanvasLifecycle('album-catalog-succeeded', heroLifecycleSnapshot);
    }
  }, [artistAlbumCatalogState.status, heroLifecycleSnapshot]);

  useEffect(() => {
    if (!showHeroUniverse) {
      universeArtistSlugRef.current = null;
      return;
    }

    const el = heroCanvasRef.current;
    if (!el) return;

    if (universeArtistSlugRef.current === artistParamKey && el.childElementCount > 0) {
      return;
    }

    if (universeArtistSlugRef.current !== artistParamKey && universeRef.current) {
      universeRef.current.destroy();
      universeRef.current = null;
      el.replaceChildren();
    }

    markHeroCanvasInit('prefetch-module');
    void loadUniverse3DModule().then(() => markHeroCanvasInit('prefetch-module-done'));

    let universe: HeroUniverseHandle | null = null;
    let cancelled = false;

    const run = async () => {
      markHeroCanvasInit('init-start');
      let sceneArtist: SceneArtist | null = null;
      let allPublicArtists: SceneArtist[] = [];

      try {
        allPublicArtists = await ensurePublicArtistsLoaded();
        sceneArtist = allPublicArtists.find((a) => a.publicSlug?.trim() === artistParamKey) ?? null;
      } catch {
        // ignore: fallback artist below
      }

      if (cancelled || !heroCanvasRef.current) return;

      const profileNameNow = profileNameForCanvasRef.current;
      const headerImagesNow = headerImagesForCanvasRef.current;

      if (!sceneArtist) {
        sceneArtist = {
          name: profileNameNow || artistParamKey,
          publicSlug: artistParamKey,
          genreCode: 'other',
          headerImages: headerImagesNow.length > 0 ? [...headerImagesNow] : undefined,
        };
      } else if (headerImagesNow.length > 0) {
        sceneArtist = {
          ...sceneArtist,
          headerImages:
            sceneArtist.headerImages && sceneArtist.headerImages.length > 0
              ? sceneArtist.headerImages
              : [...headerImagesNow],
        };
      }

      if (allPublicArtists.length > 0) {
        const grouped = new Map<string, SceneArtist[]>();
        allPublicArtists.forEach((a) => {
          const g = a.genreCode || 'other';
          const b = grouped.get(g) ?? [];
          b.push(a);
          grouped.set(g, b);
        });
        const genres = Array.from(grouped.keys());
        const gi = sceneArtist.genreCode || 'other';
        const gIdx = genres.indexOf(gi);
        const paletteIdx = gIdx >= 0 ? gIdx : 0;
        sceneArtist = {
          ...sceneArtist,
          clusterColor: HERO_CLUSTER_PALETTE[paletteIdx % HERO_CLUSTER_PALETTE.length],
        };
      }

      if (cancelled || !heroCanvasRef.current) return;
      if (heroCanvasRef.current.childElementCount > 0) return;

      const { Universe3D } = await loadUniverse3DModule();
      markHeroCanvasInit('module-loaded');
      if (cancelled || !heroCanvasRef.current) return;
      if (heroCanvasRef.current.childElementCount > 0) return;

      universe = new Universe3D(heroCanvasRef.current, [sceneArtist], {
        disableCameraControls: true,
        embedInContainer: true,
        isHeroPreview: true,
        buildArtistProfileHref: (publicSlug) =>
          buildArtistPagePath(langForCanvasRef.current, publicSlug),
      });
      markHeroCanvasInit('constructor-done');
      const webglCanvas = heroCanvasRef.current.querySelector('canvas');
      if (webglCanvas) {
        markHeroCanvasInit('webgl-canvas-in-dom');
      }
      universeRef.current = universe;
      universeArtistSlugRef.current = artistParamKey;
      markHeroCanvasInit('universe-mounted');
    };

    const cancelSchedule = scheduleHeroUniverseInit(() => {
      void run();
    });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [artistParamKey, showHeroUniverse]);

  useEffect(() => {
    if (showHeroUniverse) return;
    const el = heroCanvasRef.current;
    universeRef.current?.destroy();
    universeRef.current = null;
    universeArtistSlugRef.current = null;
    el?.replaceChildren();
  }, [showHeroUniverse]);

  if (hideHeroForArtistOnboarding) {
    return null;
  }

  if (showHeroLoadingShell) {
    return <ArtistPageSkeletonHero />;
  }

  const heroClassName = [
    'hero',
    showHeroCoverImage ? 'hero--has-cover-image' : '',
    showPageBuilderPreReleaseShell ? 'hero--page-builder-pre-release' : '',
    showOwnerPreReleaseHeroImage ? 'hero--page-builder-pre-release-with-image' : '',
    showPublishedHeroChrome ? 'hero--navigate-home' : '',
    showHeroImageBuilder ? 'hero--has-image-builder' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleNavigateHome = () => {
    if (artistParamKey) {
      sessionStorage.setItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, artistParamKey);
    }
    navigate(buildLocalizedPublicPath(lang, '/'));
  };

  const handleHeroNavigateClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest(
        '.hero__archive-slot, .hero__image-slot, .artist-page-builder-block, .artist-archive-button'
      )
    ) {
      return;
    }
    if (universeRef.current?.isArtistCardTarget(target)) {
      return;
    }
    handleNavigateHome();
  };

  const handleHeroNavigateKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleNavigateHome();
  };

  const heroNavigateAriaLabel =
    displayName.trim().length > 0
      ? lang === 'ru'
        ? `${displayName}, перейти на главную`
        : `${displayName}, go to home page`
      : undefined;

  const heroBody = (
    <>
      {showHeroCoverImage ? (
        <HeroCoverImage
          headerImages={headerImages}
          visualKey={heroVisualKey}
          onCoverUnavailable={handleHeroCoverUnavailable}
        />
      ) : null}
      {showPublishedHeroChrome && !prefersReducedMotion ? (
        <div ref={heroCanvasRef} className="hero__canvas" />
      ) : null}
      <div className="hero__content">
        <div className="hero__headline">
          <div className="hero__headline-main">
            <h1 className="hero__title">{displayName}</h1>
            {showPublishedHeroChrome ? (
              <div className="hero__archive-slot">
                <ArtistArchiveButton
                  artistUserId={artistPageMeta?.userId ?? null}
                  monetizationEnabled={monetizationEnabled}
                />
              </div>
            ) : null}
          </div>
          {showHeroImageBuilder ? (
            <div className="hero__image-slot" aria-hidden={false}>
              <ArtistPageBuilderBlock
                layout="section"
                className="hero__builder-block"
                icon={<ImagePlusIcon {...artistPageBuilderHeroImageIconProps()} />}
                title={builderCopy?.hero?.imageTitle ?? 'Band cover'}
                actionLabel={builderCopy?.hero?.uploadImage ?? 'Upload'}
                onAction={() => openDashboard('settings', { scrollToHeaderImages: true })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  if (showPublishedHeroChrome) {
    return (
      <div
        className={heroClassName}
        tabIndex={0}
        role="button"
        aria-label={heroNavigateAriaLabel}
        onClick={handleHeroNavigateClick}
        onKeyDown={handleHeroNavigateKeyDown}
      >
        {heroBody}
      </div>
    );
  }

  return <section className={heroClassName}>{heroBody}</section>;
}

export default Hero;
