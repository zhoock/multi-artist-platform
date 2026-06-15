// src/app/App.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import {
  primeDashboardModalSessionFromLocation,
  readDashboardModalBackground,
  locationFromDashboardModalStored,
  syncDashboardAlbumsPublicCatalogOverlay,
  isDashboardAlbumsPublicCatalogOverlay,
} from '@shared/lib/dashboardModalBackground';
import { DashboardModalShellContext } from '@shared/lib/dashboardModalShellContext';
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
  useSearchParams,
  Routes,
  Route,
  Navigate,
  useParams,
  useRevalidator,
  matchPath,
  type Location,
} from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { buildPublicSiteUrl, getPublicSiteOrigin } from '@shared/lib/publicSiteOrigin';
import { albumsLoader } from '@routes/loaders/albumsLoader';
import { ArtistPublishedPageFallback } from '@pages/Home/ui/ArtistPublishedPageFallback';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { setPublicArtistSlug } from '@shared/model/currentArtist';
import { purgeInvalidAuthSessionFromStorage } from '@shared/lib/auth';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { closePopup, getIsPopupOpen, openPopup } from '@features/popupToggle';

import { Popup } from '@shared/ui/popup';
import { Hamburger } from '@shared/ui/hamburger';
import { NotFoundPage } from '@widgets/notFound';
import { Form } from '@widgets/form';
import { Hero } from '@widgets/hero';
import { Header } from '@widgets/header';
import { Footer } from '@widgets/footer';
import { Navigation } from '@features/navigation';
import { PlayerShell } from '@features/player';
import { ErrorBoundary } from '@shared/ui/error-boundary';
import { ArchiveAccessModalProvider } from '@shared/lib/archiveAccessModal';
import {
  AlbumCheckoutIntentResumeController,
  ArtistOnboardingRedirectController,
  PremiumCheckoutIntentResumeController,
} from '@shared/lib/authIntent';
import { ListenerWelcomeController } from '@features/listenerWelcome';
import {
  PremiumSubscriptionProvider,
  PremiumSuccessModalController,
  PremiumEntitlementRefreshController,
} from '@features/premiumSubscription';
import {
  EmailVerificationBanner,
  EmailVerificationRefreshController,
} from '@shared/lib/emailVerification';
import { AccountDeletedToast } from '@shared/ui/accountDeletedToast/AccountDeletedToast';

// Lazy loading для страниц - загружаются только при необходимости
const Album = lazy(() => import('@pages/Album/Album'));
const AllAlbums = lazy(() => import('@pages/AllAlbums'));
const AllArticles = lazy(() => import('@pages/AllArticles'));
const StemsPlayground = lazy(() => import('@pages/StemsPlayground/StemsPlayground'));
const Home = lazy(() => import('@pages/Home'));
const ArticlePage = lazy(() => import('@pages/Article'));
const HelpArticlePage = lazy(() => import('@pages/HelpArticle'));
const OfferPage = lazy(() => import('@pages/Offer'));
const UserDashboard = lazy(() => import('@pages/UserDashboard/UserDashboard'));
const AuthPage = lazy(() => import('@features/auth/ui/AuthPage'));
const PaymentSuccess = lazy(() => import('@pages/PaymentSuccess/PaymentSuccess'));
const SubscriptionPaymentSuccess = lazy(
  () => import('@pages/SubscriptionPaymentSuccess/SubscriptionPaymentSuccess')
);
const EmailVerified = lazy(() => import('@pages/EmailVerified/EmailVerified'));
const EmailVerificationExpired = lazy(
  () => import('@pages/EmailVerificationExpired/EmailVerificationExpired')
);
const ResetPassword = lazy(() => import('@pages/ResetPassword/ResetPassword'));

// Компонент для отображения загрузки
const PageLoader = () => <p>Загрузка...</p>;

/** Suspense для lazy Home: на `/?artist=` — скелетон секций, иначе текстовый loader. */
function HomeRouteSuspenseFallback() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('artist')?.trim()) {
    return <ArtistPublishedPageFallback />;
  }
  return <PageLoader />;
}

/** Старые пути `/dashboard/:tab` → `/dashboard-new/:tab` (сохраняем location.state) */
function LegacyDashboardTabRedirect() {
  const { tab } = useParams();
  const { state } = useLocation();
  return <Navigate to={`/dashboard-new/${tab ?? 'albums'}`} replace state={state} />;
}

function DashboardRootRedirect() {
  const { state } = useLocation();
  return <Navigate to="/dashboard-new" replace state={state} />;
}

function isDashboardAppPathname(pathname: string): boolean {
  return (
    pathname.startsWith('/dashboard-new') ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
  );
}

// Упрощённый роутер: один корневой маршрут, всё остальное рисуем в Layout
const router = createBrowserRouter([
  {
    id: 'root',
    path: '/*',
    element: <Layout />,
    loader: albumsLoader, // загружаем данные для альбомов, статей и UI-словарик
    errorElement: <NotFoundPage />,
  },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider
        router={router}
        future={{ v7_startTransition: true }}
        fallbackElement={<p>Загрузка...</p>}
      />
    </ErrorBoundary>
  );
}

/** Синхронизирует `?artist=` из URL в Redux (F5 и клиентская навигация). */
function CurrentArtistSync() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const artistFromUrl = searchParams.get('artist')?.trim() ?? '';

  const stateBg = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  const sessionBg =
    isDashboardAppPathname(location.pathname) && isDashboardAlbumsPublicCatalogOverlay()
      ? readDashboardModalBackground()
      : null;
  const surfaceSearch =
    stateBg?.pathname && !stateBg.pathname.startsWith('/dashboard')
      ? stateBg.search
      : sessionBg && !sessionBg.pathname.startsWith('/dashboard')
        ? sessionBg.search
        : '';
  const artistFromModalSurface =
    isDashboardAppPathname(location.pathname) && surfaceSearch !== ''
      ? (new URLSearchParams(surfaceSearch.replace(/^\?/, '')).get('artist')?.trim() ?? '')
      : '';

  const artist = artistFromUrl || artistFromModalSurface;
  // Auth-оверлей (/auth*) рендерится поверх underlying-страницы. publicArtistSlug должен сохранять
  // значение, выставленное на underlying-странице, иначе при закрытии модалки selector кэша
  // считает данные stale и каталог под backdrop'ом мигает skeleton'ом.
  const skipSlugSync = isAuthOverlayPathname(location.pathname);

  useEffect(() => {
    if (skipSlugSync) return;
    dispatch(setPublicArtistSlug(artist || null));
  }, [artist, dispatch, skipSlugSync]);

  return null;
}

function Layout() {
  const dispatch = useAppDispatch();
  const popup = useAppSelector(getIsPopupOpen);
  const location = useLocation();

  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const { revalidate } = useRevalidator();

  useEffect(() => {
    purgeInvalidAuthSessionFromStorage();
  }, []);

  // Отслеживаем предыдущий путь для умных breadcrumbs
  // Сохраняем текущий путь в sessionStorage при клике на ссылку (до навигации)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Ищем ближайший элемент <a> или родителя, который является ссылкой
      const link = target.closest('a[href]');
      if (link && link.getAttribute('href')?.startsWith('/')) {
        // Сохраняем текущий путь перед навигацией
        sessionStorage.setItem('previousPath', location.pathname);
      }
    };

    document.addEventListener('click', handleClick, true); // Используем capture phase для раннего перехвата

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [location.pathname]);

  // Также сохраняем путь при изменении location (fallback для программной навигации)
  useLayoutEffect(() => {
    const previousPath = sessionStorage.getItem('previousPath');
    // Если previousPath не установлен, сохраняем текущий путь
    // Это нужно для случаев, когда навигация происходит программно (не через клик)
    if (!previousPath && location.pathname !== '/') {
      sessionStorage.setItem('previousPath', location.pathname);
    }
  }, [location.pathname]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const previousLangRef = useRef(lang);
  const revalidateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previousLangRef.current !== lang) {
      previousLangRef.current = lang;

      // Отменяем предыдущий таймаут, если он есть
      if (revalidateTimeoutRef.current) {
        clearTimeout(revalidateTimeoutRef.current);
      }

      // Используем debounce, чтобы предотвратить множественные вызовы
      revalidateTimeoutRef.current = setTimeout(() => {
        revalidate();
        revalidateTimeoutRef.current = null;
      }, 50);
    }

    return () => {
      if (revalidateTimeoutRef.current) {
        clearTimeout(revalidateTimeoutRef.current);
        revalidateTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const siteOrigin = getPublicSiteOrigin();
  const seo = useMemo(() => {
    const homeUrl = buildPublicSiteUrl('/');
    return {
      ru: {
        title: 'Смоляное Чучелко — официальный сайт',
        desc: 'Московская гранж и альтернативная рок-группа. Альбомы, тексты, статьи и философия проекта.',
        url: homeUrl,
        ogImage: buildPublicSiteUrl('/og/default.jpg'),
      },
      en: {
        title: 'Смоляное Чучелко — official website',
        desc: 'Moscow grunge and alternative rock band. Albums, lyrics, articles and project philosophy.',
        url: homeUrl,
        ogImage: buildPublicSiteUrl('/og/default_en.jpg'),
      },
    };
  }, [siteOrigin]);

  // меняем <html lang="...">
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const knownRoutes = [
    '/',
    '/albums',
    '/albums/:albumId',
    '/articles',
    '/articles/:articleId',
    '/help/articles/:articleId',
    '/offer',
    '/forms',
    '/stems',
    '/stems/mix/:mixId',
    '/dashboard',
    '/dashboard/:tab',
    '/dashboard-new',
    '/dashboard-new/:tab',
    '/auth',
    '/auth/reset-password',
    '/email-verified',
    '/email-verification-expired',
  ];

  const isKnownRoute = knownRoutes.some((pattern) =>
    matchPath({ path: pattern, end: true }, location.pathname)
  );

  const isPaymentRoute = ['/pay/success', '/pay/fail', '/pay/subscription-success'].some(
    (pattern) => matchPath({ path: pattern, end: true }, location.pathname)
  );

  const shouldHideChrome = !isKnownRoute;

  const backgroundFromState = (
    location.state as { backgroundLocation?: Location } | null | undefined
  )?.backgroundLocation;

  /** Последняя страница не-дашборд: fallback, если при открытии модалки потеряли `location.state`. */
  const lastNonDashboardLocationRef = useRef<Location | null>(null);
  useLayoutEffect(() => {
    primeDashboardModalSessionFromLocation(location);
    if (!isDashboardAppPathname(location.pathname)) {
      lastNonDashboardLocationRef.current = location;
    }
  }, [location]);

  const storedBg = readDashboardModalBackground();
  const backgroundFromSession =
    isDashboardAppPathname(location.pathname) &&
    storedBg &&
    !storedBg.pathname.startsWith('/dashboard')
      ? locationFromDashboardModalStored(storedBg)
      : null;

  const backgroundFromLastSurface =
    isDashboardAppPathname(location.pathname) &&
    lastNonDashboardLocationRef.current &&
    !isDashboardAppPathname(lastNonDashboardLocationRef.current.pathname)
      ? lastNonDashboardLocationRef.current
      : null;

  const backgroundLocation =
    backgroundFromState ?? backgroundFromLastSurface ?? backgroundFromSession;

  const activeLocation = backgroundLocation ?? location;

  const isHomeRoute = activeLocation.pathname === '/' || activeLocation.pathname === '/en';
  const hasArtistParam = new URLSearchParams(activeLocation.search).has('artist');
  const isHomeSceneRoute = isHomeRoute && !hasArtistParam;
  const isEmailVerifiedRoute = matchPath({ path: '/email-verified', end: true }, location.pathname);

  useLayoutEffect(() => {
    if (isHomeSceneRoute) {
      document.body.classList.add('page--home-scene');
    } else {
      document.body.classList.remove('page--home-scene');
    }
    return () => {
      document.body.classList.remove('page--home-scene');
    };
  }, [isHomeSceneRoute]);

  useLayoutEffect(() => {
    if (isEmailVerifiedRoute) {
      document.body.classList.add('page--email-verified');
    } else {
      document.body.classList.remove('page--email-verified');
    }
    return () => {
      document.body.classList.remove('page--email-verified');
    };
  }, [isEmailVerifiedRoute]);

  const mainRoutes = (
    <Routes location={activeLocation}>
      <Route
        path="/"
        element={
          <Suspense fallback={<HomeRouteSuspenseFallback />}>
            <Home />
          </Suspense>
        }
      />
      <Route
        path="/albums"
        element={
          <Suspense fallback={<PageLoader />}>
            <AllAlbums />
          </Suspense>
        }
      />
      <Route
        path="/albums/:albumId"
        element={
          <Suspense fallback={<PageLoader />}>
            <Album />
          </Suspense>
        }
      />
      <Route
        path="/articles"
        element={
          <Suspense fallback={<PageLoader />}>
            <AllArticles />
          </Suspense>
        }
      />
      <Route
        path="/articles/:articleId"
        element={
          <Suspense fallback={<PageLoader />}>
            <ArticlePage />
          </Suspense>
        }
      />
      <Route
        path="/help/articles/:articleId"
        element={
          <Suspense fallback={<PageLoader />}>
            <HelpArticlePage />
          </Suspense>
        }
      />
      <Route
        path="/offer"
        element={
          <Suspense fallback={<PageLoader />}>
            <OfferPage />
          </Suspense>
        }
      />
      <Route
        path="/dashboard-new/:tab?"
        element={
          <Suspense fallback={<PageLoader />}>
            <UserDashboard />
          </Suspense>
        }
      />
      <Route path="/dashboard" element={<DashboardRootRedirect />} />
      <Route path="/dashboard/:tab" element={<LegacyDashboardTabRedirect />} />
      <Route
        path="/auth"
        element={
          <Suspense fallback={<PageLoader />}>
            <AuthPage />
          </Suspense>
        }
      />
      <Route
        path="/auth/reset-password"
        element={
          <Suspense fallback={<PageLoader />}>
            <ResetPassword />
          </Suspense>
        }
      />
      <Route
        path="/email-verified"
        element={
          <Suspense fallback={<PageLoader />}>
            <EmailVerified />
          </Suspense>
        }
      />
      <Route
        path="/email-verification-expired"
        element={
          <Suspense fallback={<PageLoader />}>
            <EmailVerificationExpired />
          </Suspense>
        }
      />
      <Route path="/forms" element={<Form />} />
      <Route
        path="/stems"
        element={
          <Suspense fallback={<PageLoader />}>
            <StemsPlayground />
          </Suspense>
        }
      />
      <Route
        path="/stems/mix/:mixId"
        element={
          <Suspense fallback={<PageLoader />}>
            <StemsPlayground />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );

  const showAuthModal =
    Boolean(backgroundLocation) &&
    Boolean(matchPath({ path: '/auth', end: true }, location.pathname));
  const showDashboardModal =
    Boolean(backgroundLocation) && isDashboardAppPathname(location.pathname);

  if (typeof window !== 'undefined') {
    syncDashboardAlbumsPublicCatalogOverlay(showDashboardModal);
  }

  const dashboardModalShell = useMemo(
    () => ({
      overlayOpen: showDashboardModal,
      surfaceLocation: showDashboardModal ? backgroundLocation : null,
    }),
    [showDashboardModal, backgroundLocation]
  );

  const authModalRoutes = showAuthModal ? (
    <Routes>
      <Route
        path="/auth"
        element={
          <Suspense fallback={<PageLoader />}>
            <AuthPage />
          </Suspense>
        }
      />
    </Routes>
  ) : null;

  const dashboardModalRoutes = showDashboardModal ? (
    <Routes>
      <Route
        path="/dashboard-new/:tab?"
        element={
          <Suspense fallback={<PageLoader />}>
            <UserDashboard />
          </Suspense>
        }
      />
      <Route path="/dashboard" element={<DashboardRootRedirect />} />
      <Route path="/dashboard/:tab" element={<LegacyDashboardTabRedirect />} />
    </Routes>
  ) : null;

  const standardRoutes = (
    <>
      {mainRoutes}
      {authModalRoutes}
      {dashboardModalRoutes}
    </>
  );

  const notFoundRoutes = (
    <Routes>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );

  const paymentRoutes = (
    <Routes>
      <Route
        path="/pay/success"
        element={
          <Suspense fallback={<PageLoader />}>
            <PaymentSuccess />
          </Suspense>
        }
      />
      <Route
        path="/pay/fail"
        element={
          <Suspense fallback={<PageLoader />}>
            <PaymentSuccess />
          </Suspense>
        }
      />
      <Route
        path="/pay/subscription-success"
        element={
          <Suspense fallback={<PageLoader />}>
            <SubscriptionPaymentSuccess />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );

  return (
    <ArchiveAccessModalProvider>
      <PremiumSubscriptionProvider>
        <DashboardModalShellContext.Provider value={dashboardModalShell}>
          <CurrentArtistSync />
          {/* БАЗОВЫЙ Helmet для всех страниц без собственного */}
          <Helmet>
            {/* динамический заголовок и описание */}
            <title>{seo[lang].title}</title>
            <meta name="description" content={seo[lang].desc} />
            <meta name="color-scheme" content="dark light" />
            <link rel="canonical" href={seo[lang].url} />

            {/* hreflang для Google */}
            <link rel="alternate" href={seo.ru.url} hrefLang="ru" />
            <link rel="alternate" href={seo.en.url} hrefLang="en" />
            <link rel="alternate" href={seo.ru.url} hrefLang="x-default" />

            {/* Open Graph / Twitter */}
            <meta property="og:type" content="website" />
            <meta property="og:title" content={seo[lang].title} />
            <meta property="og:description" content={seo[lang].desc} />
            <meta property="og:url" content={seo[lang].url} />
            <meta property="og:image" content={seo[lang].ogImage} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={seo[lang].title} />
            <meta name="twitter:description" content={seo[lang].desc} />
            <meta name="twitter:image" content={seo[lang].ogImage} />
            <meta name="twitter:url" content={seo[lang].url} />
          </Helmet>

          {isPaymentRoute ? (
            <ErrorBoundary>
              <main>{paymentRoutes}</main>
            </ErrorBoundary>
          ) : shouldHideChrome ? (
            <ErrorBoundary>
              <main>{notFoundRoutes}</main>
            </ErrorBoundary>
          ) : isHomeSceneRoute ? (
            <ErrorBoundary>
              {!isEmailVerifiedRoute && <EmailVerificationBanner />}
              <AccountDeletedToast />
              <main>
                <ErrorBoundary>{standardRoutes}</ErrorBoundary>
              </main>
              <PlayerShell />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary>
              <Header
                theme={theme}
                onToggleTheme={toggleTheme}
                navMenuOpen={popup}
                onNavMenuToggle={() => {
                  if (popup) dispatch(closePopup());
                  else dispatch(openPopup());
                }}
              />
              <AccountDeletedToast />
              <main>
                {!isEmailVerifiedRoute && <EmailVerificationBanner />}
                {!isHomeSceneRoute && !isEmailVerifiedRoute && <Hero />}

                {/* если поместим popup внурь header, то popup будет обрезаться из-за css-фильтра (filter) внури header */}

                <Popup isActive={popup} onClose={() => dispatch(closePopup())}>
                  {/* Гамбургер внутри native dialog — в top layer, кликабелен; инлайн в шапке при открытом меню скрыт через behindDialogOverlap */}
                  <Hamburger
                    isActive={popup}
                    onToggle={() => dispatch(closePopup())}
                    zIndex="1500"
                  />
                  <Navigation onToggle={() => dispatch(closePopup())} />
                </Popup>

                <ErrorBoundary>{standardRoutes}</ErrorBoundary>
              </main>
              {!isEmailVerifiedRoute && <Footer />}
              <PlayerShell />
            </ErrorBoundary>
          )}
          <EmailVerificationRefreshController />
          <PremiumEntitlementRefreshController />
          <PremiumCheckoutIntentResumeController />
          <AlbumCheckoutIntentResumeController />
          <ArtistOnboardingRedirectController />
          <ListenerWelcomeController />
          <PremiumSuccessModalController />
        </DashboardModalShellContext.Provider>
      </PremiumSubscriptionProvider>
    </ArchiveAccessModalProvider>
  );
}
