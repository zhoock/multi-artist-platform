/**
 * Album cover Storage helpers — variant paths, DB lookup, superseded cleanup.
 * OLD cover is removed only after a successful DB save (see albums.ts), never in commit-cover.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { query } from './db';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';

/** Derivative suffixes for album cover objects in Storage. */
export const ALBUM_COVER_SIZE_SUFFIXES = ['-64', '-128', '-448', '-896', '-1344'] as const;

/**
 * Canonical base name from `albums.cover` (strip extension and size suffix).
 */
export function normalizeCoverBaseName(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/\.(webp|jpg|jpeg)$/i, '');
  for (const suf of ALBUM_COVER_SIZE_SUFFIXES) {
    if (s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s.trim();
}

/**
 * Expected Storage paths for one cover base name under `users/{userId}/albums/`.
 */
export function buildCoverVariantStoragePaths(userId: string, base: string): string[] {
  if (!base) return [];
  const prefix = `users/${userId}/albums`;
  const out: string[] = [];
  for (const sz of ALBUM_COVER_SIZE_SUFFIXES) {
    out.push(`${prefix}/${base}${sz}.webp`, `${prefix}/${base}${sz}.jpg`);
  }
  out.push(`${prefix}/${base}.webp`);
  return out;
}

export async function fetchDistinctCoverBasesFromDb(
  userId: string,
  albumId: string
): Promise<string[]> {
  try {
    const result = await query<{ cover: string | null }>(
      `SELECT DISTINCT cover FROM albums 
       WHERE user_id = $1 AND album_id = $2 
         AND cover IS NOT NULL AND trim(cover) <> ''`,
      [userId, albumId]
    );
    const bases = new Set<string>();
    for (const row of result.rows) {
      if (row.cover) {
        const b = normalizeCoverBaseName(row.cover);
        if (b) bases.add(b);
      }
    }
    return [...bases];
  } catch (e) {
    console.error('[album-cover-storage] Failed to read existing album.cover from DB:', e);
    return [];
  }
}

export async function removeCoverVariantsByBaseName(
  supabase: SupabaseClient,
  userId: string,
  baseName: string
): Promise<void> {
  const paths = buildCoverVariantStoragePaths(userId, baseName);
  if (paths.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const batch = paths.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(batch);
    if (error) {
      throw error;
    }
  }
}

/**
 * Best-effort removal of superseded cover bases after DB points at `newCoverBase`.
 * Failures are logged only — they must not fail the album save response.
 */
export async function cleanupSupersededAlbumCoversBestEffort(
  userId: string,
  previousCoverBases: string[],
  newCoverBase: string | null | undefined
): Promise<void> {
  const newBase = newCoverBase ? normalizeCoverBaseName(newCoverBase) : '';
  if (!newBase) return;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.warn('[album-cover-storage] Supabase admin client missing; skipped cover cleanup');
    return;
  }

  for (const oldBase of previousCoverBases) {
    const normalizedOld = normalizeCoverBaseName(oldBase);
    if (!normalizedOld || normalizedOld === newBase) continue;
    try {
      await removeCoverVariantsByBaseName(supabase, userId, normalizedOld);
      console.log('[album-cover-storage] Removed superseded album cover:', {
        userId,
        oldBase: normalizedOld,
        newBase,
      });
    } catch (cleanupErr) {
      console.warn('[album-cover-storage] Superseded cover cleanup failed (non-fatal):', {
        userId,
        oldBase: normalizedOld,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    }
  }
}
