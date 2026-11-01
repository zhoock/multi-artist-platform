/**
 * POST /api/record-qualified-play
 * Registers one qualified listen per playback session + track.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
} from './lib/api-helpers';
import { checkIpRateLimit } from './lib/ip-rate-limit';
import { checkQualifiedPlayUserRateLimit } from './lib/qualified-play-rate-limit';
import { registerQualifiedPlay, isUuid } from './lib/qualified-plays';

const RECORD_PLAY_IP_LIMIT = 180;
const RECORD_PLAY_WINDOW_SECONDS = 3600;

function readListenerAnonId(event: HandlerEvent): string | null {
  const header = event.headers['x-listener-anon-id'] ?? event.headers['X-Listener-Anon-Id'] ?? null;
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return null;
}

function parseBody(event: HandlerEvent): Record<string, unknown> | null {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed. Use POST.');
  }

  const rateLimited = await checkIpRateLimit(event, {
    bucketKey: 'qualified_play_record',
    limit: RECORD_PLAY_IP_LIMIT,
    windowSeconds: RECORD_PLAY_WINDOW_SECONDS,
  });
  if (!rateLimited.allowed) {
    return createErrorResponse(429, 'Too many play events. Try again later.', undefined, {
      code: 'RATE_LIMITED',
      retryAfterSeconds: rateLimited.retryAfterSeconds,
    });
  }

  const body = parseBody(event);
  if (!body) {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const albumSlug = typeof body.albumId === 'string' ? body.albumId : '';
  const logicalTrackId = typeof body.trackId === 'string' ? body.trackId : '';
  const playbackSessionId =
    typeof body.playbackSessionId === 'string' ? body.playbackSessionId : '';
  const durationListenedSeconds =
    typeof body.durationListenedSeconds === 'number'
      ? body.durationListenedSeconds
      : Number(body.durationListenedSeconds);

  const listenerUserId = getUserIdFromEvent(event);
  const listenerAnonIdFromBody =
    typeof body.listenerAnonId === 'string' ? body.listenerAnonId.trim() : null;
  const listenerAnonId = listenerUserId
    ? null
    : listenerAnonIdFromBody || readListenerAnonId(event);

  if (!listenerUserId && (!listenerAnonId || !isUuid(listenerAnonId))) {
    return createErrorResponse(400, 'listenerAnonId required for anonymous listeners');
  }

  if (listenerUserId) {
    const userRateLimited = await checkQualifiedPlayUserRateLimit(listenerUserId);
    if (!userRateLimited.allowed) {
      return createErrorResponse(429, 'Too many play events for this account.', undefined, {
        code: 'RATE_LIMITED',
        retryAfterSeconds: userRateLimited.retryAfterSeconds,
      });
    }
  }

  const result = await registerQualifiedPlay({
    albumSlug,
    logicalTrackId,
    playbackSessionId,
    durationListenedSeconds,
    listenerUserId,
    listenerAnonId,
  });

  if (!result.ok) {
    if (result.code === 'TRACK_NOT_FOUND') {
      return createErrorResponse(404, 'Track not found');
    }
    if (result.code === 'NOT_QUALIFIED') {
      return createErrorResponse(400, 'Listen duration below qualified threshold');
    }
    if (result.code === 'OWNER_PLAY') {
      return createSuccessResponse({ recorded: false, reason: 'owner_play' });
    }
    return createErrorResponse(400, 'Invalid play event payload');
  }

  return createSuccessResponse({ recorded: result.inserted });
};
