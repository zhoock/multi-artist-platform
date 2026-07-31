import { parseLangFromPath } from './parseLangFromPath';

/**
 * Removes a leading `/ru` or `/en` segment from a pathname.
 * Unprefixed paths are returned unchanged (aside from normalization).
 */
export function stripLangPrefix(pathname: string): string {
  return parseLangFromPath(pathname).pathnameWithoutLang;
}
