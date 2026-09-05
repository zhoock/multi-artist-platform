import { useEffect, useRef } from 'react';
import type { HeroCoverSources } from '@shared/lib/artistHeroHeaderImages';
import { scheduleHeroCoverImagePaintReady } from './scheduleHeroCoverImagePaintReady';

/** Default hero upload aspect (1920-wide variants from upload pipeline). */
const HERO_COVER_INTRINSIC_WIDTH = 1920;
const HERO_COVER_INTRINSIC_HEIGHT = 1280;

type HeroCoverImageProps = {
  sources: HeroCoverSources;
  /** Fired after img load, decode, and two rAF paint frames. */
  onReadyForPaint?: () => void;
};

/**
 * Above-the-fold LCP hero cover — mirrors legacy CSS background positioning via .hero__cover*.
 */
export function HeroCoverImage({ sources, onReadyForPaint }: HeroCoverImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!onReadyForPaint) return;
    const img = imgRef.current;
    if (!img) return;

    return scheduleHeroCoverImagePaintReady(img, onReadyForPaint);
  }, [onReadyForPaint, sources.avif, sources.jpg, sources.webp]);

  return (
    <div className="hero__cover-layer" aria-hidden="true">
      <picture className="hero__cover">
        {sources.avif ? <source srcSet={sources.avif} type="image/avif" /> : null}
        {sources.webp ? <source srcSet={sources.webp} type="image/webp" /> : null}
        <img
          ref={imgRef}
          className="hero__cover-image"
          src={sources.jpg}
          alt=""
          width={HERO_COVER_INTRINSIC_WIDTH}
          height={HERO_COVER_INTRINSIC_HEIGHT}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </div>
  );
}
