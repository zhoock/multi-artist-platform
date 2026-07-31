/**
 * Supported locale segments for public URL routing (`/ru/*`, `/en/*`).
 * Kept in sync with UI `SupportedLang` (`'ru' | 'en'`).
 */

export const SUPPORTED_LANGS = ['ru', 'en'] as const;

export type RouteLang = (typeof SUPPORTED_LANGS)[number];

/** Default locale for x-default hreflang and unprefixed redirects (Phase 1+). */
export const DEFAULT_ROUTE_LANG: RouteLang = 'ru';

export function isRouteLang(value: string): value is RouteLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}
