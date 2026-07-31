import type { RouteLang } from '../i18n/routeLang';
import { buildLocalizedPublicPath } from '../i18n/routeLang/buildLocalizedPublicPath';
import { withPublicArtistQuery } from '../publicArtistQueryLink';

/** Localized public path, optionally preserving `?artist=` context. */
export function buildLocalizedPublicPathWithArtist(
  lang: RouteLang,
  path: string,
  artistSlug?: string | null
): string {
  return buildLocalizedPublicPath(lang, withPublicArtistQuery(path, artistSlug));
}

function artistHubPathSegment(artistSlug: string): string {
  return withPublicArtistQuery('/', artistSlug);
}

function artistAlbumsCatalogSegment(artistSlug: string): string {
  return withPublicArtistQuery('/albums', artistSlug);
}

function artistArticlesCatalogSegment(artistSlug: string): string {
  return withPublicArtistQuery('/articles', artistSlug);
}

function publicAlbumPathSegment(albumId: string, artistSlug: string): string {
  return withPublicArtistQuery(`/albums/${encodeURIComponent(albumId.trim())}`, artistSlug.trim());
}

function publicArticlePathSegment(articleId: string, artistSlug?: string | null): string {
  return withPublicArtistQuery(`/articles/${encodeURIComponent(articleId.trim())}`, artistSlug);
}

function sharedMixPathSegment(mixId: string): string {
  return `/stems/mix/${encodeURIComponent(mixId.trim())}`;
}

/** Public artist hub: `/{lang}?artist=<slug>`. */
export function buildArtistPagePath(lang: RouteLang, artistSlug: string): string {
  return buildLocalizedPublicPath(lang, artistHubPathSegment(artistSlug));
}

/** Artist-scoped album catalog: `/{lang}/albums?artist=<slug>`. */
export function buildArtistAlbumsCatalogPath(lang: RouteLang, artistSlug: string): string {
  return buildLocalizedPublicPath(lang, artistAlbumsCatalogSegment(artistSlug));
}

/** Artist-scoped article catalog: `/{lang}/articles?artist=<slug>`. */
export function buildArtistArticlesCatalogPath(lang: RouteLang, artistSlug: string): string {
  return buildLocalizedPublicPath(lang, artistArticlesCatalogSegment(artistSlug));
}

/** Public album detail: `/{lang}/albums/:albumId?artist=<slug>`. */
export function buildPublicAlbumPagePath(
  lang: RouteLang,
  albumId: string,
  artistSlug: string
): string {
  return buildLocalizedPublicPath(lang, publicAlbumPathSegment(albumId, artistSlug));
}

/** Public article detail: `/{lang}/articles/:articleId?artist=<slug>`. */
export function buildPublicArticlePagePath(
  lang: RouteLang,
  articleId: string,
  artistSlug?: string | null
): string {
  return buildLocalizedPublicPath(lang, publicArticlePathSegment(articleId, artistSlug));
}

/** Shared stems mix preset: `/{lang}/stems/mix/:mixId`. */
export function buildSharedMixPagePath(lang: RouteLang, mixId: string): string {
  return buildLocalizedPublicPath(lang, sharedMixPathSegment(mixId));
}
