import { isProfileAvatarStorageObjectName } from '@shared/lib/avatarUpload';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';

export function isValidProfileAvatarStoragePath(path: string | null | undefined): boolean {
  if (path == null || typeof path !== 'string') {
    return false;
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith('users/') || !trimmed.includes('/profile/')) {
    return false;
  }

  const segments = trimmed.split('/');
  if (segments.length !== 4) {
    return false;
  }

  const fileName = segments[3];
  return Boolean(fileName && isProfileAvatarStorageObjectName(fileName));
}

/** Canonical storage path → browser proxy URL for `<img src>`. */
export function profileAvatarPathToDisplayUrl(path: string | null | undefined): string {
  if (!isValidProfileAvatarStoragePath(path)) {
    return '';
  }
  return buildProxyImageUrlFromStoragePath(path!.trim());
}
