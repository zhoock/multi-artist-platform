/**
 * Netlify Function для скачивания треков
 * GET /api/download?albumId={album_slug}&track={track_id} с Authorization (покупка этого альбома или подписка).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { query } from './lib/db';
import { getUserIdFromEvent } from './lib/api-helpers';
import {
  getArtistUserIdForAlbumSlug,
  getViewerEmailLower,
  viewerHasPremiumAccessToArtist,
} from './lib/entitlements';
import { isAlbumOwnedByUser } from './lib/purchase-access';
import { resolveTrackPublicUrl } from './lib/track-storage';

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body?: string }> => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use GET.' }),
    };
  }

  try {
    const trackId = event.queryStringParameters?.track?.trim();
    const albumIdParam = event.queryStringParameters?.albumId?.trim();
    const authUserId = getUserIdFromEvent(event);

    if (!trackId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required parameter: track' }),
      };
    }

    if (!albumIdParam || !authUserId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Signed-in download required: ?albumId=...&track=... with Authorization header',
        }),
      };
    }

    const ownerId = await getArtistUserIdForAlbumSlug(albumIdParam);
    if (!ownerId) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Album not found' }),
      };
    }
    const emailLower = await getViewerEmailLower(authUserId);
    const purchased = await isAlbumOwnedByUser(authUserId, emailLower, albumIdParam);
    const subscribed = await viewerHasPremiumAccessToArtist(authUserId, ownerId);
    if (!purchased && !subscribed) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Download not allowed: purchase this album or subscribe for access',
        }),
      };
    }
    const resolvedAlbumId = albumIdParam;

    const trackResult = await query<{
      src: string | null;
      master_path: string | null;
      title: string;
      album_id: string;
      album_user_id: string | null;
    }>(
      `SELECT t.src, t.master_path, t.title, a.album_id, a.user_id AS album_user_id
       FROM tracks t
       INNER JOIN albums a ON t.album_id = a.id
       WHERE a.album_id = $1 AND t.track_id = $2
       LIMIT 1`,
      [resolvedAlbumId, trackId]
    );

    if (trackResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Track not found' }),
      };
    }

    const track = trackResult.rows[0];
    const downloadPath = track.master_path?.trim() || track.src?.trim();
    if (!downloadPath) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Track file not found' }),
      };
    }

    // Файлы лежат в storage владельца альбома, не у слушателя/подписчика.
    const storageUserId = track.album_user_id || null;
    const publicUrl = await resolveTrackPublicUrl(downloadPath, resolvedAlbumId, storageUserId);

    if (!publicUrl) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Track file not found in storage' }),
      };
    }

    return {
      statusCode: 302,
      headers: {
        Location: publicUrl,
        'Cache-Control': 'no-cache',
      },
    };
  } catch (error) {
    console.error('❌ Error in download-track:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};
