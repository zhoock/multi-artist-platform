import { useEffect, useMemo, useState } from 'react';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import {
  buildArticleCoverSrcSet,
  getArticleCoverAdminVariantUrls,
  getArticleCoverVariantPublicUrl,
  isArticleCoverStorageKey,
  pickArticleCoverJpgWidth,
  pickArticleCoverWebpWidth,
  type ArticleCoverDisplayRole,
} from '@shared/lib/articleCoverUrl';
import {
  ARTICLE_CATALOG_COVER_TABLET_MQ,
  ARTICLE_EDITOR_COVER_PROPS,
  getCatalogArticleCoverProps,
} from '@entities/article/lib/catalogArticleCoverProps';
import { ArticleCoverPlaceholder } from './ArticleCoverPlaceholder';

type ArticleCoverImageProps = {
  img: string;
  userId: string | undefined;
  role: ArticleCoverDisplayRole;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  debugLabel?: string;
};

type Density = 1 | 2 | 3;

function ArticleCoverAdminImage({
  img,
  userId,
  alt,
  className,
  loading,
  decoding,
  debugLabel,
}: Omit<ArticleCoverImageProps, 'role'>) {
  const { webp, jpg } = getArticleCoverAdminVariantUrls(img, userId);
  const webpSrc = webp ? optionalMediaSrc(webp, `${debugLabel}:webp`, { hasUserId: true }) : null;
  const jpgSrc = jpg ? optionalMediaSrc(jpg, `${debugLabel}:jpg`, { hasUserId: true }) : null;

  if (!jpgSrc && !webpSrc) {
    return (
      <ArticleCoverPlaceholder
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    );
  }

  return (
    <picture>
      {webpSrc ? <source srcSet={webpSrc} type="image/webp" /> : null}
      <img
        src={jpgSrc ?? webpSrc ?? ''}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    </picture>
  );
}

function ArticleCoverResponsiveImage({
  img,
  userId,
  alt,
  className,
  loading,
  decoding,
  debugLabel,
  baseSize,
  densities,
  sizes,
  maxVariantWidth,
}: Omit<ArticleCoverImageProps, 'role' | 'img' | 'userId'> & {
  img: string;
  userId: string;
  baseSize: number;
  densities: readonly Density[];
  sizes: string;
  maxVariantWidth: number;
}) {
  const densitySteps = useMemo(() => {
    const unique = new Set<Density>(densities as Density[]);
    unique.add(1);
    return Array.from(unique).sort((a, b) => a - b) as Density[];
  }, [densities]);

  const webpSrcSet = useMemo(
    () =>
      buildArticleCoverSrcSet({
        coverKey: img,
        userId,
        baseSize,
        format: 'webp',
        densities: densitySteps,
        maxVariantWidth,
      }),
    [img, userId, baseSize, densitySteps, maxVariantWidth]
  );

  const jpegSrcSet = useMemo(
    () =>
      buildArticleCoverSrcSet({
        coverKey: img,
        userId,
        baseSize,
        format: 'jpg',
        densities: densitySteps,
        maxVariantWidth: Math.min(maxVariantWidth, 896),
      }),
    [img, userId, baseSize, densitySteps, maxVariantWidth]
  );

  const fallbackSrc = useMemo(() => {
    const width = pickArticleCoverWebpWidth(baseSize, maxVariantWidth);
    return getArticleCoverVariantPublicUrl(img, userId, width, 'webp') ?? '';
  }, [img, userId, baseSize, maxVariantWidth]);

  const jpgFallbackSrc = useMemo(() => {
    const width = pickArticleCoverJpgWidth(baseSize, Math.min(maxVariantWidth, 896));
    return getArticleCoverVariantPublicUrl(img, userId, width, 'jpg') ?? '';
  }, [img, userId, baseSize, maxVariantWidth]);

  if (!fallbackSrc && !jpgFallbackSrc) {
    return (
      <ArticleCoverPlaceholder
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    );
  }

  return (
    <picture>
      {webpSrcSet ? <source srcSet={webpSrcSet} sizes={sizes} type="image/webp" /> : null}
      {jpegSrcSet ? <source srcSet={jpegSrcSet} sizes={sizes} type="image/jpeg" /> : null}
      <img
        src={jpgFallbackSrc || fallbackSrc}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        sizes={sizes}
      />
    </picture>
  );
}

function ArticleCoverPublicImage(props: Omit<ArticleCoverImageProps, 'role'>) {
  const [isGridLayout, setIsGridLayout] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(ARTICLE_CATALOG_COVER_TABLET_MQ).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(ARTICLE_CATALOG_COVER_TABLET_MQ);
    const syncLayout = () => setIsGridLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener('change', syncLayout);
    return () => mediaQuery.removeEventListener('change', syncLayout);
  }, []);

  const coverProps = getCatalogArticleCoverProps(isGridLayout);

  if (!props.userId) {
    return (
      <ArticleCoverPlaceholder
        alt={props.alt}
        className={props.className}
        loading={props.loading}
        decoding={props.decoding}
      />
    );
  }

  return (
    <ArticleCoverResponsiveImage
      {...props}
      userId={props.userId}
      baseSize={coverProps.size}
      densities={coverProps.densities}
      sizes={coverProps.sizes}
      maxVariantWidth={coverProps.maxVariantWidth}
    />
  );
}

function ArticleCoverEditorImage(props: Omit<ArticleCoverImageProps, 'role'>) {
  if (!props.userId) {
    return (
      <ArticleCoverPlaceholder
        alt={props.alt}
        className={props.className}
        loading={props.loading}
        decoding={props.decoding}
      />
    );
  }

  return (
    <ArticleCoverResponsiveImage
      {...props}
      userId={props.userId}
      baseSize={ARTICLE_EDITOR_COVER_PROPS.size}
      densities={ARTICLE_EDITOR_COVER_PROPS.densities}
      sizes={ARTICLE_EDITOR_COVER_PROPS.sizes}
      maxVariantWidth={ARTICLE_EDITOR_COVER_PROPS.maxVariantWidth}
    />
  );
}

/**
 * Article cover display: CDN direct URLs, responsive variants by UI role.
 * Only supports `article_cover_*` keys (no legacy fallback).
 */
export function ArticleCoverImage({
  img,
  userId,
  role,
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
  debugLabel = 'ArticleCoverImage',
}: ArticleCoverImageProps) {
  if (!img?.trim()) {
    return (
      <ArticleCoverPlaceholder
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    );
  }

  if (!userId || !isArticleCoverStorageKey(img)) {
    return (
      <ArticleCoverPlaceholder
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    );
  }

  if (role === 'admin') {
    return (
      <ArticleCoverAdminImage
        img={img}
        userId={userId}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        debugLabel={debugLabel}
      />
    );
  }

  if (role === 'editor') {
    return (
      <ArticleCoverEditorImage
        img={img}
        userId={userId}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        debugLabel={debugLabel}
      />
    );
  }

  return (
    <ArticleCoverPublicImage
      img={img}
      userId={userId}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      debugLabel={debugLabel}
    />
  );
}
