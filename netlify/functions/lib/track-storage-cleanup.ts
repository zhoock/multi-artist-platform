/**
 * Remove superseded track audio files from Supabase Storage (master + derived).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extractStoragePathFromTrackRef } from '../../../src/shared/lib/tracks/storagePathReference';

const STORAGE_BUCKET_NAME = 'user-media';

export { extractStoragePathFromTrackRef } from '../../../src/shared/lib/tracks/storagePathReference';

function createSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Collect storage paths to remove after a successful track file replacement.
 * Skips the new master path (already uploaded / upserted in place).
 */
export function collectSupersededTrackStoragePaths(
  userId: string,
  newMasterPath: string,
  previousMasterPath: string | null | undefined,
  previousDerivedPaths: Array<string | null | undefined>
): string[] {
  const keep = newMasterPath.replace(/^\/+/, '').trim();
  const out = new Set<string>();

  for (const candidate of [previousMasterPath, ...previousDerivedPaths]) {
    if (!candidate?.trim()) continue;
    const normalized = extractStoragePathFromTrackRef(candidate, userId);
    if (!normalized || normalized === keep) continue;
    out.add(normalized);
  }

  return [...out];
}

export async function removeTrackStoragePaths(paths: string[]): Promise<void> {
  const uniq = [...new Set(paths.map((p) => p.replace(/^\/+/, '').trim()).filter(Boolean))];
  if (uniq.length === 0) return;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.warn('[track-storage-cleanup] Supabase admin client unavailable — skip remove', {
      count: uniq.length,
    });
    return;
  }

  const chunkSize = 100;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const batch = uniq.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(batch);
    if (error) {
      console.warn('[track-storage-cleanup] Storage remove failed:', {
        error: error.message,
        batch,
      });
    } else {
      console.log('[track-storage-cleanup] Removed superseded files:', { count: batch.length });
    }
  }
}
