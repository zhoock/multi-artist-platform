/**
 * POST /api/save-mix
 * Сохранить микс (пресет микшера) текущего пользователя.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { createSavedMix, type SavedMixSettingDto } from './lib/saved-mixes';
import { resolvePublicArtistUserId } from './lib/public-artist-resolver';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  handleError,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

interface SaveMixBody {
  albumId?: string;
  trackId?: string;
  name?: string;
  artistSlug?: string;
  trackTitle?: string;
  albumTitle?: string;
  settings?: unknown;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Серверный fallback автоимени (защита, если клиент прислал пустое имя). */
function fallbackMixName(trackTitle: string): string {
  const d = new Date();
  const stamp =
    `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${trackTitle.trim() || 'Mix'} • ${stamp}`;
}

function normalizeSettings(raw: unknown): SavedMixSettingDto[] {
  if (!Array.isArray(raw)) return [];
  const result: SavedMixSettingDto[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const stemId = typeof record.stemId === 'string' ? record.stemId : '';
    if (!stemId) continue;
    const volumeRaw = typeof record.volume === 'number' ? record.volume : 1;
    result.push({
      stemId,
      volume: Math.max(0, Math.min(1, volumeRaw)),
      muted: record.muted === true,
      solo: record.solo === true,
    });
  }
  return result;
}

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

  let body: SaveMixBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const albumId = typeof body.albumId === 'string' ? body.albumId.trim() : '';
  const trackId = typeof body.trackId === 'string' ? body.trackId.trim() : '';
  if (!albumId || !trackId) {
    return createErrorResponse(400, 'albumId and trackId are required');
  }

  const trackTitle = typeof body.trackTitle === 'string' ? body.trackTitle : '';
  const albumTitle = typeof body.albumTitle === 'string' ? body.albumTitle : '';
  const requestedName = typeof body.name === 'string' ? body.name.trim() : '';
  const name = requestedName || fallbackMixName(trackTitle);
  const settings = normalizeSettings(body.settings);
  const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug.trim() : '';

  try {
    const artistUserId = await resolvePublicArtistUserId(artistSlug || null);
    const mix = await createSavedMix({
      userId,
      artistUserId,
      albumId,
      trackId,
      name,
      trackTitle,
      albumTitle,
      settings,
    });
    return createSuccessResponse({ mix });
  } catch (error) {
    return handleError(error, 'save-mix', 'Failed to save mix');
  }
};
