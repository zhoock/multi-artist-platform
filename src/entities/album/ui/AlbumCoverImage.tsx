// src/entities/album/ui/AlbumCoverImage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { getAlbumCoverAdminVariantUrls } from '@shared/lib/albumCoverUrl';

const PLACEHOLDER = '/images/album-placeholder.png';

/** -1 = основной <picture> (-128); 0..n-1 = jpg-цепочка; n = плейсхолдер. */
type ThumbnailStep = number;

export type AlbumCoverImageProps = {
  /** Legacy img base name, JSONB `{ img }`, or JSON string from Postgres. */
  cover: unknown;
  userId: string | undefined;
  alt: string;
  className?: string;
  contextAlbumId?: string;
  logContext?: 'dashboard' | 'mixer';
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  debugLabel?: string;
};

/**
 * Превью обложки альбома в админке: `-128` webp+jpg, при ошибке — `-64`, затем `-448` (тот же пайплайн).
 */
export function AlbumCoverImage({
  cover,
  userId,
  alt,
  className,
  contextAlbumId,
  logContext = 'dashboard',
  loading = 'lazy',
  decoding = 'async',
  debugLabel = 'AlbumCoverImage',
}: AlbumCoverImageProps) {
  const missingUserIdContext =
    logContext === 'mixer' ? 'mixerAlbumThumbnail' : 'albumListThumbnail';
  const nullUrlMessage =
    logContext === 'mixer'
      ? '[BUG] MixerAdmin album thumb: getImageUrl returned null'
      : '[BUG] UserDashboard album thumb: getImageUrl returned null';

  if (cover && !userId) {
    console.error('[BUG] album.userId missing', {
      albumId: contextAlbumId,
      context: missingUserIdContext,
    });
    return <img src={PLACEHOLDER} alt={alt} loading={loading} decoding={decoding} />;
  }

  if (!userId) {
    return <img src={PLACEHOLDER} alt={alt} loading={loading} decoding={decoding} />;
  }

  const { webp, jpg, pipelineJpg64, pipelineJpg448 } = getAlbumCoverAdminVariantUrls(cover, userId);

  if (cover && webp == null && jpg == null) {
    console.error(nullUrlMessage, { albumId: contextAlbumId, albumUserId: userId, cover });
    return <img src={PLACEHOLDER} alt={alt} loading={loading} decoding={decoding} />;
  }

  return (
    <AlbumCoverImageResolved
      cover={cover}
      webp={webp}
      jpg={jpg}
      pipelineJpg64={pipelineJpg64}
      pipelineJpg448={pipelineJpg448}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      debugLabel={debugLabel}
    />
  );
}

type AlbumCoverImageResolvedProps = {
  cover: unknown;
  webp: string | null;
  jpg: string | null;
  pipelineJpg64: string | null;
  pipelineJpg448: string | null;
  alt: string;
  className?: string;
  loading: 'lazy' | 'eager';
  decoding: 'async' | 'auto' | 'sync';
  debugLabel: string;
};

type FallbackChainItem = { key: 'jpg64' | 'jpg448'; src: string };

function AlbumCoverImageResolved({
  cover,
  webp,
  jpg,
  pipelineJpg64,
  pipelineJpg448,
  alt,
  className,
  loading,
  decoding,
  debugLabel,
}: AlbumCoverImageResolvedProps) {
  const { webpSrc, jpgSrc, fallbacks, hasPrimary } = useMemo(() => {
    const w = webp ? optionalMediaSrc(webp, `${debugLabel}:webp`, { hasUserId: true }) : undefined;
    const j = jpg ? optionalMediaSrc(jpg, `${debugLabel}:jpg`, { hasUserId: true }) : undefined;
    const primary = (j ?? w) || '';

    const chain: FallbackChainItem[] = [];
    const push = (key: FallbackChainItem['key'], u: string | null) => {
      if (!u) return;
      const s = optionalMediaSrc(u, `${debugLabel}:${key}`, { hasUserId: true });
      if (s) chain.push({ key, src: s });
    };
    push('jpg64', pipelineJpg64);
    push('jpg448', pipelineJpg448);

    return { webpSrc: w, jpgSrc: j, fallbacks: chain, hasPrimary: primary.length > 0 };
  }, [cover, webp, jpg, pipelineJpg64, pipelineJpg448, debugLabel]);

  const n = fallbacks.length;
  const doneStep: ThumbnailStep = n;
  const [step, setStep] = useState<ThumbnailStep>(-1);

  const resetStep = useCallback(() => {
    if (hasPrimary) {
      setStep(-1);
    } else {
      setStep(n > 0 ? 0 : n);
    }
  }, [hasPrimary, n]);

  useEffect(() => {
    resetStep();
  }, [resetStep, cover, webp, jpg, pipelineJpg64, pipelineJpg448]);

  const chainAdvance = useCallback(() => {
    setStep((s) => (s < doneStep - 1 ? s + 1 : doneStep));
  }, [doneStep]);

  if (step === doneStep) {
    return <img src={PLACEHOLDER} alt={alt} loading={loading} decoding={decoding} />;
  }

  if (step >= 0 && step < n) {
    return (
      <img
        src={fallbacks[step].src}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        onError={chainAdvance}
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
        onError={() => {
          if (n > 0) {
            setStep(0);
          } else {
            setStep(doneStep);
          }
        }}
      />
    </picture>
  );
}
