/**
 * Remove stem manifest + audio files for a logical track (Mixer / Storage).
 * Stems belong to albumId + track_id (logical), not tracks.id UUID.
 */

import {
  getStemStoragePath,
  getStemsFolderPath,
  STEMS_MANIFEST_FILE,
} from './stem-storage-path-shared';
import { fetchStemManifestFromStorage } from './stems-access';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';
import { removeTrackStoragePaths } from './track-storage-cleanup';

export async function listStemFilesInTrackFolder(
  userId: string,
  albumId: string,
  logicalTrackId: string
): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return [];
  }

  const folder = getStemsFolderPath(userId, albumId, logicalTrackId);
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).list(folder, {
    limit: 1000,
  });
  if (error || !data?.length) {
    return [];
  }

  const out: string[] = [];
  for (const item of data) {
    if (item.metadata === null) continue;
    out.push(`${folder}/${item.name}`);
  }
  return out;
}

/** Paths under user-media for this track's stem folder (manifest + audio files). */
export async function collectTrackStemStoragePaths(
  userId: string,
  albumId: string,
  logicalTrackId: string
): Promise<string[]> {
  const folder = getStemsFolderPath(userId, albumId, logicalTrackId);
  const paths = new Set<string>(await listStemFilesInTrackFolder(userId, albumId, logicalTrackId));

  if (paths.size === 0) {
    const stems = await fetchStemManifestFromStorage(userId, albumId, logicalTrackId);
    for (const stem of stems) {
      paths.add(getStemStoragePath(userId, albumId, logicalTrackId, stem.file));
    }
    if (stems.length > 0) {
      paths.add(`${folder}/${STEMS_MANIFEST_FILE}`);
    }
  }

  return [...paths];
}

export async function removeTrackStemStorage(
  userId: string,
  albumId: string,
  logicalTrackId: string
): Promise<void> {
  const paths = await collectTrackStemStoragePaths(userId, albumId, logicalTrackId);
  await removeTrackStoragePaths(paths);
}
