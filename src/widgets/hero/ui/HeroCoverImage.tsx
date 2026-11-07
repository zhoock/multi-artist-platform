import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildHeroCoverFallbackUrls,
  heroCoverFallbackStorageSignature,
  resolveHeroCoverSourcesFromUrl,
  resolveHeroStoragePath,
} from '@shared/lib/artistHeroHeaderImages';
import { scheduleHeroCoverImagePaintReady } from './scheduleHeroCoverImagePaintReady';
import { logHeroCoverPhase } from './heroCoverImageDiagnostics';

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
  /** Fired on any load error (including while more fallbacks remain). */
  onCoverLoadError?: () => void;
};

/**
 * Above-the-fold LCP hero cover — mirrors legacy CSS background positioning via .hero__cover*.
 */
export function HeroCoverImage({
  headerImages,
  visualKey,
  onReadyForPaint,
  onCoverUnavailable,
  onCoverLoadError,
}: HeroCoverImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const loadedStoragePathRef = useRef<string | null>(null);
  const fallbackStorageSigRef = useRef<string | null>(null);

  const fallbackUrls = useMemo(
    () => buildHeroCoverFallbackUrls(headerImages, visualKey),
    [headerImages, visualKey]
  );
  const fallbackStorageSig = useMemo(
    () => heroCoverFallbackStorageSignature(headerImages, visualKey),
    [headerImages, visualKey]
  );

  const [attemptIndex, setAttemptIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);

  useEffect(() => {
    logHeroCoverPhase('mount', { fallbackStorageSig });
    return () => {
      logHeroCoverPhase('unmount', { fallbackStorageSig });
    };
  }, [fallbackStorageSig]);

  useEffect(() => {
    if (fallbackStorageSigRef.current === fallbackStorageSig) return;
    const previousSig = fallbackStorageSigRef.current;
    fallbackStorageSigRef.current = fallbackStorageSig;

    logHeroCoverPhase('fallback-signature-changed', {
      from: previousSig,
      to: fallbackStorageSig,
    });

    setAttemptIndex(0);
    setDismissed(false);

    const img = imgRef.current;
    const loadedPath = loadedStoragePathRef.current;
    const nextPrimaryPath = resolveHeroStoragePath(fallbackUrls[0] ?? '');

    if (
      img?.complete &&
      img.naturalWidth > 0 &&
      loadedPath &&
      nextPrimaryPath &&
      loadedPath === nextPrimaryPath
    ) {
      logHeroCoverPhase('preserve-loaded', { path: loadedPath });
      setCoverLoaded(true);
    } else {
      if (previousSig !== null) {
        logHeroCoverPhase('cover-state-pending-reset');
      }
      setCoverLoaded(false);
    }
  }, [fallbackStorageSig, fallbackUrls]);

  const sources = useMemo(() => {
    const url = fallbackUrls[attemptIndex];
    if (!url) return null;
    return resolveHeroCoverSourcesFromUrl(url);
  }, [attemptIndex, fallbackUrls]);

  const pictureStorageKey = useMemo(() => {
    if (!sources?.jpg) return '';
    return resolveHeroStoragePath(sources.jpg) ?? sources.jpg;
  }, [sources?.jpg]);

  useEffect(() => {
    if (!sources?.jpg) return;
    logHeroCoverPhase('img-src-set', { jpg: sources.jpg, attemptIndex });
  }, [attemptIndex, sources?.jpg]);

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
      <picture className="hero__cover" key={pictureStorageKey}>
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
          onLoad={() => {
            const path = resolveHeroStoragePath(sources.jpg);
            loadedStoragePathRef.current = path;
            logHeroCoverPhase('img-onLoad', { path });
            setCoverLoaded(true);
          }}
          onError={() => {
            logHeroCoverPhase('img-onError', { src: sources.jpg, attemptIndex });
            onCoverLoadError?.();
            advanceOrDismiss();
          }}
        />
      </picture>
    </div>
  );
}
