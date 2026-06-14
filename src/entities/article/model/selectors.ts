/**
 * Селекторы для получения данных из Redux стейта статей.
 * Используем createSelector для мемоизации - это предотвращает лишние пересчёты и ре-рендеры.
 */
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@shared/model/appStore/types';
import type { IArticles } from '@models';

import { selectCurrentLang } from '@shared/model/lang/selectors';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { isArticlePublicOnArtistPage } from '@shared/lib/artistPageContent';
import { resolveArticleForDisplay } from '../lib/resolveArticleDisplay';

import type { ArticlesState } from './types';

export const selectArticlesState = (state: RootState): ArticlesState => state.articles;

export const selectDashboardArticlesState = createSelector(
  [selectArticlesState],
  (s) => s.dashboard
);

export const selectDashboardArticlesStatus = createSelector(
  [selectDashboardArticlesState],
  (d) => d.status
);

export const selectDashboardArticlesError = createSelector(
  [selectDashboardArticlesState],
  (d) => d.error
);

export const selectDashboardArticlesData = createSelector(
  [selectDashboardArticlesState],
  (d): IArticles[] => d.data
);

export const selectDashboardArticlesDataResolved = createSelector(
  [selectDashboardArticlesData, selectCurrentLang],
  (articles, lang): IArticles[] => articles.map((a) => resolveArticleForDisplay(a, lang))
);

export const selectArticlesStatus = createSelector([selectArticlesState], (s) => s.status);

export const selectArticlesInFlightFetchContextKey = createSelector(
  [selectArticlesState],
  (s) => s.inFlightFetchContextKey
);

export const selectArticlesError = createSelector([selectArticlesState], (s) => s.error);

export const selectArticlesData = createSelector([selectArticlesState], (s): IArticles[] => s.data);

export const selectArticlesLastPublicArtistSlug = createSelector(
  [selectArticlesState],
  (s) => s.lastPublicArtistSlug ?? ''
);

/** Кэш статей для другого ?artist= (в т.ч. после сброса data при смене slug). */
export const selectArticlesCacheIsStale = createSelector(
  [selectArticlesLastPublicArtistSlug, selectPublicArtistSlug],
  (cachedSlug, desiredSlug) => {
    const desired = desiredSlug?.trim() ?? '';
    return cachedSlug !== desired;
  }
);

/** Для отображения: строки с fallback по `state.lang.current`. */
export const selectArticlesDataResolved = createSelector(
  [selectArticlesData, selectCurrentLang],
  (articles, lang): IArticles[] => articles.map((a) => resolveArticleForDisplay(a, lang))
);

/** Публичный каталог: опубликованные и видимые статьи. */
export const selectPublicArticlesDataResolved = createSelector(
  [selectArticlesDataResolved],
  (articles): IArticles[] => articles.filter((article) => isArticlePublicOnArtistPage(article))
);

export const selectArticlesDataResolvedForSurface = createSelector(
  [selectPublicArticlesDataResolved, selectArticlesCacheIsStale],
  (articles, stale) => (stale ? [] : articles)
);

export const selectArticlesCachedRowCount = createSelector(
  [selectArticlesDataResolved],
  (articles) => articles.length
);

export const selectArticleById = createSelector(
  [selectArticlesData, (_state: RootState, articleId: string) => articleId],
  (articles, articleId) => articles.find((article) => article.articleId === articleId)
);

export const selectArticleByIdResolved = createSelector(
  [selectArticlesDataResolved, (_state: RootState, articleId: string) => articleId],
  (articles, articleId) => articles.find((article) => article.articleId === articleId)
);
