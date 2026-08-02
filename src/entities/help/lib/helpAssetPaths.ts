import type { SupportedLang } from '@shared/model/lang';

import type { HelpArticleSlug } from '../model/types';

/** Relative path under `/assets` for the help catalog index. */
export function helpCatalogAssetPath(lang: SupportedLang): string {
  return `help/catalog-${lang}.json`;
}

/** Relative path under `/assets` for a single help article body. */
export function helpArticleAssetPath(slug: HelpArticleSlug, lang: SupportedLang): string {
  return `help/articles/${slug}-${lang}.json`;
}
