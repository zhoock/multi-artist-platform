import { withPublicArtistQuery } from '../artistQuery';
import { buildArtistPageCanonicalPath } from '../../constants/platformBranding';

/** Public artist hub: `/?artist=<slug>`. */
export function buildArtistPagePath(artistSlug: string): string {
  return buildArtistPageCanonicalPath(artistSlug);
}

/** Artist-scoped album catalog: `/albums?artist=<slug>`. */
export function buildArtistAlbumsCatalogPath(artistSlug: string): string {
  return withPublicArtistQuery('/albums', artistSlug);
}

/** Artist-scoped article catalog: `/articles?artist=<slug>`. */
export function buildArtistArticlesCatalogPath(artistSlug: string): string {
  return withPublicArtistQuery('/articles', artistSlug);
}

/** Public album detail: `/albums/:albumId?artist=<slug>`. */
export function buildPublicAlbumPagePath(albumId: string, artistSlug: string): string {
  return withPublicArtistQuery(`/albums/${encodeURIComponent(albumId.trim())}`, artistSlug.trim());
}

/** Public article detail: `/articles/:articleId?artist=<slug>`. */
export function buildPublicArticlePagePath(articleId: string, artistSlug?: string | null): string {
  return withPublicArtistQuery(`/articles/${encodeURIComponent(articleId.trim())}`, artistSlug);
}
