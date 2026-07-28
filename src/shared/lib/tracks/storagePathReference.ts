/**
 * Normalize track audio refs (storage paths, legacy URLs) to bucket-relative paths.
 */

export function extractStoragePathFromTrackRef(ref: string, userId: string): string | null {
  const raw = ref.trim();
  if (!raw) return null;
  if (raw.startsWith('users/')) return raw.replace(/^\/+/, '');
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const urlMatch = raw.match(/\/user-media\/(.+)$/);
    if (urlMatch) return urlMatch[1];
    const audioMatch = raw.match(/\/audio\/(.+)$/);
    if (audioMatch) return `users/${userId}/audio/${audioMatch[1]}`;
    return null;
  }
  if (raw.startsWith('/audio/')) return `users/${userId}${raw}`;
  return `users/${userId}/audio/${raw.replace(/^\/+/, '')}`;
}

/** Pipeline-managed audio paths eligible for orphan GC. */
export function isPipelineManagedAudioStoragePath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '');
  return /^users\/[^/]+\/audio\/[^/]+\/(original|derived)\//.test(normalized);
}

export function normalizeStoragePath(path: string): string {
  return path.replace(/^\/+/, '').trim();
}
