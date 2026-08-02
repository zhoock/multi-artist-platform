import { isRouteLang, type RouteLang } from './supportedLangs';

export type ParsedLangPath = {
  /** Locale from the first pathname segment, or null when the path is not prefixed. */
  lang: RouteLang | null;
  /** Pathname with the locale segment removed; always starts with `/`. */
  pathnameWithoutLang: string;
};

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Parses a locale prefix from a pathname (`/en/albums` → `{ lang: 'en', pathnameWithoutLang: '/albums' }`).
 *
 * Does not read query or hash — pass `location.pathname` only.
 * Unprefixed paths (`/albums`, `/dashboard`) return `lang: null`.
 */
export function parseLangFromPath(pathname: string): ParsedLangPath {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { lang: null, pathnameWithoutLang: '/' };
  }

  const first = segments[0];
  if (isRouteLang(first)) {
    const rest = segments.slice(1);
    return {
      lang: first,
      pathnameWithoutLang: rest.length === 0 ? '/' : `/${rest.join('/')}`,
    };
  }

  return { lang: null, pathnameWithoutLang: normalized };
}
