/**
 * POST /api/update-article-visibility — уровень доступа статьи (все локали article_id для пользователя).
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';
import {
  normalizeTrackVisibility,
  type TrackVisibility,
} from '../../src/shared/lib/tracks/trackVisibility';
import { assertPremiumVisibilityAllowed } from './lib/artist-monetization';

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

  let body: { articleId?: string; visibility?: string };
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

  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
  const visibility = normalizeTrackVisibility(body.visibility) as TrackVisibility;

  if (!articleId) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ success: false, message: 'articleId is required' }),
    };
  }

  const premiumGate = await assertPremiumVisibilityAllowed(userId, visibility);
  if (!premiumGate.ok) {
    return {
      statusCode: 403,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: premiumGate.message,
        code: 'MONETIZATION_REQUIRED',
      }),
    };
  }

  try {
    const up = await query(
      `UPDATE articles
       SET visibility = $1::varchar(24), updated_at = NOW()
       WHERE user_id = $2::uuid AND article_id = $3`,
      [visibility, userId, articleId]
    );

    const n = up.rowCount ?? 0;
    if (n === 0) {
      return {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({ success: false, message: 'Article not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ success: true, visibility }),
    };
  } catch (e) {
    console.error('[update-article-visibility]', e);
    const err = e as { code?: string; message?: string };
    const msg =
      err?.code === '42703' ||
      (typeof err?.message === 'string' &&
        err.message.includes('visibility') &&
        err.message.includes('does not exist'))
        ? `В базе данных нет колонки articles.visibility. Выполните миграцию: database/migrations/033_add_article_visibility.sql`
        : e instanceof Error
          ? e.message
          : 'Server error';
    return {
      statusCode:
        err?.code === '42703' ||
        (typeof msg === 'string' && msg.includes('033_add_article_visibility'))
          ? 503
          : 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: msg,
      }),
    };
  }
};
