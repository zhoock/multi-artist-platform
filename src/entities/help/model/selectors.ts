import type { RootState } from '@shared/model/appStore/types';
import type { SupportedLang } from '@shared/model/lang';

import type { HelpArticleSlug, HelpCategorySlug } from './types';

export const selectHelpCatalogStatus = (state: RootState, lang: SupportedLang) =>
  state.help[lang].catalog.status;

export const selectHelpCatalogError = (state: RootState, lang: SupportedLang) =>
  state.help[lang].catalog.error;

export const selectHelpCatalog = (state: RootState, lang: SupportedLang) =>
  state.help[lang].catalog.data;

export const selectHelpCategories = (state: RootState, lang: SupportedLang) =>
  state.help[lang].catalog.data?.categories ?? [];

export const selectHelpArticleSummaries = (state: RootState, lang: SupportedLang) =>
  state.help[lang].catalog.data?.articles ?? [];

export const selectHelpCategoryBySlug = (
  state: RootState,
  lang: SupportedLang,
  categorySlug: HelpCategorySlug
) => selectHelpCategories(state, lang).find((category) => category.slug === categorySlug) ?? null;

export const selectHelpArticlesInCategory = (
  state: RootState,
  lang: SupportedLang,
  categorySlug: HelpCategorySlug
) =>
  selectHelpArticleSummaries(state, lang)
    .filter((article) => article.categorySlug === categorySlug)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

export const selectHelpArticleEntry = (
  state: RootState,
  lang: SupportedLang,
  slug: HelpArticleSlug
) => state.help[lang].articlesBySlug[slug] ?? null;

export const selectHelpArticleBySlug = (
  state: RootState,
  lang: SupportedLang,
  slug: HelpArticleSlug
) => selectHelpArticleEntry(state, lang, slug)?.data ?? null;

export const selectHelpArticleSummaryBySlug = (
  state: RootState,
  lang: SupportedLang,
  slug: HelpArticleSlug
) => selectHelpArticleSummaries(state, lang).find((article) => article.slug === slug) ?? null;
