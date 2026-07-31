import { parseLangFromPath } from './parseLangFromPath';
import type { RouteLang } from './supportedLangs';

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');

  let cutIndex = path.length;
  if (queryIndex !== -1) cutIndex = Math.min(cutIndex, queryIndex);
  if (hashIndex !== -1) cutIndex = Math.min(cutIndex, hashIndex);

  if (cutIndex === path.length) {
    return { pathname: path, suffix: '' };
  }

  return {
    pathname: path.slice(0, cutIndex),
    suffix: path.slice(cutIndex),
  };
}

/**
 * Builds a locale-prefixed public path.
 *
 * - `/albums` + `en` → `/en/albums`
 * - `/?artist=slug` + `ru` → `/ru?artist=slug`
 * - Replaces an existing `/ru` or `/en` prefix when present.
 * - Preserves query string and hash suffixes.
 */
export function withLangPrefix(lang: RouteLang, path: string): string {
  const { pathname, suffix } = splitPathSuffix(path);
  const withoutLang = parseLangFromPath(pathname).pathnameWithoutLang;

  if (withoutLang === '/') {
    return `/${lang}${suffix}`;
  }

  return `/${lang}${withoutLang}${suffix}`;
}
