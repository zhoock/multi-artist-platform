/**
 * GET /api/archive-status?artistUserId={uuid}
 * Статус archive и premium для будущего UI.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { getArchiveStatusForArtist } from './lib/archive';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const artistUserId = event.queryStringParameters?.artistUserId?.trim();
  if (!artistUserId) {
    return createErrorResponse(400, 'artistUserId query parameter is required');
  }
  if (!UUID_RE.test(artistUserId)) {
    return createErrorResponse(400, 'artistUserId must be a valid UUID');
  }

  try {
    const status = await getArchiveStatusForArtist(userId, artistUserId);
    return createSuccessResponse(status);
  } catch (error) {
    console.error('❌ [archive-status]', error);
    return createErrorResponse(500, 'Failed to load collection status');
  }
};
