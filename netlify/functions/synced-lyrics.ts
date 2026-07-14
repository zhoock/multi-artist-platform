/**
 * Netlify Serverless Function for synced lyrics.
 * Read/write paths delegate to canonical track-lyrics builder.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';
import { assertArtistVisibleToViewer } from './lib/artist-publication';
import { PublicArtistResolverError, resolvePublicArtistUserId } from './lib/public-artist-resolver';
import { viewerHasPremiumAccessToArtist } from './lib/entitlements';
import { artistHasMonetizationEnabled } from './lib/artist-monetization';
import {
  buildTrackLyricsBundle,
  deleteTrackLyricsSync,
  saveTrackLyricsSync,
  type TrackLyricsBundle,
} from './lib/track-lyrics';

interface SaveSyncedLyricsRequest {
  albumId: string;
  trackId: string | number;
  lang?: string;
  syncedLyrics: Array<{
    text: string;
    startTime: number;
    endTime?: number;
  }>;
  authorship?: string;
}

interface SyncedLyricsResponse {
  success: boolean;
  data?: TrackLyricsBundle;
  message?: string;
  error?: string;
}

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const { albumId, trackId, lang, artist } = event.queryStringParameters || {};

      if (!albumId || !trackId || !lang) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Missing required parameters: albumId, trackId, lang',
          } as SyncedLyricsResponse),
        };
      }

      const authUserId = getUserIdFromEvent(event);
      let targetUserId: string;

      if (artist) {
        try {
          targetUserId = await resolvePublicArtistUserId(artist);
          await assertArtistVisibleToViewer(targetUserId, authUserId);
        } catch (error) {
          if (error instanceof PublicArtistResolverError) {
            return {
              statusCode: error.statusCode,
              headers,
              body: JSON.stringify({
                success: false,
                error: error.message,
              } as SyncedLyricsResponse),
            };
          }
          throw error;
        }
      } else if (authUserId) {
        targetUserId = authUserId;
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Missing required query parameter: artist',
          } as SyncedLyricsResponse),
        };
      }

      if (artist?.trim()) {
        const monetizationEnabled = await artistHasMonetizationEnabled(targetUserId);
        if (monetizationEnabled) {
          const canRead = await viewerHasPremiumAccessToArtist(authUserId, targetUserId);
          if (!canRead) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, data: undefined } as SyncedLyricsResponse),
            };
          }
        }
      }

      const uiLang = lang === 'ru' || lang === 'en' ? lang : undefined;
      const bundle = await buildTrackLyricsBundle({
        albumId,
        trackId,
        userId: targetUserId,
        uiLang,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: bundle ?? undefined } as SyncedLyricsResponse),
      };
    }

    if (event.httpMethod === 'DELETE') {
      const userId = getUserIdFromEvent(event);
      if (!userId) {
        return unauthorizedFromAuthHeader(event);
      }
      const { albumId, trackId } = event.queryStringParameters || {};
      if (!albumId || !trackId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Missing required parameters: albumId, trackId',
          } as SyncedLyricsResponse),
        };
      }
      const bundle = await deleteTrackLyricsSync(userId, albumId, trackId);
      if (!bundle) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Album not found',
          } as SyncedLyricsResponse),
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: bundle } as SyncedLyricsResponse),
      };
    }

    if (event.httpMethod === 'POST') {
      const data: SaveSyncedLyricsRequest = JSON.parse(event.body || '{}');

      if (!data.albumId || !data.trackId || !Array.isArray(data.syncedLyrics)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Invalid request data. Required: albumId, trackId, syncedLyrics[]',
          } as SyncedLyricsResponse),
        };
      }

      const userId = getUserIdFromEvent(event);
      if (!userId) {
        return unauthorizedFromAuthHeader(event);
      }

      const bundle = await saveTrackLyricsSync({
        userId,
        albumId: data.albumId,
        trackId: data.trackId,
        syncedLyrics: data.syncedLyrics,
        authorship: data.authorship,
      });

      if (!bundle) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Album not found',
          } as SyncedLyricsResponse),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Synced lyrics saved successfully',
          data: bundle,
        } as SyncedLyricsResponse),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use GET, POST, or DELETE.',
      } as SyncedLyricsResponse),
    };
  } catch (error) {
    console.error('❌ Error in synced-lyrics function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        message: errorMessage,
      } as SyncedLyricsResponse),
    };
  }
};
