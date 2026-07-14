/**
 * Netlify function: canonical track lyrics API (GET / PUT / DELETE).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';

import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';
import { assertArtistVisibleToViewer } from './lib/artist-publication';
import { PublicArtistResolverError, resolvePublicArtistUserId } from './lib/public-artist-resolver';
import { viewerHasPremiumAccessToArtist } from './lib/entitlements';
import { artistHasMonetizationEnabled } from './lib/artist-monetization';
import {
  buildTrackLyricsBundle,
  deleteTrackLyricsSync,
  saveTrackLyricsContent,
  saveTrackLyricsSync,
  type TrackLyricsBundle,
} from './lib/track-lyrics';

type ApiResponse = {
  success: boolean;
  data?: TrackLyricsBundle;
  message?: string;
  error?: string;
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode: number, body: ApiResponse) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function resolveTargetUserId(
  event: HandlerEvent,
  artist?: string
): Promise<{ userId: string } | { error: ApiResponse; status: number }> {
  const authUserId = getUserIdFromEvent(event);

  if (artist?.trim()) {
    try {
      const targetUserId = await resolvePublicArtistUserId(artist);
      await assertArtistVisibleToViewer(targetUserId, authUserId);
      return { userId: targetUserId };
    } catch (error) {
      if (error instanceof PublicArtistResolverError) {
        return {
          error: { success: false, error: error.message },
          status: error.statusCode,
        };
      }
      throw error;
    }
  }

  if (authUserId) {
    return { userId: authUserId };
  }

  return {
    error: { success: false, error: 'Missing required query parameter: artist' },
    status: 400,
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const albumId = params.albumId;
    const trackId = params.trackId;
    const lang = params.lang;
    const artist = params.artist;
    const type = params.type;

    if (!albumId || !trackId) {
      return json(400, { success: false, error: 'Missing required parameters: albumId, trackId' });
    }

    if (event.httpMethod === 'GET') {
      const resolved = await resolveTargetUserId(event, artist);
      if ('error' in resolved) {
        return json(resolved.status, resolved.error);
      }

      if (artist?.trim()) {
        const monetizationEnabled = await artistHasMonetizationEnabled(resolved.userId);
        if (monetizationEnabled) {
          const canRead = await viewerHasPremiumAccessToArtist(
            getUserIdFromEvent(event),
            resolved.userId
          );
          if (!canRead) {
            return json(200, { success: true, data: undefined });
          }
        }
      }

      const uiLang = lang === 'ru' || lang === 'en' ? lang : undefined;
      const bundle = await buildTrackLyricsBundle({
        albumId,
        trackId,
        userId: resolved.userId,
        uiLang,
      });

      if (!bundle) {
        return json(404, { success: false, error: 'Track lyrics not found' });
      }

      return json(200, { success: true, data: bundle });
    }

    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');

      if (type === 'sync') {
        if (!Array.isArray(body.syncedLyrics)) {
          return json(400, {
            success: false,
            error: 'Invalid body. Required: syncedLyrics[]',
          });
        }
        const bundle = await saveTrackLyricsSync({
          userId,
          albumId,
          trackId,
          syncedLyrics: body.syncedLyrics,
          authorship: body.authorship,
        });
        if (!bundle) {
          return json(404, { success: false, error: 'Album or track not found' });
        }
        return json(200, { success: true, data: bundle });
      }

      if (type === 'content') {
        const uiLang = (body.lang || lang) as 'en' | 'ru';
        if (uiLang !== 'en' && uiLang !== 'ru') {
          return json(400, { success: false, error: 'lang must be en or ru' });
        }
        const locale = body.translations?.[uiLang];
        const content = locale?.content ?? body.content;
        if (content === undefined || content === null) {
          return json(400, {
            success: false,
            error: 'Missing translations[lang].content',
          });
        }
        const bundle = await saveTrackLyricsContent({
          userId,
          albumId,
          trackId,
          uiLang,
          content,
          authorship: locale?.authorship,
          trackTitle: body.trackTitle,
        });
        if (!bundle) {
          return json(404, { success: false, error: 'Album or track not found' });
        }
        return json(200, { success: true, data: bundle });
      }

      return json(400, {
        success: false,
        error: 'Missing or invalid type query param (content|sync)',
      });
    }

    if (event.httpMethod === 'DELETE') {
      const bundle = await deleteTrackLyricsSync(userId, albumId, trackId);
      if (!bundle) {
        return json(404, { success: false, error: 'Album or track not found' });
      }
      return json(200, { success: true, data: bundle });
    }

    return json(405, { success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[track-lyrics.ts]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json(500, { success: false, error: message, message });
  }
};
