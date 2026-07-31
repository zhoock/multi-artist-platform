import { DEFAULT_ROUTE_LANG, type RouteLang } from '../i18n/routeLang';
import { buildPublicSiteUrl } from '../publicSiteOrigin';

export type PublicPageHreflangUrls = {
  ru: string;
  en: string;
  xDefault: string;
};

/** Absolute alternate URLs for `ru`, `en`, and `x-default` from one localized path builder. */
export function buildPublicPageHreflangUrls(
  buildLocalizedPath: (lang: RouteLang) => string
): PublicPageHreflangUrls {
  const ru = buildPublicSiteUrl(buildLocalizedPath('ru'));
  const en = buildPublicSiteUrl(buildLocalizedPath('en'));

  return {
    ru,
    en,
    xDefault: buildPublicSiteUrl(buildLocalizedPath(DEFAULT_ROUTE_LANG)),
  };
}
