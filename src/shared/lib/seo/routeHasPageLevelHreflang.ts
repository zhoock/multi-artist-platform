import { matchPath } from 'react-router-dom';

/** Public routes whose page-level `<Helmet>` owns hreflang (App base Helmet must omit it). */
const PAGE_LEVEL_HREFLANG_ROUTES = [
  '/albums/:albumId',
  '/albums',
  '/articles/:articleId',
  '/articles',
  '/help/:categorySlug/:articleSlug',
  '/help/:categorySlug',
  '/help',
  '/offer',
  '/privacy',
  '/stems/mix/:mixId',
  '/stems',
] as const;

export function routeHasPageLevelHreflang(
  pathnameWithoutLang: string,
  hasArtistParam: boolean
): boolean {
  if (pathnameWithoutLang === '/' && hasArtistParam) {
    return true;
  }

  return PAGE_LEVEL_HREFLANG_ROUTES.some((path) =>
    matchPath({ path, end: true }, pathnameWithoutLang)
  );
}
