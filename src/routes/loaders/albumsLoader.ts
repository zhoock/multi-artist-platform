// src/routes/loaders/albumsLoader.ts
import type { LoaderFunctionArgs } from 'react-router';
import { matchPath } from 'react-router-dom';
import type { AlbumEditable, IArticles, IInterface } from '@models';
import { getStore } from '@shared/model/appStore';
import { setPublicArtistSlug } from '@shared/model/currentArtist';
import { selectCurrentLang } from '@shared/model/lang';
import {
  fetchArticles,
  selectArticlesState,
  selectArticlesStatus,
  selectArticlesData,
} from '@entities/article';
import {
  fetchDashboardAlbums,
  fetchAlbumDetailsPage,
  fetchArtistAlbumCatalog,
  buildAlbumDetailsFetchContextKey,
  selectAlbumDetailsStatus,
  selectAlbumDetailsFetchContextKey,
  selectAlbumDetailsData,
} from '@entities/album';
import {
  fetchHelpArticles,
  selectHelpArticlesStatus,
  selectHelpArticlesData,
} from '@entities/helpArticle';
import {
  fetchUiDictionary,
  selectUiDictionaryStatus,
  selectUiDictionaryData,
} from '@shared/model/uiDictionary';
import { resolveDashboardModalBackgroundForLoader } from '@shared/lib/dashboardModalBackground';
import { prefetchPublicProfileForDisplay } from '@shared/lib/profileDisplayName';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';
import { prefetchPublicArtists } from '@shared/lib/publicArtistsCache';

/**
 * createAsyncThunk: при `condition` → false unwrap() отклоняет plain object
 * `{ name: 'ConditionError' }`, не Error — иначе получаем unhandledrejection «[object Object]».
 */
function isAbortLikeOrConditionSkipError(error: unknown): boolean {
  if (error === 'AbortError' || error === 'Aborted') return true;
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  const name = (error as { name?: string }).name;
  return name === 'AbortError' || name === 'ConditionError';
}

/** Deferred loader promises are not consumed; avoid unhandled rejections after Redux settles. */
function unwrapLoaderAlbumsPromise(
  fetchThunkPromise: { unwrap: () => Promise<{ albums: AlbumEditable[] }> },
  fallback: AlbumEditable[]
): Promise<AlbumEditable[]> {
  const createNeverResolvingPromise = () => new Promise<AlbumEditable[]>(() => {});

  return fetchThunkPromise
    .unwrap()
    .then((payload) => payload.albums)
    .catch((error) => {
      if (isAbortLikeOrConditionSkipError(error)) {
        return createNeverResolvingPromise();
      }
      return fallback;
    });
}

function unwrapLoaderArticlesPromise(
  fetchThunkPromise: { unwrap: () => Promise<{ articles: IArticles[] }> },
  fallback: IArticles[]
): Promise<IArticles[]> {
  const createNeverResolvingPromise = () => new Promise<IArticles[]>(() => {});

  return fetchThunkPromise
    .unwrap()
    .then((payload) => payload.articles)
    .catch((error) => {
      if (isAbortLikeOrConditionSkipError(error)) {
        return createNeverResolvingPromise();
      }
      return fallback;
    });
}

function unwrapLoaderDictionaryPromise(
  fetchThunkPromise: { unwrap: () => Promise<IInterface[]> },
  fallback: IInterface[]
): Promise<IInterface[]> {
  const createNeverResolvingPromise = () => new Promise<IInterface[]>(() => {});

  return fetchThunkPromise.unwrap().catch((error) => {
    if (isAbortLikeOrConditionSkipError(error)) {
      return createNeverResolvingPromise();
    }
    return fallback;
  });
}

function unwrapLoaderHelpArticlesPromise(
  fetchThunkPromise: { unwrap: () => Promise<IArticles[]> },
  fallback: IArticles[]
): Promise<IArticles[]> {
  const createNeverResolvingPromise = () => new Promise<IArticles[]>(() => {});

  return fetchThunkPromise.unwrap().catch((error) => {
    if (isAbortLikeOrConditionSkipError(error)) {
      return createNeverResolvingPromise();
    }
    return fallback;
  });
}

export type AlbumsDeferred = {
  templateA: Promise<AlbumEditable[]>; // альбомы
  templateB: Promise<IArticles[]>; // статьи
  templateC: Promise<IInterface[]>; // UI-словарь – грузим ВСЕГДА
  templateD: Promise<IArticles[]>; // статьи помощи
  lang: string;
};

/**
 * Публичный thin-каталог грузит surface (HomePage / AllAlbumsPage / Mixer), не loader.
 * Loader не должен `dispatch(fetchDashboardAlbums)` на этих маршрутах — иначе снова
 * тянется полный монолит. `/albums/:albumId` — AlbumDetails; `/stems` — thin + AlbumDetails.
 */
export function shouldDeferPublicArtistCatalogToSurface(
  loaderPathname: string,
  publicArtistFromUrl: string
): boolean {
  if (!publicArtistFromUrl.trim()) return false;
  if (loaderPathname === '/' || loaderPathname === '/en' || loaderPathname === '/en/') {
    return true;
  }
  if (isStemsLoaderPath(loaderPathname)) return true;
  return (
    loaderPathname === '/albums' ||
    loaderPathname === '/albums/' ||
    loaderPathname === '/en/albums' ||
    loaderPathname === '/en/albums/'
  );
}

/** Single album page — mid-weight AlbumDetails, not fat `/api/albums`. */
export function isAlbumDetailLoaderPath(loaderPathname: string): boolean {
  return Boolean(
    matchPath({ path: '/albums/:albumId', end: true }, loaderPathname) ||
      matchPath({ path: '/en/albums/:albumId', end: true }, loaderPathname)
  );
}

/** Mixer — thin CatalogAlbum + lazy AlbumDetails; never fat `/api/albums`. */
export function isStemsLoaderPath(loaderPathname: string): boolean {
  return /^\/(?:en\/)?stems(?:\/|$)/.test(loaderPathname);
}

export async function albumsLoader({ request }: LoaderFunctionArgs): Promise<AlbumsDeferred> {
  const { signal, url } = request;
  const requestUrl = new URL(url);
  const { pathname } = requestUrl;
  const requestIsDashboard = pathname.startsWith('/dashboard');
  const { pathname: loaderPathname, search: loaderSearch } =
    resolveDashboardModalBackgroundForLoader(pathname, requestUrl.search);
  const loaderSearchParams = new URLSearchParams(
    loaderSearch.startsWith('?') ? loaderSearch.slice(1) : loaderSearch
  );
  const store = getStore();
  const publicArtistFromUrl = loaderSearchParams.get('artist')?.trim() ?? '';
  // На auth-оверлее (/auth*) не трогаем publicArtistSlug: модалка рендерится поверх underlying-страницы,
  // а её artist-контекст должен сохраниться, иначе кэш альбомов становится stale и при закрытии модалки
  // underlying-страница мигает skeleton'ом.
  if (!isAuthOverlayPathname(pathname)) {
    store.dispatch(setPublicArtistSlug(publicArtistFromUrl || null));
  }
  const state = store.getState();
  const lang = selectCurrentLang(state);

  prefetchPublicArtists();
  if (publicArtistFromUrl) {
    prefetchPublicProfileForDisplay(lang, publicArtistFromUrl);
  }

  // СЛОВАРЬ НУЖЕН ВЕЗДЕ: шапка, меню, футер, aboutus и т.д.
  let templateC: Promise<IInterface[]>;
  const uiStatus = selectUiDictionaryStatus(state, lang);
  if (uiStatus === 'succeeded') {
    templateC = Promise.resolve(selectUiDictionaryData(state, lang));
  } else if (uiStatus === 'loading') {
    // Данные уже загружаются - возвращаем текущие данные или пустой массив
    // Это предотвращает зацикливание, когда loader вызывается повторно во время загрузки
    const currentData = selectUiDictionaryData(state, lang);
    templateC = Promise.resolve(currentData || []);
  } else {
    const fetchThunkPromise = store.dispatch(fetchUiDictionary({ lang }));

    const createNeverResolvingPromise = () => new Promise<IInterface[]>(() => {});

    if (signal.aborted) {
      fetchThunkPromise.abort();
      templateC = createNeverResolvingPromise();
    } else {
      const abortHandler = () => {
        fetchThunkPromise.abort();
      };
      signal.addEventListener('abort', abortHandler, { once: true });

      templateC = unwrapLoaderDictionaryPromise(fetchThunkPromise, []);
    }
  }

  // По умолчанию — пустые промисы, чтобы типы были стабильными
  let templateA: Promise<AlbumEditable[]> = Promise.resolve([]);
  let templateB: Promise<IArticles[]> = Promise.resolve([]);
  let templateD: Promise<IArticles[]> = Promise.resolve([]); // help articles

  // Альбомы нужны на "/", "/albums*", "/stems" (миксер) и "/dashboard*" (включая /dashboard-new)
  if (
    requestIsDashboard ||
    loaderPathname === '/' ||
    loaderPathname.startsWith('/albums') ||
    loaderPathname.startsWith('/stems')
  ) {
    if (requestIsDashboard) {
      const dash = state.albums.dashboard;
      const status = dash.status;
      const albumsCacheValid = status === 'succeeded';

      if (albumsCacheValid) {
        templateA = Promise.resolve(dash.data);
      } else if (status === 'loading') {
        templateA = Promise.resolve(dash.data.length > 0 ? dash.data : []);
      } else {
        const fetchThunkPromise = store.dispatch(
          fetchDashboardAlbums({ force: status === 'failed', ownerDashboard: true })
        );

        const createNeverResolvingPromise = () => new Promise<AlbumEditable[]>(() => {});

        if (signal.aborted) {
          fetchThunkPromise.abort();
          templateA = createNeverResolvingPromise();
        } else {
          const abortHandler = () => {
            fetchThunkPromise.abort();
          };
          signal.addEventListener('abort', abortHandler, { once: true });

          templateA = unwrapLoaderAlbumsPromise(
            fetchThunkPromise,
            dash.data.length > 0 ? dash.data : []
          );
        }
      }
    } else if (isStemsLoaderPath(loaderPathname)) {
      // Mixer: thin catalog (+ AlbumDetails on select). Never fat `/api/albums`.
      templateA = Promise.resolve([]);
      if (publicArtistFromUrl) {
        const fetchThunkPromise = store.dispatch(
          fetchArtistAlbumCatalog({ publicArtistSlug: publicArtistFromUrl })
        );
        if (signal.aborted) {
          fetchThunkPromise.abort();
        } else {
          const abortHandler = () => {
            fetchThunkPromise.abort();
          };
          signal.addEventListener('abort', abortHandler, { once: true });
          void fetchThunkPromise.unwrap().catch(() => undefined);
        }
      }
    } else if (isAlbumDetailLoaderPath(loaderPathname)) {
      // Album page: AlbumDetails only — never fat public catalog.
      templateA = Promise.resolve([]);

      const routeAlbumId =
        matchPath(
          { path: '/albums/:albumId', end: true },
          loaderPathname
        )?.params.albumId?.trim() ??
        matchPath(
          { path: '/en/albums/:albumId', end: true },
          loaderPathname
        )?.params.albumId?.trim() ??
        '';

      if (publicArtistFromUrl && routeAlbumId) {
        const desiredKey = buildAlbumDetailsFetchContextKey(publicArtistFromUrl, routeAlbumId);
        const detailsStatus = selectAlbumDetailsStatus(state);
        const detailsKey = selectAlbumDetailsFetchContextKey(state);
        const detailsData = selectAlbumDetailsData(state);
        const detailsCacheValid =
          detailsStatus === 'succeeded' &&
          detailsKey === desiredKey &&
          detailsData?.albumId === routeAlbumId;

        if (!detailsCacheValid && detailsStatus !== 'loading') {
          const fetchThunkPromise = store.dispatch(
            fetchAlbumDetailsPage({
              artistSlug: publicArtistFromUrl,
              albumId: routeAlbumId,
              force: detailsStatus === 'failed',
            })
          );

          if (signal.aborted) {
            fetchThunkPromise.abort();
          } else {
            const abortHandler = () => {
              fetchThunkPromise.abort();
            };
            signal.addEventListener('abort', abortHandler, { once: true });
            void fetchThunkPromise.unwrap().catch(() => undefined);
          }
        }
      }
    } else {
      // Home / All Albums / other public: thin CatalogAlbum on the surface — never fat.
      templateA = Promise.resolve([]);
      if (
        publicArtistFromUrl &&
        shouldDeferPublicArtistCatalogToSurface(loaderPathname, publicArtistFromUrl)
      ) {
        const fetchThunkPromise = store.dispatch(
          fetchArtistAlbumCatalog({ publicArtistSlug: publicArtistFromUrl })
        );
        if (signal.aborted) {
          fetchThunkPromise.abort();
        } else {
          const abortHandler = () => {
            fetchThunkPromise.abort();
          };
          signal.addEventListener('abort', abortHandler, { once: true });
          // Surface also force-fetches; loader prefetch is best-effort.
          void fetchThunkPromise.unwrap().catch(() => undefined);
        }
      }
    }
  }

  // Статьи нужны на "/" (главная) и "/articles*"
  if (loaderPathname === '/' || loaderPathname.startsWith('/articles')) {
    const publicArtistSlug = publicArtistFromUrl;

    if (requestIsDashboard) {
      const articlesState = selectArticlesState(state);
      const dash = articlesState.dashboard;
      const status = dash.status;
      const cacheOk = status === 'succeeded';

      if (cacheOk) {
        templateB = Promise.resolve(dash.data);
      } else if (status === 'loading') {
        templateB = Promise.resolve(dash.data.length > 0 ? dash.data : []);
      } else {
        const fetchThunkPromise = store.dispatch(
          fetchArticles({
            force: status === 'failed',
            publicArtistSlug,
          })
        );

        const createNeverResolvingPromise = () => new Promise<IArticles[]>(() => {});

        if (signal.aborted) {
          fetchThunkPromise.abort();
          templateB = createNeverResolvingPromise();
        } else {
          const abortHandler = () => {
            fetchThunkPromise.abort();
          };
          signal.addEventListener('abort', abortHandler, { once: true });

          templateB = unwrapLoaderArticlesPromise(
            fetchThunkPromise,
            dash.data.length > 0 ? dash.data : []
          );
        }
      }
    } else {
      const articlesState = selectArticlesState(state);
      const status = articlesState.status;
      const cacheOk =
        status === 'succeeded' && (articlesState.lastPublicArtistSlug ?? '') === publicArtistSlug;

      const deferArticlesToSurface = shouldDeferPublicArtistCatalogToSurface(
        loaderPathname,
        publicArtistSlug
      );

      // `/?artist=`: статьи тоже только из HomePage — без параллельного loader fetch.
      if (deferArticlesToSurface) {
        templateB = Promise.resolve(selectArticlesData(state));
      } else if (cacheOk) {
        templateB = Promise.resolve(selectArticlesData(state));
      } else {
        const fetchThunkPromise = store.dispatch(
          fetchArticles({
            force: status === 'loading',
            publicArtistSlug,
          })
        );

        const createNeverResolvingPromise = () => new Promise<IArticles[]>(() => {});

        if (signal.aborted) {
          fetchThunkPromise.abort();
          templateB = createNeverResolvingPromise();
        } else {
          const abortHandler = () => {
            fetchThunkPromise.abort();
          };
          signal.addEventListener('abort', abortHandler, { once: true });

          templateB = unwrapLoaderArticlesPromise(fetchThunkPromise, selectArticlesData(state));
        }
      }
    }
  }

  // Статьи помощи нужны на "/help/articles*"
  if (loaderPathname.startsWith('/help/articles')) {
    const status = selectHelpArticlesStatus(state, lang);
    if (status === 'succeeded') {
      templateD = Promise.resolve(selectHelpArticlesData(state, lang));
    } else if (status === 'loading') {
      // Данные уже загружаются - возвращаем текущие данные или пустой массив
      // Это предотвращает зацикливание, когда loader вызывается повторно во время загрузки
      const currentData = selectHelpArticlesData(state, lang);
      templateD = Promise.resolve(currentData || []);
    } else {
      const fetchThunkPromise = store.dispatch(fetchHelpArticles({ lang }));

      const createNeverResolvingPromise = () => new Promise<IArticles[]>(() => {});

      if (signal.aborted) {
        fetchThunkPromise.abort();
        templateD = createNeverResolvingPromise();
      } else {
        const abortHandler = () => {
          fetchThunkPromise.abort();
        };
        signal.addEventListener('abort', abortHandler, { once: true });

        templateD = unwrapLoaderHelpArticlesPromise(fetchThunkPromise, []);
      }
    }
  }

  return { templateA, templateB, templateC, templateD, lang };
}
