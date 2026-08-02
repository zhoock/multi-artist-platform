import { matchPath } from 'react-router-dom';

import { stripLangPrefix } from '@shared/lib/i18n/routeLang';

export const HELP_HOME_ROUTE = '/help';
export const HELP_CATEGORY_ROUTE = '/help/:categorySlug';
export const HELP_ARTICLE_ROUTE = '/help/:categorySlug/:articleSlug';

export type HelpArticleRouteParams = {
  categorySlug: string;
  articleSlug: string;
};

export function isHelpLoaderPath(pathname: string): boolean {
  const path = stripLangPrefix(pathname);
  return path === HELP_HOME_ROUTE || path.startsWith(`${HELP_HOME_ROUTE}/`);
}

export function parseHelpArticleParamsFromPath(pathname: string): HelpArticleRouteParams | null {
  const path = stripLangPrefix(pathname);
  const match = matchPath({ path: HELP_ARTICLE_ROUTE, end: true }, path);
  const categorySlug = match?.params.categorySlug;
  const articleSlug = match?.params.articleSlug;
  if (!categorySlug || !articleSlug) {
    return null;
  }
  return { categorySlug, articleSlug };
}

/** @deprecated Prefer {@link parseHelpArticleParamsFromPath}. */
export function parseHelpArticleSlugFromPath(pathname: string): string | null {
  return parseHelpArticleParamsFromPath(pathname)?.articleSlug ?? null;
}

export function parseHelpCategorySlugFromPath(pathname: string): string | null {
  const path = stripLangPrefix(pathname);
  if (parseHelpArticleParamsFromPath(pathname)) {
    return null;
  }
  const match = matchPath({ path: HELP_CATEGORY_ROUTE, end: true }, path);
  return match?.params.categorySlug ?? null;
}
