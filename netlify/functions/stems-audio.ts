/**
 * GET /api/stems/audio?artistUserId=&albumId=&trackId=&file=&accessToken=&expiresAt=
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { createErrorResponse, createOptionsResponse, getUserIdFromEvent } from './lib/api-helpers';
import { resolveStemTrackAccessAllowed } from './lib/stem-track-access';
import {
  assertArtistUserId,
  assertSafeStemSegment,
  createSupabaseAdminClient,
  getStemStoragePath,
  STORAGE_BUCKET_NAME,
  verifyStemTrackAccessToken,
} from './lib/stems-access';

/** Short-lived signed URL for playback redirect (access gate remains on this function). */
const STEM_SIGNED_URL_TTL_SECONDS = 600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
} as const;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  const artistUserIdRaw = event.queryStringParameters?.artistUserId?.trim();
  const albumIdRaw = event.queryStringParameters?.albumId?.trim();
  const trackIdRaw = event.queryStringParameters?.trackId?.trim();
  const fileRaw = event.queryStringParameters?.file?.trim();
  const accessToken = event.queryStringParameters?.accessToken?.trim();
  const expiresAtRaw = event.queryStringParameters?.expiresAt?.trim();

  if (!artistUserIdRaw || !albumIdRaw || !trackIdRaw || !fileRaw) {
    return createErrorResponse(400, 'artistUserId, albumId, trackId and file are required');
  }

  let artistUserId: string;
  let albumId: string;
  let trackId: string;
  let file: string;

  try {
    artistUserId = assertArtistUserId(artistUserIdRaw);
    albumId = assertSafeStemSegment(albumIdRaw, 'albumId');
    trackId = assertSafeStemSegment(trackIdRaw, 'trackId');
    file = assertSafeStemSegment(fileRaw, 'file');
  } catch (error) {
    return createErrorResponse(
      400,
      error instanceof Error ? error.message : 'Invalid request parameters'
    );
  }

  const expiresAt = expiresAtRaw ? Number.parseInt(expiresAtRaw, 10) : NaN;
  const tokenOk =
    Boolean(accessToken) &&
    Number.isFinite(expiresAt) &&
    verifyStemTrackAccessToken(accessToken!, artistUserId, albumId, trackId, expiresAt);

  let allowed = tokenOk;

  if (!allowed) {
    const viewerUserId = getUserIdFromEvent(event);
    try {
      allowed = await resolveStemTrackAccessAllowed(viewerUserId, artistUserId, albumId, trackId);
    } catch (error) {
      console.error('❌ [stems-audio] entitlement check failed', error);
      return createErrorResponse(500, 'Failed to verify stem access');
    }
  }

  if (!allowed) {
    return createErrorResponse(403, 'Stem access denied', undefined, {
      code: 'STEM_ACCESS_DENIED',
    });
  }

  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return createErrorResponse(500, 'Storage is not configured');
    }

    const storagePath = getStemStoragePath(artistUserId, albumId, trackId, file);
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUrl(storagePath, STEM_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      const message = error?.message?.toLowerCase() ?? '';
      if (message.includes('not found') || message.includes('object not found')) {
        return createErrorResponse(404, 'Stem file not found');
      }
      console.error('❌ [stems-audio] signed URL failed', error);
      return createErrorResponse(500, 'Failed to create stem audio URL');
    }

    return {
      statusCode: 302,
      headers: {
        ...CORS_HEADERS,
        Location: data.signedUrl,
        'Cache-Control': 'private, no-cache',
      },
      body: '',
    };
  } catch (error) {
    console.error('❌ [stems-audio]', error);
    return createErrorResponse(500, 'Failed to stream stem audio');
  }
};
