/**
 * Server-side stems visibility and access checks (manifest + audio).
 */

import {
  normalizeStemsVisibility,
  type StemsVisibility,
} from '../../../src/shared/lib/stems/stemsVisibility';
import { query } from './db';
import { viewerCanAccessStems } from './stems-access';

let cachedTracksHasStemsVisibilityColumn: boolean | null = null;

async function tracksTableHasStemsVisibilityColumn(): Promise<boolean> {
  if (cachedTracksHasStemsVisibilityColumn !== null) {
    return cachedTracksHasStemsVisibilityColumn;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'stems_visibility'
      ) AS exists`
    );
    cachedTracksHasStemsVisibilityColumn = Boolean(r.rows[0]?.exists);
  } catch {
    cachedTracksHasStemsVisibilityColumn = false;
  }
  return cachedTracksHasStemsVisibilityColumn;
}

async function trackExists(
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<boolean> {
  const res = await query<{ one: number }>(
    `SELECT 1 AS one
     FROM tracks t
     INNER JOIN albums a ON t.album_id = a.id
     WHERE a.user_id = $1::uuid
       AND a.album_id = $2
       AND t.track_id = $3
     LIMIT 1`,
    [artistUserId, albumId, trackId]
  );
  return res.rows.length > 0;
}

export async function resolveStemsVisibilityForTrack(
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<StemsVisibility | null> {
  const hasVis = await tracksTableHasStemsVisibilityColumn();
  if (!hasVis) {
    return (await trackExists(artistUserId, albumId, trackId)) ? 'public' : null;
  }

  const res = await query<{ stems_visibility: string | null }>(
    `SELECT t.stems_visibility
     FROM tracks t
     INNER JOIN albums a ON t.album_id = a.id
     WHERE a.user_id = $1::uuid
       AND a.album_id = $2
       AND t.track_id = $3
     LIMIT 1`,
    [artistUserId, albumId, trackId]
  );
  if (res.rows.length === 0) return null;
  return normalizeStemsVisibility(res.rows[0].stems_visibility);
}

export async function resolveStemTrackAccessAllowed(
  viewerUserId: string | null,
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<boolean> {
  const visibility = await resolveStemsVisibilityForTrack(artistUserId, albumId, trackId);
  if (visibility === null || visibility === 'hidden') return false;
  if (visibility === 'public') return true;
  return viewerCanAccessStems(viewerUserId, artistUserId);
}
