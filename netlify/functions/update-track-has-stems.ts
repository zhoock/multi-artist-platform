/**
 * POST /api/stems/has-stems — синхронизация tracks.has_stems после save/delete манифеста.
 *
 * Body: { albumId: string, trackId: string, hasStems: boolean }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
  parseJsonBody,
} from './lib/api-helpers';

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
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

  try {
    const body = parseJsonBody<{
      albumId?: string;
      trackId?: string | number;
      hasStems?: boolean;
    }>(event.body, {});

    const albumId = typeof body.albumId === 'string' ? body.albumId.trim() : '';
    const trackId = body.trackId != null ? String(body.trackId).trim() : '';
    const hasStems = body.hasStems === true;

    if (!albumId || !trackId) {
      return createErrorResponse(400, 'albumId and trackId are required');
    }

    const up = await query(
      `UPDATE tracks t
       SET has_stems = $1::boolean, updated_at = NOW()
       FROM albums a
       WHERE t.album_id = a.id
         AND a.user_id = $2::uuid
         AND a.album_id = $3
         AND t.track_id = $4`,
      [hasStems, userId, albumId, trackId]
    );

    const n = up.rowCount ?? 0;
    if (n === 0) {
      return createErrorResponse(404, 'Track not found');
    }

    return createSuccessResponse({ hasStems, updated: n });
  } catch (e) {
    console.error('[update-track-has-stems]', e);
    const err = e as { code?: string; message?: string };
    const missingColumn =
      err?.code === '42703' ||
      (typeof err?.message === 'string' &&
        err.message.includes('has_stems') &&
        err.message.includes('does not exist'));
    return createErrorResponse(
      missingColumn ? 503 : 500,
      missingColumn
        ? 'В базе данных нет колонки tracks.has_stems. Выполните миграцию: database/migrations/062_add_tracks_has_stems.sql'
        : e instanceof Error
          ? e.message
          : 'Server error'
    );
  }
};
