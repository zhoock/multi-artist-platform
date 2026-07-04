/**
 * DELETE /api/remove-from-archive
 * Удалить артиста из archive текущего пользователя.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  ArchiveArtistLockedError,
  ArchiveSubscriptionRequiredError,
  getMyArchiveForUser,
  removeArtistFromArchive,
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

  if (event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed. Use DELETE.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  let body: { artistUserId?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const artistUserId = typeof body.artistUserId === 'string' ? body.artistUserId.trim() : '';
  if (!artistUserId) {
    return createErrorResponse(400, 'artistUserId is required');
  }
  if (!UUID_RE.test(artistUserId)) {
    return createErrorResponse(400, 'artistUserId must be a valid UUID');
  }

  try {
    const removed = await removeArtistFromArchive(userId, artistUserId);
    if (!removed) {
      return createErrorResponse(404, 'Artist not found in collection', undefined, {
        code: 'ARCHIVE_NOT_FOUND',
      });
    }

    const archive = await getMyArchiveForUser(userId);
    return createSuccessResponse({
      removed: true,
      artistUserId,
      archive,
    });
  } catch (error) {
    if (error instanceof ArchiveArtistLockedError) {
      return createErrorResponse(409, error.message, undefined, {
        code: error.code,
        details: JSON.stringify({
          artistUserId: error.artistUserId,
          lockedUntil: error.lockedUntil.toISOString(),
        }),
      });
    }
    if (error instanceof ArchiveSubscriptionRequiredError) {
      return createErrorResponse(403, error.message, undefined, { code: error.code });
    }

    console.error('❌ [remove-from-archive]', error);
    return createErrorResponse(500, 'Failed to remove artist from collection');
  }
};
