/**
 * GET /api/stems/manifest?artistUserId=&albumId=&trackId=
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
} from './lib/api-helpers';
import { resolveStemTrackAccessAllowed } from './lib/stem-track-access';
import {
  assertArtistUserId,
  assertSafeStemSegment,
  createStemTrackAccessToken,
  fetchStemManifestFromStorage,
} from './lib/stems-access';
import { syncTrackHasStemsInDb } from './lib/track-has-stems';

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
    const allowed = await resolveStemTrackAccessAllowed(
      viewerUserId,
      artistUserId,
      albumId,
      trackId
    );
    if (!allowed) {
      return createErrorResponse(403, 'Stem access denied', undefined, {
        code: 'STEM_ACCESS_DENIED',
      });
    }

    const stems = await fetchStemManifestFromStorage(artistUserId, albumId, trackId);
    // Self-heal denormalized flag for CatalogAlbum.hasStems (best-effort).
    void syncTrackHasStemsInDb({
      artistUserId,
      albumId,
      trackId,
      hasStems: stems.length > 0,
    });
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
