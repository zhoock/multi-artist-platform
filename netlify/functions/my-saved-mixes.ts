/**
 * GET /api/my-saved-mixes?albumId=&trackId=
 * Список сохранённых миксов текущего пользователя для конкретного трека.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getSavedMixesForUserTrack } from './lib/saved-mixes';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

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

  const albumId = event.queryStringParameters?.albumId?.trim() ?? '';
  const trackId = event.queryStringParameters?.trackId?.trim() ?? '';
  if (!albumId || !trackId) {
    return createErrorResponse(400, 'albumId and trackId are required');
  }

  try {
    const mixes = await getSavedMixesForUserTrack(userId, albumId, trackId);
    return createSuccessResponse({ mixes });
  } catch (error) {
    console.error('❌ [my-saved-mixes]', error);
    return createErrorResponse(500, 'Failed to load saved mixes');
  }
};
