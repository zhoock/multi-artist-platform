/**
 * GET /api/get-shared-mix?mixId=:id
 * Публичная read-only выборка shared-микса (без авторизации, без записей в БД).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getSharedSavedMix } from './lib/saved-mixes';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
} from './lib/api-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  const mixId = (event.queryStringParameters?.mixId ?? '').trim();
  if (!mixId || !UUID_RE.test(mixId)) {
    return createErrorResponse(400, 'mixId must be a valid UUID');
  }

  try {
    const mix = await getSharedSavedMix(mixId);
    if (!mix) {
      return createErrorResponse(404, 'Mix not found', undefined, { code: 'MIX_NOT_FOUND' });
    }
    return createSuccessResponse({ mix });
  } catch (error) {
    console.error('❌ [get-shared-mix]', error);
    return createErrorResponse(500, 'Failed to load shared mix');
  }
};
