import type { HelpCatalog } from '../../../src/entities/help/model/types';
import { buildHelpSitemapEntries } from '../../../src/shared/lib/seo/buildHelpSitemapEntries';

import catalogEn from '../../../src/assets/help/catalog-en.json';

/** Static help URLs for sitemap.xml (catalog slugs are shared across locales). */
export function fetchHelpSitemapEntries() {
  return buildHelpSitemapEntries(catalogEn as HelpCatalog);
}
