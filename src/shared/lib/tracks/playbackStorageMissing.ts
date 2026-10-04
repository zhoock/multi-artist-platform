/** Persisted when required playback object was removed from Storage (re-upload needed). */

export const PLAYBACK_STORAGE_MISSING_ERROR =
  'Playback audio file is missing from storage. Re-upload the track audio.';

export function isPlaybackStorageMissingError(message: string | null | undefined): boolean {
  const trimmed = message?.trim() ?? '';
  return trimmed === PLAYBACK_STORAGE_MISSING_ERROR;
}
