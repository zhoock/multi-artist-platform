/**
 * GET /api/my-saved-mixes
 * Список сохранённых миксов текущего пользователя.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getSavedMixesForUser } from './lib/saved-mixes';
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

  try {
    const mixes = await getSavedMixesForUser(userId);
    return createSuccessResponse({ mixes });
  } catch (error) {
    console.error('❌ [my-saved-mixes]', error);
    return createErrorResponse(500, 'Failed to load saved mixes');
  }
};
