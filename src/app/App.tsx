// src/app/App.tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import {
  primeDashboardModalSessionFromLocation,
  readDashboardModalBackground,
  locationFromDashboardModalStored,
  syncDashboardAlbumsPublicCatalogOverlay,
  isPaymentReturnPathname,
  isValidDashboardModalBackground,
} from '@shared/lib/dashboardModalBackground';
import { DashboardModalShellContext } from '@shared/lib/dashboardModalShellContext';
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
  Routes,
  Route,
  Navigate,
  useParams,
  matchPath,
  type Location,
} from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { platformSeoForLang } from '@shared/constants/platformBranding';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { buildPublicSiteUrl, getPublicSiteOrigin } from '@shared/lib/publicSiteOrigin';
import { buildPublicPageHreflangUrls } from '@shared/lib/seo/buildPublicPageHreflangUrls';
import { publicPageHreflangLinks } from '@shared/lib/seo/PublicPageHreflangLinks';
import { albumsLoader } from '@routes/loaders/albumsLoader';
import { ArtistPageSkeleton } from '@pages/Home/ui/ArtistPageSkeleton';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { setPublicArtistSlug } from '@shared/model/currentArtist';
import { purgeInvalidAuthSessionFromStorage } from '@shared/lib/auth';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { fetchUiDictionary } from '@shared/model/uiDictionary';
import { closePopup, getIsPopupOpen, openPopup } from '@features/popupToggle';

import { Popup, PopupHamburgerToggle, usePopup } from '@shared/ui/popup';
import { NotFoundPage } from '@widgets/notFound';
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
import { AnalyticsController } from '@shared/lib/analytics';
import { ConsentProvider } from '@shared/lib/consent';
import { SessionExpiredRedirectController } from '@shared/lib/sessionExpired';
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
import { ArtistPageAccessProvider } from '@shared/lib/hooks/ArtistPageAccessProvider';
import { LangLayout } from '@app/layouts/LangLayout';
import { MinimalLayout } from '@app/layouts/MinimalLayout';
import { isMinimalLayoutPathname } from '@app/layouts/minimalLayoutRoutes';
import { isServiceScreenBodyClassActive } from '@app/layouts/serviceScreenBodyClass';
import { UnprefixedRedirect } from '@app/layouts/UnprefixedRedirect';
import { DEFAULT_ROUTE_LANG, stripLangPrefix } from '@shared/lib/i18n/routeLang';
import { ToastProvider, NavigationToastHydrator } from '@shared/lib/toast';

// Lazy loading для страниц - загружаются только при необходимости
const Album = lazy(() => import('@pages/Album/Album'));
const AllAlbums = lazy(() => import('@pages/AllAlbums'));
const AllArticles = lazy(() => import('@pages/AllArticles'));
const StemsPlayground = lazy(() => import('@pages/StemsPlayground/StemsPlayground'));
const Home = lazy(() => import('@pages/Home'));
const ArticlePage = lazy(() => import('@pages/Article'));
const HelpArticlePage = lazy(() => import('@pages/HelpArticle'));
const OfferPage = lazy(() => import('@pages/Offer'));
const PrivacyPage = lazy(() => import('@pages/Privacy'));
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

/** Suspense для lazy Home: на artist hub — нейтральный public-скелетон (builder ещё не известен). */
function HomeRouteSuspenseFallback() {
  const [searchParams] = useEffectiveSearchParams();
  if (searchParams.get('artist')?.trim()) {
    return <ArtistPageSkeleton part="main" variant="public" />;
  }
  return <PageLoader />;
}

const homePageElement = (
  <Suspense fallback={<HomeRouteSuspenseFallback />}>
    <Home />
  </Suspense>
);

const allAlbumsPageElement = (
  <Suspense fallback={<PageLoader />}>
    <AllAlbums />
  </Suspense>
);

const albumPageElement = (
  <Suspense fallback={<PageLoader />}>
    <Album />
  </Suspense>
);

const allArticlesPageElement = (
  <Suspense fallback={<PageLoader />}>
    <AllArticles />
  </Suspense>
);

const articlePageElement = (
  <Suspense fallback={<PageLoader />}>
    <ArticlePage />
  </Suspense>
);

const offerPageElement = (
  <Suspense fallback={<PageLoader />}>
    <OfferPage />
  </Suspense>
);

const privacyPageElement = (
  <Suspense fallback={<PageLoader />}>
    <PrivacyPage />
  </Suspense>
);

const stemsPageElement = (
  <Suspense fallback={<PageLoader />}>
    <StemsPlayground />
  </Suspense>
);

/** Старые пути `/dashboard/:tab` → `/dashboard-new/:tab` (сохраняем location.state) */
function LegacyDashboardTabRedirect() {
  const { tab } = useParams();
  const { state } = useLocation();
  const normalizedTab = tab === 'profile' ? 'settings' : (tab ?? 'albums');
  return <Navigate to={`/dashboard-new/${normalizedTab}`} replace state={state} />;
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
      <ToastProvider>
        <NavigationToastHydrator />
        <RouterProvider
          router={router}
          future={{ v7_startTransition: true }}
          fallbackElement={<p>Загрузка...</p>}
        />
      </ToastProvider>
    </ErrorBoundary>
  );
}

/** Синхронизирует `?artist=` из effective URL в Redux (F5, навигация, auth/dashboard overlay). */
function CurrentArtistSync() {
  const [searchParams] = useEffectiveSearchParams();
  const dispatch = useAppDispatch();
  const artist = searchParams.get('artist')?.trim() ?? '';

  useEffect(() => {
    dispatch(setPublicArtistSlug(artist || null));
  }, [artist, dispatch]);

  return null;
}

function NavPopupMenu({ isActive }: { isActive: boolean }) {
  const { requestClose } = usePopup();
  return (
    <>
      <PopupHamburgerToggle isActive={isActive} zIndex="1500" />
      <Navigation onToggle={requestClose} />
    </>
  );
}

function Layout() {
  const dispatch = useAppDispatch();
  const popup = useAppSelector(getIsPopupOpen);
  const location = useLocation();

  const { lang } = useLang() as { lang: 'ru' | 'en' };

  useEffect(() => {
    purgeInvalidAuthSessionFromStorage();
  }, []);

  // Отслеживаем предыдущий путь для контекстной навигации
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

  useEffect(() => {
    if (previousLangRef.current === lang) return;
    previousLangRef.current = lang;
    void dispatch(fetchUiDictionary({ lang }));
  }, [dispatch, lang]);

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
    const hreflang = buildPublicPageHreflangUrls((routeLang) =>
      buildLocalizedPublicPath(routeLang, '/')
    );
    return {
      hreflang,
      ru: {
        title: platformSeoForLang('ru').title,
        desc: platformSeoForLang('ru').description,
        url: hreflang.ru,
        ogImage: buildPublicSiteUrl('/og/default.jpg'),
      },
      en: {
        title: platformSeoForLang('en').title,
        desc: platformSeoForLang('en').description,
        url: hreflang.en,
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
    '/privacy',
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

  const pathnameWithoutLang = stripLangPrefix(location.pathname);

  const isKnownRoute = knownRoutes.some((pattern) =>
    matchPath({ path: pattern, end: true }, pathnameWithoutLang)
  );

  const isPaymentRoute = [
    '/pay/status',
    '/pay/success',
    '/pay/fail',
    '/pay/subscription-success',
  ].some((pattern) => matchPath({ path: pattern, end: true }, location.pathname));

  const shouldHideChrome = !isKnownRoute;

  const backgroundFromStateRaw = (
    location.state as { backgroundLocation?: Location } | null | undefined
  )?.backgroundLocation;
  const backgroundFromState =
    backgroundFromStateRaw && isValidDashboardModalBackground(backgroundFromStateRaw)
      ? backgroundFromStateRaw
      : undefined;

  /** Последняя страница не-дашборд: fallback, если при открытии модалки потеряли `location.state`. */
  const lastNonDashboardLocationRef = useRef<Location | null>(null);
  useLayoutEffect(() => {
    primeDashboardModalSessionFromLocation(location);
    if (!isDashboardAppPathname(location.pathname) && !isPaymentReturnPathname(location.pathname)) {
      lastNonDashboardLocationRef.current = location;
    }
  }, [location]);

  const storedBg = readDashboardModalBackground();
  const backgroundFromSession =
    isDashboardAppPathname(location.pathname) &&
    storedBg &&
    isValidDashboardModalBackground(storedBg)
      ? locationFromDashboardModalStored(storedBg)
      : null;

  const backgroundFromLastSurface =
    isDashboardAppPathname(location.pathname) &&
    lastNonDashboardLocationRef.current &&
    isValidDashboardModalBackground(lastNonDashboardLocationRef.current)
      ? lastNonDashboardLocationRef.current
      : null;

  const backgroundLocation =
    backgroundFromState ?? backgroundFromLastSurface ?? backgroundFromSession;

  const isOnAuthRoute = Boolean(matchPath({ path: '/auth', end: true }, location.pathname));

  const showAuthModal = Boolean(backgroundFromState) && isOnAuthRoute;

  /** Session-expired auth overlay opened from dashboard — keep dashboard modal layer alive. */
  const authOverlayDashboardBackground =
    showAuthModal && backgroundFromState && isDashboardAppPathname(backgroundFromState.pathname)
      ? backgroundFromState
      : null;

  const authOverlayPublicSurface = authOverlayDashboardBackground
    ? ((authOverlayDashboardBackground.state as { backgroundLocation?: Location } | null)
        ?.backgroundLocation ??
      (storedBg && !storedBg.pathname.startsWith('/dashboard')
        ? locationFromDashboardModalStored(storedBg)
        : null) ??
      backgroundFromLastSurface)
    : null;

  const activeLocation = authOverlayPublicSurface ?? backgroundLocation ?? location;

  const activePathnameWithoutLang = stripLangPrefix(activeLocation.pathname);

  const isHomeRoute = activePathnameWithoutLang === '/';
  const hasArtistParam = new URLSearchParams(activeLocation.search).has('artist');
  const isHomeSceneRoute = isHomeRoute && !hasArtistParam;
  const isMinimalLayoutRoute = isMinimalLayoutPathname(location.pathname);
  const isOfferRoute = matchPath({ path: '/offer', end: true }, pathnameWithoutLang);
  const isPrivacyRoute = matchPath({ path: '/privacy', end: true }, pathnameWithoutLang);
  const isLegalDocumentRoute = isOfferRoute || isPrivacyRoute;

  const isServiceScreenRoute = isServiceScreenBodyClassActive({
    isPaymentRoute,
    shouldHideChrome,
    isMinimalLayoutRoute,
  });

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
    if (isServiceScreenRoute) {
      document.body.classList.add('page--service-screen');
    } else {
      document.body.classList.remove('page--service-screen');
    }
    return () => {
      document.body.classList.remove('page--service-screen');
    };
  }, [isServiceScreenRoute]);

  const mainRoutes = (
    <Routes location={activeLocation}>
      <Route path="/" element={<Navigate to={`/${DEFAULT_ROUTE_LANG}`} replace />} />
      <Route
        path="/help/articles/:articleId"
        element={
          <Suspense fallback={<PageLoader />}>
            <HelpArticlePage />
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
      <Route path="/:lang" element={<LangLayout />}>
        <Route index element={homePageElement} />
        <Route path="albums" element={allAlbumsPageElement} />
        <Route path="albums/:albumId" element={albumPageElement} />
        <Route path="articles" element={allArticlesPageElement} />
        <Route path="articles/:articleId" element={articlePageElement} />
        <Route path="offer" element={offerPageElement} />
        <Route path="privacy" element={privacyPageElement} />
        <Route path="stems" element={stemsPageElement} />
        <Route path="stems/mix/:mixId" element={stemsPageElement} />
        <Route path="dashboard-new/*" element={<UnprefixedRedirect />} />
        <Route path="dashboard/*" element={<UnprefixedRedirect />} />
        <Route path="auth/*" element={<UnprefixedRedirect />} />
        <Route path="pay/*" element={<UnprefixedRedirect />} />
        <Route path="email-verified" element={<UnprefixedRedirect />} />
        <Route path="email-verification-expired" element={<UnprefixedRedirect />} />
        <Route path="help/*" element={<UnprefixedRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );

  const showDashboardModal =
    (Boolean(backgroundLocation) && isDashboardAppPathname(location.pathname)) ||
    Boolean(authOverlayDashboardBackground);

  const dashboardRoutesLocation = authOverlayDashboardBackground ?? location;

  if (typeof window !== 'undefined') {
    syncDashboardAlbumsPublicCatalogOverlay(showDashboardModal);
  }

  const dashboardModalShell = useMemo(
    () => ({
      overlayOpen: showDashboardModal,
      surfaceLocation: showDashboardModal
        ? authOverlayDashboardBackground
          ? authOverlayPublicSurface
          : backgroundLocation
        : null,
    }),
    [
      showDashboardModal,
      authOverlayDashboardBackground,
      authOverlayPublicSurface,
      backgroundLocation,
    ]
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
    <Routes location={dashboardRoutesLocation}>
      <Route
        path="/dashboard-new/:tab?"
        element={
          <Suspense fallback={null}>
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
        path="/pay/status"
        element={
          <Suspense fallback={<PageLoader />}>
            <PaymentSuccess />
          </Suspense>
        }
      />
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
    <ConsentProvider>
      <PremiumSubscriptionProvider>
        <ArchiveAccessModalProvider>
          <DashboardModalShellContext.Provider value={dashboardModalShell}>
            <CurrentArtistSync />
            {/* БАЗОВЫЙ Helmet для всех страниц без собственного */}
            <Helmet>
              {/* динамический заголовок и описание */}
              <title>{seo[lang].title}</title>
              <meta name="description" content={seo[lang].desc} />
              <meta name="color-scheme" content="dark light" />
              <link rel="canonical" href={seo[lang].url} />

              {publicPageHreflangLinks(seo.hreflang)}

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
            ) : isMinimalLayoutRoute ? (
              <MinimalLayout>{mainRoutes}</MinimalLayout>
            ) : shouldHideChrome ? (
              <ErrorBoundary>
                <main>{notFoundRoutes}</main>
              </ErrorBoundary>
            ) : isHomeSceneRoute ? (
              <ErrorBoundary>
                <EmailVerificationBanner />
                <main>
                  <ErrorBoundary>{standardRoutes}</ErrorBoundary>
                </main>
                <PlayerShell />
              </ErrorBoundary>
            ) : (
              <ArtistPageAccessProvider>
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
                  <main>
                    <EmailVerificationBanner />
                    {!isHomeSceneRoute && !isLegalDocumentRoute && <Hero />}

                    {/* если поместим popup внурь header, то popup будет обрезаться из-за css-фильтра (filter) внури header */}

                    <Popup isActive={popup} onClose={() => dispatch(closePopup())}>
                      <NavPopupMenu isActive={popup} />
                    </Popup>

                    <ErrorBoundary>{standardRoutes}</ErrorBoundary>
                  </main>
                  <Footer />
                  <PlayerShell />
                </ErrorBoundary>
              </ArtistPageAccessProvider>
            )}
            <AnalyticsController />
            <EmailVerificationRefreshController />
            <SessionExpiredRedirectController />
            <PremiumEntitlementRefreshController />
            <PremiumCheckoutIntentResumeController />
            <AlbumCheckoutIntentResumeController />
            <ArtistOnboardingRedirectController />
            <ListenerWelcomeController />
            <PremiumSuccessModalController />
          </DashboardModalShellContext.Provider>
        </ArchiveAccessModalProvider>
      </PremiumSubscriptionProvider>
    </ConsentProvider>
  );
}
