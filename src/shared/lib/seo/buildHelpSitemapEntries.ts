import type { HelpCatalog } from '@entities/help';

import type { RouteLang } from '../i18n/routeLang';
import type { SitemapEntry } from './generateSitemap';
import { formatSitemapLastmod } from './generateSitemap';
import { buildHelpArticlePath, buildHelpCategoryPath, buildHelpHomePath } from './publicPagePaths';

/** Builds localized sitemap rows for the help center from a loaded catalog. */
export function buildHelpSitemapEntries(
  catalog: HelpCatalog,
  meta: Omit<SitemapEntry, 'path'> = { priority: '0.4', changefreq: 'monthly' }
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const lang of ['en', 'ru'] as const satisfies RouteLang[]) {
    entries.push({
      path: buildHelpHomePath(lang),
      ...meta,
    });

    for (const category of catalog.categories) {
      entries.push({
        path: buildHelpCategoryPath(lang, category.slug),
        ...meta,
      });
    }

    for (const article of catalog.articles) {
      entries.push({
        path: buildHelpArticlePath(lang, article.categorySlug, article.slug),
        lastmod: formatSitemapLastmod(article.updatedAt),
        ...meta,
      });
    }
  }

  return entries;
}
