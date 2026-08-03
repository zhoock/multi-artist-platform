/**
 * Netlify Serverless Function для обновления названия трека.
 *
 * Поддерживает:
 * - POST: обновление названия трека
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';

interface UpdateTrackTitleRequest {
  albumId: string;
  trackId: string | number;
  lang: string;
  translations: Partial<Record<'en' | 'ru', { title: string }>>;
}

interface UpdateTrackTitleResponse {
  success: boolean;
  message?: string;
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // POST: обновление названия трека
    if (event.httpMethod === 'POST') {
      const data: UpdateTrackTitleRequest = JSON.parse(event.body || '{}');

      const raw = data as unknown as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(raw, 'title') && raw['title'] !== undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Use translations[lang].title only, not root "title"',
          } as UpdateTrackTitleResponse),
        };
      }

      const title = data.translations?.[data.lang as 'en' | 'ru']?.title?.trim() ?? '';

      if (!data.albumId || !data.trackId || !data.lang || !title) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message:
              'Invalid request data. Required: albumId, trackId, lang, translations[lang].title',
          } as UpdateTrackTitleResponse),
        };
      }

      // Извлекаем user_id из токена (обязательно для сохранения)
      const userId = getUserIdFromEvent(event);

      if (!userId) {
        return unauthorizedFromAuthHeader(event);
      }

      // Строка альбома в БД зависит от lang (ru/en); трек может жить только в «другой» локали.
      const trackOwner = await query<{ album_pk: string }>(
        `SELECT a.id AS album_pk
         FROM tracks t
         INNER JOIN albums a ON a.id = t.album_id
         WHERE a.user_id = $1
           AND a.album_id = $2
           AND t.track_id = $3
         ORDER BY CASE WHEN a.lang = $4 THEN 0 ELSE 1 END,
                  a.updated_at DESC NULLS LAST,
                  a.created_at DESC
         LIMIT 1`,
        [userId, data.albumId, String(data.trackId), data.lang]
      );

      if (trackOwner.rows.length === 0) {
        console.error('[update-track-title.ts] ❌ Track / album not found:', {
          albumId: data.albumId,
          trackId: data.trackId,
          lang: data.lang,
        });
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Track not found',
          } as UpdateTrackTitleResponse),
        };
      }

      const albumDbId = trackOwner.rows[0].album_pk;

      // Обновляем название трека
      const updateResult = await query<{ id: string; title: string }>(
        `UPDATE tracks 
         SET title = $1, updated_at = NOW()
         WHERE album_id = $2 AND track_id = $3
         RETURNING id, title`,
        [title, albumDbId, String(data.trackId)]
      );

      if (updateResult.rows.length === 0) {
        console.error('[update-track-title.ts] ❌ Track not found:', {
          albumId: data.albumId,
          trackId: data.trackId,
        });
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Track not found',
          } as UpdateTrackTitleResponse),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Track title updated successfully',
        } as UpdateTrackTitleResponse),
      };
    }

    // Метод не поддерживается
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Method not allowed',
      } as UpdateTrackTitleResponse),
    };
  } catch (error) {
    console.error('[update-track-title.ts] ❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      } as UpdateTrackTitleResponse),
    };
  }
};
