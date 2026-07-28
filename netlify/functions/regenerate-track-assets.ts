/**
 * POST /api/tracks/regenerate-assets — re-enqueue audio asset processing for a track.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessResponse,
  requireAuth,
  requireArtistAccount,
  forbiddenArtistAccountResponse,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';
import { query } from './lib/db';
import { enqueueTrackProcessing } from './lib/enqueueTrackProcessing';
import { markTrackProcessingEnqueueFailed } from './lib/trackProcessingFailure';
import { GENERATOR_VERSIONS } from '../../src/shared/lib/audio/audioAssetPipelineConfig';
import { tracksTableHasPipelineColumns, trackAssetsTableExists } from './lib/track-pipeline-schema';

interface RegenerateRequest {
  albumId: string;
  trackId: string;
  staleOnly?: boolean;
  generator?: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  const userId = requireArtistAccount(event);
  if (!userId) {
    return requireAuth(event)
      ? forbiddenArtistAccountResponse(event)
      : unauthorizedFromAuthHeader(event);
  }

  const hasPipeline = await tracksTableHasPipelineColumns();
  const hasAssets = await trackAssetsTableExists();
  if (!hasPipeline || !hasAssets) {
    return createErrorResponse(503, 'Audio asset pipeline is not available (migration pending)');
  }

  const body = parseJsonBody<Partial<RegenerateRequest>>(event.body, {});
  const albumId = body.albumId?.trim();
  const trackId = body.trackId?.trim();

  if (!albumId || !trackId) {
    return createErrorResponse(400, 'Missing albumId or trackId');
  }

  const trackRes = await query<{
    id: string;
    master_path: string | null;
    album_db_id: string;
    album_slug: string;
  }>(
    `SELECT t.id, t.master_path, a.id AS album_db_id, a.album_id AS album_slug
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE a.user_id = $1 AND a.album_id = $2 AND t.track_id = $3
     LIMIT 1`,
    [userId, albumId, trackId]
  );

  if (trackRes.rows.length === 0 || !trackRes.rows[0].master_path) {
    return createErrorResponse(404, 'Track not found or master not uploaded');
  }

  const row = trackRes.rows[0];

  if (body.staleOnly && body.generator) {
    const currentVersion = GENERATOR_VERSIONS[body.generator] ?? 1;
    await query(
      `UPDATE track_assets SET status = 'pending', path = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE track_id = $1 AND generator = $2 AND generator_version < $3`,
      [row.id, body.generator, currentVersion]
    );
  } else {
    await query(
      `UPDATE track_assets SET status = 'pending', path = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE track_id = $1`,
      [row.id]
    );
  }

  await query(
    `UPDATE tracks SET processing_status = 'pending', processing_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [row.id]
  );

  const enqueueResult = await enqueueTrackProcessing({
    userId,
    albumDbId: row.album_db_id,
    albumSlug: row.album_slug,
    trackDbId: row.id,
    trackId,
    masterPath: row.master_path,
  });

  if (!enqueueResult.ok) {
    await markTrackProcessingEnqueueFailed(row.id, enqueueResult.message);
    return createErrorResponse(503, enqueueResult.message);
  }

  return createSuccessResponse({ trackId, processingStatus: 'pending' }, 200);
};
