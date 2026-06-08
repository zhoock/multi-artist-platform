/**
 * POST /api/delete-saved-mix
 * Удалить сохранённый микс текущего пользователя.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { deleteSavedMix } from './lib/saved-mixes';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed. Use POST.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  let body: { mixId?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const mixId = typeof body.mixId === 'string' ? body.mixId.trim() : '';
  if (!mixId || !UUID_RE.test(mixId)) {
    return createErrorResponse(400, 'mixId must be a valid UUID');
  }

  try {
    const removed = await deleteSavedMix(userId, mixId);
    if (!removed) {
      return createErrorResponse(404, 'Mix not found', undefined, { code: 'MIX_NOT_FOUND' });
    }
    return createSuccessResponse({ removed: true, mixId });
  } catch (error) {
    console.error('❌ [delete-saved-mix]', error);
    return createErrorResponse(500, 'Failed to delete mix');
  }
};
