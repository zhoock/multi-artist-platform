import type { RouteLang } from './supportedLangs';
import { withLangPrefix } from './withLangPrefix';

/**
 * Builds a locale-prefixed public app path (`/ru/albums`, `/en?artist=slug`).
 * Pure function — pass `lang` explicitly (no Redux / hooks).
 */
export function buildLocalizedPublicPath(lang: RouteLang, path: string): string {
  return withLangPrefix(lang, path);
}
