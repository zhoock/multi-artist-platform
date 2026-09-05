import { buildStoragePublicObjectUrl } from '@config/supabaseStorageUrl';
import { getAlbumStorageBaseName } from '@shared/lib/albumCoverUrl';

const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp|gif)$/i;

export type GetAlbumCoverPublicUrlOptions = {
  userId: string;
  fileNameOrCoverKey: string;
  /** When `fileNameOrCoverKey` is a base key, e.g. `-448.webp` */
  suffix?: string;
};

function resolveAlbumCoverFileName(fileNameOrCoverKey: string, suffix: string = ''): string {
  const raw = fileNameOrCoverKey.trim();
  if (IMAGE_EXT_PATTERN.test(raw)) {
    return raw;
  }

  const base = getAlbumStorageBaseName(raw);
  return suffix ? `${base}${suffix}` : base;
}

/**
 * Direct Supabase public CDN URL for an album cover object in `user-media`.
 * Does not use `/api/proxy-image`.
 */
export function getAlbumCoverPublicUrl(
  userIdOrOptions: string | undefined | GetAlbumCoverPublicUrlOptions,
  fileNameOrCoverKey?: string,
  suffix?: string
): string | null {
  let userId: string | undefined;
  let coverKey: string;
  let coverSuffix: string | undefined;

  if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
    userId = userIdOrOptions.userId;
    coverKey = userIdOrOptions.fileNameOrCoverKey;
    coverSuffix = userIdOrOptions.suffix;
  } else {
    userId = userIdOrOptions;
    coverKey = fileNameOrCoverKey ?? '';
    coverSuffix = suffix;
  }

  if (!userId || !coverKey.trim()) {
    return null;
  }

  const fileName = resolveAlbumCoverFileName(coverKey, coverSuffix ?? '');
  const storagePath = `users/${userId}/albums/${fileName}`;
  return buildStoragePublicObjectUrl(storagePath);
}
