// src/widgets/hero/ui/Hero.tsx
import { useEffect, useRef, useMemo, useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { pickHeroBackgroundImage } from '@shared/lib/artistHeroHeaderImages';
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
import {
  Universe3D,
  type SceneArtist,
  UNIVERSE_FOCUS_ARTIST_STORAGE_KEY,
} from '@/components/view/Universe3D';
import '@/components/view/Universe3D.style.scss';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { ArtistArchiveButton } from '@features/artistArchive';
import { readStoredProfileDisplayName } from '@shared/lib/profileDisplayName';
import { ArtistPageSkeletonHero } from '@pages/Home/ui/ArtistPageSkeleton';
import './style.scss';

const HERO_CLUSTER_PALETTE = [0x4d80ff, 0xff8a47, 0x53d8a2, 0xb086ff, 0xf2cd5d, 0x5ec9f5] as const;

const defaultArtistName = '';

export function Hero() {
  const [artistPageMeta, setArtistPageMeta] = useState<{
    userId: string;
  } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const heroCanvasRef = useRef<HTMLDivElement | null>(null);
  const { overlayOpen: dashboardOverlayOpen, surfaceLocation } = useDashboardModalShell();
  const isDashboardRoute = location.pathname.startsWith('/dashboard') && !dashboardOverlayOpen;
  /**
   * Пока открыт auth-оверлей (/auth*), URL в строке — `/auth?...`, но фактически модалка рендерится
   * поверх underlying-страницы из `state.backgroundLocation`. Hero должен видеть эту underlying-страницу,
   * иначе при каждом открытии/закрытии оверлея сбрасывается `headerImages`/`backgroundImage`
   * и Hero мигает (fetch + re-pick случайного изображения).
   */
  const authOverlayBackground = useMemo<Location | null>(() => {
    if (!isAuthOverlayPathname(location.pathname)) return null;
    const bg = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
    return bg ?? null;
  }, [location.pathname, location.state]);
  const heroPathname =
    dashboardOverlayOpen && surfaceLocation?.pathname
      ? surfaceLocation.pathname
      : (authOverlayBackground?.pathname ?? location.pathname);
  /** Пока открыт оверлей (dashboard или auth), URL в строке — /dashboard*|/auth*; для Hero используем query фоновой страницы. */
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
    showArtistPageSkeleton,
    skeletonVariant,
    headerImages,
    isHeaderImagesReady,
    monetizationEnabled,
  } = artistPageAccess;
  const showHeroImageBuilder =
    hasArtistParam &&
    shouldShowArtistPageBuilderBlock(builderVisibility, headerImages.length === 0);
  const showOwnerBuilderHero =
    hasArtistParam && builderVisibility.canShowBlocks && !hasPublicReleases;
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

  const heroVisualKey = `${heroPathname}|${heroPublicArtistSlug}`;
  const backgroundImage = useMemo(
    () => pickHeroBackgroundImage(headerImages, heroVisualKey),
    [headerImages, heroVisualKey]
  );

  useEffect(() => {
    if (!hasArtistParam || !artistParamKey) {
      setArtistPageMeta(null);
      return;
    }

    let cancelled = false;

    const loadArtistMeta = async () => {
      try {
        const response = await fetchWithAuthSession('/api/public-artists');
        const payload = (await response.json()) as {
          success?: boolean;
          data?: SceneArtist[];
        };
        if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
          if (!cancelled) setArtistPageMeta(null);
          return;
        }

        const match =
          payload.data.find((artist) => artist.publicSlug?.trim() === artistParamKey) ?? null;
        if (!cancelled) {
          if (match?.userId) {
            setArtistPageMeta({
              userId: match.userId,
            });
          } else {
            setArtistPageMeta(null);
          }
        }
      } catch {
        if (!cancelled) setArtistPageMeta(null);
      }
    };

    void loadArtistMeta();

    return () => {
      cancelled = true;
    };
  }, [artistParamKey, hasArtistParam]);

  // Пока грузим профиль в artist-режиме — пустой заголовок; иначе имя из API/хранилища либо пусто.
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

  /** Latest profile/header for canvas fallback without re-running Universe3D effect. */
  const profileNameForCanvasRef = useRef(profileDisplayName);
  const headerImagesForCanvasRef = useRef(headerImages);
  profileNameForCanvasRef.current = profileDisplayName;
  headerImagesForCanvasRef.current = headerImages;

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const builderCopy = ui?.artistPageBuilder;

  useEffect(() => {
    if (
      !hasArtistParam ||
      !artistParamKey ||
      hideHeroForArtistOnboarding ||
      showArtistPageSkeleton ||
      !isHeaderImagesReady ||
      !showPublishedHeroChrome
    )
      return;
    const el = heroCanvasRef.current;
    if (!el) return;
    if (el.childElementCount > 0) return;

    let universe: Universe3D | null = null;
    let cancelled = false;

    const run = async () => {
      let sceneArtist: SceneArtist | null = null;
      let allPublicArtists: SceneArtist[] = [];

      try {
        const response = await fetchWithAuthSession('/api/public-artists');
        const payload = (await response.json()) as { success?: boolean; data?: SceneArtist[] };
        if (response.ok && payload.success && Array.isArray(payload.data)) {
          allPublicArtists = payload.data;
          sceneArtist = payload.data.find((a) => a.publicSlug?.trim() === artistParamKey) ?? null;
        }
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

      universe = new Universe3D(heroCanvasRef.current, [sceneArtist], {
        disableCameraControls: true,
        embedInContainer: true,
        isHeroPreview: true,
      });
    };

    void run();

    return () => {
      cancelled = true;
      universe?.destroy();
      el.replaceChildren();
    };
  }, [
    artistParamKey,
    hasArtistParam,
    hideHeroForArtistOnboarding,
    showArtistPageSkeleton,
    isHeaderImagesReady,
    showPublishedHeroChrome,
  ]);

  if (hideHeroForArtistOnboarding) {
    return null;
  }

  if (showArtistPageSkeleton) {
    return <ArtistPageSkeletonHero variant={skeletonVariant} />;
  }

  const heroUsesInlineBackground = Boolean(backgroundImage) && !showHeroImageBuilder;

  const heroClassName = [
    'hero',
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
    navigate('/');
  };

  return (
    <section
      className={heroClassName}
      style={
        heroUsesInlineBackground ? { backgroundImage: backgroundImage || undefined } : undefined
      }
    >
      {showPublishedHeroChrome ? (
        <div ref={heroCanvasRef} className="hero__canvas" onClick={handleNavigateHome} />
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
    </section>
  );
}

export default Hero;
