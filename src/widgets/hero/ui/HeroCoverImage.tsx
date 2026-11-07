import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHeroCoverFallbackUrls,
  resolveHeroCoverSourcesFromUrl,
} from '@shared/lib/artistHeroHeaderImages';
import { scheduleHeroCoverImagePaintReady } from './scheduleHeroCoverImagePaintReady';

/** Default hero upload aspect (1920-wide variants from upload pipeline). */
const HERO_COVER_INTRINSIC_WIDTH = 1920;
const HERO_COVER_INTRINSIC_HEIGHT = 1280;

type HeroCoverImageProps = {
  headerImages: string[];
  visualKey: string;
  /** Fired after img load, decode, and two rAF paint frames. */
  onReadyForPaint?: () => void;
  /** Fired when every header image URL failed to load. */
  onCoverUnavailable?: () => void;
};

/**
 * Above-the-fold LCP hero cover — mirrors legacy CSS background positioning via .hero__cover*.
 */
export function HeroCoverImage({
  headerImages,
  visualKey,
  onReadyForPaint,
  onCoverUnavailable,
}: HeroCoverImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackUrls = useMemo(
    () => buildHeroCoverFallbackUrls(headerImages, visualKey),
    [headerImages, visualKey]
  );
  const fallbackIdentity = fallbackUrls.join('\0');
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);

  useEffect(() => {
    setAttemptIndex(0);
    setDismissed(false);
    setCoverLoaded(false);
  }, [fallbackIdentity, visualKey]);

  const sources = useMemo(() => {
    const url = fallbackUrls[attemptIndex];
    if (!url) return null;
    return resolveHeroCoverSourcesFromUrl(url);
  }, [attemptIndex, fallbackUrls]);

  const advanceOrDismiss = useCallback(() => {
    setCoverLoaded(false);
    if (attemptIndex + 1 < fallbackUrls.length) {
      setAttemptIndex((index) => index + 1);
      return;
    }
    setDismissed(true);
    onCoverUnavailable?.();
  }, [attemptIndex, fallbackUrls.length, onCoverUnavailable]);

  useEffect(() => {
    if (!onReadyForPaint || dismissed || !sources) return;
    const img = imgRef.current;
    if (!img) return;

    return scheduleHeroCoverImagePaintReady(img, onReadyForPaint);
  }, [dismissed, onReadyForPaint, sources?.jpg, sources?.webp, sources?.webpSrcSet]);

  if (dismissed || !sources) {
    return null;
  }

  return (
    <div className="hero__cover-layer" aria-hidden="true">
      <picture className="hero__cover" key={sources.jpg}>
        {sources.webpSrcSet ? (
          <source srcSet={sources.webpSrcSet} sizes={sources.sizes} type="image/webp" />
        ) : null}
        <img
          ref={imgRef}
          className={`hero__cover-image${coverLoaded ? '' : ' hero__cover-image--pending'}`}
          src={sources.jpg}
          srcSet={sources.jpgSrcSet}
          sizes={sources.sizes}
          alt=""
          width={HERO_COVER_INTRINSIC_WIDTH}
          height={HERO_COVER_INTRINSIC_HEIGHT}
          loading="eager"
          fetchpriority="high"
          decoding="async"
          onLoad={() => setCoverLoaded(true)}
          onError={() => advanceOrDismiss()}
        />
      </picture>
    </div>
  );
}
