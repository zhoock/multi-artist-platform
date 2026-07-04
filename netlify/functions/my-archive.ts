/**
 * GET /api/my-archive
 * Список артистов в archive текущего пользователя + slots.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getMyArchiveForUser } from './lib/archive';
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
    const data = await getMyArchiveForUser(userId);
    return createSuccessResponse(data);
  } catch (error) {
    console.error('❌ [my-archive]', error);
    return createErrorResponse(500, 'Failed to load collection');
  }
};
