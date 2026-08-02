/**
 * Resolve album by frontend key: albums.id (UUID) or albums.album_id (slug).
 */

import { query } from './db';

export function isAlbumUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** SQL fragment: albums aliased as `a`, users as `u` (LEFT JOIN). */
export const ALBUMS_USER_JOIN_SQL = 'LEFT JOIN users u ON u.id = a.user_id';

/** Resolved display name from album owner's profile. */
export const ARTIST_DISPLAY_NAME_SQL = `
  COALESCE(
    NULLIF(TRIM(u.site_name), ''),
    NULLIF(TRIM(u.name), ''),
    NULLIF(TRIM(u.public_slug), '')
  )
`;

export interface ResolvedAlbum {
  id: string;
  albumSlug: string;
  artistDisplayName: string;
  artistPublicSlug: string | null;
  album: string;
  lang: string;
  cover: string | null;
  userId: string | null;
}

type AlbumRow = {
  id: string;
  album_slug: string;
  artist_display_name: string | null;
  artist_public_slug: string | null;
  album: string;
  lang: string;
  cover: string | null;
  user_id: string | null;
};

export function resolveArtistDisplayNameFromParts(input: {
  siteName?: string | null;
  userName?: string | null;
  publicSlug?: string | null;
}): string {
  return input.siteName?.trim() || input.userName?.trim() || input.publicSlug?.trim() || '';
}

function mapAlbumRow(row: AlbumRow): ResolvedAlbum {
  return {
    id: row.id,
    albumSlug: row.album_slug,
    artistDisplayName: row.artist_display_name?.trim() || '',
    artistPublicSlug: row.artist_public_slug?.trim() || null,
    album: row.album,
    lang: row.lang,
    cover: row.cover,
    userId: row.user_id,
  };
}

const ALBUM_SELECT = `
  SELECT a.id::text AS id,
         a.album_id AS album_slug,
         ${ARTIST_DISPLAY_NAME_SQL} AS artist_display_name,
         NULLIF(TRIM(u.public_slug), '') AS artist_public_slug,
         a.album,
         a.lang,
         a.cover,
         a.user_id::text AS user_id
  FROM albums a
  ${ALBUMS_USER_JOIN_SQL}
`;

/** Prefer album row that actually has tracks (bilingual albums may have empty locale rows). */
const ALBUM_ROW_PRIORITY = `
  ORDER BY (
    SELECT COUNT(*)::int FROM tracks t WHERE t.album_id = a.id
  ) DESC,
  a.updated_at DESC NULLS LAST
`;

/** Load artist display name when only user_id is known (e.g. after INSERT RETURNING *). */
export async function fetchArtistDisplayNameForUserId(
  userId: string | null | undefined
): Promise<string> {
  if (!userId?.trim()) {
    return '';
  }

  const result = await query<{
    site_name: string | null;
    name: string | null;
    public_slug: string | null;
  }>(
    `SELECT site_name, name, public_slug
     FROM users
     WHERE id = $1::uuid
     LIMIT 1`,
    [userId.trim()]
  );

  const row = result.rows[0];
  if (!row) {
    return '';
  }

  return resolveArtistDisplayNameFromParts({
    siteName: row.site_name,
    userName: row.name,
    publicSlug: row.public_slug,
  });
}

/** Canonical albums.album_id slug for storage in orders/purchases. */
export async function resolveAlbumSlug(albumKey: string): Promise<string | null> {
  const album = await resolveAlbumByKey(albumKey);
  return album?.albumSlug ?? null;
}

export async function resolveAlbumByKey(albumKey: string): Promise<ResolvedAlbum | null> {
  const trimmed = albumKey.trim();
  if (!trimmed) {
    return null;
  }

  if (isAlbumUuid(trimmed)) {
    const byPk = await query<AlbumRow>(
      `${ALBUM_SELECT} WHERE a.id = $1::uuid ${ALBUM_ROW_PRIORITY} LIMIT 1`,
      [trimmed]
    );
    if (byPk.rows[0]) {
      return mapAlbumRow(byPk.rows[0]);
    }
  }

  const bySlug = await query<AlbumRow>(
    `${ALBUM_SELECT} WHERE a.album_id = $1 ${ALBUM_ROW_PRIORITY} LIMIT 1`,
    [trimmed]
  );
  if (bySlug.rows[0]) {
    return mapAlbumRow(bySlug.rows[0]);
  }

  return null;
}

export async function fetchTracksForResolvedAlbum(
  album: ResolvedAlbum
): Promise<Array<{ trackId: string; title: string }>> {
  const tracksResult = await query<{
    track_id: string;
    title: string;
  }>(
    `SELECT t.track_id, t.title
     FROM tracks t
     WHERE t.album_id = $1::uuid
     ORDER BY t.order_index ASC`,
    [album.id]
  );

  return tracksResult.rows.map((row) => ({
    trackId: row.track_id,
    title: row.title,
  }));
}
