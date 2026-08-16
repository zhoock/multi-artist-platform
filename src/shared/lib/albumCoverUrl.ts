import type { ImageCategory } from '@config/user';
import { getImageUrl } from '@shared/api/albums';

const ALBUMS: ImageCategory = 'albums';

/** Суффиксы вариантов в Storage (совпадают с commit-cover / image-processor). */
const STORAGE_VARIANT_SUFFIX_RE = /(?:-64|-128|-448|-896|-1344)$/;

/** Админ-превью в списке/миксер: тот размер, что в {@link generateImageVariants}. */
const ADMIN_THUMB = '-128';

/** Ширины деривативов в Storage для публичного {@link AlbumCover} (без -64 — только admin fallback). */
export const ALBUM_COVER_PUBLIC_WEBP_WIDTHS = [128, 448, 896, 1344] as const;
export const ALBUM_COVER_PUBLIC_JPG_WIDTHS = [128, 448, 896] as const;

/**
 * Выбирает ближайший дериватив ≥ targetPx (без апскейла). Совпадает с логикой `AlbumCover` srcset.
 */
export function pickAlbumCoverStorageWidth(targetPx: number, format: 'webp' | 'jpg'): number {
  const candidates =
    format === 'webp' ? ALBUM_COVER_PUBLIC_WEBP_WIDTHS : ALBUM_COVER_PUBLIC_JPG_WIDTHS;
  for (const width of candidates) {
    if (width >= targetPx) return width;
  }
  return candidates[candidates.length - 1];
}

/**
 * Стабильный cache-bust key для URL обложки.
 * При замене обложки commit создаёт новый `album_cover_{uuid}_…` baseName — ключ меняется автоматически.
 */
export function getAlbumCoverCacheVersion(cover: string): string {
  return getAlbumStorageBaseName(cover);
}

/**
 * Базовое имя файла обложки в `users/{userId}/albums/` без расширения и без суффикса размера.
 * Нужно, если в БД оказалось полное имя варианта (`…-448.webp`) или лишний `-128` в конце.
 */
export function getAlbumStorageBaseName(cover: string): string {
  const withoutExt = cover.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return withoutExt.replace(STORAGE_VARIANT_SUFFIX_RE, '');
}

/**
 * URL превью обложки альбома (админ-список, миксер). Основной: `-128` (webp + jpg).
 * Отдельного `baseName.jpg` в пайплайне нет — только `…-64|128|448|…` (см. `generateImageVariants`).
 * Fallback: `-64.jpg`, `-448.jpg`, если `-128` недоступен.
 */
export function getAlbumCoverAdminVariantUrls(
  cover: string,
  userId: string | undefined
): {
  webp: string | null;
  jpg: string | null;
  pipelineJpg64: string | null;
  pipelineJpg448: string | null;
} {
  if (!userId) {
    return {
      webp: null,
      jpg: null,
      pipelineJpg64: null,
      pipelineJpg448: null,
    };
  }

  const base = getAlbumStorageBaseName(cover);

  return {
    webp: getImageUrl(`${base}${ADMIN_THUMB}.webp`, '', { userId, category: ALBUMS }),
    jpg: getImageUrl(`${base}${ADMIN_THUMB}.jpg`, '', { userId, category: ALBUMS }),
    pipelineJpg64: getImageUrl(`${base}-64.jpg`, '', { userId, category: ALBUMS }),
    pipelineJpg448: getImageUrl(`${base}-448.jpg`, '', { userId, category: ALBUMS }),
  };
}
