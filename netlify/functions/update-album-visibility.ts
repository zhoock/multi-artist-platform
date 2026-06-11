/**
 * POST /api/update-album-visibility — видимость альбома на странице артиста (все локали album_id для пользователя).
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';
import {
  normalizeTrackVisibility,
  type TrackVisibility,
} from '../../src/shared/lib/tracks/trackVisibility';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ success: false, message: 'Use POST' }),
    };
  }

  let body: { albumId?: string; visibility?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ success: false, message: 'Invalid JSON' }),
    };
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const albumId = typeof body.albumId === 'string' ? body.albumId.trim() : '';
  const visibility = normalizeTrackVisibility(body.visibility) as TrackVisibility;

  if (!albumId) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ success: false, message: 'albumId is required' }),
    };
  }

  if (visibility !== 'public' && visibility !== 'hidden') {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: 'Album visibility must be public or hidden',
      }),
    };
  }

  const isPublic = visibility === 'public';

  try {
    const check = await query<{ is_published: boolean }>(
      `SELECT is_published FROM albums
       WHERE user_id = $1::uuid AND album_id = $2
       LIMIT 1`,
      [userId, albumId]
    );

    if ((check.rowCount ?? 0) === 0) {
      return {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Album not found' }),
      };
    }

    if (!check.rows[0]?.is_published) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: 'Publish the album before changing visibility',
        }),
      };
    }

    const up = await query(
      `UPDATE albums
       SET is_public = $1, updated_at = NOW()
       WHERE user_id = $2::uuid AND album_id = $3`,
      [isPublic, userId, albumId]
    );

    const n = up.rowCount ?? 0;
    if (n === 0) {
      return {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Album not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ success: true, visibility, isPublic }),
    };
  } catch (e) {
    console.error('[update-album-visibility]', e);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: e instanceof Error ? e.message : 'Server error',
      }),
    };
  }
};
