/**
 * Stem audio paths in user-media (master upload + playback file next to stems.json).
 */

import { replaceStorageFileExtension } from '@shared/lib/tracks/trackStoragePaths';

export function getStemsFolderPath(userId: string, albumId: string, trackId: string): string {
  return `users/${userId}/audio/${albumId}/${trackId}`;
}

export function getStemStoragePath(
  userId: string,
  albumId: string,
  trackId: string,
  fileName: string
): string {
  return `${getStemsFolderPath(userId, albumId, trackId)}/${fileName}`;
}

/** Heavy upload before pipeline: users/.../trackId/original/{fileName} */
export function buildStemMasterStoragePath(
  userId: string,
  albumId: string,
  trackId: string,
  fileName: string
): string {
  return `${getStemsFolderPath(userId, albumId, trackId)}/original/${fileName}`;
}

export const STEM_PLAYBACK_EXTENSION = 'opus';

export function buildStemPlaybackFileName(masterFileName: string): string {
  return replaceStorageFileExtension(masterFileName, STEM_PLAYBACK_EXTENSION);
}
