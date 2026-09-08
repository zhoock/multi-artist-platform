import catalogEn from '../../../../src/assets/help/catalog-en.json';
import catalogRu from '../../../../src/assets/help/catalog-ru.json';
import type { RouteLang } from '../../../../src/shared/lib/i18n/routeLang/supportedLangs';

type HelpCatalog = {
  categories: Array<{ slug: string }>;
  articles: Array<{ slug: string; categorySlug: string }>;
};

const CATALOGS: Record<RouteLang, HelpCatalog> = {
  ru: catalogRu as HelpCatalog,
  en: catalogEn as HelpCatalog,
};

export function isHelpCategoryValid(lang: RouteLang, categorySlug: string): boolean {
  const catalog = CATALOGS[lang];
  return catalog.categories.some((c) => c.slug === categorySlug);
}

export function isHelpArticleValid(
  lang: RouteLang,
  categorySlug: string,
  articleSlug: string
): boolean {
  const catalog = CATALOGS[lang];
  return catalog.articles.some((a) => a.categorySlug === categorySlug && a.slug === articleSlug);
}
