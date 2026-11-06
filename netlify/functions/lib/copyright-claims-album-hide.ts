/**
 * Admin-only: temporarily hide album locales from public (is_public=false) while keeping
 * is_published unchanged. Restores prior is_public from pre_copyright_is_public.
 */

import { query, withTransaction } from './db';
import type { PoolClient } from 'pg';

export type CopyrightAlbumHideErrorCode =
  | 'CONTENT_NOT_FOUND'
  | 'ALREADY_RESTRICTED'
  | 'NOT_RESTRICTED';

export type ApplyCopyrightAlbumHideResult =
  | { ok: true; albumSlugId: string; userId: string; updatedRowCount: number }
  | { ok: false; code: CopyrightAlbumHideErrorCode };

export type RestoreCopyrightAlbumHideResult =
  | { ok: true; albumSlugId: string; userId: string; updatedRowCount: number }
  | { ok: false; code: CopyrightAlbumHideErrorCode };

async function resolveAlbumOwnerBySlug(albumSlugId: string): Promise<{
  albumSlugId: string;
  userId: string;
} | null> {
  const r = await query<{ user_id: string }>(
    `SELECT user_id::text AS user_id
     FROM albums
     WHERE album_id = $1 AND user_id IS NOT NULL
     LIMIT 1`,
    [albumSlugId.trim()],
    0
  );
  const uid = r.rows[0]?.user_id?.trim();
  if (!uid) return null;
  return { albumSlugId: albumSlugId.trim(), userId: uid };
}

export async function resolveAlbumSlugFromTrackClaim(trackIdText: string): Promise<{
  albumSlugId: string;
  userId: string;
} | null> {
  const r = await query<{ album_id: string; user_id: string }>(
    `SELECT a.album_id, a.user_id::text AS user_id
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE t.id = $1::uuid AND a.user_id IS NOT NULL
     LIMIT 1`,
    [trackIdText.trim()],
    0
  );
  const row = r.rows[0];
  if (!row?.album_id || !row.user_id) return null;
  return { albumSlugId: row.album_id.trim(), userId: row.user_id.trim() };
}

/** Sets copyright_restricted and forces is_public=false on all locales; snapshots is_public first. */
export async function applyCopyrightAlbumTemporaryHide(
  albumSlugId: string,
  userId: string
): Promise<ApplyCopyrightAlbumHideResult> {
  const slug = albumSlugId.trim();
  const uid = userId.trim();
  if (!slug || !uid) {
    return { ok: false, code: 'CONTENT_NOT_FOUND' };
  }

  const exists = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM albums
     WHERE album_id = $1 AND user_id = $2::uuid`,
    [slug, uid],
    0
  );
  if (Number(exists.rows[0]?.n ?? '0') === 0) {
    return { ok: false, code: 'CONTENT_NOT_FOUND' };
  }

  return withTransaction(async (client: PoolClient) => {
    const pending = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM albums
       WHERE album_id = $1 AND user_id = $2::uuid AND copyright_restricted = false`,
      [slug, uid]
    );
    if (Number(pending.rows[0]?.n ?? '0') === 0) {
      return { ok: false as const, code: 'ALREADY_RESTRICTED' as const };
    }

    const upd = await client.query(
      `UPDATE albums SET
         pre_copyright_is_public = is_public,
         is_public = false,
         copyright_restricted = true,
         updated_at = NOW()
       WHERE album_id = $1 AND user_id = $2::uuid AND copyright_restricted = false`,
      [slug, uid]
    );

    return {
      ok: true as const,
      albumSlugId: slug,
      userId: uid,
      updatedRowCount: upd.rowCount ?? 0,
    };
  });
}

/** Clears copyright_restricted and restores is_public from snapshot. */
export async function restoreCopyrightAlbumAfterReview(
  albumSlugId: string,
  userId: string
): Promise<RestoreCopyrightAlbumHideResult> {
  const slug = albumSlugId.trim();
  const uid = userId.trim();
  if (!slug || !uid) {
    return { ok: false, code: 'CONTENT_NOT_FOUND' };
  }

  return withTransaction(async (client: PoolClient) => {
    const upd = await client.query(
      `UPDATE albums SET
         is_public = COALESCE(pre_copyright_is_public, is_public),
         pre_copyright_is_public = NULL,
         copyright_restricted = false,
         updated_at = NOW()
       WHERE album_id = $1 AND user_id = $2::uuid AND copyright_restricted = true`,
      [slug, uid]
    );

    if ((upd.rowCount ?? 0) === 0) {
      const exists = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM albums
         WHERE album_id = $1 AND user_id = $2::uuid`,
        [slug, uid]
      );
      if (Number(exists.rows[0]?.n ?? '0') === 0) {
        return { ok: false as const, code: 'CONTENT_NOT_FOUND' as const };
      }
      return { ok: false as const, code: 'NOT_RESTRICTED' as const };
    }

    return {
      ok: true as const,
      albumSlugId: slug,
      userId: uid,
      updatedRowCount: upd.rowCount ?? 0,
    };
  });
}

export async function resolveTargetAlbumForCopyrightClaim(input: {
  contentType: 'album' | 'track';
  contentId: string;
}): Promise<{ albumSlugId: string; userId: string } | null> {
  if (input.contentType === 'album') {
    return resolveAlbumOwnerBySlug(input.contentId);
  }
  return resolveAlbumSlugFromTrackClaim(input.contentId);
}
