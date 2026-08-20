// src/entities/album/ui/AlbumCover.tsx
import './album-card.scss';
import { memo, useMemo } from 'react';
import { getImageUrl } from '@shared/api/albums';
import type { CoverProps } from 'models';
import { useImageColor } from '@shared/lib/hooks/useImageColor';
import {
  getAlbumCoverCacheVersion,
  getAlbumStorageBaseName,
  pickAlbumCoverStorageWidth,
} from '@shared/lib/albumCoverUrl';
import { getAlbumCoverPublicUrl } from '@shared/lib/albumCoverPublicUrl';

type ImageFormat = 'webp' | 'jpg';
type Density = 1 | 2 | 3;

const DEFAULT_BASE_SIZE = 448;
const DEFAULT_DENSITIES: Density[] = [1, 2, 3];

// Локальные ассеты (не Supabase деривативы)
const DENSITY_SUFFIX: Record<ImageFormat, Record<Density, (base: number) => string | null>> = {
  webp: {
    1: (base) => `-${base}.webp`,
    2: (base) => `@2x-${base * 2}.webp`,
    3: (base) => `@3x-${base * 3}.webp`,
  },
  jpg: {
    1: (base) => `-${base}.jpg`,
    2: (base) => `@2x-${base * 2}.jpg`,
    3: () => null,
  },
};

const formatDescriptor = (density: Density) => `${density}x`;

function withCacheBust(url: string, cacheBust?: string) {
  if (!cacheBust) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(cacheBust)}`;
}

function isSupabaseStorageEnabled() {
  // Всегда используем Supabase Storage для медиа (обложки/аудио)
  // Это должно совпадать с shouldUseSupabaseStorage() в src/shared/api/albums/index.ts
  return true;
}

function supaSuffix(format: ImageFormat, targetPx: number): string | null {
  const px = pickAlbumCoverStorageWidth(targetPx, format);
  return format === 'webp' ? `-${px}.webp` : `-${px}.jpg`;
}

function resolveAlbumCoverImageUrl(
  img: string,
  suffix: string,
  userId: string | undefined,
  imageSource: 'proxy' | 'cdn'
): string | null {
  if (imageSource === 'cdn') {
    return userId ? getAlbumCoverPublicUrl(userId, img, suffix) : null;
  }

  return getImageUrl(img, suffix, userId ? { userId, category: 'albums' } : undefined);
}

const buildSrcSet = ({
  img,
  userId,
  baseSize,
  format,
  densities,
  cacheBust,
  imageSource,
}: {
  img: string;
  userId?: string;
  baseSize: number;
  format: ImageFormat;
  densities: Density[];
  cacheBust?: string;
  imageSource: 'proxy' | 'cdn';
}) => {
  const useSupabaseStorage = isSupabaseStorageEnabled();

  return densities
    .map((density) => {
      let suffix: string | null = null;

      if (useSupabaseStorage) {
        // Supabase деривативы -128/-448/-896/-1344 (webp) и -128/-448/-896 (jpg)
        suffix = supaSuffix(format, baseSize * density);
      } else {
        suffix = DENSITY_SUFFIX[format][density]?.(baseSize) ?? null;
      }

      if (!suffix) return null;

      const url = resolveAlbumCoverImageUrl(img, suffix, userId, imageSource);
      if (url == null) {
        console.error('[BUG] AlbumCover buildSrcSet: getImageUrl returned null', {
          img,
          userId,
          suffix,
        });
        return null;
      }
      return `${withCacheBust(url, cacheBust)} ${formatDescriptor(density)}`;
    })
    .filter(Boolean)
    .join(', ');
};

/**
 * Компонент обложки альбома с responsive-загрузкой.
 */
function AlbumCover({
  img,
  userId,
  fullName,
  size = DEFAULT_BASE_SIZE,
  densities,
  sizes,
  onColorsExtracted,
  imageSource = 'proxy',
}: CoverProps & {
  onColorsExtracted?: (colors: { dominant: string; palette: string[] }) => void;
}) {
  const baseName = useMemo(() => getAlbumStorageBaseName(img), [img]);
  const imgRef = useImageColor(baseName, onColorsExtracted);
  const effectiveBaseSize = size ?? DEFAULT_BASE_SIZE;

  const densitySteps = useMemo(() => {
    const unique = new Set<Density>((densities || DEFAULT_DENSITIES) as Density[]);
    unique.add(1);
    return Array.from(unique).sort((a, b) => a - b) as Density[];
  }, [densities]);

  /** Стабильный ключ: меняется только при смене cover identity (новый baseName после commit). */
  const cacheBust = useMemo(() => getAlbumCoverCacheVersion(img), [img]);

  const webpSrcSet = useMemo(
    () =>
      buildSrcSet({
        img: baseName,
        userId,
        baseSize: effectiveBaseSize,
        format: 'webp',
        densities: densitySteps,
        cacheBust,
        imageSource,
      }),
    [baseName, userId, effectiveBaseSize, densitySteps, cacheBust, imageSource]
  );

  const jpegSrcSet = useMemo(
    () =>
      buildSrcSet({
        img: baseName,
        userId,
        baseSize: effectiveBaseSize,
        format: 'jpg',
        densities: densitySteps,
        cacheBust,
        imageSource,
      }),
    [baseName, userId, effectiveBaseSize, densitySteps, cacheBust, imageSource]
  );

  const fallbackSrc = useMemo(() => {
    const useSupabaseStorage = isSupabaseStorageEnabled();

    if (useSupabaseStorage) {
      const suffix = supaSuffix('webp', effectiveBaseSize) ?? '-448.webp';
      const url = resolveAlbumCoverImageUrl(baseName, suffix, userId, imageSource);
      if (url == null) {
        console.error('[BUG] AlbumCover fallbackSrc: getImageUrl returned null', {
          img: baseName,
          userId,
        });
        return '';
      }
      return withCacheBust(url, cacheBust);
    }

    const primarySuffix = DENSITY_SUFFIX.jpg[1]?.(effectiveBaseSize);
    const baseUrl = primarySuffix
      ? getImageUrl(baseName, primarySuffix, userId ? { userId, category: 'albums' } : undefined)
      : getImageUrl(baseName, '.jpg', userId ? { userId, category: 'albums' } : undefined);
    if (baseUrl == null) {
      console.error('[BUG] AlbumCover fallbackSrc (local): getImageUrl returned null', {
        img: baseName,
        userId,
      });
      return '';
    }

    return withCacheBust(baseUrl, cacheBust);
  }, [baseName, userId, effectiveBaseSize, cacheBust, imageSource]);

  const resolvedSizes =
    sizes ??
    `(max-width: 480px) 60vw, (max-width: 1024px) min(40vw, ${effectiveBaseSize}px), ${effectiveBaseSize}px`;

  return (
    <picture className="album-cover">
      <source srcSet={webpSrcSet} sizes={resolvedSizes} type="image/webp" />
      <source srcSet={jpegSrcSet} sizes={resolvedSizes} type="image/jpeg" />

      <img
        ref={imgRef}
        className="album-cover__image"
        loading="lazy"
        decoding="async"
        src={fallbackSrc}
        srcSet={jpegSrcSet}
        sizes={resolvedSizes}
        alt={`Обложка альбома ${fullName}`}
      />
    </picture>
  );
}

export default memo(AlbumCover, (prevProps, nextProps) => {
  const prevCallback = prevProps.onColorsExtracted;
  const nextCallback = nextProps.onColorsExtracted;
  const callbacksEqual = prevCallback === nextCallback || (!prevCallback && !nextCallback);

  return (
    prevProps.img === nextProps.img &&
    prevProps.userId === nextProps.userId &&
    prevProps.fullName === nextProps.fullName &&
    prevProps.size === nextProps.size &&
    prevProps.densities === nextProps.densities &&
    prevProps.sizes === nextProps.sizes &&
    prevProps.imageSource === nextProps.imageSource &&
    callbacksEqual
  );
});
