import { isProfileAvatarStorageObjectName } from '@shared/lib/avatarUpload';

export type ProfileAvatarStorageFile = {
  name: string;
  updated_at?: string | null;
  created_at?: string | null;
};

export function profileAvatarObjectPath(userId: string, fileName: string): string {
  return `users/${userId}/profile/${fileName}`;
}

function fileTimestamp(file: ProfileAvatarStorageFile): number {
  const raw = file.updated_at ?? file.created_at;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Picks a single canonical display path (`…-128.webp` preferred) from Storage listing.
 * Returns null when ambiguous (multiple equally valid candidates).
 */
export function pickCanonicalProfileAvatarPathFromFiles(
  userId: string,
  files: ProfileAvatarStorageFile[]
): string | null {
  const avatarFiles = files.filter(
    (f) => typeof f.name === 'string' && f.name && isProfileAvatarStorageObjectName(f.name)
  );
  if (avatarFiles.length === 0) {
    return null;
  }

  const webp128 = avatarFiles.filter((f) => /-128\.webp$/i.test(f.name));
  const hex128 = webp128.filter((f) => /^profile-[a-f0-9]+-128\.webp$/i.test(f.name));

  if (hex128.length === 1) {
    return profileAvatarObjectPath(userId, hex128[0].name);
  }

  if (hex128.length > 1) {
    const sorted = [...hex128].sort((a, b) => fileTimestamp(b) - fileTimestamp(a));
    const newestTs = fileTimestamp(sorted[0]);
    const tied = sorted.filter((f) => fileTimestamp(f) === newestTs);
    if (tied.length === 1) {
      return profileAvatarObjectPath(userId, tied[0].name);
    }
    return null;
  }

  if (webp128.length === 1) {
    return profileAvatarObjectPath(userId, webp128[0].name);
  }

  if (webp128.length > 1) {
    return null;
  }

  const legacySingle = avatarFiles.filter((f) => /^profile\.(jpe?g|png|webp)$/i.test(f.name));
  if (legacySingle.length === 1) {
    return profileAvatarObjectPath(userId, legacySingle[0].name);
  }

  return null;
}
