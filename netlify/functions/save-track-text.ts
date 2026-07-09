/**
 * Netlify Serverless Function для сохранения текста трека.
 * Delegates to canonical track-lyrics builder.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getUserIdFromEvent, unauthorizedFromAuthHeader } from './lib/api-helpers';
import { saveTrackLyricsContent } from './lib/track-lyrics';

interface SaveTrackTextRequest {
  albumId: string;
  trackId: string | number;
  lang: string;
  translations: Partial<Record<'en' | 'ru', { content: string; authorship?: string }>>;
  trackTitle?: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ success: false, message: 'Method not allowed. Use POST.' }),
      };
    }

    const data: SaveTrackTextRequest = JSON.parse(event.body || '{}');
    const raw = data as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(raw, 'content') && raw['content'] !== undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Use translations[lang].content only, not root "content"',
        }),
      };
    }

    const uiLang = data.lang as 'en' | 'ru';
    const locale = data.translations?.[uiLang];
    const content = locale?.content;

    if (!data.albumId || !data.trackId || !data.lang || content === undefined || content === null) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message:
            'Invalid request data. Required: albumId, trackId, lang, translations[lang].content',
        }),
      };
    }

    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return unauthorizedFromAuthHeader(event);
    }

    if (uiLang !== 'en' && uiLang !== 'ru') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'lang must be "en" or "ru"' }),
      };
    }

    const bundle = await saveTrackLyricsContent({
      userId,
      albumId: data.albumId,
      trackId: data.trackId,
      uiLang,
      content,
      authorship: locale?.authorship,
      trackTitle: data.trackTitle,
    });

    if (!bundle) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Album not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Track text saved successfully',
        data: bundle,
      }),
    };
  } catch (error) {
    console.error('❌ Error in save-track-text function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: errorMessage }),
    };
  }
};
