import { buildStoragePublicObjectUrl } from '@config/supabase';
import { getArticleStorageBaseName } from '@shared/lib/articleCoverUrl';

const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp|gif)$/i;

export type GetArticleCoverPublicUrlOptions = {
  userId: string;
  fileNameOrCoverKey: string;
  /** When `fileNameOrCoverKey` is a base key, e.g. `-448.webp` */
  suffix?: string;
};

function resolveArticleCoverFileName(fileNameOrCoverKey: string, suffix: string = ''): string {
  const raw = fileNameOrCoverKey.trim();
  if (suffix) {
    const base = getArticleStorageBaseName(raw);
    return `${base}${suffix}`;
  }
  if (IMAGE_EXT_PATTERN.test(raw)) {
    return raw;
  }
  return getArticleStorageBaseName(raw);
}

/**
 * Direct Supabase public CDN URL for an article cover object in `user-media`.
 * Does not use `/api/proxy-image`.
 */
export function getArticleCoverPublicUrl(
  userIdOrOptions: string | undefined | GetArticleCoverPublicUrlOptions,
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

  const fileName = resolveArticleCoverFileName(coverKey, coverSuffix ?? '');
  const storagePath = `users/${userId}/articles/${fileName}`;
  return buildStoragePublicObjectUrl(storagePath);
}
