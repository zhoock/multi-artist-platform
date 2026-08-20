import { getArticleCoverPublicUrl } from '@shared/lib/articleCoverPublicUrl';

/** Variant suffixes in Storage (see generateArticleCoverVariants). */
const STORAGE_VARIANT_SUFFIX_RE = /(?:-128|-448|-896|-1344|-320)$/;

export const ARTICLE_COVER_WEBP_WIDTHS = [128, 448, 896, 1344] as const;
export const ARTICLE_COVER_JPG_WIDTHS = [128, 448, 896, 1344] as const;

export const ARTICLE_COVER_ADMIN_THUMB_WIDTH = 128;
export const ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH = 896;
export const ARTICLE_COVER_CATALOG_MAX_JPG_WIDTH = 896;

/**
 * Обложки из дашборда: ключ в БД с префиксом `article_cover_`.
 */
export function isArticleCoverStorageKey(img: string | undefined | null): boolean {
  return typeof img === 'string' && img.startsWith('article_cover_');
}

export function getArticleStorageBaseName(cover: string): string {
  const withoutExt = cover.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return withoutExt.replace(STORAGE_VARIANT_SUFFIX_RE, '');
}

/** Stable cache version from cover identity (UUID in key changes on re-upload). */
export function getArticleCoverCacheVersion(coverKey: string): string {
  return encodeURIComponent(getArticleStorageBaseName(coverKey));
}

export function withArticleCoverCacheBust(url: string, coverKey: string): string {
  const version = getArticleCoverCacheVersion(coverKey);
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version}`;
}

export type ArticleCoverDisplayRole = 'public' | 'admin' | 'editor';

function pickCeilOrMax(target: number, candidates: readonly number[], maxWidth?: number) {
  let picked = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c >= target) {
      picked = c;
      break;
    }
  }
  if (maxWidth != null && picked > maxWidth) {
    return maxWidth;
  }
  return picked;
}

export function pickArticleCoverWebpWidth(
  targetPx: number,
  maxWidth: number = ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH
): number {
  return pickCeilOrMax(targetPx, ARTICLE_COVER_WEBP_WIDTHS, maxWidth);
}

export function pickArticleCoverJpgWidth(
  targetPx: number,
  maxWidth: number = ARTICLE_COVER_CATALOG_MAX_JPG_WIDTH
): number {
  return pickCeilOrMax(targetPx, ARTICLE_COVER_JPG_WIDTHS, maxWidth);
}

export function getArticleCoverAdminVariantUrls(
  coverKey: string,
  userId: string | undefined
): { webp: string | null; jpg: string | null } {
  if (!userId || !isArticleCoverStorageKey(coverKey)) {
    return { webp: null, jpg: null };
  }

  const base = getArticleStorageBaseName(coverKey);
  const width = ARTICLE_COVER_ADMIN_THUMB_WIDTH;
  const webpUrl = getArticleCoverPublicUrl(userId, `${base}-${width}.webp`);
  const jpgUrl = getArticleCoverPublicUrl(userId, `${base}-${width}.jpg`);

  return {
    webp: webpUrl ? withArticleCoverCacheBust(webpUrl, coverKey) : null,
    jpg: jpgUrl ? withArticleCoverCacheBust(jpgUrl, coverKey) : null,
  };
}

export function getArticleCoverVariantPublicUrl(
  coverKey: string,
  userId: string | undefined,
  width: number,
  format: 'webp' | 'jpg'
): string | null {
  if (!userId || !isArticleCoverStorageKey(coverKey)) {
    return null;
  }

  const base = getArticleStorageBaseName(coverKey);
  const ext = format === 'webp' ? 'webp' : 'jpg';
  const url = getArticleCoverPublicUrl(userId, `${base}-${width}.${ext}`);
  return url ? withArticleCoverCacheBust(url, coverKey) : null;
}

type Density = 1 | 2 | 3;

export function buildArticleCoverSrcSet(options: {
  coverKey: string;
  userId: string;
  baseSize: number;
  format: 'webp' | 'jpg';
  densities: Density[];
  maxVariantWidth?: number;
}): string {
  const { coverKey, userId, baseSize, format, densities, maxVariantWidth } = options;
  const maxWidth =
    maxVariantWidth ??
    (format === 'webp'
      ? ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH
      : ARTICLE_COVER_CATALOG_MAX_JPG_WIDTH);

  const pick = format === 'webp' ? pickArticleCoverWebpWidth : pickArticleCoverJpgWidth;

  return densities
    .map((density) => {
      const width = pick(baseSize * density, maxWidth);
      const url = getArticleCoverVariantPublicUrl(coverKey, userId, width, format);
      if (!url) return null;
      return `${url} ${density}x`;
    })
    .filter(Boolean)
    .join(', ');
}
