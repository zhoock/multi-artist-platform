/**
 * GET /api/stems/manifest?artistUserId=&albumId=&trackId=
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  normalizeTrackVisibility,
  type TrackVisibility,
} from '../../src/shared/lib/tracks/trackVisibility';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
} from './lib/api-helpers';
import { query } from './lib/db';
import {
  assertArtistUserId,
  assertSafeStemSegment,
  createStemTrackAccessToken,
  fetchStemManifestFromStorage,
  viewerCanAccessStems,
} from './lib/stems-access';

/** Кэш: есть ли колонка tracks.visibility (миграция 032). */
let cachedTracksHasVisibilityColumn: boolean | null = null;

async function tracksTableHasVisibilityColumn(): Promise<boolean> {
  if (cachedTracksHasVisibilityColumn !== null) {
    return cachedTracksHasVisibilityColumn;
  }
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'visibility'
      ) AS exists`
    );
    cachedTracksHasVisibilityColumn = Boolean(r.rows[0]?.exists);
    if (!cachedTracksHasVisibilityColumn) {
      console.warn(
        '[stems-manifest] Колонка tracks.visibility отсутствует; всем трекам считается public. Выполните database/migrations/032_add_track_visibility.sql'
      );
    }
  } catch (checkErr) {
    console.warn('[stems-manifest] Не удалось проверить наличие tracks.visibility:', checkErr);
    cachedTracksHasVisibilityColumn = false;
  }
  return cachedTracksHasVisibilityColumn;
}

async function trackExistsForStemManifest(
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

/** Server-side visibility for stem manifest access (never trust client). */
async function resolveTrackVisibilityForStemManifest(
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<TrackVisibility | null> {
  const hasVis = await tracksTableHasVisibilityColumn();
  if (!hasVis) {
    return (await trackExistsForStemManifest(artistUserId, albumId, trackId)) ? 'public' : null;
  }

  const res = await query<{ visibility: string | null }>(
    `SELECT t.visibility
     FROM tracks t
     INNER JOIN albums a ON t.album_id = a.id
     WHERE a.user_id = $1::uuid
       AND a.album_id = $2
       AND t.track_id = $3
     LIMIT 1`,
    [artistUserId, albumId, trackId]
  );
  if (res.rows.length === 0) return null;
  return normalizeTrackVisibility(res.rows[0].visibility);
}

async function resolveStemManifestAllowed(
  viewerUserId: string | null,
  artistUserId: string,
  albumId: string,
  trackId: string
): Promise<boolean> {
  const visibility = await resolveTrackVisibilityForStemManifest(artistUserId, albumId, trackId);
  if (visibility === null || visibility === 'hidden') return false;
  if (visibility === 'public') return true;
  return viewerCanAccessStems(viewerUserId, artistUserId);
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  const artistUserIdRaw = event.queryStringParameters?.artistUserId?.trim();
  const albumIdRaw = event.queryStringParameters?.albumId?.trim();
  const trackIdRaw = event.queryStringParameters?.trackId?.trim();

  if (!artistUserIdRaw || !albumIdRaw || !trackIdRaw) {
    return createErrorResponse(400, 'artistUserId, albumId and trackId are required');
  }

  let artistUserId: string;
  let albumId: string;
  let trackId: string;

  try {
    artistUserId = assertArtistUserId(artistUserIdRaw);
    albumId = assertSafeStemSegment(albumIdRaw, 'albumId');
    trackId = assertSafeStemSegment(trackIdRaw, 'trackId');
  } catch (error) {
    return createErrorResponse(
      400,
      error instanceof Error ? error.message : 'Invalid request parameters'
    );
  }

  const viewerUserId = getUserIdFromEvent(event);

  try {
    const allowed = await resolveStemManifestAllowed(viewerUserId, artistUserId, albumId, trackId);
    if (!allowed) {
      return createErrorResponse(403, 'Stem access denied', undefined, {
        code: 'STEM_ACCESS_DENIED',
      });
    }

    const stems = await fetchStemManifestFromStorage(artistUserId, albumId, trackId);
    const { token: accessToken, expiresAt: accessTokenExpiresAt } = createStemTrackAccessToken(
      artistUserId,
      albumId,
      trackId
    );

    return createSuccessResponse({
      stems,
      accessToken,
      accessTokenExpiresAt,
    });
  } catch (error) {
    console.error('❌ [stems-manifest]', error);
    return createErrorResponse(500, 'Failed to load stem manifest');
  }
};
