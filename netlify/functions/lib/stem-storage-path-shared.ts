/** Shared stem Storage path helpers (client-safe path shape, no secrets). */

export const STEMS_MANIFEST_FILE = 'stems.json';

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
