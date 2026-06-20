/**
 * POST /api/activate-archive-artists
 * Activate selected inactive artists within current plan slot limit.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  ArchiveActivationLimitError,
  ArchiveSlotsLimitError,
  ArchiveSubscriptionRequiredError,
  activateArtistsInArchive,
  getMyArchiveForUser,
} from './lib/archive';
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

  let body: { artistUserIds?: unknown };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const rawIds = body.artistUserIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return createErrorResponse(400, 'artistUserIds must be a non-empty array');
  }

  const artistUserIds = rawIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean);

  if (artistUserIds.length === 0) {
    return createErrorResponse(400, 'artistUserIds must contain valid UUID strings');
  }

  for (const id of artistUserIds) {
    if (!UUID_RE.test(id)) {
      return createErrorResponse(400, 'Each artistUserId must be a valid UUID');
    }
  }

  try {
    const activatedCount = await activateArtistsInArchive(userId, artistUserIds);
    const archive = await getMyArchiveForUser(userId);
    return createSuccessResponse({
      activatedCount,
      archive,
    });
  } catch (error) {
    if (error instanceof ArchiveActivationLimitError) {
      return createErrorResponse(409, error.message, undefined, {
        code: error.code,
        details: JSON.stringify({
          availableSlots: error.availableSlots,
          requested: error.requested,
        }),
      });
    }
    if (error instanceof ArchiveSlotsLimitError) {
      return createErrorResponse(409, error.message, undefined, {
        code: error.code,
        details: JSON.stringify({
          slotsUsed: error.slotsUsed,
          slotsLimit: error.slotsLimit,
        }),
      });
    }
    if (error instanceof ArchiveSubscriptionRequiredError) {
      return createErrorResponse(403, error.message, undefined, { code: error.code });
    }

    console.error('❌ [activate-archive-artists]', error);
    return createErrorResponse(500, 'Failed to activate archive artists');
  }
};
