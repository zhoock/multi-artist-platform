/**
 * Shared helpers for copyright claims (public POST + admin list/detail).
 */

import { query } from './db';

export type CopyrightContentType = 'album' | 'track';
export type CopyrightClaimantType = 'copyright_owner' | 'authorized_representative' | 'other';

export const CLAIMANT_TYPES: readonly CopyrightClaimantType[] = [
  'copyright_owner',
  'authorized_representative',
  'other',
] as const;

export const MAX_DESCRIPTION_CHARS = 8000;
export const MIN_DESCRIPTION_CHARS = 20;
export const MAX_CLAIMANT_NAME_CHARS = 255;
export const MAX_REQUEST_BODY_BYTES = 65536;

export interface AlbumClaimContextRow {
  album_id: string;
  album_title: string;
  artist_slug: string;
  artist_display: string;
}

export interface TrackClaimContextRow {
  track_pk: string;
  track_title: string;
  track_slug: string;
  album_id: string;
  album_title: string;
  artist_slug: string;
  artist_display: string;
}

export async function resolveAlbumForCopyrightReport(input: {
  albumSlugId: string;
  artistSlug: string;
}): Promise<AlbumClaimContextRow | null> {
  const albumSlug = input.albumSlugId.trim();
  const slug = input.artistSlug.trim().toLowerCase();
  if (!albumSlug || !slug) return null;

  const result = await query<AlbumClaimContextRow>(
    `SELECT DISTINCT ON (a.album_id)
       a.album_id,
       COALESCE(NULLIF(TRIM(a.full_name), ''), a.album) AS album_title,
       u.public_slug AS artist_slug,
       COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '') AS artist_display
     FROM albums a
     INNER JOIN users u ON u.id = a.user_id
     WHERE a.album_id = $1
       AND a.user_id IS NOT NULL
       AND u.public_slug IS NOT NULL
       AND LOWER(TRIM(u.public_slug)) = $2
       AND a.is_published = true
       AND a.is_public = true
       AND COALESCE(a.copyright_restricted, false) = false
     ORDER BY a.album_id, (a.lang = 'en') DESC NULLS LAST, a.lang ASC
     LIMIT 1`,
    [albumSlug, slug],
    0
  );
  return result.rows[0] ?? null;
}

export async function resolveTrackForCopyrightReport(input: {
  trackPk: string;
  artistSlug: string;
}): Promise<TrackClaimContextRow | null> {
  const id = input.trackPk.trim();
  const slug = input.artistSlug.trim().toLowerCase();
  if (!id || !slug) return null;

  const result = await query<TrackClaimContextRow>(
    `SELECT
       t.id::text AS track_pk,
       t.title AS track_title,
       t.track_id AS track_slug,
       a.album_id,
       COALESCE(NULLIF(TRIM(a.full_name), ''), a.album) AS album_title,
       u.public_slug AS artist_slug,
       COALESCE(NULLIF(TRIM(u.site_name), ''), u.name, '') AS artist_display
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     INNER JOIN users u ON u.id = a.user_id
     WHERE t.id = $1::uuid
       AND a.user_id IS NOT NULL
       AND u.public_slug IS NOT NULL
       AND LOWER(TRIM(u.public_slug)) = $2
       AND a.is_published = true
       AND a.is_public = true
       AND COALESCE(a.copyright_restricted, false) = false
     LIMIT 1`,
    [id, slug],
    0
  );
  return result.rows[0] ?? null;
}

export function normalizeClaimantType(raw: unknown): CopyrightClaimantType | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim() as CopyrightClaimantType;
  return CLAIMANT_TYPES.includes(v) ? v : null;
}

export function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (s.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
