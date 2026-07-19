import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { IArticles } from '@models';
import type { RootState } from '@shared/model/appStore/types';
import { buildApiUrl } from '@shared/lib/artistQuery';
import {
  fetchWithAuthSession,
  isSessionInvalidationResponse,
  SESSION_INTERRUPTED,
} from '@shared/lib/authFetch';
import { isDashboardPathname } from '@shared/lib/publicArtistContext';
import { shouldUsePublicArtistCatalogInRedux } from '@shared/lib/dashboardModalBackground';
import { selectPublicArtistSlug, setPublicArtistSlug } from '@shared/model/currentArtist';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

import { hydrateMissingRuTranslationsOnArticle } from '../lib/hydrateMissingRuTranslations';

import type { ArticlesState } from './types';

/** Ignore stale `force` responses when a newer request for the same bucket is in flight. */
let latestForceDashboardArticlesRequestId = '';
let latestForceCatalogArticlesRequestId = '';

function resolveArticlesForceRequestBucket(arg: FetchArticlesArg): 'dashboard' | 'catalog' {
  return isOwnerDashboardArticlesFetch(arg) ? 'dashboard' : 'catalog';
}

function latestForceArticlesRequestIdForBucket(bucket: 'dashboard' | 'catalog'): string {
  return bucket === 'dashboard'
    ? latestForceDashboardArticlesRequestId
    : latestForceCatalogArticlesRequestId;
}

function setLatestForceArticlesRequestIdForBucket(
  bucket: 'dashboard' | 'catalog',
  requestId: string
): void {
  if (bucket === 'dashboard') {
    latestForceDashboardArticlesRequestId = requestId;
  } else {
    latestForceCatalogArticlesRequestId = requestId;
  }
}

const initialState: ArticlesState = {
  status: 'idle',
  error: null,
  data: [],
  lastUpdated: null,
  lastPublicArtistSlug: null,
  inFlightFetchContextKey: null,
  dashboard: {
    status: 'idle',
    error: null,
    data: [],
    lastUpdated: null,
    inFlightFetchContextKey: null,
  },
};

export type FetchArticlesArg = {
  force?: boolean;
  /** Явная загрузка статей владельца в dashboard bucket (модальный кабинет). */
  ownerDashboard?: boolean;
  /** Явный slug из loader URL; иначе берётся из `currentArtist` в store */
  publicArtistSlug?: string | null;
  /** Писать в публичный каталог независимо от pathname (sync после дашборда). */
  forcePublicCatalog?: boolean;
};

function isOwnerDashboardArticlesFetch(arg: FetchArticlesArg): boolean {
  if (arg.forcePublicCatalog) return false;
  if (arg.ownerDashboard) return true;
  return isDashboardPathname() && !shouldUsePublicArtistCatalogInRedux();
}

function shouldFetchPublicArtistCatalog(arg: FetchArticlesArg): boolean {
  if (arg.forcePublicCatalog) return true;
  if (isOwnerDashboardArticlesFetch(arg)) return false;
  return shouldUsePublicArtistCatalogInRedux();
}

function shouldTreatPublicArtistArticlesAsEmpty(
  usePublicCatalog: boolean,
  resolvedSlug: string,
  status: number
): boolean {
  if (!usePublicCatalog || !resolvedSlug) return false;
  return status === 404 || status >= 500;
}

export type FetchArticlesResult = {
  articles: IArticles[];
  lastPublicArtistSlug: string | null;
  writeTarget?: 'catalog' | 'dashboard';
  staleAbort?: boolean;
};

function resolvePublicArtistSlugForFetch(arg: FetchArticlesArg, getState: () => RootState): string {
  if (arg.publicArtistSlug !== undefined && arg.publicArtistSlug !== null) {
    return String(arg.publicArtistSlug).trim();
  }
  return selectPublicArtistSlug(getState())?.trim() ?? '';
}

async function readStaticArticlesFallback(
  lang: 'en' | 'ru',
  signal: AbortSignal
): Promise<unknown[]> {
  const fallback = await fetch(`/assets/articles-${lang}.json`, { signal });
  if (!fallback || !fallback.ok) return [];

  const contentType = fallback.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return [];
  }

  const data = await fallback.json();
  return Array.isArray(data) ? data : [];
}

export const fetchArticles = createAsyncThunk<
  FetchArticlesResult,
  FetchArticlesArg,
  { rejectValue: string; state: RootState }
>(
  'articles/fetchMerged',
  async (arg, { signal, rejectWithValue, getState }) => {
    const normalize = (data: unknown[]): IArticles[] =>
      data.map((article: unknown) => {
        const a = article as Record<string, unknown>;
        if (!a || typeof a !== 'object') {
          return article as IArticles;
        }
        const base = {
          id: a.id as string | undefined,
          userId: a.userId as string | undefined,
          articleId: String(a.articleId ?? ''),
          nameArticle: String(a.nameArticle ?? ''),
          img: String(a.img ?? ''),
          date: String(a.date ?? ''),
          details: Array.isArray(a.details) ? (a.details as IArticles['details']) : [],
          description: String(a.description ?? ''),
          isDraft: (a.isDraft as boolean | undefined) ?? false,
          hasDraftChanges: (a.hasDraftChanges as boolean | undefined) ?? false,
          visibility: normalizeTrackVisibility(a.visibility),
          articleLocked:
            typeof (a as { articleLocked?: unknown }).articleLocked === 'boolean'
              ? (a as { articleLocked: boolean }).articleLocked
              : undefined,
          translations: a.translations as IArticles['translations'],
          updatedAt: a.updatedAt as string | undefined,
          lang: a.lang as IArticles['lang'],
        } as IArticles;
        return hydrateMissingRuTranslationsOnArticle(base);
      });

    try {
      const { getAuthHeader } = await import('@shared/lib/auth');
      const authHeader = getAuthHeader();
      const ownerDashboard = isOwnerDashboardArticlesFetch(arg);
      const usePublicCatalog = shouldFetchPublicArtistCatalog(arg);
      const isFullscreenDashboard = ownerDashboard;

      const resolvedSlug = usePublicCatalog ? resolvePublicArtistSlugForFetch(arg, getState) : '';

      const fallbackLang: 'en' | 'ru' = getState().lang.current === 'ru' ? 'ru' : 'en';

      const slugMeta = (rows: IArticles[]): FetchArticlesResult => ({
        articles: rows,
        lastPublicArtistSlug: usePublicCatalog ? resolvedSlug : null,
        writeTarget: usePublicCatalog ? 'catalog' : 'dashboard',
      });

      // Публичный каталог: без artist не дергаем API (инвариант), только статический fallback.
      if (usePublicCatalog && !resolvedSlug) {
        try {
          const data = await readStaticArticlesFallback(fallbackLang, signal);
          return slugMeta(normalize(data));
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.warn('[fetchArticles] Static fallback failed:', errorMessage);
          return slugMeta([]);
        }
      }

      let apiFailure: unknown = null;

      try {
        const articlesFetchInit = {
          signal,
          cache: 'no-cache' as const,
          headers: {
            'Cache-Control': 'no-cache',
            ...authHeader,
          },
        };

        const response = await fetchWithAuthSession(
          buildApiUrl(
            '/api/articles-api',
            {
              includeDrafts: isFullscreenDashboard ? true : undefined,
            },
            {
              includeArtist: usePublicCatalog,
              artistSlugOverride: usePublicCatalog ? resolvedSlug : null,
              forceArtistQuery: Boolean(arg.forcePublicCatalog),
            }
          ),
          articlesFetchInit
        );

        if (response && response.ok) {
          const payload = await response.json();
          const list = Array.isArray(payload) ? payload : (payload.data ?? payload.articles ?? []);

          if (!Array.isArray(list)) {
            throw new Error('Invalid response from API: expected array');
          }

          if (list.length === 0) {
            return slugMeta([]);
          }

          return slugMeta(normalize(list));
        } else if (
          response &&
          shouldTreatPublicArtistArticlesAsEmpty(usePublicCatalog, resolvedSlug, response.status)
        ) {
          return slugMeta([]);
        } else if (response && (await isSessionInvalidationResponse(response, articlesFetchInit))) {
          return rejectWithValue(SESSION_INTERRUPTED);
        } else {
          apiFailure = new Error(
            response
              ? `Failed to fetch articles. Status: ${response.status}`
              : 'No response from API'
          );
        }
      } catch (apiError) {
        apiFailure = apiError;
        const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
        if (isFullscreenDashboard) {
          console.warn(
            '❌ [articlesSlice] articles API failed in /dashboard; static JSON fallback is disabled',
            apiError
          );
        } else {
          console.warn('[fetchArticles] API request failed, trying static fallback:', errorMessage);
        }
      }

      if (isFullscreenDashboard) {
        if (apiFailure instanceof Error) {
          throw apiFailure;
        }
        if (apiFailure != null) {
          throw new Error(String(apiFailure));
        }
      } else {
        const data = await readStaticArticlesFallback(fallbackLang, signal);
        if (data.length > 0) return slugMeta(normalize(data));
      }

      if (apiFailure instanceof Error) {
        throw apiFailure;
      }
      throw apiFailure;
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Unknown error');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg.force) {
        return true;
      }
      const state = getState();
      const isFullscreenDashboard = isOwnerDashboardArticlesFetch(arg);
      if (isFullscreenDashboard) {
        const d = state.articles.dashboard;
        if (d.status === 'loading') return false;
        if (d.status === 'succeeded') return false;
        return true;
      }

      if (state.articles.status === 'loading') {
        return false;
      }

      const slug = resolvePublicArtistSlugForFetch(arg, getState);
      if (state.articles.status === 'succeeded') {
        const prev = state.articles.lastPublicArtistSlug ?? '';
        if (prev !== slug) {
          return true;
        }
        return false;
      }
      return true;
    },
  }
);

const articlesSlice = createSlice({
  name: 'articles',
  initialState,
  reducers: {
    resetArticlesState: () => initialState,
    patchDashboardArticleVisibility: (
      state,
      action: PayloadAction<{ articleId: string; visibility: TrackVisibility }>
    ) => {
      const { articleId, visibility } = action.payload;
      const patchList = (list: IArticles[]) => {
        const idx = list.findIndex((x) => x.articleId === articleId);
        if (idx >= 0) {
          list[idx] = { ...list[idx], visibility };
        }
      };
      patchList(state.dashboard.data);
      patchList(state.data);
    },
    removeArticleFromPublicCatalog: (state, action: PayloadAction<{ articleId: string }>) => {
      const { articleId } = action.payload;
      state.dashboard.data = state.dashboard.data.filter((x) => x.articleId !== articleId);
      state.data = state.data.filter((x) => x.articleId !== articleId);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(setPublicArtistSlug, (state, action) => {
        const desiredSlug = action.payload?.trim() ?? '';
        if ((state.lastPublicArtistSlug ?? '') === desiredSlug) return;
        state.data = [];
        state.status = 'idle';
        state.error = null;
        state.inFlightFetchContextKey = null;
      })
      .addCase(fetchArticles.pending, (state, action) => {
        if (action.meta.arg.force) {
          setLatestForceArticlesRequestIdForBucket(
            resolveArticlesForceRequestBucket(action.meta.arg),
            action.meta.requestId
          );
        }
        const isFullscreenDashboard = isOwnerDashboardArticlesFetch(action.meta.arg);
        if (isFullscreenDashboard) {
          state.dashboard.status = 'loading';
          state.dashboard.error = null;
          state.dashboard.inFlightFetchContextKey = 'dashboard';
        } else {
          state.inFlightFetchContextKey = 'public';
          state.error = null;
          const backgroundRefetch =
            Boolean(action.meta.arg.force) && state.status === 'succeeded' && state.data.length > 0;
          if (!backgroundRefetch) {
            state.status = 'loading';
          }
        }
      })
      .addCase(fetchArticles.fulfilled, (state, action) => {
        const forceBucket = resolveArticlesForceRequestBucket(action.meta.arg);
        // Устаревший force-ответ: более новый force ещё владеет inFlight/status.
        // Нельзя сбрасывать inFlight и оставлять status=loading при пустом data —
        // вкладка «Статьи» зависала на спиннере, если новый запрос потом reject'ился.
        if (
          action.meta.arg.force &&
          action.meta.requestId !== latestForceArticlesRequestIdForBucket(forceBucket) &&
          !action.payload.staleAbort
        ) {
          return;
        }
        if (action.payload.staleAbort) {
          const target = action.payload.writeTarget ?? 'catalog';
          if (
            action.meta.arg.force &&
            action.meta.requestId !== latestForceArticlesRequestIdForBucket(forceBucket)
          ) {
            return;
          }
          if (target === 'dashboard') {
            state.dashboard.inFlightFetchContextKey = null;
            if (state.dashboard.data.length > 0) {
              state.dashboard.status = 'succeeded';
            } else if (state.dashboard.status === 'loading') {
              state.dashboard.status = 'idle';
            }
          } else {
            state.inFlightFetchContextKey = null;
            if (state.data.length > 0) {
              state.status = 'succeeded';
            } else if (state.status === 'loading') {
              state.status = 'idle';
            }
          }
          return;
        }
        const { articles, lastPublicArtistSlug } = action.payload;
        const target = action.payload.writeTarget ?? 'catalog';
        if (target === 'dashboard') {
          state.dashboard.data = Array.isArray(articles) ? [...articles] : [];
          state.dashboard.status = 'succeeded';
          state.dashboard.error = null;
          state.dashboard.lastUpdated = Date.now();
          state.dashboard.inFlightFetchContextKey = null;
          return;
        }
        state.data = Array.isArray(articles) ? [...articles] : [];
        state.status = 'succeeded';
        state.error = null;
        state.lastUpdated = Date.now();
        state.lastPublicArtistSlug = lastPublicArtistSlug;
        state.inFlightFetchContextKey = null;
      })
      .addCase(fetchArticles.rejected, (state, action) => {
        const forceBucket = resolveArticlesForceRequestBucket(action.meta.arg);
        // Игнор reject от устаревшего force — иначе сбрасывали inFlight нового запроса.
        if (
          action.meta.arg.force &&
          action.meta.requestId !== latestForceArticlesRequestIdForBucket(forceBucket)
        ) {
          return;
        }

        if (action.payload === SESSION_INTERRUPTED) {
          const isDashboard = isOwnerDashboardArticlesFetch(action.meta.arg);
          if (isDashboard) {
            state.dashboard.inFlightFetchContextKey = null;
            if (state.dashboard.status === 'loading') {
              state.dashboard.status = state.dashboard.data.length > 0 ? 'succeeded' : 'idle';
            }
            state.dashboard.error = null;
          } else {
            state.inFlightFetchContextKey = null;
            if (state.status === 'loading') {
              state.status = state.data.length > 0 ? 'succeeded' : 'idle';
            }
            state.error = null;
          }
          return;
        }

        let errorText = 'Failed to fetch articles';
        if (action.payload) {
          errorText = action.payload;
        } else if (action.error) {
          if (typeof action.error === 'string') {
            errorText = action.error;
          } else if (
            action.error &&
            typeof action.error === 'object' &&
            'message' in action.error
          ) {
            errorText = (action.error as { message?: string }).message || errorText;
          }
        }

        const isDashboard = isOwnerDashboardArticlesFetch(action.meta.arg);

        if (isDashboard) {
          state.dashboard.inFlightFetchContextKey = null;
          if (state.dashboard.data.length > 0) {
            state.dashboard.status = 'succeeded';
            state.dashboard.error = null;
          } else {
            state.dashboard.status = 'failed';
            state.dashboard.error = errorText;
          }
          return;
        }

        state.inFlightFetchContextKey = null;
        if (state.data.length > 0) {
          state.status = 'succeeded';
          state.error = null;
        } else {
          state.status = 'failed';
          state.error = errorText;
        }
      });
  },
});

export const articlesReducer = articlesSlice.reducer;
export const {
  patchDashboardArticleVisibility,
  removeArticleFromPublicCatalog,
  resetArticlesState,
} = articlesSlice.actions;
