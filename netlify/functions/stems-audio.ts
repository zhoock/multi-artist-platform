/**
 * GET /api/stems/audio?artistUserId=&albumId=&trackId=&file=&accessToken=&expiresAt=
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { createErrorResponse, createOptionsResponse, getUserIdFromEvent } from './lib/api-helpers';
import {
  assertArtistUserId,
  assertSafeStemSegment,
  downloadStemFileFromStorage,
  verifyStemTrackAccessToken,
  viewerCanAccessStems,
} from './lib/stems-access';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'private, max-age=3600',
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
      allowed = await viewerCanAccessStems(viewerUserId, artistUserId);
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
    const downloaded = await downloadStemFileFromStorage(artistUserId, albumId, trackId, file);
    if (!downloaded) {
      return createErrorResponse(404, 'Stem file not found');
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': downloaded.contentType,
        'Content-Length': String(downloaded.buffer.length),
      },
      body: downloaded.buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('❌ [stems-audio]', error);
    return createErrorResponse(500, 'Failed to stream stem audio');
  }
};
