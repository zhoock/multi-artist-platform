/**
 * Saved Mixes: пресеты микшера публичной страницы /stems.
 * Хранится только конфигурация стемов (volume/muted/solo), без аудио.
 */

import { isMissingRelationError, query } from './db';

export interface SavedMixSettingDto {
  stemId: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface SavedMixDto {
  id: string;
  albumId: string;
  trackId: string;
  name: string;
  createdAt: string;
  trackTitle?: string;
  albumTitle?: string;
  settings: SavedMixSettingDto[];
}

export interface SharedMixDto {
  id: string;
  artistSlug: string;
  albumId: string;
  trackId: string;
  name: string;
  authorName: string | null;
  settings: SavedMixSettingDto[];
}

interface SavedMixRow {
  id: string;
  album_id: string;
  track_id: string;
  name: string;
  settings: unknown;
  created_at: Date;
}

interface SharedMixRow extends SavedMixRow {
  public_slug: string | null;
  site_name: string | null;
  user_name: string | null;
}

/** Нормализует JSONB settings к массиву валидных настроек стемов. */
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

export interface CreateSavedMixInput {
  userId: string;
  artistUserId: string;
  albumId: string;
  trackId: string;
  name: string;
  trackTitle?: string;
  albumTitle?: string;
  settings: SavedMixSettingDto[];
}

export async function createSavedMix(input: CreateSavedMixInput): Promise<SavedMixDto> {
  const r = await query<SavedMixRow>(
    `INSERT INTO saved_mixes (user_id, artist_user_id, album_id, track_id, name, settings)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
     RETURNING id, album_id, track_id, name, settings, created_at`,
    [
      input.userId,
      input.artistUserId,
      input.albumId,
      input.trackId,
      input.name,
      JSON.stringify(input.settings),
    ]
  );
  const row = r.rows[0];
  if (!row) {
    throw new Error('Failed to create saved mix');
  }
  return {
    id: row.id,
    albumId: row.album_id,
    trackId: row.track_id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    trackTitle: input.trackTitle,
    albumTitle: input.albumTitle,
    settings: normalizeSettings(row.settings),
  };
}

export async function getSavedMixesForUserTrack(
  userId: string,
  albumId: string,
  trackId: string
): Promise<SavedMixDto[]> {
  try {
    const r = await query<SavedMixRow>(
      `SELECT id, album_id, track_id, name, settings, created_at
       FROM saved_mixes
       WHERE user_id = $1::uuid
         AND album_id = $2
         AND track_id = $3
       ORDER BY created_at DESC`,
      [userId, albumId, trackId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      albumId: row.album_id,
      trackId: row.track_id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      settings: normalizeSettings(row.settings),
    }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[saved-mixes] table missing — returning empty list');
      return [];
    }
    throw error;
  }
}

/** @deprecated Use getSavedMixesForUserTrack — mixes are scoped to a track. */
export async function getSavedMixesForUser(userId: string): Promise<SavedMixDto[]> {
  try {
    const r = await query<SavedMixRow>(
      `SELECT id, album_id, track_id, name, settings, created_at
       FROM saved_mixes
       WHERE user_id = $1::uuid
       ORDER BY created_at DESC`,
      [userId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      albumId: row.album_id,
      trackId: row.track_id,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      settings: normalizeSettings(row.settings),
    }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[saved-mixes] table missing — returning empty list');
      return [];
    }
    throw error;
  }
}

export async function deleteSavedMix(userId: string, mixId: string): Promise<boolean> {
  const r = await query(`DELETE FROM saved_mixes WHERE id = $1::uuid AND user_id = $2::uuid`, [
    mixId,
    userId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** Read-only выборка shared-микса по id (без записей в БД). */
export async function getSharedSavedMix(mixId: string): Promise<SharedMixDto | null> {
  try {
    const r = await query<SharedMixRow>(
      `SELECT
         m.id,
         m.album_id,
         m.track_id,
         m.name,
         m.settings,
         m.created_at,
         u.public_slug,
         u.site_name,
         u.name AS user_name
       FROM saved_mixes m
       JOIN users u ON u.id = m.artist_user_id
       WHERE m.id = $1::uuid
       LIMIT 1`,
      [mixId]
    );
    const row = r.rows[0];
    if (!row) return null;

    const authorName = row.site_name?.trim() || row.user_name?.trim() || null;
    return {
      id: row.id,
      artistSlug: row.public_slug?.trim() || '',
      albumId: row.album_id,
      trackId: row.track_id,
      name: row.name,
      authorName,
      settings: normalizeSettings(row.settings),
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.warn('[saved-mixes] table missing — shared mix not found');
      return null;
    }
    throw error;
  }
}
