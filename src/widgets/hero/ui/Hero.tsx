// src/widgets/hero/ui/Hero.tsx
import { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { loadHeaderImagesFromDatabase } from '@entities/user/lib';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useArtistPageAccess } from '@shared/lib/hooks/useArtistPageAccess';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { selectCatalogArtistMissing } from '@entities/album';
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
import './style.scss';

const HERO_CLUSTER_PALETTE = [0x4d80ff, 0xff8a47, 0x53d8a2, 0xb086ff, 0xf2cd5d, 0x5ec9f5] as const;

const defaultArtistName = '';

/**
 * Преобразует URL изображения в формат для background-image
 * Всегда возвращает простой url(), так как многие браузеры не поддерживают image-set в inline style
 * @param imageUrl - URL изображения (может быть proxy URL или уже в формате url())
 * @returns простой URL в формате url('...')
 */
function formatBackgroundImageUrl(imageUrl: string): string {
  if (!imageUrl || !imageUrl.trim()) {
    return '';
  }

  // Если это уже правильный формат url('...'), возвращаем как есть
  if (imageUrl.startsWith("url('") || imageUrl.startsWith('url("')) {
    return imageUrl;
  }

  // Если это image-set, извлекаем первый доступный URL (jpg приоритет)
  if (imageUrl.includes('image-set')) {
    const jpgMatch = imageUrl.match(/url\(["']([^"']+\.jpg[^"']*)["']\)/);
    if (jpgMatch && jpgMatch[1]) {
      return `url('${jpgMatch[1]}')`;
    }
    const webpMatch = imageUrl.match(/url\(["']([^"']+\.webp[^"']*)["']\)/);
    if (webpMatch && webpMatch[1]) {
      return `url('${webpMatch[1]}')`;
    }
    const firstMatch = imageUrl.match(/url\(["']([^"']+)["']\)/);
    if (firstMatch && firstMatch[1]) {
      return `url('${firstMatch[1]}')`;
    }
  }

  // Для обычного URL просто оборачиваем в url()
  return `url('${imageUrl}')`;
}

export function Hero() {
  const [backgroundImage, setBackgroundImage] = useState('');
  const [headerImages, setHeaderImages] = useState<string[]>([]);
  const [artistPageMeta, setArtistPageMeta] = useState<{
    userId: string;
  } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const heroCanvasRef = useRef<HTMLDivElement | null>(null);
  const lastPathRef = useRef<string>('');
  const imagesLoadedRef = useRef<boolean>(false);
  const imageSelectedForPathRef = useRef<string>('');
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
  const artistPageAccess = useArtistPageAccess(artistParamKey);
  const showAwaitingFirstRelease = hasArtistParam && artistPageAccess.showAwaitingFirstRelease;
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

  // Загружаем изображения из БД
  useEffect(() => {
    const loadImages = async () => {
      imagesLoadedRef.current = false;
      setHeaderImages([]);
      setBackgroundImage('');

      try {
        // Для публичных страниц не передаем useAuth=true, API вернет данные админа
        const images = await loadHeaderImagesFromDatabase(false, {
          artistSlugOverride: heroPublicArtistSlug || null,
        });
        console.log('📸 [Hero] Загружены header images из БД:', images);

        // Фильтруем только изображения из папки hero, удаляем старые из articles
        const validHeroImages = (images || []).filter((url) => {
          // Проверяем, что путь содержит '/hero/' (работает для любого userId, включая UUID)
          const isValidHero =
            url.includes('/hero/') ||
            url.includes('/hero-') ||
            (url.includes('proxy-image') && url.includes('hero')) ||
            (url.includes('users/') && url.includes('/hero/'));

          if (!isValidHero) {
            console.warn('⚠️ [Hero] Найдено изображение не из папки hero, пропускаем:', url);
          }

          return isValidHero;
        });

        if (validHeroImages.length > 0) {
          setHeaderImages(validHeroImages);
          console.log('✅ [Hero] Валидные hero изображения:', validHeroImages.length);
        } else {
          console.warn(
            '⚠️ [Hero] Header images не найдены в БД или все из неправильной папки (пустой массив)'
          );
          // Принудительно очищаем изображения, если в БД их нет
          setHeaderImages([]);
          setBackgroundImage('');
        }
        imagesLoadedRef.current = true;
      } catch (error) {
        console.error('❌ [Hero] Ошибка загрузки header images из БД:', error);
        setHeaderImages([]);
        setBackgroundImage('');
        imagesLoadedRef.current = true;
      }
    };
    loadImages();
  }, [heroSearchString, heroPublicArtistSlug]);

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

  useEffect(() => {
    const handleHeaderImagesUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ images: string[] }>;
      const newImages = customEvent.detail?.images;
      if (Array.isArray(newImages)) {
        console.log('🔄 [Hero] Получено событие обновления header images:', newImages);
        setHeaderImages(newImages);
        imagesLoadedRef.current = true;
        if (newImages.length === 0) {
          setBackgroundImage('');
        }
      }
    };

    window.addEventListener('header-images-updated', handleHeaderImagesUpdate);

    return () => {
      window.removeEventListener('header-images-updated', handleHeaderImagesUpdate);
    };
  }, []);

  // Выбираем случайное изображение при загрузке данных, смене пути или артиста
  const heroVisualKey = `${heroPathname}|${heroPublicArtistSlug}`;

  useEffect(() => {
    // Выбираем изображение только если данные загружены
    if (!imagesLoadedRef.current) {
      return;
    }

    const visualContextChanged = lastPathRef.current !== heroVisualKey;

    if (!visualContextChanged && imageSelectedForPathRef.current === heroVisualKey) {
      // Изображение уже выбрано для этого контекста, не меняем
      return;
    }

    lastPathRef.current = heroVisualKey;
    imageSelectedForPathRef.current = heroVisualKey;

    // Выбираем изображение из БД
    if (headerImages.length > 0) {
      // Используем изображения из БД - случайный выбор
      const randomIndex = Math.floor(Math.random() * headerImages.length);
      const imageUrl = headerImages[randomIndex];
      console.log('🎲 [Hero] Выбрано изображение:', { index: randomIndex, url: imageUrl });

      // Проверяем и исправляем localhost URL перед установкой
      let cleanImageUrl = imageUrl;
      if (
        imageUrl &&
        (imageUrl.includes('localhost') ||
          imageUrl.includes('127.0.0.1') ||
          imageUrl.includes(':8080'))
      ) {
        // Извлекаем path из URL
        const pathMatch = imageUrl.match(/[?&]path=([^&]+)/);
        if (pathMatch) {
          const path = decodeURIComponent(pathMatch[1]);
          const hostname = window.location.hostname;
          const protocol = window.location.protocol;
          const port = window.location.port;

          const isProduction =
            hostname !== 'localhost' &&
            hostname !== '127.0.0.1' &&
            !hostname.includes('localhost') &&
            !hostname.includes('127.0.0.1') &&
            !hostname.includes(':8080') &&
            (hostname.includes('smolyanoechuchelko.ru') || hostname.includes('netlify.app'));

          const origin = isProduction
            ? `${protocol}//${hostname}${port && port !== '8080' ? `:${port}` : ''}`
            : window.location.origin;
          const proxyPath = isProduction ? '/api/proxy-image' : '/.netlify/functions/proxy-image';
          cleanImageUrl = `${origin}${proxyPath}?path=${encodeURIComponent(path)}`;

          console.log('🔄 [Hero] Исправлен localhost URL:', {
            old: imageUrl,
            new: cleanImageUrl,
          });
        }
      }

      // Преобразуем URL в формат для background-image (простой url(), без image-set)
      const backgroundImageUrl = formatBackgroundImageUrl(cleanImageUrl);
      setBackgroundImage(backgroundImageUrl);

      // Предзагружаем выбранное изображение для улучшения производительности
      if (imageUrl && !imageUrl.startsWith('url(')) {
        const cleanUrl = imageUrl.replace(/^url\(['"]?|['"]?\)$/g, '');
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = cleanUrl;

        // Добавляем только один preload link за раз
        const existingLink = document.querySelector('link[rel="preload"][as="image"]');
        if (existingLink) {
          existingLink.remove();
        }

        document.head.appendChild(link);

        // Очищаем link через 10 секунд
        setTimeout(() => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        }, 10000);
      }

      // Предзагружаем все остальные изображения для быстрого переключения
      // Это особенно важно для мобильных устройств
      headerImages.forEach((url, index) => {
        if (index !== randomIndex && url && !url.startsWith('url(')) {
          const cleanUrl = url.replace(/^url\(['"]?|['"]?\)$/g, '');
          // Создаем Image объект для предзагрузки (более надежно, чем link preload)
          const img = new Image();
          img.src = cleanUrl;
          // Не добавляем обработчики ошибок, чтобы не засорять консоль
          // Изображение просто загрузится в кэш браузера
        }
      });
    } else {
      console.warn('⚠️ [Hero] Нет изображений для отображения (headerImages пустой)');
      setBackgroundImage('');
    }
  }, [heroVisualKey, headerImages]);

  // Пока грузим профиль в artist-режиме — пустой заголовок; иначе имя из API/хранилища либо пусто.
  const catalogArtistMissing = useAppSelector(selectCatalogArtistMissing);
  const isTitlePending =
    hasArtistParam && !catalogArtistMissing && isProfileLoading && !profileDisplayName.trim();
  const displayName = isTitlePending
    ? ''
    : catalogArtistMissing && !showAwaitingFirstRelease
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
  const awaitingCopy = ui?.artistAwaitingFirstRelease;

  useEffect(() => {
    if (
      !hasArtistParam ||
      !artistParamKey ||
      hideHeroForArtistOnboarding ||
      showAwaitingFirstRelease
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
  }, [artistParamKey, hasArtistParam, hideHeroForArtistOnboarding, showAwaitingFirstRelease]);

  if (hideHeroForArtistOnboarding) {
    return null;
  }

  const heroClassName = [
    'hero',
    showAwaitingFirstRelease ? 'hero--awaiting-first-release' : '',
    hasArtistParam && !showAwaitingFirstRelease ? 'hero--navigate-home' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const awaitingBodyCopy = artistPageAccess.isOwner
    ? (awaitingCopy?.heroBodyOwner ??
      'A new star has been detected. The first release will ignite this star and bring it into the public constellation.')
    : (awaitingCopy?.heroBodyVisitor ??
      'This artist has not yet appeared in the public constellation. The first release will ignite the star and bring this artist into the universe.');

  return (
    <section
      className={heroClassName}
      style={
        showAwaitingFirstRelease || !backgroundImage
          ? undefined
          : { backgroundImage: backgroundImage || undefined }
      }
      onClick={
        hasArtistParam && !showAwaitingFirstRelease
          ? () => {
              if (artistParamKey) {
                sessionStorage.setItem(UNIVERSE_FOCUS_ARTIST_STORAGE_KEY, artistParamKey);
              }
              navigate('/');
            }
          : undefined
      }
    >
      {hasArtistParam && !showAwaitingFirstRelease ? (
        <div ref={heroCanvasRef} className="hero__canvas" />
      ) : null}
      <div className="hero__content">
        <div className="hero__headline">
          <h1 className="hero__title">{displayName}</h1>
          {showAwaitingFirstRelease ? (
            <div className="hero__awaiting-copy">
              <p className="hero__awaiting-eyebrow">
                {awaitingCopy?.heroEyebrow ?? 'New star detected'}
              </p>
              <p className="hero__awaiting-body">{awaitingBodyCopy}</p>
            </div>
          ) : null}
          {hasArtistParam && !showAwaitingFirstRelease ? (
            <div className="hero__archive-slot">
              <ArtistArchiveButton artistUserId={artistPageMeta?.userId ?? null} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default Hero;
