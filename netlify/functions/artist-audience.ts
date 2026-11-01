/**
 * GET /api/artist-audience?period=30d
 * Audience analytics for the authenticated artist (owner only).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { extractAccountTypeFromToken } from './lib/jwt';
import {
  getArtistAudienceStats,
  parseAudiencePeriod,
  type AudiencePeriod,
} from './lib/qualified-plays';

function parseLimit(raw: string | null | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

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

  const accountType = extractAccountTypeFromToken(
    event.headers.authorization ?? event.headers.Authorization
  );
  if (accountType !== 'artist') {
    return createErrorResponse(403, 'Artist account required');
  }

  const periodRaw = event.queryStringParameters?.period ?? '30d';
  const period: AudiencePeriod | null = parseAudiencePeriod(periodRaw);
  if (!period) {
    return createErrorResponse(400, 'Invalid period. Use 7d, 30d, or 90d.');
  }

  const tracksLimit = parseLimit(event.queryStringParameters?.tracksLimit, 5);
  const supportersLimit = parseLimit(event.queryStringParameters?.supportersLimit, 5);

  try {
    const stats = await getArtistAudienceStats(userId, period, {
      tracksLimit,
      supportersLimit,
    });
    return createSuccessResponse(stats);
  } catch (error) {
    console.error('❌ [artist-audience]', error);
    return createErrorResponse(500, 'Failed to load audience statistics');
  }
};
