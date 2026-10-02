import { getUserUserId, type ImageCategory } from '@config/user';
import { buildStoragePublicObjectUrl } from '@config/supabaseStorageUrl';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';

export interface PublicStorageFileUrlOptions {
  userId?: string;
  category: ImageCategory;
  fileName: string;
}

/** Имя для загрузки: basename нормализуем; полный путь `users/...` не трогаем. */
function sanitizeUploadFileName(fileName: string): string {
  if (fileName.startsWith('users/')) {
    return fileName;
  }
  return sanitizeFileName(fileName);
}

/**
 * Storage object names are `sanitizeFileName(input)`.
 * Article body uploads (`article_*`, not covers) were persisted as the raw photo name,
 * so lookup must use the same canonical key the uploader wrote to the bucket.
 * Other names are canonicalized only when they contain whitespace (legacy space → `_`).
 */
function normalizeStorageFileNameForLookup(fileName: string): string {
  const base = fileName.split('/').pop() ?? fileName;
  const articleBodyImage = base.startsWith('article_') && !base.startsWith('article_cover_');
  if (articleBodyImage || /\s/.test(fileName)) {
    return sanitizeUploadFileName(fileName);
  }
  return fileName;
}

/** Полный путь объекта в bucket `user-media`. */
export function getStoragePath(userId: string, category: ImageCategory, fileName: string): string {
  let normalizedFileName = fileName;

  if (normalizedFileName.startsWith('users/')) {
    const parts = normalizedFileName.split('/');
    const last = parts.pop() ?? '';
    if (!last) return normalizedFileName;
    parts.push(normalizeStorageFileNameForLookup(last));
    return parts.join('/');
  }

  return `users/${userId}/${category}/${normalizeStorageFileNameForLookup(normalizedFileName)}`;
}

/**
 * Публичный URL файла без Supabase JS client.
 * Изображения — proxy-image; аудио — прямой CDN URL (как supabase.storage.getPublicUrl).
 */
export function getPublicStorageFileUrl(options: PublicStorageFileUrlOptions): string | null {
  const resolvedUserId = options.userId ?? getUserUserId();
  if (!resolvedUserId) {
    console.error(
      '[BUG] userId is missing in getPublicStorageFileUrl (pass options.userId or sign in).'
    );
    return null;
  }

  const storagePath = getStoragePath(resolvedUserId, options.category, options.fileName);

  if (options.category === 'audio') {
    const publicUrl = buildStoragePublicObjectUrl(storagePath);
    if (!publicUrl) {
      console.error(
        '[BUG] getPublicStorageFileUrl: Supabase URL is not available (check VITE_SUPABASE_URL).'
      );
      return null;
    }
    return publicUrl;
  }

  return buildProxyImageUrlFromStoragePath(storagePath);
}
