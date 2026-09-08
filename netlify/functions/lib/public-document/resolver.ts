/**
 * Anonymous document access checks — reuses existing public resolvers / visibility rules.
 */

import { query } from '../db';
import {
  PublicArtistResolverError,
  fetchPublicArtistProfileBySlug,
  resolvePublicArtistUserId,
} from '../public-artist-resolver';
import { normalizeTrackVisibility } from '../../../../src/shared/lib/tracks/trackVisibility';
import { isHelpArticleValid, isHelpCategoryValid } from './help-catalog';
import type { DocumentRoute } from './routes';

interface AlbumLocaleRow {
  album: string | null;
  is_public: boolean;
  is_published: boolean;
}

interface TrackCountRow {
  count: string;
}

export async function artistSlugExists(slug: string): Promise<boolean> {
  try {
    await fetchPublicArtistProfileBySlug(slug);
    return true;
  } catch (error) {
    if (error instanceof PublicArtistResolverError && error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function resolveArtistUserId(slug: string): Promise<string | null> {
  try {
    return await resolvePublicArtistUserId(slug);
  } catch (error) {
    if (error instanceof PublicArtistResolverError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

function pickAlbumTitle(rows: AlbumLocaleRow[]): string {
  for (const row of rows) {
    const title = (row.album ?? '').trim();
    if (title) return title;
  }
  return '';
}

/**
 * Public album document access — same gates as `isAlbumDetailsVisibleToPublicViewer`.
 */
export async function isAlbumPubliclyAccessible(
  artistSlug: string,
  albumId: string
): Promise<boolean> {
  const userId = await resolveArtistUserId(artistSlug);
  if (!userId) return false;

  const albumsResult = await query<AlbumLocaleRow>(
    `SELECT a.album, a.is_public, a.is_published
     FROM albums a
     WHERE a.user_id = $1 AND a.album_id = $2`,
    [userId, albumId],
    0
  );

  if (albumsResult.rows.length === 0) return false;

  const title = pickAlbumTitle(albumsResult.rows);
  const shared = albumsResult.rows.find((r) => r.is_published === true) ?? albumsResult.rows[0];
  const isPublished = shared.is_published === true;
  const isPublic = shared.is_public !== false;

  if (!isPublished || !isPublic || !title) return false;

  const trackCountResult = await query<TrackCountRow>(
    `SELECT COUNT(DISTINCT t.track_id)::text AS count
     FROM tracks t
     INNER JOIN albums a ON t.album_id = a.id
     WHERE a.user_id = $1 AND a.album_id = $2`,
    [userId, albumId],
    0
  );

  const trackCount = Number.parseInt(trackCountResult.rows[0]?.count ?? '0', 10);
  return trackCount > 0;
}

interface ArticleVisibilityRow {
  visibility: string | null;
  is_draft: boolean | null;
}

export async function isArticlePubliclyAccessible(
  articleId: string,
  artistSlug: string | null
): Promise<boolean> {
  let userId: string;
  try {
    userId = await resolvePublicArtistUserId(artistSlug);
  } catch (error) {
    if (error instanceof PublicArtistResolverError && error.statusCode === 404) {
      return false;
    }
    throw error;
  }

  const result = await query<ArticleVisibilityRow>(
    `SELECT visibility, is_draft
     FROM articles
     WHERE user_id = $1::uuid
       AND (id::text = $2 OR article_id = $2)
       AND (is_draft = false OR is_draft IS NULL)
     LIMIT 1`,
    [userId, articleId],
    0
  );

  if (result.rows.length === 0) return false;

  const visibility = normalizeTrackVisibility(result.rows[0].visibility);
  return visibility !== 'hidden';
}

export async function resolveDocumentAllow(route: DocumentRoute): Promise<boolean> {
  switch (route.type) {
    case 'fast200':
      return true;
    case 'unknown':
      return false;
    case 'artistRequired':
      return artistSlugExists(route.artistSlug);
    case 'albumDetailNoArtist':
      return true;
    case 'albumDetail':
      return isAlbumPubliclyAccessible(route.artistSlug, route.albumId);
    case 'articleDetail':
      return isArticlePubliclyAccessible(route.articleId, route.artistSlug);
    case 'helpCategory':
      return isHelpCategoryValid(route.lang, route.categorySlug);
    case 'helpArticle':
      return isHelpArticleValid(route.lang, route.categorySlug, route.articleSlug);
    default:
      return false;
  }
}
