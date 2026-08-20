import type { SupabaseClient } from '@supabase/supabase-js';
import { extractBaseName } from './image-processor';
import { sanitizeUploadFileName } from './sanitizeFileName';
import { STORAGE_BUCKET_NAME } from './supabase';

export { ARTICLE_COVER_CACHE_CONTROL } from './image-processor';

async function listArticleFolderFiles(
  supabase: SupabaseClient,
  folder: string
): Promise<{ name: string }[]> {
  const pageSize = 1000;
  const all: { name: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).list(folder, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      throw error;
    }
    if (!data?.length) break;
    all.push(...data.map((f) => ({ name: f.name })));
    if (data.length < pageSize) break;
  }
  return all;
}

/**
 * Removes every Storage object whose {@link extractBaseName} matches the cover img key.
 * Used when replacing or deleting `article_cover_*` rows.
 */
export async function removeArticleCoverVariantsByImgKey(
  supabase: SupabaseClient,
  userId: string,
  rawImgKey: string
): Promise<string[]> {
  const trimmed = rawImgKey.trim();
  if (!trimmed.startsWith('article_cover_')) {
    return [];
  }

  const fileName = trimmed.includes('/') ? (trimmed.split('/').pop() ?? trimmed) : trimmed;
  const sanitized = sanitizeUploadFileName(fileName);
  const targetBase = extractBaseName(sanitized);
  if (!targetBase) {
    return [];
  }

  const folder = `users/${userId}/articles`;
  const existingFiles = await listArticleFolderFiles(supabase, folder);
  const pathsToDelete: string[] = [];

  for (const f of existingFiles) {
    if (!f.name) continue;
    if (extractBaseName(f.name) === targetBase) {
      pathsToDelete.push(`${folder}/${f.name}`);
    }
  }

  if (pathsToDelete.length === 0) {
    return [];
  }

  const chunkSize = 100;
  for (let i = 0; i < pathsToDelete.length; i += chunkSize) {
    const batch = pathsToDelete.slice(i, i + chunkSize);
    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove(batch);
    if (error) {
      throw error;
    }
  }

  return pathsToDelete;
}
