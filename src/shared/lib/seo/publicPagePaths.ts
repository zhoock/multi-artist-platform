import type { RouteLang } from '../i18n/routeLang';
import { buildLocalizedPublicPath } from '../i18n/routeLang/buildLocalizedPublicPath';
import { ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM } from '../albumCommentDeepLink';
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

/** Album page with `?comment=<uuid>` deep-link to a specific comment (preserves `?artist=`). */
export function buildPublicAlbumPagePathWithComment(
  lang: RouteLang,
  albumId: string,
  artistSlug: string,
  commentId: string
): string {
  const base = buildPublicAlbumPagePath(lang, albumId, artistSlug);
  const comment = commentId.trim();
  if (!comment) return base;
  const qIdx = base.indexOf('?');
  const pathOnly = qIdx === -1 ? base : base.slice(0, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? '' : base.slice(qIdx + 1));
  params.set(ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM, comment);
  const q = params.toString();
  return q ? `${pathOnly}?${q}` : pathOnly;
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

/** Public mixer deep-link for a specific track: `/{lang}/stems?artist=&album=&track=`. */
export function buildArtistMixerTrackPath(
  lang: RouteLang,
  artistSlug: string,
  albumId: string,
  trackId: string
): string {
  const withArtist = withPublicArtistQuery('/stems', artistSlug);
  const qMark = withArtist.indexOf('?');
  const pathOnly = qMark === -1 ? withArtist : withArtist.slice(0, qMark);
  const params = new URLSearchParams(qMark === -1 ? '' : withArtist.slice(qMark + 1));
  params.set('album', albumId.trim());
  params.set('track', trackId.trim());
  const q = params.toString();
  return buildLocalizedPublicPath(lang, q ? `${pathOnly}?${q}` : pathOnly);
}

/** Help center home: `/{lang}/help`. */
export function buildHelpHomePath(lang: RouteLang): string {
  return buildLocalizedPublicPath(lang, '/help');
}

/** Help category listing: `/{lang}/help/:categorySlug`. */
export function buildHelpCategoryPath(lang: RouteLang, categorySlug: string): string {
  return buildLocalizedPublicPath(lang, `/help/${encodeURIComponent(categorySlug.trim())}`);
}

/** Help article detail: `/{lang}/help/:categorySlug/:articleSlug`. */
export function buildHelpArticlePath(
  lang: RouteLang,
  categorySlug: string,
  articleSlug: string
): string {
  return buildLocalizedPublicPath(
    lang,
    `/help/${encodeURIComponent(categorySlug.trim())}/${encodeURIComponent(articleSlug.trim())}`
  );
}
