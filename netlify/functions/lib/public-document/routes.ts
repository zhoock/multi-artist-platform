/**
 * Document route classification for SEO-006 public-document gate.
 * Mirrors App.tsx knownRoutes + internal unprefixed routes (dashboard, auth, pay).
 */

import { parseLangFromPath } from '../../../../src/shared/lib/i18n/routeLang/parseLangFromPath';
import type { RouteLang } from '../../../../src/shared/lib/i18n/routeLang/supportedLangs';

export type DocumentRoute =
  | { type: 'fast200' }
  | { type: 'artistRequired'; artistSlug: string }
  | { type: 'albumDetail'; albumId: string; artistSlug: string }
  | { type: 'albumDetailNoArtist'; albumId: string }
  | { type: 'articleDetail'; articleId: string; artistSlug: string | null }
  | { type: 'helpCategory'; categorySlug: string; lang: RouteLang }
  | { type: 'helpArticle'; categorySlug: string; articleSlug: string; lang: RouteLang }
  | { type: 'unknown' };

const PAYMENT_PATHS = new Set([
  '/pay/status',
  '/pay/success',
  '/pay/fail',
  '/pay/subscription-success',
]);

const INTERNAL_PREFIXES = [
  '/dashboard',
  '/auth',
  '/email-verified',
  '/email-verification-expired',
] as const;

/** App.tsx known public paths (without locale prefix). */
const PUBLIC_FAST_PATHS = new Set(['/offer', '/privacy', '/help']);

function isInternalUnprefixed(path: string): boolean {
  if (PAYMENT_PATHS.has(path) || path.startsWith('/pay/')) {
    return true;
  }
  return INTERNAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function matchSegments(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    const segment = pathParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = segment;
    } else if (part !== segment) {
      return null;
    }
  }
  return params;
}

export function classifyDocumentRoute(
  pathname: string,
  artistQuery: string | null | undefined
): DocumentRoute {
  const normalized = pathname.trim() || '/';
  const { lang, pathnameWithoutLang: path } = parseLangFromPath(normalized);
  const artist = artistQuery?.trim() ?? '';

  if (lang === null) {
    if (path === '/' || path === '/help') {
      return { type: 'fast200' };
    }
    if (isInternalUnprefixed(path)) {
      return { type: 'fast200' };
    }
    return { type: 'unknown' };
  }

  if (isInternalUnprefixed(path)) {
    return { type: 'fast200' };
  }

  if (path === '/') {
    if (artist) {
      return { type: 'artistRequired', artistSlug: artist };
    }
    return { type: 'fast200' };
  }

  if (PUBLIC_FAST_PATHS.has(path)) {
    return { type: 'fast200' };
  }

  if (path === '/albums') {
    if (artist) {
      return { type: 'artistRequired', artistSlug: artist };
    }
    return { type: 'fast200' };
  }

  const albumMatch = matchSegments(path, '/albums/:albumId');
  if (albumMatch) {
    const albumId = albumMatch.albumId;
    if (artist) {
      return { type: 'albumDetail', albumId, artistSlug: artist };
    }
    return { type: 'albumDetailNoArtist', albumId };
  }

  if (path === '/articles') {
    if (artist) {
      return { type: 'artistRequired', artistSlug: artist };
    }
    return { type: 'fast200' };
  }

  const articleMatch = matchSegments(path, '/articles/:articleId');
  if (articleMatch) {
    return {
      type: 'articleDetail',
      articleId: articleMatch.articleId,
      artistSlug: artist || null,
    };
  }

  if (path === '/stems') {
    if (artist) {
      return { type: 'artistRequired', artistSlug: artist };
    }
    return { type: 'fast200' };
  }

  const stemsMixMatch = matchSegments(path, '/stems/mix/:mixId');
  if (stemsMixMatch) {
    if (artist) {
      return { type: 'artistRequired', artistSlug: artist };
    }
    return { type: 'fast200' };
  }

  if (path === '/help') {
    return { type: 'fast200' };
  }

  const helpArticleMatch = matchSegments(path, '/help/:categorySlug/:articleSlug');
  if (helpArticleMatch) {
    return {
      type: 'helpArticle',
      categorySlug: helpArticleMatch.categorySlug,
      articleSlug: helpArticleMatch.articleSlug,
      lang,
    };
  }

  const helpCategoryMatch = matchSegments(path, '/help/:categorySlug');
  if (helpCategoryMatch) {
    return {
      type: 'helpCategory',
      categorySlug: helpCategoryMatch.categorySlug,
      lang,
    };
  }

  return { type: 'unknown' };
}

/** True when path looks like a static asset extension (missing file fallback). */
export function isStaticAssetPath(pathname: string): boolean {
  const path = pathname.split('?')[0]?.split('#')[0] ?? '';
  return /\.(js|css|map|json|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|mp3|wav|flac|m4a|ogg|opus|zip|txt|xml)$/i.test(
    path
  );
}
