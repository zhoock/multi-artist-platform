/**
 * POST /api/tracks/regenerate-assets — re-enqueue audio asset processing for a track.
 *
 * Does NOT reset track_assets or tracks.processing_status before enqueue.
 * Worker transitions assets to `processing` only after advisory lock is acquired.
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
import {
  GENERATOR_VERSIONS,
  isOptionalOnlyGenerator,
  resolveRegenerateStagesForGenerator,
} from '../../src/shared/lib/audio/audioAssetPipelineConfig';
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
    processing_status: string;
  }>(
    `SELECT t.id, t.master_path, t.processing_status, a.id AS album_db_id, a.album_id AS album_slug
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
  const generator = body.generator?.trim();
  const optionalOnly = generator ? isOptionalOnlyGenerator(generator) : false;
  const stages = resolveRegenerateStagesForGenerator(generator);

  if (generator && !stages) {
    return createErrorResponse(400, `Unknown generator: ${generator}`);
  }

  if (body.staleOnly && generator) {
    const currentVersion = GENERATOR_VERSIONS[generator] ?? 1;
    const staleCheck = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM track_assets
         WHERE track_id = $1 AND generator = $2 AND generator_version < $3
       ) AS exists`,
      [row.id, generator, currentVersion]
    );
    if (!staleCheck.rows[0]?.exists) {
      return createSuccessResponse(
        {
          trackId,
          enqueued: false,
          reason: 'not_stale',
          processingStatus: row.processing_status,
        },
        200
      );
    }
  }

  const enqueueResult = await enqueueTrackProcessing({
    userId,
    albumDbId: row.album_db_id,
    albumSlug: row.album_slug,
    trackDbId: row.id,
    trackId,
    masterPath: row.master_path,
    stages,
  });

  if (!enqueueResult.ok) {
    await markTrackProcessingEnqueueFailed(row.id, enqueueResult.message, { stages });
    return createErrorResponse(503, enqueueResult.message);
  }

  return createSuccessResponse(
    {
      trackId,
      enqueued: true,
      processingStatus: row.processing_status,
      optionalOnlyRegenerate: optionalOnly,
    },
    200
  );
};
