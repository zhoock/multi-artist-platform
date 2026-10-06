import { isProfileAvatarStorageObjectName } from '../../../src/shared/lib/avatarUpload';
import { pickCanonicalProfileAvatarPathFromFiles } from '../../../src/shared/lib/profileAvatar/pickCanonicalProfileAvatarPath';
import { query } from './db';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertProfileAvatarStoragePathForUser(userId: string, storagePath: string): void {
  const normalizedUserId = userId.trim().toLowerCase();
  if (!UUID_RE.test(normalizedUserId)) {
    throw new Error('Invalid user id for profile avatar path');
  }

  const path = storagePath.trim();
  const expectedPrefix = `users/${normalizedUserId}/profile/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error('Profile avatar path must be under users/{userId}/profile/');
  }

  const fileName = path.slice(expectedPrefix.length);
  if (!fileName || fileName.includes('/')) {
    throw new Error('Invalid profile avatar storage path');
  }

  if (!isProfileAvatarStorageObjectName(fileName)) {
    throw new Error('Invalid profile avatar file name');
  }
}

export async function setProfileAvatarPathForUser(
  userId: string,
  storagePath: string
): Promise<void> {
  assertProfileAvatarStoragePathForUser(userId, storagePath);
  await query(
    `UPDATE users SET profile_avatar_path = $1 WHERE id = $2::uuid`,
    [storagePath.trim(), userId],
    0
  );
}

export async function clearProfileAvatarPathForUser(userId: string): Promise<void> {
  await query(`UPDATE users SET profile_avatar_path = NULL WHERE id = $1::uuid`, [userId], 0);
}

/**
 * When `profile_avatar_path` is NULL, infer canonical path from Storage listing and persist it.
 * Returns null when no avatar or when multiple candidates cannot be disambiguated.
 */
export async function reconcileProfileAvatarPathForUser(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.warn('[profile-avatar-path] Supabase admin client unavailable — skip reconcile');
    return null;
  }

  const profileFolder = `users/${userId}/profile`;
  const { data: files, error: listError } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .list(profileFolder, { limit: 200 });

  if (listError) {
    console.warn('[profile-avatar-path] Storage list failed:', listError.message);
    return null;
  }

  const canonical = pickCanonicalProfileAvatarPathFromFiles(userId, files ?? []);
  if (!canonical) {
    return null;
  }

  try {
    await setProfileAvatarPathForUser(userId, canonical);
  } catch (error) {
    console.error('[profile-avatar-path] failed to persist reconciled path:', error);
    return null;
  }

  return canonical;
}
