/**
 * POST /api/add-to-archive
 * Добавить артиста в archive текущего пользователя.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  addArtistToArchive,
  ArchiveSlotsLimitError,
  ArchiveSubscriptionRequiredError,
  getArchiveStatusForArtist,
} from './lib/archive';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { artistHasMonetizationEnabled } from './lib/artist-monetization';

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

  if (!(await artistHasMonetizationEnabled(artistUserId))) {
    return createErrorResponse(
      403,
      'This artist has not enabled monetization. Collection is unavailable.',
      undefined,
      { code: 'ARTIST_MONETIZATION_DISABLED' }
    );
  }

  try {
    const entry = await addArtistToArchive(userId, artistUserId);
    const status = await getArchiveStatusForArtist(userId, artistUserId);

    return createSuccessResponse({
      entry: {
        id: entry.id,
        artistUserId: entry.artistUserId,
        createdAt: entry.createdAt.toISOString(),
        lockedUntil: entry.lockedUntil?.toISOString() ?? null,
      },
      status,
    });
  } catch (error) {
    if (error instanceof ArchiveSlotsLimitError) {
      return createErrorResponse(409, error.message, undefined, {
        code: error.code,
        details: JSON.stringify({ slotsUsed: error.slotsUsed, slotsLimit: error.slotsLimit }),
      });
    }
    if (error instanceof ArchiveSubscriptionRequiredError) {
      return createErrorResponse(403, error.message, undefined, { code: error.code });
    }
    if (error instanceof Error && error.message === 'Cannot add yourself to collection') {
      return createErrorResponse(400, error.message, undefined, { code: 'ARCHIVE_SELF_ADD' });
    }

    console.error('❌ [add-to-archive]', error);
    return createErrorResponse(500, 'Failed to add artist to collection');
  }
};
